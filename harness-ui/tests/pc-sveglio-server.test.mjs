import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { setTimeout as ms } from 'node:timers/promises';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';
import { MODO_DI_SERIE, creaAvvisoSveglio, modoValido } from '../src/pc-sveglio.mjs';
import { createSessionRegistry } from '../src/session-registry.mjs';
import { attendiScritture } from '../src/session-store.mjs';

test('PSS-0 the real registry counts the turns at work: one while it runs, none once it ended', async (t) => {
  const cartellaStore = mkdtempSync(join(tmpdir(), 'talos-sveglio-'));
  const fine = [];
  const registry = createSessionRegistry({ cartellaStore, modello: 'local:a', chiave: 'k', cartellaEsisteFn: () => true,
    avviaSessioneFn(input) { input.onEvento({ type: 'RunStarted', threadId: 't', runId: 'r' }); return new Promise((r) => fine.push(r)); },
    preparaEsecuzioneFn: () => ({ cartella: '/tmp/x', comandoProva: 'npm test', task: { id: 'task', consegna: 'leggi' } }) });
  t.after(async () => {
    for (const r of fine) r({});
    await registry.chiudi?.();
    try { await attendiScritture({ cartellaStore }); } catch { /* the folder goes anyway */ }
    rimuoviCartellaDiProva(cartellaStore);
  });
  assert.equal(registry.giriAlLavoro(), 0);
  registry.avvia('task', { permessiScelto: 'Workspace write', modalitaOperativaScelta: 'normale', modello: 'local:a' });
  await ms(5);
  assert.equal(registry.giriAlLavoro(), 1);
  for (const r of fine) r({ esito: 'successo' });
  for (let i = 0; i < 100 && registry.giriAlLavoro() !== 0; i += 1) await ms(10);
  assert.equal(registry.giriAlLavoro(), 0, 'the turn ended: it keeps nobody awake');
});

function banco({ modo = MODO_DI_SERIE } = {}) {
  const detti = [];
  const s = { giri: 0, apre: false, modo };
  let tic = null;
  const a = creaAvvisoSveglio({ giriAlLavoro: () => s.giri, motoreInApertura: () => s.apre, modo: () => s.modo, manda: (m) => detti.push(m.acceso),
    ripeti: (f) => { tic = f; return { unref() {} }; }, smetti: () => { tic = null; } });
  return { a, s, detti, tic: () => tic?.() };
}

test('PSS-1 «mentre lavora»: said only when the answer changes, 0→1 turns and 1→0', () => {
  const b = banco();
  b.a.avvia();
  assert.deepEqual(b.detti, [false], 'at start it says where it stands');
  b.s.giri = 1; b.tic(); b.s.giri = 3; b.tic();
  assert.deepEqual(b.detti, [false, true], 'three turns are still one «acceso»');
  b.s.giri = 0; b.tic(); b.tic();
  assert.deepEqual(b.detti, [false, true, false]);
});

test('PSS-2 the engine opening counts as work, even with no turn', () => {
  const b = banco();
  b.a.avvia();
  b.s.apre = true; b.tic();
  assert.deepEqual(b.detti, [false, true]);
});

test('PSS-3 modes: «mai» never, «sempre» always, an unknown mode is the default', () => {
  const mai = banco({ modo: 'mai' });
  mai.a.avvia(); mai.s.giri = 5; mai.tic();
  assert.deepEqual(mai.detti, [false]);
  const sempre = banco({ modo: 'sempre' });
  sempre.a.avvia(); sempre.tic();
  assert.deepEqual(sempre.detti, [true]);
  assert.equal(modoValido('boh'), MODO_DI_SERIE);
  assert.equal(MODO_DI_SERIE, 'mentre-lavora', 'like Hermes «while-working»');
});

test('PSS-4 stopping with the blocker on says «spento» once; without a shell nothing is said and nothing runs', () => {
  const b = banco();
  b.a.avvia(); b.s.giri = 1; b.tic();
  b.a.ferma();
  assert.deepEqual(b.detti, [false, true, false]);
  let partito = false;
  const senza = creaAvvisoSveglio({ giriAlLavoro: () => 1, manda: null, ripeti: () => { partito = true; } });
  senza.avvia();
  assert.equal(partito, false);
  assert.equal(senza.guarda(), null);
});

test('PSS-5 a broken count or a failing send never throws; a failed send is tried again at the next look', () => {
  let volte = 0;
  const a = creaAvvisoSveglio({ giriAlLavoro: () => { throw new Error('rotto'); }, manda: () => { volte += 1; if (volte === 1) throw new Error('canale chiuso'); }, ripeti: () => ({}) });
  assert.doesNotThrow(() => a.guarda());
  assert.equal(a.guarda(), false, 'second look: sent');
  assert.equal(volte, 2);
});
