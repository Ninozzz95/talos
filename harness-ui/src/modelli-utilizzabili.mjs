/*
 * R-02 (12/10/2026, owner: «Sì, un catalogo unico») — I MODELLI CHE QUESTA APP SA USARE ADESSO, in un posto solo.
 *
 * Fino a oggi la delega (`modelliDisponibiliFn`) e il Workflow (`availableModelIdsFn`) chiedevano il solo catalogo di OpenRouter
 * (`model-catalog.mjs`). Col piano ChatGPT la sessione girava su `chatgpt:gpt-6.1-sol` e la delega rispondeva che quel modello
 * «is not one of the models this app can use» mentre la persona lo stava usando (trascritto dell'owner, 5 volte). Lo stesso per
 * ogni fornitore diretto con la sua chiave e per il motore locale.
 *
 * Qui si uniscono le stesse fonti del selettore della chat, con gli stessi id:
 *  - OpenRouter: l'id del suo catalogo, senza prefisso (com'è sempre stato);
 *  - piano ChatGPT, se collegato: `chatgpt:<slug>` (`chatgpt-rotte.mjs`, `modelloDelPiano`);
 *  - fornitori diretti con la chiave nel portachiavi: `<fornitore>:<id>` (`provider-probe.mjs`, `elencaModelli`);
 *  - motori locali col modello caricato: `<fonte>:<id>` (`ollama`, `lmstudio`) e `local:<id>` (llama.cpp, `legacy/app.js:7438`).
 * ⛔ Ogni fonte risponde per conto suo e con un tempo massimo: una che non risponde non svuota le altre, e non si inventa niente
 *   (una fonte giù vuol dire «quei modelli adesso no», mai «tutti no»). Se TUTTE falliscono si torna `null`: chi chiama dice
 *   «l'elenco non è disponibile adesso», che è vero, invece di «quel modello non esiste», che sarebbe falso.
 * ⛔ Nessuna chiave e nessun token escono di qui: solo id.
 */

const TEMPO_MASSIMO_MS = 8_000;

function conTempo(promessa, ms) {
  let timer;
  return Promise.race([promessa, new Promise((_, rifiuta) => { timer = setTimeout(() => rifiuta(Object.assign(new Error('timeout'), { code: 'MODELLI_TEMPO' })), ms); })])
    .finally(() => clearTimeout(timer));
}

const idValidi = (elenco) => (Array.isArray(elenco) ? elenco.map((m) => m?.id).filter((id) => typeof id === 'string' && id.trim() !== '') : []);

/**
 * @param {object} fonti
 * @param {() => Promise<{modelli?: Array}>} [fonti.openrouter] il catalogo di OpenRouter (`modelCatalog.ottieni`)
 * @param {{ stato: () => {collegato?: boolean} }} [fonti.accessoChatgpt]
 * @param {{ elenca: () => Promise<Array> }} [fonti.catalogoChatgpt]
 * @param {string[]} [fonti.fornitoriDiretti] gli id con un catalogo del fornitore (`CATALOGHI_DIRETTI`)
 * @param {(fornitore: string) => string|null} [fonti.leggiChiave]
 * @param {(fornitore: string) => Promise<{modelli?: Array}>} [fonti.elencaFornitore] (`providerProbe.elencaModelli`)
 * @param {Record<string, {listModels: () => Promise<Array>}>} [fonti.runtimeLocali] ollama, lmstudio, llama.cpp
 * @param {() => {state?: string, modelId?: string|null}} [fonti.statoLocale] il supervisore di llama.cpp
 */
export function creaModelliUtilizzabili({
  openrouter = null, accessoChatgpt = null, catalogoChatgpt = null, fornitoriDiretti = [], leggiChiave = () => null,
  elencaFornitore = null, runtimeLocali = {}, statoLocale = null, tempoMassimoMs = TEMPO_MASSIMO_MS,
} = {}) {
  async function elenco() {
    const domande = [];
    if (typeof openrouter === 'function') domande.push(async () => idValidi((await openrouter())?.modelli));
    if (catalogoChatgpt && accessoChatgpt) {
      domande.push(async () => {
        let collegato = false;
        try { collegato = accessoChatgpt.stato()?.collegato === true; } catch { collegato = false; }
        return collegato ? idValidi(await catalogoChatgpt.elenca()) : [];
      });
    }
    if (typeof elencaFornitore === 'function') {
      for (const fornitore of fornitoriDiretti) {
        let chiave = null;
        try { chiave = leggiChiave(fornitore); } catch { chiave = null; }
        if (typeof chiave === 'string' && chiave.trim() !== '') domande.push(async () => idValidi((await elencaFornitore(fornitore))?.modelli));
      }
    }
    for (const [fonte, runtime] of Object.entries(runtimeLocali ?? {})) {
      if (fonte === 'llama.cpp' || typeof runtime?.listModels !== 'function') continue;
      domande.push(async () => idValidi(await runtime.listModels()).map((id) => `${fonte}:${id}`));
    }
    if (typeof statoLocale === 'function') {
      domande.push(async () => {
        const s = statoLocale() ?? {};
        return s.state === 'ready' && typeof s.modelId === 'string' && s.modelId !== '' ? [`local:${s.modelId}`] : [];
      });
    }
    if (!domande.length) return null;
    const esiti = await Promise.allSettled(domande.map((d) => conTempo(d(), tempoMassimoMs)));
    const riuscite = esiti.filter((e) => e.status === 'fulfilled');
    if (!riuscite.length) return null;
    return [...new Set(riuscite.flatMap((e) => e.value))];
  }
  return Object.freeze({ elenco });
}
