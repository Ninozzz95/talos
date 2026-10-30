/*
 * ⭐⭐⭐ 22/10/2026 — IL RITMO DELLA RISPOSTA: il testo che arriva a pacchetti esce a flusso continuo, con un ritardo DICHIARATO.
 *
 * Owner, 22/10/2026: «quando chiedo al modello un output lungo, o dopo una conversazione lunga, il rendering dello streaming è
 * molto scattoso, si ferma … voglio un'animazione estremamente veloce, ottimizzata, ma fluida e dinamica in base al testo».
 *
 * ⛔ LA MISURA, prima di tutto (giro vero sulla 4176, `z-ai/glm-5.3-flash` a sforzo massimo, Chrome con GPU, schermo a 165 Hz):
 *   11.224 caratteri in 988 delta, ma i delta NON arrivano uno alla volta — arrivano a PACCHETTI: 620 intervalli su 987 sotto i
 *   5 ms. Raggruppati, sono 331 pacchetti da ~35 caratteri (p90 56) ogni ~145 ms (p90 289, massimo 480). A schermo: 8.118
 *   fotogrammi su 8.506 FERMI (95%), poi un salto fino a 74 caratteri, pause fino a 479 ms. Il testo non scorreva: saltava a
 *   gradini da 35 caratteri sei volte al secondo. È la cadenza del FILO, ed è la ragione per cui la colpa non stava nel disegno:
 *   il render costava 0,2-0,5 ms.
 *
 * ⇒ LA CURA È UNA PIANIFICAZIONE A SCADENZE. Ogni pacchetto arrivato ha una scadenza: il suo arrivo più `ritardoMaxMs`. A ogni
 *   fotogramma si va alla velocità MINIMA che fa stare a schermo, entro la sua scadenza, tutto ciò che è arrivato:
 *       v = max_k ( (fino_k − mostrato) / (scadenza_k − adesso) )
 *   È l'algoritmo «Optimal Available» di Yao, Demers e Shenker («A scheduling model for reduced CPU energy», FOCS 1995): per
 *   lavori con un rilascio e una scadenza, la velocità minima che le rispetta tutte è anche la più UNIFORME possibile (la
 *   «corda tesa» sotto la curva degli arrivi) — che è esattamente ciò che l'occhio vuole da un testo che scorre.
 *   Tre proprietà vengono dalla forma, e sono quelle che servivano:
 *   1. un buco fra due pacchetti fino a `ritardoMaxMs` si ATTRAVERSA: il pacchetto si stende sul tempo che ha a disposizione
 *      invece di uscire tutto e poi fermarsi (l'«anticipo», che qui è la scadenza stessa);
 *   2. un dump enorme non resta indietro: la sua scadenza è la stessa di tutti — esce in `ritardoMaxMs`, rotolando, mai a strappi
 *      di secondi (il difetto del 20/09: un tetto di 30 caratteri per flush, ≈ 900 car/s, contro un fornitore più veloce);
 *   3. il RITARDO MASSIMO È UN CONTRATTO, non una media: nessun carattere sta fuori schermo oltre `ritardoMaxMs` dal suo arrivo,
 *      con qualunque fornitore. È ciò che il cancello del 14/09 (`STREAMING-LIVE-SMOOTH-03`) voleva proteggere, scritto come
 *      limite invece che come «un fotogramma».
 *   E due correzioni pratiche:
 *   · sotto la velocità minima pura, un pacchetto piccolo con la scadenza lontana gocciolerebbe un carattere ogni cinque
 *     fotogrammi: non si va mai sotto metà del RITMO STIMATO del fornitore (la stima di VS Code, `common/model/chatStreamStats.ts`:
 *     caratteri sui pacchetti recenti, i buchi lunghi esclusi — «we ignore long pauses» — e un avvio che vale 250 ms);
 *   · a messaggio finito la scadenza di tutto diventa «fra `fineMs`» (VS Code accelera allo stesso modo dopo la fine,
 *     `wordBuffer.ts`, `MIN_RATE_AFTER_COMPLETE`).
 * ⭐ Il passo in più sui concorrenti, letti nel codice il 22/10/2026: VS Code va alla velocità stimata (`wordBuffer.ts`, MIN 40 /
 *   MAX 2000 parole/s) e si ferma a ogni buco; Codex TUI scarica tutta la coda quando è indietro (`streaming/chunking.rs:85-116`,
 *   entra a 8 righe o 120 ms d'età) — un salto voluto, con l'isteresi per non sfarfallare; Hermes (`markdown-text.tsx:834`,
 *   «No `smooth` on purpose») non ha ritmo e accoda soltanto, a 33-250 ms. Qui non c'è una marcia da scegliere: la velocità che
 *   rispetta le scadenze varia con continuità, e niente può sfarfallare. Simulato sulla traccia vera (un regolatore a
 *   retroazione con recupero a isteresi, la prima forma scritta, restava in recupero il 94% del tempo): passo per fotogramma con
 *   coefficiente di variazione da 5,3 a ~0,6, passo massimo da 76 a 4-9 caratteri, ritardo massimo 260 ms esatti.
 *
 * ⛔ Modulo PURO: niente DOM, niente orologio proprio (l'ora la passa chi chiama), così si prova in Node e si simula sulla
 *   traccia vera (`tests/unit/ritmo-streaming.test.mjs`). Il monolite lo usa in `avanzaRitmoStreaming` (`legacy/app.js`).
 */

export const RITMO_DI_SERIE = Object.freeze({
  /** Il ritardo massimo del testo a schermo rispetto al suo arrivo: la scadenza di ogni pacchetto. */
  ritardoMaxMs: 260,
  /** Mai sotto questa frazione del ritmo stimato del fornitore, finché c'è testo da mostrare: calmo, mai a gocce. */
  frazioneRitmo: 0.5,
  /** Due arrivi entro questo tempo sono lo STESSO pacchetto (lo stesso read di rete). */
  stessoPacchettoMs: 8,
  /** La finestra della stima del ritmo (pacchetti recenti). */
  finestraRitmoMs: 1600,
  /** Il buco più lungo che entra nella stima del ritmo: oltre, il fornitore è fermo (un attrezzo, un ragionamento), non lento. */
  bucoMassimoStimaMs: 600,
  /** Il ritmo stimato sta fra questi due (caratteri al secondo). */
  ritmoStimatoMin: 30,
  ritmoStimatoMax: 12000,
  /** Alla fine del messaggio, il resto esce entro questo tempo. */
  fineMs: 110,
  /** Un salto di tempo (finestra tornata visibile, scheda in pausa) non diventa un passo enorme. */
  passoMassimoMs: 100,
});

/**
 * Un ritmo per UN messaggio. `arrivo(totale, ora)` a ogni delta (con la lunghezza TOTALE ricevuta finora), `concludi(ora)` alla
 * fine del messaggio, `avanza(ora)` a ogni fotogramma: restituisce quanti caratteri mostrare (intero, mai oltre il ricevuto).
 */
export function creaRitmo(opzioni = {}) {
  const c = { ...RITMO_DI_SERIE, ...opzioni };
  let totale = 0;
  let mostrato = 0; // reale: le frazioni si accumulano fra un fotogramma e l'altro
  let ultimoAvanza = null;
  let fineAlle = null;
  /** gli arrivi non ancora a schermo, `{ t, fino }`: le scadenze */
  const arrivi = [];
  /** i pacchetti recenti `{ t, tf, n }`, per il ritmo stimato */
  const pacchetti = [];

  function arrivo(nuovoTotale, ora) {
    if (!(nuovoTotale > totale)) return;
    const n = nuovoTotale - totale;
    totale = nuovoTotale;
    arrivi.push({ t: ora, fino: totale });
    const ultimo = pacchetti[pacchetti.length - 1];
    if (ultimo && ora - ultimo.tf <= c.stessoPacchettoMs) {
      ultimo.n += n;
      ultimo.tf = ora;
    } else {
      pacchetti.push({ t: ora, tf: ora, n });
    }
    while (pacchetti.length > 2 && ora - pacchetti[0].t > c.finestraRitmoMs) pacchetti.shift();
  }

  function concludi(ora) {
    if (fineAlle === null) fineAlle = ora;
  }

  /** caratteri al secondo, dai pacchetti recenti; i buchi lunghi contano al più `bucoMassimoStimaMs` */
  function ritmoStimato() {
    if (pacchetti.length === 0) return c.ritmoStimatoMin;
    if (pacchetti.length === 1) {
      /* avvio (VS Code: «we apply an assumed minimum time»): il primo pacchetto vale come prodotto in 250 ms */
      return Math.min(c.ritmoStimatoMax, Math.max(c.ritmoStimatoMin, pacchetti[0].n / 0.25));
    }
    let caratteri = 0;
    let tempo = 0;
    for (let i = 1; i < pacchetti.length; i += 1) {
      caratteri += pacchetti[i].n;
      tempo += Math.min(pacchetti[i].t - pacchetti[i - 1].t, c.bucoMassimoStimaMs);
    }
    const r = tempo > 0 ? caratteri / (tempo / 1000) : c.ritmoStimatoMax;
    return Math.min(c.ritmoStimatoMax, Math.max(c.ritmoStimatoMin, r));
  }

  function scadenza(a, ora) {
    const propria = a.t + c.ritardoMaxMs;
    return fineAlle === null ? propria : Math.min(propria, Math.max(fineAlle + c.fineMs, ora));
  }

  function avanza(ora) {
    const dtMs = ultimoAvanza === null ? 16 : Math.min(c.passoMassimoMs, Math.max(0, ora - ultimoAvanza));
    ultimoAvanza = ora;
    while (arrivi.length > 0 && arrivi[0].fino <= mostrato) arrivi.shift();
    if (totale - mostrato <= 0) { mostrato = totale; return totale; }
    /* la velocità minima che rispetta tutte le scadenze (caratteri al millisecondo); un pacchetto già in scadenza esce adesso */
    let v = 0;
    for (const a of arrivi) {
      const tempo = Math.max(scadenza(a, ora) - ora, dtMs);
      v = Math.max(v, (a.fino - mostrato) / tempo);
    }
    v = Math.max(v, (ritmoStimato() * c.frazioneRitmo) / 1000);
    mostrato = Math.min(totale, mostrato + v * dtMs);
    return Math.floor(mostrato);
  }

  return {
    arrivo,
    concludi,
    avanza,
    /** mostra subito tutto (finestra nascosta, movimento spento, storia): il ritmo riparte da qui */
    raggiungi(ora) { mostrato = totale; ultimoAvanza = ora; arrivi.length = 0; },
    /** chi disegna ha mostrato fino a `k` (un segno che non si vede passa in un colpo): il ritmo non lo ripaga in tempo */
    allinea(k) { if (k > mostrato) mostrato = Math.min(totale, k); },
    get totale() { return totale; },
    get mostrato() { return Math.floor(mostrato); },
    get finito() { return fineAlle !== null; },
    /** per le prove e per il log: lo stato della marcia */
    diagnosi(ora) {
      const prossima = arrivi.find((a) => a.fino > mostrato);
      return { ritmo: Math.round(ritmoStimato()), arretrato: totale - Math.floor(mostrato), etaMs: prossima ? Math.round(ora - prossima.t) : 0 };
    },
  };
}

/*
 * 28/10/2026 — QUANTE PAROLE COMINCIANO in un tratto appena rivelato. Il ritmo rivela pochi caratteri a fotogramma, e contare le
 *   parole DENTRO il tratto («Sec», poi «onda» = due) dava un tempo in più per ogni parola spezzata: la dissolvenza, che assegna i
 *   tempi camminando all'indietro dalla coda (`avvolgiParoleRecenti`), li faceva cadere sulle parole già a schermo, che tornavano
 *   a salire dal trasparente (misurato: 0,42 · 0,69 · 0,84 dall'ultima indietro, al pezzo dopo una pausa).
 * ⇒ Una parola si conta dove COMINCIA, come Streamdown (`packages/streamdown/lib/animate.ts:571`, clone del 23/10/2026:
 *   `skipAnimation = prevLen > 0 && partStart < prevLen`): un carattere non bianco preceduto da un bianco, o dall'inizio del testo —
 *   guardando anche il carattere PRIMA del tratto.
 */
export function paroleCheInizianoNelTratto(testo, da, a) {
  const s = String(testo ?? '');
  const fine = Math.min(a, s.length);
  let parole = 0;
  for (let i = Math.max(0, da); i < fine; i += 1) {
    if (!/\s/u.test(s[i]) && (i === 0 || /\s/u.test(s[i - 1]))) parole += 1;
  }
  return parole;
}
