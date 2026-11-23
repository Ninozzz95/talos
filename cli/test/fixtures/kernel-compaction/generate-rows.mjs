/*
 * Judge v1597 (b): the kernel's REAL compaction rows, saved as a fixture with the kernel they come from. Every scene runs the
 * kernel's own `talosLavora` (talosHarness.desktop-hotfix.mjs) with a fake provider (`fetchDiRete`, no network) and keeps:
 *   - `live`: the rows it reported on `onGiro` (what the CLI's observer reads, provider-attempts.ts onCompaction);
 *   - `journal`: the same rows through the kernel's own journal mapping (`avviaSessione` with `talosLavoraFn` replaying them,
 *     agent-service.mjs:1611-1720), i.e. what `--resume` reads.
 * The summary text never goes in the fixture: a `record` keeps only the fields the journal mapping and the CLI read.
 * Run: node test/fixtures/kernel-compaction/generate-rows.mjs <repo root whose harness-ui is the kernel> <output json> [scene...]
 * with a FAKE profile (TEMP/TMP/HOME/USERPROFILE/APPDATA/LOCALAPPDATA under C:/T, judge v1610) and TALOS_HARNESS_UI_KEYRING=memoria
 * (the kernel reads no key here: `chiave` is a fake string). Named scenes run only those (the cleanup test runs the small one).
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.argv[2];
const out = process.argv[3];
const only = new Set(process.argv.slice(4));
if (!root || !out) throw new Error('usage: generate-rows.mjs <repo root> <output json> [scene...]');
const imp = (p) => import(pathToFileURL(join(root, p)).href);
const compattazione = await imp('harness-ui/src/kernel/compattazione-desktop.mjs');
delete process.env[compattazione.VARIABILE_TETTO_TOKEN];
const { talosLavora } = await imp('harness-ui/src/kernel/talosHarness.desktop-hotfix.mjs');
const { stimaTokenConversazione: estimate } = await imp('harness-ui/src/kernel/talosHarness.mjs');
const { avviaSessione } = await imp('harness-ui/src/agent-service.mjs');

const pair = (i, words) => [{ role: 'user', content: `Question ${i}: ${'word '.repeat(words)}` }, { role: 'assistant', content: `Answer ${i}: ${'word '.repeat(words)}` }];
const WORDS = 600;
const unit = estimate(pair(0, WORDS));
/** About `tokens` of history, in whole pairs, numbered from `from`. */
const history = (tokens, from = 0) => Array.from({ length: Math.max(1, Math.round(tokens / unit)) }, (_, i) => pair(from + i, WORDS)).flat();
const text = (content) => Response.json({ choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 10 } });
/** The fake provider: a summary request (no tools) gets a short summary; a turn gets «done», or, with `refuseOnce`, one refusal first. */
const provider = ({ refuseOnce = false } = {}) => {
  let refused = false;
  return async (_url, init) => {
    const body = JSON.parse(init.body);
    if (!body.tools?.length) return text(`## Summary\n${'Detail. '.repeat(20)}`);
    if (refuseOnce && !refused) {
      refused = true;
      return Response.json({ error: { code: 'context_length_exceeded', message: "This endpoint's maximum context length is 8192 tokens. However, you requested about 9000 tokens." } }, { status: 400 });
    }
    return Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: 'done' }, finish_reason: 'stop' }], usage: { prompt_tokens: estimate(body.messages), completion_tokens: 1 } });
  };
};
const RECORD_FIELDS = ['at', 'tokenPrima', 'tokenDopo', 'coveredThrough', 'misura', 'modello'];
const slim = (row) => {
  const copy = { ...row };
  if (row.record && typeof row.record === 'object') copy.record = Object.fromEntries(RECORD_FIELDS.filter((k) => k in row.record).map((k) => [k, row.record[k]]));
  return copy;
};
const COMPACTION = (row) => typeof row?.tipo === 'string' && row.tipo.startsWith('compattazione') && row.tipo !== 'compattazione-preparata';
/* judge v1610 (v1607): every folder made here is removed at the end of the run, whatever happens (one run had left 51 in the owner's TEMP) */
const folders = [];
const folder = (prefix) => { const made = mkdtempSync(join(tmpdir(), prefix)); folders.push(made); return made; };
const removeFolders = () => { for (const made of folders.splice(0)) rmSync(made, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }); };
const base = (cap, window) => ({ cartella: folder('talos-kernel-rows-'), modello: 'z-ai/glm-5.3-flash', chiave: 'fake',
  contestoDelProgetto: 'Project files:\n', scartoMisurato: 0, ...(cap ? { tettoCompattazioneToken: cap } : {}), ...(window ? { finestraToken: window } : {}) });

/** The journal rows the kernel's agent-service writes for these `onGiro` rows (its own mapping, nothing copied here). */
async function journalOf(rows) {
  const events = [];
  await avviaSessione({ cartella: folder('talos-kernel-journal-'), task: { consegna: 'x' }, modello: 'm', chiave: 'fake',
    onEvento: (event) => { events.push(event); },
    talosLavoraFn: async ({ onGiro }) => { for (const row of rows) onGiro(row); return { comeFinita: 'concluso', detto: 'ok', messaggiFinali: [], recordDiCompattazione: [] }; } });
  return events.filter((e) => e?.type === 'CUSTOM' && e.name === 'talos.compattazione').map((e) => ({ type: 'CUSTOM', name: e.name, value: e.value }));
}
async function scene(name, run) {
  const rows = [];
  await run((row) => { if (COMPACTION(row)) rows.push(row); });
  const live = rows.map(slim);
  return [name, { live, journal: await journalOf(rows) }];
}
/** A model summary prepared by turn 1 (instant compaction on), handed to turn 2 as already arrived. */
async function prepared(cap, window) {
  const soglie = compattazione.calcolaSoglie({ tettoToken: cap ?? undefined, finestraToken: window ?? undefined });
  const one = await talosLavora({ ...base(cap, window), task: { consegna: 'Go on.' }, messaggiIniziali: history(soglie.soglia * 0.95),
    compattazioneIstantanea: true, fetchDiRete: provider() });
  const ready = one.compattazionePronta ?? await one.compattazioneInPreparazione;
  if (!ready) throw new Error(`turn 1 prepared no summary (cap ${cap}, window ${window})`);
  return { soglie, one, ready, firma: { coveredThrough: ready.record.coveredThrough, impronta: ready.impronta, base: ready.base } };
}
async function adoptedAt(cap, window, where) {
  const { soglie, one, ready, firma } = await prepared(cap, window);
  const target = where === 'emergenza' ? soglie.emergenza * 1.04 : (soglie.soglia + soglie.emergenza) / 2;
  const already = estimate(one.messaggiFinali);
  const messages = [...one.messaggiFinali, ...history(Math.max(unit, target - already), 10_000), { role: 'user', content: 'Go on.' }];
  return (onRow) => talosLavora({ ...base(cap, window), task: { consegna: 'x' }, messaggiIniziali: messages, fetchDiRete: provider(),
    compattazioneInArrivo: Object.assign(Promise.resolve(ready), { firma }), onGiro: onRow });
}
async function quickAtEmergency(cap, window) {
  const soglie = compattazione.calcolaSoglie({ tettoToken: cap ?? undefined, finestraToken: window ?? undefined });
  const messages = [...history(soglie.emergenza * 1.04), { role: 'user', content: 'Go on.' }];
  return (onRow) => talosLavora({ ...base(cap, window), task: { consegna: 'x' }, messaggiIniziali: messages, fetchDiRete: provider(), onGiro: onRow });
}
async function refusedWithPrepared(cap) {
  /* below the threshold (turn 1 stopped at 95% of it), so only the provider's refusal compacts */
  const { one, ready, firma } = await prepared(cap, null);
  const messages = [...one.messaggiFinali, { role: 'user', content: 'Go on.' }];
  return (onRow) => talosLavora({ ...base(cap, null), task: { consegna: 'x' }, messaggiIniziali: messages, fetchDiRete: provider({ refuseOnce: true }),
    compattazioneInArrivo: Object.assign(Promise.resolve(ready), { firma }), onGiro: onRow });
}

const SCENES = [
  ['adopted-at-emergency-cap-200k', () => adoptedAt(200_000, null, 'emergenza')],
  ['adopted-at-emergency-window-1m', () => adoptedAt(null, 1_000_000, 'emergenza')],
  ['adopted-at-emergency-cap-200k-window-1m', () => adoptedAt(200_000, 1_000_000, 'emergenza')],
  ['adopted-at-threshold-cap-200k', () => adoptedAt(200_000, null, 'soglia')],
  ['quick-at-emergency-cap-200k', () => quickAtEmergency(200_000, null)],
  ['adopted-after-refusal-cap-8k', () => refusedWithPrepared(8_000)],
];
const scenes = {};
try {
  for (const [name, make] of SCENES) {
    if (only.size && !only.has(name)) continue;
    const [key, value] = await scene(name, await make());
    scenes[key] = value;
  }
} finally { removeFolders(); }
const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
const sha = (p) => createHash('sha256').update(readFileSync(join(root, p))).digest('hex');
const fixture = {
  kernel: {
    head: git('rev-parse', 'HEAD'),
    lastKernelCommit: git('log', '-1', '--format=%H', '--', 'harness-ui/src/kernel', 'harness-ui/src/agent-service.mjs'),
    sha256: Object.fromEntries(['harness-ui/src/kernel/talosHarness.desktop-hotfix.mjs', 'harness-ui/src/agent-service.mjs', 'harness-ui/src/kernel/compattazione-desktop.mjs'].map((p) => [p, sha(p)])),
  },
  thresholds: {
    'cap-200k': compattazione.calcolaSoglie({ tettoToken: 200_000 }),
    'window-1m': compattazione.calcolaSoglie({ finestraToken: 1_000_000 }),
    'cap-200k-window-1m': compattazione.calcolaSoglie({ tettoToken: 200_000, finestraToken: 1_000_000 }),
  },
  scenes,
};
writeFileSync(out, `${JSON.stringify(fixture, null, 1)}\n`);
for (const [name, s] of Object.entries(scenes)) console.log(name, s.live.map((r) => `${r.tipo}${r.motivo ? `:${r.motivo}` : ''}${r.istantanea ? ':istantanea' : ''}${r.ripiego ? ':ripiego' : ''}${r.soglia ? `:soglia=${r.soglia}` : ''}`).join(' | '));
