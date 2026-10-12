import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import test from 'node:test';

import {
  CLIENT_DI_REGISTRAZIONE, EMITTENTE, MARGINE_DI_RINNOVO_MS, PERCORSO_RITORNO, RISORSA, SCOPE_DEL_PIANO, SCOPE_RICHIESTI,
  clientIdEmesso, corpoDelRinnovo, corpoDelloScambio, creaNonce, indirizzoDiAutorizzazione, indirizzoDiRitorno, leggiRispostaToken, leggiRitorno,
  nuovoIdDellHost, pianoAbilitato, quandoRinnovare, rinnovoDefinitivamenteFallito, verificaIdToken,
} from '../src/chatgpt-oauth.mjs';

/*
 * «Continue with ChatGPT» (D9, 11/10/2026) — i conti dell'accesso, provati SENZA rete.
 * ⛔ Ogni prova esiste anche al verso contrario: il ritorno cattivo, il token firmato da un altro, il rinnovo finito.
 */

const CLIENT = 'oaiapp_abc123';
const HOST = 'urn:uuid:11111111-2222-4333-8444-555555555555';
const base = { idDellHost: HOST, ritorno: 'http://127.0.0.1:50123/auth/callback', stato: 'STATO', nonce: 'NONCE', challenge: 'SFIDA' };
const codice = (fn) => { try { fn(); } catch (e) { return e.code; } return null; };

test('CHATGPT-01 — the first sign-in registers the app, later sign-ins use the issued client', () => {
  const prima = new URL(indirizzoDiAutorizzazione(base));
  assert.equal(`${prima.origin}${prima.pathname}`, 'https://auth.openai.com/api/accounts/authorize');
  const p = Object.fromEntries(prima.searchParams);
  assert.deepEqual(p, { client_id: CLIENT_DI_REGISTRAZIONE, agent_name_hint: 'TALOS', ext_agent_host_id: HOST, response_type: 'code',
    redirect_uri: base.ritorno, scope: 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct', resource: RISORSA,
    state: 'STATO', nonce: 'NONCE', code_challenge: 'SFIDA', code_challenge_method: 'S256' });
  const dopo = Object.fromEntries(new URL(indirizzoDiAutorizzazione({ ...base, clientId: CLIENT, idTokenPrecedente: 'a.b.c', email: 'x@y.z' })).searchParams);
  assert.equal(dopo.client_id, CLIENT);
  assert.equal('agent_name_hint' in dopo, false, 'a returning sign-in does not send the name hint');
  assert.equal(dopo.id_token_hint, 'a.b.c');
  assert.equal(dopo.login_hint, 'x@y.z');
  assert.equal(dopo.ext_agent_host_id, HOST);
  assert.equal('prompt' in dopo, false, 'consent is never forced on an ordinary sign-in');
  assert.equal(new URL(indirizzoDiAutorizzazione({ ...base, clientId: CLIENT, consenso: true })).searchParams.get('prompt'), 'consent');
  // the other way round
  assert.equal(new URL(indirizzoDiAutorizzazione({ ...base, idTokenPrecedente: 'a.b.c', email: 'x@y.z' })).searchParams.has('id_token_hint'), false,
    'hints are for a registered client only');
  assert.equal(codice(() => indirizzoDiAutorizzazione({ ...base, clientId: CLIENT_DI_REGISTRAZIONE })), 'CHATGPT_CLIENT_NON_VALIDO', 'the placeholder is never a saved id');
  assert.equal(codice(() => indirizzoDiAutorizzazione({ ...base, nonce: '' })), 'CHATGPT_RICHIESTA_INCOMPLETA');
  assert.deepEqual([...SCOPE_RICHIESTI].at(-1), SCOPE_DEL_PIANO);
});

test('CHATGPT-02 — the callback is always 127.0.0.1 with a fixed path; only the port changes', () => {
  assert.equal(indirizzoDiRitorno(50123), 'http://127.0.0.1:50123/auth/callback');
  assert.equal(PERCORSO_RITORNO, '/auth/callback');
  for (const porta of [0, -1, 70000, 1.5, '80', null]) assert.equal(codice(() => indirizzoDiRitorno(porta)), 'CHATGPT_PORTA_NON_VALIDA', String(porta));
  assert.match(nuovoIdDellHost(), /^urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u);
  assert.notEqual(nuovoIdDellHost(), nuovoIdDellHost());
  assert.equal(creaNonce({ random: (n) => Buffer.alloc(n, 1) }).length, 43);
});

test('CHATGPT-03 — reading the callback: state first, then errors, code and client id', () => {
  const r = (q) => `/auth/callback?${new URLSearchParams(q)}`;
  assert.deepEqual(leggiRitorno(r({ state: 'STATO', code: 'C', client_id: CLIENT, scope: 'openid chatgpt.tokens.use.direct' }), { statoAtteso: 'STATO' }),
    { codice: 'C', clientId: CLIENT, scopes: ['openid', 'chatgpt.tokens.use.direct'] });
  // a returning sign-in may omit the client id
  assert.equal(leggiRitorno(r({ state: 'STATO', code: 'C' }), { statoAtteso: 'STATO', clientIdSalvato: CLIENT }).clientId, CLIENT);
  const casi = [
    [r({ state: 'ALTRO', code: 'C', client_id: CLIENT }), {}, 'CHATGPT_STATO_DIVERSO'],
    [r({ code: 'C', client_id: CLIENT }), {}, 'CHATGPT_STATO_DIVERSO'],
    [r({ state: 'ALTRO', error: 'access_denied' }), {}, 'CHATGPT_STATO_DIVERSO'], // a denial with a foreign state says nothing
    [r({ state: 'STATO', error: 'access_denied' }), {}, 'CHATGPT_ACCESSO_NEGATO'],
    [r({ state: 'STATO', error: 'server_error' }), {}, 'CHATGPT_AUTORIZZAZIONE_RIFIUTATA'],
    [r({ state: 'STATO', client_id: CLIENT }), {}, 'CHATGPT_CODICE_MANCANTE'],
    [r({ state: 'STATO', code: 'C' }), {}, 'CHATGPT_CLIENT_NON_VALIDO'], // first sign-in without an issued id
    [r({ state: 'STATO', code: 'C', client_id: 'dynamic_agent_client' }), {}, 'CHATGPT_CLIENT_NON_VALIDO'],
    [r({ state: 'STATO', code: 'C', client_id: 'oaiapp_altro' }), { clientIdSalvato: CLIENT }, 'CHATGPT_CLIENT_DIVERSO'],
    [`/callback?${new URLSearchParams({ state: 'STATO', code: 'C', client_id: CLIENT })}`, {}, 'CHATGPT_RITORNO_SCONOSCIUTO'],
  ];
  for (const [indirizzo, opzioni, atteso] of casi) assert.equal(codice(() => leggiRitorno(indirizzo, { statoAtteso: 'STATO', ...opzioni })), atteso, indirizzo);
  assert.equal(codice(() => leggiRitorno(r({ state: '', code: 'C', client_id: CLIENT }), { statoAtteso: '' })), 'CHATGPT_STATO_DIVERSO', 'an empty state never matches');
  assert.equal(clientIdEmesso('oaiapp_x'), true);
  for (const no of ['oaiapp_', 'app_x', 'oaiapp_x y', null, 7]) assert.equal(clientIdEmesso(no), false, String(no));
});

test('CHATGPT-04 — the exchange and the renewal are form bodies without a secret', () => {
  const scambio = Object.fromEntries(new URLSearchParams(corpoDelloScambio({ clientId: CLIENT, codice: 'C', verifier: 'V', ritorno: base.ritorno })));
  assert.deepEqual(scambio, { grant_type: 'authorization_code', client_id: CLIENT, code: 'C', code_verifier: 'V', redirect_uri: base.ritorno, resource: RISORSA });
  assert.deepEqual(Object.fromEntries(new URLSearchParams(corpoDelRinnovo({ clientId: CLIENT, refreshToken: 'R' }))),
    { grant_type: 'refresh_token', client_id: CLIENT, refresh_token: 'R' });
  assert.equal(codice(() => corpoDelloScambio({ clientId: CLIENT_DI_REGISTRAZIONE, codice: 'C', verifier: 'V', ritorno: base.ritorno })), 'CHATGPT_CLIENT_NON_VALIDO');
  assert.equal(codice(() => corpoDelloScambio({ clientId: CLIENT, codice: 'C', verifier: '', ritorno: base.ritorno })), 'CHATGPT_RICHIESTA_INCOMPLETA');
  assert.equal(codice(() => corpoDelRinnovo({ clientId: CLIENT, refreshToken: '' })), 'CHATGPT_RICHIESTA_INCOMPLETA');
});

test('CHATGPT-05 — the token answer: lifetime, granted scopes, and whether the plan pays', () => {
  const ora = 1_000_000;
  const t = leggiRispostaToken({ access_token: 'A', refresh_token: 'R', id_token: 'I', token_type: 'Bearer', expires_in: 3600,
    scope: 'openid resource.invoke chatgpt.tokens.use.direct', earliest_refresh_at: 1_900_000_000 }, { ora });
  assert.deepEqual(t, { accessToken: 'A', refreshToken: 'R', idToken: 'I', scadeAlle: ora + 3_600_000, rinnovaNonPrimaDi: 1_900_000_000_000,
    scopes: ['openid', 'resource.invoke', 'chatgpt.tokens.use.direct'], pianoAbilitato: true });
  // signed in, but the plan does not pay
  assert.equal(leggiRispostaToken({ access_token: 'A', refresh_token: 'R', token_type: 'bearer', expires_in: 60, scope: 'openid profile' }, { ora }).pianoAbilitato, false);
  // a renewal that does not repeat the scope keeps the previous ones
  assert.equal(leggiRispostaToken({ access_token: 'A', refresh_token: 'R', token_type: 'bearer', expires_in: 60 }, { ora, scopesPrecedenti: [SCOPE_DEL_PIANO] }).pianoAbilitato, true);
  assert.equal(leggiRispostaToken({ access_token: 'A', refresh_token: 'R', token_type: 'bearer', expires_in: 60 }, { ora }).pianoAbilitato, false);
  assert.equal(leggiRispostaToken({ access_token: 'A', refresh_token: 'R', token_type: 'bearer', expires_in: 60, earliest_refresh_at: '2026-10-11T10:00:00Z' }, { ora })
    .rinnovaNonPrimaDi, Date.parse('2026-10-11T10:00:00Z'));
  for (const rotta of [null, {}, { access_token: 'A', refresh_token: 'R', token_type: 'mac', expires_in: 60 }, { access_token: 'A', token_type: 'bearer', expires_in: 60 },
    { access_token: 'A', refresh_token: 'R', token_type: 'bearer' }, { access_token: 'A', refresh_token: 'R', token_type: 'bearer', expires_in: 0 }]) {
    assert.equal(codice(() => leggiRispostaToken(rotta, { ora })), 'CHATGPT_RISPOSTA_INATTESA', JSON.stringify(rotta));
  }
  assert.equal(pianoAbilitato(['openid']), false);
  assert.equal(pianoAbilitato(null), false);
});

test('CHATGPT-06 — renewing: five minutes early, never before OpenAI allows, and which failures are final', () => {
  const scadeAlle = 10_000_000;
  assert.equal(quandoRinnovare({ scadeAlle }), scadeAlle - MARGINE_DI_RINNOVO_MS);
  assert.equal(quandoRinnovare({ scadeAlle, rinnovaNonPrimaDi: scadeAlle - 60_000 }), scadeAlle - 60_000, 'not before the allowed instant');
  assert.equal(quandoRinnovare({ scadeAlle, rinnovaNonPrimaDi: scadeAlle - 3_600_000 }), scadeAlle - MARGINE_DI_RINNOVO_MS);
  assert.equal(quandoRinnovare({ scadeAlle, rinnovaNonPrimaDi: scadeAlle + 60_000 }), scadeAlle, 'never after the expiry');
  assert.equal(codice(() => quandoRinnovare({})), 'CHATGPT_RICHIESTA_INCOMPLETA');
  for (const c of ['invalid_grant', 'invalid_refresh_token', 'token_expired', 'refresh_token_expired', 'refresh_token_invalidated', 'refresh_token_reused']) {
    assert.equal(rinnovoDefinitivamenteFallito(c), true, c);
  }
  for (const c of ['invalid_client', 'server_error', '', null, undefined]) assert.equal(rinnovoDefinitivamenteFallito(c), false, String(c));
});

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
function firmatore(tipo) {
  const { publicKey, privateKey } = tipo === 'EC' ? generateKeyPairSync('ec', { namedCurve: 'P-256' }) : generateKeyPairSync('rsa', { modulusLength: 2048 });
  const alg = tipo === 'EC' ? 'ES256' : 'RS256';
  const kid = `chiave-${alg}`;
  return {
    jwk: { ...publicKey.export({ format: 'jwk' }), kid, use: 'sig', alg },
    firma(corpo, testa = {}) {
      const dati = `${b64({ alg, kid, typ: 'JWT', ...testa })}.${b64(corpo)}`;
      const f = sign('sha256', Buffer.from(dati), tipo === 'EC' ? { key: privateKey, dsaEncoding: 'ieee-p1363' } : privateKey);
      return `${dati}.${f.toString('base64url')}`;
    },
  };
}

test('CHATGPT-07 — the identity token: signature against the published keys, then issuer, audience, expiry and nonce', () => {
  const ora = 1_800_000_000_000;
  const buono = { iss: EMITTENTE, aud: CLIENT, exp: ora / 1000 + 600, nonce: 'NONCE', sub: 'utente-1', email: 'x@y.z' };
  for (const tipo of ['RSA', 'EC']) {
    const f = firmatore(tipo); const altro = firmatore(tipo);
    const jwks = { keys: [f.jwk] };
    const verifica = (corpo, opzioni = {}, testa) => verificaIdToken(f.firma(corpo, testa), { jwks, clientId: CLIENT, nonce: 'NONCE', ora, ...opzioni });
    assert.deepEqual(verifica(buono), { sub: 'utente-1', email: 'x@y.z' }, tipo);
    assert.deepEqual(verifica({ ...buono, aud: ['altro', CLIENT] }), { sub: 'utente-1', email: 'x@y.z' });
    const no = (fn, cosa) => assert.equal(codice(fn), 'CHATGPT_ID_TOKEN_NON_VALIDO', `${tipo}: ${cosa}`);
    no(() => verificaIdToken(altro.firma(buono), { jwks, clientId: CLIENT, nonce: 'NONCE', ora }), 'signed by another key with the same kid');
    no(() => verifica(buono, { jwks: { keys: [] } }), 'key not published');
    no(() => verifica(buono, {}, { kid: 'altra' }), 'unknown kid');
    no(() => verifica({ ...buono, iss: 'https://auth.openai.com.evil.example' }), 'issuer');
    no(() => verifica({ ...buono, aud: 'oaiapp_altro' }), 'audience');
    no(() => verifica(buono, { clientId: 'oaiapp_altro' }), 'audience against another client');
    no(() => verifica({ ...buono, exp: ora / 1000 - 600 }), 'expired');
    no(() => verifica({ ...buono, nbf: ora / 1000 + 600 }), 'not valid yet');
    no(() => verifica({ ...buono, nonce: 'ALTRO' }), 'nonce');
    no(() => verifica(buono, { nonce: '' }), 'empty nonce');
    no(() => verifica({ ...buono, sub: '' }), 'no identity');
    // a changed payload under the same signature
    const [t, , firma] = f.firma(buono).split('.');
    no(() => verificaIdToken(`${t}.${b64({ ...buono, sub: 'altro' })}.${firma}`, { jwks, clientId: CLIENT, nonce: 'NONCE', ora }), 'tampered payload');
    // the clock of the computer may be a little off
    assert.equal(verifica({ ...buono, exp: ora / 1000 - 30 }).sub, 'utente-1');
  }
  const f = firmatore('RSA');
  const senzaFirma = `${b64({ alg: 'none', kid: f.jwk.kid })}.${b64(buono)}.`;
  assert.equal(codice(() => verificaIdToken(senzaFirma, { jwks: { keys: [f.jwk] }, clientId: CLIENT, nonce: 'NONCE', ora })), 'CHATGPT_ID_TOKEN_NON_VALIDO', 'alg none');
  const hs = `${b64({ alg: 'HS256', kid: f.jwk.kid })}.${b64(buono)}.${Buffer.from('x').toString('base64url')}`;
  assert.equal(codice(() => verificaIdToken(hs, { jwks: { keys: [f.jwk] }, clientId: CLIENT, nonce: 'NONCE', ora })), 'CHATGPT_ID_TOKEN_NON_VALIDO', 'symmetric alg');
  for (const rotto of ['', 'a.b', 'a.b.c', null]) assert.equal(codice(() => verificaIdToken(rotto, { jwks: { keys: [f.jwk] }, clientId: CLIENT, nonce: 'NONCE', ora })), 'CHATGPT_ID_TOKEN_NON_VALIDO');
});

test('CHATGPT-08 — no error message ever carries a token or a code', () => {
  const segreti = ['SEGRETO-ACCESSO', 'SEGRETO-REFRESH', 'SEGRETO-CODICE'];
  const messaggi = [];
  const prova = (fn) => { try { fn(); } catch (e) { messaggi.push(e.message); } };
  prova(() => leggiRispostaToken({ access_token: segreti[0], refresh_token: segreti[1], token_type: 'mac', expires_in: 1 }));
  prova(() => leggiRitorno(`/auth/callback?state=X&code=${segreti[2]}`, { statoAtteso: 'STATO' }));
  prova(() => corpoDelloScambio({ clientId: 'no', codice: segreti[2], verifier: 'V', ritorno: 'r' }));
  prova(() => verificaIdToken(`${segreti[0]}.x.y`, { jwks: { keys: [] }, clientId: CLIENT, nonce: 'N' }));
  assert.equal(messaggi.length, 4);
  for (const m of messaggi) for (const s of segreti) assert.equal(m.includes(s), false, m);
});
