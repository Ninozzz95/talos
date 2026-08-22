import { talosTracciaFuori } from '@/lib/device/traccia'

/**
 * B1 — un ID che lega tutti gli eventi di UNA generazione locale, dal
 * momento in cui l'adattatore la prende in carico fino a quando finisce.
 *
 * ⛔ Perché esiste: prima di questo file, zero occorrenze di un id di
 * correlazione in tutto `mobile/` (grep esaustivo, sessione 22/8). Un
 * TTFT/PP/TG futuro non si poteva mai ricondurre a UNA generazione precisa
 * - solo a "una qualche generazione, più o meno in quel momento".
 *
 * ⛔ Non crittograficamente forte, e non deve esserlo: serve solo a
 * distinguere due generazioni vicine in un unico log locale, non a
 * proteggere niente. `Date.now()` da solo basterebbe quasi sempre; il
 * suffisso casuale copre il caso raro di due generazioni nello stesso
 * millisecondo.
 */
export function talosNewLocalTraceId(): string {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

/**
 * Un evento della generazione `traceId`, verso lo stesso canale che porta
 * fuori dalla WebView la dettatura e il pilota dello schermo -
 * `talosTracciaFuori` (vedi `lib/device/traccia.ts`: un `console.info` da
 * qui NON arriva in logcat, misurato l'11/8).
 *
 * Forma della riga: `local:<traceId> <evento>` - un `grep local:<id>` su
 * logcat mostra la generazione intera, in ordine, con l'ora presa al
 * FATTO e non alla consegna (la stessa disciplina di `talosTracciaFuori`).
 */
export function talosLocalTrace(traceId: string, event: string): void {
    talosTracciaFuori(`local:${traceId} ${event}`)
}
