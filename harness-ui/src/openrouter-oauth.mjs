/**
 * PO-01 — Accedere a OpenRouter senza incollare una chiave.
 *
 * Owner 10/09/2026: «nella fase oauth aggiungi anche oauth openrouter, è già stato fatto nel
 * mobile». Fino a oggi sul desktop la chiave OpenRouter arrivava da un solo posto —
 * `env.OPENROUTER_API_KEY`, letto in `src/config.mjs:537` — cioè chi non sa cos'è una variabile
 * d'ambiente non poteva cominciare.
 *
 * ## Perché OpenRouter e non tutti e cinque i provider
 *
 * Anthropic, OpenAI e Gemini offrono OAuth solo per client «riservati», cioè con un
 * `client_secret` custodito su un server. TALOS non ha quel server e — per la premessa
 * local-first — non deve averlo. OpenRouter invece pubblica un flusso **PKCE per client
 * pubblici**: nessun segreto da custodire, la prova è che chi chiude lo scambio è lo stesso che
 * l'ha aperto.
 *
 * ## Qui dentro ci sono SOLO i conti
 *
 * Niente `http`, niente disco, niente registro globale: ogni funzione prende ciò che le serve
 * come argomento (il caso, l'orologio, il `fetch`) e si può provare senza rete. Le rotte stanno
 * in `src/http-app.mjs`; la custodia della chiave sta altrove e arriva qui come dipendenza —
 * questo modulo non scrive MAI una chiave da nessuna parte.
 *
 * ## RICERCA — fonti primarie, lette il 10/09/2026 PRIMA di scrivere
 *
 * · OpenRouter, «OAuth PKCE» (openrouter.ai/docs/guides/overview/auth/oauth):
 *     - si manda la persona su `https://openrouter.ai/auth` con `callback_url`,
 *       `code_challenge` e `code_challenge_method` (`S256` raccomandato, `plain` l'alternativa);
 *     - «localhost callbacks are supported on **any port**» ⇒ il nostro 4174 va bene com'è, non
 *       serve registrare niente da nessuna parte;
 *     - lo scambio è `POST https://openrouter.ai/api/v1/auth/keys`, `Content-Type:
 *       application/json`, corpo `{code, code_verifier, code_challenge_method}`, e la risposta è
 *       `{"key": "<user_api_key>"}`;
 *     - ⭐ **modalità senza callback**: si OMETTE `callback_url` e si aggiunge
 *       `key_label=<nome dell'app>`; la pagina MOSTRA il codice a schermo, da incollare a mano.
 *       In quella modalità il `code_challenge` è OBBLIGATORIO, perché il codice è visibile a
 *       chiunque guardi lo schermo — PKCE lo rende inutile a chi non ha il verificatore;
 *     - «The code is single-use and expires after **10 minutes**»;
 *     - gli errori dichiarati dello scambio: `400 Invalid code_challenge_method`, `403 Invalid
 *       code or code_verifier`, `403 Authorization code expired`, `405 Method Not Allowed`.
 *
 * · ⛔ **Il vincolo che dal codice non si vedeva** — lo `state`. La documentazione di OpenRouter
 *   NON lo nomina in nessun punto (riletta il 10/09/2026 cercandolo apposta). Esiste un
 *   annuncio di OpenRouter su X del 28/04/2025 — «You can now pass a state query parameter in
 *   your callback urls when integrating with OpenRouter Oauth PKCE» — ma una funzione
 *   documentata solo su un social non è un contratto su cui appoggiare l'unica porta d'ingresso
 *   di una persona. ⇒ Il nostro `stato` viaggia **nel PERCORSO** del `callback_url`
 *   (`…/ritorno/<stato>`), che nessuna implementazione può perdere perché è l'indirizzo stesso;
 *   la forma con `?state=` resta accettata dalle rotte come ripiego, così se un giorno
 *   OpenRouter la documentasse non ci sarebbe niente da cambiare.
 *
 * · La fine dello scambio non è un token con una scadenza: è **una chiave API**, uguale a quella
 *   che si sarebbe incollata a mano. Niente refresh, niente scadenza, nessuno stato da
 *   mantenere: la chiave entra nella custodia e da lì in poi non esiste più nessun «accesso
 *   OAuth» da rinnovare. Un pezzo di stato in meno per sempre.
 *
 * · RFC 7636 §4.1 (PKCE) via la pagina IETF, letta il 10/09/2026: il verificatore è una stringa
 *   di 43-128 caratteri dell'insieme «unreserved», e la sfida `S256` è
 *   `BASE64URL(SHA256(ASCII(verifier)))`.
 */

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export const INDIRIZZO_AUTORIZZAZIONE = 'https://openrouter.ai/auth';
export const INDIRIZZO_SCAMBIO = 'https://openrouter.ai/api/v1/auth/keys';

/**
 * L'etichetta che OpenRouter scrive accanto alla chiave nella pagina delle chiavi della persona.
 * Serve a lei, non a noi: è il modo in cui riconosce quale programma le ha chiesto l'accesso e
 * quale riga revocare se cambia idea. Obbligatoria nella modalità senza callback.
 */
export const ETICHETTA_CHIAVE = 'TALOS Harness Desktop';

/**
 * ⛔ IL TETTO DI TEMPO DELLA COPPIA IN ATTESA — dieci minuti, e non è un numero scelto a occhio.
 *
 * È esattamente la vita del codice di autorizzazione dichiarata da OpenRouter («The code is
 * single-use and expires after 10 minutes», doc letta il 10/09/2026). Questa finestra è quella in
 * cui un codice rubato — letto dallo schermo nella modalità senza callback, o pescato dalla barra
 * dell'indirizzo di un browser condiviso — sarebbe ancora spendibile.
 *
 * · Più corta sarebbe un danno senza guadagno: chi ha l'autenticazione a due fattori, o deve
 *   cercare la password nel gestore, impiega più di un minuto in modo del tutto legittimo, e si
 *   troverebbe davanti a un rifiuto senza aver sbagliato niente.
 * · Più lunga sarebbe superficie regalata: un verificatore che sopravvive al codice che sblocca
 *   non serve a nessuno tranne a chi quel codice l'ha rubato.
 *
 * ⇒ Il tetto giusto è quello dell'altra metà del flusso, non uno nostro.
 */
export const TETTO_ATTESA_MS = 10 * 60 * 1000;

/**
 * Quante richieste di accesso possono aspettare insieme.
 *
 * ⛔ DECISIONE, e il compito chiedeva di motivarla: due `inizia` di fila NON invalidano la
 * prima. Chi preme «Accedi» e non vede subito il browser preme una seconda volta — è il gesto
 * più comune che esista davanti a un'attesa muta — e se il secondo `inizia` uccidesse il primo,
 * la scheda che si è aperta davvero (quella del PRIMO giro, perché il browser è lento a
 * comparire) tornerebbe con un codice ormai orfano. Il risultato che vedrebbe la persona è
 * «non funziona mai», con due tentativi entrambi legittimi.
 *
 * Il rischio opposto — un accumulo illimitato di verificatori vivi — è chiuso da due lati: il
 * tetto di tempo qui sopra e questo tetto di numero, che butta prima le scadute e poi la più
 * vecchia. Otto è largo per una persona e stretto per un ciclo impazzito.
 */
export const ATTESE_MASSIME = 8;

function erroreConCodice(messaggio, code) {
  return Object.assign(new Error(messaggio), { code });
}

/** base64url: base64 senza `+`, `/` e senza il riempimento finale (RFC 7636 §A). */
export function base64Url(bytes) {
  return Buffer.from(bytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * La coppia PKCE: un verificatore casuale e la sua sfida.
 *
 * 32 byte casuali in base64url danno esattamente 43 caratteri, cioè il minimo consentito da
 * RFC 7636 §4.1 con la massima entropia per carattere. Allungare la stringa non aggiunge niente:
 * l'entropia sta nei byte, non nel numero di lettere.
 *
 * ⛔ `S256` e mai `plain`: con `plain` la sfida È il verificatore, quindi chiunque legga
 * l'indirizzo di autorizzazione (la barra del browser, la cronologia, un log di un proxy) può
 * chiudere lo scambio al posto nostro — che è precisamente ciò da cui PKCE difende.
 *
 * ⛔ Il caso arriva da `node:crypto`, mai da `Math.random()`: quello è un generatore
 * deterministico pensato per le simulazioni, e il suo stato interno si ricostruisce da poche
 * uscite osservate.
 */
export function creaCoppiaPkce({ random = (quanti) => randomBytes(quanti) } = {}) {
  const byte = random(32);
  if (!byte || typeof byte.length !== 'number' || byte.length < 32) {
    throw erroreConCodice('Sorgente di casualità insufficiente', 'OAUTH_CASO_INSUFFICIENTE');
  }
  const verifier = base64Url(byte);
  const challenge = base64Url(createHash('sha256').update(verifier, 'ascii').digest());
  return { verifier, challenge };
}

/** Uno `stato` opaco: 32 byte di caso, nient'altro. Non contiene niente, e per questo non dice niente. */
export function creaStato({ random = (quanti) => randomBytes(quanti) } = {}) {
  return base64Url(random(32));
}

/**
 * L'indirizzo su cui mandare la persona.
 *
 * Con `callbackUrl`: il browser rientra da solo su quell'indirizzo (modalità normale).
 * Senza: la pagina di OpenRouter MOSTRA il codice a schermo e la persona lo incolla in TALOS —
 * è la sola strada per chi usa TALOS su un server remoto, dove `127.0.0.1` è la macchina
 * sbagliata. In quella modalità `key_label` è richiesto dalla documentazione.
 *
 * ⛔ `code_challenge` c'è SEMPRE, in tutte e due le modalità: la documentazione lo dichiara
 * facoltativo nella prima e obbligatorio nella seconda, ma un flusso senza PKCE è un flusso in
 * cui il codice, da solo, basta a farsi dare una chiave.
 */
export function indirizzoDiAutorizzazione({ challenge, callbackUrl = null, etichetta = ETICHETTA_CHIAVE } = {}) {
  if (typeof challenge !== 'string' || challenge.trim() === '') {
    throw erroreConCodice('Manca la sfida PKCE', 'OAUTH_SFIDA_MANCANTE');
  }
  const url = new URL(INDIRIZZO_AUTORIZZAZIONE);
  if (callbackUrl !== null && callbackUrl !== undefined) {
    if (typeof callbackUrl !== 'string' || callbackUrl.trim() === '') {
      throw erroreConCodice('Indirizzo di ritorno non valido', 'OAUTH_RITORNO_INVALIDO');
    }
    url.searchParams.set('callback_url', callbackUrl.trim());
  } else {
    url.searchParams.set('key_label', etichetta);
  }
  url.searchParams.set('code_challenge', challenge.trim());
  url.searchParams.set('code_challenge_method', 'S256');
  return url.toString();
}

/**
 * Lo scambio: il codice più il verificatore diventano una chiave API.
 *
 * Nessun `client_secret`, che è tutto il punto del flusso pubblico. Se il codice fosse stato
 * intercettato da un'altra applicazione sulla stessa macchina, questa chiamata fallirebbe: il
 * verificatore che lo sblocca non ha mai lasciato questo processo.
 *
 * ⛔ I guasti sono TRE cose diverse e restano tre codici diversi — la rete che non risponde, un
 * rifiuto di OpenRouter, una risposta che non contiene la chiave. Chi legge a schermo «non ha
 * funzionato» e basta non sa se deve riprovare, ricominciare l'accesso o smettere.
 * ⛔ Il corpo della risposta di errore NON viene mai rimesso nel messaggio: in un flusso di
 * autenticazione un corpo di risposta è precisamente il posto dove passano i segreti.
 */
export async function scambiaCodicePerChiave({ codice, verifier, fetchDiRete = globalThis.fetch } = {}) {
  const codiceRipulito = typeof codice === 'string' ? codice.trim() : '';
  const verifierRipulito = typeof verifier === 'string' ? verifier.trim() : '';
  if (codiceRipulito === '') throw erroreConCodice('Manca il codice di accesso', 'OAUTH_CODICE_MANCANTE');
  if (verifierRipulito === '') throw erroreConCodice('Manca il verificatore', 'OAUTH_VERIFIER_MANCANTE');
  if (typeof fetchDiRete !== 'function') throw erroreConCodice('Nessun modo di uscire in rete', 'OAUTH_RETE');

  let risposta;
  try {
    risposta = await fetchDiRete(INDIRIZZO_SCAMBIO, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        code: codiceRipulito,
        code_verifier: verifierRipulito,
        code_challenge_method: 'S256',
      }),
    });
  } catch {
    // ⛔ Il messaggio dell'eccezione di rete non viaggia: può contenere l'indirizzo completo, e
    //    con esso, in altre implementazioni, la query. Il codice basta a sapere cosa fare.
    throw erroreConCodice('OpenRouter non è raggiungibile', 'OAUTH_RETE');
  }

  if (!risposta || typeof risposta.ok !== 'boolean') {
    throw erroreConCodice('Risposta di OpenRouter non riconoscibile', 'OAUTH_RISPOSTA_INATTESA');
  }
  if (!risposta.ok) {
    // Lo stato HTTP sì (403 «codice scaduto» è un'informazione utile e non è un segreto), il corpo no.
    throw Object.assign(
      erroreConCodice('OpenRouter ha rifiutato questo accesso', 'OAUTH_SCAMBIO_RIFIUTATO'),
      { stato: risposta.status ?? 0 },
    );
  }

  let corpo;
  try {
    corpo = await risposta.json();
  } catch {
    throw erroreConCodice('OpenRouter ha risposto qualcosa che non è JSON', 'OAUTH_RISPOSTA_INATTESA');
  }
  const chiave = corpo && typeof corpo === 'object' && typeof corpo.key === 'string' ? corpo.key.trim() : '';
  if (chiave === '') {
    /*
     * ⛔ DA DECIDERE ALL'OWNER, registrato qui perché è il punto in cui si romperebbe: se un
     *   domani OpenRouter cambiasse il nome del campo (`api_key`, `data.key`, …) il flusso
     *   morirebbe qui, con questo codice. Non indoviniamo forme alternative — accettare un campo
     *   che oggi non esiste vuol dire accettare, il giorno in cui esisterà, qualcosa di cui non
     *   sappiamo il significato. Meglio un guasto pulito e riconoscibile.
     */
    throw erroreConCodice('La risposta di OpenRouter non contiene una chiave', 'OAUTH_RISPOSTA_INATTESA');
  }
  return { chiave };
}

/**
 * Il registro delle richieste di accesso in attesa: `stato` → verificatore.
 *
 * ⛔ Vive SOLO in memoria e SOLO in questo processo. Un verificatore su disco sarebbe un segreto
 * scritto per una finestra di dieci minuti e lasciato lì per sempre; e non servirebbe a niente,
 * perché un riavvio del server interrompe comunque il giro di accesso della persona.
 *
 * ⛔ `consuma` è a uso singolo: la voce sparisce alla prima lettura, riuscita o no. Un codice di
 * autorizzazione è a uso singolo per OpenRouter, e non c'è nessuna ragione per cui il nostro
 * lato debba essere più permissivo del suo.
 */
export function creaRegistroAttese({
  clock = () => Date.now(),
  tettoMs = TETTO_ATTESA_MS,
  massime = ATTESE_MASSIME,
  random = (quanti) => randomBytes(quanti),
} = {}) {
  /** @type {Map<string, {verifier: string, scadenza: number, conRitorno: boolean}>} */
  const attese = new Map();

  function scadute(adesso) {
    for (const [stato, voce] of attese) if (voce.scadenza <= adesso) attese.delete(stato);
  }

  return {
    /**
     * Apre una richiesta: genera la coppia, la lega a uno `stato` opaco e restituisce
     * l'indirizzo da aprire. `costruisciRitorno(stato)` produce il `callback_url`; se è `null`
     * si va in modalità «codice a schermo».
     */
    apri({ costruisciRitorno = null, etichetta = ETICHETTA_CHIAVE } = {}) {
      const adesso = clock();
      scadute(adesso);
      // Il tetto di numero si applica DOPO aver buttato le scadute: quasi sempre non morde.
      while (attese.size >= massime) attese.delete(attese.keys().next().value);
      const stato = creaStato({ random });
      const { verifier, challenge } = creaCoppiaPkce({ random });
      const callbackUrl = typeof costruisciRitorno === 'function' ? costruisciRitorno(stato) : null;
      const indirizzo = indirizzoDiAutorizzazione({ challenge, callbackUrl, etichetta });
      attese.set(stato, { verifier, scadenza: adesso + tettoMs, conRitorno: Boolean(callbackUrl) });
      return { stato, indirizzo, modo: callbackUrl ? 'browser' : 'schermo', scadeTraMs: tettoMs };
    },

    /**
     * Consuma uno `stato` e restituisce il suo verificatore. Lancia — con UN SOLO codice — se lo
     * stato è sconosciuto, già usato o scaduto.
     *
     * ⛔ Un solo codice per i tre casi, di proposito: distinguerli direbbe a chi bussa da fuori
     * se uno stato è mai esistito, cioè trasformerebbe questa rotta in un oracolo su cui provare
     * stati a caso. Dentro, per chi legge il codice, i tre casi restano distinti dalla logica.
     * ⛔ Il confronto è a tempo costante: `Map.get` sarebbe già abbastanza, ma il pareggio va
     * fatto sul contenuto e non sulla presenza della chiave, così un attaccante non impara nulla
     * dal tempo di risposta.
     */
    consuma(stato) {
      const adesso = clock();
      scadute(adesso);
      const chiesto = Buffer.from(typeof stato === 'string' ? stato : '', 'utf8');
      let trovata = null;
      for (const candidato of attese.keys()) {
        const atteso = Buffer.from(candidato, 'utf8');
        // ⛔ `timingSafeEqual` LANCIA su lunghezze diverse: il confronto di lunghezza va fatto
        //    prima, ed è l'unica cosa che questo giro rivela (quanto è lungo uno stato: è noto).
        if (atteso.length !== chiesto.length) continue;
        if (timingSafeEqual(atteso, chiesto)) { trovata = candidato; break; }
      }
      if (trovata === null) throw erroreConCodice('Questa richiesta di accesso non è più valida', 'OAUTH_ATTESA_IGNOTA');
      const voce = attese.get(trovata);
      attese.delete(trovata); // uso singolo: sparisce comunque, anche se lo scambio poi fallirà
      return { verifier: voce.verifier, conRitorno: voce.conRitorno };
    },

    /** Solo per le prove e per Doctor: quante ne stanno aspettando adesso. Mai i verificatori. */
    quanteInAttesa() {
      scadute(clock());
      return attese.size;
    },
  };
}

/**
 * L'indirizzo di ritorno, costruito dall'`Host` con cui la richiesta è arrivata.
 *
 * ⛔ L'`Host` è un'intestazione scritta dal client: non ci si costruisce sopra niente senza
 * averla prima riconosciuta. Qui passano SOLO le forme di loopback — che sono anche le sole che
 * OpenRouter accetta per un callback non-https («localhost callbacks are supported on any
 * port») — e qualunque altra cosa vale `null`, cioè «vai in modalità codice a schermo», che è
 * per l'appunto il caso di chi usa TALOS da remoto.
 */
const HOST_DI_LOOPBACK = /^(?:127\.0\.0\.1|localhost|\[::1\])(?::(?:\d{1,5}))?$/u;

export function ritornoDaHost(host, stato) {
  if (typeof host !== 'string' || !HOST_DI_LOOPBACK.test(host.trim())) return null;
  return `http://${host.trim()}/api/v1/auth/openrouter/ritorno/${encodeURIComponent(stato)}`;
}
