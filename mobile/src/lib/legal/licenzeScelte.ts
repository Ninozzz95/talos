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

/**
 * REV6 (25/10/2026): le licenze che AboutLibraries chiama con una chiave di 32 cifre e un nome vuoto o generico («License»).
 * Il nome visibile viene dal catalogo (en+it), letto dal testo della libreria (`scripts/licenze-native/fonti.json`, `copre`):
 * le quattro librerie Ionic sono MIT, sqlcipher e libyuv (dentro camera-core) BSD-3-Clause.
 */
export const TALOS_NOMI_LICENZE: Readonly<Record<string, string>> = Object.freeze({
    '1b1d67650d6e3ccbf9c84584ba784a75': 'legal.licenseNames.mit', // io.ionic.libs:ioncamera-android
    'e9dc079177dba0f173e0aa487fd1017f': 'legal.licenseNames.mit', // io.ionic.libs:ionfilesystem-android
    'eef2cf3e5e856327421f1b82bbc36d8f': 'legal.licenseNames.mit', // io.ionic.libs:iongeolocation-android
    '60f5592b436b0e17f4252b8b602854fe': 'legal.licenseNames.mit', // io.ionic.libs:ioninappbrowser-android
    '45546b23f3f1354cdc022f8f8e4a7bb1': 'legal.licenseNames.bsd3', // net.zetetic:sqlcipher-android
    '44d1a25c593283261968a15c8cc213cd': 'legal.licenseNames.bsd3', // libyuv in androidx.camera:camera-core
})

/**
 * Il testo delle licenze di una libreria. `scelta(licenza, offerte)` è la frase tradotta del pannello; `tradotto(chiave)` legge
 * il catalogo per i nomi di `TALOS_NOMI_LICENZE`.
 */
export function talosLicenzeDellaLibreria(
    uniqueId: string,
    chiavi: readonly string[],
    licenze: Readonly<Record<string, { name?: string }>>,
    scelta: (licenza: string, offerte: string) => string,
    tradotto?: (chiave: string) => string,
): string {
    const nome = (chiave: string) => {
        const frase = TALOS_NOMI_LICENZE[chiave]
        return frase && tradotto ? tradotto(frase) : licenze[chiave]?.name || chiave
    }
    const offerte = chiavi.map(nome).join(', ')
    const scelta_ = TALOS_LICENZE_SCELTE[uniqueId]
    // Una scelta vale solo fra le licenze che la libreria offre davvero: se non c'è più, si mostra quello che dichiara.
    if (!scelta_ || chiavi.length < 2 || !chiavi.includes(scelta_)) return offerte
    return scelta(nome(scelta_), offerte)
}
