/*
 * ⭐ Fase 8 «Impostazioni dalla chat» (owner 01/11/2026, D2: «copia sul server, la finestra applica e risponde») — IL LATO FINESTRA del
 *   canale delle preferenze (§3.5, strada A della forma). Nessun pezzo visivo: la carta, il segno «Cambiata da TALOS · Annulla» e
 *   `/settings` aspettano i bozzetti del Frontend.
 *   · all'avvio la finestra legge la copia del server: se è PIÙ NUOVA dell'ultima che ha visto (il modello ha cambiato qualcosa a finestra
 *     chiusa) la applica; manda la sua SOLO se serve: la prima volta in assoluto, o se un cambio della persona non è arrivato (offline).
 *     ⛔ Treno 02/11: mandarla a ogni apertura era una scrittura non chiesta a ogni pagina (183 volte nella suite del browser, e rompeva
 *     ogni prova «nessuna scrittura verso il server»);
 *   · quando la persona cambia qualcosa (l'evento `talos:settings-persisted` di `salvaImpostazioniDesktop`), manda la sua copia;
 *   · sull'evento `talos.impostazioni-finestra` del flusso del PC applica i valori e RISPONDE con ciò che ha applicato davvero (Hermes
 *     `theme.apply`: «answers with what it applied, so the model reports what the user sees», `tools/set_theme_tool.py:1-7`).
 * ⛔ Solo l'evento con `destinatario: 'finestre-pc'` (contratto col Mobile, condizione 1). L'applicazione passa dalla STESSA porta del
 *   pannello delle Impostazioni (`aggiornaAspettoDesktop` in app.js): stessi timbri, stessa normalizzazione, stesso ridisegno.
 * ⛔ Gli aggiornamenti automatici vivono nel guscio: si chiedono col suo canale (`desktop/canale-aggiornamenti.mjs`, gettone dello stato);
 *   nel browser (il 4174) quel canale non c'è, e la risposta lo dice.
 */
export const EVENTO_IMPOSTAZIONI_FINESTRA = 'talos.impostazioni-finestra';
export const DESTINATARIO_FINESTRE_PC = 'finestre-pc';
export const CHIAVE_REVISIONE_VISTA = 'talos.harness.desktop.settings.copy.v1';
export const CHIAVE_DA_MANDARE = 'talos.harness.desktop.settings.copy.pending.v1';
export const CAMPO_AGGIORNAMENTI = 'aggiornamentiAutomatici';
const ROTTA_COPIA = '/api/v1/app-settings/window';

/**
 * @param {{
 *   apiGet: (p:string) => Promise<any>, apiPost: (p:string, b:object) => Promise<any>,
 *   leggiAspetto: () => Record<string, unknown>,       // l'aspetto normalizzato com'è adesso (`leggiImpostazioniDesktop().appearance`)
 *   applicaPatch: (patch: Record<string, unknown>) => void, // `aggiornaAspettoDesktop`, con la densità come la fa il pannello
 *   finestra?: any, memoria?: Storage|null, attesaInvioMs?: number,
 *   quandoCambianoINonConfermati?: (() => void)|null,  // giro 6: chi disegna il segno «non ancora confermata» si ridisegna
 * }} p
 */
export function creaCopiaSulServer({ apiGet, apiPost, leggiAspetto, applicaPatch, finestra = globalThis.window, memoria = globalThis.localStorage ?? null, attesaInvioMs = 300, quandoCambianoINonConfermati = null }) {
  let applicando = false;
  let invioProgrammato = null;
  /*
   * 0.2.2-DL, giro 6 (owner 10/11/2026 22:51; controllore del giro 5, R-A) — I CAMPI NON ANCORA CONFERMATI. Finché una migrazione del
   *   server aspetta (le ricevute non si leggono), la copia letta dalla finestra non porta quel campo (giro 5): la finestra mostra il suo
   *   valore e il modello ne legge un altro, e nessuno lo diceva. Il server ora li dà a parte, in `nonConfermati` (`{ campo: valore che
   *   legge il modello }`, nella risposta al GET e a ogni invio; d'accordo ⇒ il campo non c'è). La finestra li TIENE soltanto, non li
   *   applica (applicarli scriverebbe in locale un valore che nessuno ha scelto): `inDisaccordo()` dice quali mostra diversi, e lì le
   *   Impostazioni mettono un segno accanto all'interruttore. Un evento del server su quel campo vuol dire che qualcuno ha deciso: la
   *   finestra lo DIMENTICA (se lo tenesse, il tocco dopo farebbe tornare il segno per un attimo). Una risposta partita prima di
   *   quell'evento e arrivata dopo non lo rimette (`inVolo`).
   */
  let nonConfermati = {};
  const inVolo = new Set(); // per ogni invio in volo: i campi che un evento ha deciso nel frattempo
  function tieniNonConfermati(dati, tranne = null) {
    const nuovi = {};
    if (dati && typeof dati === 'object' && !Array.isArray(dati)) for (const [campo, valore] of Object.entries(dati)) if (!tranne?.has(campo)) nuovi[campo] = valore;
    const campi = Object.keys(nuovi);
    if (campi.length === Object.keys(nonConfermati).length && campi.every((c) => Object.hasOwn(nonConfermati, c) && nonConfermati[c] === nuovi[c])) return;
    nonConfermati = nuovi;
    try { quandoCambianoINonConfermati?.(); } catch { /* chi disegna non ferma il canale */ }
  }
  function decisiDalServer(campi) {
    for (const decisi of inVolo) for (const c of campi) decisi.add(c);
    if (campi.some((c) => Object.hasOwn(nonConfermati, c))) tieniNonConfermati(nonConfermati, new Set(campi));
  }
  const revisioneVista = () => { try { return Number(memoria?.getItem(CHIAVE_REVISIONE_VISTA)) || 0; } catch { return 0; } };
  const segnaRevisione = (r) => { if (!Number.isSafeInteger(r)) return; try { memoria?.setItem(CHIAVE_REVISIONE_VISTA, String(r)); } catch { /* memoria piena o negata: si rimanda alla prossima volta */ } };
  const daMandare = () => { try { return memoria?.getItem(CHIAVE_DA_MANDARE) === '1'; } catch { return false; } };
  const segnaDaMandare = (si) => { try { memoria?.setItem(CHIAVE_DA_MANDARE, si ? '1' : '0'); } catch { /* memoria piena o negata: si riprova al prossimo cambio */ } };
  const statoAggiornamenti = () => finestra?.__talosAggiornamenti ?? null;
  /*
   * Revisione avversaria della fase 8, REV8-05 (01/11/2026 notte): all'avvio lo stato del guscio arriva DOPO (`did-finish-load`,
   *   `desktop/main.mjs`), e il campo degli aggiornamenti della copia si perdeva: la revisione si segnava, e il primo invio della persona
   *   lo riscriveva col valore vecchio del guscio — il cambio approvato sulla carta (D7) non arrivava mai. Ora resta DA PARTE
   *   (`{ valore, chiesto }`): si chiede al guscio appena il suo stato c'è (evento `talos:aggiornamenti`, o al prossimo invio), e finché il
   *   guscio non ha risposto la finestra manda il valore della copia. Dopo la sua risposta (il primo evento dopo la richiesta) vale di
   *   nuovo il guscio. Nel browser (il 4174) il guscio non c'è: niente si chiede, e la copia approvata non si riscrive.
   */
  let aggiornamentiDaParte = null;
  function chiediAlGuscioSeSiPuo() {
    const stato = statoAggiornamenti();
    if (!aggiornamentiDaParte || aggiornamentiDaParte.chiesto || !stato || typeof stato.automatici !== 'boolean') return;
    if (stato.automatici === aggiornamentiDaParte.valore) { aggiornamentiDaParte = null; return; }
    const { nonApplicati } = applica({ [CAMPO_AGGIORNAMENTI]: aggiornamentiDaParte.valore });
    if (Object.hasOwn(nonApplicati, CAMPO_AGGIORNAMENTI)) return; // senza gettone o senza canale: si riprova al prossimo stato
    aggiornamentiDaParte.chiesto = true;
  }
  if (typeof finestra?.addEventListener === 'function') {
    finestra.addEventListener('talos:aggiornamenti', () => {
      if (aggiornamentiDaParte?.chiesto) { aggiornamentiDaParte = null; return; } // la risposta del guscio: adesso è lui la verità
      chiediAlGuscioSeSiPuo();
    });
  }

  /** Ciò che la finestra manda al server: l'aspetto intero e, nell'app installata, gli aggiornamenti automatici. */
  function valoriDellaFinestra() {
    const aspetto = { ...leggiAspetto() };
    const aggiornamenti = statoAggiornamenti();
    if (aggiornamenti && typeof aggiornamenti.automatici === 'boolean') aspetto[CAMPO_AGGIORNAMENTI] = aggiornamenti.automatici;
    if (aggiornamentiDaParte) aspetto[CAMPO_AGGIORNAMENTI] = aggiornamentiDaParte.valore; // REV8-05: finché il guscio non ha risposto
    return aspetto;
  }
  /* Treno 02/11: `talos:settings-persisted` scatta per ogni salvataggio (preferenze della chat, spazi di lavoro), non solo per l'aspetto: si scrive solo
     se i valori che il server tiene sono cambiati davvero dall'ultima volta che finestra e server erano allineati. */
  let ultimiAllineati = null;
  const impronta = () => JSON.stringify(valoriDellaFinestra());
  /*
   * giro 6 — ciò che un evento del server ha fatto applicare È ciò che il server tiene: l'ultimo allineamento lo segue, campo per campo
   *   (l'ordine delle chiavi resta, il confronto è sul testo). Senza, il tocco che RIPORTA la voce al valore di prima dell'evento non
   *   partiva («niente è cambiato dall'ultimo invio»): il modello la spegneva, la persona la riaccendeva, e il modello la leggeva ancora
   *   spenta, anche ai riavvii. Valeva per ogni voce cambiata dal modello a finestra aperta; qui è il tocco che disfa una conferma.
   */
  function allineaAiDecisi(applicati) {
    if (ultimiAllineati === null) return;
    try {
      const tenuti = JSON.parse(ultimiAllineati);
      for (const [campo, valore] of Object.entries(applicati)) if (Object.hasOwn(tenuti, campo)) tenuti[campo] = valore;
      ultimiAllineati = JSON.stringify(tenuti);
    } catch { /* un'impronta che non si rilegge: resta com'era, e il prossimo cambio parte comunque */ }
  }
  function programma(attesa = attesaInvioMs) {
    segnaDaMandare(true);
    if (invioProgrammato) clearTimeout(invioProgrammato);
    invioProgrammato = setTimeout(() => { invioProgrammato = null; manda().catch(() => {}); }, attesa);
  }
  async function manda() {
    chiediAlGuscioSeSiPuo();
    const inviati = impronta();
    const decisiNelFrattempo = new Set();
    inVolo.add(decisiNelFrattempo);
    let risposta;
    try { risposta = await apiPost(ROTTA_COPIA, { valori: JSON.parse(inviati) }); } finally { inVolo.delete(decisiNelFrattempo); }
    segnaRevisione(risposta?.revisione);
    ultimiAllineati = inviati;
    tieniNonConfermati(risposta?.nonConfermati, decisiNelFrattempo);
    /*
     * giro 6 (controllore del giro 5, R-B / M7) — L'INVIO IN VOLO. Mentre questo invio viaggiava un evento del server può aver cambiato
     *   la finestra (una scelta del modello tenuta dalla migrazione, un suo `set`): il server ha preso DOPO i valori vecchi che l'invio
     *   portava, e la finestra mostrava spenta mentre il modello leggeva accesa, anche ai riavvii. Se ciò che la finestra mostra non è
     *   più ciò che ha mandato, rimanda subito (un invio già programmato dalla persona basta). Il segno «da mandare» resta acceso fino
     *   ad allora: se la finestra si chiude prima, lo fa il prossimo avvio. Hermes rilegge per lo stesso motivo: «A save may have landed
     *   while the previous snapshot was in flight» (`apps/desktop/src/app/gateway/hooks/use-connections-registry.ts:49`).
     */
    if (impronta() !== inviati) { if (!invioProgrammato) programma(0); } else if (!invioProgrammato) segnaDaMandare(false);
    return risposta;
  }

  /** Applica i valori arrivati dal server; torna `{ applicati, nonApplicati }` letti DOPO, non quelli chiesti. */
  function applica(valori) {
    const nonApplicati = {};
    const patch = {};
    for (const [campo, valore] of Object.entries(valori ?? {})) {
      if (campo === CAMPO_AGGIORNAMENTI) {
        const stato = statoAggiornamenti();
        if (!stato?.gettone || typeof finestra?.open !== 'function') { nonApplicati[campo] = 'automatic updates exist only in the installed TALOS app'; continue; }
        const q = new URLSearchParams({ azione: 'automatici', acceso: valore === true ? '1' : '0', gettone: stato.gettone });
        finestra.open(`talos-desktop://aggiornamenti?${q}`, '_blank');
        continue;
      }
      patch[campo] = valore;
    }
    applicando = true;
    try { if (Object.keys(patch).length) applicaPatch(patch); }
    finally { applicando = false; }
    const dopo = leggiAspetto();
    const applicati = {};
    for (const campo of Object.keys(patch)) {
      if (Object.hasOwn(dopo, campo)) applicati[campo] = dopo[campo];
      else nonApplicati[campo] = 'this window does not have that preference';
    }
    /* il guscio conferma gli aggiornamenti dopo (evento `talos:aggiornamenti`): qui si dice ciò che si è chiesto */
    if (Object.hasOwn(valori ?? {}, CAMPO_AGGIORNAMENTI) && !Object.hasOwn(nonApplicati, CAMPO_AGGIORNAMENTI)) applicati[CAMPO_AGGIORNAMENTI] = valori[CAMPO_AGGIORNAMENTI] === true;
    return { applicati, nonApplicati };
  }

  return Object.freeze({
    /** All'avvio: la copia più nuova vince; la finestra manda la sua solo la prima volta o se un cambio è rimasto indietro. Un errore di rete non ferma niente. */
    async avvio() {
      ultimiAllineati = impronta();
      try {
        const copia = await apiGet(ROTTA_COPIA);
        tieniNonConfermati(copia?.nonConfermati); // giro 6: solo tenuti, mai applicati
        const revisione = Number(copia?.revisione) || 0;
        if (revisione > revisioneVista() && copia?.valori && typeof copia.valori === 'object') {
          const attuale = valoriDellaFinestra();
          const diversi = Object.fromEntries(Object.entries(copia.valori).filter(([campo, v]) => Object.hasOwn(attuale, campo) && attuale[campo] !== v));
          /* REV8-05: gli aggiornamenti della copia con lo stato del guscio non ancora arrivato restano da parte, non si perdono */
          if (typeof copia.valori[CAMPO_AGGIORNAMENTI] === 'boolean' && !Object.hasOwn(attuale, CAMPO_AGGIORNAMENTI)) {
            aggiornamentiDaParte = { valore: copia.valori[CAMPO_AGGIORNAMENTI], chiesto: false };
          }
          if (Object.keys(diversi).length) applica(diversi);
          segnaRevisione(revisione);
          ultimiAllineati = impronta();
          return { esito: 'applicata', campi: Object.keys(diversi) };
        }
        const primaVolta = revisione === 0 && revisioneVista() === 0;
        if (!primaVolta && !daMandare()) return { esito: 'allineata' };
        await manda();
        return { esito: 'mandata' };
      } catch {
        return { esito: 'non-raggiunto' };
      }
    },
    /** La persona ha cambiato qualcosa: la copia del server la segue (una volta sola dopo una raffica di cambi, come i cursori). */
    dopoCambioDellaPersona() {
      if (applicando) return;
      if (!aggiornamentiDaParte && ultimiAllineati !== null && impronta() === ultimiAllineati) return;
      programma();
    },
    /**
     * giro 6: i campi che la finestra mostra DIVERSI da ciò che il modello legge, finché il server non li ha confermati (`[]` quando sono
     * d'accordo, cioè quasi sempre). Si legge l'aspetto di adesso: il tocco della persona lo svuota subito, prima ancora dell'invio.
     */
    inDisaccordo() {
      const campi = Object.keys(nonConfermati);
      if (!campi.length) return [];
      const aspetto = leggiAspetto() ?? {};
      return campi.filter((c) => Object.hasOwn(aspetto, c) && aspetto[c] !== nonConfermati[c]);
    },
    /** Un evento del flusso del PC: solo `talos.impostazioni-finestra` per le finestre del PC; applica e risponde. */
    async suEvento(evento) {
      if (evento?.type !== EVENTO_IMPOSTAZIONI_FINESTRA || evento.destinatario !== DESTINATARIO_FINESTRE_PC || typeof evento.richiestaId !== 'string') return null;
      if (Object.hasOwn(evento.valori ?? {}, CAMPO_AGGIORNAMENTI)) aggiornamentiDaParte = null; // REV8-05: vale il cambio più nuovo
      const { applicati, nonApplicati } = applica(evento.valori);
      decisiDalServer(Object.keys(evento.valori ?? {})); // giro 6: su quei campi qualcuno ha deciso, il segno se ne va senza ricaricare
      /* giro 6 (R-B): un evento più VECCHIO dell'ultima revisione vista è arrivato dopo la risposta a un invio che il server ha preso
         dopo di lui. La revisione vista non torna indietro (al riavvio la copia del server coprirebbe ciò che la finestra ha appena
         applicato), e la finestra rimanda ciò che mostra: le due porte tornano pari. */
      if (Number.isSafeInteger(evento.revisione) && evento.revisione < revisioneVista()) { if (!invioProgrammato) programma(0); } else { segnaRevisione(evento.revisione); allineaAiDecisi(applicati); }
      try { await apiPost(`${ROTTA_COPIA}/applied`, { richiestaId: evento.richiestaId, applicati, ...(Object.keys(nonApplicati).length ? { nonApplicati } : {}) }); } catch { /* il server lo dirà come «nessuna finestra ha confermato» */ }
      return { applicati, nonApplicati };
    },
  });
}
