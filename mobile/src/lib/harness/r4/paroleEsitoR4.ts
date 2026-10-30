/**
 * ESITO-RIGA (Pad, 27/10/2026, parità col PC): la parola di una riga d'attrezzo che non è andata, quella di
 * `riassuntoAttrezzoConcluso` (`legacy/app.js:16140` @ r4 c5ce4e453). Una non riuscita dice la frase della sua specie per le sei che
 * il PC conosce in riga (leggi, cerca, elenca, scrivi, shell, naviga), «Attività non riuscita» per le altre; una copia identica
 * saltata dice «<nome>: richiesta identica, saltata». Interrotta e non eseguita tengono la loro parola: le dice il tono.
 *
 * ⛔ Il PC per un comando con la descrizione del modello scrive «<descrizione> — non riuscito»: la riga del dispositivo non mostra
 * la descrizione nemmeno quando va bene (è «Comando: <comando>»), quindi qui resta la frase della specie col comando accanto.
 *
 * Le parole sono del desktop (`testi/varie-esiti-r4.json`, `testi/app-esiti-r4.json`, estratte da `testi-server-r4.mjs`), mai a mano.
 */
import type { TalosAttrezzoDelGiro } from '@/lib/chat/sequenzaDelTurno'
import varie from './testi/varie-esiti-r4.json'
import app from './testi/app-esiti-r4.json'

/** `specieAttrezzo` ristretta alle sei che `riassuntoAttrezzoConcluso` dice in riga, col nome della chiave inglese. */
const SPECIE: Readonly<Record<string, string>> = {
    leggi: 'reading', cerca: 'search', elenca: 'listing', scrivi: 'writing', shell: 'command', naviga: 'page',
}

const italiano = (lingua: string) => /^it(?:-|$)/iu.test(lingua)

function frase(tabella: { it: Record<string, string>; en: Record<string, string> }, chiave: string, lingua: string, valori: Record<string, string>): string {
    const testo = (italiano(lingua) ? tabella.it[chiave] : undefined) ?? tabella.en[chiave] ?? ''
    return testo.replace(/\{([a-zA-Z0-9_]+)\}/g, (tutto, nome: string) => valori[nome] ?? tutto)
}

/** La parola che prende il posto di quella dell'attrezzo, o `undefined` quando resta la sua (riuscita, interrotta, non eseguita). */
export function parolaDellEsitoR4(attrezzo: TalosAttrezzoDelGiro, nome: string, lingua: string): string | undefined {
    if (attrezzo.esito === 'doppione') return frase(app, 'activity.duplicateSkipped', lingua, { nome })
    if (attrezzo.esito !== 'errore') return undefined
    const specie = Object.hasOwn(SPECIE, attrezzo.name) ? SPECIE[attrezzo.name] : undefined
    return specie ? frase(varie, `tools.kind.${specie}.failedOne`, lingua, { n: '1' }) : frase(app, 'activity.stepFailed', lingua, {})
}

/** `data-tool-state` della riga, come il PC (`impostaEsitoRiga`): error, interrupted, not-run, duplicate; niente se è riuscita. */
export const STATO_DELLA_RIGA_R4: Readonly<Record<NonNullable<TalosAttrezzoDelGiro['esito']>, string>> = {
    errore: 'error', interrotta: 'interrupted', 'non-eseguita': 'not-run', doppione: 'duplicate',
}
