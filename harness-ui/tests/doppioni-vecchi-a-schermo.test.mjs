/*
 * Owner 16/10/2026 sera («Solo a schermo»): due conversazioni nate PRIMA del «-N» col nome automatico uguale erano gemelle nella barra e
 * nella Home. Al ripristino la più vecchia resta com'è e le altre prendono «-2», «-3» in ordine di nascita; sul disco non si scrive
 * niente; un nome scelto a mano non si tocca.
 */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import { createSessionRegistry } from '../src/session-registry.mjs';
import { attendiScritture } from '../src/session-store.mjs';
import { cartellaDiProva } from './aiuto/cartelle-di-prova.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const CONSEGNA = 'Prova del bugfixer sui permessi: affida a un sotto-agente la creazione del file di prova nella cartella';

function scriviSessione(cartellaStore, sessionId, avviataAlle, { nome = null, consegna = CONSEGNA } = {}) {
  const righe = [
    { tipo: 'intestazione', schema: 1, sessionId, taskId: 'libero:prova', cartella: cartellaStore, task: { consegna, consegnaCorta: consegna.slice(0, 80) }, comandoProva: null, forkDa: null,
      avviataAlle, modello: 'z-ai/glm-5.3-flash', permessi: 'Full access', padreId: null, profonditaDelega: 0, provider: 'cloud', cartellaGiaScelta: true },
    { type: 'RunStarted', _sequenza: 1, threadId: sessionId, runId: 'r1' },
    { type: 'RunFinished', _sequenza: 2, threadId: sessionId, runId: 'r1', result: { detto: 'fatto' } },
    ...(nome ? [{ tipo: 'nome-sessione', nome }] : []),
  ];
  const file = join(cartellaStore, `${sessionId}.jsonl`);
  writeFileSync(file, righe.map((r) => `${JSON.stringify(r)}\n`).join(''), 'utf8');
  return file;
}
const nuovoRegistro = (cartellaStore) => createSessionRegistry({ cartellaStore, guardaWorkspaceFn: () => () => {}, modello: 'm', chiave: 'k', avviaSessioneFn: async () => ({ ok: true }) });
const nomeDi = (registro, id) => registro.elenca().find((s) => s.sessionId === id)?.nome;

test('DOPPIONI-VECCHI-01 — due nomi automatici uguali di prima: la più vecchia resta, l altra prende «-2»; il disco resta com era', async (t) => {
  const cartellaStore = cartellaDiProva('talos-doppioni-vecchi-');
  t.after(() => rimuoviCartellaDiProva(cartellaStore));
  const vecchia = '00000000-0000-4000-8000-0000000000a1';
  const recente = '00000000-0000-4000-8000-0000000000a2';
  const terza = '00000000-0000-4000-8000-0000000000a3';
  const file = [scriviSessione(cartellaStore, recente, '2026-10-08T08:48:00.000Z'), scriviSessione(cartellaStore, vecchia, '2026-10-08T08:41:00.000Z'), scriviSessione(cartellaStore, terza, '2026-10-08T09:00:00.000Z')];
  const prima = file.map((f) => readFileSync(f, 'utf8'));
  const registro = nuovoRegistro(cartellaStore);
  await registro.ripristina();
  const base = nomeDi(registro, vecchia);
  assert.ok(base && !/-\d+…?$/u.test(base), `premessa: la più vecchia ha il nome automatico senza numero: ${base}`);
  assert.match(nomeDi(registro, recente), /-2…?$/u, nomeDi(registro, recente));
  assert.match(nomeDi(registro, terza), /-3…?$/u, nomeDi(registro, terza));
  await attendiScritture({ cartellaStore });
  assert.deepEqual(file.map((f) => readFileSync(f, 'utf8')), prima, 'solo a schermo: nessuna riga scritta');
  await registro.chiudi({ attesaMassimaMs: 1_000 });
  // una ricarica della sola recente ritrova lo stesso numero
  const di = nuovoRegistro(cartellaStore);
  await di.ripristina();
  await di.ripristina({ soloSessioni: [recente], perRicarica: true });
  assert.match(nomeDi(di, recente), /-2…?$/u, 'ricaricata da sola: stesso numero');
  await di.chiudi({ attesaMassimaMs: 1_000 });
});

test('DOPPIONI-VECCHI-02 — AL CONTRARIO: due nomi SCELTI a mano uguali restano come sono', async (t) => {
  const cartellaStore = cartellaDiProva('talos-doppioni-vecchi-');
  t.after(() => rimuoviCartellaDiProva(cartellaStore));
  const a = '00000000-0000-4000-8000-0000000000b1';
  const b = '00000000-0000-4000-8000-0000000000b2';
  scriviSessione(cartellaStore, a, '2026-10-08T08:41:00.000Z', { nome: 'Il mio progetto' });
  scriviSessione(cartellaStore, b, '2026-10-08T08:48:00.000Z', { nome: 'Il mio progetto' });
  const registro = nuovoRegistro(cartellaStore);
  await registro.ripristina();
  assert.equal(nomeDi(registro, a), 'Il mio progetto');
  assert.equal(nomeDi(registro, b), 'Il mio progetto', 'un nome scelto a mano non si tocca');
  await registro.chiudi({ attesaMassimaMs: 1_000 });
});
