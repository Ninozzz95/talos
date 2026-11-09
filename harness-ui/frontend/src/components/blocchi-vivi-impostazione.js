/*
 * Decisione 140 dell'owner (04/11/2026) — «BLOCCHI VIVI NELLE RISPOSTE» in Impostazioni → Chat.
 *
 * Accesa di serie: le conversazioni NUOVE ricevono tabelle, grafici e scelte da cliccare dentro la risposta; spenta, nascono senza.
 * Quelle già aperte restano come sono: il server legge la scelta una volta alla nascita e la timbra sulla conversazione.
 * La scelta sta sul SERVER (`GET/POST /api/v1/chat-settings`, `impostazioni-chat.mjs`), come «Motore del contesto» e «Dove girano i
 * comandi»: una conversazione nasce anche dal telefono. Seconda porta: il modello la cambia con `app_settings` (voce `chat.liveBlocks`).
 *
 * Forma: la stessa riga-interruttore di «Chat a tutta larghezza» (`index.template.html`, `data-setting-row="chatFullWidthToggle"`),
 * nel gruppo dei controlli della chat (`settings-view.ts`, `[data-settings-chat-controls]`), con l'aiuto della riga di «Motore del
 * contesto» (`motore-contesto.js`). Lo stato a schermo lo scrive SOLO la risposta del server: se il salvataggio fallisce l'interruttore
 * torna com'era e la riga lo dice. Costruita elemento per elemento (niente `innerHTML`).
 */
import { t } from './lingua.js';

const EVENTO_LINGUA = 'talos:lingua';
const URL_IMPOSTAZIONI = '/api/v1/chat-settings';
const RIGA = 'liveBlocksToggle';

function creaRiga(documento) {
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
  return { riga, etichetta, aiuto, interruttore };
}

export function montaBlocchiVivi({ documento = globalThis.document, fetchFn = globalThis.fetch?.bind(globalThis) } = {}) {
  if (!documento?.body || typeof fetchFn !== 'function') return null;
  /* `stato`: null = non ancora letto; { blocchiVivi } = la risposta del server; 'non-disponibile' = la rotta risponde con un errore. */
  let stato = null; let errore = null; let parti = null; let salvando = false;

  async function chiama(metodo, corpo) {
    const risposta = await fetchFn(URL_IMPOSTAZIONI, { method: metodo, credentials: 'same-origin',
      headers: { Accept: 'application/json', ...(corpo ? { 'Content-Type': 'application/json' } : {}) }, ...(corpo ? { body: JSON.stringify(corpo) } : {}) });
    const dati = await risposta.json().catch(() => null);
    if (!risposta.ok || typeof dati?.data?.blocchiVivi !== 'boolean') throw Object.assign(new Error('chat-settings'), { code: dati?.error?.code ?? 'HTTP_ERROR' });
    return dati.data;
  }

  function disegna() {
    const pannello = documento.body.querySelector('[data-settings-panel="chat"]');
    if (!pannello) return;
    const casa = pannello.querySelector('[data-settings-chat-controls]') ?? pannello;
    if (!parti) {
      parti = creaRiga(documento);
      parti.interruttore.addEventListener('change', salva);
    }
    /* `settings-view.ts` crea il gruppo dei controlli della chat dopo l'avvio: la riga lo raggiunge al primo ridisegno */
    if (parti.riga.parentNode !== casa) casa.append(parti.riga);
    parti.etichetta.textContent = t('blocchi.settings.title');
    const disponibile = stato !== null && stato !== 'non-disponibile';
    parti.aiuto.textContent = stato === 'non-disponibile' ? t('blocchi.settings.unavailable')
      : errore ? t('blocchi.settings.notSaved') : t('blocchi.settings.help');
    parti.interruttore.disabled = !disponibile || salvando;
    if (disponibile) parti.interruttore.checked = stato.blocchiVivi === true;
  }

  async function leggi() {
    try { stato = await chiama('GET'); } catch { stato = 'non-disponibile'; }
    errore = null; disegna();
  }

  async function salva() {
    if (!parti || stato === null || stato === 'non-disponibile') return;
    const voluto = parti.interruttore.checked === true;
    salvando = true; disegna(); parti.interruttore.checked = voluto;
    try { stato = await chiama('POST', { blocchiVivi: voluto }); errore = null; }
    catch (e) { errore = e; } // lo stato resta quello di prima: l'interruttore torna com'era al ridisegno
    finally { salvando = false; disegna(); }
  }

  /* Si rilegge ogni volta che si apre la scheda «Chat» (il modello o il telefono possono averla cambiata), e si ridisegna al cambio di
     lingua — `talos:lingua` parte dalla radice e non risale (`lingua.js`). */
  const suClic = (evento) => { if (evento.target?.closest?.('[data-settings-tab="chat"]')) void leggi(); };
  documento.addEventListener?.('click', suClic);
  documento.documentElement?.addEventListener?.(EVENTO_LINGUA, disegna);
  void leggi();
  return { leggi, disegna, distruggi() { documento.removeEventListener?.('click', suClic); documento.documentElement?.removeEventListener?.(EVENTO_LINGUA, disegna); } };
}
