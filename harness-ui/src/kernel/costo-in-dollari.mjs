/*
 * Decisioni 57 e 144 dell'owner (04/11/2026): «dollari dove il prezzo è noto, altrimenti il lavoro», sulla carta della ricerca e nella chat a
 *   lato. Qui solo le funzioni pure, una volta per tutti (nucleo, registro, interfaccia): nessuna tabella di prezzi. Il prezzo arriva da chi
 *   lo sa già, `prezzoPerMilione` (`impostazioni/prezzo-del-modello.mjs`, dal catalogo dei modelli: `{ in, out }` dollari per milione), o dal
 *   fornitore stesso (`usage.cost` di OpenRouter, sempre incluso: openrouter.ai/docs/cookbook/administration/usage-accounting, letta il
 *   04/11/2026; lo stesso campo che diventa `costoDichiarato` in `runtime-owner-adapter.mjs:2055`).
 * ⛔ Prezzo ignoto ⇒ `null`, mai 0: 0 vuol dire gratis.
 * La forma della cifra è quella di Hermes (`agent/usage_pricing.py:39-56`, `format_cost_label`, hermes-agent al 01/11/2026): zero «$0.00»,
 *   sotto il centesimo quattro decimali («~$0.0046», o «~$<0.0001» se arrotondata farebbe zero: una cifra positiva non si legge mai come
 *   zero), sopra due decimali; la tilde dice che è una stima. Il punto decimale resta il punto in ogni lingua, come i prezzi al milione del
 *   selettore dei modelli (`frontend/src/components/selettore-modelli.js` `formattaPrezzo`).
 */

const SOTTO_IL_CENTESIMO = 0.01

/** Una cifra in dollari da mostrare: `'$0.00'`, `'~$0.0046'`, `'~$<0.0001'`, `'~$1.23'`; `null` se non è una cifra ≥ 0. */
export function formattaDollari(importo) {
    if (typeof importo !== 'number' || !Number.isFinite(importo) || importo < 0) return null
    if (importo === 0) return '$0.00'
    if (importo < SOTTO_IL_CENTESIMO) {
        const testo = `~$${importo.toFixed(4)}`
        return testo === '~$0.0000' ? '~$<0.0001' : testo
    }
    return `~$${importo.toFixed(2)}`
}

const nonNegativo = (n) => typeof n === 'number' && Number.isFinite(n) && n >= 0
const conteggio = (n) => (Number.isSafeInteger(n) && n >= 0 ? n : null)

/** `{ in, out }` per milione con i due numeri finiti e non negativi, o `null`. */
export function prezzoValido(prezzo) {
    return prezzo && typeof prezzo === 'object' && nonNegativo(prezzo.in) && nonNegativo(prezzo.out) ? { in: prezzo.in, out: prezzo.out } : null
}

/**
 * Quanto è costata UNA risposta, in dollari, o `null`.
 *   1. La cifra che il fornitore ha dichiarato (`usage.cost`, OpenRouter): è il conto vero.
 *   2. Altrimenti il prezzo pubblicato × i token. ⛔ Il catalogo non porta il prezzo della cache: con token letti dalla cache la cifra
 *      sarebbe sbagliata, e allora è ignota, come fa Hermes (`usage_pricing.py:727-731`, «cache-read pricing unavailable»). Un modello
 *      gratis (0 e 0) resta gratis anche con la cache.
 */
export function dollariDaUsage(usage, prezzo) {
    if (!usage || typeof usage !== 'object') return null
    if (nonNegativo(usage.cost)) return usage.cost
    const p = prezzoValido(prezzo)
    if (!p) return null
    const ingresso = conteggio(usage.prompt_tokens)
    const uscita = conteggio(usage.completion_tokens)
    if (ingresso === null && uscita === null) return null
    if (p.in === 0 && p.out === 0) return 0
    const cache = conteggio(usage.cached_tokens) ?? conteggio(usage.prompt_tokens_details?.cached_tokens) ?? 0
    if (cache > 0) return null
    return ((ingresso ?? 0) * p.in + (uscita ?? 0) * p.out) / 1_000_000
}

/** La somma di più cifre: una sola ignota rende ignota la somma (una somma parziale si leggerebbe come il totale). */
export function sommaDollari(cifre) {
    let totale = 0
    for (const c of cifre) {
        if (!nonNegativo(c)) return null
        totale += c
    }
    return totale
}

/** Dal prezzo `{ in, out }` alla forma del piano della ricerca (`research/plan.mjs` `TalosResearchPrice`), o `null`. */
export function prezzoPerLaRicerca(prezzo) {
    const p = prezzoValido(prezzo)
    return p ? { currency: 'USD', promptPerMillion: p.in, completionPerMillion: p.out } : null
}

/**
 * Il prezzo del modello chiesto a chi lo sa (`(modello) => { in, out } | null`, anche asincrona), con un tetto di tempo: il catalogo
 *   può essere in aggiornamento, e una carta non aspetta la rete. Un errore, un'attesa oltre il tetto o una forma storta ⇒ `null`.
 * Condizioni di Performance (04/11/2026): (1) tetto di 300 ms. Col catalogo in memoria la lettura finisce in pochi microtask; col catalogo
 *   freddo la carta esce col lavoro e la lettura, già partita, continua da sola e riempie il catalogo per la volta dopo (non si annulla).
 *   (2) Il timer del tetto si spegne appena la lettura finisce (`finally`): nessun timer appeso, e comunque `unref`.
 */
export const TETTO_PREZZO_MS = 300

export async function prezzoDelModelloEntro(prezzoDelModelloFn, modello, tettoMs = TETTO_PREZZO_MS) {
    if (typeof prezzoDelModelloFn !== 'function' || typeof modello !== 'string' || modello === '') return null
    let timer = null
    const scadenza = new Promise((risolvi) => { timer = setTimeout(() => risolvi(null), tettoMs); timer.unref?.() })
    try {
        return prezzoValido(await Promise.race([Promise.resolve().then(() => prezzoDelModelloFn(modello)), scadenza]))
    } catch {
        return null
    } finally {
        clearTimeout(timer)
    }
}
