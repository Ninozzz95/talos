/*
 * 26/10/2026 — allegati apribili, revisione del blocco A-F1: i file della chat stanno nella cartella di PARTENZA della sessione
 * (`cartellaPerChatFile` = `voce.cartellaBase`), che in Accesso pieno da un progetto non è la radice dei permessi (il disco). La finestra
 * la impara dal `RunStarted`: `contesto.cartellaBase` c'è solo quando è diversa da `contesto.cartella`.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { avviaSessione } from '../src/agent-service.mjs';

const TASK = { consegna: 'Leggi il CSV allegato.', consegnaCorta: 'csv' };
const kernelMuto = () => async () => ({ comeFinita: 'concluso', detto: 'fatto' });

async function contestoDelGiro(opzioni) {
  const eventi = [];
  await avviaSessione({ task: TASK, modello: 'm', chiave: 'k', onEvento: (e) => eventi.push(e), talosLavoraFn: kernelMuto(), ...opzioni });
  const avvio = eventi.find((e) => e.type === 'RunStarted');
  assert.ok(avvio, 'il giro annuncia RunStarted');
  return avvio.contesto;
}

test('CONTESTO-BASE-01 radice = il disco, partenza = il progetto: il RunStarted porta la cartella di partenza', async () => {
  const contesto = await contestoDelGiro({ cartella: 'C:/', cartellaCreazioni: 'C:/Users/esempio/Desktop/progetto' });
  assert.equal(contesto.cartella, 'C:/');
  assert.equal(contesto.cartellaBase, 'C:/Users/esempio/Desktop/progetto');
});

test('CONTESTO-BASE-02 al contrario: quando coincidono (o non c\'è la partenza) il campo NON c\'è — l\'evento resta com\'era', async () => {
  const uguali = await contestoDelGiro({ cartella: 'C:/progetto', cartellaCreazioni: 'C:/progetto' });
  assert.equal(Object.hasOwn(uguali, 'cartellaBase'), false);
  const senza = await contestoDelGiro({ cartella: 'C:/progetto' });
  assert.equal(Object.hasOwn(senza, 'cartellaBase'), false);
});
