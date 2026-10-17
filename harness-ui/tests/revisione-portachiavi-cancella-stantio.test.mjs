/*
 * ⛔ REVISIONE AVVERSARIA (bugfixer, 14/10/2026 sera) — `clearKey` da uno store STANTIO.
 *
 * La cura di MOTORE-REV-02 promette: «chi cancella tutto (`clearKey`, la pulizia) lo deve dire, perché lì una copia rimasta nel
 * portachiavi è proprio ciò che la persona voleva togliere». Ma `clearKey` toglie solo le chiavi che QUESTO processo conosce: una
 * chiave aggiunta da un altro processo (il 4174 e l'app installata sullo stesso portachiavi) dopo il caricamento resta nel portachiavi
 * — l'indice svuotato non la elenca più, nessuno la toglierà mai — e `clearKey` risponde «tolta». `setKey` rilegge l'indice prima
 * di scrivere (CREDITO-REV-01); `clearKey` no.
 * Rapporto: `handoff-talos-2026-09-27/bugfixer/RAPPORTO-REVISIONE-GOAL-G3-2026-10-14.md`, sezione «Riverifica del portachiavi».
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { createProviderCredentialStore } from '../src/provider-credential-store.mjs';

function fakeKeyring() {
  const values = new Map();
  return {
    values,
    get(service, account) { return values.get(`${service}:${account}`) ?? null; },
    set(service, account, value) { values.set(`${service}:${account}`, value); },
    remove(service, account) { values.delete(`${service}:${account}`); },
  };
}

test('PORTACHIAVI-REV-03 (S3) — «remove all keys» from a store loaded before another process added one leaves that key\'s secret in the keychain, and says it removed them', () => {
  const keyring = fakeKeyring();
  const app = createProviderCredentialStore({ env: {}, keyring });
  app.aggiungiChiave('zai', 'rev-cancella-chiave-uno-0123456789');
  const server = createProviderCredentialStore({ env: {}, keyring }); // il 4174, caricato adesso
  server.loadFromKeyring();
  app.aggiungiChiave('zai', 'rev-cancella-chiave-due-0123456789'); // l'app aggiunge una seconda chiave dopo
  let esito = null;
  let errore = null;
  try { esito = server.clearKey('zai'); } catch (e) { errore = e; }
  const segretiRimasti = [...keyring.values.entries()].filter(([k, v]) => k.includes(':zai:') && !k.endsWith(':indice') && typeof v === 'string' && v.startsWith('rev-cancella'));
  assert.ok(errore !== null || segretiRimasti.length === 0, `clearKey answered ${JSON.stringify(esito)} and ${segretiRimasti.length} key secret(s) stay in the keychain, listed by no index`);
});
