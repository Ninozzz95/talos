/*
 * Owner 27/10/2026 («Di serie nelle Impostazioni + per conversazione») — «DOVE GIRANO I COMANDI» in Impostazioni → Strumenti e
 * permessi: la scelta con cui NASCONO le conversazioni nuove. Quella della singola conversazione resta nel foglio dei permessi
 * (D-10F); le conversazioni già nate tengono la loro.
 *
 * La scelta sta sul SERVER (`GET/POST /api/v1/command-settings`, `impostazioni-comandi.mjs`) come il motore del contesto: vale
 * anche per le conversazioni che nascono dal telefono o senza interfaccia. Ricerca 27/10/2026: Hermes `terminal.backend` in una
 * configurazione unica (`hermes_cli/config_defaults.py:297-298`); VS Code e Cursor, il profilo di terminale predefinito più la
 * scelta per singolo terminale.
 *
 * Forma: la carta delle sorelle (`motore-contesto.js`) con le TRE scelte del foglio dei permessi, stesse parole e stesso
 * `talos-choice-grid` (`index.template.html`, `data-dove-choice`): una scelta, due posti, un vocabolario solo. Con la casa Linux
 * pronta le frasi di «Automatico» e «Linux» sono quelle di `testiDoveGiranoIComandi`, come nel foglio. Lo stato a schermo lo
 * scrive SOLO la risposta del server: se il salvataggio fallisce la scelta resta com'era e la carta lo dice.
 */
import { t } from './lingua.js';
import { testiDoveGiranoIComandi } from './utente-wsl.js';

const EVENTO_LINGUA = 'talos:lingua';
const URL_IMPOSTAZIONI = '/api/v1/command-settings';
const URL_WSL = '/api/v1/wsl';
const VALORI = Object.freeze([null, 'wsl2', 'windows']);

/* Le tre scelte con le chiavi del foglio dei permessi; `chiaveCasa` è il blocco di `testiDoveGiranoIComandi` che le riguarda. */
const SCELTE = Object.freeze([
  { valore: null, titolo: 'modello.permissions.automatic', badge: 'modello.permissions.asBefore', sub: 'modello.permissions.itChoosesByItself', chiaveCasa: 'automatico' },
  { valore: 'wsl2', titolo: 'app.sheets.permissions.where.wslName', badge: 'modello.permissions.recommended', sub: 'modello.permissions.alwaysInLinuxIf', chiaveCasa: 'linux' },
  { valore: 'windows', titolo: 'app.sheets.permissions.where.windowsName', badge: null, sub: 'modello.permissions.alwaysOnTheHome', chiaveCasa: null },
]);

function creaScheda(documento) {
  const scheda = documento.createElement('div');
  scheda.className = 'talos-card talos-settings__section';
  scheda.dataset.c = 'SettingsSection';
  scheda.dataset.settingsCard = 'tools-dove-girano';
  scheda.setAttribute('role', 'group');
  scheda.setAttribute('aria-labelledby', 'settings-group-tools-dove-girano');
  scheda.innerHTML = '<div class="settings-group__head" data-settings-group-head>'
    + '<h3 class="settings-group__title" id="settings-group-tools-dove-girano" data-settings-group-title="tools-dove-girano"></h3></div>'
    + '<p data-dove-serie-descrizione></p>'
    + '<div class="talos-choice-grid" role="radiogroup" data-dove-serie-scelte></div>'
    + '<p class="talos-setting__help" data-dove-serie-stato role="status" hidden></p>';
  const gruppo = scheda.querySelector('[data-dove-serie-scelte]');
  for (const scelta of SCELTE) {
    const bottone = documento.createElement('button');
    bottone.type = 'button';
    bottone.className = 'talos-choice';
    bottone.setAttribute('role', 'radio');
    bottone.dataset.doveSerie = scelta.valore ?? '';
    bottone.innerHTML = '<span class="talos-choice__title"></span><span class="talos-choice__corpo">'
      + (scelta.badge ? '<span class="talos-badge talos-badge--sm"></span>' : '') + '<span class="talos-choice__sub"></span></span>';
    gruppo.append(bottone);
  }
  const q = (s) => scheda.querySelector(s);
  return { scheda, gruppo, titolo: q('.settings-group__title'), descrizione: q('[data-dove-serie-descrizione]'), stato: q('[data-dove-serie-stato]') };
}

export function montaDoveGiranoDiSerie({ documento = globalThis.document, fetchFn = globalThis.fetch?.bind(globalThis) } = {}) {
  if (!documento || typeof fetchFn !== 'function') return null;
  /* `stato`: null = non ancora letto; { doveDiSerie } = la risposta del server; 'non-disponibile' = la rotta risponde con un errore. */
  let stato = null; let errore = null; let scheda = null; let salvando = false; let wsl = null;

  async function chiama(url, metodo = 'GET', corpo) {
    const risposta = await fetchFn(url, { method: metodo, credentials: 'same-origin',
      headers: { Accept: 'application/json', ...(corpo ? { 'Content-Type': 'application/json' } : {}) }, ...(corpo ? { body: JSON.stringify(corpo) } : {}) });
    const dati = await risposta.json().catch(() => null);
    if (!risposta.ok || !dati?.data) throw Object.assign(new Error('command-settings'), { code: dati?.error?.code ?? 'HTTP_ERROR' });
    return dati.data;
  }
  const valida = (dati) => {
    if (!VALORI.includes(dati?.doveDiSerie)) throw Object.assign(new Error('command-settings'), { code: 'BAD_RESPONSE' });
    return { doveDiSerie: dati.doveDiSerie };
  };

  function disegna() {
    const pannello = documento.getElementById('setting-panel-tools');
    if (!pannello) return;
    if (!scheda || !scheda.scheda.isConnected) {
      scheda = creaScheda(documento);
      scheda.gruppo.addEventListener('click', (evento) => {
        const bottone = evento.target?.closest?.('[data-dove-serie]');
        if (bottone) void salva(bottone.dataset.doveSerie || null);
      });
      scheda.gruppo.addEventListener('keydown', muoviConLeFrecce);
      /* Subito dopo «Policy della sessione»: è lo stesso tema (come i comandi toccano il computer). La riga «Gestisci permessi ·
         Gestisci strumenti» resta l'ultima del pannello, mai fra due carte (vista nella prima foto). */
      const sorella = pannello.querySelector('[data-settings-card="tools-policy"]');
      const azioni = pannello.querySelector(':scope > .talos-settings__actions');
      if (sorella) sorella.after(scheda.scheda); else if (azioni) azioni.before(scheda.scheda); else pannello.append(scheda.scheda);
    }
    scheda.titolo.textContent = t('modello.permissions.whereCommandsRun');
    scheda.gruppo.setAttribute('aria-label', t('modello.permissions.whereCommandsRun'));
    scheda.descrizione.textContent = t('varie.commandsDefault.description');
    const casa = testiDoveGiranoIComandi(wsl);
    const disponibile = stato !== null && stato !== 'non-disponibile';
    /* Revisione blocco 9 (F-R1): su un PC SENZA WSL «Linux (WSL2)» non è consigliata. Come scelta di serie si ripeterebbe a ogni
       conversazione nuova, automazioni comprese, con comandi che falliscono: si dice che WSL manca e la scelta si spegne. Resta attiva solo
       se è già quella salvata, perché la persona la veda e possa cambiarla. Senza i fatti di WSL (rotta che non risponde) non si spegne
       niente: le frasi di sempre sono vere. */
    const senzaWsl = wsl?.wsl?.disponibile === false;
    for (const [i, scelta] of SCELTE.entries()) {
      const bottone = scheda.gruppo.children[i];
      const manca = senzaWsl && scelta.valore === 'wsl2';
      bottone.querySelector('.talos-choice__title').textContent = t(scelta.titolo);
      const badge = bottone.querySelector('.talos-badge');
      if (badge) {
        badge.textContent = manca ? t('varie.commandsDefault.wslMissingBadge') : casa?.[scelta.chiaveCasa]?.badge ?? t(scelta.badge);
        badge.classList.toggle('talos-badge--warning', manca);
      }
      bottone.querySelector('.talos-choice__sub').textContent = manca ? t('varie.commandsDefault.wslMissingSub') : casa?.[scelta.chiaveCasa]?.sub ?? t(scelta.sub);
      const scelto = disponibile && stato.doveDiSerie === scelta.valore;
      bottone.setAttribute('aria-checked', String(scelto));
      bottone.tabIndex = scelto || (!disponibile && i === 0) ? 0 : -1;
      /* ⛔ Mai `disabled` durante il salvataggio: un bottone disattivato perde il fuoco, e chi sceglie con le frecce si ritrova
         fuori dal gruppo (preso dalla prova DOVE-SERIE-UI-04). Mentre si salva vale `aria-busy` e `salva` ignora i clic. */
      bottone.disabled = !disponibile || (manca && !scelto);
    }
    scheda.gruppo.setAttribute('aria-busy', String(salvando));
    const messaggio = stato === 'non-disponibile' ? t('varie.commandsDefault.unavailable') : errore ? t('varie.commandsDefault.notSaved') : '';
    scheda.stato.textContent = messaggio;
    scheda.stato.hidden = !messaggio;
  }

  function muoviConLeFrecce(evento) {
    if (!['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(evento.key)) return;
    evento.preventDefault();
    if (salvando || !scheda) return;
    const tutti = [...scheda.gruppo.children];
    const bottoni = tutti.filter((b) => !b.disabled); // F-R1: una scelta spenta non si raggiunge con le frecce
    if (!bottoni.length) return;
    const i = Math.max(0, bottoni.indexOf(evento.target?.closest?.('[data-dove-serie]')));
    const n = evento.key === 'Home' ? 0 : evento.key === 'End' ? bottoni.length - 1
      : (i + (['ArrowRight', 'ArrowDown'].includes(evento.key) ? 1 : -1) + bottoni.length) % bottoni.length;
    bottoni[n].focus();
    void salva(bottoni[n].dataset.doveSerie || null);
  }

  async function leggi() {
    const [comandi, fatti] = await Promise.allSettled([chiama(URL_IMPOSTAZIONI).then(valida), chiama(URL_WSL)]);
    stato = comandi.status === 'fulfilled' ? comandi.value : 'non-disponibile';
    wsl = fatti.status === 'fulfilled' ? fatti.value : null; // senza i fatti di WSL restano le frasi di sempre, che sono vere
    errore = null; disegna();
  }

  async function salva(voluto) {
    if (!scheda || stato === null || stato === 'non-disponibile' || salvando || stato.doveDiSerie === voluto) return;
    salvando = true; errore = null; disegna();
    try { stato = valida(await chiama(URL_IMPOSTAZIONI, 'POST', { doveDiSerie: voluto })); }
    catch (e) { errore = e; } // lo stato resta quello di prima: la scelta torna com'era al ridisegno
    finally { salvando = false; disegna(); }
  }

  /* Si rilegge ogni volta che si apre la scheda «Strumenti e permessi» (un'altra finestra o il telefono possono averla cambiata), e
     si ridisegna al cambio di lingua — `talos:lingua` parte dalla radice e non risale (`lingua.js`). */
  const suClic = (evento) => { if (evento.target?.closest?.('[data-settings-tab="tools"]')) void leggi(); };
  documento.addEventListener('click', suClic);
  documento.documentElement.addEventListener(EVENTO_LINGUA, disegna);
  void leggi();
  return { leggi, disegna, distruggi() { documento.removeEventListener('click', suClic); documento.documentElement.removeEventListener(EVENTO_LINGUA, disegna); } };
}
