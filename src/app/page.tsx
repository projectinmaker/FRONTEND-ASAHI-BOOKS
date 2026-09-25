'use client';

import { useState, useEffect } from 'react';
import { useTabStore } from '@/store/tab-store';
import { useAuthStore } from '@/store/auth-store';
import { ERPSidebar } from '@/components/erp/erp-sidebar';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb';
import { TabBar } from '@/components/erp/tab-bar';
import dynamic from 'next/dynamic';
import LoginPage from '@/components/erp/login-page';

// Dynamic imports for all modules
const Dashboard = dynamic(() => import('@/components/erp/dashboard'), { ssr: false });
const CashBank = dynamic(() => import('@/components/erp/cash-bank'), { ssr: false });
const Sales = dynamic(() => import('@/components/erp/sales'), { ssr: false });
const Purchasing = dynamic(() => import('@/components/erp/purchasing'), { ssr: false });
const FixedAssets = dynamic(() => import('@/components/erp/fixed-assets'), { ssr: false });
const Inventory = dynamic(() => import('@/components/erp/inventory'), { ssr: false });
const GeneralLedger = dynamic(() => import('@/components/erp/general-ledger'), { ssr: false });
const Reports = dynamic(() => import('@/components/erp/reports'), { ssr: false });
const Organisasi = dynamic(() => import('@/components/erp/organisasi'), { ssr: false });
const Settings = dynamic(() => import('@/components/erp/settings'), { ssr: false });
const WorkflowQueue = dynamic(() => import('@/components/erp/workflow-queue'), { ssr: false });

const moduleLabels: Record<string, string> = {
  dashboard: 'Dashboard',
  'cash-bank': 'Kas & Bank',
  sales: 'Penjualan',
  purchasing: 'Pembelian',
  'fixed-assets': 'Aset Tetap',
  inventory: 'Persediaan',
  'general-ledger': 'Buku Besar',
  'workflow-queue': 'Antrean Persetujuan',
  reports: 'Laporan',
  organisasi: 'Organisasi',
  settings: 'Pengaturan'
};

const subPageLabels: Record<string, string> = {
  // Kas & Bank
  pembayaran: 'Pembayaran',
  penerimaan: 'Penerimaan',
  'transfer-bank': 'Transfer Bank',
  'rekonsiliasi-bank': 'Rekonsiliasi Bank',
  // Penjualan / Pembelian
  pesanan: 'Pesanan',
  pengiriman: 'Pengiriman',
  invoice: 'Invoice',
  retur: 'Retur',
  // Pelunasan (kini di bawah Penjualan / Pembelian)
  'pelunasan-piutang': 'Pelunasan Piutang',
  'pelunasan-hutang': 'Pelunasan Hutang',
  // Aset Tetap
  'kategori-aset': 'Kategori Aset',
  'daftar-aset': 'Daftar Aset',
  penyusutan: 'Penyusutan',
  // Persediaan
  'permintaan-barang': 'Permintaan Barang',
  'pemindahan-barang': 'Pemindahan Barang',
  penyesuaian: 'Penyesuaian',
  'barang-jasa': 'Barang & Jasa',
  gudang: 'Gudang',
  'stok-kartu': 'Stok Kartu / Valuasi',
  // Buku Besar
  'jurnal-umum': 'Jurnal Umum',
  // Laporan
  'laba-rugi': 'Laba / Rugi',
  neraca: 'Neraca',
  'arus-kas': 'Arus Kas',
  'neraca-saldo': 'Neraca Saldo',
  'perubahan-modal': 'Perubahan Modal',
  'rincian-buku-besar': 'Rincian Buku Besar',
  'umur-piutang': 'Umur Piutang',
  'umur-hutang': 'Umur Hutang',
  'mutasi-kas': 'Mutasi Kas',
  'mutasi-bank': 'Mutasi Bank',
  'rekap-kas-bank': 'Rekap Kas & Bank',
  'penutupan-periode': 'Penutupan Periode',
  'rekonsiliasi-persediaan': 'Rekonsiliasi Persediaan',
  'audit-persediaan': 'Audit Persediaan',
  'laporan-lainnya': 'Laporan Lainnya',
  // Pengaturan
  coa: 'Akun Perkiraan',
  'setting-akun': 'Setting Akun',
  pelanggan: 'Pelanggan',
  supplier: 'Supplier',
  barang: 'Barang',
  pengguna: 'Pengguna',
  karyawan: 'Karyawan',
  'kategori-barang': 'Kategori Barang',
  satuan: 'Satuan',
  'syarat-bayar': 'Syarat Pembayaran'
};

// ═══════════════════════════════════════════════════════════════════════════
// Module Content Renderer
// ═══════════════════════════════════════════════════════════════════════════

function ModuleContent({ moduleId, subPage, refreshKey, formMode, formProps }: { moduleId: string; subPage?: string; refreshKey?: number; formMode?: string; formProps?: Record<string, unknown> }) {
  switch (moduleId) {
    case 'dashboard':
      return <Dashboard />;
    case 'cash-bank':
      return <CashBank subPage={subPage} refreshKey={refreshKey} formMode={formMode} formProps={formProps} />;
    case 'sales':
      return <Sales subPage={subPage} refreshKey={refreshKey} formMode={formMode} formProps={formProps} />;
    case 'purchasing':
      return <Purchasing subPage={subPage} refreshKey={refreshKey} formMode={formMode} formProps={formProps} />;
    case 'fixed-assets':
      return <FixedAssets subPage={subPage} refreshKey={refreshKey} formMode={formMode} formProps={formProps} />;
    case 'inventory':
      return <Inventory subPage={subPage} refreshKey={refreshKey} formMode={formMode} formProps={formProps} />;
    case 'general-ledger':
      return <GeneralLedger subPage={subPage} refreshKey={refreshKey} formMode={formMode} formProps={formProps} />;
    case 'reports':
      return <Reports subPage={subPage} refreshKey={refreshKey} formMode={formMode} formProps={formProps} />;
    case 'organisasi':
      return <Organisasi subPage={subPage} />;
    case 'workflow-queue':
      return <WorkflowQueue />;
    case 'settings':
      return <Settings subPage={subPage} refreshKey={refreshKey} formMode={formMode} formProps={formProps} />;
    default:
      return <Dashboard />;
  }
}

export default function HomePage() {
  const { isAuthenticated } = useAuthStore();
  const tabs = useTabStore((s) => s.tabs);
  const activeTabId = useTabStore((s) => s.activeTabId);
  const activeTab = tabs.find((t) => t.id === activeTabId);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return null;
  }

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  // Breadcrumb from active tab
  const breadcrumbModule = activeTab?.module || 'dashboard';
  const breadcrumbSubPage = activeTab?.subPage;
  const moduleLabel = moduleLabels[breadcrumbModule] || breadcrumbModule;
  const subPageLabel = breadcrumbSubPage ? subPageLabels[breadcrumbSubPage] || breadcrumbSubPage : null;

  // Compute refreshKey for list tabs
  const refreshKey = activeTab?.module && activeTab?.subPage ? useTabStore.getState().refreshKeys[`${activeTab.module}:${activeTab.subPage}`] : undefined;

  return (
    <SidebarProvider>
      <ERPSidebar />
      <SidebarInset className="flex flex-col">
        {/* Header */}
        <header className="flex h-12 shrink-0 items-center gap-2 border-b bg-white px-4">
          <SidebarTrigger className="-ml-1" />
          <Breadcrumb>
            <BreadcrumbList>
              {breadcrumbModule === 'dashboard' && !breadcrumbSubPage ? (
                <BreadcrumbItem>
                  <BreadcrumbPage>Dashboard</BreadcrumbPage>
                </BreadcrumbItem>
              ) : (
                <>
                  <BreadcrumbItem>
                    <BreadcrumbLink
                      href="#"
                      onClick={(e) => {
                        e.preventDefault();
                        useTabStore.getState().openNavTab(breadcrumbModule, breadcrumbSubPage || '', moduleLabel);
                      }}>
                      {moduleLabel}
                    </BreadcrumbLink>
                  </BreadcrumbItem>
                  {subPageLabel && (
                    <>
                      <BreadcrumbSeparator />
                      <BreadcrumbItem>
                        <BreadcrumbPage>{subPageLabel}</BreadcrumbPage>
                      </BreadcrumbItem>
                    </>
                  )}
                </>
              )}
            </BreadcrumbList>
          </Breadcrumb>
        </header>

        {/* Tab Bar */}
        <TabBar />

        {/* Main Content */}
        <main className="flex-1 overflow-hidden">{activeTab && <ModuleContent moduleId={activeTab.module} subPage={activeTab.subPage} refreshKey={refreshKey} formMode={activeTab.tabType === 'form' ? activeTab.formKey : undefined} formProps={activeTab.formProps} />}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
