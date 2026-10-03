/*
 * FORK «PRIMA DEL GIRO» (richiesta della lane CLI, owner 03/10/2026: «taglio prima + messaggio nel composer»). Contratto:
 *   `forka(sessionIdOrigine, { primaDelGiro: runId })` crea una sessione NUOVA con la storia fino a PRIMA del messaggio della
 *   persona di quel giro, FERMA (nessun giro avviato, conclusa), e restituisce `taglio: { primaDelGiro, messaggio, allegati? }`
 *   perché la CLI rimetta il messaggio nel composer. Senza opzioni `forka` fa quello di sempre. Rifiuti con codice:
 *   FORK_POINT_NOT_FOUND (giro assente, o il suo messaggio non si ritrova con certezza) e FORK_POINT_COMPACTED (il punto sta
 *   dentro una parte riassunta). ⛔ Mai un taglio approssimato. Capacità: `registro.capacita.forkPrimaDelGiro === true`.
 * Come fanno gli altri: Claude Code (Esc Esc / `/rewind`) e Codex (Esc Esc, «edit previous message») tagliano la conversazione
 *   prima di un messaggio della persona e lo rimettono nel campo di scrittura; l'originale resta.
 * La regola di posizione è quella già misurata per l'eliminazione di un messaggio (`posizioneDelMessaggio`,
 *   `messaggiSenzaMessaggio`): l'n-esimo `RunStarted` ↔ l'n-esimo messaggio `user`, col testo come CONFERMA.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { taglioPrimaDelGiro } from '../src/taglio-del-giro.mjs';
import { createSessionRegistry as createSessionRegistryReale } from '../src/session-registry.mjs';
import { attendiScritture } from '../src/session-store.mjs';
import { cartellaDiProva } from './aiuto/cartelle-di-prova.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const SYS = { role: 'system', content: 's' };
const u = (t) => ({ role: 'user', content: t });
const a = (t) => ({ role: 'assistant', content: t });
const giro = (runId, consegna, extra = {}) => ({ type: 'RunStarted', threadId: 't', runId, input: { consegna, ...extra } });
const fine = (runId) => ({ type: 'RunFinished', threadId: 't', runId });
const STORIA_3 = [SYS, u('c'), a('r1'), u('domanda 2'), a('r2'), u('domanda 3'), a('r3')];
const EVENTI_3 = [giro('r1', 'c'), fine('r1'), giro('r2', 'domanda 2'), fine('r2'), giro('r3', 'domanda 3'), fine('r3')];

test('TAGLIO-01: prima del secondo giro la storia si ferma prima del suo messaggio, e il messaggio torna', () => {
  const t = taglioPrimaDelGiro({ eventi: EVENTI_3, messaggi: STORIA_3, runId: 'r2' });
  assert.equal(t.ok, true);
  assert.deepEqual(t.messaggi, [SYS, u('c'), a('r1')]);
  assert.deepEqual(t.taglio, { primaDelGiro: 'r2', messaggio: 'domanda 2' });
});

test('TAGLIO-02: prima del primo giro resta il solo preambolo; prima dell\'ultimo resta tutto il resto', () => {
  assert.deepEqual(taglioPrimaDelGiro({ eventi: EVENTI_3, messaggi: STORIA_3, runId: 'r1' }).messaggi, [SYS]);
  assert.deepEqual(taglioPrimaDelGiro({ eventi: EVENTI_3, messaggi: STORIA_3, runId: 'r3' }).messaggi, STORIA_3.slice(0, 5));
});

test('TAGLIO-03: gli allegati del giro tornano insieme al messaggio', () => {
  const immagini = [{ nome: 'a.png', tipo: 'image/png', id: 'img1' }];
  const eventi = [giro('r1', 'c'), giro('r2', 'guarda', { immagini })];
  const messaggi = [SYS, u('c'), a('r1'), { role: 'user', content: [{ type: 'text', text: 'guarda' }, { type: 'image_url', image_url: { url: 'data:' } }] }, a('r2')];
  const t = taglioPrimaDelGiro({ eventi, messaggi, runId: 'r2' });
  assert.deepEqual(t.taglio, { primaDelGiro: 'r2', messaggio: 'guarda', allegati: immagini });
  assert.deepEqual(t.messaggi, messaggi.slice(0, 3));
});

test('TAGLIO-NOT-FOUND: un giro che non c\'è, o un messaggio che non combacia, è un rifiuto e mai un taglio approssimato', () => {
  assert.equal(taglioPrimaDelGiro({ eventi: EVENTI_3, messaggi: STORIA_3, runId: 'r9' }).code, 'FORK_POINT_NOT_FOUND');
  /* un messaggio in coda consegnato a metà giro sposta le posizioni: il testo non conferma ⇒ rifiuto */
  const spostata = [SYS, u('c'), a('r1'), u('messaggio in coda'), a('ok'), u('domanda 2'), a('r2'), u('domanda 3'), a('r3')];
  assert.equal(taglioPrimaDelGiro({ eventi: EVENTI_3, messaggi: spostata, runId: 'r2' }).code, 'FORK_POINT_NOT_FOUND');
  /* senza il testo del giro non c'è niente con cui confermare */
  assert.equal(taglioPrimaDelGiro({ eventi: [giro('r1', 'c'), { type: 'RunStarted', runId: 'r2' }], messaggi: STORIA_3, runId: 'r2' }).code, 'FORK_POINT_NOT_FOUND');
  assert.equal(taglioPrimaDelGiro({ eventi: EVENTI_3, messaggi: null, runId: 'r2' }).code, 'FORK_POINT_NOT_FOUND');
});

test('TAGLIO-COMPATTATA-MANUALE: prima di una compattazione che ha SOSTITUITO la storia, il punto non c\'è più', () => {
  const comp = { type: 'CUSTOM', name: 'talos.compattazione', value: { fase: 'fine', compattato: true, motivo: 'manuale' } };
  const eventi = [giro('r1', 'c'), fine('r1'), giro('r2', 'domanda 2'), fine('r2'), comp, giro('r3', 'domanda 3'), fine('r3')];
  const dopo = [SYS, u('[riassunto]'), u('domanda 3'), a('r3')];
  assert.equal(taglioPrimaDelGiro({ eventi, messaggi: dopo, runId: 'r2' }).code, 'FORK_POINT_COMPACTED');
  /* dopo la compattazione si conta dalla fine, e il testo conferma */
  const t = taglioPrimaDelGiro({ eventi, messaggi: dopo, runId: 'r3' });
  assert.equal(t.ok, true);
  assert.deepEqual(t.messaggi, [SYS, u('[riassunto]')]);
});

test('TAGLIO-COMPATTATA-PROIEZIONE: dentro la parte coperta dal riassunto è un rifiuto; dopo, il fork porta anche il riassunto', () => {
  const record = { schema: 'talos.compattazione.v1', coveredThrough: 4, riassunto: [SYS, u('[riassunto]')] };
  assert.equal(taglioPrimaDelGiro({ eventi: EVENTI_3, messaggi: STORIA_3, runId: 'r2', recordCompattazione: record }).code, 'FORK_POINT_COMPACTED');
  const t = taglioPrimaDelGiro({ eventi: EVENTI_3, messaggi: STORIA_3, runId: 'r3', recordCompattazione: record });
  assert.equal(t.ok, true);
  assert.equal(t.recordCompattazione, record);
  assert.equal(taglioPrimaDelGiro({ eventi: EVENTI_3, messaggi: STORIA_3, runId: 'r3' }).recordCompattazione, null);
});

/* ------------------------------------------------------------------------------------------------------------------------ */
/* Il registro vero, con la storia su disco. Il kernel è finto: ogni giro emette il suo RunStarted (runId e input veri) e si
   conclude quando la prova lo dice, con la storia che la prova sceglie. */
function registroAGiri(cartellaStore) {
  const giri = [];
  const registro = createSessionRegistryReale({
    guardaWorkspaceFn: () => () => {}, cartellaStore, modello: 'm', chiave: 'k', cartellaEsisteFn: () => true,
    preparaEsecuzioneFn: () => ({ cartella: '/tmp/x', comandoProva: 'npm test', task: { id: 'task-vero', consegna: 'c' } }),
    avviaSessioneFn: (input) => {
      let risolvi;
      const attesa = new Promise((r) => { risolvi = r; });
      const n = giri.length + 1;
      giri.push({ input, concludi: (messaggiFinali) => { input.onEvento(fine(`r${n}`)); risolvi({ ok: true, esito: { comeFinita: 'concluso', messaggiFinali } }); } });
      input.onEvento({ type: 'RunStarted', threadId: 't', runId: `r${n}`, input: input.task });
      return attesa;
    },
  });
  return { registro, giri };
}
const passo = () => new Promise((r) => setImmediate(r));
async function treGiri(registro, giri) {
  const { sessionId } = registro.avvia('task-vero');
  giri[0].concludi(STORIA_3.slice(0, 3)); await passo();
  registro.resume(sessionId, 'domanda 2'); giri[1].concludi(STORIA_3.slice(0, 5)); await passo();
  registro.resume(sessionId, 'domanda 3'); giri[2].concludi(STORIA_3); await passo();
  return sessionId;
}
async function conStore(t, corpo) {
  const cartellaStore = cartellaDiProva('talos-fork-prima-');
  t.after(async () => { await attendiScritture({ cartellaStore }).catch(() => {}); rimuoviCartellaDiProva(cartellaStore); });
  return corpo(cartellaStore);
}

test('FORK-PRIMA-01: la sessione nuova nasce ferma con la storia tagliata; il messaggio torna; l\'originale resta intatta', async (t) => conStore(t, async (cartellaStore) => {
  const { registro, giri } = registroAGiri(cartellaStore);
  assert.equal(registro.capacita?.forkPrimaDelGiro, true);
  const origine = await treGiri(registro, giri);
  const fork = registro.forka(origine, { primaDelGiro: 'r2' });
  assert.equal(fork.code, undefined, fork.erroreAvvio);
  assert.notEqual(fork.sessionId, origine);
  assert.deepEqual(fork.taglio, { primaDelGiro: 'r2', messaggio: 'domanda 2' });
  assert.equal(giri.length, 3, 'nessun giro avviato dal fork');
  /* una sessione ferma si comporta come una conclusa: Stop non lancia (leggeva un controller che non c'era) */
  assert.doesNotThrow(() => registro.ferma(fork.sessionId));
  /* la persona riprende il fork rimandando il messaggio (anche cambiato): il modello vede la storia tagliata e il messaggio nuovo */
  registro.resume(fork.sessionId, 'domanda 2, riscritta');
  assert.equal(giri.length, 4);
  const iniziali = giri[3].input.messaggiIniziali;
  assert.deepEqual(iniziali.slice(0, 3), [SYS, u('c'), a('r1')]);
  assert.deepEqual(iniziali.at(-1), u('domanda 2, riscritta'));
  assert.equal(iniziali.length, 4);
  giri[3].concludi([...iniziali, a('r2 bis')]); await passo();
  /* l'originale ha ancora tutti e tre i giri */
  registro.resume(origine, 'domanda 4');
  assert.deepEqual(giri[4].input.messaggiIniziali.slice(0, 7), STORIA_3);
  giri[4].concludi([...STORIA_3, u('domanda 4'), a('r4')]); await passo();
}));

test('FORK-PRIMA-02: dopo un riavvio il fork è ancora conclusa, con la stessa storia', async (t) => conStore(t, async (cartellaStore) => {
  const primo = registroAGiri(cartellaStore);
  const origine = await treGiri(primo.registro, primo.giri);
  const fork = primo.registro.forka(origine, { primaDelGiro: 'r3' });
  assert.equal(fork.code, undefined, fork.erroreAvvio);
  await attendiScritture({ cartellaStore });
  const riavvio = registroAGiri(cartellaStore);
  await riavvio.registro.ripristina();
  const ripresa = riavvio.registro.resume(fork.sessionId, 'domanda 3 bis');
  assert.equal(ripresa.code, undefined, ripresa.erroreAvvio);
  assert.deepEqual(riavvio.giri[0].input.messaggiIniziali, [...STORIA_3.slice(0, 5), u('domanda 3 bis')]);
  riavvio.giri[0].concludi([...STORIA_3.slice(0, 5), u('domanda 3 bis'), a('ok')]); await passo();
}));

test('FORK-PRIMA-RIFIUTI: un giro sconosciuto non crea niente; senza opzioni il fork fa quello di sempre', async (t) => conStore(t, async (cartellaStore) => {
  const { registro, giri } = registroAGiri(cartellaStore);
  const origine = await treGiri(registro, giri);
  const prima = registro.elenca().length;
  const rifiuto = registro.forka(origine, { primaDelGiro: 'r9' });
  assert.equal(rifiuto.code, 'FORK_POINT_NOT_FOUND');
  assert.equal(registro.elenca().length, prima, 'nessuna sessione creata');
  const sempre = registro.forka(origine);
  assert.equal(sempre.code, undefined);
  assert.equal(sempre.taglio, undefined);
  assert.equal(giri.length, 4, 'il fork di sempre avvia il suo giro');
  giri[3].concludi(STORIA_3); await passo();
}));
