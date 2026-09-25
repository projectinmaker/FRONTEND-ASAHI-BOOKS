const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
function moduleWithApi(get) {
 const source = fs.readFileSync(path.join(__dirname,'../src/lib/coa.ts'),'utf8');
 const js = ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
 const exports = {};
 vm.runInNewContext(js,{exports,require:()=>({api:{get}}),URLSearchParams});
 return exports;
}
const base = { id:'1',kode:'531001',nama:'HPP',tingkat:'DETAIL',status:'AKTIF',active:true,allowManualPosting:true,allowSystemPosting:true,isPostableForManual:true,isPostableForSystem:true };
test('query uses actual FastAPI snake_case and preserves false',()=>{
 const m=moduleWithApi();const q=m.coaQuery({activeOnly:false,allowManualPosting:true,isControlAccount:false,subledgerType:'AR',accountClass:'ASSET',tingkat:'DETAIL'});
 assert.equal(q.get('active_only'),'false');assert.equal(q.get('allow_manual_posting'),'true');assert.equal(q.get('is_control_account'),'false');assert.equal(q.get('subledger_type'),'AR');assert.equal(q.get('account_class'),'ASSET');assert.equal(q.get('tingkat'),'DETAIL');assert.equal(q.has('activeOnly'),false);
});
test('manual posting rejects inactive, locked, system, control and stale flags',()=>{
 const m=moduleWithApi();assert.equal(m.canPostManually(base),true);
 for(const change of [{active:false},{tingkat:'HEADER'},{allowManualPosting:false},{isControlAccount:true},{isLegacyLocked:true},{isSystemAccount:true},{isPostableForManual:false},{isPostableForManual:undefined}]) assert.equal(m.canPostManually({...base,...change}),false,JSON.stringify(change));
 assert.equal(m.isActive({...base,active:false,status:'AKTIF'}),false);
 assert.equal(m.isActive({...base,active:undefined,status:'NONAKTIF'}),false);
});
test('loads all pages without dropping eligible accounts after first 500',async()=>{
 const calls=[];const m=moduleWithApi(async url=>{calls.push(url);const skip=Number(new URL('http://test'+url).searchParams.get('skip'));return {data:skip===0?Array.from({length:500},(_,i)=>({...base,id:String(i)})):[{...base,id:'500'}],total:501};});
 const rows=await m.loadCOA({activeOnly:true,allowManualPosting:true});assert.equal(rows.length,501);assert.equal(calls.length,2);assert.match(calls[1],/skip=500/);assert.match(calls[1],/allow_manual_posting=true/);
});
test('system dropdown retains postable control accounts but removes blocked accounts',async()=>{
 const entries=[{...base,isControlAccount:true,allowManualPosting:false}, {...base,active:false}, {...base,isLegacyLocked:true}, {...base,isSystemAccount:true}, {...base,allowSystemPosting:false}];
 const m=moduleWithApi(async()=>({data:entries,total:entries.length}));const rows=await m.loadSystemCOA();assert.equal(rows.length,1);assert.equal(rows[0].isControlAccount,true);
});
test('pagination propagates failures rather than returning incomplete choices',async()=>{
 const m=moduleWithApi(async()=>{throw Error('offline');});await assert.rejects(m.loadCOA(),/offline/);
});

test('API preserves structured validation errors instead of throwing trim TypeError',async()=>{
 const source=fs.readFileSync(path.join(__dirname,'../src/lib/api.ts'),'utf8');
 const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
 const exports={};vm.runInNewContext(js,{exports,process:{env:{}},fetch:async()=>({ok:false,status:422,json:async()=>({detail:[{loc:['body','subledgerType'],msg:'Field required'}]})})});
 await assert.rejects(exports.api.get('/coa/'),e=>e.status===422 && e.detail==='subledgerType: Field required');
});
