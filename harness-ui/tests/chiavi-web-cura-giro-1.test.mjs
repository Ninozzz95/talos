/*
 * 0.2.4, «chiavi nel testo web», GIRO DI CURA 1 (revisore ROSSO del 19/11 09:49, forma decisa dal giudice v2243).
 *   Cura 1: un decodificatore in percento che NON lancia mai (ogni `%XX` valido da solo, il rotto resta com'è), fino a 3 passate, su
 *   tutto l'indirizzo e su ogni pezzo (utente, parola d'ordine, sito, percorso, query, ogni parametro, frammento). Prima un «%» solitario,
 *   un `%ZZ` o un UTF-8 rotto facevano lanciare `decodeURIComponent` sull'indirizzo intero e la chiave codificata passava (REV-01).
 *   Cura 2: dall'ambiente solo i valori che sembrano chiavi: fuori i valori che sono indirizzi, posta o nomi di host e i nomi che finiscono
 *   per `_HOST`, `_URL`, `_URI`, `_EMAIL`, `_NAME`, `_DOMAIN`, più AUTHOR (REV-07). L'ambiente si passa FINTO alla funzione.
 * REV-01..08: le prove del revisore (`C:/T/024-chiavi-web-rev/harness-ui/tests/rev-chiavi-nel-testo-web.test.mjs`), copiate qui; REV-02
 *   adattata: la tripla codifica, limite dichiarato prima, ora è chiusa (le maiuscole restano un limite).
 * ⛔ Nessun valore esce: chiavi finte nate a caso a ogni corsa, asserzioni sì o no.
 */
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { Worker } from 'node:worker_threads';

import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';
import * as nucleo from '../src/kernel/talosHarness.mjs';

const { talosLavora, indirizzoConUnaChiave, leggiPaginaSicura } = nucleo;
const chiaveFinta = () => `q${randomBytes(16).toString('hex')}`;
const CONCLUSO = { role: 'assistant', content: 'fatto', tool_calls: [] };
const chiamate = (...cs) => ({ role: 'assistant', content: null, tool_calls: cs.map(([nome, argomenti, id]) => ({ id, type: 'function', function: { name: nome, arguments: JSON.stringify(argomenti) } })) });
const senzaId = (s) => String(s).replace(/id=[0-9a-f]+/gu, 'id=X');
const CORPO = '<html><head><title>Docs</title></head><body><p>The page text.</p></body></html>';
const codifica = (s) => [...s].map((ch) => `%${ch.charCodeAt(0).toString(16).padStart(2, '0')}`).join('');
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 3, 32, 0, 0, 2, 88, 8, 2, 0, 0, 0, 0, 0, 0]);

function rete(...risposte) {
  const fatte = [];
  return {
    fatte,
    fetch: async (_url, opzioni) => {
      const i = fatte.length;
      fatte.push({ corpo: JSON.parse(opzioni.body) });
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: risposte[Math.min(i, risposte.length - 1)] }], usage: { prompt_tokens: 10, completion_tokens: 5 } }), text: async () => '' };
    },
  };
}

async function giro(t, risposta, { chiave = 'k', segretiConosciutiFn, livelloAccesso = 'accesso-pieno' } = {}) {
  const c = mkdtempSync(join(tmpdir(), 'talos-cwc-'));
  t.after(() => rimuoviCartellaDiProva(c));
  const lette = [];
  const eventi = [];
  let carte = 0;
  const r = rete(risposta, CONCLUSO);
  await talosLavora({
    cartella: c, task: { consegna: 'leggi la pagina' }, modello: 'm', chiave, fetchDiRete: r.fetch, giriMassimi: 4, livelloAccesso,
    ...(segretiConosciutiFn ? { segretiConosciutiFn } : {}),
    cacheWeb: { around: async (d) => { lette.push(d.url); return { value: { stato: 200, url: d.url, corpo: CORPO }, fromCache: false }; } },
    chiediApprovazioneFn: async () => { carte += 1; return true; },
    onGiro: (e) => { eventi.push(e); },
  });
  const esiti = (r.fatte[1]?.corpo.messages ?? []).filter((m) => m.role === 'tool').map((m) => senzaId(m.content));
  return { lette, esiti, carte, eventi };
}
const naviga = (t, url, o) => giro(t, chiamate(['naviga', { url }, 'n1']), o).then((r) => ({ ...r, letta: r.lette.length > 0, esito: r.esiti.at(-1) ?? '' }));

/* ---------------------------------------------------------------- REV-01..08 (del revisore) */

test('REV-01 BUCO: chiave codificata UNA volta + un «%» solitario (o %ZZ, o UTF-8 rotto) nello stesso indirizzo ⇒ la decodifica intera lancia e la chiave passa', async (t) => {
  const valore = chiaveFinta();
  const varianti = [
    `https://x.example/?a=100%&k=${codifica(valore)}`,
    `https://x.example/?a=%ZZ&k=${codifica(valore)}`,
    `https://x.example/?a=%E0%A4&k=${codifica(valore)}`,
    `https://x.example/?a=%&k=${codifica(valore).replaceAll('%', '%25')}`,
  ];
  const passate = [];
  for (const [i, url] of varianti.entries()) {
    const r = await naviga(t, url, { segretiConosciutiFn: () => [valore] });
    if (r.letta) passate.push(i);
  }
  /* il server riceverebbe la chiave: la catena di `naviga` accetta l'indirizzo e il lettore dei parametri lo decodifica */
  let inviato = null;
  await leggiPaginaSicura(varianti[0], async (u) => { inviato = u.toString(); return { stato: 200, corpo: '' }; });
  const ricevutaDalServer = new URL(inviato).searchParams.get('k') === valore;
  /* adattata dal revisore: «il server la leggerebbe» è il motivo del buco, non si cambia con la cura; la cura è che non parte */
  assert.deepEqual({ passate, ricevutaDalServer }, { passate: [], ricevutaDalServer: true }, 'BUCO: queste varianti aprono la pagina');
});

test('REV-02 (adattata) maiuscole: limite che resta; tripla codifica: ora CHIUSA', async (t) => {
  const valore = chiaveFinta();
  const tripla = codifica(valore).replaceAll('%', '%2525');
  assert.equal((await naviga(t, `https://x.example/?k=${valore.toUpperCase()}`, { segretiConosciutiFn: () => [valore] })).letta, true, 'maiuscole: limite dichiarato');
  assert.equal((await naviga(t, `https://x.example/?k=${tripla}`, { segretiConosciutiFn: () => [valore] })).letta, false, 'tripla codifica: bloccata');
});

test('REV-03 forme bloccate: userinfo, frammento, percorso, mista, %2573 mista, a capo e tab, nome del sito in caratteri larghi', async (t) => {
  const valore = chiaveFinta();
  const meta = valore.length >> 1;
  const larga = [...valore].map((ch) => String.fromCharCode(ch.charCodeAt(0) + 0xfee0)).join('');
  const urls = [
    `https://u:${valore}@x.example/`, `https://x.example/#${valore}`, `https://x.example/a/${valore}/b`,
    `https://x.example/?k=${valore.slice(0, meta)}${codifica(valore.slice(meta))}`,
    `https://x.example/?k=${codifica(valore).replace('%', '%25')}`,
    `https://x.example/?k=${valore.slice(0, 5)}\t${valore.slice(5, 9)}\r\n${valore.slice(9)}`,
    `https://${larga}.x.example/`,
    `HTTPS://X.EXAMPLE/?k=${valore}`,
  ];
  const lette = [];
  for (const [i, url] of urls.entries()) if ((await naviga(t, url, { segretiConosciutiFn: () => [valore] })).letta) lette.push(i);
  assert.deepEqual(lette, []);
});

test('REV-04 partenza anticipata: due naviga nella stessa risposta, una con la chiave e una pulita ⇒ solo la pulita alla cache, nessun rifiuto non gestito', async (t) => {
  const valore = chiaveFinta();
  const nonGestiti = [];
  const prendi = (e) => nonGestiti.push(String(e?.message ?? e));
  process.on('unhandledRejection', prendi);
  t.after(() => process.off('unhandledRejection', prendi));
  const r = await giro(t, chiamate(['naviga', { url: `https://x.example/?k=${valore}` }, 'a'], ['naviga', { url: 'https://x.example/pulita' }, 'b']), { segretiConosciutiFn: () => [valore] });
  await new Promise((ok) => setImmediate(ok));
  assert.deepEqual(r.lette, ['https://x.example/pulita']);
  assert.equal(r.esiti.length, 2);
  assert.match(r.esiti[0], /contains one of your keys/u);
  assert.match(r.esiti[1], /^HTTP 200/u);
  assert.equal(r.carte, 0);
  assert.deepEqual(nonGestiti, []);
});

test('REV-05 la funzione dell ospite: UNA chiamata per naviga (nessuna in più), mai il valore negli esiti', async (t) => {
  const valore = chiaveFinta();
  let n = 0;
  const fn = () => { n += 1; return [valore]; };
  await naviga(t, 'https://x.example/doc', { segretiConosciutiFn: fn });
  const perPulita = n;
  n = 0;
  const r = await naviga(t, `https://x.example/?k=${valore}`, { segretiConosciutiFn: fn });
  assert.deepEqual({ perPulita, perSporca: n }, { perPulita: 1, perSporca: 1 });
  assert.equal(r.esiti.some((e) => e.includes(valore) || e.includes(valore.slice(0, 16)) || e.includes(valore.slice(-16))), false, 'niente valore né pezzi negli esiti');
});

const LUNGHI = [
  'https://accounts.example.com/login?csrf_token=8f3a9c2e7b1d4f6a0c5e9b3d7f1a2c4e&next=%2Fdashboard',
  'https://shop.example.it/cart?sessionid=s%3A7d9f2b4c6e8a0b1d3f5e7c9a2b4d6f8e.Xy7zAbCdEfGhIjKlMnOpQrStUvWxYz0123456789',
  'https://cdn.example.net/assets/app.3f9a2c7e1b5d8f0a4c6e9b2d7f1a3c5e.js',
  'https://github.com/nodejs/node/commit/4b2f9c8e7d6a5b4c3d2e1f0a9b8c7d6e5f4a3b2c',
  'https://example.org/verify?email_hash=5d41402abc4b2a76b9719d911017c592&ts=1763540000',
  'https://docs.example.com/page?_ga=2.123456789.987654321.1763540000-1234567890.1763540000',
  'https://example.com/oauth/callback?state=Zm9vYmFyYmF6cXV4cXV1eHF1dXo&code=4%2F0AfJohXn1234567890abcdefghij',
  'https://www.example.com/watch?v=dQw4w9WgXcQ&list=PLabcdefghijklmnopqrstuvwxyz012345&index=7',
  'https://example.com/download/sha256-e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855.tar.gz',
  'https://news.example.com/article?utm_source=newsletter&utm_campaign=2026-11-19-weekly-digest-long-campaign-name',
];

test('REV-06 rumore: 10 indirizzi con parametri lunghi innocui e 30 chiavi note ⇒ rifiuti 0, carte 0, esiti uguali a senza funzione', async (t) => {
  const note = Array.from({ length: 30 }, chiaveFinta);
  const rifiuti = [];
  for (const url of LUNGHI) {
    const senza = await naviga(t, url);
    const con = await naviga(t, url, { segretiConosciutiFn: () => note });
    if (!con.letta || con.esito !== senza.esito || con.carte !== senza.carte) rifiuti.push(url);
  }
  assert.deepEqual(rifiuti, []);
});

/* l'ambiente FINTO della prova: nomi che la macchina non ha, messi e tolti qui (mai letti né stampati quelli veri) */
function ambienteFinto(t, coppie) {
  for (const [nome, valore] of Object.entries(coppie)) {
    assert.equal(nome in process.env, false, 'la prova usa solo nomi che la macchina non ha');
    process.env[nome] = valore;
  }
  t.after(() => { for (const nome of Object.keys(coppie)) delete process.env[nome]; });
}

test('REV-07 rumore dall ambiente (fonte del nucleo, anche CLI): variabili col nome da credenziale che NON sono segreti (AUTH dentro AUTHOR/AUTHORITY_HOST) non bloccano pagine normali', async (t) => {
  ambienteFinto(t, { TALOS_PROVA_AZURE_AUTHORITY_HOST: 'https://login.microsoftonline.com/', TALOS_PROVA_GIT_AUTHOR_EMAIL: 'mario.rossi@example.com' });
  const a = await naviga(t, 'https://login.microsoftonline.com/common/v2.0/.well-known/openid-configuration');
  const b = await naviga(t, 'https://github.com/search?q=author-email%3Amario.rossi%40example.com&type=commits');
  assert.deepEqual({ azure: a.letta, git: b.letta }, { azure: true, git: true }, 'rifiuti falsi dalla fonte ambiente');
});

test('REV-08 tempo dell aiuto: 30 chiavi, indirizzo lungo, 20.000 chiamate', () => {
  const note = new Set(Array.from({ length: 30 }, chiaveFinta));
  const url = LUNGHI[1];
  const forme = [url, new URL(url).href];
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < 20_000; i += 1) indirizzoConUnaChiave(forme, note);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6 / 20_000;
  assert.ok(ms < 1, `per chiamata ${ms.toFixed(4)} ms`);
  console.log(`REV-08 per chiamata: ${ms.toFixed(4)} ms`);
});

/* ---------------------------------------------------------------- Cura 1: il decodificatore che non lancia */

const ROTTI = ['%', '%ZZ', '%E0%A4', '%C3', '%F0%9F%98', '%G1%'];

test('CWC-01 «%», %ZZ e UTF-8 rotto in ogni posizione, chiave codificata una, due e tre volte: mai letta', async (t) => {
  const valore = chiaveFinta();
  const lette = [];
  for (const [volte, enc] of [[1, codifica(valore)], [2, codifica(valore).replaceAll('%', '%25')], [3, codifica(valore).replaceAll('%', '%2525')]]) {
    for (const s of ROTTI) {
      const posti = {
        prima: `https://x.example/?a=${s}&k=${enc}`,
        dopo: `https://x.example/?k=${enc}&a=${s}`,
        accanto: `https://x.example/?k=${s}${enc}${s}`,
        altroParametro: `https://x.example/?a=1&b=${s}&c=2&k=${enc}`,
        nelPercorso: `https://x.example/a${s}b/c?k=${enc}`,
        chiaveNelPercorso: `https://x.example/${s}/${enc}/doc`,
        nelFrammento: `https://x.example/?k=${enc}#${s}`,
        chiaveNelFrammento: `https://x.example/doc#${s}${enc}`,
        utente: `https://u${s}:${enc}@x.example/`,
      };
      for (const [posto, url] of Object.entries(posti)) {
        const r = await naviga(t, url, { segretiConosciutiFn: () => [valore] });
        if (r.letta) lette.push(`${volte}:${posto}:${ROTTI.indexOf(s)}`);
        else assert.match(r.esito, /contains one of your keys/u);
        assert.equal(r.esito.includes(valore), false);
      }
    }
  }
  assert.deepEqual(lette, []);
});

test('CWC-02 il decodificatore non lancia mai e lascia com è solo ciò che è rotto', () => {
  const decodifica = nucleo.decodificaPercentoSenzaLanciare;
  assert.equal(typeof decodifica, 'function', 'esportato');
  /* intorno lettere che non sono cifre esadecimali: `%2` + `b` farebbe un `%2b` valido */
  for (const rotto of ['%', '%ZZ', '%E0%A4', '%C3', '%F0%9F%98', '%G1%', '100%', '%%%', '%2', '%E2%82', '%ED%A0%80', '%C0%AF', '%F5%80%80%80', '%80']) {
    assert.doesNotThrow(() => decodifica(`x${rotto}z`));
    assert.equal(decodifica(`x${rotto}z`), `x${rotto}z`, `il rotto resta (${[...rotto].length} caratteri)`);
  }
  /* le sequenze valide come `decodeURIComponent`, anche a 4 byte */
  for (const valido of ['%F0%9F%98%80', '%E2%82%AC', '%C3%A8', '%7F%00', '%EF%BF%BF', '%F4%8F%BF%BF']) assert.equal(decodifica(valido), decodeURIComponent(valido));
  assert.equal(decodifica('%71%33%ZZ%E2%82%AC%C3%71'), 'q3%ZZ€%C3q', 'ogni %XX valido da solo, l UTF-8 valido insieme');
  assert.equal(decodifica('%2571'), '%71', 'una passata alla volta');
  assert.equal(decodifica('A%2fB%2F'), 'A/B/');
  for (const pulito of ['https://x.example/a?b=c', 'ünïcode', '']) assert.equal(decodifica(pulito), pulito);
  assert.equal(decodifica(null), '');
});

test('CWC-03 lo stesso aiuto vale per le foto e per browser_page: la chiave con un «%» solitario accanto è bloccata', async (t) => {
  const valore = chiaveFinta();
  /* foto: un indirizzo dell elenco della pagina */
  const foto = `https://cattivo.example/p.png?a=%&q=${codifica(valore)}`;
  const c = mkdtempSync(join(tmpdir(), 'talos-cwc-f-'));
  t.after(() => rimuoviCartellaDiProva(c));
  const scaricati = [];
  const r = rete(chiamate(['naviga', { url: 'https://annunci.example/casa/1' }, 'n1']), chiamate(['view_image', { url: foto }, 'v1']), CONCLUSO);
  await talosLavora({
    cartella: c, task: { consegna: 'guarda la foto' }, modello: 'm', chiave: 'k', fetchDiRete: r.fetch, giriMassimi: 6, livelloAccesso: 'accesso-pieno',
    strumentiEstesi: ['view_image'], vedeImmaginiFn: async () => true, segretiConosciutiFn: () => [valore],
    cacheWeb: { around: async (d) => ({ value: { stato: 200, url: d.url, corpo: `<html><body><img src="${foto.replaceAll('&', '&amp;')}" alt="foto"></body></html>` }, fromCache: false }) },
    scaricaImmagineWebFn: async ({ url }) => { scaricati.push(url); return { url, byte: png }; },
    onGuardaImmagine: async () => ({ ok: true, esito: 'ok', immagine: { riferimento: 'e'.repeat(64), mime: 'image/png', larghezza: 800, altezza: 600 } }),
    chiediApprovazioneFn: async () => false,
  });
  const esitoFoto = r.fatte[2]?.corpo.messages.filter((m) => m.role === 'tool').at(-1)?.content ?? '';
  assert.equal(scaricati.length, 0, 'foto non scaricata');
  assert.match(esitoFoto, /BLOCKED\. This image address contains one of your keys/u);
  /* browser_page: la pagina aperta dalla persona */
  const c2 = mkdtempSync(join(tmpdir(), 'talos-cwc-bp-'));
  t.after(() => rimuoviCartellaDiProva(c2));
  const aperta = `https://dash.example/stats?x=%E0%A4&q=${codifica(valore).replaceAll('%', '%25')}`;
  const viste = [];
  const r2 = rete(chiamate(['browser_page', {}, 'b1']), CONCLUSO);
  await talosLavora({
    cartella: c2, task: { consegna: 'di cosa parla?' }, modello: 'm', chiave: 'k', fetchDiRete: r2.fetch, giriMassimi: 4,
    strumentiEstesi: ['browser_page'], paginaBrowser: { url: aperta, titolo: 'Stats', via: 'cornice' },
    leggiPaginaBrowserFn: async (q) => { viste.push(q); return { ok: true, url: aperta, titolo: 'Stats', testo: 'Visible text.' }; },
    segretiConosciutiFn: () => [valore], chiediApprovazioneFn: async () => true,
  });
  const esitoBp = r2.fatte[1]?.corpo.messages.filter((m) => m.role === 'tool').at(-1)?.content ?? '';
  assert.equal(viste.length, 0, 'ospite non chiamato');
  assert.match(esitoBp, /contains one of your keys/u);
});

test('CWC-04 limiti che restano (dichiarati): maiuscole, chiave spezzata, quattro codifiche nel percorso; e al contrario il rotto da solo non blocca', async (t) => {
  const valore = chiaveFinta();
  const fn = () => [valore];
  const meta = valore.length >> 1;
  assert.equal((await naviga(t, `https://x.example/?k=${valore.toUpperCase()}`, { segretiConosciutiFn: fn })).letta, true, 'maiuscole');
  assert.equal((await naviga(t, `https://x.example/?a=${valore.slice(0, meta)}&b=${valore.slice(meta)}`, { segretiConosciutiFn: fn })).letta, true, 'spezzata');
  assert.equal((await naviga(t, `https://x.example/${codifica(valore).replaceAll('%', '%252525')}/doc`, { segretiConosciutiFn: fn })).letta, true, 'quattro codifiche nel percorso: oltre le 3 passate');
  for (const s of ROTTI) {
    const r = await naviga(t, `https://x.example/?a=${s}&b=${chiaveFinta()}`, { segretiConosciutiFn: fn });
    assert.equal(r.letta, true, `rotto ${ROTTI.indexOf(s)} senza chiave: letta`);
  }
});

test('CWC-09 un parametro si legge anche come lo legge il server: quattro codifiche in un parametro della query sono bloccate', async (t) => {
  const valore = chiaveFinta();
  const quattro = codifica(valore).replaceAll('%', '%252525');
  assert.equal((await naviga(t, `https://x.example/?a=1&k=${quattro}`, { segretiConosciutiFn: () => [valore] })).letta, false, 'nel parametro');
  assert.equal(indirizzoConUnaChiave([`https://x.example/?k=${quattro}&b=%`], new Set([valore])), true, 'anche con un «%» solitario dopo');
});

test('CWC-05 tempo ostile in un Worker col tetto: 8.000 caratteri pieni di %25, 30 chiavi; mai quadratico', async () => {
  const w = new Worker(new URL('./aiuto/indirizzo-ostile-worker.mjs', import.meta.url), {
    workerData: { modulo: new URL('../src/kernel/talosHarness.mjs', import.meta.url).href },
    resourceLimits: { maxOldGenerationSizeMb: 512 },
  });
  const esito = await new Promise((ok, ko) => {
    const tetto = setTimeout(() => { w.terminate(); ko(new Error('tetto di 60 s superato')); }, 60_000);
    w.once('message', (m) => { clearTimeout(tetto); ok(m); });
    w.once('error', (e) => { clearTimeout(tetto); ko(e); });
  });
  await w.terminate();
  console.log(`CWC-05 per indirizzo: 8.000 caratteri ${esito.ms8.toFixed(3)} ms, 16.000 ${esito.ms16.toFixed(3)} ms, rapporto ${(esito.ms16 / esito.ms8).toFixed(2)}`);
  assert.equal(esito.trovataInFondo, true, 'la chiave tripla in fondo si trova');
  assert.ok(esito.ms8 < 50, `8.000 caratteri sotto 50 ms (${esito.ms8.toFixed(3)})`);
  assert.ok(esito.ms16 / esito.ms8 < 3, `il doppio della lunghezza non quadruplica (${(esito.ms16 / esito.ms8).toFixed(2)})`);
});

/* ---------------------------------------------------------------- Cura 2: dall'ambiente solo ciò che sembra una chiave */

test('CWC-06 la fonte ambiente (ambiente FINTO passato alla funzione): via indirizzi, posta, host e i nomi _HOST/_URL/_URI/_EMAIL/_NAME/_DOMAIN/AUTHOR; le chiavi restano', () => {
  const prendi = nucleo.valoriDiChiaveDellAmbiente;
  assert.equal(typeof prendi, 'function', 'esportata');
  const chiavi = { OPENROUTER_API_KEY: chiaveFinta(), MIO_AUTH_TOKEN: chiaveFinta(), HTTP_AUTHORIZATION: `Bearer ${chiaveFinta()}`, CLIENT_SECRET: chiaveFinta(), GIT_AUTHOR_TOKEN: chiaveFinta() };
  const nonChiavi = {
    AZURE_AUTHORITY_HOST: 'https://login.microsoftonline.com/', GIT_AUTHOR_EMAIL: 'mario.rossi@example.com', GIT_AUTHOR_NAME: 'Mario Rossi Example Name',
    GIT_AUTHOR_DATE: '@1763540000 +0100 example', AUTH_DOMAIN: 'tenant-name.auth0.example.com', OAUTH_TOKEN_URL: 'https://oauth.example.com/token',
    OIDC_AUTH_URI: 'urn:ietf:wg:oauth:2.0:oob:example', TOKEN_SERVER_HOST: 'tokens.internal.example.com', MY_TOKEN_VALUE_IS_A_URL: 'https://example.com/some/long/path',
    SECRET_CONTACT: 'security-team@example.com', AUTH_SERVER: 'auth.eu-west-1.example.com:8443', AUTH_REDIRECT: 'https://app.example.com/callback/after-login',
    COLORE: chiaveFinta(),
  };
  const valori = new Set(prendi({ ...chiavi, ...nonChiavi }));
  for (const [nome, v] of Object.entries(chiavi)) assert.equal(valori.has(v), true, `${nome} resta`);
  for (const [nome, v] of Object.entries(nonChiavi)) assert.equal(valori.has(v), false, `${nome} fuori`);
  assert.equal(valori.size, Object.keys(chiavi).length, 'nient altro');
  /* ⛔ senza ambiente: vuoto, MAI quello della macchina (solo il conteggio, mai i valori, in un messaggio) */
  assert.equal(prendi({}).length, 0);
  assert.equal(prendi(undefined).length, 0, 'nessun ambiente di serie');
  assert.equal(prendi(null).length, 0);
});

test('CWC-07 al contrario, dal giro intero: una chiave dell ambiente col nome AUTH_TOKEN resta bloccata accanto alle variabili innocue', async (t) => {
  const valore = chiaveFinta();
  ambienteFinto(t, { TALOS_PROVA_CWC_AUTH_TOKEN: valore, TALOS_PROVA_CWC_AUTHOR_EMAIL: 'mario.rossi@example.com', TALOS_PROVA_CWC_AUTHORITY_HOST: 'https://login.microsoftonline.com/' });
  assert.equal((await naviga(t, `https://x.example/?q=${valore}`)).letta, false, 'la chiave dell ambiente resta bloccata');
  assert.equal((await naviga(t, `https://x.example/?q=%&q2=${codifica(valore)}`)).letta, false, 'anche codificata con un «%» solitario');
  assert.equal((await naviga(t, 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize')).letta, true);
});

/* Rumore (regola 17, decisione 375): le 20 letture dell'autore + i due casi del revisore, con l'ambiente finto dei due casi acceso. */
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
  'https://login.microsoftonline.com/common/v2.0/.well-known/openid-configuration',
  'https://github.com/search?q=author-email%3Amario.rossi%40example.com&type=commits',
];

test('CWC-08 rumore: 22 letture (20 dell autore + 2 del revisore) con 30 chiavi note e l ambiente finto: rifiuti 0, carte 0 e uguali, esiti uguali', async (t) => {
  ambienteFinto(t, { TALOS_PROVA_N_AZURE_AUTHORITY_HOST: 'https://login.microsoftonline.com/', TALOS_PROVA_N_GIT_AUTHOR_EMAIL: 'mario.rossi@example.com' });
  const note = Array.from({ length: 30 }, chiaveFinta);
  let carteSenza = 0; let carteCon = 0; const rifiuti = []; let diversi = 0;
  for (const url of TIPICHE) {
    const senza = await naviga(t, url, { livelloAccesso: 'su-richiesta' });
    const con = await naviga(t, url, { livelloAccesso: 'su-richiesta', segretiConosciutiFn: () => note });
    carteSenza += senza.carte; carteCon += con.carte;
    if (!con.letta || !senza.letta) rifiuti.push(TIPICHE.indexOf(url));
    if (con.esito !== senza.esito) diversi += 1;
  }
  console.log(`CWC-08 letture ${TIPICHE.length}, rifiuti ${rifiuti.length}, carte senza ${carteSenza} con ${carteCon}, esiti diversi ${diversi}`);
  assert.equal(TIPICHE.length, 22);
  assert.deepEqual(rifiuti, []);
  assert.equal(carteCon, carteSenza);
  assert.equal(carteCon, 0);
  assert.equal(diversi, 0);
});
