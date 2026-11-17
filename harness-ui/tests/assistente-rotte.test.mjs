/*
 * L'Assistente, giro di cura dopo i revisori A, B, C (giudice v1554, owner 21:40) — le rotte sul gestore HTTP vero, col registro finto.
 *   · `/a-lato/file` accetta SOLO `percorso` (revisore B: il mutante che accettava parametri sconosciuti restava vivo);
 *   · la domanda dalla finestra del PC può mostrare carte, quella del telefono (chiamata in processo del modulo remoto) no;
 *   · la carta di un indirizzo e lo Stop del pannello: corpo stretto, e mai dall'origine remota.
 */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';

import { createHttpApp } from '../src/http-app.mjs';
import { creaChiamataInterna } from '../src/remoto/chiamata-interna.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

function registroFinto() {
  const chiamate = [];
  return {
    chiamate,
    fileDellAssistente: (id, percorso) => { chiamate.push(['file', id, percorso]); return { ok: true, percorso, fuori: false }; },
    leggiALato: (id) => { chiamate.push(['leggi', id]); return { ok: true, scambi: [] }; },
    chiediALato: async (id, corpo, opzioni) => { chiamate.push(['chiedi', id, corpo.domanda, opzioni.conCarte, ...(opzioni.attesaMs === undefined ? [] : [opzioni.attesaMs])]); return { ok: true, risposta: 'r', tagliata: false, filoTagliato: false, usage: null, costo: null, scambio: null, spesa: null }; },
    rispondiCartaDellAssistente: (id, risposta) => { chiamate.push(['carta', id, risposta]); return { ok: true }; },
    fermaAssistente: (id) => { chiamate.push(['ferma', id]); return { ok: true, fermata: true }; },
  };
}

async function banco(t) {
  const sessionRegistry = registroFinto();
  const httpApp = createHttpApp({ senzaGettone: 'prove', staticHandler: async () => null, sessionRegistry });
  const server = createServer(httpApp);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => new Promise((r) => server.close(r)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const chiedi = async (percorso, { metodo = 'GET', corpo } = {}) => {
    const r = await fetch(base + percorso, { method: metodo, headers: { 'content-type': 'application/json', origin: base, 'sec-fetch-site': 'same-origin' }, body: corpo === undefined ? undefined : JSON.stringify(corpo) });
    return { stato: r.status, json: await r.json().catch(() => null) };
  };
  const remota = creaChiamataInterna({ httpApp, porta: server.address().port });
  return { chiedi, remota, registro: sessionRegistry };
}

test('ASS-ROT-01 /a-lato/file: un parametro che non è «percorso» è 400 e il registro non è toccato', async (t) => {
  const b = await banco(t);
  assert.equal((await b.chiedi('/api/v1/sessions/s-1/a-lato/file?percorso=src%2Fa.js&righe=1')).stato, 400);
  assert.equal((await b.chiedi('/api/v1/sessions/s-1/a-lato/file?x=1')).stato, 400);
  assert.deepEqual(b.registro.chiamate, []);
  assert.equal((await b.chiedi('/api/v1/sessions/s-1/a-lato/file?percorso=src%2Fa.js')).stato, 200);
  assert.deepEqual(b.registro.chiamate, [['file', 's-1', 'src/a.js']]);
});

test('ASS-ROT-02 la domanda dalla finestra del PC può mostrare carte; dal telefono no (rifiuto secco nel nucleo)', async (t) => {
  const b = await banco(t);
  assert.equal((await b.chiedi('/api/v1/sessions/s-1/a-lato', { metodo: 'POST', corpo: { domanda: 'dal pc' } })).stato, 200);
  await b.remota({ metodo: 'POST', percorso: '/api/v1/sessions/s-1/a-lato', corpo: { domanda: 'dal telefono' }, origine: 'telefono:x', origineRemota: { tipo: 'telefono', nome: 'Pad' } });
  assert.deepEqual(b.registro.chiamate.map((c) => c.slice(0, 4)), [['chiedi', 's-1', 'dal pc', true], ['chiedi', 's-1', 'dal telefono', false]]);
});

test('ASS-ROT-03 carta e Stop del pannello: corpo stretto, e mai dall\'origine remota', async (t) => {
  const b = await banco(t);
  assert.equal((await b.chiedi('/api/v1/sessions/s-1/a-lato/carta', { metodo: 'POST', corpo: { id: 'c1', approvato: true } })).stato, 200);
  assert.equal((await b.chiedi('/api/v1/sessions/s-1/a-lato/carta', { metodo: 'POST', corpo: { id: 'c1', approvato: true, sempre: true } })).stato, 400);
  assert.equal((await b.chiedi('/api/v1/sessions/s-1/a-lato/ferma', { metodo: 'POST', corpo: {} })).stato, 200);
  assert.equal((await b.chiedi('/api/v1/sessions/s-1/a-lato/ferma', { metodo: 'POST', corpo: { tutto: true } })).stato, 400);
  await assert.rejects(b.remota({ metodo: 'POST', percorso: '/api/v1/sessions/s-1/a-lato/carta', corpo: { id: 'c1', approvato: true }, origine: 'telefono:x', origineRemota: { tipo: 'telefono', nome: 'Pad' } }),
    (e) => e.code === 'REMOTE_ORIGIN_FORBIDDEN');
  assert.deepEqual(b.registro.chiamate, [['carta', 's-1', { id: 'c1', approvato: true }], ['ferma', 's-1']]);
});

test('ASS-ROT-04 /assistant-settings: di serie il modello della chat (null), si cambia con un id vero, il resto è 400; senza archivio 503', async (t) => {
  const { mkdtempSync, readFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { createImpostazioniAssistente } = await import('../src/impostazioni-assistente.mjs');
  const cartella = mkdtempSync(join(tmpdir(), 'ass-rot-04-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  const file = join(cartella, '.impostazioni-assistente.json');
  const impostazioniAssistente = createImpostazioniAssistente({ file, avvisa: () => {} });
  const avvia = async (opzioni) => {
    const server = createServer(createHttpApp({ senzaGettone: 'prove', staticHandler: async () => null, sessionRegistry: registroFinto(), ...opzioni }));
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    t.after(() => new Promise((r) => server.close(r)));
    const base = `http://127.0.0.1:${server.address().port}`;
    return async (metodo, corpo) => {
      const r = await fetch(`${base}/api/v1/assistant-settings`, { method: metodo, headers: { 'content-type': 'application/json', origin: base, 'sec-fetch-site': 'same-origin' }, body: corpo === undefined ? undefined : JSON.stringify(corpo) });
      return { stato: r.status, json: await r.json().catch(() => null) };
    };
  };
  const chiama = await avvia({ impostazioniAssistente });
  const prima = await chiama('GET');
  assert.equal(prima.stato, 200);
  assert.equal(prima.json.data.modello, null);
  assert.equal(impostazioniAssistente.modelloPerUnaDomanda(), null);
  const salvato = await chiama('POST', { modello: 'openrouter:deepseek/deepseek-v3.2' });
  assert.equal(salvato.stato, 200);
  assert.equal(salvato.json.data.modello, 'openrouter:deepseek/deepseek-v3.2');
  assert.equal(impostazioniAssistente.modelloPerUnaDomanda(), 'openrouter:deepseek/deepseek-v3.2');
  assert.match(readFileSync(file, 'utf8'), /"schema": "talos\.assistant-settings\.v1"/);
  for (const sbagliato of [{}, { modello: 'senza forma' }, { modello: null, altro: 1 }, { modello: 7 }, []]) {
    assert.equal((await chiama('POST', sbagliato)).stato, 400, JSON.stringify(sbagliato));
  }
  assert.equal(impostazioniAssistente.modelloPerUnaDomanda(), 'openrouter:deepseek/deepseek-v3.2');
  assert.equal((await chiama('POST', { modello: null })).json.data.modello, null);
  const senza = await avvia({});
  assert.equal((await senza('GET')).stato, 503);
  assert.equal((await senza('POST', { modello: null })).stato, 503);
});

/* ------------------------------------------- giro corto unico (giudice v1584 + v1596, 12/11/2026) ------------------------------------------- */

test('ASS-ROT-05 la carta: «approvato» passa SOLO se è booleano; "no", "true", 1 e null sono 400 e il registro non è toccato (mutante vivo di C)', async (t) => {
  const b = await banco(t);
  for (const approvato of ['no', 'true', 1, 0, null, {}, []]) {
    assert.equal((await b.chiedi('/api/v1/sessions/s-1/a-lato/carta', { metodo: 'POST', corpo: { id: 'c1', approvato } })).stato, 400, JSON.stringify(approvato));
  }
  assert.equal((await b.chiedi('/api/v1/sessions/s-1/a-lato/carta', { metodo: 'POST', corpo: { id: 7, approvato: true } })).stato, 400, 'id non testo');
  assert.deepEqual(b.registro.chiamate, []);
  assert.equal((await b.chiedi('/api/v1/sessions/s-1/a-lato/carta', { metodo: 'POST', corpo: { id: 'c1', approvato: false } })).stato, 200);
  assert.equal((await b.chiedi('/api/v1/sessions/s-1/a-lato/carta', { metodo: 'POST', corpo: { id: 'c1', approvato: true } })).stato, 200);
  assert.deepEqual(b.registro.chiamate, [['carta', 's-1', { id: 'c1', approvato: false }], ['carta', 's-1', { id: 'c1', approvato: true }]]);
});

test('ASS-ROT-06 il dispositivo si riconosce anche SENZA l\'origine remota: la chiamata in processo (socket «talos-remote») non mostra carte', async (t) => {
  const b = await banco(t);
  await b.remota({ metodo: 'POST', percorso: '/api/v1/sessions/s-1/a-lato', corpo: { domanda: 'senza origine' } });
  assert.deepEqual(b.registro.chiamate.map((c) => c.slice(0, 4)), [['chiedi', 's-1', 'senza origine', false]]);
});

test('ASS-ROT-07 120 s dal telefono: la domanda di un dispositivo finisce PRIMA che la chiamata in processo smetta di aspettare (120 s)', async (t) => {
  const b = await banco(t);
  assert.equal((await b.chiedi('/api/v1/sessions/s-1/a-lato', { metodo: 'POST', corpo: { domanda: 'dal pc' } })).stato, 200);
  await b.remota({ metodo: 'POST', percorso: '/api/v1/sessions/s-1/a-lato', corpo: { domanda: 'dal telefono' }, origine: 'telefono:x', origineRemota: { tipo: 'telefono', nome: 'Pad' } });
  const [pc, telefono] = b.registro.chiamate;
  assert.equal(pc[4], undefined, 'dal PC il tetto di sempre (120 s)');
  /* `remoto/chiamata-interna.mjs:64`: la chiamata in processo aspetta al più 120 s; il PC deve avere il tempo di salvare e rispondere */
  assert.equal(typeof telefono[4], 'number');
  assert.ok(telefono[4] <= 120_000 - 10_000, `margine per salvare: ${telefono[4]}`);
  assert.ok(telefono[4] >= 60_000, 'non una domanda mozzata');
});
