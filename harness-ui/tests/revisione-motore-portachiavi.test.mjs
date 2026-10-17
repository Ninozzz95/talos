/*
 * ⛔ REVISIONE AVVERSARIA della cura del motore (bugfixer, 14/10/2026 sera) — ramo `fix/motore-tmp-e-portachiavi`, `380469ba0`.
 *
 * La cura fa arrivare i GUASTI del portachiavi di sistema (get/remove) ai chiamanti, «che hanno già il loro try/catch e il loro
 * codice». Prove ROSSE apposta su due chiamanti per cui non è vero:
 *   · la custodia di ChatGPT (`chatgpt-custodia.mjs`) li inghiotte ancora: `togli` (l'uscita da ChatGPT) cattura ogni `remove` come
 *     «già assente» — e ora un `remove` che lancia È un guasto: il token resta nel portachiavi e l'uscita dice di essere riuscita;
 *   · `salvaPool` (`provider-credential-store.mjs`) legge la voce di prima DOPO aver pubblicato l'indice nuovo: un guasto in quella
 *     lettura fa rispondere «portachiavi non disponibile» a un cambio che è già stato salvato.
 * Rapporto: `handoff-talos-2026-09-27/bugfixer/RAPPORTO-REVISIONE-GOAL-G3-2026-10-14.md`, sezione «Motore».
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { creaCustodiaChatgpt } from '../src/chatgpt-custodia.mjs';
import { createProviderCredentialStore } from '../src/provider-credential-store.mjs';

function portachiavi() {
  const valori = new Map();
  const guasti = { remove: null, get: null };
  return {
    valori, guasti,
    get(s, a) { if (guasti.get && `${s}:${a}`.includes(guasti.get)) throw Object.assign(new Error('the keychain is locked'), { code: 'GenericFailure' }); return valori.get(`${s}:${a}`) ?? null; },
    set(s, a, v) { valori.set(`${s}:${a}`, v); },
    remove(s, a) { if (guasti.remove && `${s}:${a}`.includes(guasti.remove)) throw Object.assign(new Error('access denied'), { code: 'GenericFailure' }); valori.delete(`${s}:${a}`); },
  };
}

test('MOTORE-REV-01 (S3) — signing out of ChatGPT with a keychain FAULT on remove reports nothing: the token stays in the keychain', () => {
  const k = portachiavi();
  const custodia = creaCustodiaChatgpt({ keyring: k });
  custodia.scrivi('sessione', { access_token: 'tok-di-prova-che-deve-sparire', refresh_token: 'refresh-di-prova' });
  assert.ok(custodia.leggi('sessione'), 'premise: signed in');
  k.guasti.remove = 'talos-harness-chatgpt'; // il portachiavi rifiuta di togliere (bloccato, accesso negato)
  let detto = null;
  try { custodia.togli('sessione'); } catch (errore) { detto = errore; }
  k.guasti.remove = null;
  const ancora = custodia.leggi('sessione');
  assert.ok(detto !== null || ancora === null, `sign-out returned as done, and the session is still in the keychain: ${JSON.stringify(ancora)}`);
});

test('MOTORE-REV-02 (S4) — a keychain FAULT on the read that salvaPool does AFTER publishing the new index reports «unavailable» for a change already saved', () => {
  const k = portachiavi();
  const store = createProviderCredentialStore({ env: {}, keyring: k });
  k.guasti.get = 'talos-harness-provider:zai'; // solo la voce singola di prima (la «legacy»), non il pool
  let rifiuto = null;
  try { store.aggiungiChiave('zai', 'rev-motore-chiave-uno-0123456789'); } catch (errore) { rifiuto = errore; }
  k.guasti.get = null;
  const ricaricato = createProviderCredentialStore({ env: {}, keyring: k });
  ricaricato.loadFromKeyring();
  const salvata = ricaricato.elencaPool('zai').length === 1;
  assert.ok(!(rifiuto && salvata), `the person is told ${rifiuto?.code} and the key was saved anyway`);
});
