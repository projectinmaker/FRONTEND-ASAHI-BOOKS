'use client';
import { useRef, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useAuthStore } from '@/store/auth-store';
import { useTabStore } from '@/store/tab-store';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel } from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
interface MigrationResult { dryRun: boolean; totalItems: number; appliedCount: number; skippedCount: number; results: { action: string; accountCode: string; oldName?: string | null; newName?: string | null; applied: boolean; message: string }[] }
const ACTIONS = ['INSERT','UPDATE_CONTROL_RULE','UPDATE_NAME_NOTE','UPDATE_LOCK_LEGACY'];
export default function COAMigrationPage() {
 const admin = useAuthStore(s=>s.user?.role === 'ADMINISTRATOR');
 const refresh = useTabStore(s=>s.refreshListTab);
 const [actions,setActions] = useState<string[]>([]);
 const [result,setResult] = useState<MigrationResult | null>(null);
 const [busy,setBusy] = useState(false);
 const inFlight = useRef(false);
 const [confirm,setConfirm] = useState(false);
 const [error,setError] = useState('');
 async function run(apply: boolean) {
  if (!admin || inFlight.current || (apply && !result?.dryRun)) return;
  inFlight.current = true; setBusy(true); setError('');
  try {
   const params = new URLSearchParams(); actions.forEach(a=>params.append('action_filter',a));
   const response = apply ? await api.post<MigrationResult>('/coa/migration/apply',{dryRun:false,actionFilter:actions.length ? actions : null}) : await api.get<MigrationResult>('/coa/migration/preview' + (params.size ? '?' + params : ''));
   setResult(response); setConfirm(false);
   if (apply) { refresh('settings','coa'); refresh('settings','setting-akun'); toast.success('Migrasi selesai: ' + response.appliedCount + ' diterapkan, ' + response.skippedCount + ' dilewati'); }
  } catch(e) { setResult(null); setConfirm(false); setError(e instanceof ApiError ? e.detail : 'Gagal menjalankan migrasi. Preview ulang untuk memeriksa keadaan terbaru.'); }
  finally { inFlight.current=false; setBusy(false); }
 }
 if (!admin) return <p role="alert">Halaman migrasi hanya tersedia untuk administrator.</p>;
 return <div className="space-y-4"><h2 className="text-lg font-semibold">COA Migration</h2><p className="text-sm text-muted-foreground">Pratinjau perubahan akun sebelum menerapkan migrasi. Tanpa pilihan aksi, semua aksi akan diproses.</p>
 <fieldset disabled={busy} className="flex flex-wrap gap-4">{ACTIONS.map(a=><label key={a} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={actions.includes(a)} onChange={e=>{setActions(p=>e.target.checked?[...p,a]:p.filter(v=>v!==a));setResult(null);}}/>{a}</label>)}</fieldset>
 <div className="flex gap-3"><Button disabled={busy} onClick={()=>run(false)}>{busy?'Memproses...':'Preview Migration'}</Button><Button variant="outline" disabled={busy || !result?.dryRun} onClick={()=>setConfirm(true)}>Apply Migration</Button></div>
 {error && <p role="alert" className="text-destructive">{error}</p>}
 {result && <><p>{result.dryRun?'Pratinjau':'Hasil migrasi'}: {result.totalItems} item, {result.appliedCount} {result.dryRun?'akan diterapkan':'diterapkan'}, {result.skippedCount} dilewati.</p><div className="flex flex-wrap gap-4 text-sm">{ACTIONS.map(a=><span key={a}>{a}: {result.results.filter(r=>r.action===a).length}</span>)}</div><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr>{['Aksi','Kode','Nama akun','Status','Rincian'].map(h=><th key={h} className="p-2 text-left">{h}</th>)}</tr></thead><tbody>{result.results.map((r,i)=><tr key={i} className="border-t"><td className="p-2">{r.action}</td><td className="p-2">{r.accountCode}</td><td className="p-2">{r.newName || r.oldName || '-'}</td><td className="p-2">{r.applied ? (result.dryRun?'Akan diterapkan':'Diterapkan'):'Dilewati'}</td><td className="p-2"><details><summary>Lihat rincian</summary>{r.oldName && <p>Sebelumnya: {r.oldName}</p>}<p>{r.message}</p></details></td></tr>)}</tbody></table></div></>}
 <AlertDialog open={confirm} onOpenChange={v=>{if(!busy)setConfirm(v);}}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Terapkan migrasi COA?</AlertDialogTitle><AlertDialogDescription>Perubahan pada pratinjau akan disimpan ke database. {result?.appliedCount || 0} item akan diproses sesuai keadaan data terbaru.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={busy}>Batal</AlertDialogCancel><Button disabled={busy} onClick={()=>run(true)}>{busy?'Menerapkan...':'Ya, terapkan migrasi'}</Button></AlertDialogFooter></AlertDialogContent></AlertDialog>
 </div>;
}
