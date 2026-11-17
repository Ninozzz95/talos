#!/usr/bin/env node
/*
 * IL CRICCHETTO DELLE TAGLIE «DALLA BASE» — il comando.
 *
 *   node cancello.mjs --repo <cartella> --base <revisione> [--testa <revisione>] [--json]
 *       Giudica la testa (di serie HEAD) contro la base. Il GIUDICE è quello della base: questa cartella si estrae dal commit di
 *       base in una cartella a parte e si lancia quella copia (regola 1: il ramo non cambia il proprio esame). Se sulla base il
 *       cancello non c'è ancora, l'esito è «assente» e non si giudica niente.
 *   --giudice            sono io la copia estratta: giudico senza estrarre di nuovo (lo usa la coda di unione, che estrae da sé)
 *   --giudice-di-qui     giudica con QUESTA cartella invece che con quella della base (rigiocata, prima unione): l'esito lo dice
 *   --proposte a,b,c     quali proposte di bersaglio accendere (di serie quelle scritte nelle regole)
 *   --typescript <dir>   dove sta il parser di TypeScript (la coda passa quello delle sue librerie)
 *   --censimento --rev <revisione>   conta il censimento intero di una revisione (lento), anche per lente (CLI, Mobile)
 *
 * Uscita: 0 verde, avviso, spento o assente; 1 rosso (solo con l'interruttore su «blocca»); 2 uso sbagliato o errore.
 * Hermes: `hermes-agent-2026-11-01/.github/workflows/lint.yml:206-207` («Ratchet the PR against the base branch tip»,
 * `--base HEAD^1`) e `scripts/code_health/config.py:15-17` (blocking / advisory / off).
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REGOLE } from './regole.mjs';
import { gitTesto, leggiOggetti, risolvi } from './misura.mjs';
import { censimento, giudica } from './confronta.mjs';

/** Dove sta il cancello nel repo: la cartella che si estrae dalla base. */
export const CARTELLA_DEL_GIUDICE = 'harness-ui/tests/aiuto/taglie-base';

/**
 * Estrae il giudice dal commit di base in `dove` (una cartella a parte, fuori dal repo). Torna i file scritti; [] se sulla base il
 * cancello non c'è. Si leggono gli oggetti di git, mai la cartella di lavoro.
 */
export function estraiGiudice(repo, base, dove) {
  const sha = risolvi(repo, base);
  const voci = gitTesto(repo, ['ls-tree', '-r', '-z', sha, '--', `${CARTELLA_DEL_GIUDICE}/`]).split('\0').filter(Boolean)
    .map((v) => { const t = v.indexOf('\t'); const [modo, , oggetto] = v.slice(0, t).split(' '); return { modo, oggetto, percorso: v.slice(t + 1) }; })
    .filter((v) => v.modo !== '120000' && v.modo !== '160000');
  if (!voci.some((v) => v.percorso === `${CARTELLA_DEL_GIUDICE}/cancello.mjs`)) return [];
  const oggetti = leggiOggetti(repo, voci.map((v) => v.oggetto));
  const scritti = [];
  for (const v of voci) {
    const rel = v.percorso.slice(CARTELLA_DEL_GIUDICE.length + 1);
    if (rel.split('/').some((p) => p === '..' || p === '')) continue;
    const f = join(dove, rel);
    mkdirSync(dirname(f), { recursive: true });
    writeFileSync(f, oggetti.get(v.oggetto));
    scritti.push(f);
  }
  return scritti;
}

/** Il giudizio con l'interruttore: l'esito che il comando stampa. */
export function esitoDelCancello({ repo, base, testa = 'HEAD', proposte, percorsoTypescript = null, regole = REGOLE }) {
  if (regole.INTERRUTTORE === 'spento') return { esito: 'spento', interruttore: 'spento', violazioni: [] };
  const g = giudica({ repo, base, testa, regole, percorsoTypescript, proposte: proposte ?? regole.PROPOSTE });
  const esito = !g.violazioni.length ? 'verde' : regole.INTERRUTTORE === 'blocca' ? 'rosso' : 'avviso';
  return { esito, interruttore: regole.INTERRUTTORE, ...g };
}

function argomenti(argv) {
  const o = { opzioni: new Set(), valori: new Map() };
  const conValore = new Set(['--repo', '--base', '--testa', '--proposte', '--typescript', '--rev']);
  const senza = new Set(['--json', '--giudice', '--giudice-di-qui', '--censimento']);
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (conValore.has(a)) { if (i + 1 >= argv.length) throw new Error(`${a} vuole un valore`); o.valori.set(a, argv[i += 1]); }
    else if (senza.has(a)) o.opzioni.add(a);
    else throw new Error(`argomento sconosciuto: ${a}`);
  }
  return o;
}

function stampa(r, json) {
  if (json) { process.stdout.write(`${JSON.stringify(r)}\n`); return; }
  const righe = [`cricchetto delle taglie dalla base: ${r.esito.toUpperCase()}${r.giudice ? ` (giudice ${r.giudice})` : ''}${r.interruttore ? `, interruttore «${r.interruttore}»` : ''}`];
  if (r.motivo) righe.push(`  ${r.motivo}`);
  for (const v of r.violazioni ?? []) righe.push(`  [${v.regola}:${v.classe}] ${v.file}: ${v.testo}`);
  if (r.misure) righe.push(`  ${r.misure.contatiCambiati} file contati cambiati su ${r.misure.cambiati}, ${r.misure.ms} ms`);
  process.stdout.write(`${righe.join('\n')}\n`);
}

function principale() {
  const a = argomenti(process.argv.slice(2));
  const json = a.opzioni.has('--json');
  const repo = resolve(a.valori.get('--repo') ?? process.cwd());
  const percorsoTypescript = a.valori.get('--typescript') ?? null;
  if (a.opzioni.has('--censimento')) {
    process.stdout.write(`${JSON.stringify(censimento({ repo, rev: a.valori.get('--rev') ?? 'HEAD', percorsoTypescript }))}\n`);
    return 0;
  }
  const base = a.valori.get('--base');
  if (!base) throw new Error('manca --base <revisione>');
  const testa = a.valori.get('--testa') ?? 'HEAD';
  const proposte = a.valori.has('--proposte') ? a.valori.get('--proposte').split(',').map((s) => s.trim()).filter(Boolean) : undefined;
  if (a.opzioni.has('--giudice') || a.opzioni.has('--giudice-di-qui')) {
    const r = { giudice: a.opzioni.has('--giudice') ? 'della base' : 'di questa cartella (NON della base)', ...esitoDelCancello({ repo, base, testa, proposte, percorsoTypescript }) };
    stampa(r, json);
    return r.esito === 'rosso' ? 1 : 0;
  }
  /* di serie: il giudice è quello della BASE, estratto in una cartella a parte */
  const dove = mkdtempSync(join(tmpdir(), 'taglie-giudice-'));
  try {
    if (!estraiGiudice(repo, base, dove).length) {
      stampa({ esito: 'assente', violazioni: [], motivo: `sulla base ${base} il cancello non c'è (${CARTELLA_DEL_GIUDICE}): niente da giudicare; per provarlo lo stesso, --giudice-di-qui` }, json);
      return 0;
    }
    const passa = ['--giudice', '--repo', repo, '--base', base, '--testa', testa, ...(proposte ? ['--proposte', proposte.join(',')] : []),
      '--typescript', percorsoTypescript ?? join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'node_modules', 'typescript'), ...(json ? ['--json'] : [])];
    const p = spawnSync(process.execPath, [join(dove, 'cancello.mjs'), ...passa], { stdio: 'inherit', windowsHide: true });
    return p.status ?? 2;
  } finally {
    rmSync(dove, { recursive: true, force: true, maxRetries: 3 });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = principale(); } catch (e) { process.stderr.write(`cricchetto delle taglie: ${e?.message ?? e}\n`); process.exitCode = 2; }
}
