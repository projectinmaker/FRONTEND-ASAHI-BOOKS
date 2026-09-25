'use client';

import { useEffect, useId, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { loadInvoiceTypeSuggestions } from '@/lib/invoice-documents';

// Backend exposes invoice_type as an optional string, without an enum/metadata endpoint.
// Values from existing responses are suggestions, not an exhaustive validation list.
export function InvoiceTypeField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const id = useId();
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ values: string[]; error: string } | null>(null);
  useEffect(() => {
    let active = true;
    loadInvoiceTypeSuggestions().then(values => { if (active) setResult({ values, error: '' }); })
      .catch(error => { if (active) setResult({ values: [], error: error instanceof Error ? error.message : 'Gagal memuat saran tipe invoice' }); });
    return () => { active = false; };
  }, [attempt]);
  return <div className="space-y-1.5">
    <Label htmlFor={id} className="text-xs font-medium">Tipe Invoice (opsional)</Label>
    <Input id={id} list={`${id}-options`} value={value} onChange={event => onChange(event.target.value)} placeholder="Pilih atau isi tipe invoice" className="h-9 text-xs" />
    <datalist id={`${id}-options`}>{[...new Set([value, ...(result?.values || [])])].filter(Boolean).map(type => <option key={type} value={type} />)}</datalist>
    <p className="text-xs text-muted-foreground">Saran berasal dari invoice yang tersedia. Kosongkan jika belum ditentukan.</p>
    {result?.error && <div role="alert" className="text-xs text-destructive">{result.error} <Button size="sm" variant="outline" onClick={() => setAttempt(count => count + 1)}>Coba Lagi</Button></div>}
  </div>;
}
