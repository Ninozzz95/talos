/*
 * Decisione 215 dell'owner (04/11/2026) — «Invia al telefono» di un file FUORI dalla cartella della chat: passa solo se QUESTA chat
 * l'ha creato o scritto (eventi registrati, realpath contro realpath). Ogni altro file fuori resta «fuori» / FILE_GONE come prima.
 * Il dispositivo non riceve mai un percorso assoluto del PC.
 */
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { eventoPerScrittura } from '../src/agui-events.mjs';
import { creaFileDeiDispositivi, relativoDi } from '../src/remoto/file-dispositivi.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

function banco(t) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'talos-invio-fuori-')));
  t.after(() => rimuoviCartellaDiProva(dir));
  const progetto = join(dir, 'progetto'); const fuori = join(dir, 'fuori');
  mkdirSync(progetto); mkdirSync(fuori);
  writeFileSync(join(fuori, 'nota.md'), 'scritto dalla chat');
  writeFileSync(join(fuori, 'altro.md'), 'mai scritto');
  symlinkSync(fuori, join(dir, 'ponte'), 'junction');
  const eventi = [];
  const registro = { esiste: (id) => id === 's1', cartellaPerChatFile: async () => ({ ok: true, cartella: progetto }) };
  const file = creaFileDeiDispositivi({ cartella: join(dir, 'dati'), sessionRegistry: registro, eventiDellaSessione: () => eventi, clock: () => 1_800_000_000_000 });
  return { dir, progetto, fuori, eventi, file };
}
const fuoriO = (motivo) => (e) => { assert.equal(e.code, 'FILE_GONE'); if (motivo) assert.equal(e.motivo, motivo); return true; };

test('IF-01 (a): il file scritto fuori si esamina, si offre, sta nell\'elenco del dispositivo e si legge', async (t) => {
  const b = banco(t);
  b.eventi.push(eventoPerScrittura({ percorso: '../fuori/nota.md', contenuto: 'x', esisteva: false }));
  const esame = await b.file.esaminaOfferta({ sessionId: 's1', percorso: '../fuori/nota.md', dispositivoId: 'dA' });
  assert.equal(esame.nome, 'nota.md');
  assert.equal(esame.relativo, '../fuori/nota.md');
  const offerta = await b.file.registraOfferta({ sessionId: 's1', dispositivoId: 'dA', percorso: '../fuori/nota.md', versioneAttesa: esame.versione });
  const { items } = await b.file.elenco({ dispositivoId: 'dA', sessionId: 's1' });
  const riga = items.find((r) => r.fileId === offerta.fileId);
  assert.ok(riga, 'l\'offerta arriva al dispositivo');
  assert.equal(Object.hasOwn(riga, 'percorso'), false);
  const letto = await b.file.leggi({ dispositivoId: 'dA', sessionId: 's1', fileId: riga.fileId, versione: riga.versione, da: 0, quanti: 600 });
  assert.equal(Buffer.from(letto.dati, 'base64url').toString(), 'scritto dalla chat');
});

test('IF-02 (b): al contrario, un file fuori NON scritto resta «fuori», per l\'esame e per l\'offerta', async (t) => {
  const b = banco(t);
  b.eventi.push(eventoPerScrittura({ percorso: '../fuori/nota.md', contenuto: 'x', esisteva: false }));
  await assert.rejects(b.file.esaminaOfferta({ sessionId: 's1', percorso: '../fuori/altro.md' }), fuoriO('fuori'));
  await assert.rejects(b.file.esaminaOfferta({ sessionId: 's1', percorso: join(b.fuori, 'altro.md') }), fuoriO('fuori'));
  await assert.rejects(b.file.esaminaOfferta({ sessionId: 's1', percorso: '../fuori/inesistente.md' }), fuoriO('fuori'));
  await assert.rejects(b.file.registraOfferta({ sessionId: 's1', dispositivoId: 'dA', percorso: '../fuori/altro.md' }), fuoriO());
});

test('IF-03 (c): una giunzione porta al file scritto solo se è davvero lui', async (t) => {
  const b = banco(t);
  b.eventi.push(eventoPerScrittura({ percorso: '../fuori/nota.md', contenuto: 'x', esisteva: false }));
  assert.equal((await b.file.esaminaOfferta({ sessionId: 's1', percorso: '../ponte/nota.md' })).nome, 'nota.md');
  await assert.rejects(b.file.esaminaOfferta({ sessionId: 's1', percorso: '../ponte/altro.md' }), fuoriO('fuori'));
  await assert.rejects(b.file.registraOfferta({ sessionId: 's1', dispositivoId: 'dA', percorso: '../ponte/altro.md' }), fuoriO());
});

test('IF-04: una scrittura fallita del modello non apre niente', async (t) => {
  const b = banco(t);
  b.eventi.push(
    { type: 'ToolCallStart', toolCallId: 'c1', toolCallName: 'scrivi' },
    { type: 'ToolCallArgs', toolCallId: 'c1', delta: JSON.stringify({ percorso: '../fuori/altro.md' }) },
    { type: 'ToolCallResult', toolCallId: 'c1', isError: true },
  );
  await assert.rejects(b.file.esaminaOfferta({ sessionId: 's1', percorso: '../fuori/altro.md' }), fuoriO('fuori'));
});

test('IF-05: un file scritto su un ALTRO disco arriva al telefono col solo nome, mai col percorso del PC', { skip: process.platform !== 'win32' && 'i dischi con la lettera ci sono solo su Windows' }, () => {
  assert.equal(relativoDi('D:/lavoro/fuori/nota.md', 'C:/progetti/x'), 'nota.md');
  assert.equal(relativoDi('C:/progetti/x/sub/a.md', 'C:/progetti/x'), 'sub/a.md', 'dentro: il relativo con «/» di sempre');
  assert.equal(relativoDi('C:/progetti/fuori/b.md', 'C:/progetti/x'), '../fuori/b.md', 'stesso disco: il relativo resta quello di prima');
});
