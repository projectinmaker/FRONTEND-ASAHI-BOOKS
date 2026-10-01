'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { formatNumberIDR } from '@/lib/money';
import type { PurchaseInvoiceResponse } from '@/types/api';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

/** Qty retur per baris invoice — key = purchase invoice detail id. */
export type PurchaseReturnQuantities = Record<string, string>;

/**
 * Tarik data otomatis Retur Pembelian (Task 16-c2) — mirror pola
 * sales-return-source.tsx: hook memuat invoice sumber yang dipilih,
 * tabel menampilkan baris invoice dengan input qty retur.
 */
export function usePurchaseReturnSource(invoiceId: string) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ id: string; attempt: number; invoice: PurchaseInvoiceResponse | null; error: string } | null>(null);
  useEffect(() => {
    if (!invoiceId) return;
    let active = true;
    api
      .get<PurchaseInvoiceResponse>(`/pembelian/purchase-invoice/${invoiceId}`)
      .then((invoice) => {
        if (active) setResult({ id: invoiceId, attempt, invoice, error: '' });
      })
      .catch((error) => {
        if (active) setResult({ id: invoiceId, attempt, invoice: null, error: error instanceof Error ? error.message : 'Gagal memuat invoice sumber' });
      });
    return () => {
      active = false;
    };
  }, [invoiceId, attempt]);
  const current = result?.id === invoiceId && result?.attempt === attempt ? result : null;
  return { invoice: current?.invoice || null, error: current?.error || '', loading: !!invoiceId && !current, retry: () => setAttempt((value) => value + 1) };
}

export function PurchaseReturnSourceLines({ invoice, quantities, onChange }: { invoice: PurchaseInvoiceResponse; quantities: PurchaseReturnQuantities; onChange: (id: string, qty: string) => void }) {
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">Harga mengikuti baris invoice sumber. Isi qty retur (maks. qty invoice); 0 berarti tidak diretur. Batas retur diperiksa saat diproses.</p>
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Baris / Barang</TableHead>
              <TableHead>Qty Invoice</TableHead>
              <TableHead>Harga Invoice</TableHead>
              <TableHead>Qty Retur</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invoice.details.map((line, index) => (
              <TableRow key={line.id}>
                <TableCell>
                  {index + 1}. {line.barang?.nama || line.barangId}
                </TableCell>
                <TableCell>{line.qty}</TableCell>
                <TableCell>
                  <Input aria-label={`Harga invoice baris ${index + 1}`} value={formatNumberIDR(line.harga)} readOnly className="h-8 text-right" />
                </TableCell>
                <TableCell>
                  <Input aria-label={`Qty retur baris ${index + 1}`} type="number" min={0} max={line.qty} step={1} value={quantities[line.id] ?? '0'} onChange={(event) => onChange(line.id, event.target.value)} className="h-8" />
                </TableCell>
              </TableRow>
            ))}
            {!invoice.details.length && (
              <TableRow>
                <TableCell colSpan={4}>Invoice ini tidak memiliki detail barang.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
