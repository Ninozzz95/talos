/*
 * F1 della revisione 9 della CLI (23/10/2026): la «sola coda» (passi gratuiti) non è una compattazione e la sua riga dice `soloCoda`. Ma una
 * riga che copre una BASE adottata (un riassunto pagato, di fine giro o preparato in anticipo) più un resto di sola coda È una compattazione:
 * c'è un riassunto. La riga non dice `soloCoda` e il conto la conta. La scena è quella di S2-2-BASE-RIGA-01, con gli scambi fra la base e la
 * richiesta brevissimi: il resto non ha niente che valga un riassunto, e si riduce solo la coda (i quattro file letti).
 * Fornitore finto via `fetchDiRete`, cartelle temporanee, nessuna porta.
 */
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import { talosLavora as talosLavoraVero } from '../src/kernel/talosHarness.desktop-hotfix.mjs';
import { stimaTokenConversazione as stima } from '../src/kernel/talosHarness.mjs';
import * as compattazione from '../src/kernel/compattazione-desktop.mjs';
import { cartellaDiProva } from './aiuto/cartelle-di-prova.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const talosLavora = (input) => talosLavoraVero({ scartoMisurato: 0, ...input });
const storia = (coppie, lunghezza = 420) => Array.from({ length: coppie }, (_, i) => [
  { role: 'user', content: `Domanda ${i}: ${'parola '.repeat(lunghezza / 7)}` },
  { role: 'assistant', content: `Risposta ${i}: ${'parola '.repeat(lunghezza / 7)}` },
]).flat();
const coppiePer = (token) => { let c = 10; while (stima(storia(c + 1)) < token) c += 1; return c; };

test('F1-BASE-SOLA-CODA-01 — base adottata (riassunto pagato) più un resto di sola coda: la riga è una compattazione, senza `soloCoda`, e il conto la conta', async (t) => {
  const vecchio = process.env[compattazione.VARIABILE_TETTO_TOKEN];
  process.env[compattazione.VARIABILE_TETTO_TOKEN] = '4000';
  t.after(() => { if (vecchio === undefined) delete process.env[compattazione.VARIABILE_TETTO_TOKEN]; else process.env[compattazione.VARIABILE_TETTO_TOKEN] = vecchio; });
  const cartella = cartellaDiProva('talos-f1-base-');
  t.after(() => rimuoviCartellaDiProva(cartella));
  for (let i = 1; i <= 4; i += 1) writeFileSync(join(cartella, `g${i}.txt`), `${'riga lunga del file '.repeat(400)}\n`);
  const testo = (contenuto) => Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: contenuto }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 10 } });
  const r0 = async (_u, o) => { const corpo = JSON.parse(o.body); if (!corpo.tools?.length) return testo(`## Riassunto\n${'Dettaglio. '.repeat(20)}`); return Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: 'fatto' }, finish_reason: 'stop' }], usage: { prompt_tokens: stima(corpo.messages), completion_tokens: 1 } }); };
  const uno = await talosLavora({ cartella, modello: 'z-ai/glm-5.3-flash', chiave: 'finta', task: { consegna: 'Continua.' }, messaggiIniziali: storia(coppiePer(3800)), compattazioneIstantanea: true, contestoDelProgetto: 'Project files:\n', fetchDiRete: r0 });
  const pronta = uno.compattazionePronta ?? await uno.compattazioneInPreparazione;
  assert.ok(pronta && pronta.soloCoda !== true, 'premessa: la base è un riassunto pagato');
  /* ⛔ 28/10/2026 (C-6, contratto C1 «mai aspettare»): già arrivato quando il giro parte — prima arrivava dopo 300 ms e il giro lo
     aspettava all'emergenza. Oggi un riassunto in volo non si aspetta più, e senza attesa la base non c'è: la base si adotta quando il
     riassunto è già ARRIVATO (la stessa trasformazione di S2-2-BASE-RIGA-01). La scena è la stessa, senza l'attesa. */
  const inArrivo = Object.assign(Promise.resolve({ ...pronta, origine: 'fine-giro' }),
    { firma: { coveredThrough: pronta.record.coveredThrough, impronta: pronta.impronta, base: pronta.base } });
  let modello = 0;
  let riassuntiDelResto = 0;
  const r1 = async (_u, o) => {
    const corpo = JSON.parse(o.body);
    if (!corpo.tools?.length) { riassuntiDelResto += 1; return testo('## Riassunto\nbreve.'); }
    modello += 1;
    const usage = { prompt_tokens: stima(corpo.messages), completion_tokens: 1 };
    const nome = corpo.tools.map((x) => x.function?.name).find((n) => /^(leggi|read|read_file)$/u.test(n));
    if (modello === 1) return Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: null, tool_calls: [1, 2, 3, 4].map((i) => ({ id: `c${i}`, type: 'function', function: { name: nome, arguments: JSON.stringify({ percorso: `g${i}.txt`, path: `g${i}.txt` }) } })) }, finish_reason: 'tool_calls' }], usage });
    return Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: 'fatto' }, finish_reason: 'stop' }], usage });
  };
  const fini = [];
  const due = await talosLavora({ cartella, modello: 'z-ai/glm-5.3-flash', chiave: 'finta', task: { consegna: 'x' },
    /* fra la base e la richiesta due richieste vecchie LUNGHE con risposte brevissime: un riassunto non toglierebbe niente (le richieste
       restano alla lettera), la regola K le accorcia gratis */
    messaggiIniziali: [...uno.messaggiFinali,
      { role: 'user', content: `Domanda A:\n${'riga del log incollato A '.repeat(520)}` }, { role: 'assistant', content: 'ok' },
      { role: 'user', content: `Domanda B:\n${'riga del log incollato B '.repeat(520)}` }, { role: 'assistant', content: 'ok' },
      { role: 'user', content: 'Leggi g1-g4.' }],
    compattazioneInArrivo: inArrivo, contestoDelProgetto: 'Project files:\n', fetchDiRete: r1, permessi: 'Full access',
    onGiro: (e) => { if (e?.tipo === 'compattazione-fine') fini.push({ giro: e.giro, compattato: e.compattato, soloCoda: e.soloCoda === true, ridotti: e.ridotti ?? 0, accorciati: e.accorciati ?? 0, adottato: e.adottato ?? null }); } });
  const conBase = fini.filter((f) => f.compattato === true && f.adottato?.conResto === true);
  assert.equal(conBase.length, 1, `premessa: una riga di base più resto (${JSON.stringify(fini)})`);
  assert.equal(riassuntiDelResto, 0, 'premessa: il resto non ha pagato un riassunto (sola coda)');
  assert.ok(conBase[0].ridotti + conBase[0].accorciati >= 1, `premessa: il resto ha accorciato gratis (${JSON.stringify(conBase[0])})`);
  assert.equal(conBase[0].soloCoda, false, 'la riga copre un riassunto: non è «sola coda»');
  const contate = fini.filter((f) => f.compattato === true && !f.soloCoda && !(f.adottato?.origine === 'fine-giro' && f.adottato.conResto !== true)).length;
  assert.equal(due.compattazioni, contate, `il conto la conta (${due.compattazioni} contro ${contate}: ${JSON.stringify(fini)})`);
  assert.ok(due.compattazioni >= 1);
});

/*
 * ⛔ C-6 (28/10/2026, one-up del 22/10: «valido ma insufficiente diventa la BASE e si riassume solo il resto»). Con il contratto C1 il resto
 *   dopo la base è il riassunto senza modello (ragione 'in-arrivo') e quello del modello si fa in sottofondo. Quel riassunto deve partire
 *   dalla proiezione CON la base e riassumere solo il resto — non dalla storia di prima della base, che la base copre già. Si misura
 *   l'INGRESSO del riassunto pagato in sottofondo contro la storia che la base copre. Scena di S2-2-BASE-RIGA-01 «resto-riuscito».
 */
test('C6-BASE-RESTO-01 — dopo una base adottata, il riassunto del modello in sottofondo riassume solo il resto, partendo dalla base', async (t) => {
  const vecchio = process.env[compattazione.VARIABILE_TETTO_TOKEN];
  process.env[compattazione.VARIABILE_TETTO_TOKEN] = '4000';
  t.after(() => { if (vecchio === undefined) delete process.env[compattazione.VARIABILE_TETTO_TOKEN]; else process.env[compattazione.VARIABILE_TETTO_TOKEN] = vecchio; });
  const cartella = cartellaDiProva('talos-c6-base-resto-');
  t.after(() => rimuoviCartellaDiProva(cartella));
  for (let i = 1; i <= 4; i += 1) writeFileSync(join(cartella, `g${i}.txt`), `${'riga lunga del file '.repeat(400)}\n`);
  const testo = (contenuto) => Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: contenuto }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 10 } });
  const r0 = async (_u, o) => { const corpo = JSON.parse(o.body); if (!corpo.tools?.length) return testo(`## Riassunto\n${'Dettaglio. '.repeat(20)}`); return Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: 'fatto' }, finish_reason: 'stop' }], usage: { prompt_tokens: stima(corpo.messages), completion_tokens: 1 } }); };
  const storiaUno = storia(coppiePer(3800));
  const uno = await talosLavora({ cartella, modello: 'z-ai/glm-5.3-flash', chiave: 'finta', task: { consegna: 'Continua.' }, messaggiIniziali: storiaUno, compattazioneIstantanea: true, contestoDelProgetto: 'Project files:\n', fetchDiRete: r0 });
  const pronta = uno.compattazionePronta ?? await uno.compattazioneInPreparazione;
  assert.ok(pronta && pronta.soloCoda !== true, 'premessa: la base è un riassunto pagato');
  const inArrivo = Object.assign(Promise.resolve({ ...pronta, origine: 'fine-giro' }),
    { firma: { coveredThrough: pronta.record.coveredThrough, impronta: pronta.impronta, base: pronta.base } });
  const ingressi = [];
  let modello = 0;
  const r1 = async (_u, o) => {
    const corpo = JSON.parse(o.body);
    if (!corpo.tools?.length) { ingressi.push(JSON.stringify(corpo.messages)); return testo('## Riassunto\nbreve.'); }
    modello += 1;
    const usage = { prompt_tokens: stima(corpo.messages), completion_tokens: 1 };
    const nome = corpo.tools.map((x) => x.function?.name).find((n) => /^(leggi|read|read_file)$/u.test(n));
    if (modello === 1) return Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: null, tool_calls: [1, 2, 3, 4].map((i) => ({ id: `c${i}`, type: 'function', function: { name: nome, arguments: JSON.stringify({ percorso: `g${i}.txt`, path: `g${i}.txt` }) } })) }, finish_reason: 'tool_calls' }], usage });
    return Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: 'fatto' }, finish_reason: 'stop' }], usage });
  };
  const fini = [];
  const due = await talosLavora({ cartella, modello: 'z-ai/glm-5.3-flash', chiave: 'finta', task: { consegna: 'x' },
    messaggiIniziali: [...uno.messaggiFinali, ...storia(4, 2_800), { role: 'user', content: `Leggi g1-g4. ${'contesto '.repeat(350)}` }],
    compattazioneInArrivo: inArrivo, contestoDelProgetto: 'Project files:\n', fetchDiRete: r1, permessi: 'Full access',
    onGiro: (e) => { if (e?.tipo === 'compattazione-fine' && e.compattato === true) fini.push({ ragione: e.ragione ?? null, conResto: e.adottato?.conResto === true }); } });
  await due.compattazioneInPreparazione;
  assert.ok(fini.some((f) => f.conResto && f.ragione === 'in-arrivo'), `premessa: base adottata più il resto senza modello, «in-arrivo» (${JSON.stringify(fini)})`);
  /* almeno uno; sotto carico la richiesta dopo le letture può essere una seconda emergenza, col suo rapido e il suo riassunto — anche quello
     non deve rileggere la storia che la base copre */
  assert.ok(ingressi.length >= 1, `premessa: un riassunto del modello, in sottofondo (${ingressi.length})`);
  /* le risposte della storia che la base copre e NON porta alla lettera (le ha riassunte lei); il resto (`storia(4, …)`) usa i numeri 0-3 */
  const dellaBase = JSON.stringify(pronta.record.riassunto);
  const coperte = storiaUno.filter((m) => m.role === 'assistant').map((m) => m.content.split(':')[0])
    .filter((k) => Number(k.split(' ')[1]) >= 4 && !dellaBase.includes(`${k}:`));
  assert.ok(coperte.length >= 3, `premessa: la base copre risposte che non porta alla lettera (${coperte})`);
  const ritornate = coperte.filter((k) => ingressi.some((ingresso) => ingresso.includes(`${k}:`)));
  assert.deepEqual(ritornate, [], `il riassunto pagato in sottofondo parte dalla base: non rilegge la storia che la base copre già (${ritornate.length} risposte di nuovo)`);
});
