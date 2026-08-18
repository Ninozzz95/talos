import { expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { TALOS_MOBILE_INTRO_VERSION } from '@/composables/useTalosMobileIntroState'

/**
 * ⛔⛔⛔ IL SEME DEI TEST DEVE SEGUIRE LA COSTANTE.
 *
 * Il cancello dell'intro è `intro_version < TALOS_MOBILE_INTRO_VERSION`. La
 * configurazione dei test nel browser semina un utente di ritorno, cioè un
 * `intro_version` già pari alla versione corrente.
 *
 * Quando la costante è salita a 4, quel seme è rimasto a 3. Da quel momento
 * l'intro si è riaperta in **ogni** test: una schermata a tutto campo davanti al
 * pulsante che i test premono. Metà della suite è stata rossa per giorni.
 *
 * ⛔ Nessuno l'ha visto perché la CI non eseguiva i test nel browser — e quando
 * finalmente li ho eseguiti io, il comando finiva con `| tail`, che restituisce
 * il proprio codice di uscita e non quello di Playwright. Due schermi davanti
 * allo stesso guasto.
 *
 * ⇒ Questo test costa millisecondi e sta nella suite veloce, quella che gira
 * sempre. Chi alza la versione dell'intro lo scopre subito, non fra dieci minuti
 * di browser e non fra una settimana.
 *
 * ⛔ Legge la configurazione come TESTO di proposito: importarla tirerebbe
 * dentro Playwright nella suite unitaria, e un guardiano che rallenta ciò che
 * protegge finisce spento.
 */

it('⛔ il seme dell\'intro nella configurazione e2e segue la costante', () => {
    const config = readFileSync('playwright.config.ts', 'utf8')
    const trovato = config.match(/intro_version:\s*(\d+)/)

    expect(trovato, 'il seme `intro_version` non è più nella configurazione e2e').not.toBeNull()
    expect(Number(trovato![1])).toBe(TALOS_MOBILE_INTRO_VERSION)
    /*
     * ⛔ Se questo diventa rosso: NON abbassare la costante. Alza il seme nella
     * configurazione, perché il seme descrive «una persona che ha già visto
     * l'intro» — e quella persona ha visto l'ultima, non la penultima.
     */
})

it('⛔ e ce n\'è uno solo: due semi divergerebbero in silenzio', () => {
    const config = readFileSync('playwright.config.ts', 'utf8')
    expect(config.match(/intro_version:\s*\d+/g) ?? []).toHaveLength(1)
})
