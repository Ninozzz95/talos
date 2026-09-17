/*
 * Toast — il messaggio breve in basso a destra, nel linguaggio del mockup
 * (`.talos-card.talos-toast`, `data-c="Toast"`, dentro `#regioneToast`).
 *
 * 05/9 Fase 2, owner: «bruttissima quella notifica in basso a sinistra,
 * sistemala bene». Prima i toast del monolite uscivano come testo grezzo
 * fuori dalla shell (T-16). Qui il markup è quello del mockup, riga per riga:
 * badge col tono, testo, barra con azione facoltativa e chiusura.
 *
 * Ricerca del 05/09/2026 (phoca.cz/a11y-component-lab/toast, ariaui.dev/docs/
 * components/toast, designsystemproblems.com toast-notification-accessibility):
 *  - `role="status"` + `aria-atomic` per esiti e note; `role="alert"` per i guasti;
 *  - durata minima 5 s; i guasti restano finché non li chiudi;
 *  - al massimo tre in pila; il timer si ferma sotto il mouse e col fuoco dentro.
 */

/** tono → variante del badge del mockup e ruolo ARIA. */
export const TONI = Object.freeze({
  nota: { badge: 'accent', ruolo: 'status', durata: 6000 },
  riuscito: { badge: 'success', ruolo: 'status', durata: 5000 },
  avviso: { badge: 'warning', ruolo: 'status', durata: 8000 },
  guasto: { badge: 'danger', ruolo: 'alert', durata: 0 }, // 0 = resta finché non lo chiudi
});

export const MASSIMO_IN_PILA = 3;

/**
 * ⭐⭐⭐ BC-77 (a), 17/09/2026 — LA REGIONE DEI TOAST STA SOPRA LA ZONA DEI COMANDI.
 *
 * Il difetto, misurato prima di toccare una riga (`tests/browser/toast-non-copre-i-comandi.spec.mjs`,
 * pacchetto di `d4ca608e`): a **1024×800**, con un giro in corso, il toast «Collegato di nuovo»
 * copriva **cinque** comandi del piede della chat — «Messaggio» 4.204 px², «Terminale» 3.410 px²,
 * «Il server non risponde» (la riga che FERMA) 1.764 px², «Voce» 1.444 px², «Scrive nel progetto»
 * 1.176 px². Fondo del toast 776, cima del piede 586. A 1440×900 non capitava, ma solo perché la
 * colonna della chat è più stretta: verticalmente i due rettangoli si sovrappongono lì come qui.
 *
 * ⛔ La cura NON è la durata. Un avviso che se ne va da solo copre comunque, per tutto il tempo in
 *   cui si vede, il pulsante con cui si interrompe il lavoro — ed è esattamente il caso che WCAG 2.2
 *   SC 2.4.11 «Focus Not Obscured (Minimum)» nomina («A notification implemented as sticky content …
 *   will fail this success criterion if it entirely obscures a component receiving focus»,
 *   w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html, letto il 17/09/2026).
 *
 * ⛔ E non è nemmeno un numero da scrivere a mano: il piede della chat **cambia altezza** da solo —
 *   la striscia con «Ferma» compare solo durante un giro, la coda dei messaggi compare e sparisce,
 *   il composer si può ridimensionare col suo angolo, il terminale in basso si apre dentro lo stesso
 *   piede. Un `bottom` fisso indovinerebbe una sola di queste altezze. ⇒ Si MISURA l'ingombro vero
 *   della zona dei comandi dal fondo della finestra e lo si scrive in una variabile CSS.
 *
 * ⭐ Ricerca del 17/09/2026 — Carbon Design System «Notification / usage» e Adobe Spectrum «Toast»:
 *   il toast non ostruisce mai la navigazione primaria né i comandi, e il POSTO non si cambia da una
 *   schermata all'altra. ⇒ Qui il posto resta quello approvato dall'owner il 05/09 (in basso a
 *   destra): cambia solo il pavimento su cui poggia.
 *
 * Quando la zona dei comandi non si vede (un'altra vista aperta, la chat nascosta) la misura è `0` e
 * la regione torna da sola al fondo della finestra: nessun ramo da ricordare.
 *
 * ⛔⛔ IL TETTO, 17/09/2026 — chiesto dal revisore e MISURATO prima di scriverlo. Il pavimento da
 *   solo non basta: il piede della chat non ha un'altezza massima piccola — il terminale in basso
 *   vive DENTRO di lui, e il composer si allarga col testo. Misurato a 1024×800 col terminale
 *   aperto e quaranta righe nel composer: piede alto **448 px**, e una pila di **tre** toast
 *   (`MASSIMO_IN_PILA`) arrivava con la cima a **y=32**, cioè **28 px sopra** il bordo inferiore
 *   della testata (che finisce a 60) — sopra il titolo della sessione, le quattro viste e le azioni.
 *   ⇒ Un avviso che smette di coprire i comandi in basso e comincia a coprire quelli in alto non è
 *   una cura: è lo stesso difetto traslocato.
 *
 * ⛔ E il tetto NON è un numero: si misura il rettangolo VERO della pila dopo averla posata, e se
 *   sconfina nella zona intoccabile si abbassa il pavimento esattamente dell'eccesso. Così non c'è
 *   niente da indovinare — né l'altezza di un toast, né quanti ce ne sono, né il respiro del CSS.
 *
 * @param {HTMLElement|null} zonaComandi il piede della chat (`.talos-chat-foot`)
 * @param {{radice?:HTMLElement, finestra?:Window, variabile?:string,
 *          regione?:HTMLElement|null, zonaIntoccabile?:(() => number|null)}} [opzioni]
 * @returns {{ misura:() => number, ferma:() => void }}
 */
export function ancoraToastSopraIComandi(zonaComandi, {
  radice = null, finestra = globalThis, variabile = '--talos-toast-fondo',
  regione = null, zonaIntoccabile = null,
} = {}) {
  const host = radice || zonaComandi?.ownerDocument?.documentElement || null;
  const misura = () => {
    if (!host) return 0;
    const rettangolo = zonaComandi?.getBoundingClientRect?.();
    const altezzaFinestra = finestra.innerHeight || 0;
    /* `offsetParent === null` copre il caso «vista chiusa»: il piede esiste nel DOM ma non si vede,
       e un piede che non si vede non copre niente. `height > 0` copre il resto. */
    const visibile = Boolean(rettangolo) && rettangolo.height > 0 && zonaComandi.offsetParent !== null;
    let ingombro = visibile ? Math.max(0, Math.round(altezzaFinestra - rettangolo.top)) : 0;
    host.style.setProperty(variabile, `${ingombro}px`);
    /*
     * Il tetto, misurato e non stimato: posata la pila, si guarda dove è finita la sua CIMA. Se sta
     * dentro la zona intoccabile, si restituisce al pavimento esattamente l'eccesso — una volta
     * sola, perché l'altezza della pila non dipende dal pavimento e il conto non si rincorre.
     */
    const cima = zonaIntoccabile?.();
    const pila = regione?.getBoundingClientRect?.();
    if (Number.isFinite(cima) && pila && pila.height > 0) {
      const eccesso = Math.round(cima - pila.top);
      if (eccesso > 0) {
        ingombro = Math.max(0, ingombro - eccesso);
        host.style.setProperty(variabile, `${ingombro}px`);
      }
    }
    return ingombro;
  };
  misura();
  let osservatore = null;
  if (typeof finestra.ResizeObserver === 'function') {
    osservatore = new finestra.ResizeObserver(() => misura());
    if (zonaComandi) osservatore.observe(zonaComandi);
    /* ⛔ Anche la REGIONE: un toast che arriva o se ne va cambia l'altezza della pila, e con essa
       il tetto. Senza questa riga il tetto varrebbe per la pila che c'era, non per quella che c'è. */
    if (regione) osservatore.observe(regione);
  }
  const suRidimensiona = () => misura();
  finestra.addEventListener?.('resize', suRidimensiona);
  return {
    misura,
    ferma() { osservatore?.disconnect(); finestra.removeEventListener?.('resize', suRidimensiona); },
  };
}

/**
 * Il tono lo dice il titolo che il monolite passa già oggi («… non riuscito»,
 * «Copiato», «Ripresa della sessione»): così i 25 punti di chiamata non
 * cambiano e ognuno esce col badge giusto.
 */
export function tonoDaTitolo(titolo = '') {
  const t = String(titolo).toLowerCase();
  if (/non riuscit|non eseguit|non liberat|errore|guasto|fallit|interrott|negat/.test(t)) return 'guasto';
  if (/attenzione|avviso|scad|limite/.test(t)) return 'avviso';
  if (/riuscit|copiat|salvat|creat|inviat|pronto|pronta|aggiornat|eliminat|rinominat|esportat|spostat|liberat|fatto/.test(t)) return 'riuscito';
  return 'nota';
}

/**
 * H22 — niente testo tecnico a schermo. Le stringhe grezze del browser e del
 * fetch diventano una frase che dice cosa fare.
 */
export function messaggioUmano(messaggio) {
  const m = messaggio == null ? '' : String(messaggio.message ?? messaggio).trim();
  if (!m) return '';
  if (/failed to fetch|networkerror|load failed|err_connection|network request failed|fetch failed/i.test(m)) {
    return 'Il server non risponde. Controlla che TALOS sia avviato e riprova.';
  }
  if (/aborterror|the operation was aborted|abortato/i.test(m)) return 'Operazione annullata.';
  if (/^(typeerror|error|referenceerror|rangeerror):\s*/i.test(m)) return m.replace(/^\w+error:\s*/i, '');
  if (/^\d{3}\s*$/.test(m)) return `Il server ha risposto con l'errore ${m}.`;
  return m;
}

/**
 * L'ANNULLAMENTO del mockup (`toast(text, undo)`, riga 6038) — lotto E, 11/09/2026.
 *
 * ⛔ Il mockup ha una cosa che qui mancava: un toast che porta con sé il modo di DISFARE ciò che
 *   ha appena annunciato, e che per questo resta in video più a lungo (11.000 ms contro 6.200).
 *   La pila di toast di questo file sapeva già mostrare un'azione (`opzioni.azione.esegui`): qui
 *   sopra non si costruisce un secondo sistema, si dichiara la coppia di valori giusta.
 *
 * ⛔ Ricerca fatta PRIMA di scrivere, 11/09/2026 — NN/g «Confirmation Dialogs Can Prevent User
 *   Errors» + Joel Pascual «A UX guide to destructive actions» (Bootcamp): quando l'azione è
 *   REVERSIBILE la conferma va sostituita dall'annullamento, perché la conferma insegna la paura e
 *   l'annullamento insegna la sicurezza. E designsystemproblems.com «Toast Notification
 *   Accessibility» + WCAG 2.2.1 «Timing Adjustable»: un toast che porta un'azione deve restare
 *   abbastanza da poterla leggere E premere — 11 s, più il timer che si ferma sotto il mouse e col
 *   fuoco dentro (già in `creaPilaToast`).
 *   ⇒ L'irreversibile (eliminare un file) resta con la sua conferma; il reversibile (rinominare)
 *   passa di qui.
 *
 * @param {Function} esegui cosa fare per tornare indietro
 * @param {{etichetta?:string, durata?:number}} [opzioni]
 */
export const DURATA_CON_ANNULLA = 11_000;
export function azioneAnnulla(esegui, { etichetta = 'Annulla', durata = DURATA_CON_ANNULLA } = {}) {
  return { tono: 'riuscito', durata, azione: { etichetta, dati: 'annulla', esegui } };
}

/**
 * Crea la scheda del toast, esattamente come nel mockup.
 * @param {{ id:string|number, titolo:string, messaggio?:string, tono?:keyof typeof TONI,
 *           azione?: { etichetta:string, dati?:string } }} dati
 * @returns {{ scheda:HTMLElement, chiudi:HTMLButtonElement, azione:HTMLButtonElement|null, testo:HTMLElement }}
 */
export function creaToast(dati) {
  const tono = TONI[dati.tono] ? dati.tono : tonoDaTitolo(dati.titolo);
  const t = TONI[tono];
  const scheda = document.createElement('div');
  scheda.className = 'talos-card talos-toast toast'; // `toast` = gancio del monolite, invisibile al cancello
  scheda.dataset.c = 'Toast';
  scheda.dataset.tono = tono;
  scheda.id = `toast-${dati.id}`;

  const vivo = document.createElement('div');
  vivo.setAttribute('role', t.ruolo);
  vivo.setAttribute('aria-atomic', 'true');
  const badge = document.createElement('span');
  badge.className = `talos-badge talos-badge--sm talos-badge--${t.badge}`;
  badge.textContent = String(dati.titolo || '');
  const testo = document.createElement('p');
  testo.textContent = messaggioUmano(dati.messaggio) || String(dati.titolo || '');
  vivo.append(badge, testo);

  const barra = document.createElement('div');
  barra.className = 'talos-toolbar';
  let azione = null;
  if (dati.azione?.etichetta) {
    azione = document.createElement('button');
    azione.type = 'button';
    azione.className = 'talos-button talos-button--secondary talos-button--sm';
    azione.dataset.toastAction = dati.azione.dati || 'azione';
    azione.textContent = dati.azione.etichetta;
    barra.appendChild(azione);
  }
  const cresci = document.createElement('span');
  cresci.className = 'talos-grow';
  const chiudi = document.createElement('button');
  chiudi.type = 'button';
  chiudi.className = 'talos-button talos-button--ghost talos-icon-button';
  chiudi.dataset.toastChiudi = String(dati.id);
  chiudi.setAttribute('aria-label', `Chiudi messaggio ${String(dati.titolo || '').toLowerCase()}`);
  chiudi.innerHTML = '<svg class="i" aria-hidden="true"><use href="#i-x"/></svg>';
  barra.append(cresci, chiudi);

  if (!azione) scheda.classList.add('talos-toast--breve'); // senza azione la chiusura sta in alto a destra, la scheda resta bassa
  scheda.append(vivo, barra);
  return { scheda, chiudi, azione, testo, tono, durata: t.durata };
}

/**
 * La pila: appende alla regione del mockup, mostra la regione, tiene al più
 * tre schede vive, chiude col pulsante, ferma il timer sotto il mouse o col
 * fuoco dentro, e nasconde la regione quando è vuota. `animaUscita(el, fine)`
 * è del monolite (motion token), passata per non duplicarla.
 */
export function creaPilaToast(regione, { animaUscita = (el, fine) => fine(), entra = () => {}, fuocoDiRitorno = () => null } = {}) {
  let progressivo = 0;
  const vivi = () => [...regione.querySelectorAll('.talos-toast:not([hidden])')].filter((el) => !el.dataset.demo);

  const rimuovi = (scheda) => {
    if (!scheda?.isConnected || scheda.dataset.uscita) return;
    scheda.dataset.uscita = '1';
    const avevaIlFuoco = scheda.contains(document.activeElement);
    animaUscita(scheda, () => {
      scheda.remove();
      if (vivi().length === 0) regione.hidden = true;
      if (avevaIlFuoco) (vivi()[0]?.querySelector('button') || fuocoDiRitorno())?.focus?.();
    });
  };

  regione.addEventListener('click', (event) => {
    const pulsante = event.target.closest?.('[data-toast-chiudi]');
    if (pulsante && regione.contains(pulsante)) rimuovi(pulsante.closest('.talos-toast'));
  });

  return function mostra(titolo, messaggio = '', opzioni = {}) {
    for (const vecchio of vivi().slice(0, Math.max(0, vivi().length - (MASSIMO_IN_PILA - 1)))) rimuovi(vecchio);
    progressivo += 1;
    const { scheda, azione, durata } = creaToast({ id: progressivo, titolo, messaggio, tono: opzioni.tono, azione: opzioni.azione });
    if (azione && typeof opzioni.azione?.esegui === 'function') {
      azione.addEventListener('click', () => { opzioni.azione.esegui(); rimuovi(scheda); });
    }
    regione.appendChild(scheda);
    regione.hidden = false;
    entra(scheda);
    const durataVera = Number.isFinite(opzioni.durata) ? opzioni.durata : durata;
    if (durataVera > 0) {
      let timer = null;
      let restante = durataVera;
      let partito = 0;
      const avvia = () => { partito = Date.now(); timer = window.setTimeout(() => rimuovi(scheda), restante); };
      const ferma = () => { if (timer == null) return; window.clearTimeout(timer); timer = null; restante = Math.max(1500, restante - (Date.now() - partito)); };
      scheda.addEventListener('mouseenter', ferma);
      scheda.addEventListener('mouseleave', avvia);
      scheda.addEventListener('focusin', ferma);
      scheda.addEventListener('focusout', (e) => { if (!scheda.contains(e.relatedTarget)) avvia(); });
      avvia();
    }
    return scheda;
  };
}
