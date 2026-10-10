/*
 * C1 (owner 09/10/2026 sera) — «MOTORE DEL CONTESTO» in Impostazioni → Memoria e contesto.
 *
 * Decisioni: il Context Engine col metodo approvato (prima le uscite vecchie messe da parte, il riassunto solo se serve, il
 * recupero sempre) è il motore DI SERIE delle conversazioni NUOVE; un interruttore lo spegne, e da spento le nuove usano la
 * compattazione precedente; quelle già nate tengono il motore con cui sono nate (timbro del server, `session-registry.mjs`).
 * La scelta sta sul SERVER (`GET/POST /api/v1/context-settings`, `impostazioni-contesto.mjs`): vale anche per le conversazioni
 * che nascono senza interfaccia (figlie, Workflow, automazioni).
 *
 * Forma: la stessa carta di «Aggiornamenti» (`aggiornamenti.js::creaScheda`) — testata, descrizione, una riga con interruttore
 * e aiuto. Si monta dopo «Ripartizione del contesto». Lo stato a schermo lo scrive SOLO la risposta del server: se il salvataggio
 * fallisce l'interruttore torna com'era e la riga lo dice.
 */
import { t } from './lingua.js';

const EVENTO_LINGUA = 'talos:lingua';
const URL_IMPOSTAZIONI = '/api/v1/context-settings';

function creaScheda(documento) {
  const scheda = documento.createElement('div');
  scheda.className = 'talos-card talos-settings__section';
  scheda.dataset.c = 'SettingsSection';
  scheda.dataset.settingsCard = 'memoria-motore-contesto';
  scheda.setAttribute('role', 'group');
  scheda.setAttribute('aria-labelledby', 'settings-group-memoria-motore-contesto');
  scheda.innerHTML = '<div class="settings-group__head" data-settings-group-head>'
    + '<h3 class="settings-group__title" id="settings-group-memoria-motore-contesto" data-settings-group-title="memoria-motore-contesto"></h3></div>'
    + '<p data-motore-contesto-descrizione></p>'
    + '<div class="talos-setting" data-c="SettingRow" data-setting-row="motoreContesto"><div><label class="talos-setting__label" for="setting-motoreContesto" data-motore-contesto-etichetta></label>'
    + '<p class="talos-setting__help" id="settingsHelp-motoreContesto" data-motore-contesto-aiuto role="status"></p></div>'
    + '<input id="setting-motoreContesto" type="checkbox" class="talos-switch" data-c="Switch" role="switch" aria-describedby="settingsHelp-motoreContesto" disabled></div>';
  const q = (s) => scheda.querySelector(s);
  return { scheda, titolo: q('.settings-group__title'), descrizione: q('[data-motore-contesto-descrizione]'), etichetta: q('[data-motore-contesto-etichetta]'), aiuto: q('[data-motore-contesto-aiuto]'), interruttore: q('#setting-motoreContesto') };
}

export function montaMotoreContesto({ documento = globalThis.document, fetchFn = globalThis.fetch?.bind(globalThis) } = {}) {
  if (!documento || typeof fetchFn !== 'function') return null;
  /* `stato`: null = non ancora letto; { motore } = la risposta del server; 'non-disponibile' = la rotta risponde con un errore. */
  let stato = null; let errore = null; let scheda = null; let salvando = false;

  async function chiama(metodo, corpo) {
    const risposta = await fetchFn(URL_IMPOSTAZIONI, { method: metodo, credentials: 'same-origin',
      headers: { Accept: 'application/json', ...(corpo ? { 'Content-Type': 'application/json' } : {}) }, ...(corpo ? { body: JSON.stringify(corpo) } : {}) });
    const dati = await risposta.json().catch(() => null);
    if (!risposta.ok || !dati?.data || !['engine', 'legacy'].includes(dati.data.motore)) throw Object.assign(new Error('context-settings'), { code: dati?.error?.code ?? 'HTTP_ERROR' });
    return dati.data;
  }

  function disegna() {
    const pannello = documento.getElementById('setting-panel-memoria');
    if (!pannello) return;
    if (!scheda || !scheda.scheda.isConnected) {
      scheda = creaScheda(documento);
      scheda.interruttore.addEventListener('change', salva);
      const sorella = pannello.querySelector('[data-settings-card="memoria-context"]');
      if (sorella) sorella.after(scheda.scheda); else pannello.prepend(scheda.scheda);
    }
    scheda.titolo.textContent = t('varie.contextEngine.card.title');
    scheda.descrizione.textContent = t('varie.contextEngine.card.description');
    scheda.etichetta.textContent = t('varie.contextEngine.card.label');
    const disponibile = stato !== null && stato !== 'non-disponibile';
    scheda.aiuto.textContent = stato === 'non-disponibile' ? t('varie.contextEngine.card.unavailable')
      : errore ? t('varie.contextEngine.card.notSaved') : t('varie.contextEngine.card.help');
    scheda.interruttore.disabled = !disponibile || salvando;
    if (disponibile) scheda.interruttore.checked = stato.motore === 'engine';
  }

  async function leggi() {
    try { stato = await chiama('GET'); } catch { stato = 'non-disponibile'; }
    errore = null; disegna();
  }

  async function salva() {
    if (!scheda || stato === null || stato === 'non-disponibile') return;
    const voluto = scheda.interruttore.checked ? 'engine' : 'legacy';
    salvando = true; disegna(); scheda.interruttore.checked = voluto === 'engine';
    try { stato = await chiama('POST', { motore: voluto }); errore = null; }
    catch (e) { errore = e; } // lo stato resta quello di prima: l'interruttore torna com'era al ridisegno
    finally { salvando = false; disegna(); }
  }

  /* Si rilegge ogni volta che si apre la scheda «Memoria e contesto» (un'altra finestra può averlo cambiato), e si ridisegna al
     cambio di lingua — `talos:lingua` parte dalla radice e non risale (`lingua.js`). */
  const suClic = (evento) => { if (evento.target?.closest?.('[data-settings-tab="memoria"]')) void leggi(); };
  documento.addEventListener('click', suClic);
  documento.documentElement.addEventListener(EVENTO_LINGUA, disegna);
  void leggi();
  return { leggi, disegna, distruggi() { documento.removeEventListener('click', suClic); documento.documentElement.removeEventListener(EVENTO_LINGUA, disegna); } };
}
