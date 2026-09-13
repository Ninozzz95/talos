import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';

export const MAX_REPORT_BYTES = 2_097_152;

export class ReportSourceError extends Error {
  constructor(message, code = 'REPORT_UNAVAILABLE') {
    super(message);
    this.name = 'ReportSourceError';
    this.code = code;
  }
}

function defaultFsAdapter() {
  return { readFile, stat };
}

export function createReportSource(pathPolicy, fsAdapter = defaultFsAdapter()) {
  return Object.freeze({
    async read(campaign) {
      const reportFile = pathPolicy.resolveReportFile(campaign);
      let metadata;
      try {
        metadata = await fsAdapter.stat(reportFile);
      } catch (error) {
        if (error?.code === 'ENOENT') {
          throw new ReportSourceError('Rapporto non ancora prodotto');
        }
        throw new ReportSourceError('Rapporto non disponibile');
      }

      if (!metadata.isFile()) throw new ReportSourceError('Rapporto non disponibile');
      if (metadata.size > MAX_REPORT_BYTES) {
        throw new ReportSourceError('Rapporto oltre limite', 'PAYLOAD_LIMIT');
      }

      let raw;
      try {
        raw = await fsAdapter.readFile(reportFile);
      } catch {
        throw new ReportSourceError('Rapporto non disponibile');
      }
      if (raw.length > MAX_REPORT_BYTES) {
        throw new ReportSourceError('Rapporto oltre limite', 'PAYLOAD_LIMIT');
      }

      return {
        campaign,
        text: raw.toString('utf8'),
        capturedAt: metadata.mtime.toISOString(),
        sourceHash: createHash('sha256').update(raw).digest('hex'),
        provenance: 'rapporto.txt-existing-contract',
      };
    },
  });
}
