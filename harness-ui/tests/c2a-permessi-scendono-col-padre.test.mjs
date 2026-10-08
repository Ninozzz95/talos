/*
 * ⛔⛔⛔ C2-a (07/10/2026, bugfixer) — UNA FIGLIA NON STA MAI SOPRA I SUOI ANTENATI, DAL VIVO.
 *   Difetto di sicurezza misurato su bd9805ab1 da «talos desktop» (C2-01 della prova `c2-permessi-gerarchici`): il padre passa a
 *   «Sola lettura» dopo aver delegato e la figlia viva resta in «Scrive nel progetto». Contro F-022 (owner 01/10/2026).
 *   Cura: `permessi-catena.mjs` (incontro dei livelli come TABELLA, unione delle scelte per attrezzo), il registro passa alle figlie
 *   `permessiCorrentiFn`, il kernel la rilegge a ogni chiamata come `modalitaOperativaCorrenteFn` di D1.
 */
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createSessionRegistry } from '../src/session-registry.mjs';
import { TaskCatalogError } from '../src/task-catalog.mjs';
import { talosLavora, verificaPermessoScrittura } from '../src/kernel/talosHarness.mjs';
import { LIVELLI_DI_ACCESSO, incontroLivelli, livelloConcedeDaSolo, permessiDellaCatena, sempreValeNellaCatena, unisciPermessiPerAttrezzo } from '../src/permessi-catena.mjs';
import { ATTREZZI_CON_PERMESSO_PER_ATTREZZO } from '../src/config.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

// ── la tabella dell'incontro ─────────────────────────────────────────────────────────────────────────────

test('C2A-INCONTRO-01: simmetrico e idempotente su tutte le 36 coppie, e sempre un livello noto', () => {
  for (const a of LIVELLI_DI_ACCESSO) {
    assert.equal(incontroLivelli(a, a), a, `idempotente: ${a}`);
    for (const b of LIVELLI_DI_ACCESSO) {
      assert.equal(incontroLivelli(a, b), incontroLivelli(b, a), `simmetrico: ${a} ∧ ${b}`);
      assert.ok(LIVELLI_DI_ACCESSO.includes(incontroLivelli(a, b)), `${a} ∧ ${b} è un livello noto`);
      // l'incontro sta sotto entrambi: rifatto con ciascuno, non cambia
      assert.equal(incontroLivelli(incontroLivelli(a, b), a), incontroLivelli(a, b), `${a} ∧ ${b} sta sotto ${a}`);
      assert.equal(incontroLivelli(incontroLivelli(a, b), b), incontroLivelli(a, b), `${a} ∧ ${b} sta sotto ${b}`);
    }
  }
});

test('C2A-INCONTRO-02: lettura assorbe, accesso-pieno è l identità, scrittura-progetto lascia passare i tre rami stretti', () => {
  for (const x of LIVELLI_DI_ACCESSO) {
    assert.equal(incontroLivelli('lettura', x), 'lettura');
    assert.equal(incontroLivelli('accesso-pieno', x), x);
  }
  for (const y of ['ricerca', 'su-richiesta', 'scrittura-area']) assert.equal(incontroLivelli('scrittura-progetto', y), y);
});

test('C2A-INCONTRO-03: le tre coppie non confrontabili scendono a lettura (il caso della linea sbagliata)', () => {
  /* Con una linea `lettura < ricerca < su-richiesta < …` una figlia in `ricerca` col padre in `su-richiesta` avrebbe minimo
     `ricerca` e DEPOSITEREBBE da sola mentre il padre chiede: sopra il padre (review di «talos desktop», 07/10/2026). */
  assert.equal(incontroLivelli('ricerca', 'su-richiesta'), 'lettura');
  assert.equal(incontroLivelli('ricerca', 'scrittura-area'), 'lettura');
  assert.equal(incontroLivelli('su-richiesta', 'scrittura-area'), 'lettura');
});

test('C2A-INCONTRO-04: nessun livello è l identità, una parola sconosciuta vale lettura (fallisce chiuso)', () => {
  assert.equal(incontroLivelli(undefined, undefined), undefined);
  assert.equal(incontroLivelli(undefined, 'scrittura-progetto'), 'scrittura-progetto');
  assert.equal(incontroLivelli('accesso-pieno', undefined), 'accesso-pieno');
  assert.equal(incontroLivelli('livello-nuovo-senza-riga', 'accesso-pieno'), 'lettura');
  assert.equal(incontroLivelli('accesso-pieno', 'livello-nuovo-senza-riga'), 'lettura');
  assert.equal(incontroLivelli(undefined, 'livello-nuovo-senza-riga'), 'lettura');
});

const anello = (livello, scelte = {}) => ({ livello, scelte });

test('C2A-ATTREZZI-01 (R1 del contratto): nega vince, poi chiedi, poi il sempre se ogni altro anello lo ha o lo concede col livello', () => {
  assert.deepEqual(unisciPermessiPerAttrezzo([anello('accesso-pieno', { scrivi: 'sempre' }), anello('accesso-pieno', { scrivi: 'nega' })]), { scrivi: 'nega' });
  assert.deepEqual(unisciPermessiPerAttrezzo([anello('accesso-pieno', { scrivi: 'sempre' }), anello('accesso-pieno', { scrivi: 'chiedi' })]), { scrivi: 'chiedi' });
  assert.deepEqual(unisciPermessiPerAttrezzo([anello('lettura', { scrivi: 'sempre' }), anello('lettura', { scrivi: 'sempre' })]), { scrivi: 'sempre' });
  // il padre senza override CONCEDE col livello: il sempre della figlia vale
  assert.deepEqual(unisciPermessiPerAttrezzo([anello('su-richiesta', { shell: 'sempre' }), anello('accesso-pieno')]), { shell: 'sempre' });
  // il padre senza override NON concede col livello: il sempre cade e decide l'incontro
  assert.deepEqual(unisciPermessiPerAttrezzo([anello('su-richiesta', { shell: 'sempre' }), anello('su-richiesta')]), {});
  assert.deepEqual(unisciPermessiPerAttrezzo([anello('lettura', { scrivi: 'sempre' }), anello('lettura')]), {}, 'il padre ha tolto il sempre');
  assert.deepEqual(unisciPermessiPerAttrezzo([anello('scrittura-area', { scrivi: 'sempre', shell: 'sempre' }), anello('scrittura-area')]), { scrivi: 'sempre' }, 'scrittura-area concede scrivi, non shell');
  assert.deepEqual(unisciPermessiPerAttrezzo([anello('accesso-pieno'), anello('accesso-pieno', { shell: 'chiedi' })]), { shell: 'chiedi' });
  assert.deepEqual(unisciPermessiPerAttrezzo([anello('accesso-pieno', { shell: 'forse' }), anello('accesso-pieno', { shell: 'sempre' })]), { shell: 'nega' }, 'una scelta illeggibile nega');
  assert.deepEqual(unisciPermessiPerAttrezzo([anello('accesso-pieno', { shell: 'sempre' }), anello('livello-nuovo')]), {}, 'un livello senza riga non concede');
  assert.deepEqual(unisciPermessiPerAttrezzo([null, undefined, { livello: 'lettura', scelte: [] }]), {});
});

test('C2A-ATTREZZI-02 sempreValeNellaCatena: la domanda della figlia sa se «Per questa sessione» può mantenere la promessa', () => {
  assert.equal(sempreValeNellaCatena([anello('su-richiesta'), anello('accesso-pieno')], 'shell'), true);
  assert.equal(sempreValeNellaCatena([anello('su-richiesta'), anello('su-richiesta')], 'shell'), false);
  assert.equal(sempreValeNellaCatena([anello('su-richiesta'), anello('accesso-pieno', { shell: 'chiedi' })], 'shell'), false);
  assert.equal(sempreValeNellaCatena([anello('su-richiesta'), anello('scrittura-area')], 'scrivi'), true);
  assert.equal(sempreValeNellaCatena([anello('su-richiesta'), anello('scrittura-area')], 'shell'), false);
  assert.equal(sempreValeNellaCatena([anello('su-richiesta')], 'shell'), true, 'una radice sola: il sempre è suo');
});

/* ⛔ La tabella resta ONESTA contro il cancello vero: per ogni livello e ogni attrezzo che può avere una scelta, senza override e
   senza canale per chiedere, `verificaPermessoScrittura` dice «nessun-vincolo» SE E SOLO SE la tabella dice che il livello
   concede l'attrezzo da solo. Se un giorno il cancello cambia, questa prova diventa rossa. */
test('C2A-CONCEDE-ONESTA: livelloConcedeDaSolo coincide col cancello vero su tutti i livelli × attrezzi', async (t) => {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-c2a-concede-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  const azioni = {
    scrivi: { tipo: 'scrivi', percorso: join(cartella, 'a.txt') },
    file_edit: { tipo: 'file_edit', percorso: join(cartella, 'a.txt') },
    prova: { tipo: 'prova', comando: 'npm test' },
    shell: { tipo: 'shell', comando: 'echo ok' },
    document_create: { tipo: 'document_create', percorso: join(cartella, 'doc.md') },
    generate_image: { tipo: 'generate_image', percorso: join(cartella, 'img.png') },
  };
  assert.deepEqual(Object.keys(azioni).sort(), [...ATTREZZI_CON_PERMESSO_PER_ATTREZZO].sort(), 'la prova copre ogni attrezzo con una scelta');
  for (const livello of [undefined, ...LIVELLI_DI_ACCESSO]) {
    for (const [attrezzo, azione] of Object.entries(azioni)) {
      const esito = await verificaPermessoScrittura(azione, { livelloAccesso: livello, cartella });
      const daSolo = esito.consentito === true && esito.via === 'nessun-vincolo';
      assert.equal(daSolo, livelloConcedeDaSolo(livello, attrezzo), `${livello ?? '(nessun livello)'} × ${attrezzo}: cancello ${JSON.stringify(esito)}`);
    }
  }
});

test('C2A-CATENA-01: la catena incontra i livelli di tutti gli anelli', () => {
  assert.deepEqual(permessiDellaCatena({ livelli: ['scrittura-progetto', 'lettura'], anelli: [anello('scrittura-progetto', { scrivi: 'sempre' }), anello('lettura')] }),
    { livelloAccesso: 'lettura', permessiPerAttrezzo: {} });
  /* ⛔ Un livello in più (quello d'avvio) entra solo nell'incontro: non è un anello che nega il «sempre». */
  assert.deepEqual(permessiDellaCatena({ livelli: ['su-richiesta', 'su-richiesta', 'su-richiesta'], anelli: [anello('su-richiesta', { scrivi: 'sempre' }), anello('su-richiesta', { scrivi: 'sempre' })] }),
    { livelloAccesso: 'su-richiesta', permessiPerAttrezzo: { scrivi: 'sempre' } });
});

// ── il registro ──────────────────────────────────────────────────────────────────────────────────────────

function registroConFigli() {
  const run = [];
  const registro = createSessionRegistry({
    avviaSessioneFn: (input) => {
      let risolvi;
      const promessa = new Promise((r) => { risolvi = r; });
      run.push({ input, risolvi });
      input.onEvento({ type: 'RunStarted', threadId: `t${run.length}`, runId: `r${run.length}` });
      return promessa;
    },
    preparaEsecuzioneFn: (taskId) => {
      if (taskId !== 'task-vero') throw new TaskCatalogError('Task non ammesso');
      return { cartella: '/tmp/x', comandoProva: 'npm test', task: { id: taskId, consegna: 'prova' } };
    },
    guardaWorkspaceFn: () => () => {},
    modello: 'm', chiave: 'k', cartellaEsisteFn: () => true,
  });
  const concludi = (i) => {
    run[i].input.onEvento({ type: 'RunFinished', threadId: `t${i + 1}`, runId: `r${i + 1}` });
    run[i].risolvi({ ok: true, esito: { comeFinita: 'concluso', messaggiFinali: [{ role: 'user', content: 'c' }, { role: 'assistant', content: 'attendo' }] } });
  };
  return { registro, run, concludi };
}

async function padreConFiglia(opzioni = {}) {
  const { registro, run, concludi } = registroConFigli();
  const { sessionId: parentId } = registro.avvia('task-vero', { modalitaOperativaScelta: 'normale', ...opzioni });
  await new Promise((r) => setImmediate(r));
  const { childId } = await run[0].input.onDelega('scrivi un file', '/tmp/figlio');
  concludi(0); // i permessi del padre si cambiano fra un suo giro e l'altro
  await new Promise((r) => setImmediate(r));
  return { registro, parentId, childId, inputFiglio: run[1].input, inputPadre: run[0].input };
}

test('C2A-01 SCENDE COL PADRE: il padre passa a «Sola lettura» ⇒ la figlia viva scende con lui', async () => {
  const { registro, parentId, childId, inputFiglio, inputPadre } = await padreConFiglia();
  assert.equal(typeof inputFiglio.permessiCorrentiFn, 'function', 'il registro dà alla figlia i permessi della catena');
  assert.equal(inputPadre.permessiCorrentiFn, undefined, 'la radice non ne ha: comportamento di prima');
  assert.equal(inputFiglio.permessiCorrentiFn().livelloAccesso, 'scrittura-progetto', 'premessa: nasce col livello del padre');
  assert.deepEqual(await registro.aggiornaImpostazioni(parentId, { permessi: 'Read only' }), { ok: true });
  assert.equal(inputFiglio.permessiCorrentiFn().livelloAccesso, 'lettura', 'la figlia non resta SOPRA il padre');
  registro.ferma(childId); registro.ferma(parentId);
});

test('C2A-01b AL CONTRARIO: il padre SALE ⇒ la figlia non sale oltre ciò con cui il suo giro è partito', async () => {
  const { registro, parentId, childId, inputFiglio } = await padreConFiglia({ permessiScelto: 'Read only' });
  assert.deepEqual(await registro.aggiornaImpostazioni(parentId, { permessi: 'Full access' }), { ok: true });
  assert.equal(inputFiglio.permessiCorrentiFn().livelloAccesso, 'lettura');
  registro.ferma(childId); registro.ferma(parentId);
});

/* ⛔ Il «sempre» per attrezzo vale anche contro il livello (`talosHarness.mjs`, doc di `verificaPermessoScrittura`). Un padre in
   «Sola lettura» fa nascere figlie in modalità `lettura`, che tengono solo i «nega» (`subagent-orchestrator.mjs`): il caso che
   morde è un padre «Su richiesta» col «sempre» su `scrivi`, che la figlia copia alla nascita. */
test('C2A-01c NEMMENO ALZANDO TUTTI E DUE: durante il giro la figlia non sale oltre il livello con cui è partito', async () => {
  const { registro, parentId, childId, inputFiglio } = await padreConFiglia();
  assert.deepEqual(await registro.aggiornaImpostazioni(parentId, { permessi: 'Full access' }), { ok: true });
  const suLaFiglia = await registro.aggiornaImpostazioni(childId, { permessi: 'Full access' });
  assert.notEqual(suLaFiglia?.ok, false, `premessa: anche la figlia è alzata (${JSON.stringify(suLaFiglia)})`);
  assert.equal(inputFiglio.permessiCorrentiFn().livelloAccesso, 'scrittura-progetto', 'salire resta una cosa fra i giri');
  registro.ferma(childId); registro.ferma(parentId);
});

test('C2A-01d UN ANTENATO CON UNA PAROLA SCONOSCIUTA: la figlia scende a lettura (un anello illeggibile non apre niente)', async () => {
  const { registro, parentId, childId, inputFiglio } = await padreConFiglia();
  /* il registro oggi accetta una parola qualunque in `permessi` (misurato: {ok:true} per «Boh»): l anello va letto chiuso */
  assert.deepEqual(await registro.aggiornaImpostazioni(parentId, { permessi: 'Boh' }), { ok: true });
  assert.equal(inputFiglio.permessiCorrentiFn().livelloAccesso, 'lettura');
  registro.ferma(childId); registro.ferma(parentId);
});

test('C2A-08 PADRE SALITO: il «sempre» dato alla figlia (Per questa sessione) VALE, perché il padre lo concede col suo livello', async () => {
  const { registro, parentId, childId, inputFiglio } = await padreConFiglia({ permessiScelto: 'On request' });
  assert.deepEqual(await registro.aggiornaImpostazioni(parentId, { permessi: 'Full access' }), { ok: true });
  assert.deepEqual(await registro.aggiornaImpostazioni(childId, { permessiPerAttrezzo: { shell: 'sempre' } }), { ok: true });
  assert.deepEqual(inputFiglio.permessiCorrentiFn(), { livelloAccesso: 'su-richiesta', permessiPerAttrezzo: { shell: 'sempre' } });
  registro.ferma(childId); registro.ferma(parentId);
});

test('C2A-09 PADRE «SU RICHIESTA» SENZA OVERRIDE: il «sempre» della figlia NON vale, e la sua domanda lo dichiara', async (t) => {
  const { registro, parentId, childId, inputFiglio } = await padreConFiglia({ permessiScelto: 'On request' });
  assert.deepEqual(await registro.aggiornaImpostazioni(childId, { permessiPerAttrezzo: { shell: 'sempre' } }), { ok: true });
  assert.deepEqual(inputFiglio.permessiCorrentiFn(), { livelloAccesso: 'su-richiesta', permessiPerAttrezzo: {} });
  const visti = [];
  const disiscrivi = registro.iscriviti(childId, (e) => visti.push(e));
  t.after(() => disiscrivi?.());
  const domanda = inputFiglio.chiediApprovazioneFn({ tipo: 'shell', comando: 'echo ok' });
  await new Promise((r) => setTimeout(r, 10));
  const richiesta = visti.find((e) => e.type === 'ApprovalRequested');
  assert.equal(richiesta?.azione?.sempreNonBasta, true, '«Per questa sessione» non può mantenere la promessa: la domanda lo dice');
  registro.rispondiApprovazione(childId, richiesta.requestId, false);
  await domanda;
  // AL CONTRARIO: col padre salito ad «Accesso pieno» lo stesso «sempre» vale, e la domanda non porta il campo
  assert.deepEqual(await registro.aggiornaImpostazioni(parentId, { permessi: 'Full access' }), { ok: true });
  assert.deepEqual(await registro.aggiornaImpostazioni(childId, { permessiPerAttrezzo: {} }), { ok: true });
  const seconda = inputFiglio.chiediApprovazioneFn({ tipo: 'shell', comando: 'echo ok' });
  await new Promise((r) => setTimeout(r, 10));
  const altra = visti.filter((e) => e.type === 'ApprovalRequested').at(-1);
  assert.notEqual(altra?.requestId, richiesta.requestId);
  assert.equal(Object.hasOwn(altra.azione, 'sempreNonBasta'), false);
  registro.rispondiApprovazione(childId, altra.requestId, false);
  await seconda;
  registro.ferma(childId); registro.ferma(parentId);
});

test('C2A-02 IL SEMPRE TOLTO AL PADRE: la copia della figlia non lo tiene più', async () => {
  const { registro, parentId, childId, inputFiglio } = await padreConFiglia({ permessiScelto: 'On request', permessiPerAttrezzoScelto: { scrivi: 'sempre' } });
  /* C2 R6-bis (owner 08/10/2026, «Segnalo anche»): la copia alla nascita dice anche DA CHI arriva (`origini`). Prima di R6-bis
     la premessa pretendeva la forma senza attribuzione; il fatto che prova questa prova — tolto al padre, la copia non lo tiene
     più — è invariato, qui sotto. */
  assert.deepEqual(inputFiglio.permessiCorrentiFn(), { livelloAccesso: 'su-richiesta', permessiPerAttrezzo: { scrivi: 'sempre' }, origini: { scrivi: parentId } }, 'premessa: la copia, dal padre');
  assert.deepEqual(await registro.aggiornaImpostazioni(parentId, { permessiPerAttrezzo: {} }), { ok: true });
  assert.deepEqual(inputFiglio.permessiCorrentiFn(), { livelloAccesso: 'su-richiesta', permessiPerAttrezzo: {} });
  registro.ferma(childId); registro.ferma(parentId);
});

// ── il kernel vero, cablato con ciò che il registro dà alla figlia ──────────────────────────────────────

const FINE = { role: 'assistant', content: 'fatto', tool_calls: [] };
const scrivi = (percorso, id) => ({ role: 'assistant', content: '', tool_calls: [{ id, function: { name: 'scrivi', arguments: JSON.stringify({ percorso, contenuto: 'x' }) } }] });
function sportello(risposte, prima = () => {}) {
  let i = 0;
  return async () => {
    await prima(i);
    return { ok: true, json: async () => ({ choices: [{ message: risposte[i++] ?? FINE }], usage: {} }) };
  };
}
function giroDellaFiglia(input, cartella, risposte, prima) {
  return talosLavora({
    cartella, task: { consegna: 'lavora' }, modello: 'x', chiave: 'y', agentRole: 'child',
    livelloAccesso: input.livelloAccesso, permessiPerAttrezzo: input.permessiPerAttrezzo,
    permessiCorrentiFn: input.permessiCorrentiFn,
    fetchDiRete: sportello(risposte, prima),
  });
}

test('C2A-03 A META DEL GIRO: la prima scrittura passa, il padre scende, la seconda è negata', async (t) => {
  const { registro, parentId, childId, inputFiglio } = await padreConFiglia();
  const cartella = mkdtempSync(join(tmpdir(), 'talos-c2a-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  const esito = await giroDellaFiglia(inputFiglio, cartella, [scrivi('prima.txt', 'w1'), scrivi('dopo.txt', 'w2'), FINE], async (i) => {
    if (i === 1) assert.deepEqual(await registro.aggiornaImpostazioni(parentId, { permessi: 'Read only' }), { ok: true });
  });
  assert.equal(existsSync(join(cartella, 'prima.txt')), true, 'premessa: col padre in «Scrive nel progetto» la figlia scrive');
  assert.equal(existsSync(join(cartella, 'dopo.txt')), false, 'col padre sceso a «Sola lettura» la stessa scrittura è negata');
  const risultati = esito.messaggiFinali.filter((m) => m.role === 'tool').map((m) => m.content);
  assert.equal(risultati.length, 2);
  assert.match(risultati[1], /REFUSED|read[- ]only|denied/i);
  registro.ferma(childId); registro.ferma(parentId);
});

test('C2A-04 IL SEMPRE TOLTO, NEL KERNEL, A METÀ GIRO: col «sempre» la figlia scrive senza chiedere; tolto al padre, chiede (e senza canale è negata)', async (t) => {
  const { registro, parentId, childId, inputFiglio } = await padreConFiglia({ permessiScelto: 'On request', permessiPerAttrezzoScelto: { scrivi: 'sempre' } });
  const cartella = mkdtempSync(join(tmpdir(), 'talos-c2a-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  await giroDellaFiglia(inputFiglio, cartella, [scrivi('col-sempre.txt', 'w1'), scrivi('senza-sempre.txt', 'w2'), FINE], async (i) => {
    if (i === 1) assert.deepEqual(await registro.aggiornaImpostazioni(parentId, { permessiPerAttrezzo: {} }), { ok: true });
  });
  assert.equal(existsSync(join(cartella, 'col-sempre.txt')), true, 'premessa: il «sempre» copiato apre la scrittura');
  assert.equal(existsSync(join(cartella, 'senza-sempre.txt')), false, 'tolto al padre, la figlia non lo tiene');
  registro.ferma(childId); registro.ferma(parentId);
});

test('C2A-05 AL CONTRARIO: un lettore che lancia nega, anche con un «sempre» in mano', async (t) => {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-c2a-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  await talosLavora({
    cartella, task: { consegna: 'lavora' }, modello: 'x', chiave: 'y', agentRole: 'child',
    livelloAccesso: 'accesso-pieno', permessiPerAttrezzo: { scrivi: 'sempre' },
    permessiCorrentiFn: () => { throw new Error('catena illeggibile'); },
    fetchDiRete: sportello([scrivi('rotto.txt', 'w1'), FINE]),
  });
  assert.equal(existsSync(join(cartella, 'rotto.txt')), false, 'un cancello che non riesce a valutare nega');
});

test('C2A-06 SENZA LETTORE: la radice (e banco, mobile, CLI) scrive come prima', async (t) => {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-c2a-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  await talosLavora({
    cartella, task: { consegna: 'lavora' }, modello: 'x', chiave: 'y',
    livelloAccesso: 'scrittura-progetto',
    fetchDiRete: sportello([scrivi('radice.txt', 'w1'), FINE]),
  });
  assert.equal(existsSync(join(cartella, 'radice.txt')), true);
});

test('C2A-07 MAI OLTRE (protezione, kernel): un sì di cartella non apre la scrittura a chi è in sola lettura', async () => {
  const esito = await verificaPermessoScrittura({ tipo: 'scrivi', percorso: 'C:/fuori/a.txt' }, {
    livelloAccesso: 'lettura', cartella: 'C:/progetto', consensiSessione: { cartelleFuori: ['C:/fuori'] },
    chiediApprovazioneFn: async () => true,
  });
  assert.equal(esito?.consentito, false);
  assert.equal(esito?.via, 'livello-lettura');
});
