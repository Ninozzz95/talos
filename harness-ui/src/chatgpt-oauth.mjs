/**
 * «Continue with ChatGPT» — i conti dell'accesso col piano ChatGPT della persona (D9, parte OpenAI).
 *
 * Owner 10/10/2026: «è importante». Decisioni dell'11/10/2026 (`decisioni-owner-oauth-chatgpt-11-10`): un'unica modale
 * «OpenAI» con due modi di collegarsi (chiave e piano), mai un cambio di strada di pagamento fatto da soli.
 *
 * ## Qui dentro ci sono SOLO i conti
 *
 * Come `openrouter-oauth.mjs`: niente `http`, niente disco, niente rete. Ogni funzione prende ciò che le serve come argomento
 * (il caso, l'orologio, le chiavi pubbliche) e si prova senza rete. L'ascolto del ritorno, la custodia e il rinnovo stanno
 * altrove. ⛔ Questo modulo non scrive MAI un token da nessuna parte e non lo mette in nessun messaggio d'errore.
 *
 * ## RICERCA — fonti primarie rilette l'11/10/2026 PRIMA di scrivere
 *
 * developers.openai.com/siwc/token-sharing-open-source/…
 * · `sign-in`: authorize `https://auth.openai.com/api/accounts/authorize`. Prima volta: `client_id=dynamic_agent_client`,
 *   `agent_name_hint` (il nome dell'app, uguale su ogni installazione), `ext_agent_host_id` (uno per installazione). Ritorni:
 *   il `client_id` emesso al posto di `dynamic_agent_client`, niente `agent_name_hint`, `id_token_hint` e `login_hint`
 *   facoltativi. Sempre: `response_type=code`, `scope` = i sei qui sotto, `resource=https://api.openai.com/v1`, `state`, `nonce`,
 *   `code_challenge` con `S256`.
 * · Ritorno: `http://127.0.0.1:<porta>/auth/callback`. «On later sign-ins, only the port may change»; «Don't substitute
 *   `localhost`». Porta `code`, `state`, `scope` e — alla registrazione — il `client_id` emesso; se è diverso da quello salvato
 *   il risultato si rifiuta. Con `error=access_denied` si valida `state` e ci si ferma.
 * · Scambio: `https://auth.openai.com/api/accounts/oauth/token`, form `authorization_code` con `client_id` emesso, `code`,
 *   `code_verifier`, lo stesso `redirect_uri` e lo stesso `resource`. Nessun segreto.
 * · `id_token`: firma contro la JWKS pubblicata, poi issuer, audience = client emesso, scadenza e nonce salvato. `sub` è
 *   l'identità dell'account.
 * · `token-reference`: accesso 1 ora, refresh 30 giorni che ruota a ogni uso; la risposta porta anche `earliest_refresh_at`.
 * · `errors-and-recovery`: con `invalid_grant`, `invalid_refresh_token`, `token_expired`, `refresh_token_expired`,
 *   `refresh_token_invalidated`, `refresh_token_reused` il rinnovo non si ritenta: token tolti e nuovo accesso. Senza
 *   `chatgpt.tokens.use.direct` fra gli scope concessi l'accesso si tiene ma il piano NON paga; per abilitarlo dopo si ripete
 *   l'accesso con `prompt=consent`, mai a ogni accesso ordinario.
 *
 * Concorrente letto alla fonte: t3code `9f48092e` (07/10/2026), `apps/server/src/provider/CodexChatGptAuth.ts` — :32-34 le
 * costanti, :511-533 l'indirizzo, :575 `oaiapp_`, :616 la verifica dell'`id_token`, :397-404 gli errori di rinnovo.
 * ⛔ Hermes NON è il modello: riusa il client pubblico della CLI di Codex su `localhost:1455` (`auth_constants.py:90`).
 *
 * ⛔ Nessuna dipendenza nuova: la firma dell'`id_token` si verifica con `node:crypto` (t3code usa `jose`).
 */

import { createPublicKey, randomBytes, randomUUID, timingSafeEqual, verify } from 'node:crypto';
import { base64Url } from './openrouter-oauth.mjs';

export const EMITTENTE = 'https://auth.openai.com';
export const INDIRIZZO_AUTORIZZAZIONE = 'https://auth.openai.com/api/accounts/authorize';
export const INDIRIZZO_SCAMBIO = 'https://auth.openai.com/api/accounts/oauth/token';
export const INDIRIZZO_SCOPERTA = 'https://auth.openai.com/.well-known/openid-configuration';
export const RISORSA = 'https://api.openai.com/v1';
/** Il segnaposto della PRIMA registrazione. ⛔ Non si salva mai come id del client. */
export const CLIENT_DI_REGISTRAZIONE = 'dynamic_agent_client';
/** Il nome che la persona legge nella pagina di consenso e nelle impostazioni di ChatGPT: uguale su ogni installazione. */
export const NOME_APP = 'TALOS';
export const PERCORSO_RITORNO = '/auth/callback';
/** Lo scope che fa pagare il piano. Senza, la persona è entrata ma l'inferenza su questa strada non parte. */
export const SCOPE_DEL_PIANO = 'chatgpt.tokens.use.direct';
export const SCOPE_RICHIESTI = Object.freeze(['openid', 'profile', 'email', 'offline_access', 'resource.invoke', SCOPE_DEL_PIANO]);
/** I codici con cui un rinnovo è finito per sempre: non si ritenta, si rifà l'accesso. */
export const ERRORI_DI_RINNOVO_DEFINITIVI = Object.freeze(['invalid_grant', 'invalid_refresh_token', 'token_expired', 'refresh_token_expired',
  'refresh_token_invalidated', 'refresh_token_reused']);
/** Quanto prima della scadenza si rinnova: un giro lungo non deve trovarsi il token scaduto a metà. */
export const MARGINE_DI_RINNOVO_MS = 5 * 60 * 1000;

function errore(messaggio, code) {
  return Object.assign(new Error(messaggio), { code });
}

const uguali = (a, b) => {
  const x = Buffer.from(String(a ?? '')); const y = Buffer.from(String(b ?? ''));
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
};

/** L'identità stabile di QUESTA installazione: un UUID casuale, mai un'email o un id della persona. Si crea una volta e si tiene. */
export function nuovoIdDellHost({ uuid = randomUUID } = {}) {
  return `urn:uuid:${uuid()}`;
}

/** L'indirizzo di ritorno: sempre `127.0.0.1`, cambia solo la porta. */
export function indirizzoDiRitorno(porta) {
  if (!Number.isInteger(porta) || porta < 1 || porta > 65535) throw errore('The sign-in callback needs a valid port.', 'CHATGPT_PORTA_NON_VALIDA');
  return `http://127.0.0.1:${porta}${PERCORSO_RITORNO}`;
}

/**
 * L'indirizzo da aprire nel browser di sistema.
 * `clientId` null = prima registrazione; altrimenti il client emesso (`oaiapp_…`).
 * `consenso` true solo quando la persona chiede di abilitare il piano dopo un accesso senza lo scope: mai di serie.
 */
export function indirizzoDiAutorizzazione({ clientId = null, idDellHost, ritorno, stato, nonce, challenge, idTokenPrecedente = null, email = null,
  consenso = false } = {}) {
  for (const [nome, valore] of Object.entries({ idDellHost, ritorno, stato, nonce, challenge })) {
    if (typeof valore !== 'string' || valore === '') throw errore(`The sign-in request is missing «${nome}».`, 'CHATGPT_RICHIESTA_INCOMPLETA');
  }
  if (clientId !== null && !clientIdEmesso(clientId)) throw errore('The saved client id is not one issued by OpenAI.', 'CHATGPT_CLIENT_NON_VALIDO');
  const url = new URL(INDIRIZZO_AUTORIZZAZIONE);
  const p = url.searchParams;
  p.set('client_id', clientId ?? CLIENT_DI_REGISTRAZIONE);
  if (clientId === null) p.set('agent_name_hint', NOME_APP);
  p.set('ext_agent_host_id', idDellHost);
  p.set('response_type', 'code');
  p.set('redirect_uri', ritorno);
  p.set('scope', SCOPE_RICHIESTI.join(' '));
  p.set('resource', RISORSA);
  p.set('state', stato);
  p.set('nonce', nonce);
  p.set('code_challenge', challenge);
  p.set('code_challenge_method', 'S256');
  if (clientId !== null && idTokenPrecedente) p.set('id_token_hint', idTokenPrecedente);
  if (clientId !== null && email) p.set('login_hint', email);
  if (consenso) p.set('prompt', 'consent');
  return url.toString();
}

/** Vero solo per un client emesso dalla registrazione dinamica. */
export function clientIdEmesso(valore) {
  return typeof valore === 'string' && /^oaiapp_[A-Za-z0-9_-]{1,200}$/u.test(valore);
}

/**
 * Legge il ritorno dal browser. Torna `{ codice, clientId, scopes }` o lancia con un codice.
 * ⛔ Lo `state` si valida PER PRIMO, anche davanti a un errore: un ritorno con lo stato sbagliato non è nostro e non dice niente.
 */
export function leggiRitorno(indirizzo, { statoAtteso, clientIdSalvato = null } = {}) {
  const url = new URL(indirizzo, 'http://127.0.0.1');
  if (url.pathname !== PERCORSO_RITORNO) throw errore('This is not the sign-in callback.', 'CHATGPT_RITORNO_SCONOSCIUTO');
  const p = url.searchParams;
  if (!uguali(p.get('state'), statoAtteso)) throw errore('This sign-in answer does not belong to the request that was started.', 'CHATGPT_STATO_DIVERSO');
  if (p.get('error')) {
    throw errore(p.get('error') === 'access_denied' ? 'The sign-in was cancelled.' : 'OpenAI did not complete the sign-in.',
      p.get('error') === 'access_denied' ? 'CHATGPT_ACCESSO_NEGATO' : 'CHATGPT_AUTORIZZAZIONE_RIFIUTATA');
  }
  const codice = p.get('code');
  if (!codice) throw errore('The sign-in answer carries no code.', 'CHATGPT_CODICE_MANCANTE');
  const tornato = p.get('client_id');
  if (tornato !== null && !clientIdEmesso(tornato)) throw errore('OpenAI returned a client id of an unknown shape.', 'CHATGPT_CLIENT_NON_VALIDO');
  if (clientIdSalvato === null && tornato === null) throw errore('The first sign-in did not return a client id.', 'CHATGPT_CLIENT_NON_VALIDO');
  if (clientIdSalvato !== null && tornato !== null && tornato !== clientIdSalvato) {
    throw errore('OpenAI returned a different client id from the saved one.', 'CHATGPT_CLIENT_DIVERSO');
  }
  const scopes = String(p.get('scope') ?? '').split(/\s+/u).filter(Boolean);
  return { codice, clientId: tornato ?? clientIdSalvato, scopes };
}

/** Il corpo (form) dello scambio del codice. Stesso `redirect_uri` e stessa `resource` della richiesta. */
export function corpoDelloScambio({ clientId, codice, verifier, ritorno } = {}) {
  if (!clientIdEmesso(clientId)) throw errore('The code exchange needs the issued client id.', 'CHATGPT_CLIENT_NON_VALIDO');
  for (const [nome, valore] of Object.entries({ codice, verifier, ritorno })) {
    if (typeof valore !== 'string' || valore === '') throw errore(`The code exchange is missing «${nome}».`, 'CHATGPT_RICHIESTA_INCOMPLETA');
  }
  return new URLSearchParams({ grant_type: 'authorization_code', client_id: clientId, code: codice, code_verifier: verifier, redirect_uri: ritorno,
    resource: RISORSA }).toString();
}

/** Il corpo (form) del rinnovo. */
export function corpoDelRinnovo({ clientId, refreshToken } = {}) {
  if (!clientIdEmesso(clientId)) throw errore('The token renewal needs the issued client id.', 'CHATGPT_CLIENT_NON_VALIDO');
  if (typeof refreshToken !== 'string' || refreshToken === '') throw errore('There is no refresh token to renew with.', 'CHATGPT_RICHIESTA_INCOMPLETA');
  return new URLSearchParams({ grant_type: 'refresh_token', client_id: clientId, refresh_token: refreshToken }).toString();
}

const istante = (valore) => {
  if (typeof valore === 'number' && Number.isFinite(valore)) return valore < 1e12 ? valore * 1000 : valore; // secondi o millisecondi
  if (typeof valore === 'string' && valore !== '') { const t = /^\d+$/u.test(valore) ? istante(Number(valore)) : Date.parse(valore); return Number.isFinite(t) ? t : null; }
  return null;
};

/**
 * Legge la risposta dell'endpoint dei token (scambio o rinnovo). `scopesPrecedenti` vale quando il rinnovo non ripete `scope`.
 * ⛔ Un refresh token mancante è un errore: senza, dopo un'ora la persona sarebbe fuori senza saperlo.
 */
export function leggiRispostaToken(risposta, { ora = Date.now(), scopesPrecedenti = null } = {}) {
  if (!risposta || typeof risposta !== 'object') throw errore('OpenAI answered the token request in an unknown shape.', 'CHATGPT_RISPOSTA_INATTESA');
  const { access_token: accesso, refresh_token: refresh, id_token: idToken = null, token_type: tipo, expires_in: durata } = risposta;
  if (typeof accesso !== 'string' || accesso === '' || String(tipo ?? '').toLowerCase() !== 'bearer') {
    throw errore('OpenAI answered the token request without a bearer token.', 'CHATGPT_RISPOSTA_INATTESA');
  }
  if (typeof refresh !== 'string' || refresh === '') throw errore('OpenAI answered the token request without a refresh token.', 'CHATGPT_RISPOSTA_INATTESA');
  if (!Number.isFinite(durata) || durata <= 0) throw errore('OpenAI answered the token request without a lifetime.', 'CHATGPT_RISPOSTA_INATTESA');
  const scopes = typeof risposta.scope === 'string' ? risposta.scope.split(/\s+/u).filter(Boolean) : (scopesPrecedenti ?? []);
  return { accessToken: accesso, refreshToken: refresh, idToken: typeof idToken === 'string' && idToken !== '' ? idToken : null,
    scadeAlle: ora + durata * 1000, rinnovaNonPrimaDi: istante(risposta.earliest_refresh_at), scopes, pianoAbilitato: pianoAbilitato(scopes) };
}

/** Il piano paga solo se lo scope del piano è fra quelli CONCESSI (non fra quelli chiesti). */
export function pianoAbilitato(scopes) {
  return Array.isArray(scopes) && scopes.includes(SCOPE_DEL_PIANO);
}

/** Vero se con questo codice il rinnovo non va ritentato: i token si tolgono e si rifà l'accesso. */
export function rinnovoDefinitivamenteFallito(codice) {
  return ERRORI_DI_RINNOVO_DEFINITIVI.includes(String(codice ?? ''));
}

/**
 * Quando rinnovare: `MARGINE_DI_RINNOVO_MS` prima della scadenza, ma mai prima di `rinnovaNonPrimaDi` se OpenAI l'ha dato.
 * Torna l'istante (ms). Se è già passato, si rinnova adesso.
 */
export function quandoRinnovare({ scadeAlle, rinnovaNonPrimaDi = null } = {}) {
  if (!Number.isFinite(scadeAlle)) throw errore('The token carries no expiry.', 'CHATGPT_RICHIESTA_INCOMPLETA');
  const voluto = scadeAlle - MARGINE_DI_RINNOVO_MS;
  return Number.isFinite(rinnovaNonPrimaDi) ? Math.max(voluto, Math.min(rinnovaNonPrimaDi, scadeAlle)) : voluto;
}

const decodifica = (pezzo) => JSON.parse(Buffer.from(pezzo, 'base64url').toString('utf8'));
const ALGORITMI = Object.freeze({ RS256: { hash: 'sha256', kty: 'RSA' }, ES256: { hash: 'sha256', kty: 'EC', dsaEncoding: 'ieee-p1363' } });

/**
 * Verifica l'`id_token` e torna `{ sub, email }`.
 * Ordine: forma, algoritmo ammesso (mai `none`, mai uno simmetrico), chiave della JWKS con quel `kid`, FIRMA, e solo dopo le
 * affermazioni — issuer, audience = client emesso, scadenza, nonce. `tolleranzaMs` copre l'orologio del computer.
 */
export function verificaIdToken(idToken, { jwks, clientId, nonce, ora = Date.now(), tolleranzaMs = 60_000 } = {}) {
  const rifiuta = (perche) => errore(`The identity token from OpenAI is not valid: ${perche}.`, 'CHATGPT_ID_TOKEN_NON_VALIDO');
  const pezzi = String(idToken ?? '').split('.');
  if (pezzi.length !== 3 || pezzi.some((p) => p === '')) throw rifiuta('unknown shape');
  let testa; let corpo;
  try { testa = decodifica(pezzi[0]); corpo = decodifica(pezzi[1]); } catch { throw rifiuta('unreadable'); }
  const algoritmo = ALGORITMI[testa?.alg];
  if (!algoritmo) throw rifiuta('signature algorithm not accepted');
  const chiavi = Array.isArray(jwks?.keys) ? jwks.keys : [];
  const jwk = chiavi.find((k) => k && k.kid === testa.kid && k.kty === algoritmo.kty && (k.use === undefined || k.use === 'sig'));
  if (!testa.kid || !jwk) throw rifiuta('signing key not published');
  let buona = false;
  try {
    const chiave = createPublicKey({ key: jwk, format: 'jwk' });
    buona = verify(algoritmo.hash, Buffer.from(`${pezzi[0]}.${pezzi[1]}`), algoritmo.dsaEncoding ? { key: chiave, dsaEncoding: algoritmo.dsaEncoding } : chiave,
      Buffer.from(pezzi[2], 'base64url'));
  } catch { buona = false; }
  if (!buona) throw rifiuta('signature does not verify');
  if (corpo.iss !== EMITTENTE) throw rifiuta('unexpected issuer');
  const destinatari = Array.isArray(corpo.aud) ? corpo.aud : [corpo.aud];
  if (!clientIdEmesso(clientId) || !destinatari.includes(clientId)) throw rifiuta('issued for another client');
  if (!Number.isFinite(corpo.exp) || corpo.exp * 1000 + tolleranzaMs <= ora) throw rifiuta('expired');
  if (Number.isFinite(corpo.nbf) && corpo.nbf * 1000 - tolleranzaMs > ora) throw rifiuta('not valid yet');
  if (!uguali(corpo.nonce, nonce)) throw rifiuta('does not belong to this sign-in');
  if (typeof corpo.sub !== 'string' || corpo.sub === '') throw rifiuta('no account identity');
  return { sub: corpo.sub, email: typeof corpo.email === 'string' ? corpo.email : null };
}

/** Il nonce: stessa entropia dello stato. */
export function creaNonce({ random = (quanti) => randomBytes(quanti) } = {}) {
  return base64Url(random(32));
}
