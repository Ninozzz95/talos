import { readFile, stat } from 'node:fs/promises';

const MAX_COST_FILE_BYTES = 65_536;

export class CostReadError extends Error {
  constructor(message, code = 'CAMPAIGN_UNREADABLE') {
    super(message);
    this.name = 'CostReadError';
    this.code = code;
  }
}

export function normalizeCostFile(value, harness) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (value.harness !== harness) return null;
  if (
    typeof value.costoUsd !== 'number'
    || !Number.isFinite(value.costoUsd)
    || value.costoUsd < 0
  ) return null;

  return {
    harness,
    costoUsd: value.costoUsd,
    source: 'cost-file',
    estimated: false,
    rowsWithoutCost: 0,
  };
}

function fallbackFromRows(harness, rows) {
  let costoUsd = 0;
  let rowsWithCost = 0;
  let rowsWithoutCost = 0;
  for (const row of rows) {
    if (typeof row.costoUsd === 'number' && Number.isFinite(row.costoUsd)) {
      costoUsd += row.costoUsd;
      rowsWithCost += 1;
    } else {
      rowsWithoutCost += 1;
    }
  }

  if (rowsWithCost === 0) {
    return {
      harness,
      costoUsd: null,
      source: 'unavailable',
      estimated: false,
      rowsWithoutCost,
    };
  }

  return {
    harness,
    costoUsd,
    source: 'row-sum',
    estimated: true,
    rowsWithoutCost,
  };
}

export async function readHarnessCost(pathPolicy, campaign, harness, rows) {
  const costFile = pathPolicy.resolveHarnessCostFile(campaign, harness);
  let metadata;
  try {
    metadata = await stat(costFile);
  } catch (error) {
    if (error?.code === 'ENOENT') return fallbackFromRows(harness, rows);
    throw new CostReadError('File costo non leggibile');
  }

  if (!metadata.isFile()) throw new CostReadError('Sorgente costo non valida');
  if (metadata.size > MAX_COST_FILE_BYTES) {
    throw new CostReadError('File costo oltre limite', 'PAYLOAD_LIMIT');
  }

  let raw;
  try {
    raw = await readFile(costFile);
  } catch {
    throw new CostReadError('File costo non leggibile');
  }
  if (raw.length > MAX_COST_FILE_BYTES) {
    throw new CostReadError('File costo oltre limite', 'PAYLOAD_LIMIT');
  }

  let normalized = null;
  try {
    normalized = normalizeCostFile(JSON.parse(raw.toString('utf8')), harness);
  } catch {
    normalized = null;
  }
  if (!normalized) return fallbackFromRows(harness, rows);

  return {
    ...normalized,
    rowsWithoutCost: rows.filter((row) => (
      typeof row.costoUsd !== 'number' || !Number.isFinite(row.costoUsd)
    )).length,
  };
}

export async function readCampaignCosts(pathPolicy, campaign, rowsByHarness) {
  const entries = rowsByHarness instanceof Map
    ? [...rowsByHarness.entries()]
    : Object.entries(rowsByHarness || {});
  entries.sort(([left], [right]) => left.localeCompare(right, 'en'));

  const costs = [];
  for (const [harness, rows] of entries) {
    costs.push(await readHarnessCost(pathPolicy, campaign, harness, rows));
  }
  return costs;
}
