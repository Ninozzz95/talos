/*
 * ⛔ REVISIONE AVVERSARIA (bugfixer, 15/10/2026) — `feat/goal-g6-ui` cce6e9004 (cure dell'interfaccia G6, chat ferma senza chiave).
 *  - G6C-REV-01 (S4): la cura controlla la chiave alla NASCITA della chat ferma. Ma fra la nascita e «Avvia» la chiave può sparire o
 *    andare in panchina — e succede proprio lì: la proposta dei controlli (`/goal/proposta`) è una chiamata al modello della sessione,
 *    e un 429 mette la chiave in panchina. L'interfaccia fa prima `POST /goal` (l'obiettivo diventa «attivo») e poi `resume`: il primo
 *    giro è rifiutato (CONFIG_INVALID) e l'obiettivo resta «attivo» con niente che gira — lo stesso stato che la cura voleva impedire.
 * Rapporto: `handoff-talos-2026-09-27/bugfixer/RAPPORTO-REVISIONE-TRE-CURE-2026-10-15.md`.
 */
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { conStore, passo, registroAGiri } from './aiuto/banco-obiettivo.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

test('G6C-REV-01 (S4) — la chiave va in panchina fra la nascita della chat ferma e «Avvia»: l\'obiettivo non resta «attivo» con niente che gira', async (t) => conStore(t, async (cartellaStore) => {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-g6c-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  let chiave = 'k';
  const prontoFn = () => (chiave ? { pronto: true, fornitore: 'OpenRouter' }
    : { pronto: false, fornitore: 'OpenRouter', codice: 'CONFIG_INVALID',
      messaggio: 'The OpenRouter key is paused: the provider asked to wait because of heavy traffic. It will retry automatically in about 5 min; to avoid waiting, connect another key from Providers and access.' });
  const b = registroAGiri(cartellaStore, { modello: 'z-ai/glm-5.3-flash', prontoFn });
  const nata = b.registro.avviaLibero({ cartellaLibera: cartella, consegna: 'fai passare i test', ferma: true });
  assert.ok(nata.sessionId, `premessa: con la chiave la chat ferma nasce (${JSON.stringify(nata)})`);
  await passo();
  chiave = null; // la proposta dei controlli ha preso un 429: la chiave è in panchina
  // «Avvia» sulla carta, nell'ordine dell'interfaccia (`app.js`, `gestisciComandoObiettivo` → onAvvia): prima l'obiettivo, poi il messaggio
  const impostato = await b.registro.impostaObiettivo(nata.sessionId, 'fai passare i test', { criteri: [{ testo: 'runs npm test', verifica: { tipo: 'comando', comando: 'npm test' } }] });
  assert.equal(impostato.ok, true, 'premessa: l\'obiettivo si salva');
  const avvio = b.registro.resume(nata.sessionId, 'fai passare i test');
  assert.equal(avvio?.code, 'CONFIG_INVALID', `premessa: il primo giro è rifiutato (${JSON.stringify(avvio)})`);
  await passo(); await passo();
  assert.equal(b.giri.length, 0, 'premessa: nessun giro parte');
  // la pausa passa dal disco (salvaObiettivo): si aspetta la transizione, fino a 2 s, invece di due setImmediate
  const limite = Date.now() + 2000;
  while (Date.now() < limite && b.registro.statoObiettivo(nata.sessionId).obiettivo.stato === 'attivo') await new Promise((r) => setTimeout(r, 10));
  const ob = b.registro.statoObiettivo(nata.sessionId).obiettivo;
  assert.equal(ob.motivo?.tipo, 'errore', 'paused with the error, so the strip says why');
  assert.notEqual(ob.stato, 'attivo', 'the goal is left «active» with nothing running and nothing scheduled: the state the cure meant to prevent');
}));
