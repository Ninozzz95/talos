/*
 * L3-1 (13/10/2026, bugfixer) — due PROCESSI con la stessa custodia che rinnovano insieme: la sessione buona non si butta.
 *
 * Qui i «processi» sono due `creaAccessoChatgpt` distinti (ognuno col suo `rinnovoInCorso`) sopra UNA custodia e UN OpenAI
 * finto che ruota il refresh token come quello vero: quello usato non vale più (`refresh_token_reused`).
 * Nessuna rete, nessun piano vero.
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, utimesSync, writeFileSync } from 'node:fs';
import { hostname } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { creaAccessoChatgpt } from '../src/chatgpt-accesso.mjs';
import { creaLucchettoRinnovoChatgpt, fileLucchettoRinnovoChatgpt } from '../src/chatgpt-lucchetto-rinnovo.mjs';
import { EMITTENTE, INDIRIZZO_SCOPERTA, SCOPE_RICHIESTI } from '../src/chatgpt-oauth.mjs';
import { cartellaDiProva } from './aiuto/cartelle-di-prova.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const TOKEN = `${EMITTENTE}/api/accounts/oauth/token`;
const JWKS = `${EMITTENTE}/.well-known/jwks.json`;
const REVOCA = `${EMITTENTE}/api/accounts/oauth/revoke`;
const ADESSO = 1_800_000_000_000;

function custodiaInMemoria() {
  const voci = new Map();
  return { voci, leggi: (v) => (voci.has(v) ? structuredClone(voci.get(v)) : null), scrivi: (v, o) => { voci.set(v, structuredClone(o)); }, togli: (v) => { voci.delete(v); } };
}
/** Una sessione salvata e già da rinnovare (scade fra un minuto). */
const sessioneDaRinnovare = () => ({ clientId: 'oaiapp_prova1', accessToken: 'ACCESSO-1', refreshToken: 'REFRESH-1', idToken: null,
  scadeAlle: ADESSO + 60_000, rinnovaNonPrimaDi: null, scopes: [...SCOPE_RICHIESTI] });

/**
 * OpenAI finto. Il refresh token valido è UNO: usarlo lo ruota subito (come il server vero), la risposta può tardare.
 * `prima(n)` è atteso PRIMA di guardare il token dell'n-esimo rinnovo; `dopo(n)` DOPO averlo ruotato, prima di rispondere.
 */
function openAiFinto({ prima = () => null, dopo = () => null } = {}) {
  let valido = 'REFRESH-1'; let giro = 1; let n = 0;
  const rinnovi = []; const revocati = [];
  const json = (stato, corpo) => ({ ok: stato >= 200 && stato < 300, status: stato, json: async () => corpo });
  const fetchDiRete = async (indirizzo, opzioni = {}) => {
    if (indirizzo === INDIRIZZO_SCOPERTA) return json(200, { issuer: EMITTENTE, token_endpoint: TOKEN, jwks_uri: JWKS, revocation_endpoint: REVOCA });
    if (indirizzo === REVOCA) { revocati.push(new URLSearchParams(opzioni.body).get('token')); return json(200, {}); }
    if (indirizzo === TOKEN) {
      const mio = (n += 1);
      const mandato = new URLSearchParams(opzioni.body).get('refresh_token');
      rinnovi.push(mandato);
      await prima(mio);
      if (mandato !== valido) return json(400, { error: 'refresh_token_reused' });
      giro += 1; valido = `REFRESH-${giro}`;
      const risposta = { access_token: `ACCESSO-${giro}`, refresh_token: valido, token_type: 'Bearer', expires_in: 3600, scope: SCOPE_RICHIESTI.join(' ') };
      await dopo(mio);
      return json(200, risposta);
    }
    throw new Error(`rete finta: ${indirizzo}`);
  };
  return { fetchDiRete, rinnovi, revocati };
}
const cancello = () => { let apri; const attesa = new Promise((r) => { apri = r; }); return { attesa, apri }; };
const processo = (custodia, rete, altro = {}) => creaAccessoChatgpt({ custodia, fetchDiRete: rete.fetchDiRete, clock: () => ADESSO, ...altro });
const unAttimo = () => new Promise((r) => setTimeout(r, 30));

test('L3-1-01: the other process renewed first — the refused renewal re-reads the keyring and uses that session instead of removing it', async () => {
  const custodia = custodiaInMemoria(); custodia.scrivi('sessione', sessioneDaRinnovare());
  const fermo = cancello();
  /* il rinnovo n.1 (del processo B) resta fermo PRIMA che OpenAI guardi il suo token: intanto A rinnova e salva */
  const rete = openAiFinto({ prima: (n) => (n === 1 ? fermo.attesa : null) });
  const a = processo(custodia, rete); const b = processo(custodia, rete);
  const diB = b.tokenDiAccesso();
  await unAttimo();
  assert.equal(await a.tokenDiAccesso(), 'ACCESSO-2');
  assert.equal(custodia.leggi('sessione').refreshToken, 'REFRESH-2');
  fermo.apri(); // ora OpenAI risponde a B: «quel refresh token è già stato usato»
  assert.equal(await diB, 'ACCESSO-2', 'B uses the session A just stored');
  assert.deepEqual(rete.rinnovi, ['REFRESH-1', 'REFRESH-1'], 'il controllo positivo: B ha davvero mandato il token già usato');
  assert.equal(custodia.leggi('sessione')?.refreshToken, 'REFRESH-2', 'the good session is still there');
  assert.deepEqual(rete.revocati, [], 'nothing is revoked');
});

test('L3-1-02: the other way round — refused and NOBODY renewed: the session is over and is removed, as before', async () => {
  const custodia = custodiaInMemoria(); custodia.scrivi('sessione', { ...sessioneDaRinnovare(), refreshToken: 'REFRESH-VECCHIO' });
  const rete = openAiFinto();
  await assert.rejects(() => processo(custodia, rete).tokenDiAccesso(), (e) => e.code === 'CHATGPT_ACCESSO_SCADUTO');
  assert.equal(custodia.leggi('sessione'), null);
});

test('L3-1-03: the hard order — B is refused BEFORE A has stored: with the lock between processes B waits, then uses A’s session', async () => {
  const cartella = cartellaDiProva('talos-l3-1-');
  try {
    const custodia = custodiaInMemoria(); custodia.scrivi('sessione', sessioneDaRinnovare());
    const fermo = cancello();
    /* il rinnovo n.1 (di A) è già RUOTATO da OpenAI ma la risposta tarda: chi manda REFRESH-1 adesso viene rifiutato */
    const rete = openAiFinto({ dopo: (n) => (n === 1 ? fermo.attesa : null) });
    const file = join(cartella, 'chatgpt-rinnovo.lock');
    const lucchetto = () => creaLucchettoRinnovoChatgpt({ file, riprovaMs: 5 });
    const a = processo(custodia, rete, { conLucchettoDiRinnovo: lucchetto() });
    const b = processo(custodia, rete, { conLucchettoDiRinnovo: lucchetto() });
    const diA = a.tokenDiAccesso();
    await unAttimo();
    assert.equal(existsSync(file), true, 'A holds the lock while its renewal travels');
    const diB = b.tokenDiAccesso();
    await unAttimo();
    assert.deepEqual(rete.rinnovi, ['REFRESH-1'], 'B has not sent anything: it is waiting for A');
    fermo.apri();
    assert.deepEqual(await Promise.all([diA, diB]), ['ACCESSO-2', 'ACCESSO-2']);
    assert.deepEqual(rete.rinnovi, ['REFRESH-1'], 'one renewal for two processes');
    assert.equal(custodia.leggi('sessione')?.refreshToken, 'REFRESH-2');
    assert.deepEqual(rete.revocati, []);
    assert.equal(existsSync(file), false, 'the lock is released');
  } finally { await rimuoviCartellaDiProva(cartella); }
});

test('L3-1-05: three REAL processes on the same lock file never work at the same time; the lock path is per user and per keyring scope', async () => {
  const cartella = cartellaDiProva('talos-l3-1-');
  try {
    const file = join(cartella, 'chatgpt-rinnovo.lock'); const diario = join(cartella, 'diario.txt');
    const figlio = fileURLToPath(new URL('./aiuto/figlio-lucchetto-rinnovo.mjs', import.meta.url));
    const uscite = await Promise.all(['a', 'b', 'c'].map((nome) => new Promise((fatto) => {
      const p = spawn(process.execPath, [figlio, file, diario, nome, '120'], { stdio: 'ignore' });
      p.on('exit', (codice) => fatto(codice));
    })));
    assert.deepEqual(uscite, [0, 0, 0]);
    const righe = readFileSync(diario, 'utf8').trim().split('\n');
    assert.equal(righe.length, 6);
    for (let i = 0; i < 6; i += 2) {
      assert.match(righe[i], / inizio$/u);
      assert.equal(righe[i + 1], righe[i].replace(' inizio', ' fine'), `nessuno comincia mentre un altro lavora: ${righe.join(' · ')}`);
    }
    assert.equal(existsSync(file), false);
  } finally { await rimuoviCartellaDiProva(cartella); }
  const win = (scope) => fileLucchettoRinnovoChatgpt({ env: { LOCALAPPDATA: 'C:\\Users\\x\\AppData\\Local' }, platform: 'win32', home: 'C:\\Users\\x', scope });
  assert.equal(win(null), join('C:\\Users\\x\\AppData\\Local', 'TALOS', 'locks', 'chatgpt-renewal.lock'));
  assert.equal(win('desktop'), join('C:\\Users\\x\\AppData\\Local', 'TALOS', 'locks', 'chatgpt-renewal-desktop.lock'));
  assert.equal(win('../fuori'), win(null), 'uno scope strano non esce dalla cartella');
  assert.equal(fileLucchettoRinnovoChatgpt({ env: {}, platform: 'linux', home: '/home/x', scope: null }), join('/home/x', '.cache', 'TALOS', 'locks', 'chatgpt-renewal.lock'));
});

test('L3-1-04: the lock itself — an abandoned one is taken, a held one times out as «try again», a broken folder lets the work through', async () => {
  const cartella = cartellaDiProva('talos-l3-1-');
  try {
    const file = join(cartella, 'giu', 'chatgpt-rinnovo.lock');
    mkdirSync(join(cartella, 'giu'), { recursive: true });
    /* (a) lasciato da un processo che su questo host non esiste più: si prende subito */
    writeFileSync(file, JSON.stringify({ pid: 4_000_000, host: hostname(), at: Date.now(), token: 'morto' }));
    assert.equal(await creaLucchettoRinnovoChatgpt({ file, riprovaMs: 5, processoVivo: () => false })(async () => 'fatto'), 'fatto');
    assert.equal(existsSync(file), false);
    /* (b) tenuto da un processo VIVO e fresco: oltre l'attesa è un rinnovo non riuscito (riprovabile), e il file NON si tocca */
    writeFileSync(file, JSON.stringify({ pid: process.pid, host: hostname(), at: Date.now(), token: 'vivo' }));
    let eseguito = false;
    await assert.rejects(() => creaLucchettoRinnovoChatgpt({ file, riprovaMs: 5, attesaMs: 60 })(async () => { eseguito = true; }), (e) => e.code === 'CHATGPT_RINNOVO_FALLITO');
    assert.equal(eseguito, false); assert.equal(existsSync(file), true);
    /* (c) lo stesso, ma VECCHIO oltre la scadenza (pid riusato da un altro programma): si prende */
    const ieri = new Date(Date.now() - 3_600_000); utimesSync(file, ieri, ieri);
    assert.equal(await creaLucchettoRinnovoChatgpt({ file, riprovaMs: 5, attesaMs: 2_000 })(async () => 'ripreso'), 'ripreso');
    /* (d) il meccanismo non funziona (il «file» sta sotto un FILE): il lavoro passa lo stesso */
    writeFileSync(join(cartella, 'non-una-cartella'), 'x');
    assert.equal(await creaLucchettoRinnovoChatgpt({ file: join(cartella, 'non-una-cartella', 'x.lock'), riprovaMs: 5, attesaMs: 60 })(async () => 'passa'), 'passa');
    /* (e) un lavoro che lancia rilascia il lucchetto */
    const libero = join(cartella, 'libero.lock');
    await assert.rejects(() => creaLucchettoRinnovoChatgpt({ file: libero })(async () => { throw new Error('giù'); }), /giù/u);
    assert.equal(existsSync(libero), false);
    /* (f) se mentre lavoravo il lucchetto è passato a un altro (scaduto e ripreso), al rilascio NON tolgo il suo */
    await creaLucchettoRinnovoChatgpt({ file: libero })(async () => { writeFileSync(libero, JSON.stringify({ pid: process.pid, host: hostname(), at: Date.now(), token: 'di-un-altro' })); });
    assert.equal(existsSync(libero), true);
  } finally { await rimuoviCartellaDiProva(cartella); }
});
