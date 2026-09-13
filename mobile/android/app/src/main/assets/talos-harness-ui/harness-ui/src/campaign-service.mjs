import { stat } from 'node:fs/promises';
import { basename } from 'node:path';

import { readCampaignRows } from './jsonl-reader.mjs';

export const DEFAULT_PAGE_SIZE = 40;
export const MAX_PAGE_SIZE = 100;

const ALLOWED_QUERY_KEYS = new Set(['harness', 'esito', 'cursor', 'limit']);
const MEASURED_OUTCOMES = new Set(['riuscito', 'fallito']);

export class CampaignQueryError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CampaignQueryError';
    this.code = 'QUERY_INVALID';
  }
}

function tupleFor(row) {
  return [row.harness, row.id, row.source.file, row.source.line];
}

function compareTuple(left, right) {
  for (let index = 0; index < 3; index += 1) {
    const compared = left[index].localeCompare(right[index], 'en');
    if (compared !== 0) return compared;
  }
  return left[3] - right[3];
}

function validSortTuple(value) {
  return Array.isArray(value)
    && value.length === 4
    && value.slice(0, 3).every((item) => typeof item === 'string')
    && Number.isInteger(value[3])
    && value[3] > 0;
}

export function encodeCursor(sortTuple) {
  if (!validSortTuple(sortTuple)) {
    throw new CampaignQueryError('Cursore non valido');
  }
  return Buffer.from(JSON.stringify(sortTuple), 'utf8').toString('base64url');
}

export function decodeCursor(cursor) {
  if (
    typeof cursor !== 'string'
    || cursor.length === 0
    || cursor.length > 1024
    || !/^[A-Za-z0-9_-]+$/.test(cursor)
  ) throw new CampaignQueryError('Cursore non valido');

  let tuple;
  try {
    tuple = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    throw new CampaignQueryError('Cursore non valido');
  }
  if (
    !validSortTuple(tuple)
    || encodeCursor(tuple) !== cursor
  ) throw new CampaignQueryError('Cursore non valido');
  return tuple;
}

function majorityPassed(row) {
  const measuredGiri = (row.giriDelTask || [])
    .filter((giro) => MEASURED_OUTCOMES.has(giro.esito));
  if (measuredGiri.length === 0) return row.esito === 'riuscito';
  const passed = measuredGiri.filter((giro) => giro.esito === 'riuscito').length;
  return passed > measuredGiri.length / 2;
}

function summarizeRows(rows) {
  const measured = rows.filter((row) => MEASURED_OUTCOMES.has(row.esito));
  const passed = measured.filter(majorityPassed).length;
  return {
    totalRows: rows.length,
    measuredRows: measured.length,
    majorityPassedRows: passed,
    passRate: measured.length === 0 ? null : passed / measured.length,
  };
}

export function summarizeCampaign(rows, costs, diagnostics) {
  const grouped = new Map();
  const outcomes = new Map();
  for (const row of rows) {
    if (!grouped.has(row.harness)) grouped.set(row.harness, []);
    grouped.get(row.harness).push(row);
    outcomes.set(row.esito, (outcomes.get(row.esito) || 0) + 1);
  }

  const costByHarness = new Map(costs.map((cost) => [cost.harness, cost]));
  const harnesses = [...grouped.entries()]
    .sort(([left], [right]) => left.localeCompare(right, 'en'))
    .map(([harness, harnessRows]) => ({
      harness,
      ...summarizeRows(harnessRows),
      cost: costByHarness.get(harness) || {
        harness,
        costoUsd: null,
        source: 'unavailable',
        estimated: false,
        rowsWithoutCost: harnessRows.length,
      },
    }));

  const allCostsAvailable = harnesses.length > 0
    && harnesses.every((entry) => entry.cost.costoUsd !== null);
  const canonicalCostUsd = allCostsAvailable
    ? harnesses.reduce((total, entry) => total + entry.cost.costoUsd, 0)
    : null;
  const overall = summarizeRows(rows);

  return {
    ...overall,
    canonicalCostUsd,
    costEstimated: harnesses.some((entry) => entry.cost.estimated),
    rowsWithoutCost: harnesses.reduce((total, entry) => total + entry.cost.rowsWithoutCost, 0),
    harnesses,
    outcomeCounts: Object.fromEntries([...outcomes.entries()]
      .sort(([left], [right]) => left.localeCompare(right, 'en'))),
    diagnosticCount: diagnostics.length,
    metricProvenance: 'existing-bank-contract',
  };
}

function clockIso(clock) {
  const value = clock();
  return (value instanceof Date ? value : new Date(value)).toISOString();
}

export function createCampaignService({
  pathPolicy,
  costReader,
  reportSource,
  clock = () => new Date(),
}) {
  const snapshots = new Map();

  async function refresh(campaign) {
    pathPolicy.resolveCampaignDir(campaign);
    const read = await readCampaignRows(pathPolicy, campaign);
    read.readAt = clockIso(clock);
    const rowsByHarness = new Map();
    for (const row of read.rows) {
      if (!rowsByHarness.has(row.harness)) rowsByHarness.set(row.harness, []);
      rowsByHarness.get(row.harness).push(row);
    }
    const costs = await costReader(pathPolicy, campaign, rowsByHarness);
    const summary = summarizeCampaign(read.rows, costs, read.diagnostics);
    const snapshot = { read, costs, summary };
    snapshots.set(campaign, snapshot);
    return snapshot;
  }

  async function cached(campaign) {
    return snapshots.get(campaign) || refresh(campaign);
  }

  return Object.freeze({
    async listCampaigns() {
      const descriptors = [];
      for (const name of pathPolicy.listCampaigns()) {
        try {
          const files = pathPolicy.listJsonlFiles(name);
          const metadata = await Promise.all(files.map((file) => stat(file)));
          const newest = metadata.length === 0
            ? null
            : new Date(Math.max(...metadata.map((item) => item.mtimeMs))).toISOString();
          descriptors.push({
            name,
            available: true,
            jsonlFiles: files.map((file) => basename(file)),
            lastModifiedAt: newest,
          });
        } catch {
          descriptors.push({ name, available: false, jsonlFiles: [], lastModifiedAt: null });
        }
      }
      return descriptors;
    },

    async getSnapshot(campaign) {
      const snapshot = await refresh(campaign);
      return {
        campaign,
        summary: snapshot.summary,
        sourceFiles: snapshot.read.sourceFiles,
        readAt: snapshot.read.readAt,
        sourceHash: snapshot.read.sourceHash,
      };
    },

    async listRuns(campaign, query = {}) {
      if (!query || typeof query !== 'object' || Array.isArray(query)) {
        throw new CampaignQueryError('Query non valida');
      }
      if (Object.keys(query).some((key) => !ALLOWED_QUERY_KEYS.has(key))) {
        throw new CampaignQueryError('Parametro query non ammesso');
      }
      for (const key of ['harness', 'esito']) {
        if (query[key] !== undefined && (
          typeof query[key] !== 'string' || query[key].length === 0 || query[key].length > 128
        )) throw new CampaignQueryError('Filtro non valido');
      }

      let limit = DEFAULT_PAGE_SIZE;
      if (query.limit !== undefined) {
        const raw = typeof query.limit === 'number' ? String(query.limit) : query.limit;
        if (typeof raw !== 'string' || !/^\d+$/.test(raw)) {
          throw new CampaignQueryError('Limite non valido');
        }
        limit = Number(raw);
        if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE_SIZE) {
          throw new CampaignQueryError('Limite non valido');
        }
      }

      const snapshot = await cached(campaign);
      const filtered = snapshot.read.rows
        .filter((row) => query.harness === undefined || row.harness === query.harness)
        .filter((row) => query.esito === undefined || row.esito === query.esito)
        .sort((left, right) => compareTuple(tupleFor(left), tupleFor(right)));

      let start = 0;
      if (query.cursor !== undefined) {
        const cursorTuple = decodeCursor(query.cursor);
        start = filtered.findIndex((row) => compareTuple(tupleFor(row), cursorTuple) > 0);
        if (start === -1) start = filtered.length;
      }
      const items = filtered.slice(start, start + limit);
      const hasMore = start + items.length < filtered.length;

      return {
        items,
        nextCursor: hasMore && items.length > 0 ? encodeCursor(tupleFor(items.at(-1))) : null,
        totalMatched: filtered.length,
        sourceHash: snapshot.read.sourceHash,
        readAt: snapshot.read.readAt,
        diagnostics: snapshot.read.diagnostics,
      };
    },

    async getReport(campaign) {
      pathPolicy.resolveCampaignDir(campaign);
      return reportSource.read(campaign);
    },
  });
}
