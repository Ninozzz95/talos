import { t } from './lingua.js';

/*
 * Revisione d'uso della candidata, 04/11/2026, reperto 15 — LA FINESTRA CHE HA PERSO L'ACCESSO LO DICE SUBITO.
 *
 * Quando TALOS viene aperto da un'altra finestra o riparte, il cookie di questa non vale più e ogni `/api/v1/*` risponde 401
 * `AUTH_REQUIRED` (`src/http-app.mjs`, il cancello a token). La pagina restava viva a vista: barra, Home e chat come prima, nessun
 * avviso; lo si scopriva solo inviando, con un errore che non diceva cosa fare.
 * Qui si osserva ogni risposta di `fetch` (anche le letture di fondo: elenco delle sessioni, cambi delle impostazioni) e al primo
 * rifiuto della finestra si mette una fascia fissa, una sola, con la strada per rientrare: «Rientra» ricarica (il profilo del browser
 * ha il cookie nuovo se l'altra finestra è nello stesso browser); se resta scollegata, la frase dice di riaprire TALOS dal collegamento.
 * Hermes fa lo stesso al 401 di una sessione scaduta: `apps/desktop/src/lib/browser-transport.ts:86-131` (clone del 01/11) legge il
 * codice del rifiuto (`session_expired`/`unauthenticated`) e porta subito la finestra a rientrare, invece di lasciar fallire le chiamate.
 * Nielsen Norman Group, euristiche #1 (stato del sistema visibile) e #9 (gli errori dicono in parole semplici come uscirne).
 * ⛔ Chi ha chiesto riceve la sua risposta intatta: si legge una COPIA (`clone`), e solo per un 401 dell'API col codice della finestra.
 */
export function sorvegliaAccesso({ finestra = globalThis.window, ricarica = () => finestra.location.reload() } = {}) {
  if (!finestra || typeof finestra.fetch !== 'function') return { fascia: null, mostra: () => null };
  if (finestra.fetch.__talosAccesso) return finestra.fetch.__talosAccesso;
  const document = finestra.document;
  const originale = finestra.fetch;
  let fascia = null;

  function mostra() {
    if (fascia?.isConnected) return fascia;
    fascia = document.createElement('div');
    fascia.className = 'talos-accesso-perso';
    fascia.setAttribute('role', 'alert');
    const testo = document.createElement('p');
    testo.className = 'talos-accesso-perso__testo';
    const titolo = document.createElement('strong');
    titolo.textContent = t('app.accessLost.title');
    const corpo = document.createElement('span');
    corpo.textContent = t('app.accessLost.body');
    testo.append(titolo, corpo);
    const bottone = document.createElement('button');
    bottone.type = 'button';
    bottone.className = 'talos-button talos-button--primary talos-button--sm';
    bottone.textContent = t('app.accessLost.reenter');
    bottone.addEventListener('click', () => ricarica());
    fascia.append(testo, bottone);
    /* Tester 04/11 20:15, S4: fissa in alto copriva il titolo della pagina («Cosa sta girando, come è anda…»). Ora è una fascia in
       flusso in TESTA alla colonna centrale (`#centro`), come le altre fasce dell'app (`fascia-modo.css`, `avviso-piano.css`): spinge
       giù la pagina invece di starci sopra. Senza la colonna (un ospite che carica solo il monolite) resta fissa sul corpo. */
    const colonna = document.getElementById?.('centro');
    if (colonna?.prepend) colonna.prepend(fascia); else document.body.append(fascia);
    return fascia;
  }

  function percorsoApi(risorsa) {
    try {
      const url = new URL(String(risorsa?.url ?? risorsa), finestra.location.href);
      return url.origin === finestra.location.origin && url.pathname.startsWith('/api/v1/');
    } catch { return false; }
  }

  async function esamina(risorsa, risposta) {
    if (risposta?.status !== 401 || !percorsoApi(risorsa)) return;
    try {
      const busta = await risposta.clone().json();
      if (busta?.error?.code === 'AUTH_REQUIRED') mostra();
    } catch { /* un corpo che non è la busta non è il rifiuto della finestra */ }
  }

  const sorvegliata = async function fetchSorvegliataDallAccesso(risorsa, init) {
    const risposta = await originale.call(finestra, risorsa, init);
    void esamina(risorsa, risposta);
    return risposta;
  };
  const controllo = { mostra, get fascia() { return fascia; } };
  sorvegliata.__talosAccesso = controllo;
  finestra.fetch = sorvegliata;
  return controllo;
}
