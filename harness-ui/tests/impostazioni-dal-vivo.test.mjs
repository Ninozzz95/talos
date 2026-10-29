/*
 * ⭐ Owner 27/10/2026: «da remoto il dispositivo collegato deve poter istantaneamente e robustamente cambiare tutte le impostazioni e sul
 *   pc devono essere visibili subito come modello, ragionamento etc, tutte queste cose devono essere assolutamente testate e robuste».
 *   Prima nessuna porta delle impostazioni lo diceva alle finestre aperte. Ora ogni cambio vero manda la FOTOGRAFIA intera
 *   (`talos.impostazioni-sessione`, campo `istantanea`), come Codex `thread/settings/updated` (bespoke_event_handling.rs:1238-1254).
 * ⭐ E «quando approvo un piano con accesso pieno non si cambia da solo in accesso pieno» → owner: «Resta in Accesso pieno».
 * Contratto con Mobile e CLI: handoff `CENSIMENTO-PARITA-REMOTO-2026-10-23.md` §F.
 * Ogni regola ha il suo verso contrario.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { createHttpApp } from '../src/http-app.mjs';
import { improntaPiano } from '../src/plan-contract.mjs';
import { creaChiamataInterna } from '../src/remoto/chiamata-interna.mjs';
import { createSessionRegistry as createSessionRegistryReale } from '../src/session-registry.mjs';
import { attendiScritture } from '../src/session-store.mjs';
import { TaskCatalogError } from '../src/task-catalog.mjs';
import { cartellaDiProva } from './aiuto/cartelle-di-prova.mjs';

function createSessionRegistry(opzioni) {
  return createSessionRegistryReale({ guardaWorkspaceFn: () => () => {}, modello: 'm', chiave: 'k',
    preparaEsecuzioneFn: (taskId) => {
      if (taskId !== 'task-vero') throw new TaskCatalogError(`Task non ammesso: ${taskId}`);
      return { cartella: '/tmp/x', comandoProva: 'npm test', task: { id: taskId, consegna: 'fai il lavoro' } };
    },
    preparaEsecuzioneLiberaFn: (_c, { cartellaLibera, consegna }) => ({ cartella: cartellaLibera, comandoProva: null,
      task: { id: 'libero:x', consegna, consegnaCorta: String(consegna).slice(0, 80) } }),
    cartellaEsisteFn: () => true, ...opzioni });
}
function giriFinti() {
  const giri = [];
  return {
    avviaSessioneFn(input) {
      let risolvi;
      const promessa = new Promise((resolve) => { risolvi = resolve; });
      giri.push({ input, risolvi });
      input.onEvento({ type: 'RunStarted', threadId: `t${giri.length}`, runId: `r${giri.length}` });
      return promessa;
    },
    giro(i) { return giri[i]; },
    concludi(i) { giri[i].input.onEvento({ type: 'RunFinished' }); giri[i].risolvi({ ok: true, esito: { comeFinita: 'concluso', detto: 'ok', messaggiFinali: [{ role: 'user', content: 'x' }] } }); },
    get quanti() { return giri.length; },
  };
}
async function svuota(cartellaStore) {
  for (let i = 0; i < 3; i += 1) {
    try { await attendiScritture({ cartellaStore }); } catch { /* il resto lo dicono le prove */ }
    await new Promise((r) => setImmediate(r));
  }
}
const annunci = (registro, sessionId) => registro.esporta(sessionId).eventi
  .filter((e) => e.type === 'CUSTOM' && e.name === 'talos.impostazioni-sessione').map((e) => e.value);

function banco(opzioni = {}) {
  const giri = giriFinti();
  const registro = createSessionRegistry({ avviaSessioneFn: giri.avviaSessioneFn, ...opzioni });
  const { sessionId } = registro.avvia('task-vero', { permessiScelto: opzioni.permessi ?? 'Workspace write', ...(opzioni.piano ? { modalitaOperativaScelta: 'piano' } : {}) });
  const httpApp = createHttpApp({ staticHandler: async () => null, sessionRegistry: registro });
  const chiama = creaChiamataInterna({ httpApp, porta: 4999 });
  return { giri, registro, sessionId, chiama };
}

test('IMP-01 un cambio dal PC (rotta della finestra): l\'annuncio porta la fotografia INTERA, salvata nella storia, e la risposta la stessa', async () => {
  const b = banco();
  b.giri.concludi(0);
  await new Promise((r) => setImmediate(r));
  const prima = annunci(b.registro, b.sessionId).length;
  const r = await b.chiama({ metodo: 'POST', percorso: `/api/v1/sessions/${b.sessionId}/settings`, corpo: { modello: 'z-ai/glm-5.3-flash', reasoning: { effort: 'high' } } });
  assert.equal(r.stato, 200);
  const nuovi = annunci(b.registro, b.sessionId).slice(prima);
  assert.equal(nuovi.length, 1, 'un cambio, un annuncio');
  const [a] = nuovi;
  assert.equal(a.motivo, 'impostazioni');
  assert.deepEqual(a.origine, { tipo: 'pc' });
  assert.equal(a.istantanea.modello, 'z-ai/glm-5.3-flash');
  assert.deepEqual(a.istantanea.reasoning, { effort: 'high' });
  assert.equal(a.istantanea.permessi, 'Workspace write');
  assert.equal(a.permessi, 'Workspace write', 'i campi in cima restano, per chi li legge già (finestra e CLI)');
  assert.equal(a.modalitaOperativa, 'normale');
  for (const campo of ['modelloPlanner', 'permessiPerAttrezzo', 'fallbackProviders', 'doveGiranoIComandi', 'comandiNellaConversazione', 'nome', 'versione']) {
    assert.ok(Object.hasOwn(a.istantanea, campo), `fotografia intera: manca ${campo}`);
  }
  assert.ok(Number.isSafeInteger(a.istantanea.versione) && a.istantanea.versione > 0);
  assert.deepEqual(r.dati.istantanea, a.istantanea, 'la risposta porta la stessa fotografia (la base di chi ha cambiato)');
  assert.equal(b.registro.elenca().find((s) => s.sessionId === b.sessionId).versioneImpostazioni, a.istantanea.versione, 'l\'elenco dà la base a chi apre');
  const durevole = b.registro.esporta(b.sessionId).eventi.findLast((e) => e.name === 'talos.impostazioni-sessione');
  assert.ok(Number.isSafeInteger(durevole._sequenza), 'durevole: ha il suo numero, chi si ricollega lo riceve');
});

test('IMP-02 AL CONTRARIO: la stessa scelta ripetuta non manda niente (come Codex: solo se è cambiato)', async () => {
  const b = banco();
  b.giri.concludi(0);
  await b.chiama({ metodo: 'POST', percorso: `/api/v1/sessions/${b.sessionId}/settings`, corpo: { modello: 'x/y' } });
  const dopoIlPrimo = annunci(b.registro, b.sessionId).length;
  await b.chiama({ metodo: 'POST', percorso: `/api/v1/sessions/${b.sessionId}/settings`, corpo: { modello: 'x/y' } });
  assert.equal(annunci(b.registro, b.sessionId).length, dopoIlPrimo);
});

test('IMP-03 un cambio da un dispositivo collegato: l\'origine è il dispositivo, non il PC', async () => {
  const b = banco();
  b.giri.concludi(0);
  await b.chiama({ metodo: 'POST', percorso: `/api/v1/sessions/${b.sessionId}/settings`, corpo: { permessi: 'Full access' },
    origineRemota: { tipo: 'telefono', nome: 'Pad', dispositivoId: 'd-1' } });
  const a = annunci(b.registro, b.sessionId).at(-1);
  assert.deepEqual(a.origine, { tipo: 'dispositivo', dispositivoId: 'd-1' });
  assert.equal(a.istantanea.permessi, 'Full access');
});

test('IMP-03b un dispositivo che cambia SOLO il modello lascia l\'Accesso pieno com\'era (la CLI l\'ha trovato da lei, FA-LIVE-01, 27/10)', async () => {
  const b = banco({ permessi: 'Full access' });
  b.giri.concludi(0);
  await b.chiama({ metodo: 'POST', percorso: `/api/v1/sessions/${b.sessionId}/settings`, corpo: { modello: 'x/y' },
    origineRemota: { tipo: 'telefono', nome: 'Pad', dispositivoId: 'd-1' } });
  const a = annunci(b.registro, b.sessionId).at(-1);
  assert.equal(a.istantanea.modello, 'x/y', 'premessa: il cambio di modello c\'è stato');
  assert.equal(a.istantanea.permessi, 'Full access', 'il permesso è tornato indietro con un cambio di solo modello');
});

test('IMP-04 VENTI cambi insieme: le versioni crescono senza buchi d\'ordine, e l\'ultima fotografia è lo stato vero', async () => {
  const b = banco();
  b.giri.concludi(0);
  const sforzi = ['low', 'medium', 'high'];
  await Promise.all(Array.from({ length: 20 }, (_, i) => b.chiama({ metodo: 'POST', percorso: `/api/v1/sessions/${b.sessionId}/settings`,
    corpo: { modello: `m/${i}`, reasoning: { effort: sforzi[i % 3] } } })));
  const tutti = annunci(b.registro, b.sessionId).filter((a) => a.motivo === 'impostazioni');
  assert.equal(tutti.length, 20);
  for (let i = 1; i < tutti.length; i += 1) assert.ok(tutti[i].istantanea.versione > tutti[i - 1].istantanea.versione, `versione ${i} cresce`);
  const vero = b.registro.elenca().find((s) => s.sessionId === b.sessionId);
  assert.equal(tutti.at(-1).istantanea.modello, vero.modello);
  assert.deepEqual(tutti.at(-1).istantanea.reasoning, vero.reasoning);
});

test('IMP-05 a giro VIVO: il cambio di modello si annuncia subito (vale dal giro dopo, ma si vede adesso)', async () => {
  const b = banco();
  await b.chiama({ metodo: 'POST', percorso: `/api/v1/sessions/${b.sessionId}/settings`, corpo: { modello: 'vivo/m' } });
  assert.equal(annunci(b.registro, b.sessionId).at(-1)?.istantanea?.modello, 'vivo/m');
});

test('IMP-06 il titolo e dove girano i comandi mandano la stessa fotografia; un titolo uguale no', async () => {
  const b = banco();
  b.giri.concludi(0);
  const r = await b.chiama({ metodo: 'POST', percorso: `/api/v1/sessions/${b.sessionId}/rename`, corpo: { nome: 'Nome nuovo' } });
  assert.equal(r.dati.istantanea.nome, 'Nome nuovo');
  assert.equal(annunci(b.registro, b.sessionId).at(-1).motivo, 'nome');
  assert.equal(annunci(b.registro, b.sessionId).at(-1).istantanea.nome, 'Nome nuovo');
  const quanti = annunci(b.registro, b.sessionId).length;
  await b.chiama({ metodo: 'POST', percorso: `/api/v1/sessions/${b.sessionId}/rename`, corpo: { nome: 'Nome nuovo' } });
  assert.equal(annunci(b.registro, b.sessionId).length, quanti, 'lo stesso titolo non si annuncia');
  await b.registro.doveGiranoIComandi(b.sessionId, 'windows');
  assert.equal(annunci(b.registro, b.sessionId).at(-1).istantanea.doveGiranoIComandi, 'windows');
});

test('IMP-07 la versione non torna indietro dopo un riavvio', async () => {
  const cartellaStore = cartellaDiProva('talos-imp-riavvio-');
  const giri = giriFinti();
  const registro = createSessionRegistry({ cartellaStore, avviaSessioneFn: giri.avviaSessioneFn });
  const { sessionId } = registro.avvia('task-vero', { permessiScelto: 'Workspace write' });
  giri.concludi(0);
  await new Promise((r) => setImmediate(r));
  await registro.aggiornaImpostazioni(sessionId, { modello: 'prima/m' });
  const versione = registro.impostazioniCorrenti(sessionId).versione;
  await svuota(cartellaStore);
  const riavviato = createSessionRegistry({ cartellaStore, avviaSessioneFn: giriFinti().avviaSessioneFn });
  await riavviato.ripristina();
  assert.ok(riavviato.impostazioniCorrenti(sessionId).versione >= versione, 'ripristinata dalla riga');
  await riavviato.aggiornaImpostazioni(sessionId, { modello: 'dopo/m' });
  assert.ok(riavviato.impostazioniCorrenti(sessionId).versione > versione, 'il cambio dopo il riavvio va avanti');
  const salvato = riavviato.esporta(sessionId).eventi.find((e) => e.name === 'talos.impostazioni-sessione' && e.value?.istantanea?.modello === 'prima/m');
  assert.ok(salvato, "l'annuncio di prima del riavvio è nella storia: chi si ricollega lo riceve");
  await svuota(cartellaStore);
});

const PIANO = '## Piano\n1. Leggo `a.txt`.\n2. Scrivo `b.txt`.';
const STORIA = [
  { role: 'system', content: 'istruzioni' },
  { role: 'user', content: 'pianifica' },
  { role: 'assistant', content: '', tool_calls: [{ id: 'call_piano', type: 'function', function: { name: 'present_plan', arguments: JSON.stringify({ plan: PIANO }) } }] },
];
async function pianoInAttesa(permessi) {
  const b = banco({ permessi, piano: true });
  const attesa = b.giri.giro(0).input.presentaPianoFn({ plan: PIANO, toolCallId: 'call_piano', messaggi: STORIA });
  const { requestId } = b.registro.esporta(b.sessionId).eventi.filter((e) => e.name === 'talos.plan').at(-1).value;
  return { ...b, attesa, requestId, hash: improntaPiano(PIANO) };
}
const permessiDi = (b, id = b.sessionId) => b.registro.elenca().find((s) => s.sessionId === id).permessi;

test('PIANO-PIENO-01 in Accesso pieno, «Procedi accettando le modifiche» RESTA in Accesso pieno (owner 27/10), e il kernel lo sa', async () => {
  const b = await pianoInAttesa('Full access');
  assert.deepEqual(await b.registro.rispondiPiano(b.sessionId, { requestId: b.requestId, decisione: 'procedi-accetta-modifiche', hash: b.hash }), { ok: true });
  const scelta = await b.attesa;
  assert.equal(permessiDi(b), 'Full access');
  assert.equal(scelta.livelloAccesso, 'accesso-pieno', 'il giro che riparte scrive senza chiedere ovunque');
  const a = annunci(b.registro, b.sessionId).at(-1);
  assert.equal(a.motivo, 'piano-approvato');
  assert.equal(a.permessi, 'Full access');
  assert.equal(a.istantanea.permessi, 'Full access');
});

test('PIANO-PIENO-02 AL CONTRARIO: da «Scrittura nel progetto» si resta lì; da Sola lettura si sale a «Scrittura nel progetto» come prima', async () => {
  const w = await pianoInAttesa('Workspace write');
  await w.registro.rispondiPiano(w.sessionId, { requestId: w.requestId, decisione: 'procedi-accetta-modifiche', hash: w.hash });
  assert.equal(permessiDi(w), 'Workspace write');
  const r = await pianoInAttesa('Read only');
  await r.registro.rispondiPiano(r.sessionId, { requestId: r.requestId, decisione: 'procedi-accetta-modifiche', hash: r.hash });
  assert.equal(permessiDi(r), 'Workspace write');
});

test('PIANO-PIENO-03 «Procedi chiedendo conferma» chiede anche da Accesso pieno: è la scelta esplicita di farsi chiedere', async () => {
  const b = await pianoInAttesa('Full access');
  await b.registro.rispondiPiano(b.sessionId, { requestId: b.requestId, decisione: 'procedi-con-conferma', hash: b.hash });
  assert.equal(permessiDi(b), 'On request');
});

test('PIANO-PIENO-04 la conversazione pulita da Accesso pieno nasce in Accesso pieno; da «Scrittura nel progetto» come prima', async () => {
  for (const [da, atteso] of [['Full access', 'Full access'], ['Workspace write', 'Workspace write']]) {
    const b = await pianoInAttesa(da);
    await b.registro.rispondiPiano(b.sessionId, { requestId: b.requestId, decisione: 'conversazione-pulita', hash: b.hash });
    const nuova = b.registro.elenca().find((s) => s.sessionId !== b.sessionId);
    assert.ok(nuova, 'la conversazione pulita esiste');
    assert.equal(nuova.permessi, atteso, `da ${da}`);
  }
});

test('IMP-08 dal dispositivo anche «dove girano i comandi» e il loro racconto (operazioni remote nuove), con la stessa fotografia', async () => {
  const { creaOperazioni } = await import('../src/remoto/operazioni.mjs');
  const { iscriviConRigiocata } = await import('../src/iscrizione-sessione.mjs');
  const b = banco();
  b.giri.concludi(0);
  await new Promise((r) => setImmediate(r));
  const operazioni = creaOperazioni({ chiama: b.chiama, sessionRegistry: b.registro, iscriviConRigiocata });
  const contesto = { dispositivo: { id: 'd-1', nome: 'Pad' }, iscrizioni: new Map(), iscrivi: () => async () => {} };
  await operazioni.esegui('session.commands-location', { sessionId: b.sessionId, corpo: { dove: 'windows' } }, contesto);
  assert.equal(annunci(b.registro, b.sessionId).at(-1).istantanea.doveGiranoIComandi, 'windows');
  await operazioni.esegui('session.commands-in-chat', { sessionId: b.sessionId, corpo: { acceso: true } }, contesto);
  assert.equal(annunci(b.registro, b.sessionId).at(-1).istantanea.comandiNellaConversazione, true);
  await assert.rejects(operazioni.esegui('session.commands-location', { sessionId: 'non-esiste', corpo: { dove: 'windows' } }, contesto), { code: 'NOT_FOUND' });
});

test('IMP-09 dal dispositivo anche l\'obiettivo (/goal): leggere, impostare, mettere in pausa, togliere; un\'azione inventata no', async () => {
  const { creaOperazioni } = await import('../src/remoto/operazioni.mjs');
  const { iscriviConRigiocata } = await import('../src/iscrizione-sessione.mjs');
  const b = banco({ obiettiviNellaChat: true }); // come il desktop (l'host che accende gli obiettivi nella chat)
  b.giri.concludi(0);
  /* l'obiettivo vale nelle conversazioni libere (non in quelle di un compito del catalogo): una libera, come quelle del dispositivo */
  const { sessionId: libera } = b.registro.avviaLibero({ cartellaLibera: cartellaDiProva('talos-imp-goal-'), consegna: 'ciao' });
  b.giri.concludi(1);
  await new Promise((r) => setImmediate(r));
  b.sessionId = libera;
  const operazioni = creaOperazioni({ chiama: b.chiama, sessionRegistry: b.registro, iscriviConRigiocata });
  const contesto = { dispositivo: { id: 'd-1', nome: 'Pad' }, iscrizioni: new Map(), iscrivi: () => async () => {} };
  assert.equal((await operazioni.esegui('session.goal', { sessionId: b.sessionId }, contesto)).obiettivo, null);
  const impostato = await operazioni.esegui('session.goal.set', { sessionId: b.sessionId, corpo: { testo: 'finisci i test' } }, contesto);
  assert.equal(impostato.obiettivo?.testo, 'finisci i test');
  const inPausa = await operazioni.esegui('session.goal.action', { sessionId: b.sessionId, action: 'pausa', corpo: {} }, contesto);
  assert.equal(inPausa.obiettivo?.stato, 'in-pausa');
  const tolto = await operazioni.esegui('session.goal.action', { sessionId: b.sessionId, action: 'togli', corpo: {} }, contesto);
  assert.equal(tolto.obiettivo, null);
  await assert.rejects(operazioni.esegui('session.goal.action', { sessionId: b.sessionId, action: '../settings', corpo: {} }, contesto), { code: 'BAD_MESSAGE' });
});

test('IMP-10 dal dispositivo anche il motore del contesto della conversazione: le due operazioni arrivano alle rotte del PC (GET e PATCH)', async () => {
  const { creaOperazioni, OPERAZIONI_HTTP } = await import('../src/remoto/operazioni.mjs');
  const { iscriviConRigiocata } = await import('../src/iscrizione-sessione.mjs');
  assert.equal(OPERAZIONI_HTTP['session.context'].metodo, 'GET');
  assert.equal(OPERAZIONI_HTTP['session.context.settings'].metodo, 'PATCH');
  assert.equal(OPERAZIONI_HTTP['session.context.settings'].percorso({ sessionId: 's-1' }), '/api/v1/sessions/s-1/context/settings');
  const b = banco();
  const chiamate = [];
  const chiama = async (richiesta) => { chiamate.push([richiesta.metodo, richiesta.percorso, richiesta.corpo]); return { stato: 200, dati: { ok: true } }; };
  const operazioni = creaOperazioni({ chiama, sessionRegistry: b.registro, iscriviConRigiocata });
  const contesto = { dispositivo: { id: 'd-1', nome: 'Pad' }, iscrizioni: new Map(), iscrivi: () => async () => {} };
  await operazioni.esegui('session.context', { sessionId: b.sessionId }, contesto);
  await operazioni.esegui('session.context.settings', { sessionId: b.sessionId, corpo: { patch: { autoCompact: false }, expectedRevision: 3 } }, contesto);
  assert.deepEqual(chiamate.map(([m, p]) => [m, p]), [['GET', `/api/v1/sessions/${b.sessionId}/context`], ['PATCH', `/api/v1/sessions/${b.sessionId}/context/settings`]]);
  assert.deepEqual(chiamate[1][2], { patch: { autoCompact: false }, expectedRevision: 3 }, 'il corpo arriva intero, revisione compresa');
});
