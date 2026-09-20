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
  credenziale: 'il fornitore l\'ha rifiutata',
  credito: 'il credito è esaurito',
  traffico: 'il fornitore ha chiesto di aspettare per troppo traffico',
});

function fraseDellaPanchina(etichetta, pool, adesso) {
  const ferme = pool.filter((v) => Number.isFinite(v?.inPanchinaFino) && v.inPanchinaFino > adesso);
  if (ferme.length === 0) return null;
  // La prima a tornare disponibile è quella che interessa: è quando si può riprovare.
  const prima = ferme.reduce((a, b) => (a.inPanchinaFino <= b.inPanchinaFino ? a : b));
  const causa = CAUSA_UMANA[prima.causa] ?? 'il fornitore non l\'ha accettata';
  const minuti = Math.max(1, Math.ceil((prima.inPanchinaFino - adesso) / 60_000));
  const quando = minuti >= 120 ? `fra circa ${Math.round(minuti / 60)} ore` : `fra circa ${minuti} min`;
  const quante = ferme.length === 1 ? `La chiave di ${etichetta} è in pausa` : `Le ${ferme.length} chiavi di ${etichetta} sono in pausa`;
  return `${quante}: ${causa}. Si riprova da sola ${quando}; per non aspettare, collega un'altra chiave da Fornitori e accessi.`;
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
      return { pronto: false, codice: 'CONFIG_INVALID', messaggio: 'Scegli un modello prima di avviare la sessione.' };
    }
    let fonte;
    try { ({ fonte } = separaFonteModello(modello)); }
    catch { return { pronto: false, codice: 'CONFIG_INVALID', messaggio: 'Questo modello non è riconosciuto: scegline uno dall\'elenco.' }; }
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
      messaggio: panchina ?? `Manca la chiave di ${record.etichetta}: collegala da Fornitori e accessi.`,
    };
  };
}
