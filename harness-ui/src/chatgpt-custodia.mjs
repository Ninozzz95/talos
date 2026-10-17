/**
 * «Continue with ChatGPT» — la custodia: registrazione e token nel portachiavi del sistema, mai su file.
 *
 * Due voci distinte, perché hanno vite diverse (developers.openai.com/siwc/token-sharing-open-source/profiles-and-sessions,
 * riletta l'11/10/2026: «Signing out keeps the account-to-client mapping and the host ID for a later sign-in»):
 *   · `registrazione` — il client emesso (`oaiapp_…`), l'id dell'host, l'identità dell'account. Sopravvive all'uscita.
 *   · `sessione`      — i token e le loro scadenze. L'uscita la toglie.
 *
 * ⛔ IL LIMITE CHE DAL CODICE NON SI VEDEVA — misurato l'11/10/2026 su questo Windows con `@napi-rs/keyring` 1.3.0: una voce
 *   del Credential Manager tiene al massimo **1280 caratteri** (2560 byte in UTF-16; a 1281 la scrittura è rifiutata: «longer
 *   than the platform limit of 2560»). Un token di OpenAI è un JWT più lungo di così. ⇒ Ogni voce si scrive a PEZZI.
 *
 * Scrittura senza stati a metà: i pezzi nuovi vanno sotto una generazione nuova, poi si scrive l'indice (un solo valore, che
 * fa da interruttore), poi si tolgono i pezzi vecchi. Chi legge mentre si scrive vede la voce vecchia intera o la nuova intera.
 * Una voce illeggibile (pezzo mancante, JSON rotto) si legge come ASSENTE: la persona rifà l'accesso, non resta con mezzo token.
 */

export const SERVIZIO_CHATGPT = 'talos-harness-chatgpt';
/** Sotto il limite misurato di 1280, con margine. */
export const CARATTERI_PER_PEZZO = 1200;
export const VOCI = Object.freeze(['registrazione', 'sessione']);
const PEZZI_MASSIMI = 64;

function errore(messaggio, code) {
  return Object.assign(new Error(messaggio), { code });
}

export function creaCustodiaChatgpt({ keyring, generazione = () => Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36) } = {}) {
  if (!keyring || typeof keyring.get !== 'function' || typeof keyring.set !== 'function' || typeof keyring.remove !== 'function') {
    throw errore('The ChatGPT sign-in needs the system keyring.', 'CHATGPT_CUSTODIA_ASSENTE');
  }
  const controlla = (voce) => { if (!VOCI.includes(voce)) throw errore('Unknown ChatGPT keyring entry.', 'CHATGPT_CUSTODIA_VOCE'); };
  /* `severo`: un GUASTO del portachiavi in lettura si propaga (serve a `togli`, che deve sapere quali pezzi togliere); senza,
     resta «non c'è» come per un indice illeggibile — chi legge per USARE la sessione non ha altro da fare */
  const leggiIndice = (voce, { severo = false } = {}) => {
    let grezzo;
    try { grezzo = keyring.get(SERVIZIO_CHATGPT, `${voce}:indice`); } catch (guasto) { if (severo) throw guasto; return null; }
    if (!grezzo) return null;
    try {
      const indice = JSON.parse(grezzo);
      return typeof indice?.g === 'string' && Number.isInteger(indice.n) && indice.n > 0 && indice.n <= PEZZI_MASSIMI ? indice : null;
    } catch { return null; }
  };
  /* ⛔ MOTORE-REV-01 (revisione del bugfixer, 14/10): il portachiavi di sistema NON lancia per una voce assente (misurato:
     `deletePassword()` → false), quindi un `remove` che lancia è un guasto vero — il pezzo RESTA. Si provano tutti e si
     restituisce quanti sono rimasti; chi deve dirlo lo dice. */
  const togliPezzi = (voce, indice) => {
    if (!indice) return 0;
    let rimasti = 0;
    for (let i = 0; i < indice.n; i += 1) { try { keyring.remove(SERVIZIO_CHATGPT, `${voce}:${indice.g}:${i}`); } catch { rimasti += 1; } }
    return rimasti;
  };

  return {
    /** L'oggetto salvato, o `null` se la voce non c'è o non si legge per intero. */
    leggi(voce) {
      controlla(voce);
      const indice = leggiIndice(voce);
      if (!indice) return null;
      try {
        let testo = '';
        for (let i = 0; i < indice.n; i += 1) {
          const pezzo = keyring.get(SERVIZIO_CHATGPT, `${voce}:${indice.g}:${i}`);
          if (typeof pezzo !== 'string' || pezzo === '') return null;
          testo += pezzo;
        }
        const oggetto = JSON.parse(testo);
        return oggetto && typeof oggetto === 'object' ? oggetto : null;
      } catch { return null; }
    },

    /** Scrive l'oggetto. Se una scrittura fallisce lancia `CHATGPT_CUSTODIA_FALLITA` e la voce di prima resta com'era. */
    scrivi(voce, oggetto) {
      controlla(voce);
      if (!oggetto || typeof oggetto !== 'object') throw errore('Nothing to store.', 'CHATGPT_CUSTODIA_VOCE');
      const testo = JSON.stringify(oggetto);
      const pezzi = [];
      for (let i = 0; i < testo.length; i += CARATTERI_PER_PEZZO) pezzi.push(testo.slice(i, i + CARATTERI_PER_PEZZO));
      if (pezzi.length > PEZZI_MASSIMI) throw errore('The ChatGPT credentials are too large for the keyring.', 'CHATGPT_CUSTODIA_FALLITA');
      const prima = leggiIndice(voce);
      const nuovo = { g: generazione(), n: pezzi.length };
      if (prima && prima.g === nuovo.g) throw errore('The keyring generation did not change.', 'CHATGPT_CUSTODIA_FALLITA');
      try {
        pezzi.forEach((pezzo, i) => keyring.set(SERVIZIO_CHATGPT, `${voce}:${nuovo.g}:${i}`, pezzo));
        keyring.set(SERVIZIO_CHATGPT, `${voce}:indice`, JSON.stringify(nuovo)); // l'interruttore
      } catch {
        togliPezzi(voce, nuovo); // niente pezzi orfani (al meglio); l'indice vecchio punta ancora ai pezzi vecchi
        throw errore('The system keyring refused to store the ChatGPT credentials.', 'CHATGPT_CUSTODIA_FALLITA');
      }
      /* i pezzi VECCHI dopo una scrittura riuscita: al meglio — la sessione nuova è salvata e attiva, e quelli non li legge più
         nessuno (l'indice punta ai nuovi); dire «non salvata» sarebbe falso */
      togliPezzi(voce, prima);
    },

    /** Toglie la voce. Non lancia se non c'era; lancia `CHATGPT_USCITA_INCOMPLETA` se il portachiavi rifiuta (MOTORE-REV-01). */
    togli(voce) {
      controlla(voce);
      let indice;
      try { indice = leggiIndice(voce, { severo: true }); } catch {
        throw errore('The system keyring could not be read to remove the ChatGPT credentials.', 'CHATGPT_USCITA_INCOMPLETA');
      }
      let rimasti = 0;
      try { keyring.remove(SERVIZIO_CHATGPT, `${voce}:indice`); } catch { rimasti += 1; }
      rimasti += togliPezzi(voce, indice);
      if (rimasti > 0) throw errore('The system keyring refused to remove the ChatGPT credentials.', 'CHATGPT_USCITA_INCOMPLETA');
    },
  };
}
