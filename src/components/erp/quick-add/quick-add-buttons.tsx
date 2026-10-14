'use client';

// ═════════════════════════════════════════════════════════════════════════════
// QUICK ADD — tombol pemicu (Update #007).
// Tombol "+ Tambah" kecil di samping picker master data pada form transaksi.
// Gate izin RBAC: tombol HANYA tampil bila user punya izin create entity
// terkait (super-admin otomatis lolos). Klik → buka dialog quick-add →
// simpan → onCreated(entity baru) dipanggil agar form mem-refresh opsi &
// auto-select.
// ═════════════════════════════════════════════════════════════════════════════

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useAccessStore } from '@/store/access-store';
import { QuickAddPelangganDialog, QuickAddSupplierDialog, QuickAddBarangDialog, QuickAddGudangDialog, QuickAddKategoriDialog, QuickAddSatuanDialog, QuickAddSyaratBayarDialog } from './quick-add-dialogs';
import type { PelangganResponse, SupplierResponse, BarangResponse, GudangResponse, KategoriBarangResponse, SatuanResponse, SyaratBayarResponse } from '@/types/api';

interface QuickAddButtonProps<T> {
  /** Dipanggil setelah entity baru berhasil disimpan (response lengkap dengan id). */
  onCreated: (created: T) => void;
  /** Label tombol (mode normal, default "Tambah"). Mode compact hanya ikon +. */
  label?: string;
  /** Mode sel tabel: tombol ikon +/- 8x8 agar muat di cell. */
  compact?: boolean;
  disabled?: boolean;
  /** Tooltip/aria-label tombol. */
  title?: string;
  className?: string;
}

function TriggerButton({ label = 'Tambah', compact = false, disabled, title, className, onClick }: { label?: string; compact?: boolean; disabled?: boolean; title?: string; className?: string; onClick: () => void }) {
  if (compact) {
    return (
      <Button type="button" variant="outline" size="icon" className={cn('h-8 w-8 shrink-0', className)} disabled={disabled} onClick={onClick} title={title || `Tambah ${label}`} aria-label={title || `Tambah ${label}`}>
        <Plus className="h-4 w-4" />
      </Button>
    );
  }
  return (
    <Button type="button" variant="outline" size="sm" className={cn('h-9 shrink-0', className)} disabled={disabled} onClick={onClick} title={title}>
      <Plus className="h-3.5 w-3.5" />
      {label}
    </Button>
  );
}

export function QuickAddPelangganButton({ onCreated, label = 'Tambah', compact, disabled, title, className }: QuickAddButtonProps<PelangganResponse>) {
  const can = useAccessStore((s) => s.can('master.pelanggan.create'));
  const [open, setOpen] = useState(false);
  if (!can) return null;
  return (
    <>
      <TriggerButton label={label} compact={compact} disabled={disabled} title={title || 'Tambah pelanggan baru'} className={className} onClick={() => setOpen(true)} />
      <QuickAddPelangganDialog open={open} onOpenChange={setOpen} onCreated={onCreated} />
    </>
  );
}

export function QuickAddSupplierButton({ onCreated, label = 'Tambah', compact, disabled, title, className }: QuickAddButtonProps<SupplierResponse>) {
  const can = useAccessStore((s) => s.can('master.supplier.create'));
  const [open, setOpen] = useState(false);
  if (!can) return null;
  return (
    <>
      <TriggerButton label={label} compact={compact} disabled={disabled} title={title || 'Tambah supplier baru'} className={className} onClick={() => setOpen(true)} />
      <QuickAddSupplierDialog open={open} onOpenChange={setOpen} onCreated={onCreated} />
    </>
  );
}

export function QuickAddBarangButton({ onCreated, label = 'Tambah', compact, disabled, title, className }: QuickAddButtonProps<BarangResponse>) {
  const can = useAccessStore((s) => s.can('master.barang.create'));
  const [open, setOpen] = useState(false);
  if (!can) return null;
  return (
    <>
      <TriggerButton label={label} compact={compact} disabled={disabled} title={title || 'Tambah barang baru'} className={className} onClick={() => setOpen(true)} />
      <QuickAddBarangDialog open={open} onOpenChange={setOpen} onCreated={onCreated} />
    </>
  );
}

export function QuickAddGudangButton({ onCreated, label = 'Tambah', compact, disabled, title, className }: QuickAddButtonProps<GudangResponse>) {
  const can = useAccessStore((s) => s.can('master.gudang.create'));
  const [open, setOpen] = useState(false);
  if (!can) return null;
  return (
    <>
      <TriggerButton label={label} compact={compact} disabled={disabled} title={title || 'Tambah gudang baru'} className={className} onClick={() => setOpen(true)} />
      <QuickAddGudangDialog open={open} onOpenChange={setOpen} onCreated={onCreated} />
    </>
  );
}

export function QuickAddKategoriButton({ onCreated, label = 'Tambah', compact, disabled, title, className }: QuickAddButtonProps<KategoriBarangResponse>) {
  const can = useAccessStore((s) => s.can('master.kategori_barang.create'));
  const [open, setOpen] = useState(false);
  if (!can) return null;
  return (
    <>
      <TriggerButton label={label} compact={compact} disabled={disabled} title={title || 'Tambah kategori baru'} className={className} onClick={() => setOpen(true)} />
      <QuickAddKategoriDialog open={open} onOpenChange={setOpen} onCreated={onCreated} />
    </>
  );
}

export function QuickAddSatuanButton({ onCreated, label = 'Tambah', compact, disabled, title, className }: QuickAddButtonProps<SatuanResponse>) {
  const can = useAccessStore((s) => s.can('master.satuan.create'));
  const [open, setOpen] = useState(false);
  if (!can) return null;
  return (
    <>
      <TriggerButton label={label} compact={compact} disabled={disabled} title={title || 'Tambah satuan baru'} className={className} onClick={() => setOpen(true)} />
      <QuickAddSatuanDialog open={open} onOpenChange={setOpen} onCreated={onCreated} />
    </>
  );
}

export function QuickAddSyaratBayarButton({ onCreated, label = 'Tambah', compact, disabled, title, className }: QuickAddButtonProps<SyaratBayarResponse>) {
  const can = useAccessStore((s) => s.can('master.syarat_bayar.create'));
  const [open, setOpen] = useState(false);
  if (!can) return null;
  return (
    <>
      <TriggerButton label={label} compact={compact} disabled={disabled} title={title || 'Tambah syarat bayar baru'} className={className} onClick={() => setOpen(true)} />
      <QuickAddSyaratBayarDialog open={open} onOpenChange={setOpen} onCreated={onCreated} />
    </>
  );
}
