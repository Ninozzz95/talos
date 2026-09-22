import {createHash} from 'node:crypto';
import {mkdir,open,readFile,rename,rm,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type {ProcessTreeProbeResult} from './process-tree-probe.ts';

export type ProcessTreeEvidenceStore = {
  read(): Promise<ProcessTreeProbeResult | null>;
  write(result: ProcessTreeProbeResult): Promise<void>;
};

const RECORD_SCHEMA = 'talos.cli.process-tree-evidence-store.v1';
const RECORD_FILE = 'process-tree-evidence.json';
const POSITIVE_TTL_MS = 24 * 60 * 60 * 1000;
const NEGATIVE_TTL_MS = 15 * 60 * 1000;

type StoredRecord = {schema: string; hostFingerprint: string; recordedAtMs: number; result: ProcessTreeProbeResult};

/**
 * A process-tree measurement is only meaningful on the host that produced it. Any change in
 * platform, kernel release, architecture, or machine name invalidates the cached evidence rather
 * than carrying a stale "verified" across a host that is no longer the same machine.
 */
export function hostFingerprint(input: {platform?: string; release?: string; arch?: string; hostname?: string} = {}): string {
  const platform = input.platform ?? os.platform();
  const release = input.release ?? os.release();
  const arch = input.arch ?? os.arch();
  const hostname = input.hostname ?? os.hostname();
  return createHash('sha256').update('talos.cli.process-tree-host.v1\0').update(`${platform}\0${release}\0${arch}\0${hostname}`).digest('hex');
}

export function createProcessTreeEvidenceStore(options: {
  cacheRoot: string;
  fingerprint?: string;
  now?: () => number;
  positiveTtlMs?: number;
  negativeTtlMs?: number;
}): ProcessTreeEvidenceStore {
  const file = path.join(options.cacheRoot, RECORD_FILE);
  const now = options.now ?? (() => Date.now());
  const positiveTtlMs = options.positiveTtlMs ?? POSITIVE_TTL_MS;
  const negativeTtlMs = options.negativeTtlMs ?? NEGATIVE_TTL_MS;
  const fingerprint = options.fingerprint ?? hostFingerprint();

  return {
    async read() {
      let record: StoredRecord;
      try {
        record = JSON.parse(await readFile(file, 'utf8')) as StoredRecord;
      } catch {
        return null;
      }
      if (record?.schema !== RECORD_SCHEMA) return null;
      if (record.hostFingerprint !== fingerprint) return null;
      if (typeof record.recordedAtMs !== 'number' || typeof record.result?.verified !== 'boolean') return null;
      const age = now() - record.recordedAtMs;
      if (age < 0) return null;
      return age > (record.result.verified ? positiveTtlMs : negativeTtlMs) ? null : record.result;
    },
    /**
     * Never written in place. A project incident recorded `open(path,'w')` truncating a 36 KB file
     * before the write that was meant to replace it, so the record is serialized first, written to
     * a temporary file in the same directory, flushed, and only then renamed over the target.
     */
    async write(result) {
      const record: StoredRecord = {schema: RECORD_SCHEMA, hostFingerprint: fingerprint, recordedAtMs: now(), result};
      const serialized = `${JSON.stringify(record, null, 2)}\n`;
      await mkdir(options.cacheRoot, {recursive: true, mode: 0o700});
      const temporary = `${file}.tmp-${process.pid}-${now()}`;
      try {
        await writeFile(temporary, serialized, {encoding: 'utf8', mode: 0o600});
        const handle = await open(temporary, 'r+');
        try {await handle.sync();} finally {await handle.close();}
        await rename(temporary, file);
      } catch (error) {
        await rm(temporary, {force: true});
        throw error;
      }
    }
  };
}
