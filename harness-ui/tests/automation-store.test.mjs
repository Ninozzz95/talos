import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

import {
  AutomationStoreError, INTERVALLO_MINIMO_MINUTI, LIMITE_MASSIMO_AL_GIORNO, createAutomationStore,
} from '../src/automation-store.mjs';

function storeFinto(t, orologio = () => new Date('2026-08-27T10:00:00.000Z')) {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-automations-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  return createAutomationStore({ cartella, clock: orologio });
}

test('⭐ crea() nasce SEMPRE attiva:false — mai una spesa autonoma di sorpresa', async (t) => {
  const store = storeFinto(t);
  const voce = await store.crea({ taskId: 'sconto-a-scaglioni', intervalloMinuti: 30 });
  assert.equal(voce.attiva, false);
  assert.equal(voce.prossimaEsecuzione, null);
  assert.equal(voce.eseguiteOggi, 0);
  assert.equal(voce.limiteAlGiorno, 3, 'default dichiarato, non un tetto arbitrario diverso');
});

test('⭐⭐ crea() persiste DAVVERO: un secondo store sulla stessa cartella la rilegge', async (t) => {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-automations-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  const uno = createAutomationStore({ cartella });
  const due = createAutomationStore({ cartella });

  const voce = await uno.crea({ taskId: 'sconto-a-scaglioni', intervalloMinuti: 10 });
  const rilette = await due.elenca();

  assert.equal(rilette.length, 1);
  assert.deepEqual(rilette[0], voce, 'stesso store ricostruito da zero, stessi dati — la persistenza è reale, non solo in memoria');
});

test('⛔⛔⛔ i due tetti duri sono validati alla creazione, mai silenziosamente aggiustati', async (t) => {
  const store = storeFinto(t);
  await assert.rejects(
    () => store.crea({ taskId: 'x', intervalloMinuti: INTERVALLO_MINIMO_MINUTI - 1 }),
    (errore) => errore instanceof AutomationStoreError,
    'sotto il minimo di intervallo',
  );
  await assert.rejects(
    () => store.crea({ taskId: 'x', intervalloMinuti: 30, limiteAlGiorno: LIMITE_MASSIMO_AL_GIORNO + 1 }),
    (errore) => errore instanceof AutomationStoreError,
    'sopra il massimo di esecuzioni al giorno',
  );
  await assert.rejects(
    () => store.crea({ taskId: 'x', intervalloMinuti: 30, limiteAlGiorno: 0 }),
    (errore) => errore instanceof AutomationStoreError,
    'zero esecuzioni al giorno non ha senso: l\'automazione non partirebbe mai',
  );
});

test('⭐ imposta(id, true) calcola prossimaEsecuzione da ORA, non da un\'esecuzione mai avvenuta', async (t) => {
  const ora = new Date('2026-08-27T10:00:00.000Z');
  const store = storeFinto(t, () => ora);
  const voce = await store.crea({ taskId: 'x', intervalloMinuti: 15 });

  const attivata = await store.imposta(voce.id, true);

  assert.equal(attivata.attiva, true);
  assert.equal(attivata.prossimaEsecuzione, new Date(ora.getTime() + 15 * 60_000).toISOString());
});

test('⭐⭐ e AL CONTRARIO: imposta(id, false) azzera prossimaEsecuzione — un\'automazione in pausa non deve MAI scattare', async (t) => {
  const store = storeFinto(t);
  const voce = await store.crea({ taskId: 'x', intervalloMinuti: 15 });
  await store.imposta(voce.id, true);

  const fermata = await store.imposta(voce.id, false);

  assert.equal(fermata.attiva, false);
  assert.equal(fermata.prossimaEsecuzione, null);
});

test('⭐⭐⭐ registraEsecuzione() azzera il contatore al cambio di GIORNO, lo incrementa nello stesso giorno', async (t) => {
  let ora = new Date('2026-08-27T23:59:00.000Z');
  const store = storeFinto(t, () => ora);
  const voce = await store.crea({ taskId: 'x', intervalloMinuti: 15 });
  await store.imposta(voce.id, true);

  const primaEsecuzione = await store.registraEsecuzione(voce.id);
  assert.equal(primaEsecuzione.eseguiteOggi, 1);
  assert.equal(primaEsecuzione.giornoContatore, '2026-08-27');

  ora = new Date('2026-08-28T00:05:00.000Z'); // stesso store, un minuto dopo — ma un giorno DIVERSO
  const secondaEsecuzione = await store.registraEsecuzione(voce.id);
  assert.equal(secondaEsecuzione.eseguiteOggi, 1, 'azzerato dal cambio di giorno, non accumulato a 2');
  assert.equal(secondaEsecuzione.giornoContatore, '2026-08-28');
});

test('⛔ leggi()/imposta()/registraEsecuzione() su un id inesistente tornano null, mai un throw', async (t) => {
  const store = storeFinto(t);
  assert.equal(await store.leggi('non-esiste'), null);
  assert.equal(await store.imposta('non-esiste', true), null);
  assert.equal(await store.registraEsecuzione('non-esiste'), null);
});

test('⭐ elimina() rimuove davvero — elenca() non la ritrova più', async (t) => {
  const store = storeFinto(t);
  const voce = await store.crea({ taskId: 'x', intervalloMinuti: 15 });
  assert.equal((await store.elenca()).length, 1);

  await store.elimina(voce.id);

  assert.equal((await store.elenca()).length, 0);
});

test('elenca() su una cartella che non esiste ancora torna vuoto, non un errore', async (t) => {
  const cartella = join(mkdtempSync(join(tmpdir(), 'talos-automations-')), 'mai-creata');
  t.after(() => rimuoviCartellaDiProva(cartella));
  const store = createAutomationStore({ cartella });

  assert.deepEqual(await store.elenca(), []);
});
