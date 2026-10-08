/**
 * sessione-pronta.mjs — «questa sessione può partire con QUESTO modello?» (CLI-REQ-05, punto 1).
 *
 * Estratta da `server.mjs` il 17/09/2026 perché lì dentro era una chiusura che nessuna prova poteva
 * chiamare: i revisori l'avevano misurata ricopiandone i byte. Una regola che decide se un giro parte
 * merita un nome e delle prove sue.
 *
 * ⛔⛔⛔ 17/09/2026, difetto trovato dalla corsia della CLI DOPO la fusione (`ba420a95`) e riprodotto qui
 *   con lo store VERO prima di toccare una riga (`scratchpad/sonda-panchina.mjs`): una chiave messa in
 *   PANCHINA (rifiutata dal fornitore, o in attesa dopo un 429) rispondeva ancora «pronto».
 *     hasKey('deepseek') → true     (conta OGNI chiave del pool, panchina compresa)
 *     getKey('deepseek') → null     (passa da `scegliChiave`, che salta chi è in panchina)
 *   Il ramo OpenRouter usava già `getKey`, tutti gli altri `hasKey`: la sessione partiva, e il giro moriva
 *   subito dopo senza una chiave utilizzabile. L'owner l'ha incontrato nella CLI lo stesso giorno.
 * ⇒ «Pronto» vuol dire UNA CHIAVE UTILIZZABILE ADESSO, per ogni fornitore. E quando le chiavi ci sono ma
 *   stanno tutte in panchina, il rifiuto lo DICE — con la causa in parole umane e fino a quando — invece
 *   di «Manca la chiave», che manderebbe la persona a incollare una chiave che ha già.
 *
 * ⛔ SINCRONA per contratto: `avviaESegui` nel registro non è `async` e non lo diventa (un solo tick fa
 *   cadere 148 prove, misurato il 10/09). Lo store risponde in memoria.
 */
import { REGISTRO_FORNITORI } from './provider-registry.mjs';
import { separaFonteModello } from './model-destination.mjs';

/** La causa della panchina, detta a una persona. Mai la classe tecnica a schermo. */
const CAUSA_UMANA = Object.freeze({
  credenziale: "the provider rejected it",
  credito: "credit has run out",
  traffico: "the provider asked to wait because of heavy traffic",
});

function fraseDellaPanchina(etichetta, pool, adesso) {
  const ferme = pool.filter((v) => Number.isFinite(v?.inPanchinaFino) && v.inPanchinaFino > adesso);
  if (ferme.length === 0) return null;
  // La prima a tornare disponibile è quella che interessa: è quando si può riprovare.
  const prima = ferme.reduce((a, b) => (a.inPanchinaFino <= b.inPanchinaFino ? a : b));
  const causa = CAUSA_UMANA[prima.causa] ?? "the provider did not accept it";
  const minuti = Math.max(1, Math.ceil((prima.inPanchinaFino - adesso) / 60_000));
  const quando = minuti >= 120 ? `in about ${Math.round(minuti / 60)} hours` : `in about ${minuti} min`;
  const quante = ferme.length === 1 ? `The ${etichetta} key is paused` : `The ${ferme.length} ${etichetta} keys are paused`;
  return `${quante}: ${causa}. It will retry automatically ${quando}; to avoid waiting, connect another key from Providers and access.`;
}

/**
 * @param {{providerStore: {getKey: Function, elencaPool?: Function}, chiaveApi?: string|null, adessoFn?: () => number}} deps
 * @returns {(modello: unknown) => {pronto: boolean, fornitore?: string, codice?: string, messaggio?: string}}
 */
export function creaProntoFn({ providerStore, chiaveApi = null, adessoFn = Date.now }) {
  return function prontoFn(modello) {
    /* ⛔ D2 (17/09): con un modello vuoto rispondeva «pronto» e la sessione partiva. Un modello che non si sa
       leggere NON è pronto, e lo dice. */
    if (typeof modello !== 'string' || modello.trim() === '') {
      return { pronto: false, codice: 'CONFIG_INVALID', messaggio: "Choose a model before starting the session." };
    }
    let fonte;
    try { ({ fonte } = separaFonteModello(modello)); }
    catch { return { pronto: false, codice: 'CONFIG_INVALID', messaggio: "This model is not recognized: choose one from the list." }; }
    const record = REGISTRO_FORNITORI[fonte];
    /* ⛔ `codice` e `messaggio` solo quando c'è qualcosa da dire: un «pronto» non porta un codice d'errore. */
    if (!record || record.chiaveObbligatoria !== true) return { pronto: true, fornitore: record?.etichetta ?? fonte };
    // UNA regola per tutti: una chiave utilizzabile ADESSO. La chiave d'ambiente di avvio vale solo per OpenRouter, com'era.
    const utilizzabile = providerStore.getKey(fonte) ?? (fonte === 'openrouter' ? chiaveApi : null);
    if (utilizzabile) return { pronto: true, fornitore: record.etichetta };
    const pool = typeof providerStore.elencaPool === 'function' ? (providerStore.elencaPool(fonte) ?? []) : [];
    const panchina = fraseDellaPanchina(record.etichetta, pool, adessoFn());
    return {
      pronto: false,
      fornitore: record.etichetta,
      codice: 'CONFIG_INVALID',
      messaggio: panchina ?? `The ${record.etichetta} key is missing: connect it from Providers and access.`,
    };
  };
}
