import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { mkdir, readdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export type BackupArtifact = Readonly<{ fileName: string; path: string; createdAt: string; schemaVersion: string; sizeBytes: number }>;
export type BackupOptions = Readonly<{ key: string; payload: unknown; schemaVersion?: string; createdAt?: Date }>;
export type RestoreResult = Readonly<{ schemaVersion: string; createdAt: string; payload: unknown }>;

const MAGIC = 'OURPOT-BACKUP-1';
const keyFor = (key: string, salt: Buffer) => scryptSync(key, salt, 32);

export class BackupService {
  constructor(private readonly directory: string, private readonly schemaVersion: string) {}

  async create(options: BackupOptions): Promise<BackupArtifact> {
    if (!options.key) throw new Error('Backup key is required');
    const createdAt = options.createdAt ?? new Date(); const stamp = createdAt.toISOString().replace(/[:.]/g, '-');
    const fileName = `ourpot-${stamp}-${randomBytes(4).toString('hex')}.ourpot`; const path = join(this.directory, fileName);
    const salt = randomBytes(16); const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', keyFor(options.key, salt), iv);
    const plain = Buffer.from(JSON.stringify({ magic: MAGIC, schemaVersion: options.schemaVersion ?? this.schemaVersion, createdAt: createdAt.toISOString(), payload: options.payload }));
    const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
    const content = JSON.stringify({ magic: MAGIC, createdAt: createdAt.toISOString(), schemaVersion: options.schemaVersion ?? this.schemaVersion, salt: salt.toString('base64'), iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: encrypted.toString('base64') });
    await mkdir(this.directory, { recursive: true }); const temporary = `${path}.tmp-${randomBytes(4).toString('hex')}`;
    await writeFile(temporary, content, { mode: 0o600 }); await rename(temporary, path);
    return { fileName, path, createdAt: createdAt.toISOString(), schemaVersion: options.schemaVersion ?? this.schemaVersion, sizeBytes: Buffer.byteLength(content) };
  }

  async list(): Promise<BackupArtifact[]> {
    await mkdir(this.directory, { recursive: true }); const names = (await readdir(this.directory)).filter((name) => name.endsWith('.ourpot')).sort().reverse();
    const artifacts: BackupArtifact[] = [];
    for (const fileName of names) { const raw = JSON.parse(await readFile(join(this.directory, fileName), 'utf8')) as { magic: string; createdAt: string; schemaVersion: string; salt: string; iv: string; tag: string; data: string }; try { const preview = this.readPreview(raw); artifacts.push({ fileName, path: join(this.directory, fileName), createdAt: preview.createdAt, schemaVersion: preview.schemaVersion, sizeBytes: Buffer.byteLength(JSON.stringify(raw)) }); } catch { /* ignore corrupt artifacts in listing */ } }
    return artifacts.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async restore(artifact: BackupArtifact, key: string): Promise<RestoreResult> {
    const raw = JSON.parse(await readFile(artifact.path, 'utf8')) as { magic: string; createdAt: string; schemaVersion: string; salt: string; iv: string; tag: string; data: string };
    if (raw.magic !== MAGIC) throw new Error('Invalid backup artifact');
    let decoded: { schemaVersion: string; createdAt: string; payload: unknown };
    try { const decipher = createDecipheriv('aes-256-gcm', keyFor(key, Buffer.from(raw.salt, 'base64')), Buffer.from(raw.iv, 'base64')); decipher.setAuthTag(Buffer.from(raw.tag, 'base64')); decoded = JSON.parse(Buffer.concat([decipher.update(Buffer.from(raw.data, 'base64')), decipher.final()]).toString('utf8')); } catch { throw new Error('Invalid backup key'); }
    if (decoded.schemaVersion !== this.schemaVersion) throw new Error('Incompatible backup schema');
    return decoded;
  }

  async prune(retention: { daily: number; weekly: number; monthly: number }): Promise<{ deleted: number }> {
    const artifacts = await this.list(); const keep = Math.max(retention.daily, retention.weekly, retention.monthly); let deleted = 0;
    for (const artifact of artifacts.slice(keep)) { await unlink(artifact.path); deleted++; }
    return { deleted };
  }

  private readPreview(raw: { magic: string; createdAt: string; schemaVersion: string; salt: string; iv: string; tag: string; data: string }): { schemaVersion: string; createdAt: string } {
    if (raw.magic !== MAGIC) throw new Error('Invalid backup artifact');
    return { schemaVersion: raw.schemaVersion, createdAt: raw.createdAt };
  }
}
