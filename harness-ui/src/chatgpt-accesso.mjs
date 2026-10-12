/**
 * «Continue with ChatGPT» — l'accesso dall'inizio alla fine: apre la richiesta, ascolta il ritorno, scambia, verifica, custodisce,
 * rinnova, esce. I conti stanno in `chatgpt-oauth.mjs`, la custodia in `chatgpt-custodia.mjs`, la pagina del browser in
 * `pagina-ritorno-accesso.mjs`: qui c'è solo l'ordine in cui succedono le cose. Tutto ciò che tocca il mondo (rete, orologio,
 * ascolto, custodia) arriva come dipendenza, così ogni strada si prova senza OpenAI.
 *
 * Fonti (rilette l'11/10/2026) e prova dal vivo dello stesso giorno: `PIANO-OAUTH-CHATGPT-2026-10-11.md` §2 e §10.
 *
 * Regole che questo file fa rispettare:
 *   · un solo tentativo d'accesso vivo alla volta: un secondo «Continue with ChatGPT» chiude il primo (l'ascolto è una porta);
 *   · la pagina del browser dice l'esito VERO: risponde solo dopo scambio, verifica e custodia;
 *   · i rinnovi sono UNO alla volta (il refresh token ruota a ogni uso: due rinnovi insieme ne bruciano uno) e chi arriva nel
 *     frattempo aspetta lo stesso rinnovo;
 *   · un rinnovo finito per sempre toglie la sessione e lo dice (`CHATGPT_ACCESSO_SCADUTO`); un guasto di rete no;
 *   · l'uscita toglie i token anche se la revoca non riesce, e dice se è stata confermata; la registrazione resta;
 *   · un altro account sulla stessa registrazione viene rifiutato (t3code `CodexChatGptAuth.ts:635`);
 *   · nessun token entra mai in un messaggio d'errore o in ciò che `stato()` restituisce.
 */

import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { creaCoppiaPkce, creaStato } from './openrouter-oauth.mjs';
import {
  EMITTENTE, INDIRIZZO_SCOPERTA, PERCORSO_RITORNO, corpoDelRinnovo, corpoDelloScambio, creaNonce, indirizzoDiAutorizzazione, indirizzoDiRitorno,
  leggiRispostaToken, leggiRitorno, nuovoIdDellHost, pianoAbilitato, quandoRinnovare, rinnovoDefinitivamenteFallito, verificaIdToken,
} from './chatgpt-oauth.mjs';
import { intestazioniDellaPagina, paginaDiRitorno } from './pagina-ritorno-accesso.mjs';

/** Quanto resta aperto un tentativo: il tempo di una password, di un secondo fattore e della scelta dell'area di lavoro. */
export const TETTO_TENTATIVO_MS = 10 * 60 * 1000;
export const INDIRIZZO_CONSUMI = 'https://chatgpt.com/settings/usage';

function errore(messaggio, code, extra = {}) {
  return Object.assign(new Error(messaggio), { code, ...extra });
}

const TESTI_PAGINA = Object.freeze({
  en: Object.freeze({
    okTitolo: 'ChatGPT account connected', okFrase: (email) => `TALOS can now use your ChatGPT plan${email ? `. Signed in as ${email}` : ''}.`,
    okSenzaPiano: 'You are signed in, but using your ChatGPT plan in TALOS is not enabled. You can enable it from TALOS.',
    okPoi: 'You can close this tab and go back to TALOS.', koTitolo: 'I could not connect the account', koPoi: 'You can close this tab and try again from TALOS.',
  }),
  it: Object.freeze({
    okTitolo: 'Account ChatGPT collegato', okFrase: (email) => `TALOS ora può usare il tuo piano ChatGPT${email ? `. Accesso come ${email}` : ''}.`,
    okSenzaPiano: 'Hai fatto l’accesso, ma l’uso del tuo piano ChatGPT in TALOS non è abilitato. Puoi abilitarlo da TALOS.',
    okPoi: 'Puoi chiudere questa scheda e tornare a TALOS.', koTitolo: 'Non sono riuscito a collegare l’account', koPoi: 'Puoi chiudere questa scheda e riprovare da TALOS.',
  }),
});
/** Le frasi dei guasti nella pagina del browser, nelle due lingue. L'interfaccia dell'app ha le sue, dal codice. */
export const GUASTI_ACCESSO = Object.freeze({
  CHATGPT_ACCESSO_NEGATO: ['The sign-in was cancelled.', 'L’accesso è stato annullato.'],
  CHATGPT_STATO_DIVERSO: ['This answer does not belong to the sign-in that was started. Start again from TALOS.', 'Questa risposta non appartiene all’accesso avviato. Ricomincia da TALOS.'],
  CHATGPT_SCAMBIO_RIFIUTATO: ['OpenAI did not accept this sign-in. The account may have no plan usable in other apps (ChatGPT Plus or Pro is required), or the sign-in took too long.',
    'OpenAI non ha accettato questo accesso. L’account potrebbe non avere un piano utilizzabile nelle app esterne (serve ChatGPT Plus o Pro), oppure l’accesso è durato troppo.'],
  CHATGPT_RETE: ['I could not reach OpenAI. Check the connection and try again.', 'Non sono riuscito a raggiungere OpenAI. Controlla la connessione e riprova.'],
  CHATGPT_ID_TOKEN_NON_VALIDO: ['The identity sent by OpenAI could not be verified.', 'Non sono riuscito a verificare l’identità inviata da OpenAI.'],
  CHATGPT_ACCESSO_ANNULLATO: ['The sign-in was cancelled in TALOS. Nothing was connected.', 'L’accesso è stato annullato in TALOS. Niente è stato collegato.'],
  CHATGPT_ALTRO_ACCOUNT: ['This is a different ChatGPT account from the one connected to TALOS. Disconnect it in TALOS first.', 'Questo è un account ChatGPT diverso da quello collegato a TALOS. Scollegalo prima da TALOS.'],
  CHATGPT_CUSTODIA_FALLITA: ['The sign-in worked, but the credentials could not be stored safely.', 'L’accesso è riuscito, ma non sono riuscito a mettere al sicuro le credenziali.'],
});
const guastoGenerico = ['The sign-in could not be completed.', 'Non è stato possibile completare l’accesso.'];

/** L'ascolto vero: `127.0.0.1` a porta libera, solo `GET /auth/callback`, una risposta sola, poi si chiude. */
export function creaAscoltatoreLocale() {
  return new Promise((ok, ko) => {
    let risposta = null;
    let arrivato;
    const ritorno = new Promise((r) => { arrivato = r; });
    const server = createServer((req, res) => {
      const percorso = String(req.url ?? '').split('?')[0];
      if (req.method !== 'GET' || percorso !== PERCORSO_RITORNO) { res.writeHead(404, { 'Cache-Control': 'no-store' }).end(); return; }
      if (risposta) { res.writeHead(410, { 'Cache-Control': 'no-store' }).end(); return; } // una volta sola
      risposta = res;
      arrivato({ indirizzo: req.url, lingua: /^\s*it\b/iu.test(String(req.headers['accept-language'] ?? '')) ? 'it' : 'en' });
    });
    server.once('error', ko);
    server.listen(0, '127.0.0.1', () => ok({
      porta: server.address().port,
      ritorno,
      rispondi(stato, html, intestazioni) {
        if (!risposta || risposta.writableEnded) return;
        risposta.writeHead(stato, { 'Content-Type': 'text/html; charset=utf-8', ...intestazioni }).end(html);
      },
      chiudi() { try { server.closeAllConnections?.(); server.close(); } catch { /* già chiuso */ } },
    }));
  });
}

export function creaAccessoChatgpt({
  custodia, fetchDiRete = globalThis.fetch, clock = () => Date.now(), creaAscoltatore = creaAscoltatoreLocale,
  random = (quanti) => randomBytes(quanti), pianifica = setTimeout, annulla = clearTimeout, tettoMs = TETTO_TENTATIVO_MS,
} = {}) {
  if (!custodia) throw errore('The ChatGPT sign-in needs a custody.', 'CHATGPT_CUSTODIA_ASSENTE');
  let tentativo = null; // { ascolto, scadenza, esito: Promise }
  let rinnovoInCorso = null;
  let scoperta = null;

  const chiedi = async (indirizzo, opzioni) => {
    try { return await fetchDiRete(indirizzo, opzioni); }
    catch { throw errore('OpenAI could not be reached.', 'CHATGPT_RETE'); }
  };
  async function leggiScoperta() {
    if (scoperta) return scoperta;
    const r = await chiedi(INDIRIZZO_SCOPERTA, { headers: { accept: 'application/json' } });
    const d = r.ok ? await r.json().catch(() => null) : null;
    const https = (u) => typeof u === 'string' && u.startsWith(`${EMITTENTE}/`);
    if (!d || d.issuer !== EMITTENTE || !https(d.token_endpoint) || !https(d.jwks_uri)) throw errore('OpenAI published an unexpected sign-in configuration.', 'CHATGPT_RISPOSTA_INATTESA');
    scoperta = { token: d.token_endpoint, jwks: d.jwks_uri, revoca: https(d.revocation_endpoint) ? d.revocation_endpoint : null };
    return scoperta;
  }
  async function token(corpo, { rinnovo = false } = {}) {
    const { token: indirizzo } = await leggiScoperta();
    const r = await chiedi(indirizzo, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' }, body: corpo });
    const dati = await r.json().catch(() => null);
    if (r.ok) return dati;
    const codice = typeof dati?.error === 'string' ? dati.error : null;
    if (rinnovo) throw errore('The ChatGPT session could not be renewed.', rinnovoDefinitivamenteFallito(codice) ? 'CHATGPT_ACCESSO_SCADUTO' : 'CHATGPT_RINNOVO_FALLITO', { stato: r.status, codiceOpenAi: codice });
    throw errore('OpenAI did not accept the sign-in.', r.status >= 500 ? 'CHATGPT_RETE' : 'CHATGPT_SCAMBIO_RIFIUTATO', { stato: r.status, codiceOpenAi: codice });
  }
  const salva = (voce, oggetto) => {
    try { custodia.scrivi(voce, oggetto); }
    catch { throw errore('The credentials could not be stored safely.', 'CHATGPT_CUSTODIA_FALLITA'); }
  };

  /*
   * 11/10/2026 (review avversaria) — un token che nessuno userà si revoca. Serve quando la persona scollega o annulla MENTRE una
   * richiesta a OpenAI è in viaggio: al ritorno la sessione non è più quella di partenza, niente si salva, e il refresh token appena
   * nato (ruota a ogni uso: quello revocato da `esci` era il precedente) non deve restare valido da nessuna parte.
   */
  async function revocaInSilenzio(refreshToken, clientId) {
    if (!refreshToken || !clientId) return;
    try {
      const { revoca } = await leggiScoperta();
      if (revoca) await chiedi(revoca, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token: refreshToken, token_type_hint: 'refresh_token', client_id: clientId }).toString() });
    } catch { /* il meglio che si può: la sessione qui non c'è comunque */ }
  }

  function chiudiTentativo() {
    if (!tentativo) return;
    annulla(tentativo.scadenza);
    tentativo.ascolto.chiudi();
    tentativo = null;
  }

  async function completa({ ascolto, stato, nonce, verifier, ritornoUri, registrazione }) {
    const { indirizzo, lingua } = await ascolto.ritorno;
    const testi = TESTI_PAGINA[lingua];
    const pagina = (statoHttp, dati) => {
      const nonceStile = Buffer.from(random(16)).toString('base64');
      ascolto.rispondi(statoHttp, paginaDiRitorno({ lingua, nonce: nonceStile, ...dati }), intestazioniDellaPagina({ nonce: nonceStile, lingua }));
    };
    try {
      const letto = leggiRitorno(indirizzo, { statoAtteso: stato, clientIdSalvato: registrazione?.clientId ?? null });
      const grezzo = await token(corpoDelloScambio({ clientId: letto.clientId, codice: letto.codice, verifier, ritorno: ritornoUri }));
      const t = leggiRispostaToken(grezzo, { ora: clock(), scopesPrecedenti: letto.scopes });
      if (!t.idToken) throw errore('OpenAI sent no identity.', 'CHATGPT_ID_TOKEN_NON_VALIDO');
      const { jwks: indirizzoJwks } = await leggiScoperta();
      const rj = await chiedi(indirizzoJwks, { headers: { accept: 'application/json' } });
      const chi = verificaIdToken(t.idToken, { jwks: rj.ok ? await rj.json().catch(() => null) : null, clientId: letto.clientId, nonce, ora: clock() });
      if (registrazione?.clientId === letto.clientId && registrazione.sub && registrazione.sub !== chi.sub) {
        throw errore('A different ChatGPT account answered.', 'CHATGPT_ALTRO_ACCOUNT');
      }
      if (tentativo?.ascolto !== ascolto) { // annullato (o sostituito da un altro tentativo) mentre lo scambio era in viaggio
        await revocaInSilenzio(t.refreshToken, letto.clientId);
        throw errore('The sign-in was cancelled.', 'CHATGPT_ACCESSO_ANNULLATO');
      }
      salva('registrazione', { clientId: letto.clientId, idDellHost: registrazione?.idDellHost, sub: chi.sub, email: chi.email });
      salva('sessione', { clientId: letto.clientId, sub: chi.sub, accessToken: t.accessToken, refreshToken: t.refreshToken, idToken: t.idToken,
        scadeAlle: t.scadeAlle, rinnovaNonPrimaDi: t.rinnovaNonPrimaDi, scopes: t.scopes });
      pagina(200, { esito: 'riuscito', titolo: testi.okTitolo, frase: t.pianoAbilitato ? testi.okFrase(chi.email) : testi.okSenzaPiano, poi: testi.okPoi });
      return { ok: true, email: chi.email, pianoAbilitato: t.pianoAbilitato };
    } catch (guasto) {
      const frasi = GUASTI_ACCESSO[guasto?.code] ?? guastoGenerico;
      pagina(400, { esito: 'fallito', titolo: testi.koTitolo, frase: frasi[lingua === 'it' ? 1 : 0], poi: testi.koPoi });
      return { ok: false, codice: guasto?.code ?? 'CHATGPT_ERRORE', codiceOpenAi: guasto?.codiceOpenAi ?? null };
    } finally {
      if (tentativo?.ascolto === ascolto) chiudiTentativo(); else ascolto.chiudi();
    }
  }

  return {
    /** Ciò che l'interfaccia può sapere. Mai un token. */
    stato() {
      const r = custodia.leggi('registrazione');
      const s = custodia.leggi('sessione');
      return { collegato: Boolean(s?.refreshToken), email: r?.email ?? null, pianoAbilitato: Boolean(s?.refreshToken) && pianoAbilitato(s.scopes),
        scadeAlle: s?.scadeAlle ?? null, accessoInCorso: Boolean(tentativo), consumi: INDIRIZZO_CONSUMI };
    },

    /**
     * Apre un tentativo e restituisce l'indirizzo da aprire nel browser di sistema e la promessa dell'esito.
     * `consenso` true solo quando la persona vuole abilitare il piano dopo un accesso che non l'aveva concesso.
     */
    async inizia({ consenso = false } = {}) {
      chiudiTentativo();
      let registrazione = custodia.leggi('registrazione');
      if (!registrazione?.idDellHost) {
        registrazione = { idDellHost: nuovoIdDellHost() };
        salva('registrazione', registrazione); // l'id dell'host si tiene dalla PRIMA richiesta, anche se l'accesso non si chiude
      }
      const sessione = custodia.leggi('sessione');
      const ascolto = await creaAscoltatore();
      const { verifier, challenge } = creaCoppiaPkce({ random });
      const stato = creaStato({ random });
      const nonce = creaNonce({ random });
      const ritornoUri = indirizzoDiRitorno(ascolto.porta);
      const indirizzo = indirizzoDiAutorizzazione({ clientId: registrazione.clientId ?? null, idDellHost: registrazione.idDellHost, ritorno: ritornoUri, stato, nonce, challenge,
        idTokenPrecedente: sessione?.idToken ?? null, email: registrazione.email ?? null, consenso: Boolean(consenso) && Boolean(registrazione.clientId) });
      const scadenza = pianifica(() => { if (tentativo?.ascolto === ascolto) chiudiTentativo(); }, tettoMs);
      scadenza?.unref?.();
      const esito = completa({ ascolto, stato, nonce, verifier, ritornoUri, registrazione });
      tentativo = { ascolto, scadenza, esito };
      return { indirizzo, scadeTraMs: tettoMs, esito };
    },

    /** Chiude il tentativo in corso (la persona ha cambiato idea). */
    annulla() { chiudiTentativo(); },

    /**
     * Il token d'accesso valido per una richiesta. Rinnova se serve. Lancia `CHATGPT_NON_COLLEGATO`, `CHATGPT_PIANO_NON_ABILITATO`,
     * `CHATGPT_ACCESSO_SCADUTO` (rifare l'accesso) o `CHATGPT_RINNOVO_FALLITO` / `CHATGPT_RETE` (riprovare).
     */
    async tokenDiAccesso({ forzaRinnovo = false } = {}) {
      const s = custodia.leggi('sessione');
      if (!s?.refreshToken || !s.accessToken) throw errore('No ChatGPT account is connected.', 'CHATGPT_NON_COLLEGATO');
      if (!pianoAbilitato(s.scopes)) throw errore('Using the ChatGPT plan is not enabled for this sign-in.', 'CHATGPT_PIANO_NON_ABILITATO');
      const ora = clock();
      const daRinnovare = forzaRinnovo || ora >= quandoRinnovare({ scadeAlle: s.scadeAlle, rinnovaNonPrimaDi: s.rinnovaNonPrimaDi });
      if (!daRinnovare) return s.accessToken;
      if (!rinnovoInCorso) {
        rinnovoInCorso = (async () => {
          try {
            const t = leggiRispostaToken(await token(corpoDelRinnovo({ clientId: s.clientId, refreshToken: s.refreshToken }), { rinnovo: true }), { ora: clock(), scopesPrecedenti: s.scopes });
            if (custodia.leggi('sessione')?.refreshToken !== s.refreshToken) { // scollegato (o ricollegato) mentre il rinnovo era in viaggio
              await revocaInSilenzio(t.refreshToken, s.clientId);
              throw errore('No ChatGPT account is connected.', 'CHATGPT_NON_COLLEGATO');
            }
            salva('sessione', { ...s, accessToken: t.accessToken, refreshToken: t.refreshToken, idToken: t.idToken ?? s.idToken, scadeAlle: t.scadeAlle,
              rinnovaNonPrimaDi: t.rinnovaNonPrimaDi, scopes: t.scopes });
            return t.accessToken;
          } catch (guasto) {
            if (guasto?.code === 'CHATGPT_ACCESSO_SCADUTO') custodia.togli('sessione');
            // un rinnovo non riuscito per rete non butta via un token che vale ancora
            if (guasto?.code !== 'CHATGPT_ACCESSO_SCADUTO' && guasto?.code !== 'CHATGPT_NON_COLLEGATO' && !forzaRinnovo && clock() < s.scadeAlle) return s.accessToken;
            throw guasto;
          } finally { rinnovoInCorso = null; }
        })();
      }
      return rinnovoInCorso;
    },

    /** Esce: revoca il refresh token e toglie la sessione. `revocaConfermata` falso = tolta qui, da scollegare anche in ChatGPT. */
    async esci() {
      chiudiTentativo();
      const s = custodia.leggi('sessione');
      let revocaConfermata = false;
      if (s?.refreshToken && s.clientId) {
        try {
          const { revoca } = await leggiScoperta();
          if (revoca) {
            const r = await chiedi(revoca, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
              body: new URLSearchParams({ token: s.refreshToken, token_type_hint: 'refresh_token', client_id: s.clientId }).toString() });
            revocaConfermata = r.status === 200;
          }
        } catch { revocaConfermata = false; }
      }
      custodia.togli('sessione');
      return { revocaConfermata };
    },
  };
}
