#!/usr/bin/env node

import { readFile } from 'node:fs/promises';

const CLASSIFICATIONS = Object.freeze([
  'VALIDATED',
  'FALSE-POSITIVE',
  'ACCEPTED-RISK',
  'FIXED',
  'REJECTED',
]);

const PATH_RULES = Object.freeze({
  'cross-repository-import': { severity: 'critical', phase: 'P0.1' },
  'optimistic-running-state': { severity: 'critical', phase: 'P0.2' },
  'unsafe-html-sink': { severity: 'high', phase: 'P0.4' },
  'silent-rejection': { severity: 'high', phase: 'P0.3' },
  'unbounded-timer': { severity: 'medium', phase: 'P0.3' },
  'hard-coded-local-api': { severity: 'medium', phase: 'P0.1' },
  'placeholder-copy': { severity: 'high', phase: 'P0.5' },
  'todo-in-runtime': { severity: 'medium', phase: 'P1' },
});

const DOCUMENTATION_PARTS = [
  '/docs/',
  '/.claude/',
  '/tests/',
  '/test/',
  '/fixtures/',
  '/mockup-originale/',
];

function normalizzaPercorso(file) {
  return String(file ?? '').replaceAll('\\', '/').toLowerCase();
}

function eDocumentazioneOTest(file) {
  const normalized = '/' + normalizzaPercorso(file).replace(/^\/+/, '');
  return normalized.endsWith('.md')
    || normalized.endsWith('.txt')
    || normalized.endsWith('.json')
    || DOCUMENTATION_PARTS.some((part) => normalized.includes(part));
}

function regolaBase(rule) {
  return PATH_RULES[rule] ?? { severity: 'high', phase: 'P0.5' };
}

function eRegExpExec(excerpt) {
  const text = String(excerpt ?? '');
  return /(?:\/[^/\n]+\/[a-z]*|\[[^\n]+\])\.exec\s*\(/i.test(text)
    || /(?:regexp|regular expression|regex)[^;\n]*\.exec\s*\(/i.test(text);
}

function risultato(finding, classification, reason, overrides = {}) {
  const base = regolaBase(finding.rule);
  return {
    rule: String(finding.rule ?? ''),
    file: String(finding.file ?? ''),
    line: Number.isInteger(finding.line) ? finding.line : null,
    classification,
    severity: overrides.severity ?? (classification === 'VALIDATED' ? base.severity : 'none'),
    phase: overrides.phase ?? (classification === 'VALIDATED' ? base.phase : null),
    reason,
  };
}

export function classifyFinding(finding = {}) {
  const rule = String(finding.rule ?? '');
  const file = normalizzaPercorso(finding.file);
  const excerpt = String(finding.excerpt ?? '');

  if (rule === 'shell-execution' && eRegExpExec(excerpt)) {
    return risultato(finding, 'FALSE-POSITIVE', 'È una chiamata al metodo RegExp.exec, non avvia un processo.');
  }

  if (rule === 'simulation-marker' && eDocumentazioneOTest(file)) {
    return risultato(finding, 'ACCEPTED-RISK', 'Il marker descrive documentazione, test o una demo dichiarata; non è un comportamento runtime.', {
      severity: 'none',
    });
  }

  if (rule === 'cross-repository-import' && /(?:avm-harness|talos-banco)/i.test(excerpt)) {
    return risultato(finding, 'VALIDATED', 'L’import oltre il confine del repository rende il package dipendente da un checkout esterno.');
  }

  if (rule === 'shell-execution') {
    return risultato(finding, 'VALIDATED', 'La riga deve essere verificata come vero process boundary e passare dalla process policy.');
  }

  if (rule === 'simulation-marker') {
    return risultato(finding, 'VALIDATED', 'Il marker si trova nel percorso produttivo e richiede una distinzione esplicita fra stato reale e demo.');
  }

  if (rule === 'optimistic-running-state') {
    return risultato(finding, 'VALIDATED', 'Lo stato operativo viene dichiarato prima della conferma del runtime.');
  }

  if (rule === 'unsafe-html-sink') {
    return risultato(finding, 'VALIDATED', 'Il sink deve essere raggiunto da dati fidati o sostituito con DOM costruito in modo sicuro.');
  }

  if (rule === 'silent-rejection') {
    return risultato(finding, 'VALIDATED', 'Un errore operativo non può essere perso; un cleanup lecito deve comunque lasciare telemetria.');
  }

  if (rule === 'hard-coded-local-api') {
    return risultato(finding, 'VALIDATED', 'L’endpoint deve essere centralizzato, limitato al loopback e dichiarato nel contratto di configurazione.');
  }

  return risultato(finding, 'VALIDATED', 'Finding non ancora declassato: richiede verifica manuale e test permanente.');
}

export function buildFindingLedger(findings = []) {
  const normalized = findings.map((finding) => classifyFinding(finding));
  const count = (classification) => normalized.filter((item) => item.classification === classification).length;

  return {
    total: normalized.length,
    validated: count('VALIDATED'),
    falsePositives: count('FALSE-POSITIVE'),
    acceptedRisks: count('ACCEPTED-RISK'),
    fixed: count('FIXED'),
    rejected: count('REJECTED'),
    findings: normalized,
  };
}

async function main() {
  const inputPath = process.argv[2];
  if (!inputPath) {
    process.stderr.write('Uso: node scripts/audit-harness-findings.mjs <findings.json>\n');
    process.exitCode = 2;
    return;
  }

  const parsed = JSON.parse(await readFile(inputPath, 'utf8'));
  const findings = Array.isArray(parsed) ? parsed : parsed.findings;
  if (!Array.isArray(findings)) {
    throw new TypeError('Il file deve contenere un array o una proprietà findings array.');
  }
  process.stdout.write(JSON.stringify(buildFindingLedger(findings), null, 2) + '\n');
}

if (import.meta.url === 'file://' + (process.argv[1] ?? '').replaceAll('\\', '/')) {
  await main();
}
