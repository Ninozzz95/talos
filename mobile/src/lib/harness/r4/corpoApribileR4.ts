/**
 * T8 (ledger `LEDGER-T8-CORPO-DELLA-RIGA-2026-10-27.md`): se la riga ha un corpo da aprire, SENZA caricare i dizionari del corpo
 * (`corpoAttrezzoR4.ts` si carica solo quando la riga si apre). Stessa regola di `nonApribileSeVuota` (`legacy/app.js:4084` @ r4
 * 79ea996de): si apre solo se dentro c'è qualcosa — un risultato, o argomenti che non siano la sola descrizione.
 */
import type { TalosRisultatoAttrezzo } from '@/lib/chat/sequenzaDelTurno'

export interface ChiamataApribileR4 {
    nome: string
    argomenti: string
    risultato?: TalosRisultatoAttrezzo
}

export function corpoApribileR4(attrezzo: { name: string; argomenti?: string; risultato?: TalosRisultatoAttrezzo }): ChiamataApribileR4 | null {
    const argomenti = attrezzo.argomenti ?? ''
    const chiamata = { nome: attrezzo.name, argomenti, ...(attrezzo.risultato ? { risultato: attrezzo.risultato } : {}) }
    if (attrezzo.risultato) return chiamata
    const grezzi = argomenti.trim()
    if (!grezzi) return null
    let valore: unknown
    try { valore = JSON.parse(grezzi) } catch { return chiamata }
    if (!valore || typeof valore !== 'object') return chiamata
    return Object.keys(valore).some((k) => k !== 'descrizione') ? chiamata : null
}
