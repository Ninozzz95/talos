/*
 * view_image (27/10/2026, contratto «non ancora»): la compattazione semplice conta l'immagine guardata. Nella storia vive come campo
 * interno del messaggio `tool` (`talos_immagini`) e diventa un'immagine vera solo all'invio: le stime la contavano zero.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { COSTO_IMMAGINE_TOKEN, costoImmaginiGuardate, misuraOccupazione, stimaConPezzi } from '../src/kernel/compattazione-desktop.mjs';
import { CAMPO_IMMAGINI } from '../src/kernel/immagine-da-guardare.mjs';

const RIF = 'c'.repeat(64);
const storia = (immagini) => [
  { role: 'user', content: 'guarda le due foto' },
  { role: 'assistant', content: null, tool_calls: [{ id: 'a', type: 'function', function: { name: 'view_image', arguments: '{"path":"a.png"}' } }] },
  { role: 'tool', tool_call_id: 'a', content: 'Image "a.png" is attached below.', ...(immagini ? { [CAMPO_IMMAGINI]: immagini } : {}) },
];
const una = [{ riferimento: RIF, mime: 'image/png', larghezza: 640, altezza: 480 }];

test('VI-COSTO-01 un\'immagine guardata pesa 1.500 token nella stima coi pezzi e nella misura stimata', () => {
  assert.equal(costoImmaginiGuardate(storia(una)), COSTO_IMMAGINE_TOKEN);
  assert.equal(stimaConPezzi(storia(una)) - stimaConPezzi(storia(null)) >= COSTO_IMMAGINE_TOKEN, true);
  const con = misuraOccupazione({ messaggi: storia(una) }).token;
  const senza = misuraOccupazione({ messaggi: storia(null) }).token;
  assert.equal(con - senza >= COSTO_IMMAGINE_TOKEN, true, `${con} - ${senza}`);
});

test('VI-COSTO-02 con l\'ancora del fornitore conta solo l\'immagine guardata DOPO l\'ancora (quella prima è già nel numero vero)', () => {
  const messaggi = [...storia(una), { role: 'assistant', content: null, tool_calls: [{ id: 'b', type: 'function', function: { name: 'view_image', arguments: '{"path":"b.png"}' } }] },
    { role: 'tool', tool_call_id: 'b', content: 'Image "b.png" is attached below.', [CAMPO_IMMAGINI]: una }];
  const ancora = { promptTokens: 5_000, lunghezza: 3, stima: 4_000 };
  const r = misuraOccupazione({ ancora, messaggi });
  assert.equal(r.misura, 'fornitore');
  const soloTesto = misuraOccupazione({ ancora, messaggi: messaggi.map(({ [CAMPO_IMMAGINI]: _x, ...m }) => m) });
  assert.equal(r.token - soloTesto.token, COSTO_IMMAGINE_TOKEN, 'una sola immagine dopo l\'ancora, non due');
});

test('VI-COSTO-03 AL CONTRARIO: il campo su un messaggio che non è `tool`, o vuoto, non pesa', () => {
  assert.equal(costoImmaginiGuardate([{ role: 'user', content: 'x', [CAMPO_IMMAGINI]: una }]), 0);
  assert.equal(costoImmaginiGuardate(storia([])), 0);
  assert.equal(costoImmaginiGuardate(null), 0);
});
