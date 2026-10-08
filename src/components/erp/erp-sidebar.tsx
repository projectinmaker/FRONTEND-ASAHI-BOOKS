'use client';

import * as React from 'react';
import { Building2, LayoutDashboard, Wallet, TrendingDown, Building, Warehouse, BookOpen, FileBarChart, Settings, Settings2, ChevronRight, CreditCard, ArrowDownToLine, ArrowLeftRight, FileText, FileCheck, Truck, Receipt, RotateCcw, ClipboardList, Scale, Tags, Package, FolderTree, Layers, Landmark, TrendingUp, PieChart, DollarSign, Banknote, FileSpreadsheet, Users, UserCircle, FileQuestion, LogOut, UserPlus, Store, Clock, Ruler, BarChart3, AlertTriangle, ArrowUpRight, Lock, GitCompareArrows, Calculator, ClipboardCheck, HandCoins, Activity, RefreshCw, Trash2 } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarRail } from '@/components/ui/sidebar';
import { useERPStore, type ModuleId } from '@/store/erp-store';
import { useTabStore } from '@/store/tab-store';
import { useAuthStore } from '@/store/auth-store';
import { useAccessStore } from '@/store/access-store';
// Update ASAHI: prefetch identitas perusahaan (logo + nama) untuk header cetak/PDF
import { useCompanyStore } from '@/store/company-store';

// ── Data definitions ──────────────────────────────────────────────────────────

interface SubPage {
  id: string;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
}

interface SubPageGroup {
  label: string;
  items: SubPage[];
}

interface NavModule {
  id: ModuleId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Flat list of sub-pages (used when there are no sub-groups) */
  subPages?: SubPage[];
  /** Grouped sub-pages (used e.g. for Laporan) */
  subPageGroups?: SubPageGroup[];
  /** Single-item module (renders as a flat menu button, no collapsible) */
  single?: boolean;
}

const modules: NavModule[] = [
  {
    id: 'cash-bank',
    label: 'Kas & Bank',
    icon: Wallet,
    subPages: [
      { id: 'pembayaran', label: 'Pembayaran', icon: CreditCard },
      { id: 'penerimaan', label: 'Penerimaan', icon: ArrowDownToLine },
      { id: 'transfer-bank', label: 'Transfer Bank', icon: ArrowLeftRight },
      { id: 'rekonsiliasi-bank', label: 'Rekonsiliasi Bank', icon: GitCompareArrows }
    ]
  },
  {
    id: 'sales',
    label: 'Penjualan',
    icon: TrendingUp,
    subPages: [
      { id: 'penawaran', label: 'Penawaran', icon: FileText },
      { id: 'pesanan', label: 'Pesanan', icon: ClipboardList },
      { id: 'pengiriman', label: 'Pengiriman', icon: Truck },
      { id: 'invoice', label: 'Invoice', icon: Receipt },
      // Tukar Faktur / Tanda Terima (proof of receipt) — update #4, di bawah Invoice
      { id: 'tukar-faktur', label: 'Tukar Faktur', icon: FileCheck },
      { id: 'retur', label: 'Retur', icon: RotateCcw },
      // Pelunasan Piutang dipindahkan dari modul Pelunasan ke modul Penjualan
      { id: 'pelunasan-piutang', label: 'Pelunasan Piutang', icon: HandCoins }
    ]
  },
  {
    id: 'purchasing',
    label: 'Pembelian',
    icon: TrendingDown,
    subPages: [
      { id: 'pesanan', label: 'Pesanan', icon: FileText },
      { id: 'penerimaan', label: 'Penerimaan', icon: Package },
      { id: 'invoice', label: 'Invoice', icon: Receipt },
      { id: 'retur', label: 'Retur', icon: RotateCcw },
      // Pelunasan Hutang dipindahkan dari modul Pelunasan ke modul Pembelian
      { id: 'pelunasan-hutang', label: 'Pelunasan Hutang', icon: HandCoins }
    ]
  },
  {
    id: 'fixed-assets',
    label: 'Aset Tetap',
    icon: Building,
    subPages: [
      { id: 'kategori-aset', label: 'Kategori Aset', icon: Tags },
      { id: 'daftar-aset', label: 'Daftar Aset', icon: ClipboardList },
      { id: 'penyusutan', label: 'Penyusutan', icon: Scale },
      { id: 'transaksi-aset', label: 'Transaksi Aset', icon: ArrowLeftRight }
    ]
  },
  {
    id: 'inventory',
    label: 'Persediaan',
    icon: Warehouse,
    subPages: [
      { id: 'permintaan-barang', label: 'Permintaan Barang', icon: ClipboardList },
      { id: 'pemindahan-barang', label: 'Pemindahan Barang', icon: ArrowLeftRight },
      { id: 'penyesuaian', label: 'Penyesuaian', icon: Scale },
      { id: 'barang-jasa', label: 'Barang & Jasa', icon: Package },
      { id: 'gudang', label: 'Gudang', icon: Warehouse },
      { id: 'stok-kartu', label: 'Stok Kartu / Valuasi', icon: Calculator }
    ]
  },
  {
    id: 'general-ledger',
    label: 'Buku Besar',
    icon: BookOpen,
    subPages: [{ id: 'jurnal-umum', label: 'Jurnal Umum', icon: Landmark }]
  },
  {
    id: 'workflow-queue',
    label: 'Antrean Persetujuan',
    icon: ClipboardCheck,
    subPages: [{ id: 'queue', label: 'Antrean Persetujuan', icon: ClipboardCheck }],
    single: true
  },
  {
    id: 'reports',
    label: 'Laporan',
    icon: FileBarChart,
    subPageGroups: [
      {
        label: 'Laporan Keuangan',
        items: [
          { id: 'laba-rugi', label: 'Laba / Rugi', icon: TrendingUp },
          { id: 'neraca', label: 'Neraca', icon: PieChart },
          { id: 'arus-kas', label: 'Arus Kas', icon: DollarSign },
          { id: 'neraca-saldo', label: 'Neraca Saldo', icon: BarChart3 },
          { id: 'perubahan-modal', label: 'Perubahan Modal', icon: ArrowUpRight }
        ]
      },
      {
        label: 'Buku Besar',
        items: [{ id: 'rincian-buku-besar', label: 'Rincian Buku Besar', icon: BookOpen }]
      },
      {
        label: 'Piutang & Hutang',
        items: [
          { id: 'umur-piutang', label: 'Umur Piutang', icon: AlertTriangle },
          { id: 'umur-hutang', label: 'Umur Hutang', icon: AlertTriangle }
        ]
      },
      {
        label: 'Kas & Bank',
        items: [
          { id: 'mutasi-kas', label: 'Mutasi Kas', icon: Banknote },
          { id: 'mutasi-bank', label: 'Mutasi Bank', icon: FileSpreadsheet },
          { id: 'rekap-kas-bank', label: 'Rekap Kas & Bank', icon: FileBarChart }
        ]
      },
      {
        label: 'Laporan Lainnya',
        items: [
          { id: 'penutupan-periode', label: 'Penutupan Periode', icon: Lock },
          { id: 'rekonsiliasi-persediaan', label: 'Rekonsiliasi Persediaan', icon: Scale },
          { id: 'audit-persediaan', label: 'Audit Persediaan', icon: ClipboardCheck },
          { id: 'rekonsiliasi-aset', label: 'Rekonsiliasi Aset', icon: Scale },
          { id: 'rekonsiliasi-grni', label: 'GRNI vs GL', icon: Scale },
          { id: 'rekonsiliasi-cf-bs', label: 'Cash Flow vs Neraca', icon: Scale },
          { id: 'rekonsiliasi-eq-bs', label: 'Ekuitas vs Neraca', icon: Scale },
          { id: 'accounting-health', label: 'Accounting Health', icon: Activity },
          { id: 'histori-dokumen-terhapus', label: 'Histori Dokumen Terhapus', icon: Trash2 },
          { id: 'laporan-lainnya', label: 'Laporan Lainnya', icon: FileQuestion }
        ]
      }
    ]
  },
  {
    id: 'organisasi',
    label: 'Organisasi',
    icon: Building2,
    single: true
  },
  {
    id: 'settings',
    label: 'Pengaturan',
    icon: Settings,
    subPages: [
      // Update ASAHI: identitas perusahaan (logo + nama) untuk kop dokumen cetak/PDF
      { id: 'profil-perusahaan', label: 'Profil Perusahaan', icon: Building2 },
      { id: 'coa', label: 'Akun Perkiraan', icon: Layers },
      { id: 'setting-akun', label: 'Setting Akun', icon: Settings2 },
      { id: 'pelanggan', label: 'Pelanggan', icon: UserPlus },
      { id: 'supplier', label: 'Supplier', icon: Store },
      // Tahap 1: menu Barang dipindah ke modul Persediaan (tab "Barang & Jasa")
      { id: 'gudang', label: 'Gudang', icon: Warehouse },
      { id: 'kategori-barang', label: 'Kategori Barang', icon: FolderTree },
      { id: 'satuan', label: 'Satuan', icon: Ruler },
      { id: 'syarat-bayar', label: 'Syarat Pembayaran', icon: Clock },
      { id: 'pengguna', label: 'Pengguna', icon: Users },
      { id: 'karyawan', label: 'Karyawan', icon: UserCircle }
    ]
  }
];

// ── RBAC v2: pemetaan menu → kode permission view ────────────────────────────

/** Kode permission untuk modul single-button (dicek langsung kodenya). */
// Update ASAHI #5: seluruh kode kini identik dengan registry backend
// (app/services/access_registry.py) — sebelumnya 20 kode memakai nama lama
// (cash_bank.*, settlement.*, dsb.) yang tidak pernah cocok, sehingga menu
// Kas & Bank, Laporan, dsb. tersembunyi untuk semua role kecuali Super Admin.
const SINGLE_MODULE_PERMISSIONS: Record<string, string> = {
  'workflow-queue': 'workflow.queue.view',
  organisasi: 'system.organisation.view'
};

/** Kode permission subPage per modul (module-id → subPage-id → code). */
const SUBPAGE_PERMISSIONS: Record<string, Record<string, string>> = {
  'cash-bank': {
    pembayaran: 'finance.cash_payment.view',
    penerimaan: 'finance.cash_receipt.view',
    'transfer-bank': 'finance.bank_transfer.view',
    'rekonsiliasi-bank': 'finance.bank_reconciliation.view'
  },
  sales: {
    penawaran: 'sales.penawaran.view',
    pesanan: 'sales.sales_order.view',
    pengiriman: 'sales.delivery.view',
    invoice: 'sales.sales_invoice.view',
    'tukar-faktur': 'sales.tukar_faktur.view',
    retur: 'sales.sales_return.view',
    'pelunasan-piutang': 'sales.ar_settlement.view'
  },
  purchasing: {
    pesanan: 'purchase.purchase_order.view',
    penerimaan: 'purchase.goods_receipt.view',
    invoice: 'purchase.purchase_invoice.view',
    retur: 'purchase.purchase_return.view',
    'pelunasan-hutang': 'purchase.ap_settlement.view'
  },
  'fixed-assets': {
    'kategori-aset': 'master.kategori_aset.view',
    'daftar-aset': 'asset.register.view',
    penyusutan: 'asset.transaction.view',
    'transaksi-aset': 'asset.transaction.view'
  },
  inventory: {
    'permintaan-barang': 'inventory.stock_request.view',
    'pemindahan-barang': 'inventory.transfer.view',
    penyesuaian: 'inventory.adjustment.view',
    'barang-jasa': 'master.barang.view',
    gudang: 'master.gudang.view',
    'stok-kartu': 'inventory.stock.view'
  },
  'general-ledger': {
    'jurnal-umum': 'accounting.journal.view'
  },
  // Modul Laporan: seluruh subPageGroups digating satu kode (dicek sekali per modul).
  reports: {},
  settings: {
    'profil-perusahaan': 'master.company_profile.view',
    coa: 'accounting.coa.view',
    'setting-akun': 'master.setting_akun.view',
    pelanggan: 'master.pelanggan.view',
    supplier: 'master.supplier.view',
    gudang: 'master.gudang.view',
    'kategori-barang': 'master.kategori_barang.view',
    satuan: 'master.satuan.view',
    'syarat-bayar': 'master.syarat_bayar.view',
    pengguna: 'system.users.view',
    karyawan: 'master.karyawan.view'
  }
};

/** Kode permission tombol Dashboard. */
const DASHBOARD_PERMISSION = 'dashboard.operational.view';

/** Kode permission modul Laporan — salah satu cukup (dicek sekali per modul). */
const REPORTS_PERMISSIONS = ['reports.financial.view', 'reports.ledger.view', 'reports.ar_aging.view', 'reports.ap_aging.view', 'reports.cashbank.view', 'reports.inventory_report.view', 'reports.reconciliation_report.view'];

// ── Component ────────────────────────────────────────────────────────────────

export function ERPSidebar() {
  const activeModule = useTabStore((s) => {
    const active = s.tabs.find((t) => t.id === s.activeTabId);
    return active?.module || 'dashboard';
  });
  const activeSubPage = useTabStore((s) => {
    const active = s.tabs.find((t) => t.id === s.activeTabId);
    return active?.subPage || null;
  });
  const openNavTab = useTabStore((s) => s.openNavTab);
  const { user, logout } = useAuthStore();

  // ── RBAC v2: permission efektif untuk gating menu ─────────────────────────
  const permissions = useAccessStore((s) => s.permissions);
  const isSuperAdmin = useAccessStore((s) => s.isSuperAdmin);
  const loaded = useAccessStore((s) => s.loaded);
  const accessError = useAccessStore((s) => s.error);
  const fetchPermissions = useAccessStore((s) => s.fetchPermissions);

  // Restore sesi / refresh halaman: fetch permission saat sidebar mount.
  React.useEffect(() => {
    void fetchPermissions();
  }, [fetchPermissions]);

  // Update ASAHI: muat profil perusahaan sekali saat shell termuat, supaya
  // tab cetak/PDF yang dibuka kemudian sudah punya identitas siap pakai.
  const ensureCompanyProfile = useCompanyStore((s) => s.ensureLoaded);
  React.useEffect(() => {
    ensureCompanyProfile();
  }, [ensureCompanyProfile]);

  const can = React.useCallback((code: string) => isSuperAdmin || permissions.includes(code), [isSuperAdmin, permissions]);
  const canAny = React.useCallback((codes: string[]) => isSuperAdmin || codes.some((c) => permissions.includes(c)), [isSuperAdmin, permissions]);

  // Filter modul & subPage berdasarkan permission view (fail-closed).
  const visibleModules = React.useMemo(() => {
    return modules
      .map((mod): NavModule | null => {
        if (mod.id === 'reports') {
          return canAny(REPORTS_PERMISSIONS) ? mod : null;
        }
        if (mod.single) {
          const code = SINGLE_MODULE_PERMISSIONS[mod.id];
          return code && can(code) ? mod : null;
        }
        const permMap = SUBPAGE_PERMISSIONS[mod.id] ?? {};
        const subPages = (mod.subPages ?? []).filter((sp) => {
          const code = permMap[sp.id];
          return !!code && can(code);
        });
        // Modul disembunyikan bila SEMUA subPage-nya tersembunyi.
        if (subPages.length === 0) return null;
        return { ...mod, subPages };
      })
      .filter((m): m is NavModule => m !== null);
  }, [can, canAny]);

  const dashboardVisible = can(DASHBOARD_PERMISSION);
  const hasAnyMenu = dashboardVisible || visibleModules.length > 0;

  // Track which module groups are expanded.
  // A group auto-opens when it becomes the active module.
  const [openGroups, setOpenGroups] = React.useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    modules.forEach((m) => {
      initial[m.id] = m.id === activeModule;
    });
    return initial;
  });

  // Sync open state when activeModule changes from outside (e.g. breadcrumb)
  React.useEffect(() => {
    if (activeModule !== 'dashboard') {
      setOpenGroups((prev) => {
        if (!prev[activeModule]) {
          return { ...prev, [activeModule]: true };
        }
        return prev;
      });
    }
  }, [activeModule]);

  const toggleGroup = React.useCallback((id: string) => {
    setOpenGroups((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" className="pointer-events-none">
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Building2 className="size-4" />
              </div>
              <div className="flex flex-col gap-0.5 leading-none">
                <span className="font-semibold text-sm">ASAHI Books</span>
                <span className="text-[11px] text-sidebar-foreground/60">System Accounting ASAHI</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {/* ── Banner fail-closed: izin gagal dimuat ───────────────────── */}
        {accessError && (
          <SidebarGroup>
            <SidebarGroupContent>
              <div className="m-2 rounded-md border border-amber-300 bg-amber-50 p-2.5 dark:border-amber-700/60 dark:bg-amber-950/40" role="alert">
                <p className="flex items-center gap-1.5 text-xs font-medium text-amber-800 dark:text-amber-300">
                  <AlertTriangle className="size-3.5 shrink-0" />
                  Izin akses gagal dimuat — menu disembunyikan.
                </p>
                <Button variant="outline" size="sm" className="mt-2 h-8 gap-1.5" onClick={() => void fetchPermissions()}>
                  <RefreshCw className="size-3.5" /> Coba Lagi
                </Button>
              </div>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* ── Belum termuat: skeleton (hindari flash menu) ─────────────── */}
        {!loaded ? (
          <SidebarGroup>
            <SidebarGroupContent>
              <div className="space-y-4 px-2 py-2" aria-label="Memuat menu">
                <p className="text-xs text-sidebar-foreground/60">Memuat menu…</p>
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="space-y-2">
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="ml-4 h-7 w-full max-w-44" />
                    <Skeleton className="ml-4 h-7 w-full max-w-36" />
                  </div>
                ))}
              </div>
            </SidebarGroupContent>
          </SidebarGroup>
        ) : !hasAnyMenu ? (
          <SidebarGroup>
            <SidebarGroupContent>
              <p className="px-2 py-4 text-xs text-sidebar-foreground/60">Tidak ada menu yang tersedia untuk akun ini.</p>
            </SidebarGroupContent>
          </SidebarGroup>
        ) : (
          <>
            {/* ── Dashboard (gated dashboard.operational.view) ───────────── */}
            {dashboardVisible && (
              <SidebarGroup>
                <SidebarGroupContent>
                  <SidebarMenu>
                    <SidebarMenuItem>
                      <SidebarMenuButton tooltip="Dashboard" isActive={activeModule === 'dashboard'} onClick={() => openNavTab('dashboard', '', 'Dashboard')}>
                        <LayoutDashboard />
                        <span>Dashboard</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            )}

            {/* ── All other modules (permission-gated) ───────────────────── */}
            {visibleModules.map((mod) => {
              if (mod.single) {
                // Flat menu button (no collapsible)
                const sp = mod.subPages?.[0];
                const SingleIcon = mod.icon;
                return (
                  <SidebarGroup key={mod.id}>
                    <SidebarGroupContent>
                      <SidebarMenu>
                        <SidebarMenuItem>
                          <SidebarMenuButton tooltip={mod.label} isActive={activeModule === mod.id} onClick={() => openNavTab(mod.id, sp?.id || '', mod.label)}>
                            <SingleIcon className="size-4" />
                            <span>{mod.label}</span>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      </SidebarMenu>
                    </SidebarGroupContent>
                  </SidebarGroup>
                );
              }
              return (
                <Collapsible key={mod.id} open={openGroups[mod.id] ?? false} onOpenChange={() => toggleGroup(mod.id)}>
                  <SidebarGroup>
                    <SidebarGroupLabel asChild>
                      <CollapsibleTrigger className="flex w-full items-center justify-between">
                        <span className="flex items-center gap-2">
                          <mod.icon className="size-4" />
                          {mod.label}
                        </span>
                        <ChevronRight className="size-4 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                      </CollapsibleTrigger>
                    </SidebarGroupLabel>

                    <CollapsibleContent>
                      <SidebarGroupContent>
                        {/* ── Sub-pages (flat) ────────────────────────────── */}
                        {mod.subPages && mod.subPages.length > 0 && (
                          <SidebarMenu>
                            {mod.subPages.map((sp) => {
                              const SubIcon = sp.icon;
                              return (
                                <SidebarMenuItem key={sp.id}>
                                  <SidebarMenuButton isActive={activeModule === mod.id && activeSubPage === sp.id} onClick={() => openNavTab(mod.id, sp.id, sp.label)}>
                                    {SubIcon && <SubIcon className="size-4" />}
                                    <span>{sp.label}</span>
                                  </SidebarMenuButton>
                                </SidebarMenuItem>
                              );
                            })}
                          </SidebarMenu>
                        )}

                        {/* ── Grouped sub-pages (e.g. Laporan) ─────────────── */}
                        {mod.subPageGroups?.map((group) => (
                          <React.Fragment key={group.label}>
                            <SidebarMenu className="mt-3 first:mt-0">
                              <li className="text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/50 px-2 pb-1">{group.label}</li>
                              {group.items.map((sp) => {
                                const SubIcon = sp.icon;
                                return (
                                  <SidebarMenuItem key={sp.id}>
                                    <SidebarMenuButton isActive={activeModule === mod.id && activeSubPage === sp.id} onClick={() => openNavTab(mod.id, sp.id, sp.label)}>
                                      {SubIcon && <SubIcon className="size-4" />}
                                      <span>{sp.label}</span>
                                    </SidebarMenuButton>
                                  </SidebarMenuItem>
                                );
                              })}
                            </SidebarMenu>
                          </React.Fragment>
                        ))}
                      </SidebarGroupContent>
                    </CollapsibleContent>
                  </SidebarGroup>
                </Collapsible>
              );
            })}
          </>
        )}
      </SidebarContent>

      {/* ── Footer ────────────────────────────────────────────────────── */}
      <SidebarFooter className="border-t border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            {/* Expanded mode: full profile + logout button — hidden when collapsed */}
            <div className="flex flex-col gap-0.5 leading-none w-full group-data-[collapsible=icon]:hidden">
              <div className="flex items-center gap-2">
                <Avatar className="size-8 shrink-0">
                  <AvatarFallback className="bg-sidebar-accent text-sidebar-foreground text-xs font-bold">
                    {user?.namaLengkap
                      ?.split(' ')
                      .map((n) => n[0])
                      .join('')
                      .slice(0, 2)
                      .toUpperCase() || 'AD'}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium truncate block">{user?.namaLengkap || 'User'}</span>
                  <span className="text-[11px] text-sidebar-foreground/60 block">{user?.role || 'Role'}</span>
                </div>
                <button onClick={logout} className="rounded-md p-1.5 text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors" title="Keluar">
                  <LogOut className="size-4" />
                </button>
              </div>
            </div>
            {/* Collapsed mode (icon-only): avatar, click shows dropdown with logout */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="hidden group-data-[collapsible=icon]:flex items-center justify-center w-full py-2" title={user?.namaLengkap || 'User'}>
                  <Avatar className="size-8">
                    <AvatarFallback className="bg-sidebar-accent text-sidebar-foreground text-xs font-bold">
                      {user?.namaLengkap
                        ?.split(' ')
                        .map((n) => n[0])
                        .join('')
                        .slice(0, 2)
                        .toUpperCase() || 'AD'}
                    </AvatarFallback>
                  </Avatar>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="center" className="min-w-48">
                <div className="px-2 py-1.5">
                  <p className="text-sm font-medium truncate">{user?.namaLengkap || 'User'}</p>
                  <p className="text-xs text-muted-foreground truncate">{user?.role || 'Role'}</p>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={logout} className="text-destructive focus:text-destructive cursor-pointer">
                  <LogOut className="size-4 mr-2" />
                  Keluar
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
