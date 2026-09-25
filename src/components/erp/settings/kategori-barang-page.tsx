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
import type { KategoriBarangResponse, KategoriBarangCreate, KategoriBarangUpdate } from '@/types/api'

// ─── Constants ──────────────────────────────────────────────────────────────

const PAGE_SIZE = 10

const statusBadge = (status: string) => {
  const cls = status === 'AKTIF' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-gray-100 text-gray-600 border-gray-200'
  return (<span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${cls}`}>{status}</span>)
}

type FormMode = 'create' | 'edit'

interface FormState { kode: string; nama: string }

const emptyForm: FormState = { kode: '', nama: '' }

interface KategoriBarangPageProps {
  subPage?: string; refreshKey?: number; formMode?: string; formProps?: Record<string, unknown>
}

// ═══════════════════════════════════════════════════════════════════════════
// Form Component (rendered in tab)
// ═══════════════════════════════════════════════════════════════════════════

function KategoriBarangForm({ mode, editId, initialData }: {
  mode: FormMode; editId?: string; initialData?: FormState
}) {
  const [form, setForm] = useState<FormState>(initialData || emptyForm)
  const [submitting, setSubmitting] = useState(false)
  const activeTabId = useTabStore((s) => s.activeTabId)
  const closeTab = useTabStore((s) => s.closeTab)
  const refreshListTab = useTabStore((s) => s.refreshListTab)

  const title = mode === 'create' ? 'Tambah Kategori Barang' : 'Edit Kategori Barang'

  const updateForm = (key: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const handleSubmit = async () => {
    if (!form.kode.trim()) { toast.error('Kode kategori wajib diisi'); return }
    if (!form.nama.trim()) { toast.error('Nama kategori wajib diisi'); return }

    setSubmitting(true)
    try {
      if (mode === 'create') {
        const payload: KategoriBarangCreate = { kode: form.kode.trim(), nama: form.nama.trim() }
        await api.post<KategoriBarangResponse>('/master/kategori-barang', payload)
        toast.success('Kategori barang berhasil ditambahkan')
      } else {
        if (!editId) return
        const payload: KategoriBarangUpdate = { kode: form.kode.trim(), nama: form.nama.trim() }
        await api.put<KategoriBarangResponse>(`/master/kategori-barang/${editId}`, payload)
        toast.success('Kategori barang berhasil diperbarui')
      }
      refreshListTab('settings', 'kategori-barang')
      if (activeTabId) closeTab(activeTabId)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : (mode === 'create' ? 'Gagal menambahkan kategori barang' : 'Gagal memperbarui kategori barang'))
    } finally { setSubmitting(false) }
  }

  return (
    <FormTabShell title={title}>
      <Card className="max-w-4xl">
        <CardContent className="p-6 space-y-4">
          <p className="text-sm text-muted-foreground">
            {mode === 'create' ? 'Isi data di bawah untuk menambahkan kategori barang baru.' : `Mengedit: ${form.kode} — ${form.nama}`}
          </p>

          <div className="space-y-2">
            <Label htmlFor="kb-kode">Kode Kategori</Label>
            <Input id="kb-kode" placeholder="Contoh: ELEKTRONIK, MAKANAN" value={form.kode} onChange={(e) => updateForm('kode', e.target.value)} autoFocus />
          </div>

          <div className="space-y-2">
            <Label htmlFor="kb-nama">Nama Kategori</Label>
            <Input id="kb-nama" placeholder="Nama kategori barang" value={form.nama} onChange={(e) => updateForm('nama', e.target.value)} />
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

export default function KategoriBarangPage({ refreshKey, formMode, formProps }: KategoriBarangPageProps) {
  if (formMode) {
    const isEdit = formProps?.id as string | undefined
    return (
      <KategoriBarangForm mode={isEdit ? 'edit' : 'create'} editId={isEdit} initialData={isEdit ? {
        kode: formProps?.kode as string || '', nama: formProps?.nama as string || '',
      } : undefined} />
    )
  }
  return <KategoriBarangListContent refreshKey={refreshKey} />
}

function KategoriBarangListContent({ refreshKey }: { refreshKey?: number }) {
  const openFormTab = useTabStore((s) => s.openFormTab)

  const [data, setData] = useState<KategoriBarangResponse[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [skip, setSkip] = useState(0)
  const [deleteTarget, setDeleteTarget] = useState<KategoriBarangResponse | null>(null)
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
      const res = await api.get<KategoriBarangResponse[]>(`/master/kategori-barang`)
      const filtered = debouncedSearch
        ? res.filter((r) => r.kode.toLowerCase().includes(debouncedSearch.toLowerCase()) || r.nama.toLowerCase().includes(debouncedSearch.toLowerCase()))
        : res
      const t = filtered.length
      setData(filtered.slice(skip, skip + PAGE_SIZE)); setTotal(t)
    } catch (err) {
      if (err instanceof ApiError) { setError(err.detail) } else { setError('Gagal memuat data kategori barang') }
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
      await api.delete<{ message: string }>(`/master/kategori-barang/${deleteTarget.id}`)
      toast.success(`Kategori "${deleteTarget.nama}" berhasil dinonaktifkan`)
      setDeleteTarget(null); fetchData()
    } catch (err) {
      if (err instanceof ApiError) { toast.error(err.detail) } else { toast.error('Gagal menghapus kategori barang') }
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
          <h2 className="text-lg font-semibold">Kategori Barang</h2>
          <p className="text-sm text-muted-foreground">{loading ? 'Memuat data...' : `${total} kategori barang`}</p>
        </div>
        <Button size="sm" className="gap-2" onClick={() => openFormTab({ title: 'Tambah Kategori', module: 'settings', subPage: 'kategori-barang', formKey: 'kategori-barang-create' })}>
          <Plus className="h-4 w-4" /> Tambah Kategori
        </Button>
      </div>

      <Card><CardContent className="p-4">
        <div className="max-w-sm">
          <Label className="text-xs text-muted-foreground">Cari Kode / Nama</Label>
          <div className="relative mt-1.5">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Cari kategori barang..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
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
                <TableHead className="whitespace-nowrap">Kode</TableHead>
                <TableHead className="whitespace-nowrap">Nama Kategori</TableHead>
                <TableHead className="whitespace-nowrap">Status</TableHead>
                <TableHead className="whitespace-nowrap text-center">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (<SkeletonRows />) : data.length === 0 ? (
                <TableRow><TableCell colSpan={4} className="text-center py-12 text-muted-foreground">{debouncedSearch ? 'Tidak ada kategori yang sesuai dengan pencarian.' : 'Belum ada data kategori barang.'}</TableCell></TableRow>
              ) : (
                data.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="whitespace-nowrap font-mono font-medium">{row.kode}</TableCell>
                    <TableCell className="whitespace-nowrap font-medium">{row.nama}</TableCell>
                    <TableCell className="whitespace-nowrap">{statusBadge(row.status)}</TableCell>
                    <TableCell className="whitespace-nowrap text-center">
                      <div className="inline-flex items-center gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openFormTab({ title: `Edit ${row.nama}`, module: 'settings', subPage: 'kategori-barang', formKey: 'kategori-barang-edit', formProps: { id: row.id, kode: row.kode, nama: row.nama } })} aria-label={`Edit ${row.nama}`}><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleteTarget(row)} aria-label={`Hapus ${row.nama}`} disabled={row.status === 'NONAKTIF'}><Trash2 className="h-3.5 w-3.5" /></Button>
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
            <AlertDialogTitle>Nonaktifkan Kategori Barang</AlertDialogTitle>
            <AlertDialogDescription>Apakah Anda yakin ingin menonaktifkan kategori <span className="font-semibold text-foreground">&quot;{deleteTarget?.nama}&quot;</span> ({deleteTarget?.kode})? Kategori yang dinonaktifkan tidak akan muncul di dropdown barang.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={executeDelete} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90 gap-2">{deleting && <Loader2 className="h-4 w-4 animate-spin" />} Nonaktifkan</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
