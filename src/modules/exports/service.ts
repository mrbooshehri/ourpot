type ExportRow = Readonly<{ id: string; amount: number; type: string; description: string; transactionDate: string; enteredBy: string }>;

const escapeCsv = (value: string | number) => { const text = String(value); return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text; };

export class ExportService {
  async render(format: 'json' | 'csv', rows: readonly ExportRow[]): Promise<string> {
    if (format === 'json') return JSON.stringify(rows.map((row) => ({ id: row.id, amountMinor: row.amount, type: row.type, description: row.description, transactionDate: row.transactionDate, enteredBy: row.enteredBy })));
    const lines = ['id,amount_minor,type,description,transaction_date,entered_by'];
    for (const row of rows) lines.push([row.id, row.amount, row.type, row.description, row.transactionDate, row.enteredBy].map(escapeCsv).join(','));
    return `${lines.join('\n')}\n`;
  }
}
