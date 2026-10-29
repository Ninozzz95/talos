/*
 * Owner 27/10/2026 (server locali nella scheda Browser, terza scelta) — `local_page` dal lato del COMPUTER: il confine sta qui, non nella
 * parola del modello. Solo le porte pronte di QUESTA conversazione, host fisso, indirizzo finale ricontrollato dopo i rinvii, foto nello
 * store delle immagini della chat. E il filo intero: dal servizio col nucleo VERO fino all'ospite, perché un'opzione nuova si perde
 * negli inoltri campo per campo (lezione del 17/10, `attrezziDifferiti`).
 */
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';
import { talosLavora } from '../src/kernel/talosHarness.mjs';
import { STRUMENTI_ESTESI_PREDEFINITI } from '../src/session-registry.mjs';
import { creaApriPaginaLocale, restaSullaPorta, SCHEDA_DELLA_FINESTRA } from '../src/pagina-locale-ospite.mjs';

function registroFinto(pronte = { s1: [5173] }) {
  return {
    portaLocaleDellaSessione: (sid, porta) => (pronte[sid] ?? []).includes(porta),
    serverLocali: (sid) => (pronte[sid] ?? []).map((porta) => ({ porta, stato: 'pronto' })).concat([{ porta: 9999, stato: 'fermato' }]),
  };
}
function browserFinto({ url = null, testo = 'Ciao dalla pagina', errori = ['[console] vecchio', '[eccezione] nuovo'], foto = 'iVBORw0KGgo=' } = {}) {
  const chiamate = [];
  return {
    chiamate,
    quantiErrori: () => 1,
    apri: async (sid, indirizzo) => { chiamate.push(['apri', sid, indirizzo]); return { ok: true, stato: 200 }; },
    leggi: async (sid, { guarda, daErrore }) => {
      chiamate.push(['leggi', sid, guarda, daErrore]);
      const finale = url ?? chiamate.find((c) => c[0] === 'apri')[2];
      if (guarda === 'console') return { url: finale, console: errori.slice(daErrore) };
      if (guarda === 'screenshot') return { url: finale, immagine: { base64: foto, mime: 'image/png' } };
      return { url: finale, testo };
    },
  };
}

test('LP-OSPITE-01 restaSullaPorta: solo questo computer e la stessa porta', () => {
  for (const [u, p, atteso] of [
    ['http://127.0.0.1:5173/', 5173, true], ['http://localhost:5173/app', 5173, true], ['http://[::1]:5173/', 5173, true],
    ['http://127.0.0.1:5174/', 5173, false], ['http://evil.com:5173/', 5173, false], ['https://127.0.0.1/', 5173, false],
    ['http://127.0.0.1/', 80, true], ['file:///C:/x', 5173, false], ['non-un-indirizzo', 5173, false], [null, 5173, false],
  ]) assert.equal(restaSullaPorta(u, p), atteso, `${u} ${p}`);
});

test('LP-OSPITE-02 AL CONTRARIO: una porta che non è un server pronto della conversazione non apre niente, e il rifiuto elenca le pronte', async () => {
  const browser = browserFinto();
  const apri = creaApriPaginaLocale({ registroFn: () => registroFinto(), browserVivoFn: () => browser, chatImageStore: null });
  const r = await apri({ sessionId: 's1', porta: 4174, percorso: '/', guarda: 'text' });
  assert.equal(r.ok, false);
  assert.match(r.motivo, /Port 4174 is not a ready development server of this conversation\. Ready ones: 5173\./u);
  const altra = await apri({ sessionId: 's2', porta: 5173, percorso: '/', guarda: 'text' });
  assert.equal(altra.ok, false, 'la porta pronta di UN\'ALTRA conversazione non vale');
  assert.match(altra.motivo, /Ready ones: none\./u);
  assert.deepEqual(browser.chiamate, [], 'il browser non è stato toccato');
});

test('LP-OSPITE-03 host fisso 127.0.0.1, testo della pagina, e gli errori della console solo da questa apertura', async () => {
  const browser = browserFinto();
  const apri = creaApriPaginaLocale({ registroFn: () => registroFinto(), browserVivoFn: () => browser, chatImageStore: null });
  const r = await apri({ sessionId: 's1', porta: 5173, percorso: '/about?x=1', guarda: 'text' });
  assert.deepEqual(r, { ok: true, url: 'http://127.0.0.1:5173/about?x=1', testo: 'Ciao dalla pagina' });
  assert.deepEqual(browser.chiamate[0], ['apri', SCHEDA_DELLA_FINESTRA, 'http://127.0.0.1:5173/about?x=1'], 'la scheda che la persona vede (owner 29/10), non una per conversazione');
  const c = await apri({ sessionId: 's1', porta: 5173, percorso: '/', guarda: 'console' });
  assert.deepEqual(c.console, ['[eccezione] nuovo'], 'quelli di prima dell\'apertura restano fuori');
});

test('LP-OSPITE-04 AL CONTRARIO: se la pagina rinvia fuori dalla porta non si legge niente (né testo né foto)', async () => {
  const upload = [];
  for (const guarda of ['text', 'screenshot', 'console']) {
    const browser = browserFinto({ url: 'https://evil.com/rubato' });
    const apri = creaApriPaginaLocale({ registroFn: () => registroFinto(), browserVivoFn: () => browser, chatImageStore: { upload: async (x) => { upload.push(x); return { id: 'x' }; } } });
    const r = await apri({ sessionId: 's1', porta: 5173, percorso: '/', guarda });
    assert.equal(r.ok, false, guarda);
    assert.match(r.motivo, /moved to another address \(https:\/\/evil\.com\/rubato\), outside port 5173: nothing was read\./u);
    assert.equal('testo' in r || 'console' in r || 'immagine' in r, false);
  }
  assert.deepEqual(upload, [], 'nessuna foto salvata');
});

test('LP-OSPITE-05 la foto va nello store delle immagini della chat e torna come riferimento', async () => {
  const upload = [];
  const apri = creaApriPaginaLocale({ registroFn: () => registroFinto(), browserVivoFn: () => browserFinto(), chatImageStore: { upload: async (x) => { upload.push(x); return { id: 'f'.repeat(64) }; } } });
  const r = await apri({ sessionId: 's1', porta: 5173, percorso: '/', guarda: 'screenshot' });
  assert.equal(r.ok, true);
  assert.deepEqual(r.immagine, { riferimento: 'f'.repeat(64), mime: 'image/png', larghezza: null, altezza: null });
  assert.equal(upload.length, 1);
  assert.equal(upload[0].dataUrl, 'data:image/png;base64,iVBORw0KGgo=');
});

/* ── il filo intero: servizio → nucleo vero → ospite ── */
const enc = new TextEncoder();
const sse = (fotogrammi) => new Response(new ReadableStream({ start(c) {
  for (const f of fotogrammi) c.enqueue(enc.encode(`data: ${JSON.stringify(f)}\n\n`));
  c.enqueue(enc.encode('data: [DONE]\n\n'));
  c.close();
} }));
const chiamaPagina = () => sse([{ choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_1', function: { name: 'local_page', arguments: JSON.stringify({ port: 5173, path: '/about' }) } }] } }] }]);
const CONCLUSO = () => sse([{ choices: [{ delta: { content: 'vista' } }] }]);

async function giroDelServizio(t, opzioni) {
  const radice = mkdtempSync(join(tmpdir(), 'talos-lp-filo-'));
  t.after(() => rimuoviCartellaDiProva(radice));
  const { avviaSessione } = await import('../src/agent-service.mjs');
  const eventi = [];
  const corpi = [];
  let i = 0;
  const risposte = [chiamaPagina, CONCLUSO];
  const fetchDiRete = async (_url, init) => { corpi.push(JSON.parse(init.body)); return risposte[Math.min(i++, risposte.length - 1)](); };
  await avviaSessione({
    cartella: radice, task: { consegna: 'guarda la pagina del server di sviluppo' }, modello: 'm', chiave: 'k', onEvento: (e) => eventi.push(e),
    strumentiEstesi: STRUMENTI_ESTESI_PREDEFINITI, // come li passa il registro
    talosLavoraFn: (input) => talosLavora({ ...input, fetchDiRete }),
    ...opzioni,
  });
  return { eventi, corpi };
}
const nomi = (corpo) => (corpo.tools ?? []).map((a) => a.function?.name ?? a.name);

test('LP-FILO-01 dal servizio al nucleo vero: local_page si offre, l\'ospite riceve la richiesta e il testo arriva al modello', async (t) => {
  const visti = [];
  const { eventi, corpi } = await giroDelServizio(t, {
    apriPaginaLocaleFn: async (r) => { visti.push(r); return { ok: true, url: 'http://127.0.0.1:5173/about', testo: 'Pagina About di prova' }; },
  });
  assert.ok(STRUMENTI_ESTESI_PREDEFINITI.includes('local_page'), 'il registro lo nomina di serie');
  const offerto = corpi.some((c) => nomi(c).includes('local_page') || JSON.stringify(c.tools ?? []).includes('local_page'));
  assert.ok(offerto, 'offerto al modello (davanti o dietro il ponte)');
  assert.equal(visti.length, 1, JSON.stringify(eventi.map((e) => e.type)));
  assert.deepEqual({ porta: visti[0].porta, percorso: visti[0].percorso, guarda: visti[0].guarda }, { porta: 5173, percorso: '/about', guarda: 'text' });
  const risultato = eventi.find((e) => e.type === 'ToolCallResult' && e.toolCallId === 'call_1');
  assert.ok(risultato && String(risultato.content).includes('Pagina About di prova'), JSON.stringify(risultato));
});

test('LP-FILO-02 AL CONTRARIO: senza l\'ospite l\'attrezzo non si offre al modello', async (t) => {
  const { corpi } = await giroDelServizio(t, {});
  assert.equal(corpi.some((c) => JSON.stringify(c.tools ?? []).includes('"local_page"')), false);
});

test('LP-OSPITE-06 la chiave della scheda è la stessa dell\'interfaccia (IDENTITA_BROWSER di app.js)', async () => {
  const { readFileSync } = await import('node:fs');
  const app = readFileSync(new URL('../frontend/src/legacy/app.js', import.meta.url), 'utf8');
  assert.match(app, new RegExp("const IDENTITA_BROWSER = '" + SCHEDA_DELLA_FINESTRA + "';"));
});
