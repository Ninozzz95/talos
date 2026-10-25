// Tipi del modulo del desktop copiato byte per byte da r4 (vedi VERSIONE.json). Il .js non si modifica mai qui.
export interface TalosScansioneInArrivo {
    pos: number
    dentroFence: boolean
    confine: number
    citazioneNelBlocco: boolean
    rigaPrecedente: string | null
    impronta: string
}
export function separatoreTabella(riga: string): boolean
export function creaScansione(): TalosScansioneInArrivo
export function avanzaScansione(s: TalosScansioneInArrivo, testo: string, limite?: number): number
export function confineGrafema(testo: string, k: number): number
export function confineDiRivelazione(testo: string, k: number, opzioni?: { dentroFence?: boolean, finito?: boolean }): number
export function chiudiInArrivo(coda: string, opzioni?: { dentroFence?: boolean }): string
