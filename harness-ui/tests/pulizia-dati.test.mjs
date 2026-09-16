import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import { PROVIDER_IDS } from '../src/provider-credential-store.mjs';
import { FONTI_RICERCA_IDS } from '../src/search-source-store.mjs';
import { puliziaDatiDesktop } from '../src/pulizia-dati.mjs';

/*
 * ⛔ (16/09/2026) — LA ROUTINE DI PULIZIA ALLA DISINSTALLAZIONE (bug 2, gamba 2b). Il contratto
 * che i test chiudono: cancella SOLO il namespace `-desktop` del portachiavi (mai i servizi dello
 * sviluppo), scrive il tombstone dell'indice vuoto per OGNI provider (l'indice è l'ultima
 * scrittura, non si resuscita nulla al prossimo avvio), e fallisce ONESTO — mai un successo
 * inventato: l'uninstaller cancella i dati utente SOLO se l'esito è ok.
 */

const LEGACY = 'talos-harness-provider';
const POOL = 'talos-harness-provider-pool';
const INDICE = 'talos-harness-provider-pool-index';
const RICERCA = 'talos-harness-search';
const DESKTOP = '-desktop';

function portachiaviPreparato() {
  const m = new Map();
  const scrivi = (servizio, account, valore) => m.set(`${servizio}|${account}`, valore);
  const impronta = createHash('sha256').update('sk-pulizia-finta-1').digest('hex');
  // Il namespace dell'app installata: un provider con chiave (indice + pool + account legacy)
  // e una fonte di ricerca con chiave — scritti ESATTAMENTE come li scriverebbe l'app.
  scrivi(INDICE + DESKTOP, 'openrouter:indice', JSON.stringify({ version: 1, chiavi: [[impronta, 0, null, null]] }));
  scrivi(POOL + DESKTOP, `openrouter:${impronta}`, 'sk-pulizia-finta-1');
  scrivi(LEGACY + DESKTOP, 'openrouter', 'sk-pulizia-finta-1');
  scrivi(RICERCA + DESKTOP, 'brave', 'brave-pulizia-finta');
  // Il namespace dello SVILUPPO (nessun suffisso): NON si tocca mai.
  scrivi(LEGACY, 'openrouter', 'sk-dev-mai-toccata');
  scrivi(RICERCA, 'tavily', 'tvly-dev-mai-toccata');
  return { m, impronta };
}

test('PULIZIA-01 — cancella SOLO il namespace `-desktop`, tombstone per ogni provider, sviluppo intatto e nessun segreto nel riepilogo', async () => {
  const { m, impronta } = portachiaviPreparato();
  const righe = [];
  const logger = { log: (t) => righe.push(String(t)), error: (t) => righe.push(String(t)) };
  const esito = await puliziaDatiDesktop({
    keyring: {
      get: (s, a) => m.get(`${s}|${a}`) ?? null,
      set: (s, a, v) => m.set(`${s}|${a}`, v),
      remove: (s, a) => m.delete(`${s}|${a}`),
    },
    logger,
  });

  assert.equal(esito.ok, true);
  assert.equal(esito.errori.length, 0);
  // Le chiavi dell'app installata sono sparite (pool, indice del provider scelto, legacy, ricerca)
  assert.equal(m.has(`${POOL + DESKTOP}|openrouter:${impronta}`), false);
  assert.equal(m.has(`${LEGACY + DESKTOP}|openrouter`), false);
  assert.equal(m.has(`${RICERCA + DESKTOP}|brave`), false);
  // ⛔ Il tombstone: l'indice vuoto esiste per OGNI provider — è l'ultima scrittura, così al
  // prossimo avvio nessuna chiave vecchia può resuscitare.
  for (const id of PROVIDER_IDS) {
    const indice = m.get(`${INDICE + DESKTOP}|${id}:indice`);
    assert.ok(typeof indice === 'string', `manca il tombstone dell'indice per ${id}`);
    assert.deepEqual(JSON.parse(indice).chiavi, []);
  }
  // ⛔ Lo sviluppo da sorgente NON si tocca mai: le sue chiavi sono lì, valore compreso.
  assert.equal(m.get(`${LEGACY}|openrouter`), 'sk-dev-mai-toccata');
  assert.equal(m.get(`${RICERCA}|tavily`), 'tvly-dev-mai-toccata');
  // Il riepilogo dice nomi e conteggi, MAI un valore di chiave.
  const racconto = righe.join('\n');
  assert.doesNotMatch(racconto, /sk-pulizia-finta-1|brave-pulizia-finta|sk-dev-mai-toccata|tvly-dev-mai-toccata/);
  assert.match(racconto, /errori: 0/);
});

test('PULIZIA-02 — portachiavi guasto: fallimento ONESTO per ogni id, nessuna eccezione che sfugga', async () => {
  const righe = [];
  const esito = await puliziaDatiDesktop({
    keyring: { get: () => null, set: () => { throw new Error('portachiavi bloccato'); }, remove: () => { throw new Error('portachiavi bloccato'); } },
    logger: { log: (t) => righe.push(String(t)), error: (t) => righe.push(String(t)) },
  });
  assert.equal(esito.ok, false);
  assert.equal(esito.errori.length, PROVIDER_IDS.length + FONTI_RICERCA_IDS.length, 'ogni provider e ogni fonte denuncia il guasto');
  // (/i: il negozio provider dice «portachiavi», quello ricerca «Portachiavi» — stesso guasto, due case)
  for (const id of PROVIDER_IDS) assert.ok(esito.errori.some((e) => e.tipo === 'provider' && e.id === id && /portachiavi/i.test(e.messaggio)));
  for (const id of FONTI_RICERCA_IDS) assert.ok(esito.errori.some((e) => e.tipo === 'ricerca' && e.id === id && /portachiavi/i.test(e.messaggio)));
  // Nell'uninstaller questo esito (non-0) mostra il messaggio e NON cancella %APPDATA%\TALOS.
  assert.match(righe.join('\n'), /Pulizia incompleta/);
});
