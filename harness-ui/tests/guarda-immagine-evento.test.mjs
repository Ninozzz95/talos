/*
 * Owner 27/10/2026 — «guarda immagine», contratto punto 8: la riga d'attività mostra la miniatura dell'immagine guardata, e il dispositivo
 * collegato riceve lo stesso evento. L'immagine viaggia TIPATA nel `ToolCallResult` (`images: [{ id, mimeType, width, height }]`), mai
 * i byte. Il campo attraversa tre inoltri «campo per campo» (nucleo `tool-esito` → `agent-service` → `toolCallResult`): la prova va dal
 * nucleo VERO all'evento in fondo, perché un campo nuovo si perde proprio negli inoltri (lezione del 17/10, `attrezziDifferiti`).
 * Ricerca 27/10/2026: Hermes mostra l'immagine analizzata dietro il pannello aperto e la RILEGGE dal file (`apps/desktop/src/components/
 * assistant-ui/tool/fallback.tsx:690`, clone del 22/10); qui il riferimento è la copia salvata, cioè ciò che il modello ha visto davvero.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';
import { talosLavora } from '../src/kernel/talosHarness.mjs';
import { toolCallResult } from '../src/agui-events.mjs';
import { STRUMENTI_ESTESI_PREDEFINITI } from '../src/session-registry.mjs';

const RIF = 'c'.repeat(64);
/* Il servizio chiede la risposta a flusso: un finto fornitore SSE, come `bc57-prova-senza-suite.test.mjs` (fabbriche: un Response si legge una volta) */
const enc = new TextEncoder();
const sse = (fotogrammi) => new Response(new ReadableStream({ start(c) {
  for (const f of fotogrammi) c.enqueue(enc.encode(`data: ${JSON.stringify(f)}\n\n`));
  c.enqueue(enc.encode('data: [DONE]\n\n'));
  c.close();
} }));
const chiama = (percorso) => () => sse([{ choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_1', function: { name: 'view_image', arguments: JSON.stringify({ path: percorso }) } }] } }] }]);
const CONCLUSO = () => sse([{ choices: [{ delta: { content: 'vista' } }] }]);
function rete(...risposte) {
  let i = 0;
  return async () => risposte[Math.min(i++, risposte.length - 1)]();
}
const ospite = async () => ({ ok: true, esito: 'Image "foto.png" (640×480) is attached below.', immagine: { riferimento: RIF, mime: 'image/png', larghezza: 640, altezza: 480 } });

async function giroDelServizio(t, percorsoDi) {
  const radice = mkdtempSync(join(tmpdir(), 'talos-vi-ev-'));
  t.after(() => rimuoviCartellaDiProva(radice));
  writeFileSync(join(radice, 'foto.png'), 'finto: i byte li legge l\'ospite');
  const { avviaSessione } = await import('../src/agent-service.mjs');
  const eventi = [];
  const fetchDiRete = rete(chiama(percorsoDi(radice)), CONCLUSO);
  await avviaSessione({
    cartella: radice, task: { consegna: 'guarda la foto' }, modello: 'm', chiave: 'k', onEvento: (e) => eventi.push(e),
    guardaImmagineFn: ospite, vedeImmaginiFn: async () => true,
    strumentiEstesi: STRUMENTI_ESTESI_PREDEFINITI, // come li passa il registro
    // il nucleo VERO, con la sola rete finta: niente `tool-esito` scritto a mano
    talosLavoraFn: (input) => talosLavora({ ...input, fetchDiRete }),
  });
  return eventi;
}

test('VI-EVENTO-01 dal nucleo vero all\'evento: il ToolCallResult di view_image porta `images` col riferimento, il formato e le misure', async (t) => {
  const eventi = await giroDelServizio(t, () => 'foto.png');
  const risultato = eventi.find((e) => e.type === 'ToolCallResult' && e.toolCallId === 'call_1');
  assert.ok(risultato, JSON.stringify(eventi.map((e) => e.type)));
  assert.deepEqual(risultato.images, [{ id: RIF, mimeType: 'image/png', width: 640, height: 480 }], risultato.content);
  assert.ok(!JSON.stringify(risultato).includes('talos_immagini'), 'il campo interno della storia non esce nell\'evento');
});

test('VI-EVENTO-02 AL CONTRARIO: un\'immagine non aperta (fuori dal progetto, nessuno conferma) non porta nessuna miniatura', async (t) => {
  const altrove = mkdtempSync(join(tmpdir(), 'talos-vi-altrove-'));
  t.after(() => rimuoviCartellaDiProva(altrove));
  const eventi = await giroDelServizio(t, () => join(altrove, 'foto.png'));
  const risultato = eventi.find((e) => e.type === 'ToolCallResult' && e.toolCallId === 'call_1');
  assert.ok(risultato);
  assert.equal('images' in risultato, false, 'nessun campo: l\'evento resta com\'era');
});

test('VI-EVENTO-03 `toolCallResult` decide cosa entra: solo riferimenti validi dello store, al massimo 4, mai altro', () => {
  const base = { messageId: 'm', toolCallId: 't', content: 'x' };
  assert.equal('images' in toolCallResult({ ...base }), false, 'senza immagini l\'evento è identico a prima');
  assert.equal('images' in toolCallResult({ ...base, images: [] }), false);
  assert.equal('images' in toolCallResult({ ...base, images: [{ id: '../etc/passwd' }, { id: 'ABC' }, null] }), false, 'nessun riferimento valido ⇒ niente campo');
  const misto = toolCallResult({ ...base, images: [{ id: RIF, mimeType: 'text/html', width: -1, height: 1.5, dati: 'byte' }, { id: 'd'.repeat(64), mimeType: 'image/webp', width: 10, height: 20 }] });
  assert.deepEqual(misto.images, [{ id: RIF }, { id: 'd'.repeat(64), mimeType: 'image/webp', width: 10, height: 20 }], 'formato non immagine, misure storte e campi estranei si tolgono');
  const tante = toolCallResult({ ...base, images: Array.from({ length: 6 }, () => ({ id: RIF })) });
  assert.equal(tante.images.length, 4);
});
