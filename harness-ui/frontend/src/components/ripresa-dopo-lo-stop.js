/*
 * Decisione dell'owner 166 (04/11/2026, variante A di `variante-43-dopo-lo-stop.html`): dopo uno Stop il messaggio nuovo è una
 * richiesta nuova (il nucleo lo segna in storia, `SEGNO_GIRO_FERMATO` in `src/kernel/talosHarness.mjs`), e chi vuole il lavoro fermato
 * lo chiede con UN pulsante sulla nota della fermata: «Riprendi da dove ti eri fermato».
 * La porta è quella che c'era già, mai una nuova: la ripresa SENZA messaggio (`resumeSession()` ⇒ `POST /sessions/:id/resume` vuoto,
 * «lo stesso giro, la stessa domanda»), la stessa di «Continua adesso con…». Il nucleo, davanti a una ripresa senza messaggio, toglie il
 * segno della fermata: il modello non legge «non riprendere» proprio quando gli si chiede di riprendere.
 * Concorrenti alla fonte: Codex segna il giro interrotto in storia (`codex-rs/core/src/context/turn_aborted.rs:12`, «The user
 * interrupted the previous turn on purpose…») e riprende con un messaggio della persona; Claude Code scrive «[Request interrupted by
 * user]» e riprende allo stesso modo; Hermes mette un segnaposto strutturale (`agent/agent_runtime_helpers_placeholders.py:9-16`).
 * Nessuno dei tre ha un pulsante: la seconda porta resta la parola, «continua», che il segno consente («unless they ask you to»).
 * Come le schede «Accedi e riprendi» (`accesso-chatgpt-scheda.js`, `creaSchedeAccesso`): al più UNA viva, quella dell'ultimo giro;
 * ogni RunStarted — dal vivo e alla rigiocata — la chiude togliendo il pulsante dal DOM (un elemento nascosto si clicca ancora da tastiera).
 */
import { t } from './lingua.js';

function togliPulsanti(nota) {
  for (const riga of nota?.querySelectorAll?.('.talos-system-note__azioni') ?? []) riga.remove();
}

/**
 * @param {{ riprendi: () => Promise<boolean|undefined>, sessioneOra?: () => string|null }} opzioni
 *   `riprendi` è la ripresa senza messaggio, e torna `true` quando il server l'ha presa; `sessioneOra` è la conversazione aperta.
 */
export function creaRipresaDopoLoStop({ riprendi, sessioneOra = () => null } = {}) {
  let viva = null;
  const chiudi = () => {
    if (!viva) return;
    togliPulsanti(viva.nota);
    viva = null;
  };
  const api = {
    /** La voce per `creaNotaErrore({ … }, { azioni })`: il testo, il clic, e la forma secondaria del bozzetto (bordo, non il pieno). */
    azione() {
      return [t('errori.turno.fermato.riprendi'), () => { void api.riprendi(); }, { secondaria: true }];
    },
    apri(nota, { sessionId = null } = {}) {
      if (viva && viva.nota !== nota) chiudi();
      viva = { nota, sessionId, inviata: false };
    },
    async riprendi() {
      const carta = viva;
      if (!carta || carta.inviata || carta.sessionId !== sessioneOra()) return false;
      carta.inviata = true; // subito: il doppio clic resta una ripresa sola
      const riga = carta.nota.querySelector?.('.talos-system-note__azioni') ?? null;
      if (riga) riga.hidden = true;
      let partita = false;
      try { partita = (await riprendi()) === true; } catch { partita = false; }
      if (!partita && viva === carta) {
        carta.inviata = false;
        if (riga) riga.hidden = false;
      }
      return partita;
    },
    /** A ogni RunStarted: il pulsante vale solo finché quel giro fermato è l'ultima cosa successa. */
    giroNuovo: chiudi,
    /** Cambio di conversazione: il DOM se ne va con lei, e il clic non deve riprendere un'altra conversazione. */
    dimentica() { viva = null; },
  };
  return api;
}
