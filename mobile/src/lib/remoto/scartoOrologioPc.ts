/**
 * ⛔ D-0145-6 (Desktop 25/10/2026, sessione del PC sul Pad): «Tu · 2 min fa» dopo ~30 s. Misurato il 26/10: l'orologio del PC è ~2 min
 * INDIETRO (−118 s contro Google, −109 s contro GitHub) e il Pad è giusto. r4 stampa le ore col SUO orologio (`timestamp` di AG-UI)
 * e il dispositivo le confrontava col proprio.
 *
 * Cura (b) concordata col Desktop il 26/10:
 * - lo scarto è `oraDelDispositivo − timestamp` degli eventi DAL VIVO (mai della storia rigiocata), il MINIMO in una finestra di 2 min:
 *   il ritardo della rete si somma sempre, quindi il minimo è la stima più vicina al vero;
 * - si dimentica quando il flusso si riapre o cambia il PC;
 * - serve SOLO a mostrare (le ore relative della conversazione e della lista), e solo oltre i 30 s: sotto è rete, non orologio;
 * - un PC AVANTI dà uno scarto negativo: l'ora corretta torna indietro, mai nel futuro.
 */
import { reactive } from 'vue'

export const SOGLIA_SCARTO_MS = 30_000
export const FINESTRA_SCARTO_MS = 120_000

export interface CampioneScarto {
    /** L'ora del dispositivo quando l'evento è arrivato. */
    visto: number
    /** `visto − timestamp` dell'evento. */
    scarto: number
}

/** Il minimo dei campioni entro la finestra dell'ultimo; `null` senza campioni. */
export function stimaScarto(campioni: readonly CampioneScarto[]): number | null {
    if (campioni.length === 0) return null
    const ultimo = Math.max(...campioni.map((c) => c.visto))
    return Math.min(...campioni.filter((c) => ultimo - c.visto <= FINESTRA_SCARTO_MS).map((c) => c.scarto))
}

const campioniDei = new Map<string, CampioneScarto[]>()
/** Lo scarto da applicare per ogni PC (0 = nessuno): reattivo, così la lista e la conversazione si aggiornano insieme. */
const scarti = reactive<Record<string, number>>({})

/** Un evento DAL VIVO del PC con la sua ora (ms dall'epoca). Un'ora storta non è un campione. */
export function annotaOraDelPc(pcId: string, timestampMs: number, oraDispositivo: number = Date.now()): void {
    if (!Number.isFinite(timestampMs) || timestampMs <= 0) return
    const campioni = [...(campioniDei.get(pcId) ?? []), { visto: oraDispositivo, scarto: oraDispositivo - timestampMs }]
        .filter((c) => oraDispositivo - c.visto <= FINESTRA_SCARTO_MS)
    campioniDei.set(pcId, campioni)
    const stima = stimaScarto(campioni)
    scarti[pcId] = stima !== null && Math.abs(stima) > SOGLIA_SCARTO_MS ? stima : 0
}

/** Il flusso si è riaperto o il PC è cambiato: lo scarto si rimisura da capo. */
export function dimenticaScartoDelPc(pcId: string): void {
    campioniDei.delete(pcId)
    delete scarti[pcId]
}

/** Lo scarto da applicare alle ore di quel PC; 0 per il dispositivo, per un PC mai visto dal vivo o sotto la soglia. */
export function scartoDelPc(pcId: string | null | undefined): number {
    return pcId ? scarti[pcId] ?? 0 : 0
}

/** L'ora del PC portata sull'orologio del dispositivo, per mostrarla; un iso storto resta com'è. */
export function oraSulDispositivo(iso: string, scarto: number): string {
    if (!scarto || !iso) return iso
    const ms = Date.parse(iso)
    return Number.isFinite(ms) ? new Date(ms + scarto).toISOString() : iso
}
