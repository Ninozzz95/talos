/*
 * ⭐ 01/10/2026 — L'AGGIORNAMENTO AUTOMATICO A SCHERMO (owner: «seamless, automatizzato e user friendly»). Due pezzi:
 *   · la BANDA sotto la barra del titolo, su ogni schermata (owner, «Banda sotto la barra del titolo», come GitHub Desktop):
 *     «TALOS <v> è pronto. Si installa quando chiudi l'app.» con «Novità», «Riavvia ora» e una × che la nasconde fino al
 *     prossimo avvio;
 *   · la scheda «Aggiornamenti» in testa a «Account, Doctor e backup» (owner): versione installata, esito e ora dell'ultimo
 *     controllo, «Controlla ora», interruttore «Aggiornamenti automatici».
 * ⛔ SOLO nell'app desktop: tutto nasce quando il guscio manda lo stato (`desktop/canale-aggiornamenti.mjs`, evento
 *   `talos:aggiornamenti` e `window.__talosAggiornamenti`). Nel browser (il 4174) quello stato non arriva mai, e qui non nasce
 *   niente: stesso DOM di prima.
 * ⛔ Le risposte tornano al guscio con `window.open('talos-desktop://aggiornamenti?…')` e il gettone ricevuto con lo stato,
 *   la stessa forma del menu della barra (`barra-finestra.js`). Il guscio nega la finestra e esegue l'azione.
 * ⛔ Le frasi passano da `t()` (chiave = la frase italiana, `components/lingua.js`) e si riscrivono a ogni disegno: un cambio di
 *   lingua le segue (prima foto del 01/10: banda e scheda in italiano dentro un'interfaccia in inglese).
 */
import { EVENTO_LINGUA, linguaCorrenteDiT, t } from './lingua.js';

export const EVENTO_AGGIORNAMENTI = 'talos:aggiornamenti';
const INDIRIZZO = 'talos-desktop://aggiornamenti';

function chiedi(finestra, stato, azione, extra = {}) {
  const q = new URLSearchParams({ azione, ...extra, gettone: stato?.gettone ?? '' });
  finestra.open(`${INDIRIZZO}?${q}`, '_blank');
}

/** Ora di un controllo come la legge una persona: «oggi alle 21:30», «ieri alle 09:05», «28/09 alle 18:00». */
export function quandoLeggibile(iso, adesso = new Date()) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const locale = linguaCorrenteDiT() === 'en' ? 'en-GB' : 'it-IT';
  const ora = d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  const giorno = (x) => `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`;
  const ieri = new Date(adesso); ieri.setDate(adesso.getDate() - 1);
  if (giorno(d) === giorno(adesso)) return t('oggi alle {ora}', { ora });
  if (giorno(d) === giorno(ieri)) return t('ieri alle {ora}', { ora });
  return t('{giorno} alle {ora}', { giorno: d.toLocaleDateString(locale, { day: '2-digit', month: '2-digit' }), ora });
}

/** La frase della banda: dice la verità sull'installazione (con l'interruttore spento NON si installa da solo). */
export function fraseBanda(stato) {
  const v = stato?.pronto?.versione;
  if (!v) return null;
  return stato.automatici !== false
    ? t('TALOS {v} è pronto. Si installa quando chiudi l’app.', { v })
    : t('TALOS {v} è pronto. Riavvia per installarlo.', { v });
}

/** La riga di stato della scheda. */
export function fraseStato(stato, adesso = new Date()) {
  if (!stato?.attivo) {
    return stato?.motivoSpento === 'preview' ? t('Questa è una copia di prova: non si aggiorna da sola. Installa la versione nuova dal sito delle release.')
      : stato?.motivoSpento === 'sviluppo' ? t('Questa copia di sviluppo non si aggiorna da sola.')
        : t('L’aggiornamento automatico non è partito: trovi il motivo nel registro (menu ⋯ › Apri il registro).');
  }
  if (stato.stato === 'controllo') return t('Controllo in corso…');
  if (stato.stato === 'scaricamento') return t('Scaricamento dell’aggiornamento in corso…');
  if (stato.pronto) return fraseBanda(stato);
  const ultimo = stato.ultimoControllo;
  const quando = ultimo?.quando ? quandoLeggibile(ultimo.quando, adesso) : null;
  if (!quando) return t('Nessun controllo ancora.');
  if (ultimo.esito === 'errore') return t('Ultimo controllo {quando} non riuscito: {errore}', { quando, errore: ultimo.errore ?? t('errore sconosciuto') });
  if (ultimo.esito === 'aggiornato') return t('Ultimo controllo {quando}: TALOS è aggiornato.', { quando });
  return t('Ultimo controllo {quando}.', { quando });
}

/**
 * Quante sessioni stanno lavorando ADESSO, dall'elenco del server (`GET /api/v1/sessions`): un giro aperto è una sessione non
 * conclusa e non interrotta (`session-registry.mjs`, `elenca()`). `null` se l'elenco non si legge: non lo sappiamo.
 */
export async function contaGiriInCorso(finestra) {
  try {
    const risposta = await finestra.fetch('/api/v1/sessions', { headers: { accept: 'application/json' } });
    if (!risposta.ok) return null;
    const corpo = await risposta.json();
    const voci = corpo?.data?.items ?? corpo?.items;
    if (!Array.isArray(voci)) return null;
    return voci.filter((s) => s && s.conclusa === false && s.interrotta !== true).length;
  }
  catch { return null; }
}

/**
 * ⛔ 01/10/2026 (owner: «Riavvia ora» → «Chiede se c'è un giro in corso») — riavviare chiude il server: un giro in corso si
 *   interrompe (al riavvio la sessione torna «interrotta»). Se una sessione sta lavorando, o non si
 *   riesce a saperlo, si chiede prima; altrimenti si riavvia subito, come prima.
 */
export function fraseConfermaRiavvio(n) {
  if (n === null) return t('Non riesco a sapere se una sessione sta lavorando: se sì, riavviare la interrompe.');
  return n === 1 ? t('Una sessione sta lavorando: riavviare la interrompe.') : t('{n} sessioni stanno lavorando: riavviare le interrompe.', { n });
}

/*
 * ⛔ Revisione Codex 02/10/2026, rilievo 3: banda e scheda hanno ciascuna il suo «Riavvia ora», e disabilitare solo il pulsante
 *   premuto lasciava partire due conteggi, due conferme o due richieste. ⇒ Uno stato SOLO per i due pulsanti (`riavvio`):
 *   mentre si conta o la richiesta è partita, tutti e due restano spenti, anche dopo un ridisegno. Una richiesta partita torna
 *   libera dopo `LIBERO_DOPO_MS` (se il guscio non ha potuto riavviare, la persona può riprovare).
 */
const LIBERO_DOPO_MS = 10_000;
async function riavviaChiedendo({ finestra, conferma, prendiStato, riavvio, ridisegna }) {
  if (riavvio.stato !== 'libero') return;
  const invia = () => {
    if (riavvio.stato === 'inviato') return;
    riavvio.stato = 'inviato'; ridisegna();
    chiedi(finestra, prendiStato(), 'riavvia');
    finestra.setTimeout?.(() => { riavvio.stato = 'libero'; ridisegna(); }, LIBERO_DOPO_MS);
  };
  riavvio.stato = 'conta'; ridisegna();
  const n = await contaGiriInCorso(finestra);
  if (n === 0) { riavvio.stato = 'libero'; invia(); return; }
  riavvio.stato = 'libero'; ridisegna(); // la finestra di conferma copre la pagina: i pulsanti dietro non si raggiungono
  conferma({
    titolo: t('Riavviare TALOS adesso?'),
    domanda: fraseConfermaRiavvio(n),
    etichettaConferma: t('Riavvia lo stesso'),
    onConferma: invia,
  });
}

function bottone(documento, classi) {
  const b = documento.createElement('button');
  b.type = 'button'; b.className = classi;
  return b;
}

function creaBanda(documento) {
  const banda = documento.createElement('div');
  banda.id = 'talosBandaAggiornamento';
  banda.className = 'talos-banda-aggiornamento';
  banda.dataset.c = 'BandaAggiornamento';
  banda.setAttribute('role', 'status');
  banda.hidden = true;
  const testo = documento.createElement('p');
  testo.className = 'talos-banda-aggiornamento__testo';
  const novita = bottone(documento, 'talos-button talos-button--ghost talos-button--sm');
  const riavvia = bottone(documento, 'talos-button talos-button--primary talos-button--sm');
  const chiudi = bottone(documento, 'talos-button talos-button--ghost talos-icon-button talos-banda-aggiornamento__chiudi');
  chiudi.innerHTML = '<svg class="i" aria-hidden="true"><use href="#i-x"/></svg>';
  banda.append(testo, novita, riavvia, chiudi);
  return { banda, testo, novita, riavvia, chiudi };
}

function creaScheda(documento) {
  /* La forma ESATTA della carta sorella «Configurazione e diagnostica» dopo `testataCarta` di `settings-view.ts` (testata senza
     copia: il titolo nella testata, la descrizione sotto): questa carta nasce DOPO quel montaggio, quindi la si scrive già così. */
  const scheda = documento.createElement('div');
  scheda.className = 'talos-card talos-settings__section talos-aggiornamenti';
  scheda.dataset.c = 'SettingsSection';
  scheda.dataset.settingsCard = 'account-aggiornamenti';
  scheda.setAttribute('role', 'group');
  scheda.setAttribute('aria-labelledby', 'settings-group-account-aggiornamenti');
  scheda.innerHTML = '<div class="settings-group__head" data-settings-group-head>'
    + '<h3 class="settings-group__title" id="settings-group-account-aggiornamenti" data-settings-group-title="account-aggiornamenti"></h3>'
    + '<span class="settings-group__count" data-settings-group-count hidden></span></div>'
    + '<p data-aggiornamenti-descrizione></p>'
    + '<div class="talos-setting" data-c="SettingRow" data-setting-row="aggiornamentiStato"><div><span class="talos-setting__label" data-aggiornamenti-versione></span>'
    + '<p class="talos-setting__help" data-aggiornamenti-stato role="status"></p></div><div class="talos-setting__control" data-aggiornamenti-azioni></div></div>'
    + '<div class="talos-setting" data-c="SettingRow" data-setting-row="aggiornamentiAutomatici"><div><label class="talos-setting__label" for="setting-aggiornamentiAutomatici" data-aggiornamenti-etichetta></label>'
    + '<p class="talos-setting__help" data-aggiornamenti-aiuto></p></div>'
    + '<input id="setting-aggiornamentiAutomatici" type="checkbox" class="talos-switch" data-c="Switch" role="switch"></div>';
  const controlla = bottone(documento, 'talos-button talos-button--secondary talos-button--sm');
  const riavvia = bottone(documento, 'talos-button talos-button--primary talos-button--sm');
  scheda.querySelector('[data-aggiornamenti-azioni]').append(controlla, riavvia);
  const q = (s) => scheda.querySelector(s);
  return {
    scheda, controlla, riavvia, interruttore: q('#setting-aggiornamentiAutomatici'),
    titolo: q('.settings-group__title'), descrizione: q('[data-aggiornamenti-descrizione]'),
    versione: q('[data-aggiornamenti-versione]'), stato: q('[data-aggiornamenti-stato]'),
    etichetta: q('[data-aggiornamenti-etichetta]'), aiuto: q('[data-aggiornamenti-aiuto]'),
    rigaAutomatici: q('[data-setting-row="aggiornamentiAutomatici"]'),
  };
}

export function montaAggiornamenti({ documento = globalThis.document, finestra = globalThis.window, adesso = () => new Date(), conferma = () => {} } = {}) {
  if (!documento || !finestra) return null;
  let stato = null; let banda = null; let scheda = null;
  const riavvio = { stato: 'libero' }; // uno per i due «Riavvia ora» (vedi `riavviaChiedendo`)
  const prendiStato = () => stato;

  function disegnaBanda() {
    if (!banda) {
      banda = creaBanda(documento);
      banda.novita.addEventListener('click', () => { const p = prendiStato()?.pronto?.pagina; if (p) finestra.open(p, '_blank'); });
      banda.riavvia.addEventListener('click', () => riavviaChiedendo({ finestra, conferma, prendiStato, riavvio, ridisegna: disegna }));
      /* La × nasconde SUBITO (e ridisegna: anche la misura dei pannelli torna quella di prima), e lo dice al guscio, che la
         tiene nascosta fino al prossimo avvio anche dopo un «Ricarica». */
      banda.chiudi.addEventListener('click', () => { stato = { ...stato, nascosto: true }; disegna(); chiedi(finestra, stato, 'nascondi'); });
      const barra = documento.getElementById('talosBarraFinestra');
      const guscio = documento.querySelector('.talos-shell');
      if (barra) barra.after(banda.banda); else if (guscio) guscio.before(banda.banda); else documento.body.prepend(banda.banda);
    }
    const frase = fraseBanda(stato);
    banda.banda.hidden = !(stato.attivo && frase && !stato.nascosto);
    banda.testo.textContent = frase ?? '';
    banda.testo.title = frase ?? '';
    banda.novita.textContent = t('Novità');
    banda.novita.hidden = !stato.pronto?.pagina;
    banda.riavvia.textContent = t('Riavvia ora');
    banda.riavvia.disabled = riavvio.stato !== 'libero';
    const nascondi = t('Nascondi fino al prossimo avvio');
    banda.chiudi.setAttribute('aria-label', nascondi); banda.chiudi.title = nascondi;
    documento.documentElement.toggleAttribute('data-talos-banda-aggiornamento', !banda.banda.hidden);
  }

  function disegnaScheda() {
    const pannello = documento.getElementById('setting-panel-account');
    if (pannello && (!scheda || !scheda.scheda.isConnected)) {
      scheda = creaScheda(documento);
      scheda.controlla.addEventListener('click', () => { scheda.controlla.disabled = true; chiedi(finestra, prendiStato(), 'controlla'); });
      scheda.riavvia.addEventListener('click', () => riavviaChiedendo({ finestra, conferma, prendiStato, riavvio, ridisegna: disegna }));
      scheda.interruttore.addEventListener('change', () => chiedi(finestra, prendiStato(), 'automatici', { acceso: scheda.interruttore.checked ? '1' : '0' }));
      pannello.prepend(scheda.scheda);
    }
    if (!scheda) return;
    scheda.titolo.textContent = t('Aggiornamenti');
    scheda.descrizione.textContent = t('Controlla all’avvio e ogni 4 ore; installa quando chiudi l’app.');
    scheda.versione.textContent = stato.versioneAttuale ? `TALOS ${stato.versioneAttuale}` : 'TALOS';
    scheda.stato.textContent = fraseStato(stato, adesso());
    scheda.etichetta.textContent = t('Aggiornamenti automatici');
    scheda.aiuto.textContent = t('Spento, TALOS non controlla da solo e non installa alla chiusura: resta «Controlla ora».');
    scheda.controlla.textContent = t('Controlla ora');
    scheda.riavvia.textContent = t('Riavvia ora');
    const lavora = stato.stato === 'controllo' || stato.stato === 'scaricamento';
    scheda.controlla.hidden = !stato.attivo || Boolean(stato.pronto);
    scheda.controlla.disabled = lavora;
    scheda.riavvia.hidden = !stato.attivo || !stato.pronto;
    scheda.riavvia.disabled = riavvio.stato !== 'libero';
    scheda.rigaAutomatici.hidden = !stato.attivo;
    scheda.interruttore.checked = stato.automatici !== false;
  }

  function disegna() {
    if (!stato) return;
    disegnaBanda();
    disegnaScheda();
  }

  const suStato = (evento) => { stato = evento.detail ?? null; disegna(); };
  finestra.addEventListener(EVENTO_AGGIORNAMENTI, suStato);
  /* `talos:lingua` parte dalla radice e non risale (`lingua.js`, `applicaLingua`): si ascolta lì, non su window. */
  documento.documentElement.addEventListener(EVENTO_LINGUA, disegna);
  if (finestra.__talosAggiornamenti) { stato = finestra.__talosAggiornamenti; disegna(); }
  return { disegna, distruggi() { finestra.removeEventListener(EVENTO_AGGIORNAMENTI, suStato); documento.documentElement.removeEventListener(EVENTO_LINGUA, disegna); } };
}
