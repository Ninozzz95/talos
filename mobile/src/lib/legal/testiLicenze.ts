/**
 * N1 (25/10/2026) — i TESTI delle licenze dei componenti nativi e delle librerie Android, come li mostrano le Note legali.
 *
 * I testi stanno in `src/generated/nativeLicenses.json`, scritto da `scripts/licenze-native/genera-licenze-native.mjs` dalle copie
 * upstream alla versione spedita (fonti e impronte in `scripts/licenze-native/fonti.json`). Pannello e cancello
 * (`tests/unit/legal/testiLicenze.test.ts`) usano le stesse due funzioni: quello che la prova controlla è quello che si vede.
 */

export interface TalosTestoLicenza {
    titolo: string
    fonte: string
    sha256: string
    testo: string
    /** Solo per il testo proprio di una libreria Android: le sue licenze (chiavi di AboutLibraries) che quel testo copre. */
    copre?: string[]
}

export interface TalosLicenzeNative {
    componenti: Record<string, TalosTestoLicenza[]>
    rust: {
        fonte: string
        crates: number
        /** N1-bis: `sorgenti` (solo MPL, §3.2(a)) = dove sta il sorgente di ogni crate, nello stesso ordine; lo scrive lo script. */
        licenze: Array<{ id: string, testo: string, crates: string[], sorgenti?: string[] }>
    }
    android: { perLicenza: Record<string, TalosTestoLicenza>, perLibreria: Record<string, TalosTestoLicenza> }
}

/**
 * Le licenze Android SENZA testo, col motivo. Sono condizioni proprietarie di Google, non licenze da ridistribuire: si leggono
 * all'indirizzo che AboutLibraries riporta, e il pannello lo mostra al posto del testo. Una licenza nuova senza testo NON passa:
 * il cancello la segnala finché non ha una fonte in `fonti.json` o un motivo qui.
 */
export const TALOS_ANDROID_LICENZE_SENZA_TESTO: Readonly<Record<string, string>> = Object.freeze({
    // play-services-*, odml:image: «Android Software Development Kit License», condizioni di Google (developer.android.com/studio/terms).
    ASDKL: 'condizioni di Google per l’SDK Android, pubblicate all’indirizzo della licenza',
    // Lo scanner del QR: «ML Kit Terms of Service», accettate dall'owner il 20/10/2026 (`android/app/build.gradle`).
    '9962f44671a86e167c028415c7e21548': 'condizioni di Google per ML Kit, pubblicate all’indirizzo della licenza',
})

const separatore = (titolo: string, fonte: string) => `── ${titolo} · ${fonte} ──`

/** Il testo completo di un componente nativo (più file uno dopo l'altro, ciascuno con la sua fonte), o null se non c'è. */
export function talosTestoNativo(nome: string, dati: TalosLicenzeNative): string | null {
    const testi = (dati.componenti[nome] ?? []).filter((voce) => voce.testo.trim())
    if (!testi.length) return null
    return testi.map((voce) => `${separatore(voce.titolo, voce.fonte)}\n\n${voce.testo.trim()}`).join('\n\n')
}

/**
 * Gli avvisi dei crate Rust compilati dentro la libreria di iroh: una licenza per testo, coi crate che la usano. N1-bis: dove la
 * licenza lo chiede (MPL-2.0 §3.2(a)), sotto l'intestazione il link al sorgente di ogni crate, con la frase del catalogo.
 */
export function talosTestoCrateRust(dati: TalosLicenzeNative, sorgente: (indirizzo: string) => string = (indirizzo) => indirizzo): string | null {
    const licenze = dati.rust.licenze.filter((voce) => voce.testo.trim())
    if (!licenze.length || licenze.length !== dati.rust.licenze.length) return null
    return licenze.map((voce) => {
        const sorgenti = voce.sorgenti?.length ? `${voce.sorgenti.map(sorgente).join('\n')}\n\n` : ''
        return `── ${voce.id} · ${voce.crates.join(', ')} ──\n\n${sorgenti}${voce.testo.trim()}`
    }).join('\n\n')
}

/**
 * Il testo di una libreria Android: quello di AboutLibraries se un giorno lo porta (`licenses[k].content`), poi quello della
 * libreria stessa (il suo LICENSE, con l'avviso del titolare), poi quello della licenza. Null se non ce n'è nessuno.
 * REV6 (25/10/2026): il testo proprio sostituisce quello comune SOLO per le licenze che copre (`copre`). Prima bastava averne uno
 * per saltare tutte le altre: iroh (Apache-2.0 | MIT) e camera-core (Apache-2.0 | BSD di libyuv) perdevano l'Apache-2.0.
 */
export function talosTestoAndroid(
    id: string,
    chiavi: readonly string[],
    licenzeAbout: Readonly<Record<string, { content?: string }>>,
    dati: TalosLicenzeNative,
): string | null {
    const parti: string[] = []
    const propria = dati.android.perLibreria[id]
    if (propria?.testo.trim()) parti.push(`${separatore(propria.titolo, propria.fonte)}\n\n${propria.testo.trim()}`)
    for (const chiave of chiavi) {
        const about = licenzeAbout[chiave]?.content
        const comune = dati.android.perLicenza[chiave]
        if (about?.trim()) parti.push(about.trim())
        else if (comune?.testo.trim() && !propria?.copre?.includes(chiave)) parti.push(`${separatore(comune.titolo, comune.fonte)}\n\n${comune.testo.trim()}`)
    }
    return parti.length ? parti.join('\n\n') : null
}
