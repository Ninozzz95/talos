/*
 * §4.2, regola K (owner 22/10/2026, decisione presa nella sessione della CLI): «i messaggi lunghi già inviati e risposti si accorciano
 * per il modello, tenendo inizio e fine, e il testo intero resta in un file che il modello può leggere».
 * Le richieste vecchie della persona oltre min(20.000 token, 15% della finestra), dalla più nuova come Codex (`compact.rs:64`,
 * `:715-799`, che però butta le più vecchie): qui inizio e fine di ognuna e il testo intero in `<negozio>/incollati/<sessione>/`, letto
 * da `leggi` senza chiedere come le pagine web salvate. L'ultima richiesta non si tocca mai (regola N).
 */
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  MARCATORE_RICHIESTA_ACCORCIATA, limitaRichiesteVecchie, nomeDellaRichiestaSalvata, pianoRichiesteVecchie, richiestaAccorciataPerIlModello,
  salvaRichiestaIntera, scriviCopieDelPiano, tettoRichiesteVecchie,
} from '../src/kernel/richieste-vecchie.mjs';
import { eRichiestaVera, primaRichiestaPerLaProiezione } from '../src/kernel/compattazione-desktop.mjs';
import { stimaTokenConversazione as stima, talosLavora } from '../src/kernel/talosHarness.mjs';
import { cartellaIncollatiDi, eliminaSessionePersistita } from '../src/session-store.mjs';
import { avviaSessione } from '../src/agent-service.mjs';
import { togliConfiniDati } from '../src/kernel/confine-dati.mjs';
import { creaRecord } from '../src/kernel/compattazione-desktop.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

function cartella(t, nome = 'talos-regola-k-') {
  /* il percorso canonico: sul runner di GitHub la Temp è un nome corto 8.3 e `realpath` lo espande (lezione di NAV, PR #45) */
  const c = realpathSync.native(mkdtempSync(join(tmpdir(), nome)));
  t.after(() => rimuoviCartellaDiProva(c));
  return c;
}
const lungo = (etichetta, caratteri) => `${etichetta}\n${Array.from({ length: Math.ceil(caratteri / 50) }, (_, i) => `${etichetta} riga ${String(i).padStart(5, '0')} ${'x'.repeat(30)}`).join('\n')}`;
const opzioni = (extra = {}) => ({ budgetToken: 5_000, eRichiesta: eRichiestaVera, stima, ...extra });

test('K-PIANO-01 — dalla più nuova: chi sfora il budget e le più vecchie si accorciano; l\'ultima richiesta, le corte, le risposte e le note no', () => {
  const vecchiaA = lungo('VECCHIA-A', 30_000); // ~7.500 token
  const vecchiaB = lungo('VECCHIA-B', 30_000);
  const corta = 'Una richiesta corta.';
  const ultima = lungo('ULTIMA', 30_000);
  const messaggi = [
    { role: 'system', content: 's' },
    { role: 'user', content: vecchiaA }, { role: 'assistant', content: lungo('RISPOSTA', 30_000) },
    { role: 'user', content: vecchiaB }, { role: 'assistant', content: 'ok' },
    { role: 'user', content: '[TALOS] nota del kernel' },
    { role: 'user', content: corta }, { role: 'assistant', content: 'ok' },
    { role: 'user', content: ultima },
  ];
  const piano = pianoRichiesteVecchie(messaggi, opzioni({ cartella: 'C:\\copie' }));
  const testo = (i) => piano.messaggi[i].content;
  assert.equal(testo(8), ultima, 'l\'ultima richiesta non si tocca mai (regola N)');
  assert.equal(testo(6), corta, 'una corta resta com\'è');
  assert.equal(testo(5), '[TALOS] nota del kernel', 'una nota del kernel non è una richiesta');
  assert.equal(testo(2), messaggi[2].content, 'le risposte non si toccano');
  /* dalla più nuova: corta (~5) + B (~7.500) sfora i 5.000 ⇒ B e A si accorciano */
  assert.ok(testo(3).startsWith(MARCATORE_RICHIESTA_ACCORCIATA) && testo(1).startsWith(MARCATORE_RICHIESTA_ACCORCIATA), 'B (che sfora) e A (più vecchia) accorciate');
  assert.equal(piano.accorciati, 2);
  assert.deepEqual(piano.daSalvare.map((d) => d.percorso), [join('C:\\copie', nomeDellaRichiestaSalvata(vecchiaB)), join('C:\\copie', nomeDellaRichiestaSalvata(vecchiaA))]);
  assert.ok(testo(3).includes(`saved at "${join('C:\\copie', nomeDellaRichiestaSalvata(vecchiaB))}"`), 'il percorso esatto della copia intera');
  assert.ok(testo(3).includes('VECCHIA-B riga 00000') && testo(3).includes(vecchiaB.slice(-40)), 'inizio e fine tenuti');
  assert.ok(stima([piano.messaggi[3]]) < 2_500, `molto più corta (${stima([piano.messaggi[3]])} token)`);
  /* AL CONTRARIO: con un budget che le contiene tutte, niente */
  assert.equal(pianoRichiesteVecchie(messaggi, opzioni({ budgetToken: 50_000 })).accorciati, 0);
});

test('K-PIANO-02 — una richiesta già accorciata non si riaccorcia, e il piano è lo stesso a ogni compattazione (stessa proiezione, byte per byte)', () => {
  const vecchia = lungo('VECCHIA', 40_000);
  const messaggi = [{ role: 'user', content: vecchia }, { role: 'assistant', content: 'ok' }, { role: 'user', content: 'ultima' }];
  const uno = pianoRichiesteVecchie(messaggi, opzioni({ budgetToken: 100, cartella: 'C:\\copie' }));
  const due = pianoRichiesteVecchie(messaggi, opzioni({ budgetToken: 100, cartella: 'C:\\copie' }));
  assert.deepEqual(due.messaggi, uno.messaggi, 'stesso testo, stessa copia, stessa proiezione');
  const sopra = pianoRichiesteVecchie(uno.messaggi, opzioni({ budgetToken: 100, cartella: 'C:\\copie' }));
  assert.equal(sopra.accorciati, 0, 'la proiezione già accorciata non si tocca di nuovo');
  assert.deepEqual(sopra.messaggi, uno.messaggi);
});

test('K-PRIMA-01 — la prima richiesta della compattazione non riaccorcia una richiesta già accorciata dalla regola K (perderebbe l\'avviso e il percorso)', () => {
  const vecchia = lungo('PRIMA', 40_000);
  const accorciata = { role: 'user', content: richiestaAccorciataPerIlModello(vecchia, 'C:\\copie\\x.txt') };
  assert.ok(accorciata.content.length > 8_000, 'premessa: oltre il tetto della prima richiesta');
  assert.equal(primaRichiestaPerLaProiezione(accorciata).content, accorciata.content);
  /* AL CONTRARIO: una prima richiesta lunga e intera si accorcia come sempre */
  assert.notEqual(primaRichiestaPerLaProiezione({ role: 'user', content: vecchia }).content, vecchia);
});

test('K-SALVA-01 — la copia intera si scrive una volta (nome dall\'impronta), e una che non si scrive non promette una lettura', async (t) => {
  const radice = cartella(t);
  const copie = join(radice, 'incollati', 'sessione-1');
  const testo = lungo('COPIA', 20_000);
  const uno = await salvaRichiestaIntera(copie, testo);
  const due = await salvaRichiestaIntera(copie, testo);
  assert.equal(uno, due, 'stesso testo, stesso file');
  assert.equal(readFileSync(uno, 'utf8'), testo, 'byte per byte');
  assert.deepEqual(readdirSync(copie), [nomeDellaRichiestaSalvata(testo)], 'un file solo, nessun temporaneo lasciato');
  /* una «cartella» che è un file: la scrittura fallisce e il messaggio dice che il mezzo non si legge */
  const bloccata = join(radice, 'non-una-cartella');
  writeFileSync(bloccata, 'x');
  const messaggi = [{ role: 'user', content: testo }, { role: 'assistant', content: 'ok' }, { role: 'user', content: 'ultima' }];
  const esito = await limitaRichiesteVecchie(messaggi, opzioni({ budgetToken: 10, cartella: bloccata }));
  assert.equal(esito.accorciati, 1);
  assert.deepEqual(esito.salvati, []);
  assert.match(esito.messaggi[0].content, /could not be saved, so the omitted middle cannot be read/u);
  assert.doesNotMatch(esito.messaggi[0].content, /saved at "/u);
  /* e così anche dopo un piano diviso (il registro): la sostituzione per identità */
  const piano = pianoRichiesteVecchie(messaggi, opzioni({ budgetToken: 10, cartella: bloccata }));
  const parti = { mezzo: [piano.messaggi[0], piano.messaggi[1]], coda: [piano.messaggi[2]], richiesteLetterali: [piano.messaggi[0]] };
  const scritte = await scriviCopieDelPiano(parti, piano.daSalvare, bloccata);
  assert.match(scritte.mezzo[0].content, /could not be saved/u);
  assert.equal(scritte.richiesteLetterali[0], scritte.mezzo[0], 'la stessa sostituzione ovunque sia finito il messaggio');
  assert.equal(scritte.coda[0], parti.coda[0], 'il resto non cambia');
});

test('K-TETTO-01 — il budget è min(20.000 token, 15% della finestra — o della soglia/0,75 senza finestra)', () => {
  assert.equal(tettoRichiesteVecchie({ finestraToken: 400_000 }), 20_000);
  assert.equal(tettoRichiesteVecchie({ finestraToken: 16_384 }), 2_457);
  assert.equal(tettoRichiesteVecchie({ soglia: 12_000 }), 2_400);
  assert.equal(tettoRichiesteVecchie({}), 20_000);
});

/* `leggi` sulla copia intera: fuori dal progetto, sotto una cartella nascosta (il negozio delle sessioni), come le pagine web salvate */
function fornitore(prossima, esiti) {
  let n = 0;
  return async () => {
    const c = prossima(n, esiti);
    n += 1;
    const message = c
      ? { role: 'assistant', content: null, tool_calls: [{ id: `c${n}`, type: 'function', function: { name: c[0], arguments: JSON.stringify(c[1]) } }] }
      : { role: 'assistant', content: 'fatto' };
    return new Response(JSON.stringify({ choices: [{ message, finish_reason: c ? 'tool_calls' : 'stop' }] }), { headers: { 'Content-Type': 'application/json' } });
  };
}
async function leggiCon(t, { cartellaIncollati, percorso }) {
  const radice = cartella(t);
  const workspace = join(radice, 'progetto');
  mkdirSync(workspace);
  const esiti = [];
  const chieste = [];
  await talosLavora({
    cartella: workspace, task: { consegna: 'leggi la copia' }, modello: 'f', chiave: 'k', giriMassimi: 4,
    fetchDiRete: fornitore((n) => (n === 0 ? ['leggi', { percorso, offset: 1 }] : null), esiti),
    onGiro: (e) => { if (e.tipo === 'tool-esito') esiti.push(togliConfiniDati(String(e.content))); },
    chiediApprovazioneFn: async (a) => { chieste.push(a); return false; },
    ...(cartellaIncollati ? { cartellaIncollati } : {}),
  });
  return { esiti, chieste };
}

test('K-LEGGI-01 — `leggi` apre la copia intera della sessione senza chiedere; AL CONTRARIO, lo stesso file senza la cartella dichiarata, o un file accanto, chiede', async (t) => {
  const radice = cartella(t);
  const copie = join(radice, '.sessions-store', 'incollati', 'sessione-1');
  const testo = lungo('DA-LEGGERE', 6_000);
  const percorso = await salvaRichiestaIntera(copie, testo);
  const vista = await leggiCon(t, { cartellaIncollati: copie, percorso });
  assert.equal(vista.chieste.length, 0, `nessuna domanda (${JSON.stringify(vista.chieste)})`);
  assert.match(vista.esiti[0] ?? '', /DA-LEGGERE riga 00000/u, 'e il testo arriva');
  const senza = await leggiCon(t, { cartellaIncollati: null, percorso });
  assert.equal(senza.chieste.length, 1, 'senza la cartella dichiarata è un file fuori dal progetto: si chiede');
  const accanto = join(radice, '.sessions-store', 'incollati', 'altro.txt');
  writeFileSync(accanto, 'altro');
  const fuori = await leggiCon(t, { cartellaIncollati: copie, percorso: accanto });
  assert.equal(fuori.chieste.length, 1, 'un file fuori dalla cartella della sessione chiede');
});

test('K-NEGOZIO-01 — la cartella delle copie è per sessione e se ne va con la sessione', async (t) => {
  const store = cartella(t);
  const sessionId = 'sessione-k';
  writeFileSync(join(store, `${sessionId}.jsonl`), `${JSON.stringify({ tipo: 'intestazione' })}\n`);
  const copie = cartellaIncollatiDi(store, sessionId);
  assert.equal(copie, join(store, 'incollati', sessionId));
  await salvaRichiestaIntera(copie, lungo('VA-VIA', 10_000));
  assert.equal(readdirSync(copie).length, 1, 'premessa: una copia');
  await eliminaSessionePersistita({ cartellaStore: store, sessionId });
  assert.equal(existsSync(copie), false, 'eliminata con la sessione');
});

test('K-EVENTO-01 — una riduzione SOLO gratuita con richieste accorciate arriva al giornale come `accorciati` con quante; AL CONTRARIO, una con riassunto tiene il suo motivo e porta il numero', async () => {
  const eventi = [];
  const record = creaRecord({ coveredThrough: 5, riassunto: [{ role: 'user', content: 'R' }], tokenPrima: 9_000, tokenDopo: 3_000, misura: 'stimato', at: '2026-10-22T23:00:00.000Z', modello: 'z-ai/glm-5.3-flash' });
  let ricevuta = null;
  await avviaSessione({
    cartella: '/tmp/x', task: { consegna: 'prova' }, modello: 'm', chiave: 'k', cartellaIncollati: 'C:\\negozio\\incollati\\s1',
    onEvento: (e) => { eventi.push(e); },
    talosLavoraFn: async (input) => {
      ricevuta = input.cartellaIncollati;
      input.onGiro({ giro: 2, tipo: 'compattazione-inizio', tokenMisurati: 9_000, soglia: 8_000, motivo: 'soglia' });
      input.onGiro({ giro: 2, tipo: 'compattazione-fine', compattato: true, record, soloCoda: true, accorciati: 2 });
      input.onGiro({ giro: 3, tipo: 'compattazione-inizio', tokenMisurati: 9_000, soglia: 8_000, motivo: 'soglia' });
      input.onGiro({ giro: 3, tipo: 'compattazione-fine', compattato: true, record, accorciati: 1 });
      return { comeFinita: 'concluso', detto: 'fatto', messaggiFinali: [], recordDiCompattazione: [record] };
    },
  });
  assert.equal(ricevuta, 'C:\\negozio\\incollati\\s1', 'la cartella arriva al kernel com\'è');
  const fini = eventi.filter((e) => e.type === 'CUSTOM' && e.name === 'talos.compattazione' && e.value.fase === 'fine').map((e) => e.value);
  assert.equal(fini[0].motivo, 'accorciati');
  assert.equal(fini[0].messaggi, 2);
  assert.equal(fini[1].motivo, 'soglia', 'con un riassunto il motivo resta quello che ha fatto scattare');
  assert.equal(fini[1].messaggi, 1);
});
