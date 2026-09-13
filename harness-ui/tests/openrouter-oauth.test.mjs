import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import {
  ATTESE_MASSIME,
  ETICHETTA_CHIAVE,
  TETTO_ATTESA_MS,
  base64Url,
  creaCoppiaPkce,
  creaRegistroAttese,
  creaStato,
  indirizzoDiAutorizzazione,
  ritornoDaHost,
  scambiaCodicePerChiave,
} from '../src/openrouter-oauth.mjs';

/*
 * PO-01 (10/9) — i conti dell'accesso a OpenRouter, provati SENZA rete e SENZA server.
 *
 * ⛔ Ogni prova qui dentro esiste anche al VERSO CONTRARIO: non basta che il flusso buono
 * funzioni, deve essere vero che quello cattivo viene respinto — un cancello inerte supera la
 * prova «il legittimo passa» esattamente come uno vero (memoria 27/8, il cancello semantico
 * spento da sempre).
 *
 * Fonti nei commenti del modulo (`src/openrouter-oauth.mjs`), tutte lette il 10/09/2026.
 */

function casoFinto(riempimento) {
  // Un «caso» deterministico, così una prova può parlare di valori esatti. ⛔ Solo nei test.
  return (quanti) => Buffer.alloc(quanti, riempimento);
}

test('OR-OAUTH-01 — la coppia PKCE: 43 caratteri base64url e la sfida è davvero SHA-256 del verificatore', () => {
  const { verifier, challenge } = creaCoppiaPkce({ random: casoFinto(7) });
  assert.equal(verifier.length, 43, '32 byte in base64url sono 43 caratteri: il minimo di RFC 7636 §4.1');
  assert.match(verifier, /^[A-Za-z0-9_-]+$/u, 'niente +, / o = : è base64url, non base64');
  // ⛔ L'atteso è RICALCOLATO a mano, non ripreso dalla funzione stessa: un andata-e-ritorno non prova niente.
  const atteso = createHash('sha256').update(verifier, 'ascii').digest('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  assert.equal(challenge, atteso);
  assert.notEqual(challenge, verifier, 'se fossero uguali sarebbe `plain`, cioè PKCE spento');
});

test('OR-OAUTH-02 — due coppie di fila non si somigliano (il caso vero, non un contatore)', () => {
  const uno = creaCoppiaPkce();
  const due = creaCoppiaPkce();
  assert.notEqual(uno.verifier, due.verifier);
  assert.notEqual(uno.challenge, due.challenge);
  assert.equal(new Set([creaStato(), creaStato(), creaStato()]).size, 3);
});

test('OR-OAUTH-03 — AL CONTRARIO: una sorgente di caso povera non passa, non degrada in silenzio', () => {
  assert.throws(() => creaCoppiaPkce({ random: () => Buffer.alloc(8) }), { code: 'OAUTH_CASO_INSUFFICIENTE' });
  assert.throws(() => creaCoppiaPkce({ random: () => null }), { code: 'OAUTH_CASO_INSUFFICIENTE' });
});

test('OR-OAUTH-04 — l’indirizzo con rientro porta callback_url, code_challenge e S256, e nessun key_label', () => {
  const url = new URL(indirizzoDiAutorizzazione({ challenge: 'SFIDA', callbackUrl: 'http://127.0.0.1:4174/api/v1/auth/openrouter/ritorno/ABC' }));
  assert.equal(url.origin + url.pathname, 'https://openrouter.ai/auth');
  assert.equal(url.searchParams.get('callback_url'), 'http://127.0.0.1:4174/api/v1/auth/openrouter/ritorno/ABC');
  assert.equal(url.searchParams.get('code_challenge'), 'SFIDA');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(url.searchParams.get('key_label'), null);
});

test('OR-OAUTH-05 — la modalità «codice a schermo»: nessun callback_url, key_label presente, sfida OBBLIGATORIA', () => {
  const url = new URL(indirizzoDiAutorizzazione({ challenge: 'SFIDA' }));
  assert.equal(url.searchParams.get('callback_url'), null, 'omettere callback_url È la modalità senza rientro');
  assert.equal(url.searchParams.get('key_label'), ETICHETTA_CHIAVE);
  assert.equal(url.searchParams.get('code_challenge'), 'SFIDA');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
});

test('OR-OAUTH-06 — AL CONTRARIO: senza sfida non si costruisce nessun indirizzo, in nessuna delle due modalità', () => {
  assert.throws(() => indirizzoDiAutorizzazione({ challenge: '' }), { code: 'OAUTH_SFIDA_MANCANTE' });
  assert.throws(() => indirizzoDiAutorizzazione({}), { code: 'OAUTH_SFIDA_MANCANTE' });
  assert.throws(() => indirizzoDiAutorizzazione({ challenge: 'S', callbackUrl: '   ' }), { code: 'OAUTH_RITORNO_INVALIDO' });
});

test('OR-OAUTH-07 — lo scambio manda esattamente ciò che OpenRouter dichiara e restituisce la chiave', async () => {
  let visto = null;
  const { chiave } = await scambiaCodicePerChiave({
    codice: '  CODICE  ',
    verifier: 'VERIFICATORE',
    fetchDiRete: async (indirizzo, opzioni) => {
      visto = { indirizzo, opzioni };
      return { ok: true, status: 200, json: async () => ({ key: '  sk-or-v1-finta  ' }) };
    },
  });
  assert.equal(visto.indirizzo, 'https://openrouter.ai/api/v1/auth/keys');
  assert.equal(visto.opzioni.method, 'POST');
  assert.equal(visto.opzioni.headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(visto.opzioni.body), {
    code: 'CODICE', code_verifier: 'VERIFICATORE', code_challenge_method: 'S256',
  });
  assert.equal(chiave, 'sk-or-v1-finta');
});

test('OR-OAUTH-08 — AL CONTRARIO: i tre guasti dello scambio restano tre codici diversi, e nessuno riporta il corpo', async () => {
  const rete = async () => { throw new Error('ECONNREFUSED https://openrouter.ai/api/v1/auth/keys?segreto=x'); };
  await assert.rejects(
    scambiaCodicePerChiave({ codice: 'C', verifier: 'V', fetchDiRete: rete }),
    (errore) => {
      assert.equal(errore.code, 'OAUTH_RETE');
      assert.doesNotMatch(errore.message, /segreto|openrouter\.ai/u, 'il messaggio di rete non viaggia: può contenere la query');
      return true;
    },
  );
  await assert.rejects(
    scambiaCodicePerChiave({
      codice: 'C', verifier: 'V',
      // 403 «Invalid code or code_verifier» è uno degli errori dichiarati dalla doc.
      fetchDiRete: async () => ({ ok: false, status: 403, text: async () => 'Invalid code', json: async () => ({}) }),
    }),
    (errore) => { assert.equal(errore.code, 'OAUTH_SCAMBIO_RIFIUTATO'); assert.equal(errore.stato, 403); return true; },
  );
  for (const corpo of [{}, { key: '' }, { api_key: 'x' }, null]) {
    await assert.rejects(
      scambiaCodicePerChiave({ codice: 'C', verifier: 'V', fetchDiRete: async () => ({ ok: true, status: 200, json: async () => corpo }) }),
      { code: 'OAUTH_RISPOSTA_INATTESA' },
      `un corpo ${JSON.stringify(corpo)} non è una chiave`,
    );
  }
  await assert.rejects(
    scambiaCodicePerChiave({ codice: 'C', verifier: 'V', fetchDiRete: async () => ({ ok: true, status: 200, json: async () => { throw new Error('non è JSON'); } }) }),
    { code: 'OAUTH_RISPOSTA_INATTESA' },
  );
});

test('OR-OAUTH-09 — AL CONTRARIO: senza codice o senza verificatore non si esce nemmeno in rete', async () => {
  let uscite = 0;
  const rete = async () => { uscite += 1; return { ok: true, status: 200, json: async () => ({ key: 'k' }) }; };
  await assert.rejects(scambiaCodicePerChiave({ codice: '   ', verifier: 'V', fetchDiRete: rete }), { code: 'OAUTH_CODICE_MANCANTE' });
  await assert.rejects(scambiaCodicePerChiave({ codice: 'C', verifier: '', fetchDiRete: rete }), { code: 'OAUTH_VERIFIER_MANCANTE' });
  await assert.rejects(scambiaCodicePerChiave({ codice: 'C', verifier: 'V', fetchDiRete: null }), { code: 'OAUTH_RETE' });
  assert.equal(uscite, 0, 'una richiesta incompleta non deve costare un giro di rete');
});

test('OR-OAUTH-10 — il registro: apre, restituisce lo stato, e il verificatore NON esce mai', () => {
  const registro = creaRegistroAttese();
  const apertura = registro.apri({ costruisciRitorno: (stato) => `http://127.0.0.1:4174/api/v1/auth/openrouter/ritorno/${stato}` });
  assert.equal(apertura.modo, 'browser');
  assert.equal(apertura.scadeTraMs, TETTO_ATTESA_MS);
  assert.match(apertura.stato, /^[A-Za-z0-9_-]{43}$/u);
  assert.deepEqual(Object.keys(apertura).sort(), ['indirizzo', 'modo', 'scadeTraMs', 'stato']);
  // ⛔ La prova che conta: il verificatore non compare da nessuna parte in ciò che esce.
  const { verifier } = registro.consuma(apertura.stato);
  assert.equal(JSON.stringify(apertura).includes(verifier), false);
  assert.equal(apertura.indirizzo.includes(verifier), false);
});

test('OR-OAUTH-11 — AL CONTRARIO: stato ignoto, riusato e scaduto danno LO STESSO codice, e non dicono quale dei tre', () => {
  let adesso = 1_000;
  const registro = creaRegistroAttese({ clock: () => adesso });
  const { stato } = registro.apri({ costruisciRitorno: () => 'http://127.0.0.1:1/api/v1/auth/openrouter/ritorno/x' });

  const codici = [];
  const messaggi = [];
  const raccogli = (fn) => { try { fn(); } catch (errore) { codici.push(errore.code); messaggi.push(errore.message); } };

  raccogli(() => registro.consuma('mai-esistito'));            // ignoto
  assert.deepEqual(registro.consuma(stato).verifier.length, 43); // il primo uso funziona
  raccogli(() => registro.consuma(stato));                      // già usato
  const secondo = registro.apri({ costruisciRitorno: () => 'http://127.0.0.1:1/x' }).stato;
  adesso += TETTO_ATTESA_MS + 1;
  raccogli(() => registro.consuma(secondo));                    // scaduto

  assert.deepEqual(codici, ['OAUTH_ATTESA_IGNOTA', 'OAUTH_ATTESA_IGNOTA', 'OAUTH_ATTESA_IGNOTA']);
  assert.equal(new Set(messaggi).size, 1, 'i tre casi devono essere indistinguibili da fuori');
  assert.equal(registro.quanteInAttesa(), 0);
});

test('OR-OAUTH-12 — due «inizia» di fila: il PRIMO stato resta valido (decisione motivata nel modulo)', () => {
  const registro = creaRegistroAttese();
  const primo = registro.apri({ costruisciRitorno: () => 'http://127.0.0.1:1/x' }).stato;
  const secondo = registro.apri({ costruisciRitorno: () => 'http://127.0.0.1:1/x' }).stato;
  assert.notEqual(primo, secondo);
  assert.equal(registro.quanteInAttesa(), 2);
  assert.equal(registro.consuma(primo).verifier.length, 43, 'chi ha premuto due volte deve poter chiudere il giro che si è aperto per primo');
  assert.equal(registro.consuma(secondo).verifier.length, 43);
});

test('OR-OAUTH-13 — il tetto di numero morde: oltre ATTESE_MASSIME cade la più vecchia, non le nuove', () => {
  const registro = creaRegistroAttese();
  const stati = [];
  for (let i = 0; i < ATTESE_MASSIME + 3; i += 1) stati.push(registro.apri({ costruisciRitorno: () => 'http://127.0.0.1:1/x' }).stato);
  assert.equal(registro.quanteInAttesa(), ATTESE_MASSIME);
  for (const vecchio of stati.slice(0, 3)) assert.throws(() => registro.consuma(vecchio), { code: 'OAUTH_ATTESA_IGNOTA' });
  assert.equal(registro.consuma(stati.at(-1)).verifier.length, 43);
});

test('OR-OAUTH-14 — le scadute spariscono da sole, senza che nessuno le chieda', () => {
  let adesso = 0;
  const registro = creaRegistroAttese({ clock: () => adesso });
  registro.apri({ costruisciRitorno: () => 'http://127.0.0.1:1/x' });
  assert.equal(registro.quanteInAttesa(), 1);
  adesso = TETTO_ATTESA_MS;
  assert.equal(registro.quanteInAttesa(), 0, 'il tetto è dieci minuti: la vita del codice dichiarata da OpenRouter');
});

test('OR-OAUTH-15 — senza rientro il registro va in modalità schermo e l’indirizzo non promette un callback', () => {
  const registro = creaRegistroAttese();
  const apertura = registro.apri({ costruisciRitorno: null });
  assert.equal(apertura.modo, 'schermo');
  assert.equal(new URL(apertura.indirizzo).searchParams.get('callback_url'), null);
  assert.equal(new URL(apertura.indirizzo).searchParams.get('key_label'), ETICHETTA_CHIAVE);
  assert.equal(registro.consuma(apertura.stato).conRitorno, false);
});

test('OR-OAUTH-16 — AL CONTRARIO: un Host che non è di loopback non produce nessun indirizzo di rientro', () => {
  assert.equal(ritornoDaHost('127.0.0.1:4174', 'ST'), 'http://127.0.0.1:4174/api/v1/auth/openrouter/ritorno/ST');
  assert.equal(ritornoDaHost('localhost:4174', 'ST'), 'http://localhost:4174/api/v1/auth/openrouter/ritorno/ST');
  assert.equal(ritornoDaHost('[::1]:4174', 'ST'), 'http://[::1]:4174/api/v1/auth/openrouter/ritorno/ST');
  for (const ostile of ['esempio.com', '127.0.0.1.esempio.com', 'localhost.esempio.com:80', '', null, undefined, '192.168.1.9:4174', '127.0.0.1:4174/../..']) {
    assert.equal(ritornoDaHost(ostile, 'ST'), null, `Host ostile accettato: ${String(ostile)}`);
  }
  assert.equal(ritornoDaHost('127.0.0.1:4174', 'a/b?c=1'), 'http://127.0.0.1:4174/api/v1/auth/openrouter/ritorno/a%2Fb%3Fc%3D1');
});

test('OR-OAUTH-17 — base64Url non lascia passare né riempimento né caratteri fuori insieme', () => {
  assert.equal(base64Url(Buffer.from([251, 255, 190])), '-_--');
  assert.equal(base64Url(Buffer.from([0])), 'AA');
  assert.doesNotMatch(base64Url(Buffer.alloc(31, 255)), /[+/=]/u);
});
