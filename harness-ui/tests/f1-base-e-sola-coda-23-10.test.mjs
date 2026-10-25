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
  const inArrivo = Object.assign(new Promise((ok) => { setTimeout(() => ok({ ...pronta, origine: 'fine-giro' }), 300).unref(); }),
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
