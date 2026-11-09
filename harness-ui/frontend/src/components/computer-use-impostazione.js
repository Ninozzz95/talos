/*
 * Decisione 310 dell'owner (06/11/2026): «computer use nel rilascio come «Anteprima» spento di serie (acceso solo a mano) finché non sono
 * chiusi i 2 critici e i 13 alti» — «USO DEL COMPUTER» con il segno «Anteprima» in Impostazioni → Strumenti agente e permessi. Di serie
 * spento: il server risponde `acceso: false` finché la persona non lo accende qui o approva `app_settings`.
 *
 * Due porte: questa riga (`GET/POST /api/v1/computer-use/settings`, `src/computer-use/impostazione.mjs`) e l'attrezzo `app_settings` del modello,
 * voce `tools.computerUse` (gruppo sicurezza: la carta dei permessi c'è sempre). Vale dalla chiamata dopo, senza riavviare: un compito già
 * partito finisce col suo «Ferma». Come Hermes, che accende e spegne i gruppi di attrezzi da un menu (`hermes_cli/tools_config.py:434-454`).
 *
 * Forma: la riga-interruttore di «Blocchi vivi nelle risposte» (`blocchi-vivi-impostazione.js`: etichetta, aiuto, `talos-switch`) dentro una
 * carta del pannello degli strumenti, come «Tieni sveglio il PC» (`pc-sveglio-impostazioni.js`), dopo di lei. Lo stato a schermo lo scrive
 * SOLO la risposta del server: se il salvataggio fallisce l'interruttore torna com'era e la riga lo dice. Costruita elemento per elemento.
 */
import { t } from './lingua.js';

const EVENTO_LINGUA = 'talos:lingua';
const URL_IMPOSTAZIONI = '/api/v1/computer-use/settings';
const RIGA = 'computerUseToggle';

function creaScheda(documento) {
  const scheda = documento.createElement('div');
  scheda.className = 'talos-card talos-settings__section';
  scheda.dataset.c = 'SettingsSection';
  scheda.dataset.settingsCard = 'tools-computer-use';
  /* decisioni 331/335 (07/11/2026): la testata delle sorelle (`pc-sveglio-impostazioni.js`, `motore-contesto.js`) come prima cosa della carta,
     col titolo, il segno «Anteprima» accanto e il conteggio nascosto; il gruppo si chiama col titolo E col segno, letti insieme */
  scheda.setAttribute('role', 'group');
  scheda.setAttribute('aria-labelledby', 'settings-group-tools-computer-use settings-group-tools-computer-use-segno');
  const testata = documento.createElement('div');
  testata.className = 'settings-group__head';
  testata.dataset.settingsGroupHead = '';
  const titolo = documento.createElement('h3');
  titolo.className = 'settings-group__title';
  titolo.setAttribute('id', 'settings-group-tools-computer-use');
  titolo.dataset.settingsGroupTitle = 'tools-computer-use';
  /* il segno «Anteprima»: lo stesso `talos-badge--sm` di «Beta» nel Cielo (`cielo.js`) */
  const segno = documento.createElement('span');
  segno.className = 'talos-badge talos-badge--sm';
  segno.dataset.c = 'PreviewBadge';
  segno.setAttribute('id', 'settings-group-tools-computer-use-segno');
  const conteggio = documento.createElement('span');
  conteggio.className = 'settings-group__count';
  conteggio.dataset.settingsGroupCount = '';
  conteggio.hidden = true;
  /* decisione 331 (07/11/2026), secondo giro: il segno sta ACCANTO al titolo, non al bordo destro (la testata è `space-between`). Titolo e
     segno vanno in un `.settings-group__copy`, il contenitore che la carta della ricerca usa già per la sua testata (`settings-view.ts`),
     in riga con 8 px fra i due come Hermes (`delegation/model-routes.tsx:115`, `flex items-center gap-2` col nome e la sua `Pill`) */
  const copia = documento.createElement('div');
  copia.className = 'settings-group__copy settings-group__copy--riga';
  copia.append(titolo, segno);
  testata.append(copia, conteggio);
  /* la spiegazione sotto la testata, come nelle sorelle (`<p data-pc-sveglio-aiuto>`, `<p data-dove-serie-descrizione>`): niente id, FORME-04 */
  const descrizione = documento.createElement('p');
  descrizione.dataset.computerUseDescrizione = '';
  scheda.append(testata, descrizione);
  const riga = documento.createElement('div');
  riga.className = 'talos-setting';
  riga.dataset.c = 'SettingRow';
  riga.dataset.settingRow = RIGA;
  const testi = documento.createElement('div');
  const etichetta = documento.createElement('label');
  etichetta.className = 'talos-setting__label';
  etichetta.setAttribute('for', `setting-${RIGA}`);
  const aiuto = documento.createElement('p');
  aiuto.className = 'talos-setting__help';
  aiuto.setAttribute('id', `settingsHelp-${RIGA}`);
  aiuto.setAttribute('role', 'status');
  testi.append(etichetta, aiuto);
  const interruttore = documento.createElement('input');
  interruttore.setAttribute('id', `setting-${RIGA}`);
  interruttore.setAttribute('type', 'checkbox');
  interruttore.className = 'talos-switch';
  interruttore.dataset.c = 'Switch';
  interruttore.setAttribute('role', 'switch');
  interruttore.setAttribute('aria-describedby', `settingsHelp-${RIGA}`);
  interruttore.disabled = true;
  riga.append(testi, interruttore);
  scheda.append(riga);
  return { scheda, riga, titolo, segno, descrizione, etichetta, aiuto, interruttore };
}

export function montaComputerUseImpostazione({ documento = globalThis.document, fetchFn = globalThis.fetch?.bind(globalThis) } = {}) {
  if (!documento || typeof fetchFn !== 'function') return null;
  /* `stato`: null = non ancora letto; { acceso } = la risposta del server; 'non-disponibile' = la rotta risponde con un errore. */
  let stato = null; let errore = null; let parti = null; let salvando = false;

  async function chiama(metodo, corpo) {
    const risposta = await fetchFn(URL_IMPOSTAZIONI, { method: metodo, credentials: 'same-origin',
      headers: { Accept: 'application/json', ...(corpo ? { 'Content-Type': 'application/json' } : {}) }, ...(corpo ? { body: JSON.stringify(corpo) } : {}) });
    const dati = await risposta.json().catch(() => null);
    if (!risposta.ok || typeof dati?.data?.acceso !== 'boolean') throw Object.assign(new Error('computer-use-settings'), { code: dati?.error?.code ?? 'HTTP_ERROR' });
    return { acceso: dati.data.acceso };
  }

  function disegna() {
    const pannello = documento.getElementById?.('setting-panel-tools');
    if (!pannello) return;
    if (!parti || !parti.scheda.isConnected) {
      parti = creaScheda(documento);
      parti.interruttore.addEventListener('change', salva);
      /* Dopo «Tieni sveglio il PC» (cosa fa TALOS al computer) e prima di «Origine della ricerca web»; la riga delle azioni resta l'ultima.
         ⛔ Decisione 331 (07/11/2026), secondo giro: il posto si àncora alla carta FISSA che viene dopo, la ricerca, che sta nel modello
         della pagina e c'è dal primo disegno. Agganciarsi alla sorella di prima dipendeva da chi rispondeva prima: con le letture delle
         sorelle lente di 400 ms la carta finiva sotto la ricerca e non si spostava più (FORME-07). Le sorelle si mettono dopo «Policy della
         sessione», quindi arrivando dopo finiscono comunque sopra di lei. */
      const dopo = pannello.querySelector('[data-settings-card="tools-search"]');
      const sorella = pannello.querySelector('[data-settings-card="tools-pc-sveglio"]') ?? pannello.querySelector('[data-settings-card="tools-dove-girano"]');
      const azioni = pannello.querySelector(':scope > .talos-settings__actions');
      if (dopo) dopo.before(parti.scheda); else if (sorella) sorella.after(parti.scheda); else if (azioni) azioni.before(parti.scheda); else pannello.append(parti.scheda);
    }
    parti.titolo.textContent = t('computer.settings.title');
    parti.segno.textContent = t('computer.settings.preview');
    parti.descrizione.textContent = t('computer.settings.description');
    parti.etichetta.textContent = t('computer.settings.label');
    const disponibile = stato !== null && stato !== 'non-disponibile';
    parti.aiuto.textContent = stato === 'non-disponibile' ? t('computer.settings.unavailable')
      : errore ? t('computer.settings.notSaved') : t('computer.settings.help');
    parti.interruttore.disabled = !disponibile || salvando;
    if (disponibile) parti.interruttore.checked = stato.acceso === true;
  }

  async function leggi() {
    try { stato = await chiama('GET'); } catch { stato = 'non-disponibile'; }
    errore = null; disegna();
  }

  async function salva() {
    if (!parti || stato === null || stato === 'non-disponibile' || salvando) return;
    const voluto = parti.interruttore.checked === true;
    salvando = true; disegna(); parti.interruttore.checked = voluto;
    try { stato = await chiama('POST', { acceso: voluto }); errore = null; }
    catch (e) { errore = e; } // lo stato resta quello di prima: l'interruttore torna com'era al ridisegno
    finally { salvando = false; disegna(); }
  }

  /* Si rilegge a ogni apertura della scheda «Strumenti» (il modello o il telefono possono averla cambiata) e si ridisegna al cambio di lingua. */
  const suClic = (evento) => { if (evento.target?.closest?.('[data-settings-tab="tools"]')) void leggi(); };
  documento.addEventListener?.('click', suClic);
  documento.documentElement?.addEventListener?.(EVENTO_LINGUA, disegna);
  void leggi();
  return { leggi, disegna, salva, distruggi() { documento.removeEventListener?.('click', suClic); documento.documentElement?.removeEventListener?.(EVENTO_LINGUA, disegna); } };
}
