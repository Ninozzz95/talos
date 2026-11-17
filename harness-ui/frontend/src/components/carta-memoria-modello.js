/*
 * 11/11/2026 — «MEMORIA DEL MODELLO» in Impostazioni → Memoria e contesto, sotto «Compattazione della conversazione». Decisione dell'owner
 * 13:50 (v1465, punto 5, «Sì, come Hermes»): quando TALOS non sa leggere quanto tiene un modello (la sua finestra) usa una misura prudente,
 * la scheda Contesto lo dice con una riga, e qui la persona scrive quella giusta PER QUEL MODELLO. La stessa voce si scrive dalla chat con
 * `app_settings` (`conversation.modelMemory`, dietro la carta): due porte, una fonte (`POST /api/v1/context-settings`, `finestreDeiModelli`).
 *
 * Forma: le sorelle della stessa pagina, senza controlli nuovi. Testata e descrizione come `motore-contesto.js`; il menu dei modelli è il
 * `select.talos-select` di `carta-compattazione.js` (lo veste `calm-controls.js`) con lo stesso elenco del selettore; il numero è il campo di
 * casa `talos-field__input` di `memoria-conversazioni.js`, con l'unità nell'etichetta; i modelli già scritti sono righe `talos-setting`
 * con «Togli». Lo stato a schermo lo scrive solo la risposta del server; un valore assurdo si rifiuta qui con un messaggio, e il server lo
 * rifiuta comunque (`impostazioni-contesto.mjs`).
 * Fonti: Hermes `agent/model_metadata.py:255-271` («Set model.context_length in config.yaml to override»); DeepSeek
 *   `packages/client/ui-settings-models/src/client/locales.ts:56-57` (campo «Context window» per modello, «Uses the provider default»);
 *   Claude Code CHANGELOG.md:1709 (la finestra dell'auto-compattazione salvata per modello).
 */
import { t, tn, linguaCorrenteDiT } from './lingua.js';
import { nomeModelloUmano } from './chat-foot.js';
import { leggiCataloghiDiretti, nomeFornitore, PROVIDER_DIRETTI } from './fonti-modelli.js';
import { FINESTRA_SCRITTA_MINIMA, FINESTRA_SCRITTA_MASSIMA } from '../../../src/finestra-di-ripiego.mjs';

const EVENTO_LINGUA = 'talos:lingua';
const URL_IMPOSTAZIONI = '/api/v1/context-settings';
const URL_MEMORIA_IN_USO = '/api/v1/context-settings/model-window';
/* giro dopo i revisori (punto 5, BASSO 5 di A): i limiti si leggono dal server (`finestra-di-ripiego.mjs`), un posto solo */
export const MEMORIA_MINIMA = FINESTRA_SCRITTA_MINIMA;
export const MEMORIA_MASSIMA = FINESTRA_SCRITTA_MASSIMA;

/*
 * Giro dopo i revisori (punto 13, BASSO 4 di C; giudice v1511): il nome INTERO col fornitore. «deepseek-v3.2» da solo confondeva
 * DeepSeek diretto (`deepseek:deepseek-v3.2`) con lo stesso modello su OpenRouter (`deepseek/deepseek-v3.2`). La regola di forma è quella
 * di `nomeModelloUmano`: un fornitore è un nome semplice PRIMA dei due punti; un id con la barra e senza fornitore è di OpenRouter.
 */
export function nomeInteroDelModello(id, nome = null) {
  const grezzo = String(id ?? '').trim();
  const prefisso = /^([a-z][a-z0-9-]*):(?=.)/u.exec(grezzo)?.[1] ?? null;
  const resto = prefisso ? grezzo.slice(prefisso.length + 1) : grezzo;
  const fornitore = prefisso ? (nomeFornitore(prefisso) ?? prefisso) : 'OpenRouter';
  return `${fornitore} · ${typeof nome === 'string' && nome.trim() ? nome.trim() : resto}`;
}

/*
 * Giro dopo i revisori (punto 11 e punto 4, owner 17:27 Q1): quale memoria TALOS usa ADESSO per il modello scelto, e da dove viene
 * (`GET /api/v1/context-settings/model-window`, la stessa scelta del server). Scritta più grande di quella letta ⇒ lo si dice col numero
 * letto, senza carte in più. `null` = il server non l'ha detto: niente riga.
 */
/* D3 (a) del blocco del nucleo, 12/11/2026 (giudice v1605, LINGUA-7-04 e LINGUA-7-07): ogni frase ha le due voci `…One`/`…Many` e il plurale
   lo sceglie il numero (`tn`), come la riga dei modelli scritti qui sotto: prima diceva «1 tokens», e in italiano «1 token, letti». */
export function memoriaInUso(risposta) {
  if (!risposta || !Number.isSafeInteger(risposta.finestra) || risposta.finestra <= 0) return null;
  const n = risposta.finestra;
  if (risposta.fonte === 'persona') {
    const letta = risposta.letta;
    return letta && letta.fonte !== 'prudente' && Number.isSafeInteger(letta.finestra) && n > letta.finestra
      ? { uno: 'varie.modelMemory.card.inUseWrittenAboveOne', molti: 'varie.modelMemory.card.inUseWrittenAboveMany', n, catalogo: letta.finestra }
      : { uno: 'varie.modelMemory.card.inUseWrittenOne', molti: 'varie.modelMemory.card.inUseWrittenMany', n };
  }
  if (risposta.fonte === 'prudente') return { uno: 'varie.modelMemory.card.inUsePrudentOne', molti: 'varie.modelMemory.card.inUsePrudentMany', n };
  if (risposta.fonte === 'rotta' || risposta.fonte === 'catalogo') return { uno: 'varie.modelMemory.card.inUseReadOne', molti: 'varie.modelMemory.card.inUseReadMany', n };
  return null;
}

/** La riga «quale memoria TALOS usa adesso» nella lingua di oggi, coi separatori della lingua; '' quando il server non l'ha detta. */
export function testoInUso(riga) {
  if (!riga) return '';
  return tn(riga.uno, riga.molti, riga.n, { n: numero(riga.n), ...(riga.catalogo !== undefined ? { catalogo: numero(riga.catalogo) } : {}) });
}

/**
 * Quello che la persona ha scritto nel campo: `{ ok:true, valore }` (`null` = vuoto, torna automatica) o `{ ok:false, chiave }` col
 * messaggio da mostrare. Accetta le cifre col separatore delle migliaia delle due lingue (163.840, 163,840, 163 840).
 */
export function leggiMemoriaScritta(testo) {
  const grezzo = String(testo ?? '').trim();
  if (grezzo === '') return { ok: true, valore: null };
  const cifre = /^\d{1,3}(?:[.,\s  ]\d{3})+$/u.test(grezzo) ? grezzo.replace(/[^\d]/gu, '') : grezzo;
  const valore = /^\d{1,9}$/u.test(cifre) ? Number(cifre) : Number.NaN;
  return Number.isSafeInteger(valore) && valore >= MEMORIA_MINIMA && valore <= MEMORIA_MASSIMA
    ? { ok: true, valore } : { ok: false, chiave: 'varie.modelMemory.card.invalid' };
}

const numero = (n) => n.toLocaleString(linguaCorrenteDiT() === 'it' ? 'it-IT' : 'en-US');

function creaScheda(documento) {
  const scheda = documento.createElement('div');
  scheda.className = 'talos-card talos-settings__section';
  scheda.dataset.c = 'SettingsSection';
  scheda.dataset.settingsCard = 'memoria-modello';
  scheda.setAttribute('role', 'group');
  scheda.setAttribute('aria-labelledby', 'settings-group-memoria-modello');
  scheda.innerHTML = '<div class="settings-group__head" data-settings-group-head>'
    + '<h3 class="settings-group__title" id="settings-group-memoria-modello" data-settings-group-title="memoria-modello"></h3></div>'
    + '<p data-memoria-modello-descrizione></p>'
    + '<div class="talos-setting" data-c="SettingRow" data-setting-row="memoriaModello"><div class="settings-field-info"><label class="talos-setting__label" for="setting-memoriaModello" data-memoria-modello-etichetta></label></div>'
    + '<div class="settings-field-control" data-memoria-modello-controllo><select id="setting-memoriaModello" class="talos-select"></select></div></div>'
    + '<label class="talos-stack talos-provider__field"><span data-memoria-modello-valore-etichetta></span>'
    + '<input class="talos-field__input" type="text" inputmode="numeric" autocomplete="off" spellcheck="false" data-memoria-modello-valore aria-describedby="settingsHelp-memoriaModello"></label>'
    + '<p class="talos-setting__help" id="settingsHelp-memoriaModello" data-memoria-modello-aiuto></p>'
    + '<p class="talos-setting__help" data-memoria-modello-in-uso hidden></p>'
    + '<button type="button" class="talos-button talos-button--secondary talos-button--sm" data-memoria-modello-salva></button>'
    + '<p class="talos-setting__help" data-memoria-modello-stato role="status" hidden></p>'
    + '<div data-memoria-modello-elenco></div>';
  return scheda;
}

/* I modelli dei motori locali: la loro memoria la dice il motore (gli stessi prefissi che salta `finestra-di-ripiego.mjs` sul server) */
const MOTORE_LOCALE = /^(?:local|locale-ospite|lmstudio|ollama|llama\.cpp|esterno):/u;

export function montaCartaMemoriaModello({ documento = globalThis.document, fetchFn = globalThis.fetch?.bind(globalThis) } = {}) {
  if (!documento || typeof fetchFn !== 'function') return null;
  /* `stato`: null = non letto; { finestreDeiModelli } = la risposta del server; 'non-disponibile' = la rotta risponde con un errore */
  let stato = null; let scheda = null; let salvando = false; let messaggio = null; let modelli = []; let scelto = '';
  let numeroStato = 0; // come `carta-compattazione.js` (F6): lo stato lo scrive l'ultima domanda, non l'ultima risposta
  let inUso = null; let numeroInUso = 0; // la memoria che TALOS usa adesso per `scelto` (punto 11)

  async function chiama(metodo, corpo) {
    const risposta = await fetchFn(URL_IMPOSTAZIONI, { method: metodo, credentials: 'same-origin',
      headers: { Accept: 'application/json', ...(corpo ? { 'Content-Type': 'application/json' } : {}) }, ...(corpo ? { body: JSON.stringify(corpo) } : {}) });
    const dati = await risposta.json().catch(() => null);
    if (!risposta.ok || !dati?.data) throw Object.assign(new Error('context-settings'), { code: dati?.error?.code ?? 'HTTP_ERROR' });
    return { finestreDeiModelli: dati.data.finestreDeiModelli && typeof dati.data.finestreDeiModelli === 'object' ? dati.data.finestreDeiModelli : {} };
  }
  const leggiJson = async (url) => { const r = await fetchFn(url, { credentials: 'same-origin', headers: { Accept: 'application/json' } }); const d = await r.json().catch(() => null); return r.ok ? d?.data ?? null : null; };

  /* PRIMA i modelli delle tue conversazioni (dalla più recente): la memoria che non si legge è proprio quella di un modello che il catalogo
     non conosce, e quel modello nel catalogo non c'è. Poi lo stesso elenco del selettore, come la carta della compattazione: i piani e le
     chiavi, poi il catalogo. I motori locali no: la loro memoria la dice il motore. */
  async function leggiModelli() {
    const [cloud, diretti, conversazioni] = await Promise.allSettled([leggiJson('/api/v1/models'), leggiCataloghiDiretti(leggiJson), leggiJson('/api/v1/sessions')]);
    const voci = new Map();
    const metti = (id, nome, fonte = null) => { if (typeof id === 'string' && id && !voci.has(id)) voci.set(id, { nome: typeof nome === 'string' && nome ? nome : nomeModelloUmano(id), daCatalogo: typeof nome === 'string' && Boolean(nome), fonte }); };
    const usate = (Array.isArray(conversazioni.value?.items) ? conversazioni.value.items : [])
      .map((c) => ({ id: c?.modello, quando: Date.parse(c?.ultimaRispostaAlle ?? c?.avviataAlle ?? '') || 0 }))
      .filter((c) => typeof c.id === 'string' && c.id && !MOTORE_LOCALE.test(c.id)).sort((a, b) => b.quando - a.quando);
    for (const c of usate) metti(c.id);
    const perFornitore = diretti.value?.perFornitore ?? {};
    for (const fonte of ['chatgpt', ...PROVIDER_DIRETTI.map((p) => p.id).filter((id) => id !== 'chatgpt')]) for (const m of (perFornitore[fonte] ?? [])) metti(m?.id, m?.nome, fonte);
    for (const m of (cloud.value?.modelli ?? [])) metti(m?.id, m?.nome);
    modelli = [...voci.entries()].map(([id, voce]) => ({ id, ...voce }));
  }
  /* punto 13: col fornitore, e senza un nome di catalogo l'id intero (mai il solo nome corto di `nomeModelloUmano`) */
  const nomeDi = (id) => { const m = modelli.find((x) => x.id === id); return nomeInteroDelModello(id, m?.daCatalogo ? m.nome : null); };
  const voceDelMenu = (m) => nomeDi(m.id);
  async function leggiInUso() {
    const mio = ++numeroInUso; const per = scelto;
    let letta = null;
    if (per) { try { letta = await leggiJson(`${URL_MEMORIA_IN_USO}?model=${encodeURIComponent(per)}`); } catch { letta = null; } }
    if (mio !== numeroInUso) return;
    inUso = letta && letta.modello === per ? letta : null;
    disegna();
  }

  function riempiMenu(select, scritte) {
    const voci = modelli.map((m) => ({ valore: m.id, testo: voceDelMenu(m) }));
    for (const id of Object.keys(scritte)) if (!voci.some((v) => v.valore === id)) voci.unshift({ valore: id, testo: nomeDi(id) });
    if (!scelto && voci.length) scelto = voci[0].valore;
    if (scelto && !voci.some((v) => v.valore === scelto)) voci.unshift({ valore: scelto, testo: nomeDi(scelto) });
    const firma = JSON.stringify(voci);
    if (select.dataset.firma !== firma) {
      select.replaceChildren(...voci.map((v) => { const o = documento.createElement('option'); o.value = v.valore; o.textContent = v.testo; return o; }));
      select.dataset.firma = firma;
    }
    select.value = scelto;
    select.title = voci.find((v) => v.valore === scelto)?.testo ?? ''; // il nome intero anche al passaggio del puntatore
  }

  function disegna(rifaiCampo = false) {
    const pannello = documento.getElementById('setting-panel-memoria');
    if (!pannello || stato === null) { scheda?.remove(); return; }
    if (!scheda) {
      scheda = creaScheda(documento);
      const q0 = (s) => scheda.querySelector(s);
      q0('#setting-memoriaModello').addEventListener('change', (e) => { scelto = e.target.value; messaggio = null; inUso = null; disegna(true); void leggiInUso(); });
      q0('[data-memoria-modello-salva]').addEventListener('click', () => { void salvaDalCampo(); });
      q0('[data-memoria-modello-valore]').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); void salvaDalCampo(); } });
    }
    const sorella = pannello.querySelector('[data-settings-card="memoria-compattazione"]') ?? pannello.querySelector('[data-settings-card="memoria-motore-contesto"]');
    if (sorella && sorella.nextElementSibling !== scheda) sorella.after(scheda); else if (!scheda.isConnected) pannello.append(scheda);
    const q = (s) => scheda.querySelector(s);
    q('.settings-group__title').textContent = t('varie.modelMemory.card.title');
    q('[data-memoria-modello-descrizione]').textContent = t('varie.modelMemory.card.description');
    q('[data-memoria-modello-etichetta]').textContent = t('varie.modelMemory.card.modelLabel');
    q('[data-memoria-modello-valore-etichetta]').textContent = t('varie.modelMemory.card.valueLabel');
    q('[data-memoria-modello-aiuto]').textContent = t('varie.modelMemory.card.valueHelp');
    const salva = q('[data-memoria-modello-salva]'); salva.textContent = t('varie.modelMemory.card.save'); salva.style.justifySelf = 'start';
    const statoRiga = q('[data-memoria-modello-stato]');
    const letta = stato !== 'non-disponibile';
    const testoStato = !letta ? t('varie.contextEngine.card.unavailable') : messaggio ? t(messaggio) : '';
    statoRiga.textContent = testoStato; statoRiga.hidden = !testoStato;
    statoRiga.setAttribute('role', messaggio === 'varie.modelMemory.card.saved' ? 'status' : 'alert');
    statoRiga.style.color = messaggio && messaggio !== 'varie.modelMemory.card.saved' ? 'var(--talos-warning)' : '';
    const scritte = letta ? stato.finestreDeiModelli : {};
    const select = q('#setting-memoriaModello');
    const campo = q('[data-memoria-modello-valore]');
    riempiMenu(select, scritte);
    if (rifaiCampo === true) campo.value = Number.isSafeInteger(scritte[scelto]) ? numero(scritte[scelto]) : ''; // coi separatori della lingua (`leggiMemoriaScritta` li rilegge)
    /* punto 11 (BASSO 4 di C): niente esempio inventato; il campo vuoto mostra la memoria che TALOS usa adesso, e la riga sotto da dove viene */
    const riga = memoriaInUso(inUso && inUso.modello === scelto ? inUso : null);
    campo.placeholder = riga ? numero(riga.n) : '';
    const rigaInUso = q('[data-memoria-modello-in-uso]');
    rigaInUso.textContent = testoInUso(riga);
    rigaInUso.hidden = !riga;
    select.disabled = salvando || !letta; campo.disabled = salvando || !letta; salva.disabled = salvando || !letta || !scelto;
    const elenco = q('[data-memoria-modello-elenco]');
    const voci = Object.entries(scritte).filter(([, token]) => Number.isSafeInteger(token));
    elenco.replaceChildren(...(voci.length ? voci.map(([id, token]) => {
      const riga = documento.createElement('div');
      riga.className = 'talos-setting'; riga.dataset.c = 'SettingRow'; riga.dataset.memoriaModelloScritta = id;
      const testo = documento.createElement('p'); testo.className = 'talos-setting__help'; testo.style.maxWidth = 'none';
      testo.textContent = tn('varie.modelMemory.card.rowOne', 'varie.modelMemory.card.rowMany', token, { modello: nomeDi(id), n: numero(token) });
      const togli = documento.createElement('button'); togli.type = 'button'; togli.className = 'talos-button talos-button--ghost talos-button--sm';
      togli.textContent = t('varie.modelMemory.card.remove'); togli.disabled = salvando;
      togli.setAttribute('aria-label', `${t('varie.modelMemory.card.remove')} · ${nomeDi(id)}`);
      togli.addEventListener('click', () => { void scrivi(id, null); });
      riga.append(testo, togli);
      return riga;
    }) : [Object.assign(documento.createElement('p'), { className: 'talos-setting__help', textContent: t('varie.modelMemory.card.none') })]));
  }

  async function leggi({ conModelli = true } = {}) {
    const mia = ++numeroStato;
    let letto;
    try { letto = await chiama('GET'); } catch { letto = 'non-disponibile'; }
    if (mia !== numeroStato) return;
    stato = letto; disegna(true);
    if (conModelli && stato !== 'non-disponibile') { await leggiModelli().catch(() => {}); disegna(true); await leggiInUso(); }
  }

  async function scrivi(id, valore) {
    if (stato === null || stato === 'non-disponibile' || !id) return;
    salvando = true; disegna();
    try { stato = await chiama('POST', { finestreDeiModelli: { [id]: valore } }); messaggio = 'varie.modelMemory.card.saved'; }
    catch { messaggio = 'varie.modelMemory.card.notSaved'; } // lo stato resta quello di prima
    finally { numeroStato += 1; salvando = false; disegna(true); void leggiInUso(); }
  }

  async function salvaDalCampo() {
    if (!scheda) return;
    const letto = leggiMemoriaScritta(scheda.querySelector('[data-memoria-modello-valore]').value);
    if (!letto.ok) { messaggio = letto.chiave; disegna(); return; } // il valore assurdo resta nel campo, col messaggio sotto
    await scrivi(scelto, letto.valore);
  }

  const suClic = (evento) => { if (evento.target?.closest?.('[data-settings-tab="memoria"]')) void leggi(); };
  documento.addEventListener('click', suClic);
  documento.documentElement.addEventListener(EVENTO_LINGUA, disegna);
  void leggi({ conModelli: false });
  return { leggi, disegna, distruggi() { documento.removeEventListener('click', suClic); documento.documentElement.removeEventListener(EVENTO_LINGUA, disegna); } };
}
