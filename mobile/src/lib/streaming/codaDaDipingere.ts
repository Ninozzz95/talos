/**
 * ⛔ D-VIS-9b (23/10/2026, prova «Marco»): il parse toglie lo spazio o l'a capo in fondo al testo analizzato, e la coda ripartiva
 * attaccata alla parola prima («uncampo»). Se il testo analizzato finisce con uno spazio bianco (spazio, tabulazione o a capo
 * dentro il paragrafo, revisione del Desktop) e la coda no, la coda dipinta comincia con uno spazio.
 */
export function codaDaDipingere(analizzato: string, inAttesa: string): string {
    return inAttesa && /\s$/.test(analizzato) && !/^\s/.test(inAttesa) ? ` ${inAttesa}` : inAttesa
}
