import { readFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export class EvolutionBaselineError extends Error {
  constructor(message, code = 'EVOLUTION_BASELINE_INVALID') {
    super(message);
    this.name = 'EvolutionBaselineError';
    this.code = code;
  }
}

const SHA40 = /^[a-f0-9]{40}$/u;
const ID = /^[a-z0-9][a-z0-9.-]{2,127}$/u;
const CATEGORIES = new Set(['release', 'test', 'security', 'recovery', 'provenance', 'supply-chain']);

function fail(message, code) {
  throw new EvolutionBaselineError(message, code);
}

function assertObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} non valido.`);
}

export function validateBaselineShape(baseline) {
  assertObject(baseline, 'Baseline');
  if (baseline.schema !== 'talos.evolution.implementation-baseline.v1') fail('Schema baseline non riconosciuto.');
  assertObject(baseline.source, 'source');
  if (baseline.source.repository !== 'Ninozzz95/talos') fail('Repository baseline inatteso.');
  if (!SHA40.test(baseline.source.commit ?? '')) fail('Commit baseline non valido.');
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(baseline.source.desktopVersion ?? '')) fail('Versione desktop baseline non valida.');
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(baseline.source.capturedAt ?? '')) fail('Data baseline non valida.');
  assertObject(baseline.semantics, 'semantics');
  if (baseline.semantics.historicalSnapshot !== true || baseline.semantics.locksFutureDesktopVersion !== false) {
    fail('La baseline deve essere storica e non deve bloccare le versioni desktop future.');
  }
  if (typeof baseline.semantics.rule !== 'string' || baseline.semantics.rule.trim() === '') fail('Regola di migrazione baseline assente.');
  if (!Array.isArray(baseline.guardrails) || baseline.guardrails.length === 0) fail('Guardrail baseline assenti.');

  const ids = new Set();
  for (const [index, guardrail] of baseline.guardrails.entries()) {
    assertObject(guardrail, `guardrails[${index}]`);
    if (!ID.test(guardrail.id ?? '')) fail(`ID guardrail non valido: ${guardrail.id ?? '<assente>'}.`);
    if (ids.has(guardrail.id)) fail(`ID guardrail duplicato: ${guardrail.id}.`, 'EVOLUTION_BASELINE_DUPLICATE');
    ids.add(guardrail.id);
    if (!CATEGORIES.has(guardrail.category)) fail(`Categoria guardrail non valida: ${guardrail.id}.`);
    if (!Array.isArray(guardrail.evidence) || guardrail.evidence.length === 0) fail(`Evidenza assente: ${guardrail.id}.`);
    for (const evidence of guardrail.evidence) {
      assertObject(evidence, `evidence di ${guardrail.id}`);
      if (typeof evidence.path !== 'string' || evidence.path.trim() === '' || isAbsolute(evidence.path) || evidence.path.includes('\0')) {
        fail(`Percorso evidenza non valido: ${guardrail.id}.`, 'EVOLUTION_BASELINE_PATH_INVALID');
      }
      if (typeof evidence.contains !== 'string' || evidence.contains === '') fail(`Marcatore evidenza vuoto: ${guardrail.id}.`);
    }
  }
  return baseline;
}

export function resolveEvidencePath(repoRoot, candidate) {
  const root = resolve(repoRoot);
  const target = resolve(root, candidate);
  const difference = relative(root, target);
  if (difference === '..' || difference.startsWith(`..${sep}`) || isAbsolute(difference)) {
    fail(`Percorso evidenza fuori dal repository: ${candidate}.`, 'EVOLUTION_BASELINE_PATH_INVALID');
  }
  return target;
}

export function desktopWorkflowSection(workflow) {
  const marker = /^  desktop:\s*$/mu;
  const match = marker.exec(workflow);
  if (!match) fail('Job desktop assente dal workflow di release.', 'EVOLUTION_BASELINE_RELEASE_GUARD_MISSING');
  const rest = workflow.slice(match.index + match[0].length);
  const nextJob = /^  [A-Za-z0-9_-]+:\s*$/mu.exec(rest);
  return nextJob ? rest.slice(0, nextJob.index) : rest;
}

export function validatePinnedDesktopActions(workflow) {
  const section = desktopWorkflowSection(workflow);
  const refs = [...section.matchAll(/^\s*-\s+uses:\s+([^\s#]+)(?:\s+#.*)?$/gmu)].map((match) => match[1]);
  if (refs.length === 0) fail('Il job desktop non dichiara action esterne.', 'EVOLUTION_BASELINE_ACTIONS_MISSING');
  for (const ref of refs) {
    if (ref.startsWith('./')) continue;
    const at = ref.lastIndexOf('@');
    if (at <= 0 || !SHA40.test(ref.slice(at + 1))) {
      fail(`Action desktop non fissata a SHA completo: ${ref}.`, 'EVOLUTION_BASELINE_ACTION_NOT_PINNED');
    }
  }
  return refs;
}

export async function validateEvidence({ baseline, repoRoot, readText = (path) => readFile(path, 'utf8') }) {
  const cache = new Map();
  for (const guardrail of baseline.guardrails) {
    for (const evidence of guardrail.evidence) {
      const path = resolveEvidencePath(repoRoot, evidence.path);
      let text = cache.get(path);
      if (text === undefined) {
        try {
          text = await readText(path);
        } catch (error) {
          fail(`Evidenza non leggibile per ${guardrail.id}: ${evidence.path} (${error?.code ?? 'errore'}).`, 'EVOLUTION_BASELINE_EVIDENCE_MISSING');
        }
        cache.set(path, text);
      }
      if (!String(text).includes(evidence.contains)) {
        fail(`Guardrail ${guardrail.id} non più provato da ${evidence.path}.`, 'EVOLUTION_BASELINE_GUARD_MISSING');
      }
    }
  }
}

export async function verifyEvolutionBaseline({ desktopRoot = dirname(dirname(fileURLToPath(import.meta.url))), readText } = {}) {
  const repoRoot = resolve(desktopRoot, '../..');
  const baselinePath = resolve(desktopRoot, 'evolution-baseline.json');
  const workflowPath = resolve(repoRoot, '.github/workflows/release.yml');
  const reader = readText ?? ((path) => readFile(path, 'utf8'));

  let baseline;
  try {
    baseline = JSON.parse(await reader(baselinePath));
  } catch (error) {
    fail(`Baseline non leggibile: ${error?.message ?? error}.`);
  }
  validateBaselineShape(baseline);
  await validateEvidence({ baseline, repoRoot, readText: reader });
  let workflow;
  try {
    workflow = await reader(workflowPath);
  } catch (error) {
    fail(`Workflow release non leggibile: ${error?.message ?? error}.`, 'EVOLUTION_BASELINE_EVIDENCE_MISSING');
  }
  const actions = validatePinnedDesktopActions(workflow);
  return Object.freeze({
    schema: baseline.schema,
    sourceCommit: baseline.source.commit,
    desktopVersionAtCapture: baseline.source.desktopVersion,
    guardrails: baseline.guardrails.length,
    pinnedDesktopActions: actions.length,
  });
}

async function main() {
  const result = await verifyEvolutionBaseline();
  process.stdout.write(
    `Baseline evoluzione verificata: ${result.guardrails} guardrail, ${result.pinnedDesktopActions} action desktop fissate a SHA; sorgente ${result.sourceCommit}.\n`,
  );
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : 'Baseline evoluzione non valida.'}\n`);
    process.exitCode = 1;
  });
}
