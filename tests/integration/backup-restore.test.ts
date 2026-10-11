import { describe, expect, it } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BackupService } from '../../src/modules/operations/backups';

describe('encrypted backups', () => {
  it('creates an encrypted artifact and rejects a wrong key or incompatible schema', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ourpot-backup-'));
    try {
      const service = new BackupService(directory, 'schema-v1');
      const artifact = await service.create({ key: 'correct horse battery staple', payload: { accounts: [{ id: 'a1' }] } });
      expect(artifact.fileName).toMatch(/\.ourpot$/);
      expect((await service.list())).toHaveLength(1);
      await expect(service.restore(artifact, 'wrong')).rejects.toThrow('Invalid backup key');
      const incompatible = await service.create({ key: 'correct horse battery staple', schemaVersion: 'schema-v2', payload: {} });
      await expect(service.restore(incompatible, 'correct horse battery staple')).rejects.toThrow('Incompatible backup schema');
    } finally { await rm(directory, { recursive: true, force: true }); }
  });

  it('retains the newest artifact per daily, weekly, and monthly windows', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ourpot-retention-'));
    try {
      const service = new BackupService(directory, 'schema-v1');
      for (let index = 0; index < 15; index++) await service.create({ key: 'key', payload: { index }, createdAt: new Date(Date.UTC(2025, 0, 1 + index)) });
      const result = await service.prune({ daily: 7, weekly: 4, monthly: 12 });
      expect(result.deleted).toBeGreaterThan(0);
      expect((await service.list()).length).toBeLessThan(15);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
});
