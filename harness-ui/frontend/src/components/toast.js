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
