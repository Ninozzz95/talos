// Tipi del modulo del desktop copiato byte per byte da r4 (vedi VERSIONE.json). Il .js non si modifica mai qui.
export interface TalosOpzioniRitmo {
    ritardoMaxMs?: number
    frazioneRitmo?: number
    stessoPacchettoMs?: number
    finestraRitmoMs?: number
    bucoMassimoStimaMs?: number
    ritmoStimatoMin?: number
    ritmoStimatoMax?: number
    fineMs?: number
    passoMassimoMs?: number
}
export const RITMO_DI_SERIE: Readonly<Required<TalosOpzioniRitmo>>
export interface TalosRitmo {
    arrivo(nuovoTotale: number, ora: number): void
    concludi(ora: number): void
    avanza(ora: number): number
    readonly totale: number
    readonly mostrato: number
    readonly finito: boolean
    [chiave: string]: unknown
}
export function creaRitmo(opzioni?: TalosOpzioniRitmo): TalosRitmo
