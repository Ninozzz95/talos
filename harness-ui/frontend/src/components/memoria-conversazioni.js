/*
 * 01/11/2026 — «MEMORIA DELLE CONVERSAZIONI» in Impostazioni → Modelli, subito dopo «Quando la finestra di un modello locale si riempie»
 * (posto e controllo del Frontend; forma `FORMA-FOTO-E-RIORDINO-2026-11-01.md`). A schermo mai «foto». Il valore e il massimo li dà il
 * SERVER (`GET/POST /api/v1/conversation-memory-settings`); il campo è quello di casa del gestore del contesto (`talos-stack` +
 * `talos-field__input type=number`, unità nell'etichetta). Nessun «Salva»: al change si salva; se fallisce torna il valore di prima e una
 * riga lo dice. Con 0 la riga di stato dice «Spenta» al posto dell'aiuto.
 */
import { t } from './lingua.js';

const EVENTO_LINGUA = 'talos:lingua';
const URL_IMPOSTAZIONI = '/api/v1/conversation-memory-settings';

function creaScheda(documento) {
  const scheda = documento.createElement('div');
  scheda.className = 'talos-card talos-settings__section';
  scheda.dataset.c = 'SettingsSection';
  scheda.dataset.settingsCard = 'modelli-memoria-conversazioni';
  scheda.setAttribute('role', 'group');
  scheda.setAttribute('aria-labelledby', 'settings-group-modelli-memoria-conversazioni');
  scheda.innerHTML = '<div class="settings-group__head" data-settings-group-head>'
    + '<h3 class="settings-group__title" id="settings-group-modelli-memoria-conversazioni"></h3></div>'
    + '<p data-memoria-aiuto></p>'
    + '<label class="talos-stack talos-provider__field"><span data-memoria-etichetta></span>'
    + '<input class="talos-field__input" type="number" min="0" step="1" inputmode="numeric" data-memoria-gb></label>'
    + '<p class="talos-setting__help" data-memoria-stato role="status" hidden></p>';
  const q = (s) => scheda.querySelector(s);
  return { scheda, titolo: q('.settings-group__title'), aiuto: q('[data-memoria-aiuto]'), etichetta: q('[data-memoria-etichetta]'), campo: q('[data-memoria-gb]'), stato: q('[data-memoria-stato]') };
}

export function montaMemoriaConversazioni({ documento = globalThis.document, fetchFn = globalThis.fetch?.bind(globalThis) } = {}) {
  if (!documento || typeof fetchFn !== 'function') return null;
  /* `stato`: null = non letto; { gb, massimo } = la risposta del server; 'non-disponibile' = la rotta risponde con un errore */
  let stato = null; let errore = false; let scheda = null; let salvando = false;

  async function chiama(metodo = 'GET', corpo) {
    const risposta = await fetchFn(URL_IMPOSTAZIONI, { method: metodo, credentials: 'same-origin',
      headers: { Accept: 'application/json', ...(corpo ? { 'Content-Type': 'application/json' } : {}) }, ...(corpo ? { body: JSON.stringify(corpo) } : {}) });
    const dati = await risposta.json().catch(() => null);
    if (!risposta.ok || !dati?.data || !Number.isSafeInteger(dati.data.gb)) throw Object.assign(new Error('conversation-memory-settings'), { code: dati?.error?.code ?? 'HTTP_ERROR' });
    return { gb: dati.data.gb, massimo: Number.isSafeInteger(dati.data.massimo) ? dati.data.massimo : null };
  }

  /* Subito DOPO la sorella, sempre. ⛔ Foto del 01/11 a 1024: la sorella si monta dopo una sua lettura dal server e può arrivare DOPO
     questa carta, che allora restava sopra di lei. Si rimette a posto a ogni disegno e quando il pannello cambia (MutationObserver). */
  let osservatore = null;
  function aPosto(pannello) {
    const sorella = pannello.querySelector('[data-settings-card="modelli-finestra-piena"]');
    if (sorella && scheda && sorella.nextElementSibling !== scheda.scheda) sorella.after(scheda.scheda);
  }

  function disegna() {
    const pannello = documento.getElementById('setting-panel-models') ?? documento.querySelector?.('[data-settings-card="modelli-finestra-piena"]')?.parentElement ?? null;
    if (!pannello) return;
    if (!scheda || !scheda.scheda.isConnected) {
      scheda = creaScheda(documento);
      scheda.campo.addEventListener('change', () => { void salva(Number(scheda.campo.value)); });
      pannello.append(scheda.scheda);
      osservatore?.disconnect();
      const Osservatore = documento.defaultView?.MutationObserver ?? globalThis.MutationObserver;
      if (typeof Osservatore === 'function') {
        osservatore = new Osservatore(() => aPosto(pannello));
        osservatore.observe(pannello, { childList: true });
      }
    }
    aPosto(pannello);
    scheda.titolo.textContent = t('varie.conversationMemory.title');
    scheda.etichetta.textContent = t('varie.conversationMemory.label');
    const letto = stato !== null && stato !== 'non-disponibile';
    if (letto) {
      scheda.campo.value = String(stato.gb);
      if (stato.massimo !== null) scheda.campo.max = String(Math.max(stato.massimo, stato.gb));
    }
    scheda.campo.disabled = !letto || salvando;
    const spenta = letto && stato.gb === 0;
    scheda.aiuto.textContent = spenta ? '' : t('varie.conversationMemory.help');
    scheda.aiuto.hidden = spenta;
    const messaggio = stato === 'non-disponibile' ? t('varie.conversationMemory.unavailable') : errore ? t('varie.conversationMemory.notSaved') : spenta ? t('varie.conversationMemory.off') : '';
    scheda.stato.textContent = messaggio;
    scheda.stato.hidden = !messaggio;
  }

  async function leggi() {
    try { stato = await chiama(); } catch { stato = 'non-disponibile'; }
    errore = false; disegna();
  }

  async function salva(voluto) {
    if (!scheda || stato === null || stato === 'non-disponibile' || salvando || !Number.isSafeInteger(voluto) || voluto < 0 || voluto === stato.gb) { disegna(); return; }
    salvando = true; errore = false; disegna();
    try { stato = await chiama('POST', { gb: voluto }); } catch { errore = true; } // il valore torna quello di prima al ridisegno
    finally { salvando = false; disegna(); }
  }

  const suClic = (evento) => { if (evento.target?.closest?.('[data-settings-tab="models"]')) void leggi(); };
  documento.addEventListener('click', suClic);
  documento.documentElement.addEventListener(EVENTO_LINGUA, disegna);
  void leggi();
  return { leggi, disegna, salva, distruggi() { osservatore?.disconnect(); documento.removeEventListener('click', suClic); documento.documentElement.removeEventListener(EVENTO_LINGUA, disegna); } };
}
