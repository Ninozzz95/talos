// @vitest-environment jsdom
/**
 * ⛔⛔ QUATTRO RIGHE CHE NON DICEVANO SE ERANO CONCESSE.
 *
 * ## Il difetto, trovato dall'owner il 2026-08-14
 *
 * La pagina «Privacy e autorizzazioni» mostrava Contatti, Calendario, Conteggio
 * della posta e Fotocamera con **un cerchio tratteggiato e nient'altro**: niente
 * «CONSENTITO», niente «Bloccato da Android», nessun pulsante. Microfono e
 * Notifiche invece lo dicevano.
 *
 * Cioè la schermata che promette di dire tutto taceva esattamente sulla domanda
 * per cui una persona la apre: **ce l'ha, o no?**. E taceva su quattro permessi
 * che si CHIEDONO — cioè sui soli in cui la risposta può cambiare.
 *
 * ## ⛔ Ciò che questo file difende
 *
 * 1. **Che lo stato compaia** quando il sistema lo sa.
 * 2. **Che si CHIEDA col dialogo**, non con un viaggio nelle impostazioni: è la
 *    regola di tutto il progetto — chiedere costa un tocco, mandare a cercare un
 *    interruttore è la strada lunga.
 * 3. **Che dopo un rifiuto definitivo il pulsante cambi mestiere**: lì il
 *    dialogo non si riapre più, e un «Consenti» che non fa niente è peggio di
 *    nessun pulsante.
 * 4. ⛔ **Che una riga senza risposta torni a TACERE.** `?? 'prompt'` sarebbe
 *    stato comodo e falso: «non richiesto» è un fatto, e inventarlo su questa
 *    pagina vale doppio.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

const leggiStato = vi.fn()
const chiediRuntime = vi.fn(async () => 'granted' as const)
const apriImpostazioni = vi.fn(async () => undefined)

vi.mock('@/services/devicePermissions', async (originale) => {
    const vero = await originale<typeof import('@/services/devicePermissions')>()
    return {
        ...vero,
        readTalosDeviceState: (...argomenti: unknown[]) => leggiStato(...argomenti),
        requestTalosRuntimePermission: (...argomenti: unknown[]) => chiediRuntime(...argomenti),
        openTalosAppSettings: (...argomenti: unknown[]) => apriImpostazioni(...argomenti),
        requestTalosNotifications: vi.fn(async () => 'granted'),
        requestTalosMicrophone: vi.fn(async () => undefined),
        requestTalosBatteryExemption: vi.fn(async () => true),
    }
})

const { default: TalosMobileSettingsPrivacyPanel } = await import(
    '@/components/talos/settings/TalosMobileSettingsPrivacyPanel.vue'
)

function statoFinto(runtime: Record<string, string>) {
    return {
        microphone: 'granted',
        notifications: 'granted',
        notificationsRuntime: true,
        biometricHardware: true,
        batteryExempt: true,
        manufacturer: 'oppo',
        brand: 'oneplus',
        runtime,
    }
}

async function pannello(runtime: Record<string, string>) {
    leggiStato.mockResolvedValue(statoFinto(runtime))
    const wrapper = mount(TalosMobileSettingsPrivacyPanel, {
        global: { stubs: { Button: { template: '<button v-bind="$attrs"><slot /></button>' } } },
    })
    await flushPromises()
    return wrapper
}

function riga(wrapper: Awaited<ReturnType<typeof pannello>>, id: string) {
    const nodo = wrapper.find(`[data-permission-row="${id}"]`)
    expect(nodo.exists(), `la riga ${id} deve esistere`).toBe(true)
    return nodo
}

describe('le righe dei permessi dicono se sono concesse', () => {
    beforeEach(() => {
        chiediRuntime.mockClear()
        apriImpostazioni.mockClear()
    })

    it('⭐ una riga concessa lo DICE, e non offre più niente da premere', async () => {
        const wrapper = await pannello({ calendar: 'granted' })
        const calendario = riga(wrapper, 'calendar')
        /*
         * Lo stato è TESTO, non solo un colore: un distintivo che nessuno può
         * leggere non è uno stato. ⛔ La prova non guarda la parola italiana:
         * nei test la lingua è l'inglese, e legare una prova alla traduzione
         * significa romperla il giorno che qualcuno cambia una parola.
         */
        expect(calendario.text().toLowerCase()).toMatch(/consentito|allowed/)
        expect(calendario.find('[data-testid="talos-permission-allow"]').exists()).toBe(false)
    })

    it('⭐⭐ una riga da chiedere offre il DIALOGO, non il viaggio in Impostazioni', async () => {
        const wrapper = await pannello({ mailCount: 'prompt' })
        const posta = riga(wrapper, 'mailCount')
        const pulsante = posta.find('[data-testid="talos-permission-allow"]')
        expect(pulsante.exists(), 'deve esserci il pulsante che CHIEDE').toBe(true)
        await pulsante.trigger('click')
        await flushPromises()
        expect(chiediRuntime).toHaveBeenCalledWith('mailCount')
        expect(apriImpostazioni, 'chiedere non è mandare in Impostazioni').not.toHaveBeenCalled()
    })

    it('⛔ dopo un rifiuto definitivo il pulsante cambia mestiere', async () => {
        const wrapper = await pannello({ contacts: 'denied' })
        const contatti = riga(wrapper, 'contacts')
        expect(contatti.find('[data-testid="talos-permission-allow"]').exists()).toBe(false)
        const versoImpostazioni = contatti.find('[data-testid="talos-permission-settings"]')
        expect(versoImpostazioni.exists(), 'lì il dialogo non si riapre più').toBe(true)
        await versoImpostazioni.trigger('click')
        await flushPromises()
        expect(apriImpostazioni).toHaveBeenCalled()
        expect(chiediRuntime, 'chiedere non servirebbe a niente').not.toHaveBeenCalled()
    })

    it('⛔⛔ una riga SENZA risposta tace, invece di dire «non richiesto»', async () => {
        const wrapper = await pannello({ calendar: 'granted' })
        const fotocamera = riga(wrapper, 'camera')
        const testo = fotocamera.text().toLowerCase()
        for (const parola of [/consentito|allowed/, /non richiesto|not requested/, /bloccato|blocked/]) {
            expect(testo, `la fotocamera non deve dire «${parola}» senza saperlo`).not.toMatch(parola)
        }
        expect(fotocamera.find('[data-testid="talos-permission-allow"]').exists()).toBe(false)
    })

    it('⛔ le quattro righe sono TUTTE governate dalla stessa mappa', async () => {
        /*
         * Il difetto nasceva da un `if` per riga: microfono e notifiche
         * c'erano, le altre no. Se un domani qualcuno aggiunge un permesso di
         * runtime e si dimentica la riga, questo test non lo vede — ma vede
         * subito se qualcuno TOGLIE una delle quattro dalla mappa.
         */
        const wrapper = await pannello({
            contacts: 'granted',
            calendar: 'granted',
            camera: 'granted',
            mailCount: 'granted',
        })
        for (const id of ['contacts', 'calendar', 'camera', 'mailCount']) {
            expect(riga(wrapper, id).text().toLowerCase(), id).toMatch(/consentito|allowed/)
        }
    })
})
