/*
 * ⛔ P4 (05/10/2026) — L'ANCORA NEL JOURNAL, DAL VIVO DEL REGISTRO.
 *
 * Il brief P4 (approvato): alla chiusura di un giro con `finishReason ∈ {stop, tool-calls}` la
 * CLI scrive nel jsonl di sessione un record `provider_state {version, provider, model}` (niente
 * content), e al resume lo stato viene ricostruito/validato dal jsonl. Qui si prova il giro
 * COMPLETO sul registro vero (giri finti, journal vero su disco): scrittura dell'ancora, ripresa
 * che la usa, manomissione dell'ancora che toglie lo stato, e journal di una beta di prima
 * (senza ancore) che resta com'era — compatibilità all'indietro.
 *
 * Stato dell'arte letto nel codice (05/10/2026): il replay (`creaConsumatoreDiStoria`) copia i
 * messaggi VERBATIM, quindi lo stato sopravvive già a un riavvio PER INCISO, dentro il messaggio;
 * ciò che manca è la certificazione durevole (chi l'ha prodotto, con quale chiusura) e la guardia
 * che al resume scarta uno stato contraddetto dal proprio journal.
 */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import { createSessionRegistry as createSessionRegistryReale } from '../src/session-registry.mjs';
import { attendiScritture, registraRigaSync, registraRigaConfermata } from '../src/session-store.mjs';
import { cartellaDiProva } from './aiuto/cartelle-di-prova.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

function createSessionRegistry(opzioni) {
  return createSessionRegistryReale({
    guardaWorkspaceFn: () => () => {},
    cartellaEsisteFn: () => true,
    modello: 'm',
    chiave: 'k',
    cartelleProgetto: [{ id: '0', percorso: '/tmp/progetto', nome: 'progetto' }],
    /* 08/10/2026 (owner): la scrittura dell'ancora è un'OPZIONE del registro, spenta di serie; la CLI la accende. Questi test la
       accendono come lei: i test P4-OPT-* sotto la spengono o la lasciano al valore di serie per provare il resto. */
    ancoraStatoProvider: true,
    ...opzioni,
  });
}

/** Giro finti: `concludi(messaggiFinali)` lascia una cronologia canonica, come un giro vero. */
function giriFinti() {
  const inputs = [];
  let risolvi = null;
  let onEvento = null;
  return {
    avviaSessioneFn: async (input) => {
      inputs.push(input);
      onEvento = input.onEvento;
      input.onEvento({ type: 'RunStarted', threadId: 't1', runId: `r${inputs.length}` });
      return new Promise((r) => { risolvi = r; });
    },
    concludi(messaggiFinali) {
      onEvento({ type: 'RunFinished', threadId: 't1', runId: `r${inputs.length}` });
      risolvi({ esito: { messaggiFinali, comeFinita: 'concluso' } });
    },
    get inputs() { return inputs; },
    get ultimo() { return inputs[inputs.length - 1]; },
  };
}

const STATO = { version: 1, provider: 'anthropic', model: 'm-1', content: [{ type: 'text', text: 'ragionamento privato' }] };
const STORIA_CON_STATO = [
  { role: 'system', content: 'istruzioni' },
  { role: 'user', content: 'compito' },
  { role: 'assistant', content: 'fatto', talos_provider_state: STATO },
];
const STORIA_SENZA_STATO = [
  { role: 'system', content: 'istruzioni' },
  { role: 'user', content: 'compito' },
  { role: 'assistant', content: 'fatto' },
];

async function svuota(cartellaStore) {
  for (let i = 0; i < 3; i += 1) {
    try { await attendiScritture({ cartellaStore }); } catch { /* la rimozione della cartella dirà il resto */ }
    await new Promise((r) => setImmediate(r));
  }
}

const righeJournal = (cartellaStore, sessionId) =>
  readFileSync(join(cartellaStore, `${sessionId}.jsonl`), 'utf8').split('\n').filter((riga) => riga.trim() !== '');

const indiciAncora = (righe) => righe
  .map((riga, indice) => ({ indice, record: JSON.parse(riga) }))
  .filter(({ record }) => record?.tipo === 'provider-state');

const indiciStoria = (righe) => righe
  .map((riga, indice) => ({ indice, record: JSON.parse(riga) }))
  .filter(({ record }) => record?.tipo === 'checkpoint' || record?.tipo === 'messaggi-delta' || record?.tipo === 'messaggi-finali');

const unTick = () => new Promise((r) => setTimeout(r, 0));

test('P4-WRITE-1: la chiusura con stato scrive UNA ancora DOPO la storia, senza content', async () => {
  const cartellaStore = cartellaDiProva('talos-p4-scrive-');
  try {
    const finta = giriFinti();
    const registro = createSessionRegistry({ cartellaStore, avviaSessioneFn: finta.avviaSessioneFn });
    const { sessionId } = registro.avviaLibero({ cartellaId: '0', consegna: 'compito' });
    finta.concludi(STORIA_CON_STATO);
    await svuota(cartellaStore);

    const righe = righeJournal(cartellaStore, sessionId);
    const ancore = indiciAncora(righe);
    assert.equal(ancore.length, 1, `una sola ancora per un solo giro chiuso. Righe: ${righe.length}`);
    const [{ indice, record }] = ancore;
    const ultimeStoria = indiciStoria(righe).at(-1).indice;
    assert.ok(indice > ultimeStoria, 'l’ancora segue la storia del giro: al replay si legge già scritta');
    assert.equal(record.schema, 'talos.provider-state-anchor.v1');
    assert.equal(record.versione, 1);
    assert.equal(record.provider, 'anthropic');
    assert.equal(record.model, 'm-1');
    assert.equal('content' in record, false, 'niente content sul journal: si ricava dal messaggio già persistito');
  } finally {
    await svuota(cartellaStore);
    rimuoviCartellaDiProva(cartellaStore);
  }
});

test('P4-WRITE-2: giro chiuso SENZA stato (caso OpenRouter) ⇒ nessuna ancora', async () => {
  const cartellaStore = cartellaDiProva('talos-p4-muto-');
  try {
    const finta = giriFinti();
    const registro = createSessionRegistry({ cartellaStore, avviaSessioneFn: finta.avviaSessioneFn });
    const { sessionId } = registro.avviaLibero({ cartellaId: '0', consegna: 'compito' });
    finta.concludi(STORIA_SENZA_STATO);
    await svuota(cartellaStore);

    assert.equal(indiciAncora(righeJournal(cartellaStore, sessionId)).length, 0,
      'il caso A non si certifica: nessun blocco, nessuna ancora');
  } finally {
    await svuota(cartellaStore);
    rimuoviCartellaDiProva(cartellaStore);
  }
});

test('P4-RESUME-1: al resume lo stato certificato dall’ancora arriva al modello intatto', async () => {
  const cartellaStore = cartellaDiProva('talos-p4-ripresa-');
  try {
    const prima = giriFinti();
    const registro = createSessionRegistry({ cartellaStore, avviaSessioneFn: prima.avviaSessioneFn });
    const { sessionId } = registro.avviaLibero({ cartellaId: '0', consegna: 'compito' });
    prima.concludi(STORIA_CON_STATO);
    await svuota(cartellaStore);

    const dopo = giriFinti();
    const riavviato = createSessionRegistry({ cartellaStore, avviaSessioneFn: dopo.avviaSessioneFn });
    await riavviato.ripristina();
    riavviato.resume(sessionId, 'continua');
    await unTick();

    const ultimoAssistant = [...dopo.ultimo.messaggiIniziali].reverse().find((m) => m.role === 'assistant');
    assert.deepEqual(ultimoAssistant.talos_provider_state, STATO,
      'lo stato ricostruito dal jsonl è quello del giro chiuso, byte per byte');
  } finally {
    await svuota(cartellaStore);
    rimuoviCartellaDiProva(cartellaStore);
  }
});

test('P4-RESUME-2: ancora manomessa in disaccordo con lo stato ⇒ lo stato NON arriva al modello, i messaggi sì', async () => {
  const cartellaStore = cartellaDiProva('talos-p4-manomessa-');
  try {
    const prima = giriFinti();
    const registro = createSessionRegistry({ cartellaStore, avviaSessioneFn: prima.avviaSessioneFn });
    const { sessionId } = registro.avviaLibero({ cartellaId: '0', consegna: 'compito' });
    prima.concludi(STORIA_CON_STATO);
    await svuota(cartellaStore);

    // Il journal si tocca SOLO nell'ancora: la storia persistita resta com'era.
    const percorso = join(cartellaStore, `${sessionId}.jsonl`);
    const righe = righeJournal(cartellaStore, sessionId).map((riga) => {
      const record = JSON.parse(riga);
      return record?.tipo === 'provider-state'
        ? JSON.stringify({ ...record, model: 'm-riscritto-da-un-altro-writer' })
        : riga;
    });
    writeFileSync(percorso, `${righe.join('\n')}\n`, 'utf8');

    const dopo = giriFinti();
    const riavviato = createSessionRegistry({ cartellaStore, avviaSessioneFn: dopo.avviaSessioneFn });
    await riavviato.ripristina();
    riavviato.resume(sessionId, 'continua');
    await unTick();

    const iniziali = dopo.ultimo.messaggiIniziali;
    assert.equal(iniziali.some((m) => m.talos_provider_state), false,
      'mai alimentare il provider con uno stato contraddetto dal proprio journal');
    /* Il resume accoda il messaggio nuovo della persona: la storia è il PREFISSO che sta prima. */
    assert.deepEqual(iniziali.slice(0, -1), STORIA_SENZA_STATO, 'i messaggi sani arrivano tutti, senza il blocco dati');
    assert.deepEqual(iniziali.at(-1), { role: 'user', content: 'continua' });
  } finally {
    await svuota(cartellaStore);
    rimuoviCartellaDiProva(cartellaStore);
  }
});

test('P4-RESUME-3: journal di una beta di prima (nessuna ancora) ⇒ comportamento di oggi, stato conservato', async () => {
  const cartellaStore = cartellaDiProva('talos-p4-vecchio-');
  try {
    const prima = giriFinti();
    const registro = createSessionRegistry({ cartellaStore, avviaSessioneFn: prima.avviaSessioneFn });
    const { sessionId } = registro.avviaLibero({ cartellaId: '0', consegna: 'compito' });
    prima.concludi(STORIA_CON_STATO);
    await svuota(cartellaStore);

    const percorso = join(cartellaStore, `${sessionId}.jsonl`);
    const righe = righeJournal(cartellaStore, sessionId)
      .filter((riga) => JSON.parse(riga)?.tipo !== 'provider-state');
    writeFileSync(percorso, `${righe.join('\n')}\n`, 'utf8');

    const dopo = giriFinti();
    const riavviato = createSessionRegistry({ cartellaStore, avviaSessioneFn: dopo.avviaSessioneFn });
    await riavviato.ripristina();
    riavviato.resume(sessionId, 'continua');
    await unTick();

    const ultimoAssistant = [...dopo.ultimo.messaggiIniziali].reverse().find((m) => m.role === 'assistant');
    assert.deepEqual(ultimoAssistant.talos_provider_state, STATO, 'senza ancora non si degrada: la sessione esistente resta com’era');
  } finally {
    await svuota(cartellaStore);
    rimuoviCartellaDiProva(cartellaStore);
  }
});

/* ⛔ Riserva 1 della revisione stall (06/10/2026): l'ancora deve atterrare SOLO dietro la conferma
   della storia del giro. Un'ancora su un journal senza storia ⇒ al resume un falso
   «stato-incoerente» con strip totale: la cura si morde la coda. Qui la fabbrica del registro
   inietta uno scrittore sync che sbaglia SOLO sui record di STORIA (checkpoint, messaggi-delta,
   messaggi-finali): tutto il resto (header, eventi, tempi, ancora) passa al vero. */

const TIPI_STORIA = new Set(['checkpoint', 'messaggi-delta', 'messaggi-finali']);

const scrittoreStoriaGuasta = (errore) => ({ cartellaStore, sessionId, record }) => {
  if (TIPI_STORIA.has(record?.tipo)) throw errore;
  return registraRigaSync({ cartellaStore, sessionId, record });
};

test('P4-WRITE-3: storia FALLITA in sync ⇒ NESSUNA ancora: il journal non si auto-certifica a metà', async () => {
  const cartellaStore = cartellaDiProva('talos-p4-storia-persa-');
  try {
    const finta = giriFinti();
    const registro = createSessionRegistry({
      cartellaStore, avviaSessioneFn: finta.avviaSessioneFn,
      registraRigaSyncFn: scrittoreStoriaGuasta(Object.assign(new Error('disco pieno'), { code: 'E_TEST_DISCO' })),
    });
    const { sessionId } = registro.avviaLibero({ cartellaId: '0', consegna: 'compito' });
    finta.concludi(STORIA_CON_STATO);
    await svuota(cartellaStore);

    const righe = righeJournal(cartellaStore, sessionId);
    assert.ok(righe.length > 0, 'il journal esiste: header ed eventi sono scritti lo stesso');
    assert.equal(indiciStoria(righe).length, 0, 'la storia del giro NON è atterrata (è il caso in esame)');
    assert.equal(indiciAncora(righe).length, 0,
      'senza storia atterrata nessuna certificazione: al resume vale l\u2019onesto «senza-ancora», non il falso «stato-incoerente»');
  } finally {
    await svuota(cartellaStore);
    rimuoviCartellaDiProva(cartellaStore);
  }
});

test('P4-WRITE-4: storia ACCODATA e poi FALLITA ⇒ NESSUNA ancora, nemmeno alla fine', async () => {
  const cartellaStore = cartellaDiProva('talos-p4-coda-persa-');
  try {
    const finta = giriFinti();
    const registro = createSessionRegistry({
      cartellaStore, avviaSessioneFn: finta.avviaSessioneFn,
      registraRigaSyncFn: scrittoreStoriaGuasta(Object.assign(new Error('store occupato'), { code: 'SESSION_STORE_BUSY' })),
      registraRigaFn: ({ cartellaStore: c, sessionId: s, record }) => TIPI_STORIA.has(record?.tipo)
        ? Promise.reject(Object.assign(new Error('la coda ha perso il giro'), { code: 'E_TEST_CODA' }))
        : registraRigaConfermata({ cartellaStore: c, sessionId: s, record }),
    });
    const { sessionId } = registro.avviaLibero({ cartellaId: '0', consegna: 'compito' });
    finta.concludi(STORIA_CON_STATO);
    await svuota(cartellaStore);

    const righe = righeJournal(cartellaStore, sessionId);
    assert.ok(righe.length > 0, 'header ed eventi: il journal vive');
    assert.equal(indiciStoria(righe).length, 0, 'la storia accodata non è mai atterrata (è il caso in esame)');
    assert.equal(indiciAncora(righe).length, 0,
      'l\u2019ancora aspetta la conferma della storia: conferma mai arrivata ⇒ nessuna ancora, mai');
  } finally {
    await svuota(cartellaStore);
    rimuoviCartellaDiProva(cartellaStore);
  }
});

test('P4-WRITE-5: storia ACCODATA e ATERRATA ⇒ l\u2019ancora arriva DOPO, una volta sola', async () => {
  const cartellaStore = cartellaDiProva('talos-p4-coda-buona-');
  try {
    const finta = giriFinti();
    const registro = createSessionRegistry({
      cartellaStore, avviaSessioneFn: finta.avviaSessioneFn,
      registraRigaSyncFn: scrittoreStoriaGuasta(Object.assign(new Error('store occupato'), { code: 'SESSION_STORE_BUSY' })),
    });
    const { sessionId } = registro.avviaLibero({ cartellaId: '0', consegna: 'compito' });
    finta.concludi(STORIA_CON_STATO);
    await svuota(cartellaStore);

    const righe = righeJournal(cartellaStore, sessionId);
    const ancore = indiciAncora(righe);
    assert.equal(ancore.length, 1, 'una sola ancora, scritta dietro conferma della storia');
    assert.ok(ancore[0].indice > indiciStoria(righe).at(-1).indice, 'e resta dopo la storia, come nel caso sync');
  } finally {
    await svuota(cartellaStore);
    rimuoviCartellaDiProva(cartellaStore);
  }
});

/* ⭐ 08/10/2026 (owner, dopo la ricerca RICERCA-STATO-PROVIDER-E-FIRME-2026-10-08): la riga `provider-state` cambia il formato del
   giornale, e nessun concorrente (OpenCode message-v2.ts:248-380, Pi transform-messages.ts:93-148, Codex compaction_resume_metadata.rs,
   Hermes anthropic_thinking_replay.py) ne scrive una: decidono alla richiesta dal timbro per messaggio. Quindi la SCRITTURA è
   un'opzione del registro, SPENTA di serie (`ancoraStatoProvider`), accesa dalla CLI. La LETTURA no: un giornale senza ancora resta
   com'era, uno con l'ancora si valida comunque (non cambia nulla per chi non ne ha). */

test('P4-OPT-1: senza l’opzione (il desktop com’è) un giro chiuso pulito con stato NON scrive nessuna ancora', async () => {
  const cartellaStore = cartellaDiProva('talos-p4-opt-spenta-');
  try {
    const finta = giriFinti();
    const registro = createSessionRegistry({ cartellaStore, avviaSessioneFn: finta.avviaSessioneFn, ancoraStatoProvider: undefined });
    const { sessionId } = registro.avviaLibero({ cartellaId: '0', consegna: 'compito' });
    finta.concludi(STORIA_CON_STATO);
    await svuota(cartellaStore);

    const righe = righeJournal(cartellaStore, sessionId);
    assert.ok(indiciStoria(righe).length > 0, 'la storia del giro è scritta lo stesso: è il caso in esame, non un giro perso');
    assert.equal(indiciAncora(righe).length, 0, 'opzione spenta ⇒ il formato del giornale resta quello di prima');
  } finally {
    await svuota(cartellaStore);
    rimuoviCartellaDiProva(cartellaStore);
  }
});

test('P4-OPT-2: l’opzione è un booleano stretto: `false` e un valore non vero («1») non scrivono; solo `true` scrive', async () => {
  for (const [valore, scrive] of [[false, false], [0, false], ['true', false], [1, false], [true, true]]) {
    const cartellaStore = cartellaDiProva('talos-p4-opt-valori-');
    try {
      const finta = giriFinti();
      const registro = createSessionRegistry({ cartellaStore, avviaSessioneFn: finta.avviaSessioneFn, ancoraStatoProvider: valore });
      const { sessionId } = registro.avviaLibero({ cartellaId: '0', consegna: 'compito' });
      finta.concludi(STORIA_CON_STATO);
      await svuota(cartellaStore);
      assert.equal(indiciAncora(righeJournal(cartellaStore, sessionId)).length, scrive ? 1 : 0, `valore ${JSON.stringify(valore)}`);
    } finally {
      await svuota(cartellaStore);
      rimuoviCartellaDiProva(cartellaStore);
    }
  }
});

test('P4-OPT-3: la LETTURA non dipende dall’opzione — un giornale con ancora manomessa si valida anche in un registro che non scrive ancore', async () => {
  const cartellaStore = cartellaDiProva('talos-p4-opt-lettura-');
  try {
    const prima = giriFinti();
    const registro = createSessionRegistry({ cartellaStore, avviaSessioneFn: prima.avviaSessioneFn }); // la CLI: scrive
    const { sessionId } = registro.avviaLibero({ cartellaId: '0', consegna: 'compito' });
    prima.concludi(STORIA_CON_STATO);
    await svuota(cartellaStore);

    const percorso = join(cartellaStore, `${sessionId}.jsonl`);
    const righe = righeJournal(cartellaStore, sessionId).map((riga) => {
      const record = JSON.parse(riga);
      return record?.tipo === 'provider-state' ? JSON.stringify({ ...record, model: 'm-riscritto-da-un-altro-writer' }) : riga;
    });
    writeFileSync(percorso, `${righe.join('\n')}\n`, 'utf8');

    const dopo = giriFinti();
    const desktop = createSessionRegistry({ cartellaStore, avviaSessioneFn: dopo.avviaSessioneFn, ancoraStatoProvider: undefined });
    await desktop.ripristina();
    desktop.resume(sessionId, 'continua');
    await unTick();

    assert.equal(dopo.ultimo.messaggiIniziali.some((m) => m.talos_provider_state), false,
      'uno stato contraddetto dal proprio giornale non parte per il provider, con o senza l’opzione di scrittura');
  } finally {
    await svuota(cartellaStore);
    rimuoviCartellaDiProva(cartellaStore);
  }
});
