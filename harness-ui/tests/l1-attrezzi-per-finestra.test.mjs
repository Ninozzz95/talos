/*
 * L1 motore locale (owner 20/10/2026, «profilo 11 essenziali + ponte anche sul PC quando gli attrezzi non entrano») — col modello
 * `local:` del PC il registro passa la finestra al kernel (`finestraPerGliAttrezzi`): se gli attrezzi davanti pesano più del 15% della
 * finestra, davanti restano gli undici essenziali e il resto va dietro il ponte; l'elenco del ponte si riduce come in Hermes
 * (`tools/tool_search.py:208-212`, `listing_token_budget`: min(4000, 5% della finestra); `tool_search_catalog.py:261-268`: pieno →
 * soli nomi → niente). Il verso contrario: senza finestra (cloud, CLI, banco) la richiesta resta byte per byte quella di prima, e la
 * riga della lingua resta solo del telefono (owner 20/10, «Solo per il modello del telefono»).
 */
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { ATTREZZI_ESSENZIALI_LOCALI, NOME_RICERCA_ATTREZZI, elencoDelPonteEntro, pesoInToken } from '../src/kernel/ponte-attrezzi.mjs';
import { talosLavora } from '../src/kernel/talosHarness.mjs';
import { STRUMENTI_ESTESI_PREDEFINITI } from '../src/session-registry.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const rispostaDi = (message) => ({ ok: true, status: 200, json: async () => ({ choices: [{ message }] }), text: async () => '' });

async function primaRichiesta(t, extra = {}) {
  const cartella = mkdtempSync(join(tmpdir(), 'attrezzi-finestra-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  writeFileSync(join(cartella, 'a.txt'), 'x');
  const richieste = [];
  await talosLavora({
    cartella, task: { consegna: 'ciao' }, modello: 'x', chiave: 'y', attrezziDifferiti: true,
    // gli attrezzi estesi del desktop (quelli del registro): senza, nessuno sarebbe differibile e il caso non esisterebbe
    strumentiEstesi: STRUMENTI_ESTESI_PREDEFINITI,
    fetchDiRete: async (_u, o) => { richieste.push(JSON.parse(o.body)); return rispostaDi({ role: 'assistant', content: 'ok' }); },
    ...extra,
  });
  return richieste[0];
}
const nomi = (richiesta) => (richiesta.tools ?? []).map((a) => a.function.name);

test('APF-01 l\'elenco del ponte si riduce come in Hermes: pieno se entra, poi soli nomi, poi niente', () => {
  const differiti = new Map([
    ['alfa', { type: 'function', function: { name: 'alfa', description: 'Prima frase lunga di alfa. Seconda.' } }],
    ['beta', { type: 'function', function: { name: 'beta', description: 'Prima frase di beta.' } }],
  ]);
  const pieno = elencoDelPonteEntro(differiti, null);
  assert.equal(pieno.forma, 'pieno');
  assert.match(pieno.testo, /- alfa: Prima frase lunga di alfa\./u);
  assert.equal(elencoDelPonteEntro(differiti, 1_000).forma, 'pieno');
  const soloNomi = elencoDelPonteEntro(differiti, pesoInToken('alfa, beta'));
  assert.equal(soloNomi.forma, 'nomi');
  assert.equal(soloNomi.testo, 'alfa, beta');
  assert.deepEqual(elencoDelPonteEntro(differiti, 1), { forma: 'nessuno', testo: null });
  assert.equal(pesoInToken('x'.repeat(8)), 2, 'Hermes CHARS_PER_TOKEN = 4, arrotondato in su');
});

test('APF-02 finestra piccola (16K): davanti SOLO gli essenziali e il ponte; l\'elenco del ponte sta nel 5% della finestra', async (t) => {
  const r = await primaRichiesta(t, { finestraPerGliAttrezzi: 16_384 });
  const davanti = nomi(r).filter((n) => !n.startsWith('tool_'));
  assert.ok(davanti.length > 0);
  for (const n of davanti) assert.ok(ATTREZZI_ESSENZIALI_LOCALI.includes(n) || ['ask_parent', 'answer_parent_question', 'present_plan'].includes(n), n);
  assert.ok(nomi(r).includes(NOME_RICERCA_ATTREZZI), 'il resto si raggiunge dal ponte');
  const ricerca = r.tools.find((a) => a.function.name === NOME_RICERCA_ATTREZZI).function.description;
  assert.ok(pesoInToken(ricerca) <= Math.min(4_000, 16_384 * 0.05) + 400, `la descrizione del ponte pesa ${pesoInToken(ricerca)} token`);
  assert.ok(!r.messages.some((m) => m.role === 'system' && /same language as the user|SAME language/iu.test(String(m.content))), 'la riga della lingua resta del telefono');
});

test('APF-03 al contrario: finestra grande (1M) o nessuna finestra ⇒ la divisione di sempre, byte per byte', async (t) => {
  const senza = await primaRichiesta(t);
  const grande = await primaRichiesta(t, { finestraPerGliAttrezzi: 1_000_000 });
  assert.deepEqual(grande.tools, senza.tools, 'con spazio a sufficienza nulla cambia');
  const piccola = await primaRichiesta(t, { finestraPerGliAttrezzi: 16_384 });
  assert.notDeepEqual(piccola.tools, senza.tools, 'il caso piccolo cambia davvero qualcosa');
  assert.ok(nomi(senza).some((n) => !ATTREZZI_ESSENZIALI_LOCALI.includes(n) && !n.startsWith('tool_')), 'senza finestra davanti c\'è più degli essenziali');
});

/* Il FILO (lezione del 17/10: un'opzione nuova del kernel si prova dal registro al kernel). */
async function inputDelRegistro(t, modello) {
  const { createSessionRegistry } = await import('../src/session-registry.mjs');
  const runs = [];
  const avviaSessioneFn = (input) => { runs.push(input); input.onEvento({ type: 'RunStarted', threadId: 't', runId: 'r' }); return new Promise(() => {}); };
  const registro = createSessionRegistry({ avviaSessioneFn, modello, chiave: 'k', cartellaEsisteFn: () => true, attrezziDifferiti: true,
    finestraTokenFn: (m) => (String(m).startsWith('local:') ? 32_768 : 200_000),
    preparaEsecuzioneFn: () => ({ cartella: '/tmp/x', comandoProva: 'npm test', task: { id: 'task', consegna: 'lavora' } }) });
  t.after(() => registro.chiudi?.());
  registro.avvia('task');
  return runs[0];
}

test('APF-04 il registro passa la finestra SOLO per il motore locale del PC; per il cloud niente', async (t) => {
  assert.equal((await inputDelRegistro(t, 'local:LFM2.5-24B')).finestraPerGliAttrezzi, 32_768);
  assert.equal((await inputDelRegistro(t, 'openrouter/qualcosa')).finestraPerGliAttrezzi, null);
});

test('APF-05 agent-service la inoltra al kernel col ponte acceso; senza ponte, o senza un intero valido, non la manda', async (t) => {
  const { avviaSessione } = await import('../src/agent-service.mjs');
  const cartella = mkdtempSync(join(tmpdir(), 'apf-filo-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  const visto = async (extra) => {
    let input;
    await avviaSessione({ cartella, task: { consegna: 'prova' }, modello: 'local:m', chiave: 'k', onEvento: () => {}, ...extra,
      talosLavoraFn: async (i) => { input = i; return { comeFinita: 'concluso', detto: 'fatto' }; } });
    return input;
  };
  assert.equal((await visto({ attrezziDifferiti: true, finestraPerGliAttrezzi: 32_768 })).finestraPerGliAttrezzi, 32_768);
  assert.ok(!('finestraPerGliAttrezzi' in await visto({ attrezziDifferiti: false, finestraPerGliAttrezzi: 32_768 })));
  assert.ok(!('finestraPerGliAttrezzi' in await visto({ attrezziDifferiti: true, finestraPerGliAttrezzi: null })));
});

test('APF-06 nel giro vero l\'elenco del ponte degrada con la finestra: pieno a 32K, soli nomi a 8K, niente a 2K', async (t) => {
  const descrizione = async (finestra) => (await primaRichiesta(t, { finestraPerGliAttrezzi: finestra }))
    .tools.find((a) => a.function.name === NOME_RICERCA_ATTREZZI).function.description;
  const pieno = await descrizione(32_768);
  assert.match(pieno, /Every one of them is listed below: /u);
  assert.match(pieno, /\n- [a-z_]+: /u, 'righe «- nome: frase»');
  const nomi = await descrizione(8_192);
  assert.match(nomi, /Every one of them is listed below by name: /u);
  assert.doesNotMatch(nomi, /\n- [a-z_]+: /u, 'nessuna riga con la frase');
  assert.match(nomi, /\n\n[a-z_]+(, [a-z_]+)+$/u, 'in fondo i soli nomi, separati da virgole');
  assert.ok(pesoInToken(nomi) < pesoInToken(pieno));
  const niente = await descrizione(2_048);
  assert.match(niente, /They are not listed here: search before deciding that a tool is missing, and do NOT claim/u);
  assert.match(niente, /do not need to be searched\.$/u, 'nessun elenco in fondo');
});

test('APF-07 (revisione D3) il modo si decide una volta per richiesta: se la lista cambia a metà (Windows → WSL2) gli attrezzi davanti restano', async (t) => {
  /* La scelta fra la shell di Windows e WSL2 esiste solo su Windows: altrove il kernel rifiuta l'ambiente «windows»
     (COMMAND_ENVIRONMENT_UNSUPPORTED, sul Pad: Mobile, K4-A del 20/10), quindi la prova si salta PRIMA di chiederlo. */
  if (process.platform !== 'win32') { t.skip('la scelta Windows/WSL2 esiste solo su Windows'); return; }
  const pesi = async (finestra, sequenza) => {
    const cartella = mkdtempSync(join(tmpdir(), 'apf-stabile-'));
    t.after(() => rimuoviCartellaDiProva(cartella));
    writeFileSync(join(cartella, 'a.txt'), 'x');
    const richieste = []; let n = 0; let k = 0;
    await talosLavora({
      cartella, task: { consegna: 'ciao' }, modello: 'local:x', chiave: 'y', attrezziDifferiti: true, strumentiEstesi: STRUMENTI_ESTESI_PREDEFINITI,
      finestraPerGliAttrezzi: finestra,
      ambienteComandiFn: () => ({ dove: sequenza[Math.min(k++, sequenza.length - 1)], revisione: k }),
      fetchDiRete: async (_u, o) => { richieste.push(JSON.parse(o.body)); n += 1;
        return rispostaDi(n < sequenza.length ? { role: 'assistant', content: '', tool_calls: [{ id: 'c1', type: 'function', function: { name: 'leggi', arguments: '{"percorso":"a.txt"}' } }] }
          : { role: 'assistant', content: 'ok' }); },
    });
    return richieste.map((r) => ({ n: r.tools.length, peso: pesoInToken(JSON.stringify(r.tools)) }));
  };
  // la finestra a metà fra le due soglie: con Windows gli attrezzi pesano più del 15%, con WSL2 meno
  const [conWindows] = await pesi(10_000_000, ['windows']);
  const [conWsl] = await pesi(10_000_000, ['wsl2']);
  if (conWindows.peso === conWsl.peso) { t.skip('serve la scelta dell ambiente dei comandi di Windows'); return; }
  const finestra = Math.floor((Math.ceil(conWindows.peso / 0.15) + Math.ceil(conWsl.peso / 0.15)) / 2);
  const giri = await pesi(finestra, ['windows', 'wsl2']);
  assert.equal(giri.length, 2);
  assert.equal(giri[0].n, giri[1].n, `gli attrezzi davanti non cambiano a metà richiesta: ${JSON.stringify(giri)}`);
  /* R2 (revisione del 20/10): nel verso opposto — la lista che CRESCE a metà richiesta, come dopo il sì a un Piano — il modo passa agli
     essenziali al giro dopo, e non torna indietro: a senso unico */
  const cresce = await pesi(finestra, ['wsl2', 'windows', 'wsl2']);
  assert.ok(cresce[0].n > cresce[1].n, `da leggera a pesante: dal secondo giro gli essenziali (${JSON.stringify(cresce)})`);
});
