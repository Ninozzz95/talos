/*
 * 01/11/2026 — «TIENI SVEGLIO IL PC» in Impostazioni → Strumenti agente e permessi (forma `FORMA-PC-SVEGLIO-E-SCHEDA-LENTA-2026-11-01.md`,
 * OK del Desktop, frasi e posto del Frontend). Tre modi come Hermes desktop (`power-save.ts`): mai · mentre TALOS lavora (di serie) ·
 * sempre. La scelta sta sul SERVER (`GET/POST /api/v1/keep-awake-settings`, `impostazioni-pc-sveglio.mjs`), che la applica; il guscio
 * tiene il blocco. Fuori dall'app installata (sito, server da solo) la riga resta visibile ma spenta e lo dice: niente comandi che non
 * fanno nulla. Il `<select>` è nativo: lo riveste il sistema di casa (`calm-controls.js`). Lo stato a schermo lo scrive SOLO la
 * risposta del server: se il salvataggio fallisce la scelta torna com'era e la carta lo dice.
 */
import { t } from './lingua.js';

const EVENTO_LINGUA = 'talos:lingua';
const URL_IMPOSTAZIONI = '/api/v1/keep-awake-settings';
export const MODI_PC_SVEGLIO = Object.freeze([
  { valore: 'mai', chiave: 'varie.keepAwake.never' },
  { valore: 'mentre-lavora', chiave: 'varie.keepAwake.whileWorking' },
  { valore: 'sempre', chiave: 'varie.keepAwake.always' },
]);
const VALIDI = MODI_PC_SVEGLIO.map((m) => m.valore);

function creaScheda(documento) {
  const scheda = documento.createElement('div');
  scheda.className = 'talos-card talos-settings__section';
  scheda.dataset.c = 'SettingsSection';
  scheda.dataset.settingsCard = 'tools-pc-sveglio';
  scheda.setAttribute('role', 'group');
  scheda.setAttribute('aria-labelledby', 'settings-group-tools-pc-sveglio');
  scheda.innerHTML = '<div class="settings-group__head" data-settings-group-head>'
    + '<h3 class="settings-group__title" id="settings-group-tools-pc-sveglio"></h3>'
    + '<span class="settings-group__count" data-settings-group-count hidden></span></div>'
    + '<p data-pc-sveglio-aiuto></p>'
    + '<div data-calm-controls><select id="setting-pc-sveglio-modo" data-pc-sveglio-modo></select></div>'
    + '<p class="talos-setting__help" data-pc-sveglio-stato role="status" hidden></p>';
  const menu = scheda.querySelector('[data-pc-sveglio-modo]');
  for (const modo of MODI_PC_SVEGLIO) {
    const opzione = documento.createElement('option');
    opzione.value = modo.valore;
    menu.append(opzione);
  }
  const q = (s) => scheda.querySelector(s);
  return { scheda, menu, titolo: q('.settings-group__title'), aiuto: q('[data-pc-sveglio-aiuto]'), stato: q('[data-pc-sveglio-stato]') };
}

export function montaPcSveglio({ documento = globalThis.document, fetchFn = globalThis.fetch?.bind(globalThis) } = {}) {
  if (!documento || typeof fetchFn !== 'function') return null;
  /* `stato`: null = non ancora letto; { modo, nellApp } = la risposta del server; 'non-disponibile' = la rotta risponde con un errore */
  let stato = null; let errore = null; let scheda = null; let salvando = false;

  async function chiama(metodo = 'GET', corpo) {
    const risposta = await fetchFn(URL_IMPOSTAZIONI, { method: metodo, credentials: 'same-origin',
      headers: { Accept: 'application/json', ...(corpo ? { 'Content-Type': 'application/json' } : {}) }, ...(corpo ? { body: JSON.stringify(corpo) } : {}) });
    const dati = await risposta.json().catch(() => null);
    if (!risposta.ok || !dati?.data) throw Object.assign(new Error('keep-awake-settings'), { code: dati?.error?.code ?? 'HTTP_ERROR' });
    if (!VALIDI.includes(dati.data.modo)) throw Object.assign(new Error('keep-awake-settings'), { code: 'BAD_RESPONSE' });
    return { modo: dati.data.modo, nellApp: dati.data.nellApp === true };
  }

  function disegna() {
    const pannello = documento.getElementById('setting-panel-tools');
    if (!pannello) return;
    if (!scheda || !scheda.scheda.isConnected) {
      scheda = creaScheda(documento);
      scheda.menu.addEventListener('change', () => { void salva(scheda.menu.value); });
      /* Dopo «Dove girano i comandi» (stesso tema: cosa fa TALOS al computer mentre lavora); la riga delle azioni resta l'ultima */
      const sorella = pannello.querySelector('[data-settings-card="tools-dove-girano"]') ?? pannello.querySelector('[data-settings-card="tools-policy"]');
      const azioni = pannello.querySelector(':scope > .talos-settings__actions');
      if (sorella) sorella.after(scheda.scheda); else if (azioni) azioni.before(scheda.scheda); else pannello.append(scheda.scheda);
    }
    scheda.titolo.textContent = t('varie.keepAwake.title');
    scheda.menu.setAttribute('aria-label', t('varie.keepAwake.title'));
    scheda.aiuto.textContent = t('varie.keepAwake.help');
    for (const [i, modo] of MODI_PC_SVEGLIO.entries()) scheda.menu.options[i].textContent = t(modo.chiave);
    const letto = stato !== null && stato !== 'non-disponibile';
    if (letto) scheda.menu.value = stato.modo;
    scheda.menu.disabled = !letto || stato.nellApp !== true || salvando;
    const messaggio = stato === 'non-disponibile' ? t('varie.keepAwake.unavailable')
      : errore ? t('varie.keepAwake.notSaved')
        : letto && stato.nellApp !== true ? t('varie.keepAwake.onlyInApp') : '';
    scheda.stato.textContent = messaggio;
    scheda.stato.hidden = !messaggio;
  }

  async function leggi() {
    try { stato = await chiama(); } catch { stato = 'non-disponibile'; }
    errore = null; disegna();
  }

  async function salva(voluto) {
    if (!scheda || stato === null || stato === 'non-disponibile' || stato.nellApp !== true || salvando || stato.modo === voluto || !VALIDI.includes(voluto)) { disegna(); return; }
    salvando = true; errore = null; disegna();
    try { stato = await chiama('POST', { modo: voluto }); } catch (e) { errore = e; } // la scelta torna com'era al ridisegno
    finally { salvando = false; disegna(); }
  }

  const suClic = (evento) => { if (evento.target?.closest?.('[data-settings-tab="tools"]')) void leggi(); };
  documento.addEventListener('click', suClic);
  documento.documentElement.addEventListener(EVENTO_LINGUA, disegna);
  void leggi();
  return { leggi, disegna, salva, distruggi() { documento.removeEventListener('click', suClic); documento.documentElement.removeEventListener(EVENTO_LINGUA, disegna); } };
}
