import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import test from 'node:test';

import { creaAccessoChatgpt, creaAscoltatoreLocale } from '../src/chatgpt-accesso.mjs';
import { EMITTENTE, INDIRIZZO_SCOPERTA, SCOPE_RICHIESTI } from '../src/chatgpt-oauth.mjs';

/*
 * «Continue with ChatGPT» (11/10/2026) — l'accesso dall'inizio alla fine, senza OpenAI: una rete finta che risponde come quella
 * vera (forme prese dalla prova dal vivo dell'11/10, PIANO §10), un ascolto finto, una custodia in memoria.
 */
const CLIENT = 'oaiapp_prova1';
const TOKEN = `${EMITTENTE}/api/accounts/oauth/token`;
const JWKS = `${EMITTENTE}/.well-known/jwks.json`;
const REVOCA = `${EMITTENTE}/api/accounts/oauth/revoke`;
const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const idToken = (corpo) => { const d = `${b64({ alg: 'RS256', kid: 'k1' })}.${b64(corpo)}`; return `${d}.${sign('sha256', Buffer.from(d), privateKey).toString('base64url')}`; };

function custodiaInMemoria() {
  const voci = new Map();
  return { voci, leggi: (v) => (voci.has(v) ? structuredClone(voci.get(v)) : null), scrivi: (v, o) => { voci.set(v, structuredClone(o)); }, togli: (v) => { voci.delete(v); } };
}
function ascoltoFinto() {
  let arriva; const risposte = []; let chiuso = false;
  return { porta: 50123, ritorno: new Promise((r) => { arriva = r; }), rispondi: (stato, html) => risposte.push({ stato, html }), chiudi: () => { chiuso = true; },
    arriva: (indirizzo, lingua = 'en') => arriva({ indirizzo, lingua }), risposte, get chiuso() { return chiuso; } };
}
/** La rete finta: scoperta, JWKS, token (scambio e rinnovo), revoca. `piano` decide che cosa risponde l'endpoint dei token. */
function rete({ ora, sub = 'utente-1', scope = SCOPE_RICHIESTI.join(' '), piano = {} } = {}) {
  const chiamate = [];
  let nonce = null; let giro = 0;
  const fetchDiRete = async (indirizzo, opzioni = {}) => {
    chiamate.push({ indirizzo, corpo: opzioni.body ?? null });
    const json = (stato, corpo) => ({ ok: stato >= 200 && stato < 300, status: stato, json: async () => corpo });
    if (indirizzo === INDIRIZZO_SCOPERTA) return json(200, { issuer: EMITTENTE, token_endpoint: TOKEN, jwks_uri: JWKS, revocation_endpoint: REVOCA });
    if (indirizzo === JWKS) return json(200, { keys: [{ ...publicKey.export({ format: 'jwk' }), kid: 'k1', use: 'sig', alg: 'RS256' }] });
    if (indirizzo === REVOCA) { if (piano.revoca === 'rete') throw new Error('giù'); return json(piano.revoca ?? 200, {}); }
    if (indirizzo === TOKEN) {
      const corpo = new URLSearchParams(opzioni.body);
      if (piano.token === 'rete') throw new Error('giù');
      if (piano.token) return json(piano.token.stato, { error: piano.token.errore });
      giro += 1;
      if (piano.lento) await piano.lento;
      return json(200, { access_token: `ACCESSO-${giro}`, refresh_token: `REFRESH-${giro}`, token_type: 'Bearer', expires_in: 3600, scope,
        id_token: idToken({ iss: EMITTENTE, aud: corpo.get('client_id'), exp: ora() / 1000 + 600, nonce, sub, email: 'nino@example.com' }) });
    }
    throw new Error(`rete finta: ${indirizzo}`);
  };
  return { fetchDiRete, chiamate, usaNonce: (n) => { nonce = n; } };
}
async function accedi({ custodia = custodiaInMemoria(), ora = () => 1_800_000_000_000, r = rete({ ora }), ritorno = {}, lingua = 'en' } = {}) {
  const ascolto = ascoltoFinto();
  const accesso = creaAccessoChatgpt({ custodia, fetchDiRete: r.fetchDiRete, clock: ora, creaAscoltatore: async () => ascolto, pianifica: () => 0, annulla: () => {} });
  const avviato = await accesso.inizia();
  const p = new URL(avviato.indirizzo).searchParams;
  r.usaNonce(p.get('nonce'));
  const q = new URLSearchParams({ state: p.get('state'), code: 'CODICE', scope: SCOPE_RICHIESTI.join(' '), ...(p.get('client_id') === 'dynamic_agent_client' ? { client_id: CLIENT } : {}), ...ritorno });
  for (const [k, v] of Object.entries(ritorno)) if (v === null) q.delete(k);
  ascolto.arriva(`/auth/callback?${q}`, lingua);
  return { accesso, custodia, ascolto, r, avviato, esito: await avviato.esito, parametri: p };
}

test('ACCESSO-01 — the first sign-in: registers, exchanges, verifies the identity, stores, and the browser page tells the truth', async () => {
  const { accesso, custodia, ascolto, r, esito, parametri } = await accedi();
  assert.deepEqual(esito, { ok: true, email: 'nino@example.com', pianoAbilitato: true });
  assert.equal(parametri.get('client_id'), 'dynamic_agent_client');
  assert.equal(parametri.get('redirect_uri'), 'http://127.0.0.1:50123/auth/callback');
  const reg = custodia.leggi('registrazione');
  assert.equal(reg.clientId, CLIENT);
  assert.equal(reg.idDellHost, parametri.get('ext_agent_host_id'));
  assert.equal(reg.sub, 'utente-1');
  assert.equal(custodia.leggi('sessione').refreshToken, 'REFRESH-1');
  const scambio = new URLSearchParams(r.chiamate.find((c) => c.indirizzo === TOKEN).corpo);
  assert.equal(scambio.get('client_id'), CLIENT);
  assert.equal(scambio.get('redirect_uri'), 'http://127.0.0.1:50123/auth/callback');
  assert.equal(ascolto.risposte.length, 1);
  assert.equal(ascolto.risposte[0].stato, 200);
  assert.match(ascolto.risposte[0].html, /ChatGPT account connected/u);
  assert.match(ascolto.risposte[0].html, /Signed in as nino@example\.com/u);
  assert.equal(ascolto.chiuso, true, 'the listener does not outlive the sign-in');
  const stato = accesso.stato();
  assert.deepEqual({ collegato: stato.collegato, email: stato.email, pianoAbilitato: stato.pianoAbilitato, accessoInCorso: stato.accessoInCorso },
    { collegato: true, email: 'nino@example.com', pianoAbilitato: true, accessoInCorso: false });
  assert.equal(JSON.stringify(stato).includes('ACCESSO-1') || JSON.stringify(stato).includes('REFRESH-1'), false, 'the state never carries a token');
});

test('ACCESSO-02 — a returning sign-in uses the saved client and host id, and refuses another account', async () => {
  const primo = await accedi();
  const hostId = primo.custodia.leggi('registrazione').idDellHost;
  const secondo = await accedi({ custodia: primo.custodia });
  assert.equal(secondo.parametri.get('client_id'), CLIENT);
  assert.equal(secondo.parametri.get('ext_agent_host_id'), hostId);
  assert.equal(secondo.parametri.has('agent_name_hint'), false);
  assert.equal(secondo.parametri.get('login_hint'), 'nino@example.com');
  assert.ok(secondo.parametri.get('id_token_hint'));
  assert.equal(secondo.esito.ok, true, 'the callback of a returning sign-in carries no client id');
  const ora = () => 1_800_000_000_000;
  const altro = await accedi({ custodia: primo.custodia, r: rete({ ora, sub: 'utente-2' }) });
  assert.deepEqual({ ok: altro.esito.ok, codice: altro.esito.codice }, { ok: false, codice: 'CHATGPT_ALTRO_ACCOUNT' });
  assert.equal(primo.custodia.leggi('sessione').sub, 'utente-1', 'the session of the first account is untouched');
  assert.match(altro.ascolto.risposte[0].html, /different ChatGPT account/u);
});

test('ACCESSO-03 — what goes wrong is said, in the language of the browser, and nothing is stored', async () => {
  const ora = () => 1_800_000_000_000;
  const casi = [
    [{ ritorno: { state: 'ALTRO' } }, 'CHATGPT_STATO_DIVERSO', /does not belong/u],
    [{ ritorno: { error: 'access_denied', code: null } }, 'CHATGPT_ACCESSO_NEGATO', /cancelled/u],
    [{ r: rete({ ora, piano: { token: { stato: 400, errore: 'invalid_grant' } } }) }, 'CHATGPT_SCAMBIO_RIFIUTATO', /Plus or Pro/u],
    [{ r: rete({ ora, piano: { token: 'rete' } }) }, 'CHATGPT_RETE', /could not reach OpenAI/u],
    [{ r: rete({ ora, piano: { token: { stato: 503, errore: 'server_error' } } }) }, 'CHATGPT_RETE', /could not reach OpenAI/u],
  ];
  for (const [opzioni, codice, frase] of casi) {
    const { esito, custodia, ascolto } = await accedi(opzioni);
    assert.equal(esito.ok, false);
    assert.equal(esito.codice, codice);
    assert.equal(custodia.leggi('sessione'), null, codice);
    assert.equal(custodia.leggi('registrazione').clientId, undefined, 'no client is saved from a failed first sign-in');
    assert.ok(custodia.leggi('registrazione').idDellHost, 'the host id is kept from the first request');
    assert.equal(ascolto.risposte[0].stato, 400);
    assert.match(ascolto.risposte[0].html, frase);
    assert.equal(ascolto.chiuso, true);
  }
  const it = await accedi({ ritorno: { error: 'access_denied', code: null }, lingua: 'it' });
  assert.match(it.ascolto.risposte[0].html, /L’accesso è stato annullato\./u);
  assert.match(it.ascolto.risposte[0].html, /<html lang="it">/u);
  // an identity signed for another sign-in (wrong nonce) is not accepted
  const r = rete({ ora });
  const ascolto = ascoltoFinto(); const custodia = custodiaInMemoria();
  const accesso = creaAccessoChatgpt({ custodia, fetchDiRete: r.fetchDiRete, clock: ora, creaAscoltatore: async () => ascolto, pianifica: () => 0, annulla: () => {} });
  const avviato = await accesso.inizia();
  r.usaNonce('UN-ALTRO-NONCE');
  ascolto.arriva(`/auth/callback?${new URLSearchParams({ state: new URL(avviato.indirizzo).searchParams.get('state'), code: 'C', client_id: CLIENT })}`);
  assert.equal((await avviato.esito).codice, 'CHATGPT_ID_TOKEN_NON_VALIDO');
  assert.equal(custodia.leggi('sessione'), null);
});

test('ACCESSO-04 — signed in without the plan scope: the session is kept, inference on this path is refused', async () => {
  const ora = () => 1_800_000_000_000;
  const { accesso, esito, ascolto } = await accedi({ r: rete({ ora, scope: 'openid profile email offline_access' }) });
  assert.deepEqual(esito, { ok: true, email: 'nino@example.com', pianoAbilitato: false });
  assert.match(ascolto.risposte[0].html, /not enabled/u);
  assert.equal(accesso.stato().collegato, true);
  assert.equal(accesso.stato().pianoAbilitato, false);
  await assert.rejects(accesso.tokenDiAccesso(), (e) => e.code === 'CHATGPT_PIANO_NON_ABILITATO');
});

test('ACCESSO-05 — the token is renewed five minutes early, once for everybody who asks at the same time', async () => {
  let adesso = 1_800_000_000_000;
  const ora = () => adesso;
  let sblocca; const lento = new Promise((r) => { sblocca = r; });
  const piano = {};
  const r = rete({ ora, piano });
  const { accesso, custodia } = await accedi({ ora, r });
  assert.equal(await accesso.tokenDiAccesso(), 'ACCESSO-1');
  assert.equal(r.chiamate.filter((c) => c.indirizzo === TOKEN).length, 1, 'a valid token needs no request');
  adesso += 3600_000 - 4 * 60_000; // four minutes before the expiry
  piano.lento = lento;
  const insieme = [accesso.tokenDiAccesso(), accesso.tokenDiAccesso(), accesso.tokenDiAccesso()];
  sblocca();
  assert.deepEqual(await Promise.all(insieme), ['ACCESSO-2', 'ACCESSO-2', 'ACCESSO-2']);
  const rinnovi = r.chiamate.filter((c) => c.indirizzo === TOKEN && new URLSearchParams(c.corpo).get('grant_type') === 'refresh_token');
  assert.equal(rinnovi.length, 1, 'one renewal for three callers: the refresh token rotates');
  assert.equal(new URLSearchParams(rinnovi[0].corpo).get('refresh_token'), 'REFRESH-1');
  assert.equal(custodia.leggi('sessione').refreshToken, 'REFRESH-2', 'the rotated refresh token is the one stored');
  piano.lento = null;
  assert.equal(await accesso.tokenDiAccesso(), 'ACCESSO-2');
});

test('ACCESSO-06 — a renewal that is over removes the session; a network failure keeps a token that is still good', async () => {
  let adesso = 1_800_000_000_000;
  const ora = () => adesso;
  const piano = {};
  const r = rete({ ora, piano });
  const { accesso, custodia } = await accedi({ ora, r });
  adesso += 3600_000 - 60_000;
  piano.token = 'rete';
  assert.equal(await accesso.tokenDiAccesso(), 'ACCESSO-1', 'the network is down but the token is valid for another minute');
  assert.ok(custodia.leggi('sessione'));
  adesso += 120_000; // now expired
  await assert.rejects(accesso.tokenDiAccesso(), (e) => e.code === 'CHATGPT_RETE');
  assert.ok(custodia.leggi('sessione'), 'a network failure never signs the person out');
  piano.token = { stato: 500, errore: 'server_error' };
  await assert.rejects(accesso.tokenDiAccesso(), (e) => e.code === 'CHATGPT_RINNOVO_FALLITO');
  assert.ok(custodia.leggi('sessione'));
  for (const codice of ['invalid_grant', 'refresh_token_reused', 'refresh_token_expired']) {
    custodia.scrivi('sessione', { ...custodia.leggi('sessione') });
    piano.token = { stato: 400, errore: codice };
    await assert.rejects(accesso.tokenDiAccesso(), (e) => e.code === 'CHATGPT_ACCESSO_SCADUTO' && !/REFRESH|ACCESSO-\d/u.test(e.message));
    assert.equal(custodia.leggi('sessione'), null, codice);
    assert.ok(custodia.leggi('registrazione').clientId, 'the registration survives');
    await assert.rejects(accesso.tokenDiAccesso(), (e) => e.code === 'CHATGPT_NON_COLLEGATO');
    custodia.scrivi('sessione', { clientId: CLIENT, sub: 'utente-1', accessToken: 'A', refreshToken: 'R', idToken: 'I', scadeAlle: adesso - 1, scopes: [...SCOPE_RICHIESTI] });
  }
});

test('ACCESSO-07 — signing out revokes and removes the session, keeps the registration, and says when the revocation is not confirmed', async () => {
  const ora = () => 1_800_000_000_000;
  for (const [revoca, confermata] of [[200, true], [500, false], ['rete', false]]) {
    const r = rete({ ora, piano: { revoca } });
    const { accesso, custodia } = await accedi({ ora, r });
    assert.deepEqual(await accesso.esci(), { revocaConfermata: confermata });
    assert.equal(custodia.leggi('sessione'), null, 'the tokens go in every case');
    assert.equal(custodia.leggi('registrazione').clientId, CLIENT);
    const chiamata = r.chiamate.find((c) => c.indirizzo === REVOCA);
    assert.deepEqual(Object.fromEntries(new URLSearchParams(chiamata.corpo)), { token: 'REFRESH-1', token_type_hint: 'refresh_token', client_id: CLIENT });
    assert.equal(accesso.stato().collegato, false);
  }
  const vuoto = creaAccessoChatgpt({ custodia: custodiaInMemoria(), fetchDiRete: async () => { throw new Error('nessuna rete attesa'); } });
  assert.deepEqual(await vuoto.esci(), { revocaConfermata: false });
});

test('ACCESSO-08 — a second attempt closes the first; the attempt expires and frees its port', async () => {
  const ascolti = [];
  const timer = [];
  const accesso = creaAccessoChatgpt({ custodia: custodiaInMemoria(), fetchDiRete: rete({ ora: () => 1 }).fetchDiRete,
    creaAscoltatore: async () => { const a = ascoltoFinto(); ascolti.push(a); return a; }, pianifica: (fn, ms) => { timer.push({ fn, ms }); return timer.length; }, annulla: () => {} });
  await accesso.inizia();
  assert.equal(accesso.stato().accessoInCorso, true);
  await accesso.inizia();
  assert.equal(ascolti[0].chiuso, true, 'the first listener is closed by the second attempt');
  assert.equal(ascolti[1].chiuso, false);
  assert.equal(timer.at(-1).ms, 10 * 60 * 1000);
  timer.at(-1).fn();
  assert.equal(ascolti[1].chiuso, true, 'the attempt expires');
  assert.equal(accesso.stato().accessoInCorso, false);
  timer[0].fn(); // the old timer fires late: it must not close anything new
  await accesso.inizia();
  timer[1].fn();
  assert.equal(ascolti[2].chiuso, false, 'an old timer does not close a new attempt');
  accesso.annulla();
  assert.equal(ascolti[2].chiuso, true);
});

test('ACCESSO-09 — the real listener: 127.0.0.1 only, the callback path only, one answer, then closed', async () => {
  const a = await creaAscoltatoreLocale();
  const base = `http://127.0.0.1:${a.porta}`;
  assert.equal((await fetch(`${base}/altro`)).status, 404);
  assert.equal((await fetch(`${base}/auth/callback`, { method: 'POST' })).status, 404);
  const prima = fetch(`${base}/auth/callback?code=C&state=S`, { headers: { 'accept-language': 'it-IT,it;q=0.9' } });
  const arrivato = await a.ritorno;
  assert.deepEqual(arrivato, { indirizzo: '/auth/callback?code=C&state=S', lingua: 'it' });
  assert.equal((await fetch(`${base}/auth/callback?code=ALTRO&state=S`)).status, 410, 'a second callback is not accepted');
  a.rispondi(200, '<p>ok</p>', { 'Cache-Control': 'no-store' });
  const risposta = await prima;
  assert.equal(risposta.status, 200);
  assert.equal(await risposta.text(), '<p>ok</p>');
  a.chiudi();
  await assert.rejects(fetch(`${base}/auth/callback`), TypeError);
});

test('ACCESSO-10 — if the keyring refuses the tokens, the browser page says the sign-in failed, never «connected»', async () => {
  const custodia = custodiaInMemoria();
  const scrivi = custodia.scrivi;
  custodia.scrivi = (voce, oggetto) => { if (voce === 'sessione') throw new Error('keyring down'); scrivi(voce, oggetto); };
  const { esito, ascolto } = await accedi({ custodia });
  assert.deepEqual({ ok: esito.ok, codice: esito.codice }, { ok: false, codice: 'CHATGPT_CUSTODIA_FALLITA' });
  assert.equal(ascolto.risposte.length, 1);
  assert.equal(ascolto.risposte[0].stato, 400);
  assert.match(ascolto.risposte[0].html, /could not be stored safely/u);
  assert.equal(/ChatGPT account connected/u.test(ascolto.risposte[0].html), false);
  assert.equal(custodia.leggi('sessione'), null);
});

/*
 * ACCESSO-11/12 (11/10/2026 sera, review avversaria del ramo) — CHI ESCE O ANNULLA NON SI RITROVA COLLEGATO.
 *   Il rinnovo e lo scambio durano il tempo di una richiesta a OpenAI. Se in quel tempo la persona scollega (o annulla il
 *   tentativo), al ritorno il codice salvava lo stesso la sessione: scollegata a schermo, collegata nel portachiavi, con un refresh
 *   token NUOVO (quello revocato da `esci` era il vecchio: ruota a ogni uso). ⇒ Prima di salvare si guarda che la sessione sia ancora
 *   quella di partenza; se non lo è, niente si salva e il token appena nato si revoca.
 */
test('ACCESSO-11 — signing out while a renewal is on the way stays signed out, and the token just issued is revoked', async () => {
  let adesso = 1_800_000_000_000;
  const ora = () => adesso;
  let sblocca; const lento = new Promise((r) => { sblocca = r; });
  const piano = {};
  const r = rete({ ora, piano });
  const { accesso, custodia } = await accedi({ ora, r });
  adesso += 3600_000 - 4 * 60_000;
  piano.lento = lento;
  const rinnovo = accesso.tokenDiAccesso();
  rinnovo.catch(() => {});
  await new Promise((ok) => setImmediate(ok)); // the renewal request has left
  piano.lento = null;
  assert.deepEqual(await accesso.esci(), { revocaConfermata: true });
  sblocca();
  await assert.rejects(rinnovo, (e) => e.code === 'CHATGPT_NON_COLLEGATO');
  assert.equal(custodia.leggi('sessione'), null, 'the session does not come back');
  assert.equal(accesso.stato().collegato, false);
  const revocati = r.chiamate.filter((c) => c.indirizzo === REVOCA).map((c) => new URLSearchParams(c.corpo).get('token'));
  assert.deepEqual(revocati.sort(), ['REFRESH-1', 'REFRESH-2'], 'the old one by the sign-out, the new one because nobody will ever use it');
  await assert.rejects(() => accesso.tokenDiAccesso(), (e) => e.code === 'CHATGPT_NON_COLLEGATO');
});

test('ACCESSO-12 — cancelling while the code is being exchanged stores nothing and the page does not say «connected»', async () => {
  const ora = () => 1_800_000_000_000;
  let sblocca; const lento = new Promise((r) => { sblocca = r; });
  const piano = { lento };
  const r = rete({ ora, piano });
  const custodia = custodiaInMemoria();
  const ascolto = ascoltoFinto();
  const accesso = creaAccessoChatgpt({ custodia, fetchDiRete: r.fetchDiRete, clock: ora, creaAscoltatore: async () => ascolto, pianifica: () => 0, annulla: () => {} });
  const avviato = await accesso.inizia();
  const p = new URL(avviato.indirizzo).searchParams;
  r.usaNonce(p.get('nonce'));
  ascolto.arriva(`/auth/callback?${new URLSearchParams({ state: p.get('state'), code: 'CODICE', scope: SCOPE_RICHIESTI.join(' '), client_id: CLIENT })}`);
  await new Promise((ok) => setImmediate(ok));
  await new Promise((ok) => setImmediate(ok)); // the exchange request has left
  accesso.annulla();
  sblocca();
  const esito = await avviato.esito;
  assert.equal(esito.ok, false);
  assert.equal(esito.codice, 'CHATGPT_ACCESSO_ANNULLATO');
  assert.equal(custodia.leggi('sessione'), null);
  assert.equal(accesso.stato().collegato, false);
  assert.equal(ascolto.risposte.some((x) => x.stato === 200), false, 'never the «connected» page');
  assert.ok(r.chiamate.some((c) => c.indirizzo === REVOCA && new URLSearchParams(c.corpo).get('token') === 'REFRESH-1'), 'the token just issued is revoked');
});
