/**
 * A0-2 (21/10/2026) — ciò che è sullo schermo entra nella domanda come DATO, dentro una cornice che una pagina non può chiudere.
 *
 * Prima la barra metteva il testo fra due `"""` e l'indirizzo della pagina fuori, in una frase che diceva al modello di aprirlo:
 * una pagina con `"""` dentro chiudeva la cornice e scriveva fuori dal dato, come se fosse la persona (revisione avversaria, punto 4).
 * Ora il delimitatore porta un segno casuale nuovo a ogni domanda (lo stesso metodo dello «spotlighting» con delimitatori casuali),
 * la frase lo nomina, l'indirizzo sta dentro, e ogni `<<<`/`>>>` del testo si spegne: nessuna riga dello schermo può essere un bordo.
 */
type Parole = (chiave: string, valori?: Record<string, string>) => string

export interface TalosVistoDelloSchermo {
    readonly testo?: string | null
    readonly pagina?: string | null
}

/** Otto o più cifre esadecimali: un segno che chi fa la pagina non può indovinare prima. */
export function talosSegnoCasuale(): string {
    const byte = new Uint8Array(6)
    globalThis.crypto.getRandomValues(byte)
    return Array.from(byte, (b) => b.toString(16).padStart(2, '0')).join('')
}

/** Le frecce triple si spengono in quelle angolari: il testo resta leggibile, ma nessuna riga è più un bordo della cornice. */
const spegniIBordi = (testo: string): string => testo.replace(/<<</g, '‹‹‹').replace(/>>>/g, '›››')

export function talosCorniceDelloSchermo(visto: TalosVistoDelloSchermo, t: Parole, segno: string = talosSegnoCasuale()): string {
    const schermo = (visto.testo ?? '').trim()
    const pagina = (visto.pagina ?? '').trim()
    if (!schermo && !pagina) return ''
    const inizio = `<<<SCREEN ${segno}>>>`
    const fine = `<<<END SCREEN ${segno}>>>`
    const righe = [t('barra.contextPrompt', { start: inizio, end: fine }), inizio]
    if (pagina) righe.push(spegniIBordi(t('barra.contextPage', { page: pagina })))
    if (schermo) righe.push(spegniIBordi(schermo))
    righe.push(fine)
    if (pagina) righe.push(t('barra.contextPageHint'))
    righe.push('', '')
    return righe.join('\n')
}
