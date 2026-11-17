/*
 * 0.2.2 (SignPath, brief «rete spegnibile») — «CATALOGO PUBBLICO DEI MODELLI» in Impostazioni → Sicurezza e privacy. All'apertura TALOS
 * chiedeva da solo a openrouter.ai l'elenco pubblico dei modelli (senza chiavi né conversazioni, ma col suo indirizzo IP), e non si spegneva.
 * Spento, TALOS chiede a OpenRouter solo dopo che la persona sceglie uno dei suoi modelli o gli dà una chiave; il selettore resta in piedi
 * con l'elenco incorporato.
 *
 * Due porte: questa riga (`GET/POST /api/v1/public-catalog/settings`, `src/catalogo-pubblico.mjs`) e l'attrezzo `app_settings` del modello,
 * voce `models.publicCatalog` (gruppo sicurezza: la carta c'è sempre). Con `TALOS_HARNESS_UI_CATALOGO_PUBBLICO=off` il server risponde
 * `spentoDallAmbiente: true`: l'interruttore resta spento e fermo, e la riga lo dice senza nomi tecnici.
 *
 * Forma: la carta di «Uso del computer» (`computer-use-impostazione.js`: testata, spiegazione, riga-interruttore `talos-switch`), nel pannello
 * della privacy subito DOPO «Link dalla chat», che resta la prima (decisione owner 164, `siti-fidati.js`). Lo stato a schermo lo scrive SOLO
 * la risposta del server: se il salvataggio fallisce l'interruttore torna com'era e la riga lo dice. Costruita elemento per elemento.
 */
import { t } from './lingua.js';

const EVENTO_LINGUA = 'talos:lingua';
const URL_IMPOSTAZIONI = '/api/v1/public-catalog/settings';
const RIGA = 'publicCatalogToggle';

function creaScheda(documento) {
  const scheda = documento.createElement('div');
  scheda.className = 'talos-card talos-settings__section';
  scheda.dataset.c = 'SettingsSection';
  scheda.dataset.settingsCard = 'privacy-public-catalog';
  scheda.setAttribute('role', 'group');
  scheda.setAttribute('aria-labelledby', 'settings-group-privacy-public-catalog');
  const testata = documento.createElement('div');
  testata.className = 'settings-group__head';
  testata.dataset.settingsGroupHead = '';
  const titolo = documento.createElement('h3');
  titolo.className = 'settings-group__title';
  titolo.setAttribute('id', 'settings-group-privacy-public-catalog');
  const conteggio = documento.createElement('span');
  conteggio.className = 'settings-group__count';
  conteggio.dataset.settingsGroupCount = '';
  conteggio.hidden = true;
  testata.append(titolo, conteggio);
  const descrizione = documento.createElement('p');
  descrizione.dataset.catalogoPubblicoDescrizione = '';
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
  return { scheda, titolo, descrizione, etichetta, aiuto, interruttore };
}

/** Il posto della carta: subito dopo «Link dalla chat» se c'è, altrimenti in cima; la banda delle azioni resta in fondo. */
export function mettiNelPannello(pannello, scheda) {
  const link = pannello.querySelector(':scope > [data-settings-card="privacy-link"]');
  if (link) { if (link.nextElementSibling !== scheda) link.after(scheda); return; }
  if (pannello.firstElementChild !== scheda) pannello.insertBefore(scheda, pannello.firstElementChild);
}

export function montaCatalogoPubblicoImpostazione({ documento = globalThis.document, fetchFn = globalThis.fetch?.bind(globalThis) } = {}) {
  if (!documento || typeof fetchFn !== 'function') return null;
  /* `stato`: null = non ancora letto; { acceso, spentoDallAmbiente } = la risposta del server; 'non-disponibile' = la rotta risponde con un errore. */
  let stato = null; let errore = null; let parti = null; let salvando = false;

  async function chiama(metodo, corpo) {
    const risposta = await fetchFn(URL_IMPOSTAZIONI, { method: metodo, credentials: 'same-origin',
      headers: { Accept: 'application/json', ...(corpo ? { 'Content-Type': 'application/json' } : {}) }, ...(corpo ? { body: JSON.stringify(corpo) } : {}) });
    const dati = await risposta.json().catch(() => null);
    if (!risposta.ok || typeof dati?.data?.acceso !== 'boolean') throw Object.assign(new Error('public-catalog-settings'), { code: dati?.error?.code ?? 'HTTP_ERROR' });
    return { acceso: dati.data.acceso, spentoDallAmbiente: dati.data.spentoDallAmbiente === true };
  }

  function disegna() {
    const pannello = documento.getElementById?.('setting-panel-privacy');
    if (!pannello) return;
    if (!parti || !parti.scheda.isConnected) {
      parti = creaScheda(documento);
      parti.interruttore.addEventListener('change', salva);
    }
    mettiNelPannello(pannello, parti.scheda);
    parti.titolo.textContent = t('modelli.publicCatalog.title');
    parti.descrizione.textContent = t('modelli.publicCatalog.description');
    parti.etichetta.textContent = t('modelli.publicCatalog.label');
    const disponibile = stato !== null && stato !== 'non-disponibile';
    const bloccato = disponibile && stato.spentoDallAmbiente === true;
    parti.aiuto.textContent = stato === 'non-disponibile' ? t('modelli.publicCatalog.unavailable')
      : errore ? t('modelli.publicCatalog.notSaved') : bloccato ? t('modelli.publicCatalog.forcedOff') : t('modelli.publicCatalog.help');
    parti.interruttore.disabled = !disponibile || salvando || bloccato;
    if (disponibile) parti.interruttore.checked = stato.acceso === true;
  }

  async function leggi() {
    try { stato = await chiama('GET'); } catch { stato = 'non-disponibile'; }
    errore = null; disegna();
  }

  async function salva() {
    if (!parti || stato === null || stato === 'non-disponibile' || salvando || stato.spentoDallAmbiente) return;
    const voluto = parti.interruttore.checked === true;
    salvando = true; disegna(); parti.interruttore.checked = voluto;
    try { stato = await chiama('POST', { acceso: voluto }); errore = null; }
    catch (e) { errore = e; } // lo stato resta quello di prima: l'interruttore torna com'era al ridisegno
    finally { salvando = false; disegna(); }
  }

  /* Si rilegge a ogni apertura della scheda «Privacy» (il modello o una scelta di modello possono averla cambiata) e si ridisegna al cambio di lingua. */
  const suClic = (evento) => { if (evento.target?.closest?.('[data-settings-tab="privacy"]')) void leggi(); };
  documento.addEventListener?.('click', suClic);
  documento.documentElement?.addEventListener?.(EVENTO_LINGUA, disegna);
  void leggi();
  return { leggi, disegna, salva, distruggi() { documento.removeEventListener?.('click', suClic); documento.documentElement?.removeEventListener?.(EVENTO_LINGUA, disegna); } };
}
