'use client';

import * as React from 'react';
import { Building2, LayoutDashboard, Wallet, TrendingDown, Building, Warehouse, BookOpen, FileBarChart, Settings, Settings2, ChevronRight, CreditCard, ArrowDownToLine, ArrowLeftRight, FileText, Truck, Receipt, RotateCcw, ClipboardList, Scale, Tags, Package, FolderTree, Layers, Landmark, TrendingUp, PieChart, DollarSign, Banknote, FileSpreadsheet, Users, UserCircle, FileQuestion, LogOut, UserPlus, Store, Clock, Ruler, BarChart3, AlertTriangle, ArrowUpRight, Lock, GitCompareArrows, Calculator, ClipboardCheck, HandCoins, Activity } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarRail } from '@/components/ui/sidebar';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { useERPStore, type ModuleId } from '@/store/erp-store';
import { useTabStore } from '@/store/tab-store';
import { useAuthStore } from '@/store/auth-store';
import { useAccessStore } from '@/store/access-store';

// ── Data definitions ──────────────────────────────────────────────────────────

// ── RBAC v2 (Task 21-g): mapping statis MenuId/subPageId → permission code ────
// Menu frontend memang statis, jadi tabel ini dikelola sebagai konstanta.
// Sumber kode permission: registry backend (GET /access/permissions).

/** Permission VIEW untuk subPage (key: "moduleId/subPageId") */
const SUB_PAGE_PERMISSIONS: Record<string, string> = {
  // Kas & Bank
  'cash-bank/pembayaran': 'finance.cash_payment.view',
  'cash-bank/penerimaan': 'finance.cash_receipt.view',
  'cash-bank/transfer-bank': 'finance.bank_transfer.view',
  'cash-bank/rekonsiliasi-bank': 'finance.bank_reconciliation.view',
  // Penjualan
  'sales/pesanan': 'sales.sales_order.view',
  'sales/pengiriman': 'sales.delivery.view',
  'sales/invoice': 'sales.sales_invoice.view',
  'sales/retur': 'sales.sales_return.view',
  'sales/pelunasan-piutang': 'sales.ar_settlement.view',
  // Pembelian
  'purchasing/pesanan': 'purchase.purchase_order.view',
  'purchasing/penerimaan': 'purchase.goods_receipt.view',
  'purchasing/invoice': 'purchase.purchase_invoice.view',
  'purchasing/retur': 'purchase.purchase_return.view',
  'purchasing/pelunasan-hutang': 'purchase.ap_settlement.view',
  // Aset Tetap
  'fixed-assets/kategori-aset': 'master.kategori_aset.view',
  'fixed-assets/daftar-aset': 'asset.register.view',
  'fixed-assets/penyusutan': 'asset.transaction.view',
  'fixed-assets/transaksi-aset': 'asset.transaction.view',
  // Persediaan
  'inventory/permintaan-barang': 'inventory.stock_request.view',
  'inventory/pemindahan-barang': 'inventory.transfer.view',
  'inventory/penyesuaian': 'inventory.adjustment.view',
  'inventory/barang-jasa': 'master.barang.view',
  'inventory/gudang': 'master.gudang.view',
  'inventory/stok-kartu': 'inventory.stock.view',
  // Buku Besar
  'general-ledger/jurnal-umum': 'accounting.journal.view',
  // Antrean Persetujuan
  'workflow-queue/queue': 'workflow.queue.view',
  // Laporan — Laporan Keuangan
  'reports/laba-rugi': 'reports.financial.view',
  'reports/neraca': 'reports.financial.view',
  'reports/arus-kas': 'reports.financial.view',
  'reports/neraca-saldo': 'reports.financial.view',
  'reports/perubahan-modal': 'reports.financial.view',
  // Laporan — Buku Besar
  'reports/rincian-buku-besar': 'reports.ledger.view',
  // Laporan — Piutang & Hutang
  'reports/umur-piutang': 'reports.ar_aging.view',
  'reports/umur-hutang': 'reports.ap_aging.view',
  // Laporan — Kas & Bank
  'reports/mutasi-kas': 'reports.cashbank.view',
  'reports/mutasi-bank': 'reports.cashbank.view',
  'reports/rekap-kas-bank': 'reports.cashbank.view',
  // Laporan — Lainnya
  'reports/penutupan-periode': 'accounting.period.view',
  'reports/rekonsiliasi-persediaan': 'reports.inventory_report.view',
  'reports/audit-persediaan': 'reports.inventory_report.view',
  'reports/rekonsiliasi-aset': 'asset.reconciliation.view',
  'reports/rekonsiliasi-grni': 'reports.reconciliation_report.view',
  'reports/rekonsiliasi-cf-bs': 'reports.reconciliation_report.view',
  'reports/rekonsiliasi-eq-bs': 'reports.reconciliation_report.view',
  'reports/accounting-health': 'reports.reconciliation_report.view',
  'reports/laporan-lainnya': 'reports.reconciliation_report.view',
  // Pengaturan
  'settings/coa': 'accounting.coa.view',
  'settings/setting-akun': 'master.setting_akun.view',
  'settings/pelanggan': 'master.pelanggan.view',
  'settings/supplier': 'master.supplier.view',
  'settings/gudang': 'master.gudang.view',
  'settings/kategori-barang': 'master.kategori_barang.view',
  'settings/satuan': 'master.satuan.view',
  'settings/syarat-bayar': 'master.syarat_bayar.view',
  'settings/pengguna': 'system.users.view',
  'settings/karyawan': 'master.karyawan.view'
};

/** Permission VIEW untuk modul single (tanpa subPage) */
const MODULE_PERMISSIONS: Record<string, string> = {
  organisasi: 'system.organisation.view'
};

/** Ambil permission code sebuah subPage (undefined = tidak digating) */
function subPagePermission(moduleId: string, subPageId: string): string | undefined {
  return SUB_PAGE_PERMISSIONS[`${moduleId}/${subPageId}`];
}

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
      { id: 'pesanan', label: 'Pesanan', icon: FileText },
      { id: 'pengiriman', label: 'Pengiriman', icon: Truck },
      { id: 'invoice', label: 'Invoice', icon: Receipt },
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

  // ── RBAC v2: effective permissions untuk gating menu ────────────────────
  const accessLoaded = useAccessStore((s) => s.loaded);
  const accessLoading = useAccessStore((s) => s.loading);
  const accessError = useAccessStore((s) => s.error);
  const accessPermissions = useAccessStore((s) => s.permissions);
  const accessIsSuperAdmin = useAccessStore((s) => s.isSuperAdmin);
  const can = useAccessStore((s) => s.can);
  const fetchPermissions = useAccessStore((s) => s.fetchPermissions);

  // Muat permissions saat mount (restore sesi / refresh halaman)
  React.useEffect(() => {
    const s = useAccessStore.getState();
    if (!s.loaded && !s.loading) void s.fetchPermissions();
  }, []);

  // Filter modul & subPage berdasarkan permission VIEW (fail-closed)
  const visibleModules = React.useMemo(() => {
    return modules
      .map((mod) => {
        if (mod.single) {
          const code = mod.subPages?.[0] ? subPagePermission(mod.id, mod.subPages[0].id) : MODULE_PERMISSIONS[mod.id];
          return code && !can(code) ? null : mod;
        }
        if (mod.subPages) {
          const subPages = mod.subPages.filter((sp) => {
            const code = subPagePermission(mod.id, sp.id);
            return !code || can(code);
          });
          if (subPages.length === 0) return null;
          return { ...mod, subPages };
        }
        if (mod.subPageGroups) {
          const groups = mod.subPageGroups
            .map((g) => ({
              ...g,
              items: g.items.filter((sp) => {
                const code = subPagePermission(mod.id, sp.id);
                return !code || can(code);
              })
            }))
            .filter((g) => g.items.length > 0);
          if (groups.length === 0) return null;
          return { ...mod, subPageGroups: groups };
        }
        return mod;
      })
      .filter((m): m is NavModule => m !== null);
    // permissions & isSuperAdmin sebagai deps reaktif (can membaca state via get())
  }, [can, accessPermissions, accessIsSuperAdmin]);

  const hasAnyMenu = can('dashboard.operational.view') || visibleModules.length > 0;

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

  // ── RBAC v2: jangan bocorkan menu sebelum permissions termuat ──────────
  if (!accessLoaded) {
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
          <SidebarGroup>
            <SidebarGroupContent>
              <div className="flex items-center gap-2 px-2 py-2">
                {accessLoading ? (
                  <>
                    <span className="text-xs text-sidebar-foreground/60">Memuat menu…</span>
                    <span className="inline-block size-3 animate-pulse rounded-full bg-sidebar-accent-foreground/30" />
                  </>
                ) : (
                  <span className="text-xs text-sidebar-foreground/60">Menyiapkan menu…</span>
                )}
              </div>
              <div className="space-y-2 px-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-7 w-full bg-sidebar-accent opacity-60" />
                ))}
              </div>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarRail />
      </Sidebar>
    );
  }

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
        {/* ── RBAC v2: gagal memuat permissions (fail-closed + retry) ── */}
        {accessError && (
          <SidebarGroup>
            <SidebarGroupContent>
              <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2.5 mx-2">
                <p className="text-xs font-medium text-destructive">{accessError}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">Menu disembunyikan demi keamanan.</p>
                <Button variant="outline" size="sm" className="mt-2 h-7 gap-1.5" onClick={() => void fetchPermissions()} disabled={accessLoading}>
                  {accessLoading ? <span className="inline-block size-3 animate-pulse rounded-full bg-muted-foreground/40" /> : null}
                  Coba Lagi
                </Button>
              </div>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* ── Dashboard (gated: dashboard.operational.view) ──────────── */}
        {can('dashboard.operational.view') && (
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

        {/* ── Info bila tidak ada menu sama sekali untuk akun ini ────── */}
        {!accessError && !hasAnyMenu && (
          <SidebarGroup>
            <SidebarGroupContent>
              <p className="px-2 py-2 text-xs text-sidebar-foreground/60">Tidak ada menu yang tersedia untuk akun ini.</p>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* ── All other modules (filtered by permission) ─────────────── */}
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
