import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { basename } from 'node:path';
import { createInterface } from 'node:readline';

export const MAX_JSONL_FILE_BYTES = 16_777_216;
export const MAX_JSONL_LINE_BYTES = 1_048_576;
export const MAX_CAMPAIGN_ROWS = 10_000;

export class JsonlReadError extends Error {
  constructor(message, code = 'ROW_INVALID') {
    super(message);
    this.name = 'JsonlReadError';
    this.code = code;
  }
}

function boundedLimit(value, fallback, label) {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || value <= 0 || value > fallback) {
    throw new JsonlReadError(`${label} non valido`, 'PAYLOAD_LIMIT');
  }
  return value;
}

function resolveLimits(limits = {}) {
  return {
    maxFileBytes: boundedLimit(limits.maxFileBytes, MAX_JSONL_FILE_BYTES, 'Limite file'),
    maxLineBytes: boundedLimit(limits.maxLineBytes, MAX_JSONL_LINE_BYTES, 'Limite riga'),
    maxCampaignRows: boundedLimit(limits.maxCampaignRows, MAX_CAMPAIGN_ROWS, 'Limite campagna'),
  };
}

function diagnostic(reason, source) {
  return {
    diagnostic: {
      code: 'ROW_INVALID',
      message: 'Riga JSONL non valida',
      reason,
      source: { file: basename(source.file), line: source.line },
    },
  };
}

function finiteNumber(value, { nullable = true } = {}) {
  if (value === undefined || value === null) return nullable ? null : undefined;
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function optionalString(value) {
  if (value === undefined || value === null) return null;
  return typeof value === 'string' ? value : undefined;
}

export function normalizeRunRow(value, source) {
  const safeSource = { file: basename(source?.file || 'unknown.jsonl'), line: source?.line };
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return diagnostic('ROW_NOT_OBJECT', safeSource);
  }

  if (typeof value.harness !== 'string' || value.harness.length === 0) {
    return diagnostic('HARNESS_INVALID', safeSource);
  }
  if (typeof value.id !== 'string' || value.id.length === 0) {
    return diagnostic('ID_INVALID', safeSource);
  }
  if (typeof value.esito !== 'string' || value.esito.length === 0) {
    return diagnostic('ESITO_INVALID', safeSource);
  }

  const difficolta = finiteNumber(value.difficolta);
  const ms = finiteNumber(value.ms, { nullable: false });
  const costoUsd = finiteNumber(value.costoUsd);
  const corpus = optionalString(value.corpus);
  const modello = optionalString(value.modello);
  const quota = optionalString(value.quota);
  const quando = optionalString(value.quando);
  const detto = optionalString(value.detto);
  if ([difficolta, ms, costoUsd, corpus, modello, quota, quando, detto].includes(undefined)) {
    return diagnostic('FIELD_TYPE_INVALID', safeSource);
  }

  let cambiamenti = null;
  if (value.cambiamenti !== undefined && value.cambiamenti !== null) {
    if (
      typeof value.cambiamenti !== 'object'
      || Array.isArray(value.cambiamenti)
      || !Number.isInteger(value.cambiamenti.quanti)
      || value.cambiamenti.quanti < 0
    ) {
      return diagnostic('CAMBIAMENTI_INVALID', safeSource);
    }
    cambiamenti = { quanti: value.cambiamenti.quanti };
  }

  let giriDelTask = [];
  if (value.giriDelTask !== undefined && value.giriDelTask !== null) {
    if (!Array.isArray(value.giriDelTask)) return diagnostic('GIRI_INVALID', safeSource);
    giriDelTask = [];
    for (const giro of value.giriDelTask) {
      if (!giro || typeof giro !== 'object' || Array.isArray(giro)) {
        return diagnostic('GIRO_INVALID', safeSource);
      }
      const esito = optionalString(giro.esito);
      const giroMs = finiteNumber(giro.ms);
      const giroCosto = finiteNumber(giro.costoUsd);
      if ([esito, giroMs, giroCosto].includes(undefined)) {
        return diagnostic('GIRO_FIELD_INVALID', safeSource);
      }
      giriDelTask.push({ esito, ms: giroMs, costoUsd: giroCosto });
    }
  }

  return {
    row: {
      rowKey: `${safeSource.file}:${safeSource.line}`,
      harness: value.harness,
      id: value.id,
      difficolta,
      esito: value.esito,
      ms,
      costoUsd,
      corpus,
      modello,
      quota,
      quando,
      giriDelTask,
      detto,
      cambiamenti,
      source: safeSource,
    },
  };
}

export async function* readJsonlFile(file, limits = {}) {
  const bounded = resolveLimits(limits);
  const sourceFile = basename(file);
  let metadata;
  try {
    metadata = await stat(file);
  } catch {
    throw new JsonlReadError(`File JSONL non leggibile: ${sourceFile}`, 'CAMPAIGN_UNREADABLE');
  }
  if (!metadata.isFile()) {
    throw new JsonlReadError(`Sorgente JSONL non valida: ${sourceFile}`, 'CAMPAIGN_UNREADABLE');
  }
  if (metadata.size > bounded.maxFileBytes) {
    throw new JsonlReadError(`File JSONL oltre limite: ${sourceFile}`, 'PAYLOAD_LIMIT');
  }

  const stream = createReadStream(file, { encoding: 'utf8' });
  const lines = createInterface({ input: stream, crlfDelay: Infinity });
  let lineNumber = 0;
  try {
    for await (const line of lines) {
      lineNumber += 1;
      if (Buffer.byteLength(line, 'utf8') > bounded.maxLineBytes) {
        throw new JsonlReadError(`Riga JSONL oltre limite: ${sourceFile}:${lineNumber}`, 'PAYLOAD_LIMIT');
      }
      if (line.trim() === '') {
        yield diagnostic('ROW_EMPTY', { file: sourceFile, line: lineNumber });
        continue;
      }
      let parsed;
      try {
        parsed = JSON.parse(line);
      } catch {
        yield diagnostic('JSON_INVALID', { file: sourceFile, line: lineNumber });
        continue;
      }
      yield normalizeRunRow(parsed, { file: sourceFile, line: lineNumber });
    }
  } catch (error) {
    if (error instanceof JsonlReadError) throw error;
    throw new JsonlReadError(`File JSONL non leggibile: ${sourceFile}`, 'CAMPAIGN_UNREADABLE');
  } finally {
    lines.close();
    stream.destroy();
  }
}

async function hashFile(hash, file, maxFileBytes) {
  let observed = 0;
  const stream = createReadStream(file);
  try {
    for await (const chunk of stream) {
      observed += chunk.length;
      if (observed > maxFileBytes) {
        throw new JsonlReadError(`File JSONL oltre limite: ${basename(file)}`, 'PAYLOAD_LIMIT');
      }
      hash.update(chunk);
    }
  } catch (error) {
    if (error instanceof JsonlReadError) throw error;
    throw new JsonlReadError(`File JSONL non leggibile: ${basename(file)}`, 'CAMPAIGN_UNREADABLE');
  } finally {
    stream.destroy();
  }
}

export async function readCampaignRows(pathPolicy, campaign, limits = {}) {
  const bounded = resolveLimits(limits);
  const files = pathPolicy.listJsonlFiles(campaign);
  const rows = [];
  const diagnostics = [];
  const sourceFiles = files.map((file) => basename(file)).sort((a, b) => a.localeCompare(b, 'en'));
  const hash = createHash('sha256');
  let observedRecords = 0;

  for (const file of files) {
    hash.update(`${basename(file)}\0`, 'utf8');
    for await (const result of readJsonlFile(file, bounded)) {
      observedRecords += 1;
      if (observedRecords > bounded.maxCampaignRows) {
        throw new JsonlReadError('Campagna oltre il limite di righe', 'PAYLOAD_LIMIT');
      }
      if (result.row) rows.push(result.row);
      else diagnostics.push(result.diagnostic);
    }
    await hashFile(hash, file, bounded.maxFileBytes);
    hash.update('\0', 'utf8');
  }

  return {
    campaign,
    rows,
    diagnostics,
    sourceFiles,
    readAt: new Date().toISOString(),
    sourceHash: hash.digest('hex'),
  };
}
