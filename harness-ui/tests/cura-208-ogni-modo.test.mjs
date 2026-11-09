/*
 * ⛔⛔ 04/11/2026 — DECISIONE 208 DELL'OWNER (registro, riga 355): cancellare TUTTO il progetto o una cartella sopra chiede il sì della
 *   persona in OGNI modo dei permessi, non solo in Accesso pieno: anche «Scrive nel progetto», e «Su richiesta» con «sempre» sul
 *   terminale (prima passavano senza carta: reperto M2 della revisione del blocco permessi 2). Le sottocartelle passano come prima.
 *
 * Fonti: Hermes `tools/approval.py:1079-1102` («Unconditional floors, BEFORE yolo / mode=off / cron approve-mode so no session-level
 *   setting can bypass them») e `:1170-1183` (il pavimento gira prima di `_yolo_active()` e della lista «sempre» permanente);
 *   code.claude.com/docs/en/permission-modes (letta il 04/11/2026): «Critical paths are the directories Claude Code protects from rm
 *   and rmdir commands… no allow rule approves one», e in acceptEdits «These still prompt: … Recognized rm and rmdir critical-path
 *   removals».
 *
 * Ambiente: casa FINTA (USERPROFILE, HOME), APPDATA e LOCALAPPDATA finti, cartelle temporanee vere, nessuna chiave. Il cancello solo
 *   DECIDE: nessun comando di queste prove gira davvero.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { basename, join } from 'node:path';

import { createSessionRegistry } from '../src/session-registry.mjs';
import { talosLavora, verificaPermessoScrittura, FRASI_DI_PERMESSO } from '../src/kernel/talosHarness.mjs';
import { cancellazioneCritica, dimenticaPercorsiVeri } from '../src/kernel/cancellazioni-critiche.mjs';
import { rimuoviCartellaDiProvaAttesa } from './aiuto/rimuovi-cartella-di-prova.mjs';

const WINDOWS = process.platform === 'win32';
const radice = realpathSync.native(mkdtempSync(join(tmpdir(), 'talos-208-')));
const casa = join(radice, 'casa');
mkdirSync(casa, { recursive: true });
const prima = { USERPROFILE: process.env.USERPROFILE, HOME: process.env.HOME, APPDATA: process.env.APPDATA, LOCALAPPDATA: process.env.LOCALAPPDATA, TALOS_HARNESS_UI_PROJECT_DIRS: process.env.TALOS_HARNESS_UI_PROJECT_DIRS };
process.env.USERPROFILE = casa;
process.env.HOME = casa;
process.env.APPDATA = join(radice, 'appdata-finto');
process.env.LOCALAPPDATA = join(radice, 'localappdata-finto');
delete process.env.TALOS_HARNESS_UI_PROJECT_DIRS;
assert.equal(homedir(), casa, 'premessa: la casa è quella finta');
test.after(async () => {
  for (const [k, v] of Object.entries(prima)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  dimenticaPercorsiVeri();
  await rimuoviCartellaDiProvaAttesa(radice);
});

let contatore = 0;
function progetto() {
  contatore += 1;
  const cartella = join(radice, 'lavoro', `p${contatore}`);
  mkdirSync(cartella, { recursive: true });
  return cartella;
}

/** Il cancello vero; la persona risponde `risposta` (o nessuno è davanti con `senzaCanale`). */
async function davanti(comando, { livelloAccesso, permessiPerAttrezzo, cartella = progetto(), risposta = true, senzaCanale = false } = {}) {
  const carte = [];
  const esito = await verificaPermessoScrittura({ tipo: 'shell', comando }, {
    livelloAccesso, cartella, consensiSessione: {}, ...(permessiPerAttrezzo ? { permessiPerAttrezzo } : {}),
    ...(senzaCanale ? {} : { chiediApprovazioneFn: async (a) => { carte.push(a); return risposta; } }),
  });
  return { esito, carte };
}

/** I modi che prima lasciavano passare la shell senza carta, e quello che la chiedeva senza segno. */
const MODI = [
  { nome: 'Scrive nel progetto', livelloAccesso: 'scrittura-progetto' },
  { nome: 'Scrive nel progetto + shell sempre', livelloAccesso: 'scrittura-progetto', permessiPerAttrezzo: { shell: 'sempre' } },
  { nome: 'Su richiesta + shell sempre («per la sessione»)', livelloAccesso: 'su-richiesta', permessiPerAttrezzo: { shell: 'sempre' } },
  { nome: 'Su richiesta', livelloAccesso: 'su-richiesta' },
  { nome: 'Scrive nell area + shell sempre', livelloAccesso: 'scrittura-area', permessiPerAttrezzo: { shell: 'sempre' } },
  { nome: 'Solo lettura + shell sempre', livelloAccesso: 'lettura', permessiPerAttrezzo: { shell: 'sempre' } },
];

function critici(cartella) {
  return [
    ['rm -rf .', 'progetto'],
    ['rm -rf ..', 'sopra-il-progetto'],
    ['rm -rf ./*', 'progetto'],
    [WINDOWS ? 'Remove-Item -Recurse -Force .' : 'rm -r -f .', 'progetto'],
    [`rm -rf "${cartella}"`, 'progetto'],
    /* M03: il sottoguscio separa i comandi anche fuori dall'Accesso pieno */
    [`(cd .. && rm -rf ${basename(cartella)})`, 'progetto'],
    ['echo x;(rm -rf ..)', 'sopra-il-progetto'],
  ];
}

test('208 ROSSA→VERDE — in ogni modo cancellare il progetto o una cartella sopra fa UNA carta col segno, e il «no» ferma il comando', async () => {
  for (const modo of MODI) {
    const cartella = progetto();
    for (const [comando, perche] of critici(cartella)) {
      const { esito, carte } = await davanti(comando, { ...modo, cartella, risposta: false });
      assert.equal(carte.length, 1, `${modo.nome}: una carta per ${comando}`);
      assert.equal(carte[0].cancellazioneCritica?.perche, perche, `${modo.nome}: la carta dice il posto (${comando})`);
      assert.match(carte[0].cancellazioneCritica?.fraseChiave ?? '', /^server\.approval\.criticalDelete\./u);
      assert.equal(esito.consentito, false, `${modo.nome}: col no non gira (${comando})`);
      assert.equal(esito.via, 'cancellazione-critica', `${modo.nome}: ${comando}`);
    }
  }
});

test('208 ROSSA→VERDE — un «sì» passa, ma solo dopo la carta; un «nega» della persona resta un rifiuto senza domanda', async () => {
  const { esito, carte } = await davanti('rm -rf .', { livelloAccesso: 'scrittura-progetto', permessiPerAttrezzo: { shell: 'sempre' }, risposta: true });
  assert.equal(carte.length, 1);
  assert.equal(esito.consentito, true);
  const spento = await davanti('rm -rf .', { livelloAccesso: 'scrittura-progetto', permessiPerAttrezzo: { shell: 'nega' } });
  assert.equal(spento.carte.length, 0, 'la shell spenta non chiede');
  assert.equal(spento.esito.consentito, false);
  assert.equal(spento.esito.via, 'permesso-per-attrezzo-nega');
});

test('208 ROSSA→VERDE — senza nessuno davanti si RIFIUTA, e al modello si dice il perché senza parlare di un modo che non è il suo', async () => {
  for (const modo of MODI.slice(0, 3)) {
    const { esito } = await davanti('rm -rf ..', { ...modo, senzaCanale: true });
    assert.equal(esito.consentito, false, modo.nome);
    assert.equal(esito.via, 'cancellazione-critica', modo.nome);
    assert.match(esito.motivo, /every permission mode/u, `${modo.nome}: il perché vale per ogni modo`);
  }
});

test('208 / M05 ROSSA→VERDE — due voci in TALOS_HARNESS_UI_PROJECT_DIRS: cancellare la SECONDA chiede anche in «Scrive nel progetto»', async () => {
  const cartella = progetto();
  const altra = progetto();
  process.env.TALOS_HARNESS_UI_PROJECT_DIRS = `${join(radice, 'nessuna')};${altra}`;
  dimenticaPercorsiVeri();
  try {
    assert.ok(cancellazioneCritica(`rm -rf "${altra}"`, { cartella }), 'premessa: il riconoscitore la vede');
    for (const modo of MODI.slice(0, 3)) {
      const { carte } = await davanti(`rm -rf "${altra}"`, { ...modo, cartella, risposta: false });
      assert.equal(carte.length, 1, modo.nome);
      assert.ok(carte[0].cancellazioneCritica, modo.nome);
    }
  } finally {
    delete process.env.TALOS_HARNESS_UI_PROJECT_DIRS;
    dimenticaPercorsiVeri();
  }
});

test('208 AL CONTRARIO — le sottocartelle e il lavoro di ogni giorno passano come prima, senza carta', async () => {
  for (const modo of MODI.slice(0, 3)) {
    const cartella = progetto();
    for (const comando of ['rm -rf ./build', 'rm -rf node_modules', 'rm -rf dist build', WINDOWS ? 'Remove-Item -Recurse -Force .\\dist' : 'rm -rf ./dist',
      'npm test', 'git status', 'git clean -fdx', `rm -rf "${join(cartella, 'out')}"`, 'echo "rm -rf ."', 'grep -rn "rm -rf .." src']) {
      const { esito, carte } = await davanti(comando, { ...modo, cartella });
      assert.equal(carte.length, 0, `${modo.nome}: ${comando}`);
      assert.equal(esito.consentito, true, `${modo.nome}: ${comando}`);
    }
  }
  /* «Su richiesta» senza «sempre» chiedeva già ogni comando: la carta di una sottocartella resta quella ordinaria, senza segno */
  const { carte } = await davanti('rm -rf ./build', { livelloAccesso: 'su-richiesta' });
  assert.equal(carte.length, 1);
  assert.equal(carte[0].cancellazioneCritica, undefined);
});

test('208 AL CONTRARIO — il banco (nessun livello, nessun canale) resta com\'era: nessun calcolo nuovo, nessun rifiuto nuovo', async () => {
  const { esito, carte } = await davanti('rm -rf .', { livelloAccesso: undefined, senzaCanale: true });
  assert.equal(carte.length, 0);
  assert.equal(esito.consentito, true);
  assert.equal(esito.via, 'nessun-vincolo');
});

/* ───────────── il filo intero: registro vero («Scrive nel progetto» scelto come la finestra), kernel vero, la persona dice NO ───────────── */

test('208 PERCORSO INTERO — registro → kernel in «Scrive nel progetto»: la carta arriva alla persona col segno, e il «no» arriva al modello', async () => {
  const cartella = progetto();
  let input = null;
  const registro = createSessionRegistry({
    guardaWorkspaceFn: () => () => {}, modello: 'm', chiave: 'k', cartellaEsisteFn: () => true,
    preparaEsecuzioneFn: () => ({ cartella, comandoProva: null, task: { id: 'task-208', consegna: 'prova' } }),
    caricaHooksFn: async () => ({ hooks: [] }),
    avviaSessioneFn: (i) => { input = i; i.onEvento({ type: 'RunStarted', threadId: 't', runId: 'r' }); return new Promise(() => {}); },
  });
  const { sessionId } = registro.avvia('task-208', { permessiScelto: 'Workspace write' });
  const carte = [];
  registro.iscriviti(sessionId, (e) => {
    if (e.type !== 'ApprovalRequested') return;
    carte.push(e);
    registro.rispondiApprovazione(sessionId, e.requestId, false);
  });
  /* `$(mktemp -d)` è la carta «sostituzione»: anche se sulla base girasse, cancellerebbe solo una cartella temporanea nuova */
  const comando = 'rm -rf "$(mktemp -d)"';
  const risposte = [{ role: 'assistant', content: null, tool_calls: [{ id: 'c0', type: 'function', function: { name: 'shell', arguments: JSON.stringify({ comando }) } }] },
    { role: 'assistant', content: 'fatto', tool_calls: [] }];
  let indice = 0;
  const visti = [];
  const fetchDiRete = async (_url, richiesta) => {
    visti.push(JSON.parse(richiesta?.body ?? '{}'));
    const scelta = risposte[Math.min(indice++, risposte.length - 1)];
    return { ok: true, status: 200, json: async () => ({ choices: [{ message: scelta }], usage: { prompt_tokens: 1, completion_tokens: 1 } }), text: async () => '' };
  };
  await talosLavora({
    cartella, task: { consegna: 'prova' }, modello: 'x', chiave: 'y', fetchDiRete,
    livelloAccesso: input.livelloAccesso, permessiPerAttrezzo: input.permessiPerAttrezzo, chiediApprovazioneFn: input.chiediApprovazioneFn, hookFn: input.hookFn,
  });
  assert.equal(input.livelloAccesso, 'scrittura-progetto', 'premessa: il registro dice «Scrive nel progetto»');
  assert.equal(carte.length, 1, 'una carta');
  assert.equal(carte[0].azione?.cancellazioneCritica?.perche, 'sostituzione', 'col segno');
  const risultato = JSON.stringify(visti.at(-1)?.messages?.filter((m) => m.role === 'tool') ?? []);
  assert.doesNotMatch(risultato, /"exitCode":0|uscita 0/u, 'il comando non è girato');
});

test('208 ROSSA→VERDE — la frase della carta non dice più «anche con Accesso pieno» come se valesse solo lì (inglese nel nucleo)', () => {
  const chiavi = Object.keys(FRASI_DI_PERMESSO).filter((k) => k.startsWith('server.approval.criticalDelete.'));
  assert.equal(chiavi.length, 11);
  for (const k of chiavi) {
    assert.doesNotMatch(FRASI_DI_PERMESSO[k], /Even with Full access/u, k);
    assert.match(FRASI_DI_PERMESSO[k], /With any permission, Full access included, this needs your yes every time\.$/u, k);
  }
});

test('208 ROSSA→VERDE — anche l\'interfaccia dice la regola nuova, in inglese E in italiano (le 11 frasi della carta)', async () => {
  const { default: testi } = await import('../frontend/src/i18n/testi/server.js');
  for (const [lingua, fine] of [['en', /With any permission, Full access included, this needs your yes every time\.$/u], ['it', /Con qualsiasi permesso, anche con Accesso pieno, serve il tuo sì ogni volta\.$/u]]) {
    const chiavi = Object.keys(testi[lingua]).filter((k) => k.startsWith('approval.criticalDelete.'));
    assert.equal(chiavi.length, 11, lingua);
    for (const k of chiavi) assert.match(testi[lingua][k], fine, `${lingua} ${k}`);
  }
});
