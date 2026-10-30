// Owner 28/10/2026 (cache dei prompt, punto 1, contratto con la CLI): fino a QUATTRO punti di cache, come Hermes
// (`agent/prompt_caching.py`, copia del 22/10): il primo sistema, la fine della testa, gli ultimi messaggi che possono portarlo; mai su un
// contenuto vuoto; nessun punto su una richiesta usa-e-getta; la durata la decide chi detta il ritmo; Qwen a 5 minuti; idempotente.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  CARATTERI_MINIMI_PER_CACHE, MARCATORE_CACHE_CINQUE_MINUTI, MARCATORE_CACHE_UN_ORA, PUNTI_DI_CACHE_MASSIMI,
  conMarcatoreDiCache, eRichiestaUsaEGetta, marcatoreDiCachePer, talosLavora,
} from '../src/kernel/talosHarness.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const GRANDE = 'x'.repeat(CARATTERI_MINIMI_PER_CACHE);
const marcato = (m) => Array.isArray(m?.content) && m.content.some((p) => p?.cache_control);
const indiciMarcati = (lista) => lista.map((m, i) => (marcato(m) ? i : -1)).filter((i) => i >= 0);
const ATTREZZO = [{ type: 'function', function: { name: 'leggi', parameters: { type: 'object' } } }];

function giroConAttrezzi(n) {
  const lista = [{ role: 'system', content: GRANDE }, { role: 'system', content: 'Working sheet' }, { role: 'user', content: 'Leggi tutto.' }];
  for (let i = 0; i < n; i += 1) {
    lista.push({ role: 'assistant', content: null, tool_calls: [{ id: `c${i}`, type: 'function', function: { name: 'leggi', arguments: '{}' } }] });
    lista.push({ role: 'tool', tool_call_id: `c${i}`, content: `risultato ${i}` });
  }
  return lista;
}

test('CACHE4-01 — al massimo quattro punti: primo sistema, fine della testa, poi gli ultimi messaggi (anche i risultati degli attrezzi)', () => {
  const lista = giroConAttrezzi(6);
  const fuori = conMarcatoreDiCache(lista, MARCATORE_CACHE_UN_ORA, { attrezzi: ATTREZZO });
  const n = lista.length;
  assert.deepEqual(indiciMarcati(fuori), [0, 1, n - 3, n - 1], 'primo sistema, fine testa, gli ultimi due risultati (un assistente in mezzo, senza testo, non porta)');
  assert.equal(fuori.at(-1).role, 'tool', 'l\'ultimo risultato d\'attrezzo porta il punto: la cache arriva fino in fondo al giro');
  assert.ok(indiciMarcati(fuori).length <= PUNTI_DI_CACHE_MASSIMI);
  assert.equal(typeof lista[0].content, 'string', 'la lista di chi chiama non si muta');
});

test('CACHE4-02 — mai su un contenuto vuoto: un assistant con le sole chiamate non porta il punto, il posto va al messaggio prima', () => {
  const lista = [{ role: 'system', content: GRANDE }, { role: 'user', content: 'Leggi.' },
    { role: 'assistant', content: null, tool_calls: [{ id: 'c', type: 'function', function: { name: 'leggi', arguments: '{}' } }] },
    { role: 'tool', tool_call_id: 'c', content: '' }, { role: 'assistant', content: '' }];
  const fuori = conMarcatoreDiCache(lista, MARCATORE_CACHE_UN_ORA, { attrezzi: ATTREZZO });
  assert.deepEqual(indiciMarcati(fuori), [0, 1], 'solo il sistema e la domanda: i tre vuoti restano fuori');
});

test('CACHE4-03 — una richiesta usa-e-getta (senza attrezzi, una domanda, nessun turno dell\'assistente) non prende punti', () => {
  const riassunto = [{ role: 'system', content: GRANDE }, { role: 'user', content: 'Riassumi.' }];
  assert.equal(eRichiestaUsaEGetta(riassunto, []), true);
  assert.deepEqual(indiciMarcati(conMarcatoreDiCache(riassunto, MARCATORE_CACHE_UN_ORA, { attrezzi: [] })), []);
  assert.equal(eRichiestaUsaEGetta(riassunto, ATTREZZO), false, 'con gli attrezzi è un giro, e si rilegge');
  assert.deepEqual(indiciMarcati(conMarcatoreDiCache(riassunto, MARCATORE_CACHE_UN_ORA, { attrezzi: ATTREZZO })), [0, 1]);
});

test('CACHE4-04 — idempotente: una seconda passata non aggiunge punti e toglie quelli di una lista già marcata', () => {
  const una = conMarcatoreDiCache(giroConAttrezzi(6), MARCATORE_CACHE_UN_ORA, { attrezzi: ATTREZZO });
  const due = conMarcatoreDiCache(una, MARCATORE_CACHE_UN_ORA, { attrezzi: ATTREZZO });
  assert.deepEqual(due, una);
  const conUnoInPiu = [...una, { role: 'user', content: 'ancora' }];
  assert.equal(indiciMarcati(conMarcatoreDiCache(conUnoInPiu, MARCATORE_CACHE_UN_ORA, { attrezzi: ATTREZZO })).length, PUNTI_DI_CACHE_MASSIMI, 'i vecchi punti si tolgono: mai oltre quattro');
});

test('CACHE4-05 — la soglia vale per ogni punto: sotto i caratteri minimi del prefisso un punto non si mette', () => {
  const lista = [{ role: 'system', content: 'corto' }, { role: 'user', content: 'domanda corta' }, { role: 'assistant', content: 'risposta' }];
  assert.equal(conMarcatoreDiCache(lista, MARCATORE_CACHE_UN_ORA, { attrezzi: ATTREZZO }), lista, 'niente sopra la soglia: la stessa lista');
});

test('CACHE4-06 — la durata: un\'ora per la persona, cinque minuti per chi chiama a macchina e per Qwen', () => {
  assert.equal(marcatoreDiCachePer({ modello: 'z-ai/glm-5.3-flash' }), MARCATORE_CACHE_UN_ORA);
  assert.equal(marcatoreDiCachePer({ modello: 'z-ai/glm-5.3-flash', ritmoDellaMacchina: true }), MARCATORE_CACHE_CINQUE_MINUTI);
  assert.equal(marcatoreDiCachePer({ modello: 'openrouter:qwen/qwen3.7-plus' }), MARCATORE_CACHE_CINQUE_MINUTI, 'Qwen rifiuta la cache da un\'ora (Hermes `effective_cache_ttl`)');
  assert.equal(marcatoreDiCachePer({ modello: 'qwen:qwen3-coder' }), MARCATORE_CACHE_CINQUE_MINUTI);
  assert.deepEqual(MARCATORE_CACHE_CINQUE_MINUTI, { type: 'ephemeral' }, 'cinque minuti = il marcatore senza durata');
});

/** Un fornitore finto che registra ogni corpo e risponde con una sola chiamata d'attrezzo, poi testo. */
function fornitore() {
  const corpi = [];
  return {
    corpi,
    fetchDiRete: async (_url, opzioni) => {
      const corpo = JSON.parse(opzioni.body);
      corpi.push(corpo);
      const messaggio = corpi.length === 1
        ? { role: 'assistant', content: null, tool_calls: [{ id: 'k1', type: 'function', function: { name: 'elenca', arguments: '{"percorso":"."}' } }] }
        : { role: 'assistant', content: 'fatto' };
      return Response.json({ choices: [{ message: messaggio, finish_reason: corpi.length === 1 ? 'tool_calls' : 'stop' }], usage: { prompt_tokens: 9000, completion_tokens: 5 } });
    },
  };
}

for (const [nome, opzioni, atteso] of [
  ['la persona davanti', {}, MARCATORE_CACHE_UN_ORA],
  ['nessuno davanti (-p, automazione)', { nessunoDavanti: true }, MARCATORE_CACHE_CINQUE_MINUTI],
  ['un passo senza persona (Workflow, delega)', { senzaPersona: true }, MARCATORE_CACHE_CINQUE_MINUTI],
  ['una figlia', { agentRole: 'child' }, MARCATORE_CACHE_CINQUE_MINUTI],
]) {
  test(`CACHE4-07 — dal giro vero: ${nome} ⇒ ${atteso.ttl ? 'un\'ora' : 'cinque minuti'}, e il risultato dell'attrezzo porta il punto`, async (t) => {
    const cartella = mkdtempSync(join(tmpdir(), 'talos-cache4-'));
    t.after(() => rimuoviCartellaDiProva(cartella));
    const rete = fornitore();
    await talosLavora({ cartella, task: { consegna: 'elenca la cartella' }, modello: 'anthropic/claude-haiku-5', chiave: 'k', ...opzioni, // RIV14-2: i punti sui messaggi solo dove onorati
      messaggiIniziali: [{ role: 'system', content: GRANDE }, { role: 'user', content: 'elenca la cartella' }], fetchDiRete: rete.fetchDiRete });
    assert.ok(rete.corpi.length >= 2, 'premessa: due richieste (l\'attrezzo, poi la risposta)');
    const secondo = rete.corpi[1].messages;
    const marcatori = secondo.flatMap((m) => (Array.isArray(m.content) ? m.content : [])).map((p) => p?.cache_control).filter(Boolean);
    assert.ok(marcatori.length >= 2 && marcatori.length <= PUNTI_DI_CACHE_MASSIMI, `punti: ${marcatori.length}`);
    for (const c of marcatori) assert.deepEqual(c, atteso);
    assert.ok(marcato(secondo.at(-1)) && secondo.at(-1).role === 'tool', 'l\'ultimo risultato d\'attrezzo porta il punto');
  });
}

test('CACHE4-08 — l\'aiutante delle prove toglie i marcatori come il nucleo (le due copie della stessa logica restano uguali)', async () => {
  const { senzaMarcatoriDiCache } = await import('../src/kernel/talosHarness.mjs');
  const { senzaMarcatori } = await import('./aiuto/corpo-senza-marcatori.mjs');
  const marcati = conMarcatoreDiCache(giroConAttrezzi(6), MARCATORE_CACHE_UN_ORA, { attrezzi: ATTREZZO });
  const casi = [...marcati, { role: 'user', content: [{ type: 'text', text: 'a' }, { type: 'image_url', image_url: { url: 'data:x' }, cache_control: { type: 'ephemeral' } }] },
    { role: 'system', content: 'x', cache_control: { type: 'ephemeral' } }, { role: 'assistant', content: null }];
  for (const m of casi) assert.deepEqual(senzaMarcatori(m), senzaMarcatoriDiCache(m));
});

test('CACHE4-09 — (CLI 28/10) gli attrezzi contano nel prefisso: con un sistema corto e attrezzi lunghi il primo sistema prende il punto subito; AL CONTRARIO attrezzi pochi e sistema corto, nessun punto', () => {
  const sistemaCorto = [{ role: 'system', content: 's'.repeat(2_800) }, { role: 'user', content: 'ciao' }];
  const molti = Array.from({ length: 24 }, (_, i) => ({ type: 'function', function: { name: `attrezzo_${i}`, description: 'd'.repeat(1_100), parameters: { type: 'object' } } }));
  assert.ok(JSON.stringify(molti).length + 2_800 >= CARATTERI_MINIMI_PER_CACHE, 'premessa: attrezzi e sistema oltre la soglia');
  assert.deepEqual(indiciMarcati(conMarcatoreDiCache(sistemaCorto, MARCATORE_CACHE_UN_ORA, { attrezzi: molti })), [0, 1], 'il primo sistema e la domanda');
  assert.deepEqual(indiciMarcati(conMarcatoreDiCache(sistemaCorto, MARCATORE_CACHE_UN_ORA, { attrezzi: [ATTREZZO[0]] })), [], 'pochi attrezzi: sotto la soglia, nessun punto');
});
