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

/*
 * ⛔⛔ 14/09 — F06 della review, riprodotto prima di curarlo: due giri SOVRAPPOSTI (il timer ne apre uno mentre il
 *   precedente sta ancora leggendo l'elenco) facevano partire DUE VOLTE la stessa automazione, perché il secondo
 *   giro vedeva `eseguiteOggi` prima che `registraEsecuzione` del primo avesse scritto. Una sessione vera COSTA:
 *   qui la prova conta gli avvii, non le intenzioni.
 */
function storeFintoLento(voci) {
  const base = storeFinto(voci);
  let sblocca;
  const cancello = new Promise((risolvi) => { sblocca = risolvi; });
  const elencaBase = base.elenca.bind(base);
  let elencaChiamate = 0;
  base.elenca = async () => { elencaChiamate += 1; await cancello; return elencaBase(); };
  return { store: base, apriIlCancello: () => sblocca(), elencaChiamate: () => elencaChiamate };
}

test('⛔⛔⛔ F06 — due giri sovrapposti fanno partire l\'automazione UNA volta sola (un giro alla volta)', async () => {
  const voce = {
    id: 'a1', taskId: 'costosa', attiva: true,
    prossimaEsecuzione: '2026-08-27T09:59:00.000Z', limiteAlGiorno: 3, eseguiteOggi: 0, giornoContatore: null,
  };
  const { store, apriIlCancello, elencaChiamate } = storeFintoLento([voce]);
  const registry = sessionRegistryFinto();
  const scheduler = createAutomationScheduler({ store, sessionRegistry: registry, clock: () => new Date('2026-08-27T10:00:00.000Z') });

  const primo = scheduler.unTick();
  const secondo = scheduler.unTick(); // arriva mentre il primo è fermo sull'elenco
  apriIlCancello();
  await Promise.all([primo, secondo]);

  assert.deepEqual(registry.avviate, ['costosa'], 'una sessione vera sola, non due');
  assert.deepEqual(store.chiamate.registraEsecuzione, ['a1']);
  assert.equal(elencaChiamate(), 1, 'il secondo giro ha ricevuto lo STESSO giro, non ne ha aperto un altro');
});

test('⛔ AL CONTRARIO: la guardia non incastra lo scheduler — il giro DOPO quello finito riparte normalmente', async () => {
  const voce = {
    id: 'a1', taskId: 'x', attiva: true,
    prossimaEsecuzione: '2026-08-27T09:59:00.000Z', limiteAlGiorno: 9, eseguiteOggi: 0, giornoContatore: null,
  };
  const store = storeFinto([voce]);
  const registry = sessionRegistryFinto();
  const scheduler = createAutomationScheduler({ store, sessionRegistry: registry, clock: () => new Date('2026-08-27T10:00:00.000Z') });

  await scheduler.unTick();
  await scheduler.unTick();

  assert.deepEqual(registry.avviate, ['x', 'x'], 'due giri SEQUENZIALI restano due giri');
});

test('⛔ AL CONTRARIO: un giro che FALLISCE non blocca per sempre i successivi', async () => {
  const voce = {
    id: 'a1', taskId: 'x', attiva: true,
    prossimaEsecuzione: '2026-08-27T09:59:00.000Z', limiteAlGiorno: 9, eseguiteOggi: 0, giornoContatore: null,
  };
  const store = storeFinto([voce]);
  const registry = sessionRegistryFinto();
  let primaVolta = true;
  const elencaBase = store.elenca.bind(store);
  store.elenca = async () => {
    if (primaVolta) { primaVolta = false; throw new Error('elenco illeggibile'); }
    return elencaBase();
  };
  const scheduler = createAutomationScheduler({ store, sessionRegistry: registry, clock: () => new Date('2026-08-27T10:00:00.000Z') });

  await assert.rejects(() => scheduler.unTick(), /elenco illeggibile/);
  await scheduler.unTick();

  assert.deepEqual(registry.avviate, ['x'], 'il giro dopo il fallimento gira davvero');
});
