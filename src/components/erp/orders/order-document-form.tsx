'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { FileText, Loader2, Package, Plus, Trash2, Type, Unlink } from 'lucide-react';
import { api, ApiError, PaginatedResponse } from '@/lib/api';
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
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import type { BarangDropdown, SatuanResponse, SyaratBayarResponse, SalesOrderResponse, PurchaseOrderResponse, MataUangResponse, AlamatPengirimanResponse, PelangganDropdown, SupplierDropdown, PenawaranResponse, PenawaranUntukSoItem, SoTerminResponse } from '@/types/api';
// Update #4 — auto-fill field berkaitan master data saat pelanggan/supplier dipilih
import { findPartyMaster, AUTOFILL_HINT } from '@/lib/party-autofill';
import { ORDER_CURRENCY_OPTIONS, buildOrderUpdate, canEditOrder, formatOrderMoney, JENIS_PEMBELIAN_OPTIONS, newOrderHeader, newOrderLine, orderEndpoint, orderHeaderFromResponse, orderLinesFromResponse, persistOrder, serializeOrderHeader, serializeOrderLines, type OrderHeader, type OrderHeaderKey, type OrderKind, type OrderLine, type OrderResponse } from '@/lib/order-documents';
import { useDefaultTaxRates } from '@/lib/use-default-rates';
// === Update #049 — navigasi otomatis ke field wajib yang terlewat saat
// simpan (setelah dialog validasi ditutup: scroll + fokus ke field). ===
import { focusFormError } from '@/lib/form-error-focus';
// Update #007 — quick add master data langsung dari form transaksi
import { QuickAddPelangganButton, QuickAddSupplierButton, QuickAddBarangButton, QuickAddSatuanButton, QuickAddSyaratBayarButton, toPelangganDropdown, toSupplierDropdown, toBarangDropdown, satuanFromBarang } from '@/components/erp/quick-add';
function includeCurrent(options: SearchableDropdownOption[], id?: string | null, label?: string | null) {
  return id && !options.some((option) => option.id === id) ? [...options, { id, label: label || id }] : options;
}

/** Bentuk data draft otomatis (localStorage) untuk mode create. */
interface OrderDraftData {
  header: OrderHeader;
  lines: OrderLine[];
  costs: { key: string; nama: string; jumlah: string }[];
}

export default function OrderDocumentForm({ kind, editId, subPage = 'pesanan', initialPenawaranId }: { kind: OrderKind; editId?: string; subPage?: string; initialPenawaranId?: string }) {
  const isSales = kind === 'sales';
  const tabModule = isSales ? 'sales' : 'purchasing';
  // Update #031 — label dokumen penjualan: "Pesanan Penjualan" → "Sales Order"
  // (tab/list/form/cetak; modul Pembelian tetap "Pesanan Pembelian").
  const title = isSales ? 'Sales Order' : 'Pesanan Pembelian';
  const [header, setHeader] = useState(newOrderHeader);
  const [lines, setLines] = useState<OrderLine[]>(() => [newOrderLine()]);
  // AUD-10 (update #04) — tarif default dari setting global (RATE_PPN/RATE_PPH23);
  // hanya untuk dokumen baru (bukan edit existing — original null).
  // === Update #042 — PPN dihapus dari SO: tarif default hanya dipakai mode
  // PURCHASE (PO tetap ber-PPN); form SO tidak lagi menetapkan ppn/pph23. ===
  const defaultRates = useDefaultTaxRates();
  useEffect(() => {
    if (defaultRates && !isSales && !original && !editId) {
      setHeader((prev) => ({ ...prev, ppn: defaultRates.ppn, pph23: defaultRates.pph23 }));
    }
    // Update #042 — guard original/editId sengaja tidak masuk deps (stabil per
    // mount, mirror pola sebelumnya); tarif default hanya untuk mode PO.
  }, [defaultRates, isSales]);
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
  // Update #002: daftar SO untuk kolom "Keterangan SO" per baris PO (tracking
  // item ke SO — satu PO bisa memuat baris dari beberapa SO berbeda).
  const [soRows, setSoRows] = useState<SalesOrderResponse[]>([]);
  // === Update #033 — termin tersimpan (mode edit/detail SO): baris per
  // termin + status bayarnya, diambil dari endpoint termin SO.
  // === Update #040 — INPUT termin di form create DIHAPUS: pembayaran murni
  // lewat Invoice. Update #042 — SO kini dokumen nilai PENUH tanpa DP; DP
  // bertahap & pelunasan dilakukan lewat pembuatan Invoice (bisa berkali-kali)
  // dengan field DP/Pelunasan. State ini hanya untuk HISTORI SO lama yang
  // punya termin (read-only). ===
  const [savedTermins, setSavedTermins] = useState<SoTerminResponse[]>([]);
  // === Update #032 — "Pilih Penawaran" di form SO (create-only): daftar
  // penawaran DRAFT/SELESAI (SELESAI = repeat order). Saat dipilih → pelanggan
  // terisi & terkunci + seluruh item (barang master & item bebas) + harga
  // ditarik otomatis dari penawaran. ===
  const [penawaranOptions, setPenawaranOptions] = useState<PenawaranUntukSoItem[]>([]);
  const [penawaranId, setPenawaranId] = useState('');
  const [penawaranDetail, setPenawaranDetail] = useState<PenawaranResponse | null>(null);
  const [penawaranLoading, setPenawaranLoading] = useState(false);
  const penawaranLocked = !!penawaranId;
  // === Update #045 — LOCK DETAIL hasil tarikan data: saat SO dibuat dari
  // penawaran (penawaranLocked), seluruh baris item + biaya tambahan hasil
  // tarikan DIKUNCI (tidak bisa diedit/dihapus) dan tombol tambah baris
  // disembunyikan — data mengikuti dokumen sumber (pelanggan & item sudah
  // terkunci; mirror perilaku pelanggan yang sudah disabled). Lepas pilihan
  // penawaran (tombol "Lepas") untuk kembali mengedit manual. ===
  const lockDetail = isSales && penawaranLocked;
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [error, setError] = useState('');
  const [lockedStatus, setLockedStatus] = useState<string | null>(null);
  // === Update #049 — anchor navigasi field wajib: scope form (supaya tidak
  // salah sasaran saat beberapa tab form terbuka bersamaan) + daftar field
  // yang terlewat (difokuskan setelah dialog validasi ditutup). ===
  const formRef = useRef<HTMLDivElement>(null);
  const pendingFocusRef = useRef<string[]>([]);
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
          const nextHeader = orderHeaderFromResponse(order);
          // === Update #048 — PO hasil alur Detail ROP → PO draft: alamat
          // supplier tidak tersimpan saat draft dibuat (masih kosong). Saat
          // PO dibuka/diedit, alamat ditarik otomatis dari master supplier
          // bila masih kosong — ikut tersimpan permanen saat PO disimpan. ===
          if (!isSales && !nextHeader.alamat && nextHeader.supplierId) {
            const master = findPartyMaster(partyData, nextHeader.supplierId);
            if (master?.alamat) nextHeader.alamat = master.alamat;
          }
          setHeader(nextHeader);
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
      // Update #002: daftar SO (kolom "Keterangan SO" per baris PO) — pola
      // sama dengan form ROP; SO DIBATALKAN tidak ditawarkan.
      api
        .get<PaginatedResponse<SalesOrderResponse>>('/penjualan/sales-order?limit=200')
        .then((rows) => {
          if (active) setSoRows(rows.data.filter((so) => so.status !== 'DIBATALKAN'));
        })
        .catch(() => {
          /* daftar kosong — baris tetap bisa "Tanpa SO" */
        });
    } else if (isCreate) {
      // === Update #032 — daftar penawaran untuk "Pilih Penawaran" (hanya
      // mode buat SO baru). Hanya DRAFT/SELESAI yang dikembalikan endpoint
      // (SELESAI tetap bisa — repeat order). Gagal memuat → pilihan kosong,
      // SO manual tetap bisa. ===
      api
        .get<PenawaranUntukSoItem[]>('/penjualan/penawaran/untuk-so?limit=200')
        .then((rows) => {
          if (active) setPenawaranOptions(rows || []);
        })
        .catch(() => {
          /* daftar kosong — SO manual tanpa penawaran tetap bisa */
        });
    }
    return () => {
      active = false;
    };
  }, [isSales, isCreate]);

  // === Update #033 — muat daftar termin tersimpan (mode edit/detail SO):
  // baris per termin (urutan/nominal/status bayar) — memperjelas struktur
  // "beberapa kali pembayaran" pada SO yang sudah dibuat. ===
  const originalTerminSoId = original?.id;
  useEffect(() => {
    if (!isSales || !originalTerminSoId) {
      setSavedTermins([]);
      return;
    }
    let active = true;
    api
      .get<SoTerminResponse[]>(`/penjualan/sales-order/${originalTerminSoId}/termin`)
      .then((rows) => {
        if (active) setSavedTermins(Array.isArray(rows) ? rows : []);
      })
      .catch(() => {
        if (active) setSavedTermins([]);
      });
    return () => {
      active = false;
    };
  }, [isSales, originalTerminSoId]);

  // ── Draft otomatis: pulihkan sekali saat mount (hanya create + ada draft) ──
  const restoredRef = useRef(false);
  useEffect(() => {
    if (!isCreate || restoredRef.current) return;
    restoredRef.current = true;
    // Update #033 — form dibuka lewat tombol "Buat SO" (dari daftar
    // penawaran): isian ditarik dari penawaran — draft lama diabaikan.
    if (initialPenawaranId) return;
    const d = draft.draft;
    if (!d) return;
    // Merge dengan default: draft lama (sebelum fitur PPh23/PPN) tidak
    // menyimpan key pajak — tanpa merge, flag baru ikut "hilang" dari header.
    if (d.header)
      setHeader((prev) => {
        const merged = { ...prev, ...d.header };
        // Tarif kosong (draft lama) → pertahankan default (11 / 2), sama
        // dengan fallback schema backend saat field tidak dikirim.
        // Update #042 — ppn/pph23 hanya relevan untuk PO (SO tanpa PPN).
        if (!isSales) {
          if (!merged.ppn) merged.ppn = prev.ppn;
          if (!merged.pph23) merged.pph23 = prev.pph23;
        }
        return merged;
      });
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
    setHeader(newOrderHeader(defaultRates ? { ppn: defaultRates.ppn, pph23: defaultRates.pph23 } : undefined));
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
  // === Update #066 — PO: PIC & No. Hp juga terisi otomatis dari MASTER
  // SUPPLIER saat supplier dipilih (snapshot untuk cetak PO); centang gudang
  // tujuan tetap menimpa dengan PIC gudang (perilaku lama). ===
  const handlePartyChange = (value: string, masterOverride?: PelangganDropdown | SupplierDropdown | null) => {
    setField(partyKey, value);
    // Update #007: masterOverride dipakai quick-add — baris master hasil create
    // belum masuk state partyRows saat callback ini berjalan (stale closure).
    const master = masterOverride !== undefined ? masterOverride : findPartyMaster(partyRows, value);
    setHeader((prev) => {
      const next = { ...prev };
      if (isSales) {
        next.alamatPengiriman = master?.alamat || '';
        // Update #003: singkatan customer auto-fill dari master pelanggan —
        // hanya saat create (di edit terkunci: bagian dari nomor dokumen).
        if (!original) next.customerCode = (master && 'singkatan' in master ? master.singkatan : '') || '';
      } else {
        next.alamat = master?.alamat || '';
        // === Update #066 — PIC & No. Hp terisi otomatis dari MASTER SUPPLIER
        // saat supplier dipilih (sebelumnya hanya dari gudang tujuan).
        // Tetap bisa diubah manual — snapshot untuk cetak PO; mencentang
        // gudang tujuan tetap MENIMPA dengan PIC gudang (perilaku lama). ===
        next.picGudang = master?.kontakPerson || '';
        next.picGudangTelepon = master?.telepon || '';
        const supplierCurrency = master && 'currency' in master ? master.currency : null;
        if (supplierCurrency && supplierCurrency !== prev.currency && currencyOptions.some((option) => option.id === supplierCurrency)) {
          next.currency = supplierCurrency;
        }
      }
      if (master?.syaratBayarId && !isSales) next.syaratBayarId = master.syaratBayarId;
      return next;
    });
  };

  // Update #007: terapkan barang ke baris — dipakai manual pick DAN quick-add
  // (autofill harga + satuan dasar dari master barang, mirror cabang lama).
  const applyBarangToLine = (key: string, value: string, found: BarangDropdown | undefined = barang.find((b) => b.id === value)) =>
    setLines((prev) =>
      prev.map((line) => {
        if (line.key !== key) return line;
        // Auto-fill harga saat barang dipilih:
        // - SO (sales): harga jual default dari master barang, fallback harga pokok.
        // - PO (purchase): harga beli referensi (harga pokok).
        // Normalisasi via Number() — backend mengirim Decimal sebagai string "20000000.00".
        let hargaDefault = '';
        if (found) {
          if (isSales && Number(found.hargaJual) > 0) hargaDefault = String(Number(found.hargaJual));
          else if (Number(found.hargaPokok) > 0) hargaDefault = String(Number(found.hargaPokok));
        }
        // Update ASAHI #4: satuan otomatis terpilih dari master barang
        // (base_uom) — sejalan dengan auto-fill harga; user tetap bisa ganti manual.
        return { ...line, barangId: value, satuanId: found?.satuanId || '', ...(hargaDefault ? { harga: hargaDefault } : {}) };
      })
    );

  // ══════════════════════════════════════════════════════════════════
  // === Update #032 — "Pilih Penawaran": tarik item penawaran ke SO baru ===
  // Dipilih → pelanggan terisi & terkunci + seluruh item (barang master &
  // item BEBAS apa adanya — tanpa menyentuh master data/gudang) + harga,
  // diskon, biaya tambahan, header terisi. Repeat order: penawaran SELESAI
  // tetap bisa dipilih lagi (tiap SO dapat nomor SO sendiri).
  // ══════════════════════════════════════════════════════════════════
  const handlePilihPenawaran = async (id: string, opts?: { silent?: boolean }) => {
    setPenawaranId(id);
    setPenawaranDetail(null);
    if (!id) return;
    setPenawaranLoading(true);
    try {
      const p = await api.get<PenawaranResponse>(`/penjualan/penawaran/${id}`);
      const rev = p.revisiKe && p.revisiKe > 1 ? ` Rev. ${p.revisiKe}` : '';
      setPenawaranDetail(p);
      setHeader((prev) => ({
        ...prev,
        pelangganId: p.pelangganId || '',
        customerCode: p.customerCode || prev.customerCode,
        customerPoNumber: p.customerPoNumber || '',
        alamatPengiriman: p.alamatPengiriman || prev.alamatPengiriman,
        syaratBayarId: p.syaratBayarId || prev.syaratBayarId,
        currency: p.mataUang || prev.currency,
        diskonGlobal: String(p.diskonGlobal ?? 0) || prev.diskonGlobal,
        // === Update #042 — ppn penawaran DIHAPUS (order doc tanpa PPN); tidak
        // ditarik lagi ke header SO. ===
        keterangan: `Dari Penawaran ${p.noPenawaran}${rev}${p.keterangan ? ` — ${p.keterangan}` : ''}`
      }));
      // Baris: barang master → baris biasa; item bebas → mode bebas (nama +
      // satuan teks; barangId dikirim null — tidak menyentuh master barang).
      const mapped: OrderLine[] = (p.details || []).map((d) => {
        const bebas = !d.barangId && !!(d.itemNama || '').trim();
        return {
          key: crypto.randomUUID(),
          barangId: bebas ? '' : d.barangId || '',
          satuanId: bebas ? '' : d.satuanId || '',
          harga: String(Number(d.harga) || 0),
          qty: String(d.qty ?? 1),
          diskon: String(d.diskon ?? 0),
          // === Update #042 — kolom DP per baris DIHAPUS: SO selalu nilai
          // penuh; DP/pelunasan ditagih lewat Invoice (field DP/Pelunasan). ===
          salesOrderId: '',
          jenisPembelian: '',
          // Update #037 — default kosong (baris dari penawaran tidak punya link ROP).
          ropItemId: '',
          bebas,
          itemNama: bebas ? d.itemNama || '' : '',
          itemSatuan: bebas ? d.itemSatuan || '' : ''
        };
      });
      setLines(mapped.length ? mapped : [newOrderLine()]);
      setCosts((p.biayaTambahan || []).map((b) => ({ key: crypto.randomUUID(), nama: b.nama || '', jumlah: String(Number(b.jumlah) || 0) })));
      // Update #033 — silent: dipakai auto-tarik dari tombol "Buat SO"
      // (penawaran.tsx sudah menampilkan toast sendiri).
      // === Update #047 — toast disederhanakan: versi lama menjelaskan
      // konsep internal ("barang master & item bebas apa adanya", "nilai
      // penuh tanpa PPN", "Update #042") yang membingungkan user. ===
      if (!opts?.silent) {
        const nBaris = (p.details || []).length;
        toast.success(`Data penawaran ${p.noPenawaran}${rev} berhasil ditarik`, {
          description: `${nBaris} baris item terisi otomatis. Periksa kembali isian sebelum menyimpan SO.`
        });
      }
    } catch (e) {
      setPenawaranId('');
      toast.error(e instanceof ApiError ? e.detail : 'Gagal memuat penawaran');
    } finally {
      setPenawaranLoading(false);
    }
  };

  // Update #032 — lepas pilihan penawaran: pelanggan kembali bisa diganti,
  // item yang sudah ditarik TETAP di form (bebas diedit/dihapus manual).
  const lepasPenawaran = () => {
    setPenawaranId('');
    setPenawaranDetail(null);
    toast.info('Pilihan penawaran dilepas', { description: 'Data yang sudah ditarik tetap ada di form — bebas diedit.' });
  };

  // === Update #033 — AUTO-TARIK penawaran saat form dibuka lewat tombol
  // "Buat SO" di daftar penawaran (formProps.penawaranId → prop ini).
  // Pelanggan terkunci + seluruh item/biaya terisi otomatis → user langsung
  // mengatur Pembayaran Termin (beberapa kali bayar) sebelum menyimpan.
  // Sekali saja saat mount (sebelum #033 tombol itu membuat SO langsung —
  // termin tidak pernah sempat diatur, SO jadi "sekali bayar grand total"). ===
  const initialPenawaranPulled = useRef(false);
  useEffect(() => {
    if (!isSales || !isCreate || !initialPenawaranId || initialPenawaranPulled.current) return;
    initialPenawaranPulled.current = true;
    void handlePilihPenawaran(initialPenawaranId, { silent: true });
  }, []);

  // Update #032 — toggle mode baris (sales create/edit-DRAFT): master ↔ bebas.
  const toggleLineMode = (key: string) => {
    setLines((prev) => prev.map((line) => (line.key === key ? { ...line, bebas: !line.bebas, barangId: !line.bebas ? '' : line.barangId, satuanId: !line.bebas ? '' : line.satuanId, itemNama: line.bebas ? '' : line.itemNama, itemSatuan: line.bebas ? '' : line.itemSatuan } : line)));
  };

  const updateLine = (key: string, field: keyof OrderLine, value: string) => {
    if (field === 'barangId') {
      applyBarangToLine(key, value);
      return;
    }
    setLines((prev) => prev.map((line) => (line.key === key ? { ...line, [field]: value } : line)));
  };

  async function save() {
    if (disabled || submittingRef.current) return;
    // Update #032 — baris boleh barang master ATAU item bebas (khusus SO).
    const hasUsableLine = lines.some((line) => line.barangId || (line.bebas && line.itemNama.trim()));
    if (!header[partyKey] || !header.tanggal || !hasUsableLine) {
      // === Update #049 — catat field mana yang terlewat; setelah dialog
      // ditutup, otomatis scroll + fokus ke field pertama. ===
      const missing: string[] = [];
      if (!header[partyKey]) missing.push('party');
      if (!header.tanggal) missing.push('tanggal');
      if (!hasUsableLine) missing.push('detail');
      pendingFocusRef.current = missing;
      setError(isSales ? 'Tanggal, pelanggan, dan minimal satu baris (barang atau item bebas) wajib diisi.' : 'Tanggal, pelanggan/supplier, dan minimal satu barang wajib diisi.');
      return;
    }
    // Update #032 — baris bebas wajib punya nama item.
    if (isSales && lines.some((line) => line.bebas && !line.itemNama.trim())) {
      pendingFocusRef.current = ['detail'];
      setError('Setiap baris item bebas wajib memiliki nama item — isi kolom nama item atau kembalikan ke mode barang master.');
      return;
    }
    // (Pelanggan saat penawaran dipilih dijaga lewat field terkunci di bawah +
    // validasi backend penawaran-pelanggan cocok — tidak perlu cek di sini.)
    // Update ASAHI #3: alamat pengiriman wajib dipilih SATU untuk PO.
    if (!isSales && !header.alamatPengirimanId) {
      pendingFocusRef.current = ['alamatPengirimanId'];
      setError('Alamat pengiriman wajib dipilih — centang satu gudang tujuan.');
      return;
    }
    // === Update #040 — validasi & guardrail Pembayaran Termin (SO create,
    // #031/#033/#035) DIHAPUS bersama inputnya: pembayaran murni lewat
    // Invoice (Pelunasan), tanpa konfirmasi "tanpa termin" lagi. ===
    await submitOrder();
  }

  // === Update #033 — submitOrder: badan penyimpanan (dipisah dari save()
  // supaya konfirmasi "tanpa termin" bisa melanjutkan kemari).
  // Update #040 — konfirmasi itu sudah tidak ada; submitOrder tetap dipisah
  // supaya bentuk pemanggilan tidak berubah. ===
  async function submitOrder() {
    if (disabled || submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    try {
      const payload = original
        ? buildOrderUpdate(kind, header, lines, original)
        : {
            ...serializeOrderHeader(kind, header),
            details: serializeOrderLines(lines),
            biayaTambahan: costs.filter((cost) => cost.nama.trim()).map((cost) => ({ nama: cost.nama.trim(), jumlah: Number(cost.jumlah) })),
            // Update #040 — payload pembayaranTermin (#031) DIHAPUS: SO baru
            // tidak lagi membawa termin; pembayaran lewat alur Invoice.
            // Update #032 — link penawaran sumber (repeat order; SO manual tanpa link).
            ...(isSales && penawaranId ? { penawaranId } : {})
          };
      if (!Object.keys(payload).length) {
        toast.info('Tidak ada perubahan untuk disimpan');
        return;
      }
      const { saved, mismatches } = await persistOrder(kind, payload, savedId.current, (order) => {
        savedId.current = order.id;
        setOriginal(order);
        refreshListTab(tabModule, subPage);
        // Update #033 — SO dari penawaran → refresh daftar penawaran juga
        // (status → SELESAI + badge "dipakai N× SO" langsung terlihat).
        if (isSales && penawaranId) refreshListTab('sales', 'penawaran');
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

  const input = (key: OrderHeaderKey, label: string, type = 'text', maxLength?: number) => (
    <div className="space-y-1.5" key={key} id={`field-${key}`}>
      <Label htmlFor={`order-${key}`}>{label}</Label>
      <Input id={`order-${key}`} type={type} step={type === 'number' ? 'any' : undefined} value={header[key]} onChange={(event) => setField(key, event.target.value)} disabled={disabled} maxLength={maxLength} />
    </div>
  );
  const currentParty = original ? (isSales ? (original as SalesOrderResponse).pelanggan : (original as PurchaseOrderResponse).supplier) : null;
  const currentPartyId = original ? (isSales ? (original as SalesOrderResponse).pelangganId : (original as PurchaseOrderResponse).supplierId) : null;
  const unitOptions = units.map((unit) => ({ id: unit.id, label: unit.nama }));
  const barangOptions = barang.map((item) => ({ id: item.id, label: `${item.kode} — ${item.nama}` }));
  // Preserve labels of historical items/units that no longer appear in active dropdowns.
  // Update #032 — baris item bebas (barangId null) dilewati: tidak ada opsi master.
  for (const line of original?.details || []) {
    if (line.barangId && !barangOptions.some((item) => item.id === line.barangId)) barangOptions.push({ id: line.barangId, label: line.barang?.nama || line.barangId });
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

  // Update #002: opsi SO untuk kolom "Keterangan SO" per baris PO — label
  // noPesanan. Saat edit PO lama, SO yang ter-link tapi tidak ada di daftar
  // (mis. sudah dibatalkan) tetap dipertahankan agar label tersimpan tampil.
  const soOptions = useMemo(() => {
    if (isSales) return [] as SearchableDropdownOption[];
    const options: SearchableDropdownOption[] = soRows.map((so) => ({ id: so.id, label: so.noPesanan }));
    if (original) {
      for (const line of (original as PurchaseOrderResponse).details) {
        if (line.salesOrderId && line.salesOrder && !options.some((option) => option.id === line.salesOrderId)) options.push({ id: line.salesOrderId, label: line.salesOrder.noPesanan });
      }
    }
    return options;
  }, [isSales, soRows, original]);

  // === Update #033 — opsi dropdown penawaran: pastikan penawaran terpilih
  // (ditarik otomatis dari tombol "Buat SO") tetap tampil labelnya walau
  // belum ada di daftar (daftar masih dimuat / gagal dimuat). ===
  const penawaranDropdownOptions = useMemo(() => {
    const options: SearchableDropdownOption[] = penawaranOptions.map((p) => ({
      id: p.id,
      label: `${p.noPenawaran}${p.revisiKe > 1 ? ` (Rev. ${p.revisiKe})` : ''}`,
      // === Update #047 — subtitle disederhanakan (versi lama menampilkan
      // "dipakai N× SO · sisa Rp … · repeat order/draft" yang membingungkan;
      // penawaran yang sudah terpakai penuh kini tidak ditawarkan lagi oleh
      // backend — jadi info pemakaian tidak diperlukan). ===
      subtitle: `${p.pelangganNama || '-'} · ${p.jumlahItem} item`
    }));
    if (penawaranDetail && !options.some((option) => option.id === penawaranDetail.id)) {
      options.unshift({
        id: penawaranDetail.id,
        label: `${penawaranDetail.noPenawaran}${penawaranDetail.revisiKe > 1 ? ` (Rev. ${penawaranDetail.revisiKe})` : ''}`,
        subtitle: penawaranDetail.pelanggan?.nama || '-'
      });
    }
    return options;
  }, [penawaranOptions, penawaranDetail]);

  // ── Update ASAHI (PPh23/PPN opsional) — preview total PO mengikuti
  // pilihan pajak (rumus sama dengan backend: DPP + PPN + biaya − PPh23). ──
  // === Update #042 — kolom DP per baris & PPN DIHAPUS dari form SO: SO adalah
  // dokumen nilai PENUH (grand total = subtotal − diskon + biaya); DP bertahap
  // & pelunasan lewat pembuatan Invoice (bisa berkali-kali) dengan field
  // DP/Pelunasan. Preview pajak di bawah hanya untuk mode PURCHASE (PO). ===
  const lineTotal = (line: OrderLine) => (Number(line.qty) || 0) * (Number(line.harga) || 0) * (1 - (Number(line.diskon) || 0) / 100);
  const liveSubtotal = lines.reduce((sum, line) => sum + lineTotal(line), 0);
  const liveDiskon = liveSubtotal * ((Number(header.diskonGlobal) || 0) / 100);
  const liveDpp = liveSubtotal - liveDiskon;
  const livePpn = !isSales && header.ppnApplicable === 'true' ? liveDpp * ((Number(header.ppn) || 0) / 100) : 0;
  const livePph23 = !isSales && header.pph23Applicable === 'true' ? liveDpp * ((Number(header.pph23) || 0) / 100) : 0;
  const liveBiaya = costs.reduce((sum, cost) => sum + (Number(cost.jumlah) || 0), 0);
  // Update #042 — SO: grand total = subtotal − diskon + biaya (tanpa PPN);
  // PO: DPP + PPN + biaya − PPh23 (pajak hanya di PO/invoice).
  const liveGrandTotal = isSales ? liveDpp + liveBiaya : liveDpp + livePpn + liveBiaya - livePph23;

  // === Update #039 — tombol BAGI CEPAT (Bagi 2 / Bagi 3, #034) DIHAPUS atas
  // permintaan user: input termin kini murni BEBAS (Tambah Termin + nominal
  // manual). Fungsi bagiTermin ikut dihapus. ===

  // === Update #049 — tutup dialog validasi & langsung arahkan (scroll +
  // fokus) ke field wajib pertama yang terlewat. ===
  const closeErrorDialog = () => {
    setError('');
    if (pendingFocusRef.current.length) {
      const keys = pendingFocusRef.current;
      pendingFocusRef.current = [];
      focusFormError(keys, { root: formRef.current });
    }
  };

  return (
    <FormTabShell title={`${original ? (readOnly ? 'Detail' : 'Edit') : 'Buat'} ${title}`}>
      {/* === Update #049 — wrapper ref: scope anchor navigasi field wajib. === */}
      <div ref={formRef}>
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
                    {/* Update #032 — sumber penawaran (repeat order) */}
                    {isSales && (original as SalesOrderResponse).penawaranNo && (
                      <Badge variant="outline" className="gap-1 border-amber-300 bg-amber-50 text-amber-800">
                        <FileText className="h-3 w-3" />
                        Dari Penawaran {(original as SalesOrderResponse).penawaranNo}
                        {(original as SalesOrderResponse).penawaranRevisi && (original as SalesOrderResponse).penawaranRevisi! > 1 ? ` · Rev. ${(original as SalesOrderResponse).penawaranRevisi}` : ''}
                      </Badge>
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
                {/* ════════════════════════════════════════════════════════
                  === Update #032 — PILIH PENAWARAN (khusus buat SO baru) ===
                  Dipilih → pelanggan terkunci + item/harga/biaya ditarik
                  otomatis dari penawaran (repeat order: SELESAI tetap bisa
                  dipilih lagi — tiap SO dapat nomor sendiri).
                  ════════════════════════════════════════════════════════ */}
                {isSales && isCreate && (
                  <div className="space-y-2 rounded-md border border-amber-200 bg-amber-50/40 p-4">
                    <div className="flex flex-wrap items-end justify-between gap-2">
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <Label className="flex items-center gap-1.5">
                          <FileText className="h-3.5 w-3.5 text-amber-600" />
                          Pilih Penawaran <span className="text-[11px] font-normal text-muted-foreground">(opsional)</span>
                        </Label>
                        <div className="flex items-center gap-1.5">
                          <SearchableDropdown className="min-w-0 flex-1" value={penawaranId} onValueChange={handlePilihPenawaran} options={penawaranDropdownOptions} allOption={{ id: '', label: 'Tanpa penawaran' }} placeholder={penawaranLoading ? 'Memuat daftar penawaran…' : penawaranDropdownOptions.length ? 'Pilih penawaran untuk menarik item…' : 'Belum ada penawaran yang bisa dipilih'} disabled={disabled || penawaranLoading || penawaranDropdownOptions.length === 0} />
                          {penawaranLocked && (
                            <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={lepasPenawaran} title="Lepas pilihan penawaran (data yang sudah ditarik tetap ada)">
                              <Unlink className="mr-1.5 h-3.5 w-3.5" /> Lepas
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                    {penawaranDetail && (
                      <div className="space-y-1.5">
                        {/* === Update #045 — keterangan "Sumber: …" & "Sisa penawaran: …"
                          DIHAPUS (permintaan user): info panjang tidak perlu
                          ditampilkan; cukup warning bila nilai SO melebihi sisa. === */}
                        {/* Update #039 — WARNING melebihi sisa (NON-BLOKING:
                          repeat order / nambah scope tetap diperbolehkan). */}
                        {liveGrandTotal > 0 && Number(penawaranDetail.sisaPenawaran) < liveGrandTotal && (
                          <p className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] font-medium text-amber-900" role="alert">
                            Nilai SO ini ({formatOrderMoney(liveGrandTotal, header.currency)}) melebihi sisa penawaran sebesar {formatOrderMoney(liveGrandTotal - Number(penawaranDetail.sisaPenawaran), header.currency)} — tetap bisa disimpan (repeat order / penambahan scope), pastikan disengaja.
                          </p>
                        )}
                      </div>
                    )}
                    {!penawaranLocked && <p className="text-[11px] text-muted-foreground">Sarankan alur: Penawaran → (customer setuju) → buat SO dari sini. Penawaran berstatus Selesai tetap muncul — boleh dipakai berulang kali (repeat order).</p>}
                  </div>
                )}
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-1.5" id="field-party">
                    <Label>{isSales ? 'Pelanggan' : 'Supplier'} *</Label>
                    {/* Update #4: pilih party → alamat/syarat bayar/currency ditarik otomatis dari master */}
                    <div className="flex items-start gap-1.5">
                      <SearchableDropdown className="min-w-0 flex-1" value={header[partyKey]} onValueChange={handlePartyChange} options={includeCurrent(parties, currentPartyId, currentParty?.nama)} disabled={disabled || (isSales && penawaranLocked)} placeholder={isSales ? (penawaranLocked ? 'Mengikuti penawaran terpilih' : 'Pilih pelanggan') : 'Pilih supplier'} />
                      {/* Update #007: quick add pelanggan/supplier tanpa keluar dari form.
                        === Update #046 — tombol quick add DISEMBUNYIKAN saat mode
                        narik data (SO dari penawaran — pelanggan terkunci mengikuti
                        dokumen sumber); muncul lagi saat SO manual (tanpa penawaran). === */}
                      {isSales ? (
                        !penawaranLocked && (
                          <QuickAddPelangganButton
                            disabled={disabled}
                            onCreated={(p) => {
                              const drop = toPelangganDropdown(p);
                              setPartyRows((prev) => (prev.some((row) => row.id === p.id) ? prev : [...prev, drop]));
                              setParties((prev) => (prev.some((row) => row.id === p.id) ? prev : [...prev, { id: p.id, label: p.nama }]));
                              handlePartyChange(p.id, drop);
                            }}
                          />
                        )
                      ) : (
                        <QuickAddSupplierButton
                          disabled={disabled}
                          onCreated={(s) => {
                            const drop = toSupplierDropdown(s);
                            setPartyRows((prev) => (prev.some((row) => row.id === s.id) ? prev : [...prev, drop]));
                            setParties((prev) => (prev.some((row) => row.id === s.id) ? prev : [...prev, { id: s.id, label: s.nama }]));
                            handlePartyChange(s.id, drop);
                          }}
                        />
                      )}
                    </div>
                  </div>
                  {/* Update #002 (PO): label "Tanggal" → "Tanggal PO" — sales tetap "Tanggal". */}
                  {input('tanggal', isSales ? 'Tanggal *' : 'Tanggal PO *', 'date')}
                  {/* === Update #031 — Syarat Pembayaran DIHAPUS dari form SO
                    (user: "syarat pembayaran tidak perlu di SO"; pembayaran
                    kini lewat Pembayaran Termin). PO tetap memakai Syarat Bayar. === */}
                  {!isSales && (
                    <div className="space-y-1.5">
                      <Label>Syarat Bayar</Label>
                      <div className="flex items-start gap-1.5">
                        <SearchableDropdown
                          className="min-w-0 flex-1"
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
                        {/* Update #007: quick add syarat bayar */}
                        <QuickAddSyaratBayarButton
                          disabled={disabled}
                          onCreated={(term) => {
                            setTerms((prev) => (prev.some((row) => row.id === term.id) ? prev : [...prev, term]));
                            setField('syaratBayarId', term.id);
                          }}
                        />
                      </div>
                    </div>
                  )}
                  <div className="space-y-1.5">
                    <Label>Currency</Label>
                    {/* Update ASAHI #3: opsi mata uang dinamis dari Pengaturan → Profil Perusahaan */}
                    <SearchableDropdown value={header.currency} onValueChange={(value) => setField('currency', value)} options={includeCurrent(currencyOptions, header.currency)} disabled={disabled} />
                  </div>
                  {isSales ? (
                    <>
                      {input('customerPoNumber', 'Customer PO Number')}
                      {input('customerPoDate', 'Customer PO Date', 'date')}
                      {/* ── Update ASAHI (revisi SO): Singkatan Customer — input
                        bebas (mis. TBI untuk TOYOTA BOSHUKU INDONESIA) yang
                        menjadi segmen nomor pesanan:
                          terisi  → "SO ASI/TBI/2026/001"
                          kosong  → "SO ASI/-/2026/001"
                        Terkunci saat edit karena bagian dari nomor dokumen
                        (immutable setelah dokumen dibuat). ── */}
                      <div className="space-y-1.5" key="customerCode">
                        <Label htmlFor="order-customerCode">Singkatan Customer</Label>
                        <Input id="order-customerCode" value={header.customerCode} readOnly disabled={disabled || !!original} placeholder="otomatis dari master Pelanggan" className="bg-muted" />
                        <p className="text-xs text-muted-foreground">Otomatis ditarik dari master data Pelanggan (field Singkatan) saat pelanggan dipilih — kelola di Pengaturan → Pelanggan. Singkatan tidak dapat diubah di sini.</p>
                      </div>
                      {/* Update ASAHI (revisi SO): label "Tanggal Pengiriman" → "Target Pengiriman". */}
                      {input('tanggalPengiriman', 'Target Pengiriman', 'date')}
                      {/* Update ASAHI (revisi SO): field Ekspedisi & Penjual dihapus dari dokumen SO. */}
                      <div className="space-y-1.5 md:col-span-2">
                        <Label htmlFor="order-alamatPengiriman">Alamat Pengiriman</Label>
                        {/* Update #4: auto-fill dari master Pelanggan saat dipilih */}
                        <Textarea id="order-alamatPengiriman" rows={2} value={header.alamatPengiriman} onChange={(event) => setField('alamatPengiriman', event.target.value)} disabled={disabled} />
                        <p className="text-xs text-muted-foreground">{AUTOFILL_HINT.pelanggan}</p>
                      </div>
                    </>
                  ) : (
                    <>
                      {/* Update #002 (PO): "Tanggal Kirim" → "Target Kirim". */}
                      {input('tanggalKirim', 'Target Kirim', 'date')}
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
                  memindahkan pilihan (tidak bisa dua). Update #003: checkbox
                  PPIC dihapus dari form. ── */}
                {!isSales && (
                  <div className="space-y-3 rounded-md border p-4" id="field-alamatPengirimanId">
                    <div>
                      <Label>Alamat Pengiriman (Gudang Tujuan) *</Label>
                      <p className="text-xs text-muted-foreground">Wajib pilih satu — tampil di bawah tabel barang pada cetak Purchase Order bersama PIC. Daftar diatur di Pengaturan → Profil Perusahaan.</p>
                    </div>
                    {alamatKirimOptions.length === 0 ? (
                      <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">Belum ada alamat pengiriman. Tambahkan dulu di Pengaturan → Profil Perusahaan → Alamat Pengiriman.</p>
                    ) : (
                      <div className="grid gap-2 sm:grid-cols-2">
                        {alamatKirimOptions.map((option) => {
                          const selected = header.alamatPengirimanId === option.id;
                          return (
                            <label key={option.id} className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors ${selected ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'} ${disabled ? 'cursor-not-allowed opacity-70' : ''}`}>
                              <Checkbox
                                aria-checked={selected}
                                className="mt-0.5"
                                checked={selected}
                                onCheckedChange={(checked) => {
                                  setField('alamatPengirimanId', checked ? option.id : '');
                                  // Update #002: PIC Gudang terisi otomatis dari
                                  // master gudang yang dicentang — HANYA saat user
                                  // memilih (bukan saat load data edit); setelahnya
                                  // tetap bisa diubah manual.
                                  if (checked) {
                                    const row = alamatKirim.find((r) => r.id === option.id);
                                    setField('picGudang', row?.picNama || '');
                                    setField('picGudangTelepon', row?.picTelepon || '');
                                  }
                                }}
                                disabled={disabled}
                              />
                              <span className="space-y-0.5 text-sm leading-snug">
                                <span className="block text-xs text-muted-foreground">{option.prefix}</span>
                                <span className="font-medium">{option.label}</span>
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                    {/* Update #003 / #054: PIC + No. Hp (sebelumnya "PIC Gudang")
                      — snapshot untuk cetak PO (checkbox PPIC dihapus).
                      === Update #066 — terisi otomatis dari MASTER SUPPLIER saat
                      supplier dipilih; centang gudang tujuan MENIMPA dengan PIC
                      gudang. Tetap bisa diubah manual. === */}
                    <div className="grid gap-4 sm:grid-cols-2">
                      {input('picGudang', 'PIC', 'text', 100)}
                      {input('picGudangTelepon', 'No. Hp', 'text', 50)}
                    </div>
                    <p className="text-xs text-muted-foreground">Terisi otomatis dari supplier terpilih (centang gudang tujuan akan menimpa dengan PIC gudang) — masih bisa diubah.</p>
                  </div>
                )}

                <div className="space-y-3" id="field-detail">
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
                          {/* === Update #042 — kolom DP (Rp) DIHAPUS: SO adalah dokumen
                            nilai penuh; DP bertahap & pelunasan ditagih lewat
                            pembuatan Invoice (field DP/Pelunasan). === */}
                          {isSales && <TableHead className="min-w-32 text-right">Jumlah</TableHead>}
                          {/* Update #002 (khusus PO): Total Harga + tracking Keterangan SO & Jenis Belanja per baris. */}
                          {!isSales && <TableHead className="min-w-32">Total Harga</TableHead>}
                          {!isSales && <TableHead className="min-w-44">Keterangan SO</TableHead>}
                          {!isSales && <TableHead className="min-w-36">Jenis Belanja</TableHead>}
                          <TableHead>Aksi</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {lines.map((line, index) => (
                          <TableRow key={line.key}>
                            <TableCell>
                              {/* === Update #032 — dua mode baris (khusus SO):
                                master (dropdown barang) / BEBAS (input nama
                                item — jasa/custom, tidak di master barang).
                                Ikon toggle di kiri kolom. PO tetap master saja. === */}
                              <div className="flex items-center gap-1">
                                {isSales && (
                                  <Button variant="ghost" size="icon" className={line.bebas ? 'h-7 w-7 shrink-0 text-amber-600' : 'h-7 w-7 shrink-0 text-muted-foreground'} onClick={() => toggleLineMode(line.key)} disabled={disabled || lockDetail} title={line.bebas ? 'Item bebas (ketik manual — tidak di master barang, tidak menyentuh gudang; bisa difakturkan). Klik untuk pilih dari master barang.' : 'Pilih dari master barang. Klik untuk ketik item bebas (jasa/custom).'} aria-label={line.bebas ? 'Ganti ke mode master barang' : 'Ganti ke mode item bebas'}>
                                    {line.bebas ? <Type className="h-3.5 w-3.5" /> : <Package className="h-3.5 w-3.5" />}
                                  </Button>
                                )}
                                {isSales && line.bebas ? <Input aria-label={`Nama item bebas baris ${index + 1}`} placeholder="Nama item / jasa (bebas)" value={line.itemNama} onChange={(event) => updateLine(line.key, 'itemNama', event.target.value)} disabled={disabled || lockDetail} maxLength={200} /> : <SearchableDropdown className="min-w-0 flex-1" value={line.barangId} onValueChange={(value) => updateLine(line.key, 'barangId', value)} options={barangOptions} disabled={disabled || lockDetail} compact />}
                                {/* Update #007: quick add barang langsung di baris (mode master saja — bebas tidak perlu master) */}
                                {!(isSales && line.bebas) && !lockDetail && (
                                  <QuickAddBarangButton
                                    compact
                                    disabled={disabled}
                                    onCreated={(b) => {
                                      const drop = toBarangDropdown(b);
                                      setBarang((prev) => (prev.some((row) => row.id === b.id) ? prev : [...prev, drop]));
                                      // Satuan dasar barang baru (mungkin hasil nested quick-add) didaftarkan ke daftar satuan form.
                                      const satuan = satuanFromBarang(b);
                                      if (satuan) setUnits((prev) => (prev.some((row) => row.id === satuan.id) ? prev : [...prev, satuan]));
                                      applyBarangToLine(line.key, b.id, drop);
                                    }}
                                  />
                                )}
                              </div>
                              {/* === Update #037 — chip jejak baris ROP sumber (khusus PO
                                hasil alur Pembelian → Detail ROP → "Buat PO Draft").
                                ropItemId round-trip diam-diam saat save (lihat
                                lib/order-documents.ts); chip ini murni informasi. === */}
                              {!isSales && (line.ropNo || line.ropItemId) && (
                                <span className="mt-1 inline-flex max-w-full items-center truncate rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700" title={line.ropNo ? `Baris ini berasal dari ${line.ropNo} (alur Detail ROP)` : 'Baris ini berasal dari ROP (alur Detail ROP)'}>
                                  {line.ropNo ? `dari ${line.ropNo}` : 'dari ROP'}
                                </span>
                              )}
                            </TableCell>
                            <TableCell>
                              {/* Update #032 — baris bebas: satuan teks bebas (bukan dropdown master). */}
                              {isSales && line.bebas ? (
                                <Input aria-label={`Satuan item bebas baris ${index + 1}`} placeholder="mis. JOB / LOT" value={line.itemSatuan} onChange={(event) => updateLine(line.key, 'itemSatuan', event.target.value)} disabled={disabled || lockDetail} maxLength={50} />
                              ) : (
                                <div className="flex items-center gap-1">
                                  <SearchableDropdown className="min-w-0 flex-1" value={line.satuanId} onValueChange={(value) => updateLine(line.key, 'satuanId', value)} options={unitOptions} allOption={{ id: '', label: 'Tidak dipilih' }} disabled={disabled || lockDetail} compact />
                                  {/* Update #007: quick add satuan langsung di baris */}
                                  {!lockDetail && (
                                    <QuickAddSatuanButton
                                      compact
                                      disabled={disabled}
                                      onCreated={(s) => {
                                        setUnits((prev) => (prev.some((row) => row.id === s.id) ? prev : [...prev, s]));
                                        updateLine(line.key, 'satuanId', s.id);
                                      }}
                                    />
                                  )}
                                </div>
                              )}
                            </TableCell>
                            <TableCell>
                              <Input aria-label={`qty baris ${index + 1}`} type="number" step="any" value={line.qty} onChange={(event) => updateLine(line.key, 'qty', event.target.value)} disabled={disabled || lockDetail} />
                            </TableCell>
                            <TableCell>
                              <CurrencyInput aria-label={`harga baris ${index + 1}`} allowDecimal value={line.harga} onValueChange={(value) => updateLine(line.key, 'harga', value)} disabled={disabled || lockDetail} />
                            </TableCell>
                            <TableCell>
                              <Input aria-label={`diskon baris ${index + 1}`} type="number" step="any" value={line.diskon} onChange={(event) => updateLine(line.key, 'diskon', event.target.value)} disabled={disabled || lockDetail} />
                            </TableCell>
                            {/* === Update #042 — input DP per baris DIHAPUS
                              (baris SO selalu nilai penuh; DP/Pelunasan kini
                              satu field header di Invoice). === */}
                            {isSales && <TableCell className="whitespace-nowrap text-right font-mono text-xs">{formatOrderMoney(lineTotal(line), header.currency)}</TableCell>}
                            {/* Update #002 (khusus PO): Total Harga read-only = qty × harga × (1 − diskon%), lalu relasi SO + jenis belanja per baris. */}
                            {!isSales && <TableCell className="whitespace-nowrap text-right font-mono text-xs">{formatOrderMoney((Number(line.qty) || 0) * (Number(line.harga) || 0) * (1 - (Number(line.diskon) || 0) / 100), header.currency)}</TableCell>}
                            {!isSales && (
                              <TableCell>
                                <SearchableDropdown value={line.salesOrderId || ''} onValueChange={(value) => updateLine(line.key, 'salesOrderId', value)} options={soOptions} allOption={{ id: '', label: 'Tanpa SO' }} placeholder="Tanpa SO" disabled={disabled} compact />
                              </TableCell>
                            )}
                            {!isSales && (
                              <TableCell>
                                <SearchableDropdown value={line.jenisPembelian || ''} onValueChange={(value) => updateLine(line.key, 'jenisPembelian', value)} options={JENIS_PEMBELIAN_OPTIONS} allOption={{ id: '', label: 'Tanpa kategori' }} placeholder="Tanpa kategori" disabled={disabled} compact />
                              </TableCell>
                            )}
                            <TableCell>
                              {/* Update #045 — tombol hapus baris disembunyikan saat
                                baris hasil tarikan penawaran (data terkunci). */}
                              {!lockDetail && (
                                <Button variant="ghost" size="icon" disabled={disabled} onClick={() => setLines((prev) => prev.filter((item) => item.key !== line.key))} aria-label={`Hapus baris ${index + 1}`}>
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  {/* === Update #045 — tombol tambah baris TIDAK DITAMPILKAN saat
                    menarik data dari penawaran (baris mengikuti dokumen sumber). === */}
                  {!readOnly && !lockDetail && (
                    <Button variant="outline" size="sm" disabled={disabled} onClick={() => setLines((prev) => [...prev, newOrderLine()])}>
                      <Plus className="mr-2 h-4 w-4" />
                      {isSales ? 'Tambah Barang / Item' : 'Tambah Barang'}
                    </Button>
                  )}
                  {/* === Update #042 — ringkasan live (khusus SO): dokumen nilai
                    PENUH tanpa PPN — grand total = subtotal − diskon + biaya.
                    DP bertahap & pelunasan TIDAK diatur di sini lagi: terbitkan
                    Invoice dari SO ini (bisa berkali-kali) dengan field
                    DP/Pelunasan. Grand total final dihitung ulang server. === */}
                  {isSales && (
                    <p className="text-xs text-muted-foreground">
                      Nilai item: <span className="font-mono font-medium text-foreground">{formatOrderMoney(liveSubtotal, header.currency)}</span> · grand total (perkiraan): <span className="font-mono font-medium text-foreground">{formatOrderMoney(liveGrandTotal, header.currency)}</span> — SO nilai penuh tanpa PPN; DP bertahap & pelunasan lewat pembuatan Invoice (bisa berkali-kali) dengan field DP/Pelunasan.
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">{isSales ? 'Baris bisa barang master (dropdown) atau ITEM BEBAS (klik ikon Type di kiri baris — jasa/custom, tidak masuk master barang; bisa difakturkan, bisa dikirim sebagai baris surat jalan tanpa stok).' : ''}Grand total final dihitung ulang server saat disimpan. Jika detail diubah, seluruh daftar barang di atas akan menggantikan detail sebelumnya.</p>
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
                      {/* Update #045 — biaya tambahan hasil tarikan penawaran ikut
                        terkunci (input disabled, tombol hapus & tambah hilang). */}
                      {costs.map((cost, index) => (
                        <div className="flex gap-2" key={cost.key}>
                          <Input aria-label={`Nama biaya ${index + 1}`} placeholder="Nama biaya" value={cost.nama} disabled={disabled || lockDetail} onChange={(event) => setCosts((prev) => prev.map((item) => (item.key === cost.key ? { ...item, nama: event.target.value } : item)))} />
                          <CurrencyInput aria-label={`Jumlah biaya ${index + 1}`} allowDecimal value={cost.jumlah} disabled={disabled || lockDetail} onValueChange={(value) => setCosts((prev) => prev.map((item) => (item.key === cost.key ? { ...item, jumlah: value } : item)))} />
                          {!lockDetail && (
                            <Button variant="ghost" size="icon" disabled={disabled} onClick={() => setCosts((prev) => prev.filter((item) => item.key !== cost.key))} aria-label={`Hapus biaya ${index + 1}`}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      ))}
                      {!lockDetail && (
                        <Button variant="outline" size="sm" disabled={disabled} onClick={() => setCosts((prev) => [...prev, { key: crypto.randomUUID(), nama: '', jumlah: '' }])}>
                          Tambah Biaya
                        </Button>
                      )}
                    </>
                  )}
                </div>
                {/* ── Update ASAHI (PPh23/PPN opsional) — khusus PO: pilih pajak
                  saat input. Boleh dua-duanya, salah satu, atau tidak
                  keduanya. PPN off → tidak ada PPN; PPh23 on → potongan
                  dari grand total. ── */}
                {!isSales && (
                  <div className="space-y-3 rounded-md border p-4">
                    <div>
                      <Label>Pajak (PPN / PPh23)</Label>
                      {/* === Update #048 — tarif PPN PO DIKUNCI (readOnly): terpusat
                        di Referensi → Perpajakan (RATE_PPN); tarif PPh23 tetap
                        bisa disesuaikan (default dari RATE_PPH23) karena
                        bergantung jenis jasa supplier. === */}
                      <p className="text-xs text-muted-foreground">Pilih pajak yang diterapkan — boleh dua-duanya, salah satu saja, atau tidak sama sekali. PPh23 memotong grand total (potongan saat dibayar). Tarif PPN terkunci (Referensi → Perpajakan); tarif PPh23 ber-default dari Perpajakan — dapat disesuaikan per jenis jasa (mis. 2%, 4%, 6%).</p>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors ${header.ppnApplicable === 'true' ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'} ${disabled ? 'cursor-not-allowed opacity-70' : ''}`}>
                        <Checkbox aria-checked={header.ppnApplicable === 'true'} className="mt-0.5" checked={header.ppnApplicable === 'true'} onCheckedChange={(checked) => setField('ppnApplicable', checked ? 'true' : 'false')} disabled={disabled} />
                        <span className="flex-1 space-y-2 text-sm leading-snug">
                          <span className="block font-medium">PPN</span>
                          {header.ppnApplicable === 'true' && (
                            <span className="flex items-center gap-2">
                              {/* === Update #048 — tarif PPN readOnly: terpusat di
                                Referensi → Perpajakan (RATE_PPN). === */}
                              <Input type="number" step="any" min={0} max={100} aria-label="Tarif PPN (persen)" className="h-8 w-24 text-xs bg-muted/60 font-medium" value={header.ppn} readOnly aria-readonly="true" title="Tarif PPN terkunci — atur di Referensi → Perpajakan" disabled={disabled} />
                              <span className="text-xs text-muted-foreground">%</span>
                            </span>
                          )}
                        </span>
                      </label>
                      <label className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors ${header.pph23Applicable === 'true' ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'} ${disabled ? 'cursor-not-allowed opacity-70' : ''}`}>
                        <Checkbox aria-checked={header.pph23Applicable === 'true'} className="mt-0.5" checked={header.pph23Applicable === 'true'} onCheckedChange={(checked) => setField('pph23Applicable', checked ? 'true' : 'false')} disabled={disabled} />
                        <span className="flex-1 space-y-2 text-sm leading-snug">
                          <span className="block font-medium">PPh23</span>
                          {header.pph23Applicable === 'true' && (
                            <span className="flex items-center gap-2">
                              <Input type="number" step="any" min={0} max={100} aria-label="Tarif PPh23 (persen)" className="h-8 w-24 text-xs" value={header.pph23} onChange={(event) => setField('pph23', event.target.value)} disabled={disabled} title="Default dari Referensi → Perpajakan — sesuaikan bila jenis jasa supplier berbeda" />
                              <span className="text-xs text-muted-foreground">%</span>
                            </span>
                          )}
                        </span>
                      </label>
                    </div>
                    {/* Preview total mengikuti pilihan pajak (mirip perhitungan server) */}
                    <div className="rounded-md border bg-muted/20 px-4 py-3 space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Dasar Pajak (setelah diskon)</span>
                        <span className="font-mono font-medium">{formatOrderMoney(liveDpp, header.currency)}</span>
                      </div>
                      {header.ppnApplicable === 'true' && (
                        <div className="flex justify-between text-xs">
                          <span className="pl-3 text-muted-foreground">+ PPN ({header.ppn || 0}%)</span>
                          <span className="font-mono">{formatOrderMoney(livePpn, header.currency)}</span>
                        </div>
                      )}
                      {header.pph23Applicable === 'true' && (
                        <div className="flex justify-between text-xs">
                          <span className="pl-3 text-muted-foreground">- PPh23 ({header.pph23 || 0}%)</span>
                          <span className="font-mono text-destructive">({formatOrderMoney(livePph23, header.currency)})</span>
                        </div>
                      )}
                      {liveBiaya > 0 && (
                        <div className="flex justify-between text-xs">
                          <span className="pl-3 text-muted-foreground">+ Biaya Tambahan</span>
                          <span className="font-mono">{formatOrderMoney(liveBiaya, header.currency)}</span>
                        </div>
                      )}
                      <div className="flex justify-between border-t pt-1 text-sm font-semibold">
                        <span>Grand Total (perkiraan)</span>
                        <span className="font-mono">{formatOrderMoney(liveGrandTotal, header.currency)}</span>
                      </div>
                    </div>
                  </div>
                )}
                <div className="grid gap-4 md:grid-cols-2">
                  {input('diskonGlobal', 'Diskon Global %', 'number')}
                  {/* === Update #042 — input PPN % DIHAPUS dari form SO (pajak
                    hanya di INVOICE; PO memakai kartu Pajak di atas). === */}
                </div>
                {/* === Update #042 — alur baru (menggantikan petunjuk PPN/DP lama):
                  SO dibuat nilai PENUH tanpa PPN & tanpa DP — grand total =
                  subtotal − diskon + biaya. DP bertahap & pelunasan dilakukan
                  lewat pembuatan Invoice (bisa berkali-kali) dengan field
                  DP/Pelunasan (auto-terisi sisa tagihan SO). === */}
                {isSales && (
                  <p className="-mt-2 text-xs text-muted-foreground">
                    SO dibuat <span className="font-medium text-foreground">nilai penuh tanpa PPN</span> — grand total = subtotal − diskon + biaya. DP bertahap &amp; pelunasan lewat pembuatan <span className="font-medium text-foreground">Invoice</span> (bisa berkali-kali) dengan field <span className="font-medium text-foreground">DP/Pelunasan</span> yang terisi otomatis sebesar sisa tagihan SO.
                  </p>
                )}
                {/* === Update #040 — BLOK PEMBAYARAN TERMIN (SO) kini HANYA
                  HISTORI (edit/detail SO lama yang dibuat sebelum #040).
                  Input termin di form create DIHAPUS penuh (#031→#035):
                  pembayaran murni lewat Invoice. Update #042 — SO kini nilai
                  PENUH; DP bertahap & pelunasan lewat pembuatan Invoice
                  (bisa berkali-kali) dengan field DP/Pelunasan. SO baru
                  tidak lagi punya termin. === */}
                {isSales && original && (
                  <div className="space-y-2 rounded-md border p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Label>Pembayaran Termin</Label>
                      <Badge variant="outline" className="border-muted-foreground/30 text-[10px] text-muted-foreground">
                        Histori — fitur dihapus (Update #040)
                      </Badge>
                    </div>
                    <div className="space-y-1.5">
                      {savedTermins.length > 0 ? (
                        <>
                          <p className="text-xs text-muted-foreground">
                            Pembayaran dipecah <span className="font-medium text-foreground">{savedTermins.length} termin</span> — SO ini dibuat sebelum Update #040 (fitur termin dihapus). Penerimaan termin lama tetap tercatat di Kas &amp; Bank dan tetap bisa dibatalkan; pembayaran lanjutan untuk SO ini dilakukan lewat Invoice.
                          </p>
                          <div className="max-h-44 overflow-y-auto rounded-md border">
                            <Table>
                              <TableHeader>
                                <TableRow className="bg-muted/50">
                                  <TableHead className="w-[80px]">Termin</TableHead>
                                  <TableHead className="text-right">Nominal</TableHead>
                                  <TableHead>Status</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {savedTermins.map((t) => (
                                  <TableRow key={t.id}>
                                    <TableCell className="text-xs font-medium">{t.urutan}</TableCell>
                                    <TableCell className="text-right font-mono text-xs font-medium">{formatOrderMoney(Number(t.nominal) || 0, original.currency)}</TableCell>
                                    <TableCell>
                                      {t.penerimaanKasId ? (
                                        <Badge className="border-emerald-200 bg-emerald-100 text-emerald-700 hover:bg-emerald-100" title={t.noBuktiPenerimaan || undefined}>
                                          Dibayar{t.noBuktiPenerimaan ? ` · ${t.noBuktiPenerimaan}` : ''}
                                        </Badge>
                                      ) : (
                                        <Badge variant="outline">Belum dibayar</Badge>
                                      )}
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        </>
                      ) : (
                        /* Fallback ringkasan (cast ke SalesOrderResponse agar
                         terminTotal/terminDibayar — field khusus SO, Update
                         #031 — terbaca TypeScript). */
                        <>
                          {(original as SalesOrderResponse).terminTotal && Number((original as SalesOrderResponse).terminTotal) > 0 ? (
                            <p className="text-xs text-muted-foreground">
                              Termin tersimpan: <span className="font-mono font-medium text-foreground">{formatOrderMoney((original as SalesOrderResponse).terminDibayar ?? 0, original.currency)}</span> dari <span className="font-mono font-medium text-foreground">{formatOrderMoney((original as SalesOrderResponse).terminTotal ?? 0, original.currency)}</span> sudah dibayar (detail pembayaran terlihat di modul Kas &amp; Bank).
                            </p>
                          ) : (
                            <p className="text-xs text-muted-foreground">SO ini tanpa termin pembayaran — pembayaran lewat alur Invoice: terbitkan Invoice dari SO ini lalu lunasi lewat Pelunasan Invoice (Kas &amp; Bank).</p>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                )}
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
                      {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      {/* Update #052 — label seragam semua modul: Simpan. */}
                      {submitting ? 'Menyimpan...' : 'Simpan'}
                    </Button>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
      {/* === Update #040 — dialog konfirmasi "Simpan SO tanpa Pembayaran
          Termin" (#033) DIHAPUS bersama input termin: SO baru memang tanpa
          termin (pembayaran lewat Invoice) — tidak ada lagi yang perlu
          dikonfirmasi. === */}
      <AlertDialog
        open={!!error}
        onOpenChange={(open) => {
          if (!open) closeErrorDialog();
        }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Perubahan pesanan belum tersimpan lengkap</AlertDialogTitle>
            <AlertDialogDescription>{error}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={closeErrorDialog}>Kembali ke Pesanan</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </FormTabShell>
  );
}
