'use client';

// ─────────────────────────────────────────────────────────────────────────────
// ExcelTools — tombol Export & Import Excel untuk master data
// (Pelanggan / Supplier / Gudang — Update #9).
//
// Export  : GET  /master/{entity}/export        → unduh .xlsx (nama dari server)
// Template: GET  /master/{entity}/import-template (dari dalam dialog import)
// Import  : POST /master/{entity}/import        → ringkasan per baris
//           (totalBaris/sukses/gagal + daftar error; error satu baris tidak
//           menghentikan baris lain — jalur create sama dengan POST /{entity})
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Download, FileSpreadsheet, Loader2, Upload, CheckCircle2, XCircle, Info } from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError, downloadFile, postForm } from '@/lib/api';
import type { ImportResult } from '@/types/api';

type ExcelEntity = 'pelanggan' | 'supplier' | 'gudang';

const ENTITY_LABEL: Record<ExcelEntity, string> = {
  pelanggan: 'Pelanggan',
  supplier: 'Supplier',
  gudang: 'Gudang'
};

interface ExcelToolsProps {
  entity: ExcelEntity;
  /** Dipanggil setelah import sukses — halaman induk me-refresh daftar. */
  onImported: () => void;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

export function ExcelTools({ entity, onImported }: ExcelToolsProps) {
  const label = ENTITY_LABEL[entity];
  const exportUrl = `/master/${entity}/export`;
  const templateUrl = `/master/${entity}/import-template`;
  const importUrl = `/master/${entity}/import`;

  // ── Export ──
  const [exporting, setExporting] = useState(false);

  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      const filename = await downloadFile(exportUrl, `${entity}.xlsx`);
      toast.success(`Export ${label} berhasil`, { description: `File "${filename}" telah diunduh.` });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : `Gagal export ${label}`);
    } finally {
      setExporting(false);
    }
  }, [exportUrl, label, entity]);

  // ── Import dialog ──
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset state setiap kali dialog dibuka
  useEffect(() => {
    if (open) {
      setFile(null);
      setResult(null);
    }
  }, [open]);

  const handleDownloadTemplate = useCallback(async () => {
    try {
      const filename = await downloadFile(templateUrl, `template-import-${entity}.xlsx`);
      toast.success('Template siap diisi', { description: `File "${filename}" telah diunduh. Isi sheet "Data", lalu unggah di sini.` });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : 'Gagal mengunduh template');
    }
  }, [templateUrl, entity]);

  const handleUpload = useCallback(async () => {
    if (!file) return;
    setUploading(true);
    setResult(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await postForm<ImportResult>(importUrl, form);
      setResult(res);
      if (res.gagal === 0) {
        toast.success(`Import ${label} selesai`, { description: `${res.sukses} baris berhasil.` });
      } else {
        toast.warning(`Import ${label} selesai dengan catatan`, { description: `${res.sukses} berhasil · ${res.gagal} gagal — periksa daftar error.` });
      }
      if (res.sukses > 0) onImported();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : `Gagal import ${label}`);
    } finally {
      setUploading(false);
    }
  }, [file, importUrl, label, onImported]);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] || null;
    if (f && !/\.xlsx$/i.test(f.name)) {
      toast.error('File harus berformat .xlsx');
      e.target.value = '';
      setFile(null);
      return;
    }
    setFile(f);
    setResult(null);
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" className="gap-2" onClick={handleExport} disabled={exporting}>
          {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Export Excel
        </Button>
        <Button variant="outline" size="sm" className="gap-2" onClick={() => setOpen(true)}>
          <Upload className="h-4 w-4" />
          Import Excel
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader className="text-left">
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
              Import {label} (Excel)
            </DialogTitle>
            <DialogDescription>
              Baris dengan Kode &amp; Nama kosong dilewati. Error satu baris tidak menghentikan baris lain — {entity === 'supplier' ? 'Supplier Type wajib diisi (COMPANY / INDIVIDUAL). ' : ''}Akun {entity === 'supplier' ? 'hutang' : entity === 'pelanggan' ? 'piutang' : ''}
              {entity !== 'gudang' ? ' dibuat otomatis untuk data baru. ' : ''}Urutan kolom bebas (dibaca berdasar nama kolom).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Langkah 1 — template */}
            <div className="rounded-lg border p-3 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">1. Unduh template</p>
                  <p className="text-xs text-muted-foreground">Sheet “Data” berisi header kolom; sheet “Petunjuk” menjelaskan tiap kolom.</p>
                </div>
                <Button variant="outline" size="sm" className="gap-2" onClick={handleDownloadTemplate}>
                  <FileSpreadsheet className="h-4 w-4" />
                  Unduh Template
                </Button>
              </div>
            </div>

            {/* Langkah 2 — unggah */}
            <div className="space-y-2">
              <div className="flex items-baseline justify-between">
                <Label htmlFor={`excel-import-${entity}`} className="text-sm font-medium">
                  2. Pilih file .xlsx hasil isian
                </Label>
                {file && (
                  <span className="text-xs text-muted-foreground truncate max-w-[240px]" title={file.name}>
                    {file.name} · {formatBytes(file.size)}
                  </span>
                )}
              </div>
              <Input id={`excel-import-${entity}`} ref={fileInputRef} type="file" accept=".xlsx" onChange={onFileChange} disabled={uploading} />
            </div>

            {/* Hasil import */}
            {result && (
              <div className="space-y-2 rounded-lg border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="border-slate-300 bg-slate-50 text-slate-700">
                    Total: {result.totalBaris}
                  </Badge>
                  <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
                    <CheckCircle2 className="mr-1 h-3 w-3" /> Sukses: {result.sukses}
                  </Badge>
                  {result.gagal > 0 && (
                    <Badge variant="outline" className="border-rose-200 bg-rose-50 text-rose-700">
                      <XCircle className="mr-1 h-3 w-3" /> Gagal: {result.gagal}
                    </Badge>
                  )}
                </div>
                {result.errors.length > 0 && (
                  <div className="max-h-48 overflow-y-auto rounded-md border bg-muted/30 p-2" data-testid="import-errors">
                    <ul className="space-y-1">
                      {result.errors.map((e, i) => (
                        <li key={`${e.baris}-${i}`} className="flex gap-2 text-xs">
                          <span className="shrink-0 font-mono text-muted-foreground">Baris {e.baris}:</span>
                          <span className="text-destructive">{e.pesan}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {result.gagal === 0 && (
                  <Alert>
                    <CheckCircle2 className="h-4 w-4" />
                    <AlertDescription>Semua baris berhasil. Daftar {label.toLowerCase()} diperbarui otomatis.</AlertDescription>
                  </Alert>
                )}
              </div>
            )}

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="outline" onClick={() => setOpen(false)} disabled={uploading}>
                Tutup
              </Button>
              <Button onClick={handleUpload} disabled={!file || uploading} className="gap-2">
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                Unggah &amp; Import
              </Button>
            </div>

            <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
              <Info className="mt-0.5 h-3 w-3 shrink-0" />
              Duplikat kode dengan data aktif akan ditolak per baris; data nonaktif dengan kode sama otomatis diaktifkan kembali.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
