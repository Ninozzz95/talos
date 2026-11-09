/*
 * CU-OFF — computer use SPENTO di serie, come «Anteprima» (decisione 310 dell'owner, 06/11/2026: «computer use nel rilascio come
 * "Anteprima" spento di serie (acceso solo a mano) finché non sono chiusi i 2 critici e i 13 alti»).
 *
 * Le porte si chiedono come le chiede `server.mjs` a una persona che non ha mai scelto (nessuna impostazione salvata): solo il file dei
 * luoghi, nessun `acceso`. Il modello non deve vedere `computer_use` né `computer_use_places_*`; le rotte dei luoghi rispondono 404; il
 * dispositivo non vede `computer-use.places.*`. Sulla candidata del 06/11 sera (costante accesa, decisione 129) questa prova è ROSSA.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { existsSync, mkdtempSync, readdirSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { porteDelComputerUse } from '../src/computer-use/interruttore.mjs';
import { creaImpostazioneComputerUse } from '../src/computer-use/impostazione.mjs';
import { createHttpApp } from '../src/http-app.mjs';
import { creaOperazioni } from '../src/remoto/operazioni.mjs';
import { createSessionRegistry } from '../src/session-registry.mjs';
import { NOME_COMPUTER_USE } from '../src/kernel/talosHarness.mjs';
import { rimuoviCartellaDiProva, rimuoviCartellaDiProvaAttesa } from './aiuto/rimuovi-cartella-di-prova.mjs';

const ATTREZZI_CU = [NOME_COMPUTER_USE, 'computer_use_places_list', 'computer_use_places_remove', 'computer_use_places_clear'];
const aiutanteFinto = () => ({ apri: async () => ({ ok: false, motivo: 'impronta-non-fissata' }), chiama: async () => { throw new Error('mai'); }, compito: () => () => {} });

function cartella(t) {
  const c = mkdtempSync(join(tmpdir(), 'talos-cu-spento-'));
  t.after(() => rimuoviCartellaDiProva(c));
  return c;
}

/** Un giro finto del nucleo: si guarda solo che cosa il registro gli passa. */
async function registroConPorte(t, porte) {
  const radice = mkdtempSync(join(tmpdir(), 'talos-cu-spento-reg-'));
  const progetto = join(radice, 'progetto');
  await mkdir(progetto, { recursive: true });
  const giri = [];
  const registro = createSessionRegistry({
    avviaSessioneFn: async (input) => { giri.push(input); input.onEvento({ type: 'RunStarted', threadId: 't1', runId: `r${giri.length}` }); return new Promise(() => {}); },
    modello: 'openai/gpt-x', chiave: 'k', guardaWorkspaceFn: () => () => {},
    preparaEsecuzioneFn: (taskId) => ({ cartella: progetto, comandoProva: 'npm test', task: { id: taskId, consegna: 'apri il blocco note' } }),
    attrezziKernelFn: async () => ({ base: [{ nome: 'shell', descrizione: 'x', tokenSchemaStimati: 1 }],
      estesi: [...ATTREZZI_CU, 'goal_status'].map((nome) => ({ nome, descrizione: nome, tokenSchemaStimati: 1 })) }),
    ricercaWebFn: () => ({ ricercaWeb: null }),
    ...porte.perNucleo,
  });
  const { sessionId } = registro.avvia('task-vero', {});
  t.after(() => rimuoviCartellaDiProvaAttesa(radice));
  return { registro, sessionId, giri };
}

test('CU-OFF-01: di serie (nessuna scelta salvata) il modello NON vede computer_use né i luoghi, e la scheda degli attrezzi non li elenca', async (t) => {
  const c = cartella(t);
  const porte = porteDelComputerUse({ fileLuoghi: join(c, '.computer-use-luoghi.json'), aiutante: aiutanteFinto() });
  const { registro, giri } = await registroConPorte(t, porte);
  const input = giri[0];
  assert.ok(input, 'il giro è partito');
  assert.equal(input.onComputerUseFn, undefined, 'nessun ospite del computer use al nucleo');
  assert.equal(input.onLuoghiFn, undefined, 'nessun ospite dei luoghi al nucleo');
  for (const nome of ATTREZZI_CU) assert.equal((input.strumentiEstesi ?? []).includes(nome), false, `${nome} non è nell'elenco del giro`);
  const { attrezzi } = await registro.elencaAttrezziPredefiniti();
  const nomi = attrezzi.map((a) => a.nome);
  assert.ok(nomi.includes('goal_status'), 'la scheda elenca gli altri estesi');
  for (const nome of ATTREZZI_CU) assert.equal(nomi.includes(nome), false, `${nome} non è nella scheda degli attrezzi`);
});

test('CU-OFF-02: di serie le rotte dei luoghi rispondono 404 come una rotta inventata, il dispositivo non vede le operazioni, nessun file', async (t) => {
  const c = cartella(t);
  const fileLuoghi = join(c, '.computer-use-luoghi.json');
  const porte = porteDelComputerUse({ fileLuoghi, aiutante: aiutanteFinto() });
  const s = createServer(createHttpApp({ senzaGettone: 'prove', staticHandler: async () => null, ...porte.perHttp }));
  await new Promise((r) => s.listen(0, '127.0.0.1', r));
  t.after(() => new Promise((r) => { s.closeAllConnections(); s.close(r); }));
  const base = `http://127.0.0.1:${s.address().port}`;
  const finestra = { origin: base, 'sec-fetch-site': 'same-origin', 'content-type': 'application/json' };
  const chiedi = async (p, method = 'GET', corpo) => {
    const r = await fetch(base + p, { method, headers: finestra, body: corpo === undefined ? undefined : JSON.stringify(corpo) });
    return [r.status, (await r.json().catch(() => null))?.error?.code ?? null];
  };
  const P = '/api/v1/computer-use/remembered-places';
  for (const [p, m, corpo] of [[P, 'GET'], [`${P}/remove`, 'POST', { tipo: 'dominio', nome: 'x.example' }], [`${P}/clear`, 'POST', { conferma: true }]]) {
    assert.deepEqual(await chiedi(p, m, corpo), [404, 'NOT_FOUND'], `${m} ${p}`);
  }
  const op = creaOperazioni({ chiama: async () => ({ dati: null }), sessionRegistry: null, iscriviConRigiocata: null,
    cartelle: { consentita: async () => false, descrivi: async () => null }, notifiche: null, ...porte.perRemoto });
  assert.equal(op.elenco().some((nome) => nome.startsWith('computer-use.')), false, 'il dispositivo non vede computer-use.places.*');
  assert.equal(existsSync(fileLuoghi), false);
  assert.deepEqual(readdirSync(c), []);
});

test('CU-OFF-03: dal vivo come nel server — acceso a mano gli attrezzi compaiono al giro dopo, rispento spariscono, senza riavviare', async (t) => {
  const c = cartella(t);
  const imp = creaImpostazioneComputerUse({ file: join(c, '.computer-use-impostazione.json') });
  const porte = porteDelComputerUse({ fileLuoghi: join(c, '.computer-use-luoghi.json'), acceso: imp.acceso, aiutante: aiutanteFinto() });
  const radice = mkdtempSync(join(tmpdir(), 'talos-cu-spento-vivo-'));
  t.after(() => rimuoviCartellaDiProvaAttesa(radice));
  const progetto = join(radice, 'progetto');
  await mkdir(progetto, { recursive: true });
  const giri = [];
  const registro = createSessionRegistry({
    avviaSessioneFn: async (input) => { giri.push(input); input.onEvento({ type: 'RunStarted', threadId: `t${giri.length}`, runId: `r${giri.length}` }); return new Promise(() => {}); },
    modello: 'openai/gpt-x', chiave: 'k', guardaWorkspaceFn: () => () => {},
    preparaEsecuzioneFn: (taskId) => ({ cartella: progetto, comandoProva: 'npm test', task: { id: taskId, consegna: 'apri il blocco note' } }),
    attrezziKernelFn: async () => ({ base: [{ nome: 'shell', descrizione: 'x', tokenSchemaStimati: 1 }],
      estesi: [...ATTREZZI_CU, 'goal_status'].map((nome) => ({ nome, descrizione: nome, tokenSchemaStimati: 1 })) }),
    ricercaWebFn: () => ({ ricercaWeb: null }),
    ...porte.perNucleo,
  });
  const nellaScheda = async () => (await registro.elencaAttrezziPredefiniti()).attrezzi.map((a) => a.nome).filter((n) => ATTREZZI_CU.includes(n)).sort();
  const nelGiro = (input) => ({ cu: typeof input.onComputerUseFn, luoghi: typeof input.onLuoghiFn, nomi: (input.strumentiEstesi ?? []).filter((n) => ATTREZZI_CU.includes(n)).sort() });
  const SPENTO = { cu: 'undefined', luoghi: 'undefined', nomi: [] };
  registro.avvia('task-1', {});
  assert.deepEqual(nelGiro(giri[0]), SPENTO, 'di serie spento');
  assert.deepEqual(await nellaScheda(), []);
  await imp.scrivi({ acceso: true });
  registro.avvia('task-2', {});
  assert.deepEqual(nelGiro(giri[1]), { cu: 'function', luoghi: 'function', nomi: [NOME_COMPUTER_USE, 'computer_use_places_list', 'computer_use_places_remove'] }, 'acceso a mano: al giro dopo il modello li vede');
  assert.deepEqual(await nellaScheda(), [NOME_COMPUTER_USE, 'computer_use_places_list', 'computer_use_places_remove'], 'e la scheda degli attrezzi li elenca');
  await imp.scrivi({ acceso: false });
  registro.avvia('task-3', {});
  assert.deepEqual(nelGiro(giri[2]), SPENTO, 'rispento: spariscono senza riavviare');
  assert.deepEqual(await nellaScheda(), []);
  /* un giro partito acceso e spento a metà: l'attrezzo risponde «spento», nessun passo */
  assert.match((await giri[1].onComputerUseFn(NOME_COMPUTER_USE, { task: 'open Notepad' }, { fase: 'esegui', toolCallId: 'x' })).testo, /turned off in Settings/u);
});
