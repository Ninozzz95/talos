/**
 * ⛔ P6 — RITENTA DELLE CHIAMATE TRONCATE (stile Hermes) — 05/10/2026.
 *
 * Contratto: BRIEF-CURA-STALL-IBRIDO-HERMES-CLAUDE-2026-10-05.md §P6. Ricerca:
 * RICERCA-5x5x5x5-STALL-CONTESTO-STORICO-2026-10-05.md — Hermes `agent/retry.py` (e il dossier
 * §3): risposta con argomenti JSON monchi → ritenta la STESSA chiamata (stessi messaggi, stessa
 * richiesta) con cap di output POTENZIATO (`base·2ⁿ`, MAI sopra il limite noto del modello:
 * «a ceiling past the model limit only buys a provider 400» — #79715), e la risposta rotta NON
 * si appende alla storia. Misurato in casa (BC-11, 11/09): 3 troncamenti su 308 chiamate, es.
 * `call_c741309f96da49718f246d6c`, 2.781 caratteri con la stringa non chiusa (llama.cpp #22072).
 *
 * ⛔ DIVISIONE DEI RUOLI con il kernel (oggi sotto l'AVVISO BUG-16 — il collegamento va
 * coordinato sotto «Risposte CLI», mai corretto in parallelo):
 *   · QUESTO modulo dice SOLO se ritentare e con quale cap. Non chiama il fornitore, non tocca
 *     la storia, non muta la risposta (anche `trovaTroncate` è senza effetti).
 *   · Finché il ritenta non esaurisce i tentativi, la risposta rotta non entra in conversazione
 *     (compito del chiamante: non fare push del messaggio monco).
 *   · All'ARRENDIMENTO il chiamante cade nel ramo onesto che esiste GIÀ (BC-11 in
 *     `talosHarness.mjs` ~:11315-11325): argomenti `{}` con id e nome al loro posto + esito
 *     dell'attrezzo che dice «arrived INCOMPLETE». Così la storia resta accoppiata e coerente,
 *     nessuna chiamata orfana, nessun successo finto — e il comportamento di oggi è il caso
 *     limite di domani (maxTentativi 0 ≡ BC-11 puro).
 *
 * ⛔ Revisione stall (06/10/2026), lacuna 1: una chiamata troncata SENZA `id` prima spariva in
 * silenzio (`trovaTroncate` la scartava) e la risposta monca entrava in storia con un
 * «procedi» finto. Ora `trovaTroncateSenzaId` la espone per POSIZIONE e `decidiRitentaTroncate`
 * la conta come le altre: niente più «procedi» che finge che non esista. All'arrendimento il
 * chiamante riceve anche il conto `troncateSenzaId`: per quelle il ramo onesto non ha un id da
 * citare — la risposta incompleta va segnalata SENZA id, mai pushata com'è.
 *
 * Stato: lavoro in sospeso — NESSUN commit, NESSUN deploy prima della revisione avversariale (regola ferma).
 */

/** Gli id delle chiamate con argomenti non-parsabili. Stesso predicato del ramo BC-11 del kernel:
 *  argomenti assenti o vuoti NON sono troncamenti (hanno il loro ramo onesto, «no path given»). */
export function trovaTroncate(risposta) {
    const troncate = []
    for (const c of risposta?.tool_calls ?? []) {
        const grezzi = c?.function?.arguments
        if (typeof grezzi !== 'string' || grezzi === '') continue
        try { JSON.parse(grezzi) } catch { if (c.id) troncate.push(c.id) }
    }
    return troncate
}

/** ⛔ Revisione stall P6 (06/10/2026) — le troncate SENZA `id`: prima invisibili, ora esposte come
 *  POSIZIONI (indici in `risposta.tool_calls`), l'unico riferimento stabile quando l'id manca.
 *  Stesso predicato degli argomenti di `trovaTroncate`, senza effetti collaterali. */
export function trovaTroncateSenzaId(risposta) {
    const posizioni = []
    const chiamate = risposta?.tool_calls ?? []
    for (let i = 0; i < chiamate.length; i++) {
        const c = chiamate[i]
        const grezzi = c?.function?.arguments
        if (typeof grezzi !== 'string' || grezzi === '') continue
        try { JSON.parse(grezzi) } catch { if (!c.id) posizioni.push(i) }
    }
    return posizioni
}

const capInterotPositivo = (valore, nome) => {
    if (!Number.isSafeInteger(valore) || valore < 1) {
        throw Object.assign(new Error(`${nome} deve essere un intero positivo.`), { code: 'TRC_CAP_INVALIDO' })
    }
    return valore
}

/**
 * Decide se ritentare la chiamata appena ricevuta con argomenti monchi.
 * @param {{troncate:string[], troncateSenzaId?:number, tentativiFatti?:number, capBase?:number, capMassimoModello?:number|null, maxTentativi?:number}} opzioni
 * @returns {{azione:'procedi'}|
 *           {azione:'ritenta', tentativo:number, capOutput:number, troncate:string[], troncateSenzaId:number}|
 *           {azione:'arrenditi', troncate:string[], troncateSenzaId:number, tentativiFatti:number}}
 *   · `procedi`    — niente troncamenti (né con id né senza): il giro prosegue come oggi.
 *   · `ritenta`    — rifare la STESSA chiamata con `maxOutputTokens = capOutput`; la risposta
 *                    rotta di questo tentativo NON va appesa (compito del chiamante).
 *   · `arrenditi`  — tentativi finiti (o cap di base assente: senza base non c'è boost, e una
 *                    «potenziata» inventata sarebbe una menzogna): il chiamante cade nel ramo
 *                    onesto BC-11 con gli id in `troncate`; per le `troncateSenzaId` la risposta
 *                    incompleta va segnalata senza id (nessun id da citare), mai pushata com'è.
 */
export function decidiRitentaTroncate({ troncate, troncateSenzaId = 0, tentativiFatti = 0, capBase, capMassimoModello = null, maxTentativi = 4 } = {}) {
    if (!Array.isArray(troncate)) {
        throw Object.assign(new Error('`troncate` deve essere l\u2019array degli id restituito da trovaTroncate.'), { code: 'TRC_TRONCATE_INVALIDE' })
    }
    /* ⛔ Revisione stall P6 (06/10/2026): le troncate senza id partecipano alla decisione come le
       altre — prima passavano per `procedi` in silenzio e la risposta monca entrava in storia. */
    if (!Number.isSafeInteger(troncateSenzaId) || troncateSenzaId < 0) {
        throw Object.assign(new Error('`troncateSenzaId` deve essere il numero (≥ 0) di posizioni restituite da trovaTroncateSenzaId.'), { code: 'TRC_TRONCATE_INVALIDE' })
    }
    if (troncate.length + troncateSenzaId === 0) return { azione: 'procedi' }
    if (!Number.isSafeInteger(tentativiFatti) || tentativiFatti < 0) {
        throw Object.assign(new Error('Il conto dei tentativi deve essere un intero ≥ 0.'), { code: 'TRC_TENTATIVI_INVALIDI' })
    }
    if (capBase !== undefined) capInterotPositivo(capBase, 'capBase')
    if (capMassimoModello !== null && capMassimoModello !== undefined) capInterotPositivo(capMassimoModello, 'capMassimoModello')
    if (!Number.isSafeInteger(maxTentativi) || maxTentativi < 1) {
        throw Object.assign(new Error('La soglia di ritenta deve essere un intero ≥ 1.'), { code: 'TRC_SOGLIA_INVALIDA' })
    }
    if (capBase === undefined || tentativiFatti >= maxTentativi) {
        return { azione: 'arrenditi', troncate: [...troncate], troncateSenzaId, tentativiFatti }
    }
    /* ⛔ Il primo ritenta GIA' RADDOPPIA (base·2¹): la risposta è stata tagliata A capBase —
       ritentare alla stessa base riprodurrebbe lo stesso taglio. n = tentativo (1-based). */
    const boost = capBase * 2 ** (tentativiFatti + 1)
    const capOutput = capMassimoModello != null ? Math.min(boost, capMassimoModello) : boost
    return { azione: 'ritenta', tentativo: tentativiFatti + 1, capOutput, troncate: [...troncate], troncateSenzaId }
}
