/*
 * 0.2.4, chiavi nel testo del web (decisione dell'owner 19/11 08:23, giudice v2229): la stessa protezione delle foto (blocco 6, giro 2)
 *   sul TESTO. `naviga` (e la sua partenza anticipata, che passa dalla stessa `apriPaginaWeb`) e `browser_page` non aprono un indirizzo che
 *   contiene il VALORE esatto di una chiave della persona: chiave del giro, chiave della ricerca web, ambiente col nome da credenziale e,
 *   se l'ospite la passa, `segretiConosciutiFn()`. Stesso aiuto delle foto (`indirizzoConUnaChiave` + la raccolta dei valori), stessa soglia
 *   di 16 caratteri, mai per forma. Rifiuto con frase chiara, ZERO carte. Senza la funzione: le sole fonti del nucleo, come le foto.
 *   Differenza voluta dalle foto: se la funzione dell'ospite LANCIA, la lettura del testo NON si chiude (oggi non c'è nessun controllo,
 *   chiudere romperebbe la navigazione): si confrontano comunque le fonti del nucleo.
 * ⛔ Nessun valore esce: le chiavi delle prove nascono a caso a ogni corsa; le asserzioni dicono solo sì o no.
 * Hermes blocca per FORMA (`tools/web_tools_extract.py:104`, `agent/redact.py:621`) e per NOME del parametro (`tools/url_safety.py:73`).
 * OpenAI («AI agent link safety», 28/01/2026): la fuga per indirizzo è un indirizzo che porta un dato della persona.
 */
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';
import { talosLavora } from '../src/kernel/talosHarness.mjs';

const chiaveFinta = () => `q${randomBytes(16).toString('hex')}`;
const CONCLUSO = { role: 'assistant', content: 'fatto', tool_calls: [] };
const chiamata = (nome, argomenti, id) => ({ role: 'assistant', content: null, tool_calls: [{ id, type: 'function', function: { name: nome, arguments: JSON.stringify(argomenti) } }] });
/* il confine dei dati ha un id a caso a ogni giro: per confrontare due esiti si toglie */
const senzaId = (s) => String(s).replace(/id=[0-9a-f]+/gu, 'id=X');
const CORPO = '<html><head><title>Docs</title></head><body><p>The page text.</p></body></html>';

function rete(...risposte) {
  const chiamate = [];
  return {
    chiamate,
    fetch: async (_url, opzioni) => {
      const i = chiamate.length;
      chiamate.push({ corpo: JSON.parse(opzioni.body) });
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: risposte[Math.min(i, risposte.length - 1)] }], usage: { prompt_tokens: 10, completion_tokens: 5 } }), text: async () => '' };
    },
  };
}

/* il modello chiama `naviga { url }`: letta o no (la cache finta conta le richieste: nessuna rete vera), l'esito, le carte */
async function naviga(t, url, { chiave = 'k', livelloAccesso = 'accesso-pieno', segretiConosciutiFn, ricercaWeb } = {}) {
  const c = mkdtempSync(join(tmpdir(), 'talos-ctw-'));
  t.after(() => rimuoviCartellaDiProva(c));
  const lette = [];
  let carte = 0;
  const r = rete(chiamata('naviga', { url }, 'n1'), CONCLUSO);
  await talosLavora({
    cartella: c, task: { consegna: 'leggi la pagina' }, modello: 'm', chiave, fetchDiRete: r.fetch, giriMassimi: 4, livelloAccesso,
    ...(segretiConosciutiFn ? { segretiConosciutiFn } : {}), ...(ricercaWeb ? { ricercaWeb } : {}),
    cacheWeb: { around: async (d) => { lette.push(d.url); return { value: { stato: 200, url: d.url, corpo: CORPO }, fromCache: false }; } },
    chiediApprovazioneFn: async () => { carte += 1; return true; },
  });
  const esito = r.chiamate[1]?.corpo.messages.filter((m) => m.role === 'tool').at(-1)?.content ?? '';
  return { letta: lette.length > 0, esito: senzaId(esito), carte };
}

test('CTW-01 naviga verso un indirizzo con una chiave SALVATA (funzione dell ospite): non si legge, frase chiara, zero carte, in ogni livello', async (t) => {
  const valore = chiaveFinta();
  let chiamate = 0;
  const segretiConosciutiFn = () => { chiamate += 1; return [valore]; };
  for (const livelloAccesso of ['lettura', 'su-richiesta', 'accesso-pieno']) {
    for (const url of [`https://x.example/?k=${valore}`, `https://x.example/${valore}/doc`, `https://x.example/doc#t=${valore}`]) {
      chiamate = 0;
      const r = await naviga(t, url, { segretiConosciutiFn, livelloAccesso });
      assert.equal(r.letta, false, `non letta (${livelloAccesso})`);
      assert.match(r.esito, /contains one of your keys/u);
      assert.match(r.esito, /Nothing was read/u);
      assert.equal(r.esito.includes(valore), false, 'il valore non torna al modello');
      assert.equal(r.carte, 0, 'zero carte');
      assert.ok(chiamate >= 1, 'la funzione è stata chiamata');
    }
  }
  /* una chiave con le MAIUSCOLE nel nome del sito: si guarda anche la forma com'è, non solo quella normalizzata */
  const maiuscola = `Q${randomBytes(16).toString('hex').toUpperCase()}`;
  const r = await naviga(t, `https://${maiuscola}.x.example/p`, { segretiConosciutiFn: () => [maiuscola] });
  assert.equal(r.letta, false, 'nel nome del sito');
  /* un a capo nel mezzo: il lettore dell'indirizzo lo toglie e la chiave partirebbe intera; si guarda anche la forma normalizzata */
  const r2 = await naviga(t, `https://x.example/?k=${valore.slice(0, 8)}\n${valore.slice(8)}`, { segretiConosciutiFn });
  assert.equal(r2.letta, false, 'forma normalizzata');
});

test('CTW-02 codificata in percento una e due volte: BLOCCATA come grezza (scelta: si decodifica, come le foto)', async (t) => {
  const valore = chiaveFinta();
  const meta = valore.length >> 1;
  const codificata = `${valore.slice(0, meta)}${[...valore.slice(meta)].map((ch) => `%${ch.charCodeAt(0).toString(16).padStart(2, '0')}`).join('')}`;
  for (const url of [`https://x.example/?k=${codificata}`, `https://x.example/?k=${codificata.replaceAll('%', '%25')}`]) {
    const r = await naviga(t, url, { segretiConosciutiFn: () => [valore] });
    assert.equal(r.letta, false);
    assert.match(r.esito, /contains one of your keys/u);
  }
});

test('CTW-03 senza la funzione valgono le fonti del nucleo: chiave del giro, della ricerca e ambiente bloccate; la salvata no (limite di CLI e telefono)', async (t) => {
  const delGiro = chiaveFinta();
  const r1 = await naviga(t, `https://x.example/?q=${delGiro}`, { chiave: delGiro });
  assert.equal(r1.letta, false, 'chiave del giro');
  const dellaRicerca = chiaveFinta();
  const r2 = await naviga(t, `https://x.example/?q=${dellaRicerca}`, { ricercaWeb: { provider: 'brave', apiKey: dellaRicerca } });
  assert.equal(r2.letta, false, 'chiave della ricerca');
  const ambiente = chiaveFinta();
  process.env.TALOS_PROVA_CTW_API_KEY = ambiente;
  t.after(() => { delete process.env.TALOS_PROVA_CTW_API_KEY; });
  const r3 = await naviga(t, `https://x.example/?q=${ambiente}`);
  assert.equal(r3.letta, false, 'ambiente col nome da credenziale');
  const r4 = await naviga(t, `https://x.example/?q=${chiaveFinta()}`);
  assert.equal(r4.letta, true, 'un valore che nessuno conosce passa (mai per forma)');
});

test('CTW-04 al contrario: indirizzo pulito passa UGUALE a prima (stesso esito byte per byte), segreto corto non blocca, forma di chiave non blocca', async (t) => {
  const url = 'https://developer.mozilla.org/en-US/docs/Web/API/fetch?lang=en';
  const senza = await naviga(t, url);
  const con = await naviga(t, url, { segretiConosciutiFn: () => [chiaveFinta(), chiaveFinta()] });
  assert.equal(senza.letta, true);
  assert.equal(con.letta, true);
  assert.equal(con.esito, senza.esito, 'stesso esito');
  const corta = 'abcdef123456789'; // 15 caratteri: mai confrontata
  const r = await naviga(t, `https://x.example/${corta}`, { segretiConosciutiFn: () => [corta, null, 5, '', {}, ['x']] });
  assert.equal(r.letta, true, 'sotto i 16 caratteri e valori storti: ignorati');
  const r2 = await naviga(t, 'https://cdn.example/a?token=abcdef1234567890abcdef&X-Amz-Credential=AKIAABCDEFGHIJKLMNOP', { segretiConosciutiFn: () => [chiaveFinta()] });
  assert.equal(r2.letta, true, 'mai per forma');
});

test('CTW-05 la funzione che LANCIA non rompe la navigazione: la pagina si legge; la chiave del giro resta bloccata', async (t) => {
  const rotta = () => { throw new Error('deposito giù'); };
  const r = await naviga(t, 'https://x.example/doc', { segretiConosciutiFn: rotta });
  assert.equal(r.letta, true, 'letta');
  assert.match(r.esito, /^HTTP 200/u);
  const delGiro = chiaveFinta();
  const r2 = await naviga(t, `https://x.example/?q=${delGiro}`, { chiave: delGiro, segretiConosciutiFn: rotta });
  assert.equal(r2.letta, false, 'le fonti del nucleo valgono anche con la funzione rotta');
  const asincronaRotta = async () => { throw new Error('giù'); };
  const r3 = await naviga(t, 'https://x.example/doc2', { segretiConosciutiFn: asincronaRotta });
  assert.equal(r3.letta, true, 'anche asincrona');
});

/* `browser_page`: la pagina aperta dalla persona. Prima della lettura si guarda l'indirizzo che il giro dice aperto; dopo, quello letto. */
async function paginaDelBrowser(t, { pagina, letta, segretiConosciutiFn }) {
  const c = mkdtempSync(join(tmpdir(), 'talos-ctw-bp-'));
  t.after(() => rimuoviCartellaDiProva(c));
  const viste = [];
  let carte = 0;
  const r = rete(chiamata('browser_page', {}, 'b1'), CONCLUSO);
  await talosLavora({
    cartella: c, task: { consegna: 'di cosa parla la pagina?' }, modello: 'm', chiave: 'k', fetchDiRete: r.fetch, giriMassimi: 4,
    strumentiEstesi: ['browser_page'], ...(pagina !== undefined ? { paginaBrowser: pagina } : {}),
    leggiPaginaBrowserFn: async (richiesta) => { viste.push(richiesta); return letta; },
    ...(segretiConosciutiFn ? { segretiConosciutiFn } : {}),
    chiediApprovazioneFn: async () => { carte += 1; return true; },
  });
  const esito = r.chiamate[1]?.corpo.messages.filter((m) => m.role === 'tool').at(-1)?.content ?? '';
  return { chiesta: viste.length > 0, esito: senzaId(esito), carte };
}

test('CTW-06 browser_page: la pagina aperta con una chiave nell indirizzo non si legge (prima e dopo la lettura); pulita uguale a prima', async (t) => {
  const valore = chiaveFinta();
  const conChiave = `https://dash.example/stats?q=${valore}`;
  const testo = 'Visible text of the page.';
  /* prima: l'indirizzo detto dal giro ⇒ l'ospite non viene nemmeno chiamato */
  const prima = await paginaDelBrowser(t, { pagina: { url: conChiave, titolo: 'Stats', via: 'cornice' }, letta: { ok: true, url: conChiave, titolo: 'Stats', testo }, segretiConosciutiFn: () => [valore] });
  assert.equal(prima.chiesta, false, 'ospite non chiamato');
  assert.match(prima.esito, /contains one of your keys/u);
  assert.equal(prima.esito.includes(valore), false);
  assert.equal(prima.esito.includes(testo), false);
  assert.equal(prima.carte, 0);
  /* dopo: il giro non dice la pagina (telefono), l'ospite ha letto quella col valore ⇒ il testo non arriva al modello */
  const dopo = await paginaDelBrowser(t, { pagina: undefined, letta: { ok: true, url: conChiave, titolo: 'Stats', testo }, segretiConosciutiFn: () => [valore] });
  assert.match(dopo.esito, /contains one of your keys/u);
  assert.equal(dopo.esito.includes(testo), false, 'il testo non arriva');
  assert.equal(dopo.esito.includes(valore), false);
  /* al contrario: pulita, con e senza funzione, esito uguale */
  const pulita = { ok: true, url: 'https://dash.example/stats', titolo: 'Stats', testo };
  const a = await paginaDelBrowser(t, { pagina: { url: pulita.url, titolo: 'Stats', via: 'cornice' }, letta: pulita });
  const b = await paginaDelBrowser(t, { pagina: { url: pulita.url, titolo: 'Stats', via: 'cornice' }, letta: pulita, segretiConosciutiFn: () => [valore] });
  assert.equal(b.esito, a.esito);
  assert.match(b.esito, /Visible text of the page/u);
  const rotta = await paginaDelBrowser(t, { pagina: { url: pulita.url, titolo: 'Stats', via: 'cornice' }, letta: pulita, segretiConosciutiFn: () => { throw new Error('giù'); } });
  assert.equal(rotta.esito, a.esito, 'funzione rotta: la lettura non si rompe');
});

/* Rumore (regola 17, decisione 375): 20 letture tipiche, carte e rifiuti prima e dopo. */
const TIPICHE = [
  'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise',
  'https://nodejs.org/api/fs.html#fspromisesreadfilepath-options',
  'https://docs.python.org/3/library/asyncio.html',
  'https://github.com/nodejs/node/issues/12345',
  'https://stackoverflow.com/questions/14220321/how-do-i-return-the-response-from-an-asynchronous-call',
  'https://en.wikipedia.org/wiki/Transport_Layer_Security',
  'https://www.npmjs.com/package/express?activeTab=versions',
  'https://react.dev/reference/react/useEffect',
  'https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-createfilew',
  'https://doc.rust-lang.org/std/collections/struct.HashMap.html',
  'https://www.repubblica.it/cronaca/2026/11/19/news/notizia-123456789/',
  'https://www.google.com/search?q=come+si+fa+una+torta&hl=it',
  'https://bucket.s3.amazonaws.com/report.pdf?X-Amz-Credential=AKIAABCDEFGHIJKLMNOP%2F20261119&X-Amz-Signature=abcdef0123456789abcdef0123456789',
  'https://example.com/reset?token=abcdef1234567890abcdef',
  'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  'https://arxiv.org/abs/2401.12345',
  'https://pypi.org/project/requests/2.32.3/',
  'https://www.amazon.it/dp/B0C1234567?ref=ppx_yo2ov_dt_b_product_details',
  'https://maps.google.com/?q=45.4642,9.1900',
  'https://api.github.com/repos/openai/codex/releases/latest',
];

test('CTW-07 rumore: 20 navigazioni tipiche con 30 chiavi note: carte uguali (0), rifiuti 0, esiti uguali', async (t) => {
  const note = Array.from({ length: 30 }, chiaveFinta);
  let carteSenza = 0; let carteCon = 0; let rifiuti = 0; let diversi = 0;
  for (const url of TIPICHE) {
    const senza = await naviga(t, url, { livelloAccesso: 'su-richiesta' });
    const con = await naviga(t, url, { livelloAccesso: 'su-richiesta', segretiConosciutiFn: () => note });
    carteSenza += senza.carte; carteCon += con.carte;
    if (!con.letta) rifiuti += 1;
    if (con.esito !== senza.esito) diversi += 1;
  }
  assert.equal(TIPICHE.length, 20);
  assert.equal(carteCon, carteSenza, 'carte uguali');
  assert.equal(carteCon, 0);
  assert.equal(rifiuti, 0, 'nessun rifiuto');
  assert.equal(diversi, 0, 'esiti uguali');
});
