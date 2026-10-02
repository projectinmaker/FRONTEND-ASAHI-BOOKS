'use client';

/**
 * Dialog Import Excel reusable (Update #5).
 *
 * Alur: unduh template → pilih file .xlsx → import → hasil per baris.
 * Kontrak backend (ImportResult, camelCase):
 *   { totalBaris, sukses, gagal, errors: [{ baris, pesan }] }
 * Baris = nomor baris sheet (1 = header). File template kosong → semua 0.
 */

import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { CheckCircle2, Download, FileSpreadsheet, Loader2, Upload, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { downloadExcelFile, uploadExcelFile } from '@/lib/excel';
import type { ImportResult } from '@/types/api';

// ─── Props ─────────────────────────────────────────────────────────────────

interface ExcelImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Judul dialog, mis. "Import Barang" */
  title: string;
  /** Deskripsi singkat (opsional) — ditampilkan di bawah judul */
  description?: string;
  /** Endpoint GET unduh template, mis. '/master/barang/import-template' */
  templateEndpoint: string;
  /** Endpoint POST import (multipart field "file"), mis. '/master/barang/import' */
  importEndpoint: string;
  /**
   * Nama file fallback template (Update #12) — dipakai bila header
   * Content-Disposition tidak terbaca (mis. request lintas origin tanpa
   * expose_headers). Backend sudah mengirim nama file yang sama, jadi hasil
   * identik mana pun yang dipakai. Contoh: 'template-import-barang.xlsx'.
   */
  templateFilename?: string;
  /** Dipanggil setelah import sukses minimal 1 baris (untuk refresh list) */
  onImported?: () => void;
}

/** Stempel tanggal YYYYMMDD untuk nama file export (client-side). */
export function exportDateStamp(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}${mm}${dd}`;
}

// ─── Component ─────────────────────────────────────────────────────────────

export function ExcelImportDialog({ open, onOpenChange, title, description, templateEndpoint, importEndpoint, templateFilename = 'template-import.xlsx', onImported }: ExcelImportDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset state setiap kali dialog dibuka (sesi import baru)
  useEffect(() => {
    if (open) {
      setFile(null);
      setResult(null);
      setImporting(false);
      setDownloading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }, [open]);

  const handleDownloadTemplate = async () => {
    setDownloading(true);
    try {
      await downloadExcelFile(templateEndpoint, templateFilename);
      toast.success('Template berhasil diunduh');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal mengunduh template');
    } finally {
      setDownloading(false);
    }
  };

  const handleSelectFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0] ?? null;
    setFile(picked);
    setResult(null);
  };

  const handleImport = async () => {
    if (!file) return;
    setImporting(true);
    try {
      const res = await uploadExcelFile(importEndpoint, file);
      setResult(res);
      if (res.sukses > 0) {
        toast.success(`${res.sukses} dari ${res.totalBaris} baris berhasil diimpor`);
        onImported?.();
        // Reset pemilihan file supaya sesi berikutnya harus memilih ulang
        setFile(null);
        if (inputRef.current) inputRef.current.value = '';
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal mengimpor file');
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
            {title}
          </DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        <div className="space-y-4">
          {/* Langkah 1 — Unduh Template */}
          <div>
            <p className="text-sm font-medium">1. Unduh Template</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Unduh template Excel lalu isi data sesuai format (lihat sheet &quot;Petunjuk&quot; di dalam file).</p>
            <Button type="button" variant="outline" size="sm" className="mt-2 gap-2" onClick={handleDownloadTemplate} disabled={downloading || importing}>
              {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Unduh Template
            </Button>
          </div>

          {/* Langkah 2 — Pilih File */}
          <div>
            <p className="text-sm font-medium">2. Pilih File Excel (.xlsx)</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Pilih file yang sudah terisi data, lalu klik Import.</p>
            <input ref={inputRef} type="file" accept=".xlsx" className="hidden" onChange={handleSelectFile} aria-label="Pilih file Excel" />
            <div className="mt-2 flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => inputRef.current?.click()} disabled={importing}>
                <Upload className="h-4 w-4" />
                Pilih File
              </Button>
              {file ? (
                <span className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
                  <FileSpreadsheet className="h-4 w-4 shrink-0 text-emerald-600" />
                  <span className="truncate">{file.name}</span>
                </span>
              ) : (
                <span className="text-xs text-muted-foreground/70">Belum ada file dipilih</span>
              )}
            </div>
          </div>

          {/* Hasil Import */}
          {result && (
            <div className="space-y-2">
              {result.totalBaris === 0 ? (
                <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>Tidak ada baris data di file. Isi template dengan minimal satu baris data lalu coba lagi.</span>
                </div>
              ) : (
                <>
                  {result.sukses > 0 && (
                    <div className="flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>
                        <span className="font-semibold">{result.sukses}</span> dari <span className="font-semibold">{result.totalBaris}</span> baris berhasil diimpor.
                      </span>
                    </div>
                  )}
                  {result.gagal > 0 && (
                    <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                      <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>
                        <span className="font-semibold">{result.gagal}</span> dari <span className="font-semibold">{result.totalBaris}</span> baris gagal diimpor.
                      </span>
                    </div>
                  )}
                  {result.errors.length > 0 && (
                    <div>
                      <p className="mb-1 text-xs font-medium text-muted-foreground">Rincian error per baris:</p>
                      <div className="max-h-64 overflow-y-auto rounded-md border">
                        <ul className="divide-y">
                          {result.errors.map((e, i) => (
                            <li key={`${e.baris}-${i}`} className="flex gap-2 px-3 py-2 text-sm">
                              <span className="shrink-0 font-medium text-red-700">Baris {e.baris}</span>
                              <span className="text-muted-foreground">{e.pesan}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={importing}>
            Tutup
          </Button>
          <Button type="button" onClick={handleImport} disabled={!file || importing} className="gap-2">
            {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Import
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default ExcelImportDialog;
