import { expect, it } from 'bun:test';
import { ExportService } from '../../src/modules/exports/service';

it('exports integer ledger values as JSON and CSV', async () => {
  const service = new ExportService();
  const rows = [{ id: 't1', amount: 1234, type: 'expense', description: 'Lunch', transactionDate: '2026-01-02', enteredBy: 'u1' }];
  expect(await service.render('json', rows)).toContain('1234');
  const csv = await service.render('csv', rows);
  expect(csv).toContain('id,amount_minor,type,description,transaction_date,entered_by');
  expect(csv).toContain('t1,1234,expense,Lunch,2026-01-02,u1');
});
