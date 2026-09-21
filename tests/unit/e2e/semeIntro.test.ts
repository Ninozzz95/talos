import { expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { TALOS_MOBILE_INTRO_VERSION } from '@/composables/useTalosMobileIntroState'

/**
 * ⛔⛔⛔ OGNI SEME DEI TEST DEVE SEGUIRE LA COSTANTE.
 *
 * Il cancello dell'intro è `intro_version < TALOS_MOBILE_INTRO_VERSION`. I test
 * nel browser seminano un utente di ritorno, cioè un `intro_version` già pari
 * alla versione corrente.
 *
 * Quando la costante è salita a 4, quei semi sono rimasti indietro. Da quel
 * momento l'intro si è riaperta: una schermata a tutto campo davanti al pulsante
 * che i test premono. Metà della suite è stata rossa per settimane.
 *
 * ⛔ Nessuno l'ha visto perché la CI non eseguiva i test nel browser — e quando
 * finalmente li ho eseguiti io, il comando finiva con `| tail`, che restituisce
 * il proprio codice di uscita e non quello di Playwright. Due schermi davanti
 * allo stesso guasto.
 *
 * ## ⛔ E la prima versione di questo guardiano non bastava
 *
 * Guardava solo `playwright.config.ts`. Passava, mentre TRE spec avevano semi
 * propri fermi a **2** — più vecchi ancora di quello che avevo appena corretto.
 *
 * ⇒ Un guardiano che copre un posto solo, su una cosa che vive in sei, dà la
 * sensazione della protezione senza la protezione. Qui si guardano tutti i file
 * dei test, e chi ne aggiunge uno nuovo è coperto senza doverlo sapere.
 *
 * ⛔ Costa millisecondi e sta nella suite veloce, quella che gira sempre. Chi
 * alza la versione dell'intro lo scopre subito, non fra dieci minuti di browser
 * e non fra una settimana.
 */

interface Seme { file: string, versione: number }

function semi(): Seme[] {
    const percorsi = ['playwright.config.ts']
    for (const nome of readdirSync('tests/e2e')) {
        if (nome.endsWith('.ts')) percorsi.push(`tests/e2e/${nome}`)
    }
    const fuori: Seme[] = []
    for (const file of percorsi) {
        for (const m of readFileSync(file, 'utf8').matchAll(/intro_version:\s*(\d+)/g)) {
            fuori.push({ file, versione: Number(m[1]) })
        }
    }
    return fuori
}

it('⛔ ogni seme dell\'intro segue la costante', () => {
    const trovati = semi()

    // ⛔ Se il guardiano non trova NIENTE non è verde: è cieco. Un test che
    // passa perché non ha guardato è peggio di uno che non esiste.
    expect(trovati.length, 'nessun seme trovato: il guardiano non sta guardando niente')
        .toBeGreaterThan(0)

    const vecchi = trovati.filter((s) => s.versione !== TALOS_MOBILE_INTRO_VERSION)
    expect(
        vecchi,
        `semi fermi a una versione vecchia (la costante è ${TALOS_MOBILE_INTRO_VERSION}):\n`
        + vecchi.map((s) => `  ${s.file}: ${s.versione}`).join('\n'),
    ).toEqual([])

    /*
     * ⛔ Se questo diventa rosso: NON abbassare la costante. Alza i semi, perché
     * un seme descrive «una persona che ha già visto l'intro» — e quella persona
     * ha visto l'ultima, non la penultima.
     */
})

it('⛔ e i semi sono più d\'uno: coprirne uno solo non è coprirli', () => {
    // La prova che il guardiano guarda davvero in giro, non solo nel file che
    // avevo in mente il giorno in cui l'ho scritto.
    const file = new Set(semi().map((s) => s.file))
    expect(file.size).toBeGreaterThan(1)
})
