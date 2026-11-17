/*
 * L'Assistente, «Con che modello pensa» (decisione 1645 punto 2, giudice v1564, 11/11/2026): di serie il modello della chat, cambiabile con
 *   qualunque altro, cloud o locale. Il pannello dell'Assistente ha le tre scelte del bozzetto («Si cambia qui o nelle Impostazioni»); qui, in
 *   Impostazioni → Memoria e contesto, l'elenco intero dei modelli, lo stesso della carta della compattazione (`carta-compattazione.js`).
 * Lo stato a schermo lo scrive solo la risposta del server (`GET/POST /api/v1/assistant-settings`): un salvataggio fallito rimette la scelta di
 *   prima e lo dice. Forma come `carta-compattazione.js`; il `select` lo veste `calm-controls.js`.
 */
import { t } from './lingua.js';
import { nomeModelloUmano } from './chat-foot.js';
import { leggiCataloghiDiretti, nomeFornitore, PROVIDER_DIRETTI } from './fonti-modelli.js';

/** Il pannello dell'Assistente chiede di scegliere un altro modello: `app.js` apre la sezione, questa carta apre il menu. */
export const EVENTO_SCEGLI_MODELLO_ASSISTENTE = 'talos:scegli-modello-assistente';
const EVENTO_LINGUA = 'talos:lingua';
const URL_IMPOSTAZIONI = '/api/v1/assistant-settings';

function creaScheda(documento) {
  const scheda = documento.createElement('div');
  scheda.className = 'talos-card talos-settings__section';
  scheda.dataset.c = 'SettingsSection';
  scheda.dataset.settingsCard = 'memoria-assistente';
  scheda.setAttribute('role', 'group');
  scheda.setAttribute('aria-labelledby', 'settings-group-memoria-assistente');
  scheda.innerHTML = '<div class="settings-group__head" data-settings-group-head>'
    + '<h3 class="settings-group__title" id="settings-group-memoria-assistente" data-settings-group-title="memoria-assistente"></h3></div>'
    + '<div class="talos-setting" data-c="SettingRow" data-setting-row="modelloDellAssistente"><div class="settings-field-info">'
    + '<label class="talos-setting__label" for="setting-modelloDellAssistente" data-etichetta></label><p class="talos-setting__help" data-aiuto></p></div>'
    + '<div class="settings-field-control"><select id="setting-modelloDellAssistente" class="talos-select"></select></div></div>'
    + '<p class="talos-setting__help" data-assistente-errore role="alert" hidden></p>';
  return scheda;
}

/**
 * L'ordine FISSO delle carte in Memoria e contesto (revisore B, secondo passaggio): compattazione, memoria del modello (se c'è), Assistente.
 *   La carta della memoria del modello si rimette subito dopo la compattazione a ogni suo ridisegno: questa si mette dopo di lei, così le due
 *   non si scambiano mai di posto, in qualunque ordine si ridisegnino.
 */
export function posizionaCartaAssistente(pannello, scheda) {
  const sorella = pannello.querySelector('[data-settings-card="memoria-modello"]') ?? pannello.querySelector('[data-settings-card="memoria-compattazione"]');
  if (sorella && sorella.nextElementSibling !== scheda) sorella.after(scheda); else if (!sorella && !scheda.isConnected) pannello.append(scheda);
}

export function montaCartaAssistente({ documento = globalThis.document, fetchFn = globalThis.fetch?.bind(globalThis), win = globalThis } = {}) {
  if (!documento || typeof fetchFn !== 'function') return null;
  let stato = null; let errore = false; let scheda = null; let salvando = false; let modelli = [];
  let numeroStato = 0; let numeroModelli = 0;

  async function chiama(metodo, corpo) {
    const risposta = await fetchFn(URL_IMPOSTAZIONI, { method: metodo, credentials: 'same-origin',
      headers: { Accept: 'application/json', ...(corpo ? { 'Content-Type': 'application/json' } : {}) }, ...(corpo ? { body: JSON.stringify(corpo) } : {}) });
    const dati = await risposta.json().catch(() => null);
    if (!risposta.ok || !dati?.data) throw Object.assign(new Error('assistant-settings'), { code: dati?.error?.code ?? 'HTTP_ERROR' });
    return dati.data;
  }
  const leggiJson = async (url) => { const r = await fetchFn(url, { credentials: 'same-origin', headers: { Accept: 'application/json' } }); const d = await r.json().catch(() => null); return r.ok ? d?.data ?? null : null; };

  /* Lo stesso elenco della carta della compattazione: diretti (chiavi e piano), catalogo, locali installati; un catalogo che non risponde toglie
     le sue voci, non la carta. */
  async function leggiModelli() {
    const mia = ++numeroModelli;
    const [cloud, diretti, locali] = await Promise.allSettled([leggiJson('/api/v1/models'), leggiCataloghiDiretti(leggiJson), leggiJson('/api/v1/local-models')]);
    if (mia !== numeroModelli) return;
    const voci = new Map();
    const metti = (id, nome, fonte = null) => { if (typeof id === 'string' && id && !voci.has(id)) voci.set(id, { nome: typeof nome === 'string' && nome ? nome : nomeModelloUmano(id), fonte }); };
    const perFornitore = diretti.value?.perFornitore ?? {};
    for (const fonte of ['chatgpt', ...PROVIDER_DIRETTI.map((p) => p.id).filter((id) => id !== 'chatgpt')]) for (const m of (perFornitore[fonte] ?? [])) metti(m?.id, m?.nome, fonte);
    for (const m of (cloud.value?.modelli ?? [])) metti(m?.id, m?.nome);
    for (const m of (locali.value?.items ?? [])) metti(m?.id ? `local:${m.id}` : null, m?.name);
    modelli = [...voci.entries()].map(([id, voce]) => ({ id, ...voce }));
  }
  const nomi = (id) => modelli.find((m) => m.id === id)?.nome ?? nomeModelloUmano(id);
  const voceDelMenu = (m) => { const fornitore = m.fonte ? nomeFornitore(m.fonte) : null; return fornitore ? `${fornitore} · ${m.nome}` : m.nome; };

  function riempi(select, valore) {
    const voci = [{ valore: '', testo: t('sezioni.aLato.settingsChat') }, ...modelli.map((m) => ({ valore: m.id, testo: voceDelMenu(m) }))];
    if (valore && !voci.some((v) => v.valore === valore)) voci.push({ valore, testo: nomi(valore) }); // un modello che non c'è più resta la scelta salvata
    const firma = JSON.stringify(voci);
    if (select.dataset.firma !== firma) { select.replaceChildren(...voci.map((v) => { const o = documento.createElement('option'); o.value = v.valore; o.textContent = v.testo; return o; })); select.dataset.firma = firma; }
    select.value = valore;
  }

  function disegna() {
    const pannello = documento.getElementById('setting-panel-memoria');
    if (!pannello || stato === null || stato === 'non-disponibile') { scheda?.remove(); return; }
    if (!scheda) {
      scheda = creaScheda(documento);
      scheda.querySelector('#setting-modelloDellAssistente').addEventListener('change', (e) => { void salva({ modello: e.target.value || null }); });
    }
    posizionaCartaAssistente(pannello, scheda);
    const q = (s) => scheda.querySelector(s);
    q('.settings-group__title').textContent = t('sezioni.aLato.settingsTitle');
    q('[data-etichetta]').textContent = t('sezioni.aLato.settingsLabel');
    q('[data-aiuto]').textContent = t('sezioni.aLato.settingsHelp');
    const notaErrore = q('[data-assistente-errore]'); notaErrore.hidden = !errore; notaErrore.textContent = errore ? t('sezioni.aLato.settingsNotSaved') : '';
    const select = q('#setting-modelloDellAssistente');
    riempi(select, stato.modello ?? '');
    select.disabled = salvando;
  }

  async function leggi({ conModelli = true } = {}) {
    const mia = ++numeroStato;
    let letto;
    try { letto = await chiama('GET'); } catch { letto = 'non-disponibile'; }
    if (mia !== numeroStato) return;
    stato = letto; errore = false; disegna();
    if (conModelli && stato !== 'non-disponibile') { await leggiModelli().catch(() => {}); disegna(); }
  }

  async function salva(modifica) {
    if (stato === null || stato === 'non-disponibile') return;
    salvando = true; disegna();
    try { stato = await chiama('POST', modifica); errore = false; } catch { errore = true; }
    finally { numeroStato += 1; salvando = false; disegna(); }
  }

  const suClic = (evento) => { if (evento.target?.closest?.('[data-settings-tab="memoria"]')) void leggi(); };
  /* Dal pannello («Altro modello in cloud», «Locale sul PC»): la carta in vista e il menu aperto, col fuoco sul controllo (come la compattazione) */
  const suScegli = () => {
    void leggi().then(() => {
      if (!scheda || stato === 'non-disponibile') return;
      scheda.scrollIntoView?.({ block: 'center' });
      win.requestAnimationFrame?.(() => {
        const select = scheda.querySelector('#setting-modelloDellAssistente');
        const controllo = select.closest('.settings-field-control')?.querySelector('.calm-select') ?? select;
        controllo.focus({ preventScroll: true });
        if (controllo.getAttribute('aria-expanded') !== 'true') controllo.click();
      });
    });
  };
  documento.addEventListener('click', suClic);
  documento.addEventListener(EVENTO_SCEGLI_MODELLO_ASSISTENTE, suScegli);
  documento.documentElement.addEventListener(EVENTO_LINGUA, disegna);
  void leggi({ conModelli: false });
  return { leggi, disegna, distruggi() { documento.removeEventListener('click', suClic); documento.removeEventListener(EVENTO_SCEGLI_MODELLO_ASSISTENTE, suScegli); documento.documentElement.removeEventListener(EVENTO_LINGUA, disegna); } };
}
