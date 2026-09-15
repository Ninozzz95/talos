/*
 * ⛔⛔⛔ BC-11 — `scrivi` PERDEVA IL PERCORSO, E NON C'ERA MODO DI ALLUNGARE UN FILE.
 *
 * Owner 11/09/2026, sessione «genera un file html di almeno 1000 righe». Ricostruito dai
 * `ToolCallArgs` delle due sessioni vere (`8dde6bff` e `37e10d21`, 308 chiamate ad attrezzi):
 *
 *   · 46 chiamate su 308 col nome dell'argomento fuori schema; per `scrivi`:
 *       `path` 2 · `content` 1 · `contuto` 1 (un refuso suo)
 *   · `call_e242d54aac654068a40e32b0` ha mandato ESATTAMENTE `{"contenuto": …, "path": "_pian.mjs"}`
 *   · 3 chiamate con gli argomenti troncati a meta' stream (es. `call_c741309f96da49718f246d6c`,
 *     2.781 caratteri, stringa non chiusa), sostituite con `{}` per non far morire il provider
 *     (llama.cpp #22072: un `{` a meta' rimandato indietro fa HTTP 500 per sempre)
 *
 * In tutti questi casi `argomenti.percorso` arrivava `undefined`, `dentro('')` lo risolveva sulla
 * RADICE della sessione (`kernelPerIlBanco.js`) e il modello si prendeva
 *   `error: EISDIR: illegal operation on a directory, open 'C:\Users\…\qwen 3.8 research'`
 * — un errore che non nomina nessun campo. Cinque `scrivi` finite cosi', e nel ragionamento del
 * giro successivo si legge «Oops, empty call. Let me write _p3.html with content.»: un giro intero
 * pagato per INDOVINARE.
 *
 * E siccome `scrivi` pretendeva il file INTERO in una risposta sola, per un file lungo la sola
 * strada era la shell: 119 e 99 chiamate su 186 e 122 (il 64% e l'81%), `_p2.html`…`_p6core.js`,
 * un `cat >> … << 'PARTE2EOF'` da 23.941 caratteri morto con «La riga di comando e' troppo lunga»,
 * e un passo di assemblaggio mai arrivato in fondo.
 *
 * ⛔ Queste prove girano nei DUE VERSI: che la cura morda, e che senza la cura (nome giusto,
 *   nessun `mode`) il comportamento di prima sia intatto byte per byte.
 */

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

import {
  ALIAS_CONTENUTO,
  ALIAS_PERCORSO,
  MODALITA_DI_SCRITTURA,
  contenutoDiScrivi,
  discoNode,
  messaggioArgomentiAssenti,
  modalitaDiScrittura,
  percorsoDiFile,
  postcondizioneDiScrivi,
  talosLavora,
} from '../src/kernel/talosHarness.mjs';

/* ───────────────────────── gli argomenti VERI, copiati dalla sessione rotta ───────────────────── */

const DALLA_SESSIONE_ROTTA = { contenuto: 'export const piano = []\n', path: '_pian.mjs' };

test('⭐⭐⭐ il percorso in INGLESE arriva a destinazione: è la chiamata che finiva in EISDIR', () => {
  assert.equal(percorsoDiFile(DALLA_SESSIONE_ROTTA), '_pian.mjs');
  assert.equal(contenutoDiScrivi(DALLA_SESSIONE_ROTTA), 'export const piano = []\n');
  for (const nome of ALIAS_PERCORSO) assert.equal(percorsoDiFile({ [nome]: 'x.txt' }), 'x.txt', `alias perso: ${nome}`);
  for (const nome of ALIAS_CONTENUTO) assert.equal(contenutoDiScrivi({ [nome]: 'ciao' }), 'ciao', `alias perso: ${nome}`);
});

test('⛔ il nome italiano continua a vincere quando c\'è: è il contratto dichiarato nello schema', () => {
  assert.equal(percorsoDiFile({ percorso: 'vero.txt', path: 'finto.txt' }), 'vero.txt');
  assert.equal(contenutoDiScrivi({ contenuto: 'vero', content: 'finto' }), 'vero');
});

test('⛔⛔ AL CONTRARIO — senza nessun nome riconoscibile NON si indovina: percorso vuoto, contenuto assente', () => {
  assert.equal(percorsoDiFile({}), '');
  assert.equal(percorsoDiFile(null), '');
  assert.equal(percorsoDiFile({ descrizione: 'solo una descrizione' }), '');
  assert.equal(contenutoDiScrivi({}), undefined);
  assert.equal(contenutoDiScrivi(null), undefined);
});

test('⛔⛔⛔ `contenuto: ""` è una RICHIESTA, non un\'assenza — è la differenza da campoConAlias', () => {
  /*
   * `campoConAlias` salta le stringhe vuote (giusto per `shell`, dove un comando vuoto è un
   * guasto). Qui no: svuotare un file è una cosa che si può volere. Se i due casi collassassero,
   * una chiamata monca svuoterebbe il file invece di fallire — cioè distruggerebbe lavoro.
   */
  assert.equal(contenutoDiScrivi({ contenuto: '' }), '');
  assert.notEqual(contenutoDiScrivi({ contenuto: '' }), undefined);
  // ⛔ e un campo vuoto non deve far scivolare sull'alias successivo, che direbbe un'altra cosa
  assert.equal(contenutoDiScrivi({ contenuto: '', content: 'NON questo' }), '');
});

/* ───────────────────────────────── la modalità di scrittura ───────────────────────────────────── */

test('⭐⭐⭐ mode:"append" arriva, in tutte le forme che un modello scrive davvero', () => {
  assert.equal(modalitaDiScrittura({ mode: 'append' }), 'accoda');
  assert.equal(modalitaDiScrittura({ modalita: 'accoda' }), 'accoda');
  assert.equal(modalitaDiScrittura({ modality: 'add' }), 'accoda');
  assert.equal(modalitaDiScrittura({ append: true }), 'accoda');
  // maiuscole e spazi: è testo generato, non un enum battuto a macchina
  assert.equal(modalitaDiScrittura({ mode: '  APPEND ' }), 'accoda');
});

test('⛔ AL CONTRARIO — senza `mode` la modalità è "nuovo": il comportamento di sempre, intatto', () => {
  assert.equal(modalitaDiScrittura({}), 'nuovo');
  assert.equal(modalitaDiScrittura(null), 'nuovo');
  assert.equal(modalitaDiScrittura({ percorso: 'x', contenuto: 'y' }), 'nuovo');
  assert.equal(modalitaDiScrittura({ mode: 'create' }), 'nuovo');
  assert.equal(modalitaDiScrittura({ append: false }), 'nuovo');
});

test('⛔⛔ una modalità che non si capisce torna null — si DICE, non si indovina', () => {
  /*
   * Interpretare «overwrite» come «accoda» (o viceversa) sarebbe una scrittura sbagliata
   * dichiarata riuscita: il danno peggiore fra quelli possibili qui.
   */
  assert.equal(modalitaDiScrittura({ mode: 'overwrite' }), null);
  assert.equal(modalitaDiScrittura({ mode: 'patch' }), null);
});

test('⛔⛔⛔ la TABELLA delle modalità è la stessa di `document_create` — se una delle due cambia, questo test lo dice', () => {
  /*
   * Il kernel non può importare da `agent-service.mjs` (viaggia anche sul mobile), quindi la
   * tabella è scritta due volte. Due copie della stessa tabella vanno bene; due GRAMMATICHE
   * diverse no: un modello che ha imparato `mode:"append"` da un attrezzo deve trovarlo uguale
   * nell'altro. Qui si legge il sorgente vero dell'altro, non una copia incollata che invecchia.
   */
  const sorgente = readFileSync(new URL('../src/agent-service.mjs', import.meta.url), 'utf8');
  const riga = sorgente.split('\n').find((l) => l.includes('const MODALITA_DOCUMENTO'));
  assert.ok(riga, 'MODALITA_DOCUMENTO non esiste più in agent-service.mjs: la grammatica è cambiata di là');
  for (const [parola, valore] of Object.entries(MODALITA_DI_SCRITTURA)) {
    assert.ok(riga.includes(`${parola}: '${valore}'`),
      `⛔ "${parola}" vale "${valore}" nel kernel e non nella stessa forma in document_create: le due grammatiche stanno divergendo`);
  }
});

/* ──────────────────── i messaggi: due guasti diversi, due frasi diverse ───────────────────────── */

test('⭐⭐⭐ un JSON troncato NON viene detto «manca percorso»: è un guasto diverso e lo dice', () => {
  const troncato = messaggioArgomentiAssenti('scrivi', { troncati: true });
  const nomeSbagliato = messaggioArgomentiAssenti('scrivi', { troncati: false });
  assert.match(troncato, /INCOMPLETE/);
  assert.doesNotMatch(troncato, /no file path was given/,
    '⛔ dire «manca percorso» a chi è stato tagliato a metà lo manda a cercare un errore che non ha fatto');
  assert.match(nomeSbagliato, /`percorso`/);
  assert.match(nomeSbagliato, /`contenuto`/);
  assert.notEqual(troncato, nomeSbagliato);
});

test('⛔ ogni messaggio porta la MOSSA SUCCESSIVA, non solo la diagnosi', () => {
  assert.match(messaggioArgomentiAssenti('scrivi', { troncati: true }), /mode:"append"/,
    'un agente non va a cercare l\'istruzione: la legge nell\'esito che ha davanti (arXiv:2608.26130)');
  assert.match(messaggioArgomentiAssenti('scrivi', { campo: 'contenuto' }), /contenuto:""/,
    'svuotare un file di proposito deve restare possibile, e il messaggio deve dire come');
  assert.match(messaggioArgomentiAssenti('leggi'), /`leggi`/);
  assert.doesNotMatch(messaggioArgomentiAssenti('leggi'), /append/,
    '⛔ suggerire un\'aggiunta a una LETTURA sarebbe un consiglio senza senso');
});

/* ───────────────── il disco: l\'aggiunta esiste davvero, e la radice non si tocca ──────────────── */

function cartellaVuota(t) {
  const radice = mkdtempSync(join(tmpdir(), 'talos-bc11-'));
  t.after(() => rimuoviCartellaDiProva(radice));
  return radice;
}

test('⭐⭐⭐ `discoNode.scrivi` ACCODA davvero — e questa prova è la rete contro una rigenerazione del bundle', async (t) => {
  /*
   * `src/kernel/dist/kernelPerIlBanco.js` è un bundle rigenerato dal repo del kernel dell'owner.
   * Se una rigenerazione porta via il terzo argomento, lo schema di `scrivi` continuerebbe a
   * promettere `mode:"append"` a un kernel che non sa accodare: una bugia allo strumento. Qui la
   * suite diventa rossa invece di mentire in silenzio.
   */
  const radice = cartellaVuota(t);
  const disco = discoNode({ radice });
  await disco.scrivi('lungo.html', '<!doctype html>\n<html><body>\n');
  await disco.scrivi('lungo.html', '<p>parte due</p>\n', 'accoda');
  await disco.scrivi('lungo.html', '</body></html>\n', 'accoda');
  assert.equal(readFileSync(join(radice, 'lungo.html'), 'utf8'),
    '<!doctype html>\n<html><body>\n<p>parte due</p>\n</body></html>\n');
  assert.deepEqual(readdirSync(radice), ['lungo.html'],
    '⛔ UN file, non `lungo_p2.html`: è esattamente il difetto che l\'aggiunta esiste per togliere');
});

test('⛔ AL CONTRARIO — senza il terzo argomento `scrivi` SOVRASCRIVE, come ha sempre fatto', async (t) => {
  const radice = cartellaVuota(t);
  const disco = discoNode({ radice });
  await disco.scrivi('x.txt', 'primo');
  await disco.scrivi('x.txt', 'secondo');
  assert.equal(readFileSync(join(radice, 'x.txt'), 'utf8'), 'secondo');
  // e una modalità sconosciuta non diventa un'aggiunta per sbaglio
  await disco.scrivi('x.txt', 'terzo', 'qualunque-cosa');
  assert.equal(readFileSync(join(radice, 'x.txt'), 'utf8'), 'terzo');
});

test('⛔⛔⛔ un percorso VUOTO non scrive più sulla radice: il bug EISDIR, chiuso alla fonte', async (t) => {
  const radice = cartellaVuota(t);
  const disco = discoNode({ radice });
  await assert.rejects(() => disco.scrivi('', 'qualcosa'), /percorso vuoto/,
    '⛔ prima di questa riga qui arrivava `EISDIR: illegal operation on a directory` sulla cartella della sessione');
  assert.deepEqual(readdirSync(radice), [], 'la cartella deve restare com\'era');
});

/* ─────────────────────── la postcondizione, nei due versi ─────────────────────────────────────── */

test('⭐⭐ per un\'aggiunta la postcondizione chiede che il file FINISCA col pezzo, non che lo sia tutto', async () => {
  const discoChe = (testo) => ({ leggi: async () => testo });
  assert.deepEqual(await postcondizioneDiScrivi(discoChe('prima\nseconda'), 'x', 'seconda', 'accoda'), { esito: 'retta' });
  assert.equal((await postcondizioneDiScrivi(discoChe('prima'), 'x', 'seconda', 'accoda')).esito, 'smentita');
  // ⛔ AL CONTRARIO: con la stessa lettura, una scrittura PIENA resta smentita — l'uguaglianza stretta non si è ammorbidita
  assert.equal((await postcondizioneDiScrivi(discoChe('prima\nseconda'), 'x', 'seconda')).esito, 'smentita');
});

/* ─────────────────── il ciclo intero, con una rete finta e un disco vero ──────────────────────── */

/** Uno sportello finto che risponde con la sequenza data, una risposta per chiamata. */
function sportello(...risposte) {
  let indice = 0;
  return async () => {
    const scelta = risposte[Math.min(indice, risposte.length - 1)];
    indice += 1;
    return {
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: scelta }], usage: { prompt_tokens: 1, completion_tokens: 1 } }),
      text: async () => '',
    };
  };
}

const TASK = { consegna: 'una prova di BC-11' };
const FINE = { role: 'assistant', content: 'fatto', tool_calls: [] };
const chiama = (argomenti, id = 'call_1', nome = 'scrivi') => ({
  role: 'assistant',
  content: '',
  tool_calls: [{ id, function: { name: nome, arguments: typeof argomenti === 'string' ? argomenti : JSON.stringify(argomenti) } }],
});
const esitoDelTool = (esito) => esito.messaggiFinali.filter((m) => m.role === 'tool').map((m) => m.content);

test('⭐⭐⭐ IL GIRO VERO: `{"contenuto":…,"path":…}` ora scrive il file invece di dare EISDIR sulla radice', async (t) => {
  const cartella = cartellaVuota(t);
  const esito = await talosLavora({
    cartella, task: TASK, modello: 'x', chiave: 'y',
    fetchDiRete: sportello(chiama(DALLA_SESSIONE_ROTTA), FINE),
  });
  assert.equal(readFileSync(join(cartella, '_pian.mjs'), 'utf8'), 'export const piano = []\n');
  const [detto] = esitoDelTool(esito);
  assert.match(detto, /^written: _pian\.mjs/);
  assert.doesNotMatch(detto, /EISDIR/);
});

test('⭐⭐⭐ un percorso che NON c\'è riceve una frase che nomina il campo — e niente arriva al disco', async (t) => {
  const cartella = cartellaVuota(t);
  const esito = await talosLavora({
    cartella, task: TASK, modello: 'x', chiave: 'y',
    fetchDiRete: sportello(chiama({ contenuto: 'del testo' }), FINE),
  });
  const [detto] = esitoDelTool(esito);
  assert.match(detto, /no file path was given/);
  assert.match(detto, /`percorso`/);
  assert.doesNotMatch(detto, /EISDIR/, '⛔ è la riga per cui esiste tutta questa cura');
  assert.deepEqual(readdirSync(cartella), [], 'la radice della sessione non si tocca');
});

test('⭐⭐⭐ gli argomenti TRONCATI ricevono «rimanda la chiamata», non «manca percorso»', async (t) => {
  const cartella = cartellaVuota(t);
  // un JSON monco vero: stringa non chiusa, come `call_c741309f96da49718f246d6c`
  const esito = await talosLavora({
    cartella, task: TASK, modello: 'x', chiave: 'y',
    fetchDiRete: sportello(chiama('{"percorso":"p.html","contenuto":"<!doctype htm', 'call_troncata'), FINE),
  });
  const [detto] = esitoDelTool(esito);
  assert.match(detto, /INCOMPLETE/);
  assert.match(detto, /Send the call again/);
  assert.doesNotMatch(detto, /EISDIR/);
  assert.deepEqual(readdirSync(cartella), []);
});

test('⛔ senza contenuto non si scrive un file VUOTO: si dice quale campo manca', async (t) => {
  const cartella = cartellaVuota(t);
  writeFileSync(join(cartella, 'prezioso.txt'), 'lavoro di ore');
  const esito = await talosLavora({
    cartella, task: TASK, modello: 'x', chiave: 'y',
    fetchDiRete: sportello(chiama({ percorso: 'prezioso.txt' }), FINE),
  });
  assert.match(esitoDelTool(esito)[0], /no content was given/);
  assert.equal(readFileSync(join(cartella, 'prezioso.txt'), 'utf8'), 'lavoro di ore',
    '⛔ una chiamata monca NON deve svuotare un file che esiste');
});

test('⭐⭐⭐ mode:"append" — due giri, UN file, e nessun `_p2`', async (t) => {
  const cartella = cartellaVuota(t);
  const esito = await talosLavora({
    cartella, task: TASK, modello: 'x', chiave: 'y',
    fetchDiRete: sportello(
      chiama({ percorso: 'pagina.html', contenuto: '<!doctype html>\n<html><body>\n' }),
      chiama({ percorso: 'pagina.html', contenuto: '<p>seconda parte</p>\n', mode: 'append' }, 'call_2'),
      chiama({ percorso: 'pagina.html', contenuto: '</body></html>\n', append: true }, 'call_3'),
      FINE,
    ),
  });
  assert.equal(readFileSync(join(cartella, 'pagina.html'), 'utf8'),
    '<!doctype html>\n<html><body>\n<p>seconda parte</p>\n</body></html>\n');
  assert.deepEqual(readdirSync(cartella), ['pagina.html']);
  const detti = esitoDelTool(esito);
  assert.match(detti[1], /^appended to: pagina\.html/);
  assert.match(detti[1], /the file is now/, 'l\'esito dice quanto è lungo il file ORA: gli evita di rileggerlo');
});

test('⛔⛔ AL CONTRARIO — senza `mode` la seconda scrittura SOSTITUISCE ancora, come sempre', async (t) => {
  const cartella = cartellaVuota(t);
  await talosLavora({
    cartella, task: TASK, modello: 'x', chiave: 'y',
    fetchDiRete: sportello(
      chiama({ percorso: 'p.txt', contenuto: 'primo\n' }),
      chiama({ percorso: 'p.txt', contenuto: 'secondo\n' }, 'call_2'),
      FINE,
    ),
  });
  assert.equal(readFileSync(join(cartella, 'p.txt'), 'utf8'), 'secondo\n',
    '⛔ l\'aggiunta è un\'OPZIONE: il default non è cambiato di un byte');
});

test('⛔ una modalità incomprensibile non scrive niente e lo dice', async (t) => {
  const cartella = cartellaVuota(t);
  writeFileSync(join(cartella, 'p.txt'), 'com\'era');
  const esito = await talosLavora({
    cartella, task: TASK, modello: 'x', chiave: 'y',
    fetchDiRete: sportello(chiama({ percorso: 'p.txt', contenuto: 'nuovo', mode: 'overwrite' }), FINE),
  });
  assert.match(esitoDelTool(esito)[0], /is not a mode/);
  assert.equal(readFileSync(join(cartella, 'p.txt'), 'utf8'), 'com\'era');
});

test('⭐⭐ accodare a un file che NON esiste lo crea: non serve un primo giro di creazione', async (t) => {
  const cartella = cartellaVuota(t);
  await talosLavora({
    cartella, task: TASK, modello: 'x', chiave: 'y',
    fetchDiRete: sportello(chiama({ percorso: 'nuovo.md', contenuto: '# titolo\n', mode: 'append' }), FINE),
  });
  assert.equal(readFileSync(join(cartella, 'nuovo.md'), 'utf8'), '# titolo\n');
});

test('⭐⭐⭐ il cancello semantico giudica il file INTERO, non il solo pezzo: un\'aggiunta legittima passa', async (t) => {
  /*
   * Il caso che avrebbe reso l'aggiunta inutile proprio dove serve. `uso.ts` definisce `raddoppia`
   * nella prima parte; la seconda parte la USA. Se al cancello semantico fosse passato solo il
   * pezzo, `raddoppia` risulterebbe «riferimento che non esiste» e OGNI aggiunta a un sorgente
   * verrebbe respinta.
   */
  const cartella = cartellaVuota(t);
  const esito = await talosLavora({
    cartella, task: TASK, modello: 'x', chiave: 'y',
    fetchDiRete: sportello(
      chiama({ percorso: 'uso.ts', contenuto: 'export const raddoppia = (n: number) => n * 2\n' }),
      chiama({ percorso: 'uso.ts', contenuto: 'export const quattro = raddoppia(2)\n', mode: 'append' }, 'call_2'),
      FINE,
    ),
  });
  assert.equal(esito.premesseNegate, 0, '⛔ un simbolo definito nella parte già scritta non è un riferimento inventato');
  assert.match(readFileSync(join(cartella, 'uso.ts'), 'utf8'), /quattro = raddoppia\(2\)/);
});

test('⛔ e AL CONTRARIO il cancello semantico MORDE ancora su un\'aggiunta: una funzione inventata resta respinta', async (t) => {
  const cartella = cartellaVuota(t);
  const esito = await talosLavora({
    cartella, task: TASK, modello: 'x', chiave: 'y',
    fetchDiRete: sportello(
      chiama({ percorso: 'uso.ts', contenuto: 'export const uno = 1\n' }),
      chiama({ percorso: 'uso.ts', contenuto: 'export const x = funzioneCheNonEsisteDavvero(10)\n', mode: 'append' }, 'call_2'),
      FINE,
    ),
  });
  assert.equal(esito.premesseNegate, 1);
  assert.doesNotMatch(readFileSync(join(cartella, 'uso.ts'), 'utf8'), /funzioneCheNonEsisteDavvero/,
    '⛔ un rifiuto non deve lasciare mezzo pezzo sul disco');
});

test('⭐⭐ onScrittura riceve il file COME SARÀ dopo l\'aggiunta, non il solo pezzo (il pannello Review)', async (t) => {
  const cartella = cartellaVuota(t);
  const scritture = [];
  await talosLavora({
    cartella, task: TASK, modello: 'x', chiave: 'y',
    fetchDiRete: sportello(
      chiama({ percorso: 'r.md', contenuto: 'prima\n' }),
      chiama({ percorso: 'r.md', contenuto: 'seconda\n', mode: 'append' }, 'call_2'),
      FINE,
    ),
    onScrittura: (percorso, contenuto, esisteva, contenutoPrima) => scritture.push({ percorso, contenuto, esisteva, contenutoPrima }),
  });
  assert.deepEqual(scritture[1], {
    percorso: 'r.md', contenuto: 'prima\nseconda\n', esisteva: true, contenutoPrima: 'prima\n',
  }, '⛔ un diff che mostra «il file è diventato “seconda”» direbbe una bugia su una scrittura riuscita');
});

test('⭐⭐ anche `leggi` accetta il nome inglese, e senza percorso risponde a parole', async (t) => {
  const cartella = cartellaVuota(t);
  writeFileSync(join(cartella, 'c\'era.txt'), 'contenuto letto');
  const conAlias = await talosLavora({
    cartella, task: TASK, modello: 'x', chiave: 'y',
    fetchDiRete: sportello(chiama({ path: 'c\'era.txt' }, 'call_1', 'leggi'), FINE),
  });
  assert.equal(esitoDelTool(conAlias)[0], 'contenuto letto');

  const senzaNiente = await talosLavora({
    cartella, task: TASK, modello: 'x', chiave: 'y',
    fetchDiRete: sportello(chiama({}, 'call_1', 'leggi'), FINE),
  });
  assert.match(esitoDelTool(senzaNiente)[0], /no file path was given/);
  assert.doesNotMatch(esitoDelTool(senzaNiente)[0], /EISDIR/);
});
