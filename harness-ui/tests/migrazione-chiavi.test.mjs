import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { avvolgiAdattatoreKeyring } from '../src/adattatore-keyring.mjs';
import { migraChiaviLegacySuDesktop } from '../src/migrazione-chiavi.mjs';
import { createProviderCredentialStore } from '../src/provider-credential-store.mjs';
import { KEYRING_SERVICE_RICERCA, createSearchSourceStore } from '../src/search-source-store.mjs';
/* BC09, classe A: qui la prova non tiene vivo nulla del prodotto — solo cartelle mkdtemp. */
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

/*
 * ⛔ (16/09/2026) — LA MIGRAZIONE DELLE CHIAVI VECCHIE (decisione owner, cura della review).
 * Il contratto che i test chiudono: COPIA (mai sposta) dal namespace senza suffisso al
 * namespace `-desktop`; nessuna resurrezione (tombstone e chiavi dell'app non si toccano);
 * marcatore scritto SOLO quando la migrazione ha deciso qualcosa (mai bruciato da un
 * portachiavi sordo o da una macchina senza tracce); nessun segreto nell'esito.
 */

const LEGACY = 'talos-harness-provider';
const POOL = 'talos-harness-provider-pool';
const INDICE = 'talos-harness-provider-pool-index';
const RICERCA = KEYRING_SERVICE_RICERCA;
const DESKTOP = '-desktop';

function improntaDi(valore) { return createHash('sha256').update(valore).digest('hex'); }

/** Il namespace VECCHIO come lo scriveva l'app ≤ 0.1.10: pool con indice, legacy singolo, fonte di ricerca. */
function namespaceVecchioPreparato() {
  const m = new Map();
  const k1 = 'sk-vecchia-priorita-0';
  const k2 = 'sk-vecchia-priorita-1';
  m.set(`${INDICE}|openrouter:indice`, JSON.stringify({ version: 1, chiavi: [[improntaDi(k1), 0, null, null], [improntaDi(k2), 1, null, null]] }));
  m.set(`${POOL}|openrouter:${improntaDi(k1)}`, k1);
  m.set(`${POOL}|openrouter:${improntaDi(k2)}`, k2);
  m.set(`${LEGACY}|openrouter`, k1);
  m.set(`${RICERCA}|tavily`, 'tvly-vecchia');
  return { m, k1, k2 };
}

function mapFinto(m) {
  return {
    get: (s, a) => m.get(`${s}|${a}`) ?? null,
    set: (s, a, v) => m.set(`${s}|${a}`, v),
    remove: (s, a) => m.delete(`${s}|${a}`),
  };
}

function cartellaMarker() {
  return mkdtempSync(join(tmpdir(), 'migrazione-chiavi-'));
}

test('MIGRA-01 — copia pool intero e fonte di ricerca nel `-desktop`, NON sposta, marcatore scritto, seconda chiamata no-op', async () => {
  const { m, k1, k2 } = namespaceVecchioPreparato();
  const finto = mapFinto(m);
  const cartella = cartellaMarker();
  const marker = join(cartella, '.chiavi-migrate.json');
  try {
    const esito = await migraChiaviLegacySuDesktop({ keyring: finto, markerFile: marker });
    assert.equal(esito.ok, true);
    assert.equal(esito.errori.length, 0);
    const provider = esito.migrati.find((v) => v.tipo === 'provider' && v.id === 'openrouter');
    assert.ok(provider, 'openrouter migrato');
    assert.equal(provider.chiavi, 2, 'entrambe le chiavi del pool');
    assert.ok(esito.migrati.some((v) => v.tipo === 'ricerca' && v.id === 'tavily'), 'la fonte di ricerca migrata');

    // Il namespace desktop ora ha il pool, priorità giusta al comando.
    const desktop = createProviderCredentialStore({ env: {}, keyring: avvolgiAdattatoreKeyring(finto, 'desktop') });
    desktop.loadFromKeyring();
    assert.equal(desktop.getKey('openrouter'), k1);
    assert.equal(desktop.elencaPool('openrouter').length, 2);
    const ricerca = createSearchSourceStore({ env: {}, keyring: avvolgiAdattatoreKeyring(finto, 'desktop'), file: null });
    assert.equal(ricerca.listPublic().fonti.find((f) => f.id === 'tavily')?.keyConfigured, true);

    // ⛔ COPIA, non sposta: il namespace vecchio è intatto (è dello sviluppo).
    assert.equal(m.get(`${LEGACY}|openrouter`), k1);
    assert.equal(m.get(`${POOL}|openrouter:${improntaDi(k2)}`), k2);
    assert.equal(m.get(`${RICERCA}|tavily`), 'tvly-vecchia');

    // Nessun segreto nell'esito: solo nomi e conteggi.
    assert.doesNotMatch(JSON.stringify(esito), /sk-vecchia|tvly-vecchia/);

    // Marcatore scritto: la seconda chiamata non tocca più nulla.
    assert.equal(JSON.parse(readFileSync(marker, 'utf8')).version, 1);
    const censimento = m.size;
    const seconda = await migraChiaviLegacySuDesktop({ keyring: finto, markerFile: marker });
    assert.equal(seconda.giaMigrata, true);
    assert.equal(seconda.migrati.length, 0);
    assert.equal(m.size, censimento, 'nessuna scrittura al secondo giro');
  } finally { rimuoviCartellaDiProva(cartella); }
});

test('MIGRA-02 — nessuna resurrezione né sovrascrittura: tombstone e chiavi già in custodia bloccano la copia', async () => {
  const { m, k1 } = namespaceVecchioPreparato();
  // Tombstone per openrouter (l'utente l'ha cancellata nell'app) e chiave PIÙ NUOVA per openai.
  m.set(`${INDICE + DESKTOP}|openrouter:indice`, JSON.stringify({ version: 1, chiavi: [] }));
  const nuova = 'sk-app-piu-nuova';
  m.set(`${LEGACY + DESKTOP}|openai`, nuova);
  const finto = mapFinto(m);
  const cartella = cartellaMarker();
  try {
    const esito = await migraChiaviLegacySuDesktop({ keyring: finto, markerFile: join(cartella, 'm.json') });
    assert.equal(esito.ok, true);
    assert.ok(esito.saltati.some((v) => v.tipo === 'provider' && v.id === 'openrouter' && v.motivo === 'gia in custodia'), 'il tombstone parla');
    assert.equal(m.get(`${INDICE + DESKTOP}|openrouter:indice`), JSON.stringify({ version: 1, chiavi: [] }), 'tombstone intatto');
    assert.equal([...m.keys()].some((k) => k.startsWith(`${POOL + DESKTOP}|openrouter:`)), false, 'nessuna chiave pool riscritta per il tombstone');
    assert.ok(esito.saltati.some((v) => v.tipo === 'provider' && v.id === 'openai' && v.motivo === 'gia in custodia'), 'openai già dell\'app');
    assert.equal(m.get(`${LEGACY + DESKTOP}|openai`), nuova, 'la chiave dell\'app resta quella');
    assert.ok(esito.migrati.some((v) => v.tipo === 'ricerca' && v.id === 'tavily'), 'tavily invece si copia');
    assert.doesNotMatch(JSON.stringify(esito), /sk-vecchia|sk-app-piu-nuova|tvly-vecchia/);
    // ⛔ k1 è usato solo qui per il contratto: la tombstone di openrouter vince sul namespace vecchio.
    assert.ok(k1.startsWith('sk-vecchia'));
  } finally { rimuoviCartellaDiProva(cartella); }
});

test('MIGRA-03 — portachiavi sordo in lettura: nessun successo inventato, NESSUN marcatore (il giro dopo riprova)', async () => {
  const sordo = {
    get: () => { throw new Error('portachiavi sordo'); },
    set: () => { throw new Error('portachiavi sordo'); },
    remove: () => { throw new Error('portachiavi sordo'); },
  };
  const cartella = cartellaMarker();
  const marker = join(cartella, 'm.json');
  try {
    const esito = await migraChiaviLegacySuDesktop({ keyring: sordo, markerFile: marker });
    // L'adattatore di sistema traduce ogni guasto in «assente»: qui non c'è nulla di copiabile,
    // e la migrazione DEVE restare senza marcatore invece di bruciarsi per sempre.
    assert.equal(esito.ok, true);
    assert.equal(esito.migrati.length, 0);
    assert.equal(existsSync(marker), false, 'senza nulla di deciso il marcatore non si scrive');
  } finally { rimuoviCartellaDiProva(cartella); }
});

test('MIGRA-04 — marcatore di versione straniera: la migrazione riparte (e la copia difensiva non tocca ciò che c\'è già)', async () => {
  const { m, k1 } = namespaceVecchioPreparato();
  const finto = mapFinto(m);
  const cartella = cartellaMarker();
  const marker = join(cartella, 'm.json');
  writeFileSync(marker, JSON.stringify({ version: 9 }), 'utf8');
  try {
    const esito = await migraChiaviLegacySuDesktop({ keyring: finto, markerFile: marker });
    assert.equal(esito.giaMigrata, false);
    assert.equal(esito.ok, true);
    const desktop = createProviderCredentialStore({ env: {}, keyring: avvolgiAdattatoreKeyring(finto, 'desktop') });
    desktop.loadFromKeyring();
    assert.equal(desktop.getKey('openrouter'), k1);
    assert.equal(JSON.parse(readFileSync(marker, 'utf8')).version, 1, 'marcatore riscritto nel formato vero');
  } finally { rimuoviCartellaDiProva(cartella); }
});
