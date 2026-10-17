/*
 * ⭐ Le cure della revisione del bugfixer sul motore (14/10/2026 notte; prove rosse in `revisione-motore-portachiavi.test.mjs`):
 *   · MOTORE-REV-01: uscire da ChatGPT con un portachiavi che RIFIUTA di togliere lo dice (`CHATGPT_USCITA_INCOMPLETA`); una voce
 *     assente resta un'uscita riuscita; i pezzi vecchi dopo una scrittura riuscita restano «al meglio»;
 *   · MOTORE-REV-02: dopo l'indice pubblicato il cambio è salvato — un guasto nella pulizia non lo smentisce; ma cancellare TUTTO
 *     (`clearKey`) con una copia rimasta lo dice.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { creaCustodiaChatgpt } from '../src/chatgpt-custodia.mjs';
import { createProviderCredentialStore } from '../src/provider-credential-store.mjs';

function portachiavi() {
  const valori = new Map();
  const guasti = { remove: null, get: null };
  const guasto = () => Object.assign(new Error('the keychain refused'), { code: 'GenericFailure' });
  return {
    valori, guasti,
    get(s, a) { if (guasti.get && `${s}:${a}`.includes(guasti.get)) throw guasto(); return valori.get(`${s}:${a}`) ?? null; },
    set(s, a, v) { valori.set(`${s}:${a}`, v); },
    remove(s, a) { if (guasti.remove && `${s}:${a}`.includes(guasti.remove)) throw guasto(); valori.delete(`${s}:${a}`); },
  };
}
const SESSIONE = { access_token: 'tok-di-prova', refresh_token: 'refresh-di-prova' };

test('MOTORE-CURA-01 — custodia di ChatGPT: rifiuto sull\'indice, rifiuto su un pezzo, lettura guasta ⇒ CHATGPT_USCITA_INCOMPLETA; assenza ⇒ nessun errore', () => {
  // `sessione:g1:` colpisce SOLO i pezzi (l'indice è `sessione:indice`)
  for (const [dove, cosa] of [['remove', ':indice'], ['remove', 'sessione:g1:'], ['get', ':indice']]) {
    const k = portachiavi();
    const c = creaCustodiaChatgpt({ keyring: k, generazione: () => 'g1' });
    c.scrivi('sessione', SESSIONE);
    k.guasti[dove] = cosa;
    assert.throws(() => c.togli('sessione'), (e) => e?.code === 'CHATGPT_USCITA_INCOMPLETA', `${dove} ${cosa}`);
  }
  // AL CONTRARIO: nessuna sessione ⇒ uscita riuscita, senza errore; e con una sessione, senza guasti, tutto sparisce
  const k = portachiavi();
  const c = creaCustodiaChatgpt({ keyring: k });
  assert.doesNotThrow(() => c.togli('sessione'));
  c.scrivi('sessione', SESSIONE);
  c.togli('sessione');
  assert.equal(c.leggi('sessione'), null);
  assert.equal([...k.valori.keys()].filter((v) => v.includes('sessione')).length, 0, 'nessun pezzo rimasto');
});

test('MOTORE-CURA-02 — riscrivere la sessione con un rifiuto sui pezzi VECCHI riesce lo stesso: la sessione nuova è quella letta', () => {
  let g = 0;
  const k = portachiavi();
  const c = creaCustodiaChatgpt({ keyring: k, generazione: () => `g${(g += 1)}` });
  c.scrivi('sessione', { ...SESSIONE, access_token: 'vecchio' });
  k.guasti.remove = 'sessione:g1:'; // i pezzi della generazione vecchia non si lasciano togliere
  assert.doesNotThrow(() => c.scrivi('sessione', { ...SESSIONE, access_token: 'nuovo' }));
  assert.equal(c.leggi('sessione').access_token, 'nuovo');
});

test('MOTORE-CURA-03 — clearKey con una copia rimasta nel portachiavi lo dice; senza guasti cancella tutto; aggiungere una chiave con la pulizia guasta riesce', () => {
  const k = portachiavi();
  const store = createProviderCredentialStore({ env: {}, keyring: k });
  store.aggiungiChiave('zai', 'cura-motore-chiave-uno-0123456789');
  k.guasti.remove = 'talos-harness-provider-pool:zai:'; // la copia della chiave nel pool non si lascia togliere
  assert.throws(() => store.clearKey('zai'), (e) => e?.code === 'PROVIDER_STORE_UNAVAILABLE');
  assert.equal(store.elencaPool('zai').length, 0, 'la chiave non si usa più: l\'indice vuoto è pubblicato');
  // AL CONTRARIO
  k.guasti.remove = null;
  const pulito = portachiavi();
  const s2 = createProviderCredentialStore({ env: {}, keyring: pulito });
  s2.aggiungiChiave('zai', 'cura-motore-chiave-due-0123456789');
  assert.doesNotThrow(() => s2.clearKey('zai'));
  pulito.guasti.get = 'talos-harness-provider:zai'; // la lettura della voce singola di prima è guasta
  assert.doesNotThrow(() => s2.aggiungiChiave('zai', 'cura-motore-chiave-tre-0123456789'));
  assert.equal(s2.elencaPool('zai').length, 1);
});
