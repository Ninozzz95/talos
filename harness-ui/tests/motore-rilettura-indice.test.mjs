/*
 * ⭐ PORTACHIAVI-REV-03 (revisione del bugfixer, 14/10/2026 notte) allargata: OGNI operazione che riscrive il pool rilegge prima
 * l'indice, così uno store caricato prima che un altro processo cambiasse le chiavi (il 4174 e l'app sulla stessa cartella dati)
 * non cancella né dimentica le chiavi dell'altro. Nei due versi, e col guasto del portachiavi durante la rilettura.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { createProviderCredentialStore } from '../src/provider-credential-store.mjs';

function portachiavi() {
  const valori = new Map();
  let guasto = null;
  return {
    valori,
    guastaUnaVolta(parte) { guasto = parte; },
    get(s, a) { if (guasto && `${s}:${a}`.includes(guasto)) { guasto = null; throw Object.assign(new Error('busy'), { code: 'GenericFailure' }); } return valori.get(`${s}:${a}`) ?? null; },
    set(s, a, v) { valori.set(`${s}:${a}`, v); },
    remove(s, a) { valori.delete(`${s}:${a}`); },
  };
}
const CHIAVE = (n) => `rilettura-chiave-${n}-0123456789abcdef`;
const segretiNelPortachiavi = (k) => [...k.valori.entries()].filter(([c, v]) => !c.endsWith(':indice') && typeof v === 'string' && v.startsWith('rilettura-')).length;
function dueProcessi() {
  const k = portachiavi();
  const app = createProviderCredentialStore({ env: {}, keyring: k });
  app.aggiungiChiave('zai', CHIAVE('uno'));
  const server = createProviderCredentialStore({ env: {}, keyring: k });
  server.loadFromKeyring(); // caricato ADESSO, poi l'app aggiunge una chiave
  app.aggiungiChiave('zai', CHIAVE('due'));
  return { k, app, server };
}
const impronteSalvate = (k) => { const s = createProviderCredentialStore({ env: {}, keyring: k }); s.loadFromKeyring(); return s.elencaPool('zai').length; };

test('RILETTURA-01 — lo store vecchio che cancella tutto toglie anche la chiave aggiunta dall\'altro', () => {
  const { k, server } = dueProcessi();
  server.clearKey('zai');
  assert.equal(segretiNelPortachiavi(k), 0, 'nessun segreto rimasto');
  assert.equal(impronteSalvate(k), 0);
});

test('RILETTURA-02 — lo store vecchio che aggiunge o toglie una chiave non dimentica quella dell\'altro', () => {
  const a = dueProcessi();
  a.server.aggiungiChiave('zai', CHIAVE('tre'));
  assert.equal(impronteSalvate(a.k), 3, 'aggiungendo: tre chiavi, anche quella dell\'altro');
  const b = dueProcessi();
  const [prima] = b.server.elencaPool('zai');
  b.server.rimuoviChiave('zai', prima.impronta);
  assert.equal(impronteSalvate(b.k), 1, 'togliendone una: resta quella dell\'altro');
  assert.equal(segretiNelPortachiavi(b.k), 1);
});

test('RILETTURA-03 — un guasto del portachiavi durante la rilettura: cancellare e aggiungere rifiutano senza scrivere; la panchina resta in memoria', () => {
  const { k, server } = dueProcessi();
  const fotografia = new Map(k.valori);
  k.guastaUnaVolta('zai:indice');
  assert.throws(() => server.clearKey('zai'), (e) => e?.code === 'PROVIDER_STORE_UNAVAILABLE');
  assert.deepEqual(k.valori, fotografia, 'niente scritto');
  k.guastaUnaVolta('zai:indice');
  assert.throws(() => server.aggiungiChiave('zai', CHIAVE('tre')), (e) => e?.code === 'PROVIDER_STORE_UNAVAILABLE');
  assert.deepEqual(k.valori, fotografia, 'niente scritto');
  // la panchina, nel mezzo di una richiesta: non lancia, resta in memoria e non riscrive l'indice da una copia vecchia
  const [voce] = server.elencaPool('zai');
  k.guastaUnaVolta('zai:indice');
  assert.doesNotThrow(() => server.mettiInPanchina('zai', voce.impronta, { classe: 'traffico' }));
  assert.deepEqual(k.valori, fotografia, 'la panchina con la rilettura guasta non riscrive l\'indice');
  // AL CONTRARIO: senza guasto la panchina si salva, e l'indice tiene anche la chiave dell'altro
  server.mettiInPanchina('zai', voce.impronta, { classe: 'traffico' });
  assert.equal(impronteSalvate(k), 2);
});
