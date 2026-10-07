'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useTabStore } from '@/store/tab-store';
import { useAuthStore } from '@/store/auth-store';
import { useFormDraft, draftKey } from '@/hooks/use-form-draft';
import { DraftIndicator } from '@/components/erp/draft-indicator';
import { FormTabShell } from '@/components/erp/form-tab-shell';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { CurrencyInput } from '@/components/ui/currency-input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { SearchableDropdown, type SearchableDropdownOption } from '@/components/ui/searchable-dropdown';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertDialog, AlertDialogAction, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import type { BarangDropdown, SatuanResponse, SyaratBayarResponse, SalesOrderResponse, PurchaseOrderResponse, MataUangResponse, AlamatPengirimanResponse, PelangganDropdown, SupplierDropdown } from '@/types/api';
// Update #4 — auto-fill field berkaitan master data saat pelanggan/supplier dipilih
import { findPartyMaster, AUTOFILL_HINT } from '@/lib/party-autofill';
import { ORDER_CURRENCY_OPTIONS, buildOrderUpdate, canEditOrder, formatOrderMoney, newOrderHeader, newOrderLine, orderEndpoint, orderHeaderFromResponse, orderLinesFromResponse, persistOrder, serializeOrderHeader, serializeOrderLines, type OrderHeader, type OrderHeaderKey, type OrderKind, type OrderLine, type OrderResponse } from '@/lib/order-documents';

function includeCurrent(options: SearchableDropdownOption[], id?: string | null, label?: string | null) {
  return id && !options.some((option) => option.id === id) ? [...options, { id, label: label || id }] : options;
}

/** Bentuk data draft otomatis (localStorage) untuk mode create. */
interface OrderDraftData {
  header: OrderHeader;
  lines: OrderLine[];
  costs: { key: string; nama: string; jumlah: string }[];
}

export default function OrderDocumentForm({ kind, editId, subPage = 'pesanan' }: { kind: OrderKind; editId?: string; subPage?: string }) {
  const isSales = kind === 'sales';
  const tabModule = isSales ? 'sales' : 'purchasing';
  const title = isSales ? 'Pesanan Penjualan' : 'Pesanan Pembelian';
  const [header, setHeader] = useState(newOrderHeader);
  const [lines, setLines] = useState<OrderLine[]>(() => [newOrderLine()]);
  const [costs, setCosts] = useState<{ key: string; nama: string; jumlah: string }[]>([]);
  const [original, setOriginal] = useState<OrderResponse | null>(null);
  const savedId = useRef(editId);
  const [parties, setParties] = useState<SearchableDropdownOption[]>([]);
  // Update #4: baris master lengkap (alamat, kontak, syarat bayar, currency)
  // dari dropdown — dipakai untuk auto-fill saat party dipilih.
  const [partyRows, setPartyRows] = useState<(PelangganDropdown | SupplierDropdown)[]>([]);
  const [barang, setBarang] = useState<BarangDropdown[]>([]);
  const [units, setUnits] = useState<SatuanResponse[]>([]);
  const [terms, setTerms] = useState<SyaratBayarResponse[]>([]);
  // === Update ASAHI #3 — mata uang dinamis (Pengaturan → Profil Perusahaan)
  // dan alamat pengiriman (gudang tujuan PO, wajib pilih satu). ===
  const [currencyOptions, setCurrencyOptions] = useState<SearchableDropdownOption[]>(ORDER_CURRENCY_OPTIONS);
  const [alamatKirim, setAlamatKirim] = useState<AlamatPengirimanResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [error, setError] = useState('');
  const [lockedStatus, setLockedStatus] = useState<string | null>(null);
  const activeTabId = useTabStore((s) => s.activeTabId);
  const closeTab = useTabStore((s) => s.closeTab);
  const refreshListTab = useTabStore((s) => s.refreshListTab);
  const readOnly = !!lockedStatus || (!!original && !canEditOrder(original.status));
  const disabled = loading || submitting || readOnly || !!loadError;
  const partyKey = isSales ? 'pelangganId' : 'supplierId';

  // ── Draft otomatis (mode create saja; form edit memuat data server) ──
  const isCreate = !editId;
  const userId = useAuthStore((s) => s.user?.id ?? 'anon');
  const draft = useFormDraft<OrderDraftData>(draftKey(userId, isSales ? 'sales' : 'purchasing', isSales ? 'sales-order' : 'purchase-order', 'create'));
  const skipNextSaveRef = useRef(false);

  useEffect(() => {
    let active = true;
    Promise.all([api.get<(PelangganDropdown | SupplierDropdown)[]>(isSales ? '/master/pelanggan-dropdown' : '/master/supplier-dropdown'), api.get<BarangDropdown[]>('/master/barang-dropdown'), api.get<SatuanResponse[]>('/master/satuan'), api.get<SyaratBayarResponse[]>('/master/syarat-bayar'), editId ? api.get<OrderResponse>(`${orderEndpoint(kind)}/${editId}`) : Promise.resolve(null)])
      .then(([partyData, barangData, unitData, termData, order]) => {
        if (!active) return;
        setPartyRows(partyData);
        setParties(partyData.map((party) => ({ id: party.id, label: party.nama })));
        setBarang(barangData);
        setUnits(unitData);
        setTerms(termData);
        if (order) {
          setOriginal(order);
          setHeader(orderHeaderFromResponse(order));
          setLines(orderLinesFromResponse(order));
        }
      })
      .catch((err) => {
        if (active) setLoadError(err instanceof ApiError ? err.detail : 'Gagal memuat data pesanan');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [kind, editId, isSales, attempt]);

  // ── Update ASAHI #3: muat daftar mata uang + alamat pengiriman ──
  // Gagal memuat → tetap pakai fallback (ORDER_CURRENCY_OPTIONS / daftar kosong)
  // agar form tidak macet.
  useEffect(() => {
    let active = true;
    api
      .get<MataUangResponse[]>('/master/mata-uang?aktif_only=true')
      .then((rows) => {
        if (active && rows.length) setCurrencyOptions(rows.map((row) => ({ id: row.kode, label: row.nama ? `${row.kode} — ${row.nama}` : row.kode })));
      })
      .catch(() => {
        /* fallback: daftar statis bawaan */
      });
    if (!isSales) {
      api
        .get<AlamatPengirimanResponse[]>('/master/alamat-pengiriman?aktif_only=true')
        .then((rows) => {
          if (active) setAlamatKirim(rows);
        })
        .catch(() => {
          /* daftar kosong — user bisa isi manual lewat Pengaturan */
        });
    }
    return () => {
      active = false;
    };
  }, [isSales]);

  // ── Draft otomatis: pulihkan sekali saat mount (hanya create + ada draft) ──
  const restoredRef = useRef(false);
  useEffect(() => {
    if (!isCreate || restoredRef.current) return;
    restoredRef.current = true;
    const d = draft.draft;
    if (!d) return;
    if (d.header) setHeader(d.header);
    if (Array.isArray(d.lines) && d.lines.length) setLines(d.lines);
    setCosts(Array.isArray(d.costs) ? d.costs : []);
    toast.info('Draft isian dipulihkan', { description: `Isian terakhir ${title} dimuat kembali otomatis.` });
  }, []);

  // ── Draft otomatis: simpan tiap perubahan (lewati render pertama agar form kosong tidak menimpa draft) ──
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false;
      return;
    }
    if (isCreate && !original) draft.saveDraft({ header, lines, costs });
  }, [header, lines, costs]);

  // ── Draft otomatis: buang draft → kosongkan form ──
  const handleDiscardDraft = () => {
    skipNextSaveRef.current = true;
    draft.clearDraft();
    setHeader(newOrderHeader());
    setLines([newOrderLine()]);
    setCosts([]);
    setError('');
  };

  const setField = (key: OrderHeaderKey, value: string) => setHeader((prev) => ({ ...prev, [key]: value }));

  // ── Update #4: auto-fill dari master data saat pelanggan/supplier dipilih ──
  // Alamat selalu ditarik dari master (tidak perlu input manual lagi); syarat
  // bayar ditarik bila party punya default; PO juga menarik mata uang default
  // supplier (bila valid di daftar mata uang). Field tetap bisa disunting
  // setelahnya untuk kasus khusus.
  const handlePartyChange = (value: string) => {
    setField(partyKey, value);
    const master = findPartyMaster(partyRows, value);
    setHeader((prev) => {
      const next = { ...prev };
      if (isSales) {
        next.alamatPengiriman = master?.alamat || '';
      } else {
        next.alamat = master?.alamat || '';
        const supplierCurrency = master && 'currency' in master ? master.currency : null;
        if (supplierCurrency && supplierCurrency !== prev.currency && currencyOptions.some((option) => option.id === supplierCurrency)) {
          next.currency = supplierCurrency;
        }
      }
      if (master?.syaratBayarId) next.syaratBayarId = master.syaratBayarId;
      return next;
    });
  };

  const updateLine = (key: string, field: keyof OrderLine, value: string) =>
    setLines((prev) =>
      prev.map((line) => {
        if (line.key !== key) return line;
        if (field === 'barangId') {
          // Auto-fill harga saat barang dipilih:
          // - SO (sales): harga jual default dari master barang, fallback harga pokok.
          // - PO (purchase): harga beli referensi (harga pokok).
          // Normalisasi via Number() — backend mengirim Decimal sebagai string "20000000.00".
          const found = barang.find((b) => b.id === value);
          let hargaDefault = '';
          if (found) {
            if (isSales && Number(found.hargaJual) > 0) hargaDefault = String(Number(found.hargaJual));
            else if (Number(found.hargaPokok) > 0) hargaDefault = String(Number(found.hargaPokok));
          }
          return { ...line, barangId: value, satuanId: '', ...(hargaDefault ? { harga: hargaDefault } : {}) };
        }
        return { ...line, [field]: value };
      })
    );

  async function save() {
    if (disabled || submittingRef.current) return;
    if (!header[partyKey] || !header.tanggal || !lines.some((line) => line.barangId)) {
      setError('Tanggal, pelanggan/supplier, dan minimal satu barang wajib diisi.');
      return;
    }
    // Update ASAHI #3: alamat pengiriman wajib dipilih SATU untuk PO.
    if (!isSales && !header.alamatPengirimanId) {
      setError('Alamat pengiriman wajib dipilih — centang satu gudang tujuan.');
      return;
    }
    submittingRef.current = true;
    setSubmitting(true);
    try {
      const payload = original ? buildOrderUpdate(kind, header, lines, original) : { ...serializeOrderHeader(kind, header), details: serializeOrderLines(lines), biayaTambahan: costs.filter((cost) => cost.nama.trim()).map((cost) => ({ nama: cost.nama.trim(), jumlah: Number(cost.jumlah) })) };
      if (!Object.keys(payload).length) {
        toast.info('Tidak ada perubahan untuk disimpan');
        return;
      }
      const { saved, mismatches } = await persistOrder(kind, payload, savedId.current, (order) => {
        savedId.current = order.id;
        setOriginal(order);
        refreshListTab(tabModule, subPage);
      });
      if (mismatches.length) {
        setError(`Dokumen ${saved.noPesanan} sudah tersimpan, tetapi server belum menyimpan perubahan pada: ${mismatches.join(', ')}. Isian tetap tersedia untuk diperiksa. Hubungi administrator sebelum melanjutkan.`);
        return;
      }
      toast.success(`${title} berhasil disimpan`);
      if (isCreate) draft.clearDraft();
      if (activeTabId) closeTab(activeTabId);
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : err instanceof Error ? err.message : 'Gagal menyimpan pesanan');
      // If an approval happened while this form was open, show the latest status and lock editing.
      if (savedId.current) {
        try {
          const latest = await api.get<OrderResponse>(`${orderEndpoint(kind)}/${savedId.current}`);
          if (!canEditOrder(latest.status)) setLockedStatus(latest.status);
        } catch {
          /* Preserve the original save error. */
        }
      }
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  const input = (key: OrderHeaderKey, label: string, type = 'text') => (
    <div className="space-y-1.5" key={key}>
      <Label htmlFor={`order-${key}`}>{label}</Label>
      <Input id={`order-${key}`} type={type} step={type === 'number' ? 'any' : undefined} value={header[key]} onChange={(event) => setField(key, event.target.value)} disabled={disabled} />
    </div>
  );
  const currentParty = original ? (isSales ? (original as SalesOrderResponse).pelanggan : (original as PurchaseOrderResponse).supplier) : null;
  const currentPartyId = original ? (isSales ? (original as SalesOrderResponse).pelangganId : (original as PurchaseOrderResponse).supplierId) : null;
  const unitOptions = units.map((unit) => ({ id: unit.id, label: unit.nama }));
  const barangOptions = barang.map((item) => ({ id: item.id, label: `${item.kode} — ${item.nama}` }));
  // Preserve labels of historical items/units that no longer appear in active dropdowns.
  for (const line of original?.details || []) {
    if (!barangOptions.some((item) => item.id === line.barangId)) barangOptions.push({ id: line.barangId, label: line.barang?.nama || line.barangId });
    if (line.satuanId && !unitOptions.some((unit) => unit.id === line.satuanId)) unitOptions.push({ id: line.satuanId, label: line.satuan?.nama || line.satuanId });
  }
  // Update ASAHI #3: opsi alamat pengiriman untuk PO — termasuk fallback
  // histori (alamat yang sudah nonaktif tetap tampil saat edit PO lama).
  const alamatKirimOptions = useMemo(() => {
    if (isSales) return [] as { id: string; label: string; prefix: string }[];
    const options = alamatKirim.map((row) => ({ id: row.id, label: row.nama, prefix: row.prefix }));
    const currentId = header.alamatPengirimanId;
    if (currentId && !options.some((option) => option.id === currentId)) {
      const snapshot = original && !isSales ? (original as PurchaseOrderResponse).alamatPengiriman : null;
      const snapshotLines = snapshot ? snapshot.split('\n').filter(Boolean) : [];
      options.push({
        id: currentId,
        label: snapshotLines.length > 1 ? snapshotLines.slice(1).join(' — ') : snapshotLines[0] || currentId,
        prefix: snapshotLines[0] || 'Tersimpan'
      });
    }
    return options;
  }, [isSales, alamatKirim, header.alamatPengirimanId, original]);

  return (
    <FormTabShell title={`${original ? (readOnly ? 'Detail' : 'Edit') : 'Buat'} ${title}`}>
      <Card className="max-w-6xl">
        <CardContent className="space-y-5 p-6">
          {loading ? (
            <div role="status" className="flex items-center gap-2 py-8">
              <Loader2 className="h-5 w-5 animate-spin" />
              Memuat pesanan...
            </div>
          ) : loadError ? (
            <div role="alert">
              <p className="text-destructive">{loadError}</p>
              <Button
                variant="outline"
                onClick={() => {
                  setLoading(true);
                  setLoadError('');
                  setAttempt((value) => value + 1);
                }}>
                Coba Lagi
              </Button>
            </div>
          ) : (
            <>
              {original && (
                <div className="flex flex-wrap items-center gap-3 rounded-md border bg-muted/30 p-3 text-sm">
                  <strong>{original.noPesanan}</strong>
                  <Badge variant="outline">{lockedStatus || original.status}</Badge>
                  {isSales && (
                    <span>
                      Fulfillment: <Badge variant="secondary">{(original as SalesOrderResponse).fulfillmentStatus || '-'}</Badge>
                    </span>
                  )}
                  <span>Total tersimpan: {formatOrderMoney(original.grandTotal, original.currency)}</span>
                </div>
              )}
              {readOnly && (
                <p role="status" className="rounded-md border p-3 text-sm">
                  Pesanan berstatus {lockedStatus || original?.status}. Data hanya dapat dibaca; perubahan hanya tersedia untuk DRAFT.
                </p>
              )}
              {!!original?.jurnalUmumId && (
                <p role="note" className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  Pesanan ini memiliki jurnal legacy ({original.jurnal?.noJurnal || original.jurnalUmumId}). Order tidak membuat jurnal baru. Hubungi administrator untuk rekonsiliasi jurnal lama.
                </p>
              )}
              {!isSales && (original as PurchaseOrderResponse | null)?.supplierNameSnapshot && <p className="text-sm">Nama supplier saat pesanan dibuat: {(original as PurchaseOrderResponse).supplierNameSnapshot}</p>}
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>{isSales ? 'Pelanggan' : 'Supplier'} *</Label>
                  {/* Update #4: pilih party → alamat/syarat bayar/currency ditarik otomatis dari master */}
                  <SearchableDropdown value={header[partyKey]} onValueChange={handlePartyChange} options={includeCurrent(parties, currentPartyId, currentParty?.nama)} disabled={disabled} placeholder={isSales ? 'Pilih pelanggan' : 'Pilih supplier'} />
                </div>
                {input('tanggal', 'Tanggal *', 'date')}
                <div className="space-y-1.5">
                  <Label>Syarat Bayar</Label>
                  <SearchableDropdown
                    value={header.syaratBayarId}
                    onValueChange={(value) => setField('syaratBayarId', value)}
                    options={includeCurrent(
                      terms.map((term) => ({ id: term.id, label: term.nama })),
                      original?.syaratBayarId,
                      original?.syaratBayar?.nama
                    )}
                    allOption={{ id: '', label: 'Tidak dipilih' }}
                    disabled={disabled}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Currency</Label>
                  {/* Update ASAHI #3: opsi mata uang dinamis dari Pengaturan → Profil Perusahaan */}
                  <SearchableDropdown value={header.currency} onValueChange={(value) => setField('currency', value)} options={includeCurrent(currencyOptions, header.currency)} disabled={disabled} />
                </div>
                {isSales ? (
                  <>
                    {input('customerPoNumber', 'Customer PO Number')}
                    {input('customerPoDate', 'Customer PO Date', 'date')}
                    {input('ekspedisi', 'Ekspedisi')}
                    {input('tanggalPengiriman', 'Tanggal Pengiriman', 'date')}
                    {input('penjual', 'Penjual')}
                    <div className="space-y-1.5 md:col-span-2">
                      <Label htmlFor="order-alamatPengiriman">Alamat Pengiriman</Label>
                      {/* Update #4: auto-fill dari master Pelanggan saat dipilih */}
                      <Textarea id="order-alamatPengiriman" rows={2} value={header.alamatPengiriman} onChange={(event) => setField('alamatPengiriman', event.target.value)} disabled={disabled} />
                      <p className="text-xs text-muted-foreground">{AUTOFILL_HINT.pelanggan}</p>
                    </div>
                  </>
                ) : (
                  <>
                    {input('tanggalKirim', 'Tanggal Kirim', 'date')}
                    <div className="space-y-1.5 md:col-span-2">
                      <Label htmlFor="order-alamat">Alamat</Label>
                      {/* Update #4: auto-fill dari master Supplier saat dipilih */}
                      <Textarea id="order-alamat" rows={2} value={header.alamat} onChange={(event) => setField('alamat', event.target.value)} disabled={disabled} />
                      <p className="text-xs text-muted-foreground">{AUTOFILL_HINT.supplier}</p>
                    </div>
                  </>
                )}
              </div>

              {/* ── Update ASAHI #3: Alamat Pengiriman (khusus PO) — wajib
                  centang SATU gudang tujuan; mencek yang lain otomatis
                  memindahkan pilihan (tidak bisa dua). PPIC opsional. ── */}
              {!isSales && (
                <div className="space-y-3 rounded-md border p-4">
                  <div>
                    <Label>Alamat Pengiriman (Gudang Tujuan) *</Label>
                    <p className="text-xs text-muted-foreground">Wajib pilih satu — tampil di bawah tabel barang pada cetak Purchase Order. Daftar diatur di Pengaturan → Profil Perusahaan.</p>
                  </div>
                  {alamatKirimOptions.length === 0 ? (
                    <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">Belum ada alamat pengiriman. Tambahkan dulu di Pengaturan → Profil Perusahaan → Alamat Pengiriman.</p>
                  ) : (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {alamatKirimOptions.map((option) => {
                        const selected = header.alamatPengirimanId === option.id;
                        return (
                          <label key={option.id} className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors ${selected ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'} ${disabled ? 'cursor-not-allowed opacity-70' : ''}`}>
                            <Checkbox aria-checked={selected} className="mt-0.5" checked={selected} onCheckedChange={(checked) => setField('alamatPengirimanId', checked ? option.id : '')} disabled={disabled} />
                            <span className="space-y-0.5 text-sm leading-snug">
                              <span className="block text-xs text-muted-foreground">{option.prefix}</span>
                              <span className="font-medium">{option.label}</span>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                  <div className="flex items-center gap-2 pt-1">
                    <Checkbox id="order-ppic" checked={header.ppic === 'true'} onCheckedChange={(checked) => setField('ppic', checked ? 'true' : 'false')} disabled={disabled} />
                    <Label htmlFor="order-ppic" className="cursor-pointer font-normal">
                      PPIC <span className="text-xs text-muted-foreground">(opsional — tampil di bawah alamat pengiriman saat cetak)</span>
                    </Label>
                  </div>
                </div>
              )}

              <div className="space-y-3">
                <Label>Detail Barang *</Label>
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="min-w-56">Barang</TableHead>
                        <TableHead className="min-w-36">Satuan</TableHead>
                        <TableHead className="min-w-24">Qty</TableHead>
                        <TableHead className="min-w-32">Harga ({header.currency || '-'})</TableHead>
                        <TableHead className="min-w-24">Diskon %</TableHead>
                        <TableHead>Aksi</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lines.map((line, index) => (
                        <TableRow key={line.key}>
                          <TableCell>
                            <SearchableDropdown value={line.barangId} onValueChange={(value) => updateLine(line.key, 'barangId', value)} options={barangOptions} disabled={disabled} compact />
                          </TableCell>
                          <TableCell>
                            <SearchableDropdown value={line.satuanId} onValueChange={(value) => updateLine(line.key, 'satuanId', value)} options={unitOptions} allOption={{ id: '', label: 'Tidak dipilih' }} disabled={disabled} compact />
                          </TableCell>
                          {(['qty', 'harga', 'diskon'] as const).map((key) => (
                            <TableCell key={key}>{key === 'harga' ? <CurrencyInput aria-label={`harga baris ${index + 1}`} allowDecimal value={line.harga} onValueChange={(value) => updateLine(line.key, 'harga', value)} disabled={disabled} /> : <Input aria-label={`${key} baris ${index + 1}`} type="number" step="any" value={line[key]} onChange={(event) => updateLine(line.key, key, event.target.value)} disabled={disabled} />}</TableCell>
                          ))}
                          <TableCell>
                            <Button variant="ghost" size="icon" disabled={disabled} onClick={() => setLines((prev) => prev.filter((item) => item.key !== line.key))} aria-label={`Hapus baris ${index + 1}`}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {!readOnly && (
                  <Button variant="outline" size="sm" disabled={disabled} onClick={() => setLines((prev) => [...prev, newOrderLine()])}>
                    <Plus className="mr-2 h-4 w-4" />
                    Tambah Barang
                  </Button>
                )}
                <p className="text-xs text-muted-foreground">Total pesanan dihitung saat disimpan. Jika detail diubah, seluruh daftar barang di atas akan menggantikan detail sebelumnya.</p>
              </div>
              <div className="space-y-3">
                <Label>Biaya Tambahan</Label>
                {original ? (
                  <div className="text-sm">
                    {original.biayaTambahan?.length ? (
                      original.biayaTambahan.map((cost) => (
                        <p key={cost.id}>
                          {cost.nama}: {formatOrderMoney(cost.jumlah, original.currency)}
                        </p>
                      ))
                    ) : (
                      <p>-</p>
                    )}
                    <p className="mt-2 text-xs text-muted-foreground">Biaya tambahan yang sudah tersimpan hanya dapat dilihat pada form ini.</p>
                  </div>
                ) : (
                  <>
                    {costs.map((cost, index) => (
                      <div className="flex gap-2" key={cost.key}>
                        <Input aria-label={`Nama biaya ${index + 1}`} placeholder="Nama biaya" value={cost.nama} disabled={disabled} onChange={(event) => setCosts((prev) => prev.map((item) => (item.key === cost.key ? { ...item, nama: event.target.value } : item)))} />
                        <CurrencyInput aria-label={`Jumlah biaya ${index + 1}`} allowDecimal value={cost.jumlah} disabled={disabled} onValueChange={(value) => setCosts((prev) => prev.map((item) => (item.key === cost.key ? { ...item, jumlah: value } : item)))} />
                        <Button variant="ghost" size="icon" disabled={disabled} onClick={() => setCosts((prev) => prev.filter((item) => item.key !== cost.key))} aria-label={`Hapus biaya ${index + 1}`}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                    <Button variant="outline" size="sm" disabled={disabled} onClick={() => setCosts((prev) => [...prev, { key: crypto.randomUUID(), nama: '', jumlah: '' }])}>
                      Tambah Biaya
                    </Button>
                  </>
                )}
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                {input('diskonGlobal', 'Diskon Global %', 'number')}
                {input('ppn', 'PPN %', 'number')}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="order-keterangan">Keterangan</Label>
                <Textarea id="order-keterangan" value={header.keterangan} onChange={(event) => setField('keterangan', event.target.value)} disabled={disabled} />
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                {isCreate && !original && (
                  <div className="mr-auto">
                    <DraftIndicator hasDraft={draft.hasDraft} ageLabel={draft.draftAgeLabel} onDiscard={handleDiscardDraft} formLabel={title} />
                  </div>
                )}
                <Button variant="outline" disabled={submitting} onClick={() => activeTabId && closeTab(activeTabId)}>
                  {readOnly ? 'Tutup' : 'Batal'}
                </Button>
                {!readOnly && (
                  <Button onClick={save} disabled={disabled}>
                    {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Simpan Pesanan
                  </Button>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>
      <AlertDialog
        open={!!error}
        onOpenChange={(open) => {
          if (!open) setError('');
        }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Perubahan pesanan belum tersimpan lengkap</AlertDialogTitle>
            <AlertDialogDescription>{error}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setError('')}>Kembali ke Pesanan</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </FormTabShell>
  );
}
