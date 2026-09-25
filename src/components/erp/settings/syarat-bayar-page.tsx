"use client"

import { useState, useEffect, useCallback, useRef } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Plus, Search, Pencil, Trash2, Loader2, ChevronLeft, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import { useTabStore } from '@/store/tab-store'
import { FormTabShell } from '@/components/erp/form-tab-shell'

import { api, ApiError } from '@/lib/api'
import type { SyaratBayarResponse, SyaratBayarCreate, SyaratBayarUpdate } from '@/types/api'

// ─── Constants ──────────────────────────────────────────────────────────────

const PAGE_SIZE = 10

type FormMode = 'create' | 'edit'

interface FormState { nama: string; hari: string }

const emptyForm: FormState = { nama: '', hari: '' }

interface SyaratBayarPageProps {
  subPage?: string; refreshKey?: number; formMode?: string; formProps?: Record<string, unknown>
}

// ═══════════════════════════════════════════════════════════════════════════
// Form Component (rendered in tab)
// ═══════════════════════════════════════════════════════════════════════════

function SyaratBayarForm({ mode, editId, initialData }: {
  mode: FormMode; editId?: string; initialData?: FormState
}) {
  const [form, setForm] = useState<FormState>(initialData || emptyForm)
  const [submitting, setSubmitting] = useState(false)
  const activeTabId = useTabStore((s) => s.activeTabId)
  const closeTab = useTabStore((s) => s.closeTab)
  const refreshListTab = useTabStore((s) => s.refreshListTab)

  const title = mode === 'create' ? 'Tambah Syarat Bayar' : 'Edit Syarat Bayar'

  const updateForm = (key: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const handleSubmit = async () => {
    if (!form.nama.trim()) { toast.error('Nama syarat bayar wajib diisi'); return }

    setSubmitting(true)
    try {
      if (mode === 'create') {
        const payload: SyaratBayarCreate = { nama: form.nama.trim(), hari: form.hari ? parseInt(form.hari, 10) : null }
        await api.post<SyaratBayarResponse>('/master/syarat-bayar', payload)
        toast.success('Syarat bayar berhasil ditambahkan')
      } else {
        if (!editId) return
        const payload: SyaratBayarUpdate = { nama: form.nama.trim(), hari: form.hari ? parseInt(form.hari, 10) : null }
        await api.put<SyaratBayarResponse>(`/master/syarat-bayar/${editId}`, payload)
        toast.success('Syarat bayar berhasil diperbarui')
      }
      refreshListTab('settings', 'syarat-bayar')
      if (activeTabId) closeTab(activeTabId)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : (mode === 'create' ? 'Gagal menambahkan syarat bayar' : 'Gagal memperbarui syarat bayar'))
    } finally { setSubmitting(false) }
  }

  return (
    <FormTabShell title={title}>
      <Card className="max-w-4xl">
        <CardContent className="p-6 space-y-4">
          <p className="text-sm text-muted-foreground">
            {mode === 'create' ? 'Isi data di bawah untuk menambahkan syarat pembayaran baru.' : `Mengedit syarat bayar: ${form.nama}`}
          </p>

          <div className="space-y-2">
            <Label htmlFor="sb-nama">Nama Syarat Bayar</Label>
            <Input id="sb-nama" placeholder="Contoh: Net 30, Tunai, COD" value={form.nama} onChange={(e) => updateForm('nama', e.target.value)} autoFocus />
          </div>

          <div className="space-y-2">
            <Label htmlFor="sb-hari">Jangka Waktu (Hari)</Label>
            <Input id="sb-hari" type="number" min={0} placeholder="0 = Tunai / COD" value={form.hari} onChange={(e) => updateForm('hari', e.target.value)} />
            <p className="text-xs text-muted-foreground">Kosongkan atau isi 0 untuk pembayaran tunai (COD).</p>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => activeTabId && closeTab(activeTabId)} disabled={submitting}>Batal</Button>
            <Button onClick={handleSubmit} disabled={submitting} className="gap-2">
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {mode === 'create' ? 'Simpan' : 'Perbarui'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </FormTabShell>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// List Page
// ═══════════════════════════════════════════════════════════════════════════

export default function SyaratBayarPage({ refreshKey, formMode, formProps }: SyaratBayarPageProps) {
  if (formMode) {
    const isEdit = formProps?.id as string | undefined
    return (
      <SyaratBayarForm mode={isEdit ? 'edit' : 'create'} editId={isEdit} initialData={isEdit ? {
        nama: formProps?.nama as string || '',
        hari: formProps?.hari != null ? String(formProps.hari) : '',
      } : undefined} />
    )
  }
  return <SyaratBayarListContent refreshKey={refreshKey} />
}

function SyaratBayarListContent({ refreshKey }: { refreshKey?: number }) {
  const openFormTab = useTabStore((s) => s.openFormTab)

  const [data, setData] = useState<SyaratBayarResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [skip, setSkip] = useState(0)
  const [total, setTotal] = useState(0)
  const [deleteTarget, setDeleteTarget] = useState<SyaratBayarResponse | null>(null)
  const [deleting, setDeleting] = useState(false)
  const debounceTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    debounceTimer.current = setTimeout(() => { setDebouncedSearch(search) }, 300)
    return () => { if (debounceTimer.current) clearTimeout(debounceTimer.current) }
  }, [search])

  useEffect(() => { setSkip(0) }, [debouncedSearch])

  const fetchData = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await api.get<SyaratBayarResponse[]>(`/master/syarat-bayar`)
      const filtered = debouncedSearch
        ? res.filter((r) => r.nama.toLowerCase().includes(debouncedSearch.toLowerCase()) || String(r.hari ?? '').includes(debouncedSearch))
        : res
      const t = filtered.length
      setData(filtered.slice(skip, skip + PAGE_SIZE)); setTotal(t)
    } catch (err) {
      if (err instanceof ApiError) { setError(err.detail) } else { setError('Gagal memuat data syarat bayar') }
    } finally { setLoading(false) }
  }, [debouncedSearch, skip])

  useEffect(() => { fetchData() }, [fetchData, refreshKey])

  const currentPage = Math.floor(skip / PAGE_SIZE) + 1
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const hasNext = skip + PAGE_SIZE < total
  const hasPrev = skip > 0

  const executeDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await api.delete<{ message: string }>(`/master/syarat-bayar/${deleteTarget.id}`)
      toast.success(`Syarat bayar "${deleteTarget.nama}" berhasil dihapus`)
      setDeleteTarget(null); fetchData()
    } catch (err) {
      if (err instanceof ApiError) { toast.error(err.detail) } else { toast.error('Gagal menghapus syarat bayar') }
    } finally { setDeleting(false) }
  }

  const SkeletonRows = () => (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <TableRow key={i}>
          <TableCell><Skeleton className="h-4 w-24" /></TableCell>
          <TableCell><Skeleton className="h-4 w-40" /></TableCell>
          <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
          <TableCell><Skeleton className="h-8 w-16 rounded ml-auto" /></TableCell>
        </TableRow>
      ))}
    </>
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Syarat Pembayaran</h2>
          <p className="text-sm text-muted-foreground">{loading ? 'Memuat data...' : `${total} syarat pembayaran`}</p>
        </div>
        <Button size="sm" className="gap-2" onClick={() => openFormTab({ title: 'Tambah Syarat Bayar', module: 'settings', subPage: 'syarat-bayar', formKey: 'syarat-bayar-create' })}>
          <Plus className="h-4 w-4" /> Tambah Syarat Bayar
        </Button>
      </div>

      <Card><CardContent className="p-4">
        <div className="max-w-sm">
          <Label className="text-xs text-muted-foreground">Cari Nama / Hari</Label>
          <div className="relative mt-1.5">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Cari syarat bayar..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
          </div>
        </div>
      </CardContent></Card>

      {error && !loading && (
        <Card className="border-destructive"><CardContent className="p-4">
          <p className="text-sm text-destructive font-medium">{error}</p>
          <Button variant="outline" size="sm" className="mt-2" onClick={fetchData}>Coba Lagi</Button>
        </CardContent></Card>
      )}

      <Card><CardContent className="p-0">
        <div className="overflow-x-auto" style={{ maxHeight: '500px', overflowY: 'auto' }}>
          <Table>
            <TableHeader className="sticky top-0 bg-background z-10">
              <TableRow>
                <TableHead className="whitespace-nowrap">Nama</TableHead>
                <TableHead className="whitespace-nowrap text-center">Jangka Waktu (Hari)</TableHead>
                <TableHead className="whitespace-nowrap">Keterangan</TableHead>
                <TableHead className="whitespace-nowrap text-center">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (<SkeletonRows />) : data.length === 0 ? (
                <TableRow><TableCell colSpan={4} className="text-center py-12 text-muted-foreground">{debouncedSearch ? 'Tidak ada syarat bayar yang sesuai dengan pencarian.' : 'Belum ada data syarat bayar.'}</TableCell></TableRow>
              ) : (
                data.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="whitespace-nowrap font-medium">{row.nama}</TableCell>
                    <TableCell className="whitespace-nowrap text-center tabular-nums">
                      {row.hari != null ? (
                        <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">{row.hari} hari</span>
                      ) : (<span className="text-muted-foreground text-xs">-</span>)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground text-xs">
                      {row.hari === 0 ? 'Tunai / COD' : row.hari === 30 ? 'Net 30' : row.hari === 60 ? 'Net 60' : row.hari === 90 ? 'Net 90' : row.hari != null ? `Net ${row.hari}` : 'Tunai'}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-center">
                      <div className="inline-flex items-center gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openFormTab({ title: `Edit ${row.nama}`, module: 'settings', subPage: 'syarat-bayar', formKey: 'syarat-bayar-edit', formProps: { id: row.id, nama: row.nama, hari: row.hari } })} aria-label={`Edit ${row.nama}`}><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleteTarget(row)} aria-label={`Hapus ${row.nama}`}><Trash2 className="h-3.5 w-3.5" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent></Card>

      {!loading && total > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">Menampilkan {skip + 1}–{Math.min(skip + PAGE_SIZE, total)} dari {total} (Halaman {currentPage} dari {totalPages})</p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={!hasPrev} onClick={() => setSkip((s) => s - PAGE_SIZE)} className="gap-1"><ChevronLeft className="h-4 w-4" /> Sebelumnya</Button>
            <Button variant="outline" size="sm" disabled={!hasNext} onClick={() => setSkip((s) => s + PAGE_SIZE)} className="gap-1">Selanjutnya <ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus Syarat Bayar</AlertDialogTitle>
            <AlertDialogDescription>Apakah Anda yakin ingin menghapus syarat bayar <span className="font-semibold text-foreground">&quot;{deleteTarget?.nama}&quot;</span>? Data yang dihapus tidak dapat dikembalikan.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={executeDelete} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90 gap-2">{deleting && <Loader2 className="h-4 w-4 animate-spin" />} Hapus</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
