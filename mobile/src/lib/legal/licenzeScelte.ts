/**
 * Le librerie Android distribuite con PIÙ licenze a scelta di chi le usa, e quella che abbiamo scelto.
 *
 * AboutLibraries (`src/generated/androidLicenses.json`) unisce le licenze dichiarate nel pom e non ne toglie: per una libreria
 * «A OR B» le elenca entrambe. La scelta sta qui e si mostra nelle Note legali, con le licenze offerte accanto.
 *
 * ⛔ JNA, il ponte Kotlin↔nativo di iroh (controllo remoto): «LGPL-2.1-or-later OR Apache-2.0», pom 5.15.0: «You can freely
 * decide which license you want to apply». Owner 20/10/2026: Apache-2.0 (PKLA Qualcomm 3.6, niente LGPL accanto ai binari NPU).
 * L'ammissione nella build è in `android/app/build.gradle`, `allowedLicensesMap`.
 */
export const TALOS_LICENZE_SCELTE: Readonly<Record<string, string>> = Object.freeze({
    'net.java.dev.jna:jna': 'Apache-2.0',
})

/** Il testo delle licenze di una libreria. `scelta(licenza, offerte)` è la frase tradotta del pannello. */
export function talosLicenzeDellaLibreria(
    uniqueId: string,
    chiavi: readonly string[],
    licenze: Readonly<Record<string, { name?: string }>>,
    scelta: (licenza: string, offerte: string) => string,
): string {
    const nome = (chiave: string) => licenze[chiave]?.name || chiave
    const offerte = chiavi.map(nome).join(', ')
    const scelta_ = TALOS_LICENZE_SCELTE[uniqueId]
    // Una scelta vale solo fra le licenze che la libreria offre davvero: se non c'è più, si mostra quello che dichiara.
    if (!scelta_ || chiavi.length < 2 || !chiavi.includes(scelta_)) return offerte
    return scelta(nome(scelta_), offerte)
}
