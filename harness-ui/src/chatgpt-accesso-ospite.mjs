/**
 * Il piano ChatGPT quando il custode è L'APP che ospita r4 (il telefono), non r4.
 *
 * ⛔ Legge dell'owner, 18/10/2026 notte: nel Codice del telefono entra tutto quello che c'è nella chat, «un solo accesso». La chat ha
 *   la sua custodia (Keystore, rinnovo uno alla volta) e r4 aveva la sua (`chatgpt-custodia.mjs`): il refresh token RUOTA a ogni uso,
 *   quindi due custodi che rinnovano si bruciano a vicenda. ⇒ Qui r4 non tiene né rinnova MAI un refresh token.
 *
 * Il verso (concordato con la sessione mobile il 18/10/2026, sul suo codice): l'app SPINGE il token di accesso, come fa già con le
 *   chiavi dei fornitori prima di ogni giro (`primaDiInviare` → `POST /api/v1/providers/:id/key`); r4 lo tiene solo in memoria. r4 non
 *   ha un canale verso l'app (gira come processo figlio, `TalosR4Avvio.kt:129`), e aprire un server dentro l'app per farsi chiamare
 *   sarebbe superficie nuova raggiungibile da altre app su 127.0.0.1.
 * Come Codex nella sostanza (letto il 18/10/2026, clone `codex-2026-10-16`): con l'autenticazione ESTERNA il motore non rinnova da sé
 *   (`app-server-protocol/src/protocol/v2/account.rs:547-549`, «In external auth mode … Clients should refresh tokens themselves»), e un
 *   401 è il segnale che serve un token nuovo dal cliente (`ChatgptAuthTokensRefreshReason::Unauthorized`, `:271-274`). Codex lo chiede
 *   con una richiesta al cliente; qui, senza canale, r4 lo DICE col codice `CHATGPT_TOKEN_DA_RINNOVARE` e l'app rinnova e riprova.
 *
 * Stessa forma di `creaAccessoChatgpt` (`stato`, `tokenDiAccesso`, `inizia`, `annulla`, `esci`), così rotte e runtime non cambiano; in più
 * `ricevi` e `dimentica`, che usa la rotta `POST /api/v1/providers/chatgpt/access(/remove)`. La modalità si accende con la variabile
 * d'ambiente `TALOS_CHATGPT_CUSTODE=app` (non è un segreto: non passa dallo stdin, dove andrebbe al portachiavi).
 * Nessun token entra mai in un messaggio d'errore o in ciò che `stato()` restituisce.
 */

import { INDIRIZZO_CONSUMI } from './chatgpt-accesso.mjs';

/** Un giro non parte con un token che scade entro questo margine: l'app ne spinge uno che vale almeno 10 minuti (contratto). */
export const MARGINE_OSPITE_MS = 5 * 60 * 1000;
export const CODICE_DA_RINNOVARE = 'CHATGPT_TOKEN_DA_RINNOVARE';

function errore(messaggio, code) {
  return Object.assign(new Error(messaggio), { code });
}

export function creaAccessoChatgptOspite({ clock = () => Date.now() } = {}) {
  let attuale = null; // { accessToken, accountId, email, scadeAlle }

  return {
    gestitoDallApp: true,

    /** Il token spinto dall'app. Torna l'errore da dire alla rotta, o `null` se l'ha tenuto. */
    ricevi({ accessToken, scadeAlle, accountId = null } = {}) {
      if (typeof accessToken !== 'string' || accessToken.trim() === '') return errore('The access token is missing.', 'CHATGPT_ACCESSO_NON_VALIDO');
      if (!Number.isFinite(scadeAlle)) return errore('The access token carries no expiry.', 'CHATGPT_ACCESSO_NON_VALIDO');
      if (scadeAlle <= clock()) return errore('The access token has already expired.', CODICE_DA_RINNOVARE);
      attuale = { accessToken, scadeAlle, accountId: typeof accountId === 'string' && accountId ? accountId : null };
      return null;
    },

    /** Scollegato nella chat, o rifiutato dal servizio: r4 non ha più nessun token. */
    dimentica() { attuale = null; },

    stato() {
      const vale = Boolean(attuale) && clock() < attuale.scadeAlle;
      /* niente email: l'app non la manda fuori dalla chat (contratto del 18/10); l'account sì, serve a rileggere l'elenco dei modelli */
      return { collegato: vale, email: null, accountId: attuale?.accountId ?? null, pianoAbilitato: vale, scadeAlle: attuale?.scadeAlle ?? null,
        accessoInCorso: false, consumi: INDIRIZZO_CONSUMI, gestitoDallApp: true };
    },

    async inizia() {
      throw errore('The ChatGPT sign-in is managed by the app: sign in from the chat.', 'CHATGPT_GESTITO_DALL_APP');
    },

    annulla() {},

    /**
     * Il token di adesso. Niente rinnovo qui, mai: senza token, con un token che scade entro il margine, o con `forzaRinnovo` (il
     * servizio ha rifiutato quello di prima, 401) si dimentica quello che c'era e si dice `CHATGPT_TOKEN_DA_RINNOVARE`.
     */
    async tokenDiAccesso({ forzaRinnovo = false } = {}) {
      if (forzaRinnovo) attuale = null;
      if (!attuale || clock() >= attuale.scadeAlle - MARGINE_OSPITE_MS) {
        attuale = null;
        throw errore('The ChatGPT access token must be renewed by the app.', CODICE_DA_RINNOVARE);
      }
      return attuale.accessToken;
    },

    async esci() {
      throw errore('The ChatGPT account is managed by the app: disconnect it from the chat.', 'CHATGPT_GESTITO_DALL_APP');
    },
  };
}
