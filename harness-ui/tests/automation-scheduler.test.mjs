import assert from 'node:assert/strict';
import test from 'node:test';

import { createAutomationScheduler } from '../src/automation-scheduler.mjs';

// ⛔ Mai un vero setInterval qui: si prova SOLO unTick(), chiamato a mano,
// con un clock iniettato che il test avanza a piacere — stessa disciplina
// "mai un vero timer nei test unitari" già in uso in tutto il progetto.
// avvia()/ferma() (i soli punti che toccano un timer vero) restano fuori.

function storeFinto(voci) {
  const chiamate = { registraEsecuzione: [] };
  return {
    chiamate,
    async elenca() { return voci; },
    async registraEsecuzione(id) {
      chiamate.registraEsecuzione.push(id);
      const voce = voci.find((v) => v.id === id);
      if (voce) voce.eseguiteOggi += 1;
      return voce;
    },
  };
}

function sessionRegistryFinto() {
  const avviate = [];
  return { avviate, avvia(taskId) { avviate.push(taskId); return { sessionId: `s-${avviate.length}` }; } };
}

test('⭐ un\'automazione attiva con prossimaEsecuzione già passata PARTE DA SOLA', async () => {
  const voce = {
    id: 'a1', taskId: 'sconto-a-scaglioni', attiva: true,
    prossimaEsecuzione: '2026-08-27T09:59:00.000Z', limiteAlGiorno: 3, eseguiteOggi: 0, giornoContatore: null,
  };
  const store = storeFinto([voce]);
  const registry = sessionRegistryFinto();
  const scheduler = createAutomationScheduler({ store, sessionRegistry: registry, clock: () => new Date('2026-08-27T10:00:00.000Z') });

  await scheduler.unTick();

  assert.deepEqual(registry.avviate, ['sconto-a-scaglioni']);
  assert.deepEqual(store.chiamate.registraEsecuzione, ['a1']);
});

test('⛔ un\'automazione IN PAUSA non parte mai, anche con prossimaEsecuzione passata', async () => {
  const voce = {
    id: 'a1', taskId: 'x', attiva: false,
    prossimaEsecuzione: '2026-08-27T09:59:00.000Z', limiteAlGiorno: 3, eseguiteOggi: 0, giornoContatore: null,
  };
  const store = storeFinto([voce]);
  const registry = sessionRegistryFinto();
  const scheduler = createAutomationScheduler({ store, sessionRegistry: registry, clock: () => new Date('2026-08-27T10:00:00.000Z') });

  await scheduler.unTick();

  assert.deepEqual(registry.avviate, []);
});

test('⛔ AL CONTRARIO: un\'automazione attiva ma con prossimaEsecuzione ANCORA NEL FUTURO non parte', async () => {
  const voce = {
    id: 'a1', taskId: 'x', attiva: true,
    prossimaEsecuzione: '2026-08-27T10:30:00.000Z', limiteAlGiorno: 3, eseguiteOggi: 0, giornoContatore: null,
  };
  const store = storeFinto([voce]);
  const registry = sessionRegistryFinto();
  const scheduler = createAutomationScheduler({ store, sessionRegistry: registry, clock: () => new Date('2026-08-27T10:00:00.000Z') });

  await scheduler.unTick();

  assert.deepEqual(registry.avviate, []);
});

test('⛔⛔⛔ GUARDIA DI SICUREZZA: il limiteAlGiorno raggiunto blocca l\'avvio, e non ritenta a ogni giro', async () => {
  const voce = {
    id: 'a1', taskId: 'x', attiva: true, prossimaEsecuzione: '2026-08-27T09:59:00.000Z',
    limiteAlGiorno: 2, eseguiteOggi: 2, giornoContatore: '2026-08-27',
  };
  const store = storeFinto([voce]);
  const registry = sessionRegistryFinto();
  const scheduler = createAutomationScheduler({ store, sessionRegistry: registry, clock: () => new Date('2026-08-27T10:00:00.000Z') });

  await scheduler.unTick();
  await scheduler.unTick(); // ⛔ un secondo giro: deve restare fermo, non è un retry

  assert.deepEqual(registry.avviate, [], 'il limite è già raggiunto OGGI: zero avvii, non una coda che parte comunque');
});

test('⭐⭐ e AL CONTRARIO: lo stesso limite raggiunto IERI non blocca oggi — il contatore si legge per il giorno vero, non un flag fisso', async () => {
  const voce = {
    id: 'a1', taskId: 'sconto-a-scaglioni', attiva: true, prossimaEsecuzione: '2026-08-27T09:59:00.000Z',
    limiteAlGiorno: 2, eseguiteOggi: 2, giornoContatore: '2026-08-26', // il contatore è di IERI
  };
  const store = storeFinto([voce]);
  const registry = sessionRegistryFinto();
  const scheduler = createAutomationScheduler({ store, sessionRegistry: registry, clock: () => new Date('2026-08-27T10:00:00.000Z') });

  await scheduler.unTick();

  assert.deepEqual(registry.avviate, ['sconto-a-scaglioni'], 'un contatore vecchio di un giorno diverso non deve mai bloccare oggi');
});

test('⭐⭐⭐ più automazioni indipendenti: una parte, l\'altra resta ferma, ognuna per la sua stessa ragione', async () => {
  const pronta = { id: 'a1', taskId: 'pronta', attiva: true, prossimaEsecuzione: '2026-08-27T09:00:00.000Z', limiteAlGiorno: 3, eseguiteOggi: 0, giornoContatore: null };
  const inPausa = { id: 'a2', taskId: 'in-pausa', attiva: false, prossimaEsecuzione: '2026-08-27T09:00:00.000Z', limiteAlGiorno: 3, eseguiteOggi: 0, giornoContatore: null };
  const nelFuturo = { id: 'a3', taskId: 'nel-futuro', attiva: true, prossimaEsecuzione: '2026-08-27T11:00:00.000Z', limiteAlGiorno: 3, eseguiteOggi: 0, giornoContatore: null };
  const store = storeFinto([pronta, inPausa, nelFuturo]);
  const registry = sessionRegistryFinto();
  const scheduler = createAutomationScheduler({ store, sessionRegistry: registry, clock: () => new Date('2026-08-27T10:00:00.000Z') });

  await scheduler.unTick();

  assert.deepEqual(registry.avviate, ['pronta']);
});

test('⭐ onEsecuzione() è chiamata con automazione ed esito, per ogni avvio reale', async () => {
  const voce = { id: 'a1', taskId: 'x', attiva: true, prossimaEsecuzione: '2026-08-27T09:59:00.000Z', limiteAlGiorno: 3, eseguiteOggi: 0, giornoContatore: null };
  const store = storeFinto([voce]);
  const registry = sessionRegistryFinto();
  const catturati = [];
  const scheduler = createAutomationScheduler({
    store, sessionRegistry: registry, clock: () => new Date('2026-08-27T10:00:00.000Z'),
    onEsecuzione: (evento) => catturati.push(evento),
  });

  await scheduler.unTick();

  assert.equal(catturati.length, 1);
  assert.equal(catturati[0].automazione.id, 'a1');
  assert.equal(catturati[0].esito.sessionId, 's-1');
});
