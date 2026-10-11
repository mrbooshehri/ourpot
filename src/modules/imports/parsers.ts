import { createHash } from 'node:crypto';
import type { ImportFile, ImportPreview, ImportRow } from './types';

function money(value: string): number {
  const normalized = value.trim().replace(/[$,]/g, '');
  if (!/^-?\d+(\.\d{1,2})?$/.test(normalized)) throw new Error('Invalid amount');
  const unsigned = normalized.startsWith('-') ? normalized.slice(1) : normalized;
  const [whole, fraction = ''] = unsigned.split('.');
  const amount = Number(whole) * 100 + Number((fraction + '00').slice(0, 2));
  if (!Number.isSafeInteger(amount)) throw new Error('Amount is too large');
  return amount;
}

function validDate(date: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Invalid date');
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) throw new Error('Invalid date');
  return date;
}

function csvFields(line: string): string[] {
  const fields: string[] = []; let field = ''; let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const character = line[i]!;
    if (character === '"' && line[i + 1] === '"') { field += '"'; i++; continue; }
    if (character === '"') { quoted = !quoted; continue; }
    if (character === ',' && !quoted) { fields.push(field); field = ''; } else field += character;
  }
  fields.push(field); return fields;
}

function makeRow(dateValue: string, amountValue: string, descriptionValue: string, index: number): ImportRow {
  const date = validDate(dateValue.trim());
  const signed = amountValue.trim().startsWith('-');
  const amountMinor = money(amountValue);
  const description = descriptionValue.trim() || 'Imported transaction';
  const fingerprint = createHash('sha256').update(`${date}|${amountMinor}|${description.toLowerCase()}`).digest('hex');
  return { id: `row_${index + 1}`, transactionDate: date, amountMinor, type: signed ? 'expense' : 'income', description, fingerprint };
}

export function parseImport(file: ImportFile): ImportPreview {
  const format = file.name.toLowerCase().split('.').pop(); let rows: ImportRow[] = [];
  if (format === 'csv') {
    const lines = file.content.trim().split(/\r?\n/).filter(Boolean);
    if (!lines.length) throw new Error('Import file contains no transactions');
    const headers = csvFields(lines.shift()!).map((header) => header.trim().toLowerCase());
    const dateIndex = headers.indexOf('date'); const amountIndex = headers.indexOf('amount'); const descriptionIndex = headers.indexOf('description');
    if (dateIndex < 0 || amountIndex < 0 || descriptionIndex < 0) throw new Error('CSV requires date, amount, and description columns');
    rows = lines.map((line, index) => { const fields = csvFields(line); return makeRow(fields[dateIndex] ?? '', fields[amountIndex] ?? '', fields[descriptionIndex] ?? '', index); });
  } else if (format === 'ofx') {
    const matches = [...file.content.matchAll(/<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi)];
    rows = matches.map((match, index) => { const block = match[1]!; const rawDate = block.match(/<DTPOSTED>(\d{4})(\d{2})(\d{2})/i); if (!rawDate) throw new Error('Invalid date'); const amount = block.match(/<TRNAMT>([^<]+)/i)?.[1] ?? ''; const description = block.match(/<(?:NAME|MEMO)>([^<]+)/i)?.[1] ?? ''; return makeRow(`${rawDate[1]}-${rawDate[2]}-${rawDate[3]}`, amount, description, index); });
  } else if (format === 'qif') {
    let date = ''; let amount = ''; let description = ''; let index = 0;
    for (const line of file.content.split(/\r?\n/)) { if (line.startsWith('D')) { const [month, day, year] = line.slice(1).split('/'); date = `${year}-${month?.padStart(2, '0')}-${day?.padStart(2, '0')}`; } else if (line.startsWith('T')) amount = line.slice(1); else if (line.startsWith('P')) description = line.slice(1); else if (line === '^') { rows.push(makeRow(date, amount, description, index++)); date = ''; amount = ''; description = ''; } }
  } else throw new Error('Unsupported import format');
  const seen = new Map<string, string>();
  for (const current of rows) { const firstId = seen.get(current.fingerprint); if (firstId) { const fingerprint = rows.find((candidate) => candidate.id === firstId)?.fingerprint; if (fingerprint) current.duplicateOf = fingerprint; } else seen.set(current.fingerprint, current.id); }
  return { format: format as 'csv' | 'ofx' | 'qif', rows };
}
