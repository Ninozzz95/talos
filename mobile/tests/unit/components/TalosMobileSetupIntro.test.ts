// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { reactive, ref } from 'vue'

/**
 * Owner 2026-07-27, after the research: the six-slide carousel is gone and
 * first run is the two things TALOS cannot start without.
 *
 * What the research pinned down, and what these tests hold to it:
 *  - NN/g: deck-of-cards tutorials "make the interface appear more complicated
 *    than it actually is"; onboarding is justified only when the app needs
 *    something to begin. So: no slides, two steps, both about a real need.
 *  - NN/g on wizards: show the steps and where you are, allow going back,
 *    let people resume.
 *  - NN/g: "always provide a highly visible Skip option".
 *  - Android: never request runtime permissions at first launch.
 */
const state = vi.hoisted(() => ({
    security: { app_lock_enabled: false },
    /** Le azioni che la persona ha DECISO, distinte dai valori ereditati. */
    toolsChosen: [] as string[],
    toolPermissions: [] as Array<Record<string, string>>,
    secrets: {} as Record<string, boolean>,
    account: { display_name: '' },
    savedNames: [] as string[],
    memoryNames: [] as string[],
    memoryFailure: false,
    memoryExisting: false,
}))

vi.mock('@/stores/settings', () => ({
    useSettingsStore: () => ({
        state: reactive({ security: state.security, tools_chosen: state.toolsChosen }),
        setSecurity: vi.fn(async () => {}),
        setToolPermissions: vi.fn(async (patch: Record<string, string>) => {
            state.toolPermissions.push(patch)
            // Toccare un permesso e' sceglierlo: il magazzino vero fa lo stesso.
            for (const action of Object.keys(patch)) {
                if (!state.toolsChosen.includes(action)) state.toolsChosen.push(action)
            }
        }),
    }),
}))

vi.mock('@/stores/chatController', () => ({
    useChatController: () => ({
        secrets: state.secrets,
        memories: {
            list: async () => state.memoryExisting
                ? [{
                    id: 'talos-profile-display-name',
                    status: 'active',
                    content: state.account.display_name,
                }]
                : [],
            upsertDisplayName: async (name: string) => {
                state.memoryNames.push(name)
                if (state.memoryFailure) throw new Error('sqlite unavailable')
                state.memoryExisting = true
            },
        },
    }),
}))

vi.mock('@/stores/account', () => ({
    useTalosAccountStore: () => ({
        state: reactive(state.account),
        setDisplayName: async (name: string) => {
            const normalized = name.trim().slice(0, 60)
            state.account.display_name = normalized
            state.savedNames.push(normalized)
        },
    }),
}))

vi.mock('@/services/appLock', () => ({
    setupAppLockPin: vi.fn(async () => {}),
    clearAppLock: vi.fn(async () => {}),
    biometricUnlockAvailable: vi.fn(async () => false),
    requestBiometricUnlock: vi.fn(async () => false),
    verifyAppLockPin: vi.fn(async () => false),
    appLockThrottleRemainingMs: vi.fn(async () => 0),
}))

vi.mock('@/services/databaseProtection', () => ({
    enableTalosDatabaseProtection: vi.fn(async () => ({ migrated: false })),
    disableTalosDatabaseProtection: vi.fn(async () => {}),
}))

// The provider key panel is reused wholesale rather than reimplemented; it
// drags the whole model catalogue in, which this test does not need.
vi.mock('@/components/talos/models/TalosMobileProviderRuntimePanel.vue', () => ({
    // `__esModule` matters: without it defineAsyncComponent treats the module
    // itself as the component and Vue reads properties off the mock.
    __esModule: true,
    default: { name: 'ProviderRuntimePanelStub', template: '<div data-testid="settings-provider-keys" />' },
}))

import TalosMobileSetupIntro from '@/components/intro/TalosMobileSetupIntro.vue'

beforeEach(() => {
    state.security.app_lock_enabled = false
    state.account.display_name = ''
    state.savedNames.length = 0
    state.memoryNames.length = 0
    state.memoryFailure = false
    state.memoryExisting = false
    state.toolsChosen.length = 0
    state.toolPermissions.length = 0
    for (const key of Object.keys(state.secrets)) delete state.secrets[key]
})

function mountIntro() {
    return mount(TalosMobileSetupIntro, { attachTo: document.body })
}

async function mountStory() {
    const wrapper = mountIntro()
    await flushPromises()
    await wrapper.get('[data-testid="talos-language-continue"]').trigger('click')
    return wrapper
}

/** Past language and story, into identity/PIN/model setup. */
async function mountSetup() {
    const wrapper = await mountStory()
    await wrapper.get('[data-testid="talos-setup-begin"]').trigger('click')
    return wrapper
}

describe('what TALOS says it is, before asking for anything', () => {
    it('ONBOARD-UNIFIED-01 opens on the separate language page before the story', async () => {
        const wrapper = mountIntro()
        await flushPromises()
        expect(wrapper.find('[data-testid="talos-setup-language"]').exists()).toBe(true)
        expect(wrapper.findAll('[data-testid="talos-language-choice"]')).toHaveLength(3)
        expect(wrapper.find('[data-testid="talos-setup-story"]').exists()).toBe(false)
        expect(wrapper.find('[data-testid="talos-setup-step"]').exists()).toBe(false)
    })

    it('makes the claim against itself, which is the only one worth making', async () => {
        // Obsidian sells this with "No one else can read them, not even us".
        // TALOS can say something stronger and still true: there is no server
        // of ours, so there is no "us" for anything to reach.
        const wrapper = await mountStory()
        expect(wrapper.text()).toMatch(/no us to reach/i)
        expect(wrapper.text()).toMatch(/no backend/i)
        wrapper.unmount()
    })

    it('names every thing the owner asked to be named', async () => {
        const wrapper = await mountStory()
        const text = wrapper.text()
        expect(text).toMatch(/encrypted on this phone/i) // privacy, local-first
        expect(text).toMatch(/download a model/i) // models on the device
        expect(text).toMatch(/memory/i) // a memory you can argue with
        expect(text).toMatch(/from inside the conversation/i) // changed from chat
        expect(text).toMatch(/two models at once/i)
        expect(text).toMatch(/zethos/i)
        /*
         * ⛔ Cio' che va nominato e' la CAPACITA', non la dipendenza.
         *
         * Qui c'era `/shizuku/i`. Shizuku e' stato tolto il 2026-08-09 — zero
         * voci nell'APK — e il test lo pretendeva ancora: teneva in vita il nome
         * di un'app di terzi dentro la promessa di TALOS, e sarebbe andato rosso
         * proprio quando il testo diceva finalmente il vero.
         *
         * Un test che nomina il MEZZO si rompe a ogni cambio di mezzo; uno che
         * nomina la capacita' sopravvive, ed e' anche quello che interessa a chi
         * legge la schermata: agire sul telefono.
         */
        /*
         * ⛔ E il 2026-08-16 la stessa lezione si e' ripetuta un gradino sotto.
         *
         * Qui c'era `/on the phone itself/i` — la CAPACITA', giusto — ma
         * agganciata a una FORMULAZIONE sola. Agire sul telefono e' passato da
         * «in arrivo» a fatto, il testo e' diventato «it acts inside your other
         * apps», e questa riga e' andata rossa proprio mentre la schermata
         * diceva una cosa piu' vera di prima.
         *
         * ⇒ Si accettano le forme in cui quella capacita' si dice davvero.
         */
        expect(text).toMatch(/acts inside your other apps|taps the button/i)
        expect(text).toMatch(/encrypted sync/i) // cloud, optional, off by default
        expect(text).toMatch(/encrypted Library/i) // the phone's own files
        wrapper.unmount()
    })

    it('does not make the project about the person who built it', async () => {
        // Owner 2026-07-27: "non voglio che metti che e' stato fatto da una sola
        // persona, penso sia troppo egocentrica come cosa".
        const wrapper = await mountStory()
        expect(wrapper.text()).not.toMatch(/one engineer|single builder|one-person/i)
        wrapper.unmount()
    })

    it('keeps what is built apart from what is coming', async () => {
        // The modal this replaces mixed them, and the owner called it fake.
        const wrapper = await mountStory()
        /*
         * L'invariante che conta: **niente di non costruito e' descritto al
         * presente**, e niente di costruito resta nel futuro.
         *
         * ⛔ E il 2026-08-16 il secondo verso ha morso davvero. Agire sul
         * telefono era in «in arrivo» da quando la funzione non c'era; adesso
         * c'e', e il ponte non chiede nemmeno piu' il Debug wireless. Una
         * promessa al futuro su una cosa gia' fatta non e' prudenza: fa
         * sembrare l'app piu' piccola di quello che e', e chi la legge crede
         * di non poterla usare.
         *
         * ⇒ Restano in arrivo SOLO Zethos e la sincronizzazione. Se un giorno
         * uno dei due esce, questo test va rosso — ed e' esattamente il suo
         * lavoro.
         */
        const voci = wrapper.findAll('li').map((node) => node.text())
        const built = voci.filter((text) =>
            /encrypted on this phone|download a model|acts inside|verified state|wake word|remembers what you tell|second model|Library/i.test(text))
        expect(built.length).toBeGreaterThanOrEqual(6)
        // Niente di NON costruito raccontato come se ci fosse.
        expect(built.join(' ')).not.toMatch(/zethos|encrypted sync/i)
        // E il futuro dice quei due, e solo quelli.
        const coming = voci.join(' ')
        expect(coming).toMatch(/zethos/i)
        expect(coming).toMatch(/encrypted sync/i)
        wrapper.unmount()
    })

    /*
     * ⭐ OTTO TITOLI A COLPO D'OCCHIO — owner 2026-08-16.
     *
     * Con otto tratti aperti la prima pagina era un muro di testo, e un muro si
     * salta tutto invece di leggerne un pezzo. Adesso si vedono i titoli e si
     * apre solo quello che interessa.
     *
     * ⛔ Si prova che sono `<details>` NATIVI e non un accordion nostro: da
     * quello dipendono la tastiera, `aria-expanded` e la ricerca nel testo del
     * browser — tre cose che un accordion fatto a mano deve ricablare, e tre
     * modi di sbagliarle.
     */
    it('mostra i titoli, e tiene le descrizioni dentro un collasso', async () => {
        const wrapper = await mountStory()
        const collassi = wrapper.findAll('details')
        expect(collassi.length).toBeGreaterThanOrEqual(6)

        // Ogni collasso ha il TITOLO come intestazione…
        const primo = collassi[0]!
        expect(primo.find('summary').exists()).toBe(true)
        expect(primo.find('summary').text()).toMatch(/no account/i)
        // …e la descrizione DENTRO, non nell'intestazione.
        expect(primo.find('summary').text()).not.toMatch(/there is no us to reach/i)
        expect(primo.text()).toMatch(/there is no us to reach/i)

        // ⛔ Chiusi in partenza: se si aprissero da soli, il muro tornerebbe.
        expect(collassi.every((d) => d.attributes('open') === undefined)).toBe(true)
        wrapper.unmount()
    })

    it('can be left from the story too', async () => {
        const wrapper = await mountStory()
        await wrapper.get('[data-testid="talos-setup-skip"]').trigger('click')
        expect(wrapper.emitted('close')).toEqual([['skipped']])
        wrapper.unmount()
    })
})

describe('first-run setup', () => {
    it('ONBOARD-UNIFIED-02 keeps every first-run decision in one setup modal', async () => {
        const wrapper = await mountSetup()
        const steps = wrapper.findAll('[data-testid="talos-setup-step"]')
        /**
         * Quattro dal 2026-08-03, e il quarto e ultimo di proposito.
         *
         * Owner: «assicurarci che l'utente venga guidato per whitelistare
         * l'applicazione in modo che giri in BG. Senza questa non possiamo
         * andare avanti.» Ultimo perche la ricerca sui permessi dice di
         * chiedere quando la persona ha capito a che serve: a quel punto ha
         * gia dato nome, PIN e modello.
         */
        expect(steps).toHaveLength(5)
        expect(steps.map((step) => step.text()))
            .toEqual(['Name', 'PIN', 'Model', 'Autonomy', 'Background'])
        expect(steps[0]!.attributes('aria-current')).toBe('step')
        expect(wrapper.find('[data-testid="talos-setup-identity"]').exists()).toBe(true)
        wrapper.unmount()
    })

    it('leads with the consequence instead of a reassurance', async () => {
        // The PIN is not a lock over the app: `enableTalosDatabaseProtection`
        // makes it the database key. Softening that would be the one lie this
        // screen cannot afford.
        const wrapper = await mountSetup()
        await wrapper.get('[data-testid="talos-setup-name"]').setValue('Nino')
        await wrapper.get('[data-testid="talos-setup-next"]').trigger('click')
        await flushPromises()
        expect(wrapper.text()).toMatch(/no recovery/i)
        wrapper.unmount()
    })

    it('ONBOARD-UNIFIED-03 saves the name and its global memory before advancing', async () => {
        const wrapper = await mountSetup()
        await wrapper.get('[data-testid="talos-setup-name"]').setValue('  Ninò 🚀  ')
        await wrapper.get('[data-testid="talos-setup-next"]').trigger('click')
        await flushPromises()

        expect(state.savedNames).toEqual(['Ninò 🚀'])
        expect(state.memoryNames).toEqual(['Ninò 🚀'])
        expect(wrapper.findAll('[data-testid="talos-setup-step"]')[1]!.attributes('aria-current')).toBe('step')
        wrapper.unmount()
    })

    it('ONBOARD-UNIFIED-05 keeps a failed memory write visible and retryable', async () => {
        state.memoryFailure = true
        const wrapper = await mountSetup()
        await wrapper.get('[data-testid="talos-setup-name"]').setValue('Nino')
        await wrapper.get('[data-testid="talos-setup-next"]').trigger('click')
        await flushPromises()

        expect(wrapper.get('[data-testid="talos-setup-identity-error"]').attributes('role')).toBe('alert')
        expect(wrapper.findAll('[data-testid="talos-setup-step"]')[0]!.attributes('aria-current')).toBe('step')

        state.memoryFailure = false
        await wrapper.get('[data-testid="talos-setup-next"]').trigger('click')
        await flushPromises()
        expect(state.memoryNames).toEqual(['Nino', 'Nino'])
        expect(wrapper.findAll('[data-testid="talos-setup-step"]')[1]!.attributes('aria-current')).toBe('step')
        wrapper.unmount()
    })

    it('goes forward and back across identity, PIN and model', async () => {
        const wrapper = await mountSetup()
        await wrapper.get('[data-testid="talos-setup-name"]').setValue('Nino')
        await wrapper.get('[data-testid="talos-setup-next"]').trigger('click')
        await flushPromises()
        await wrapper.get('[data-testid="talos-setup-next"]').trigger('click')
        expect(wrapper.findAll('[data-testid="talos-setup-step"]')[2]!.attributes('aria-current')).toBe('step')
        await flushPromises()
        expect(wrapper.find('[data-testid="settings-provider-keys"]').exists()).toBe(true)
        await wrapper.get('[data-testid="talos-setup-back"]').trigger('click')
        expect(wrapper.findAll('[data-testid="talos-setup-step"]')[1]!.attributes('aria-current')).toBe('step')
        wrapper.unmount()
    })

    it('opens on the model step when a name and PIN already exist', async () => {
        // Killed between the two steps, or the PIN was set earlier in Settings.
        // Asking again would be the app not looking at its own state.
        state.account.display_name = 'Nino'
        state.memoryExisting = true
        state.security.app_lock_enabled = true
        const wrapper = await mountSetup()
        const steps = wrapper.findAll('[data-testid="talos-setup-step"]')
        expect(steps[2]!.attributes('aria-current')).toBe('step')
        wrapper.unmount()
    })

    it('keeps a visible way out on every step, and reports it as skipped', async () => {
        const wrapper = await mountSetup()
        await wrapper.get('[data-testid="talos-setup-skip"]').trigger('click')
        expect(wrapper.emitted('close')).toEqual([['skipped']])
        wrapper.unmount()
    })

    it('finishes as completed from the last step', async () => {
        const wrapper = await mountSetup()
        await wrapper.get('[data-testid="talos-setup-name"]').setValue('Nino')
        await wrapper.get('[data-testid="talos-setup-next"]').trigger('click')
        await flushPromises()
        await wrapper.get('[data-testid="talos-setup-next"]').trigger('click')
        await flushPromises()
        // Nome → PIN → Modello, e poi l'autonomia.
        await wrapper.get('[data-testid="talos-setup-next"]').trigger('click')
        await flushPromises()
        // L'autonomia si passa DECIDENDO, che e' il punto della pagina: la
        // scelta avanza da sola, e «chiedimelo» e' una risposta legittima.
        await wrapper.get('[data-testid="talos-tool-permissions-all-ask"]').trigger('click')
        await wrapper.get('[data-testid="talos-setup-next"]').trigger('click')
        await flushPromises()
        // La scelta ha gia' portato al background, che e' l'ultima pagina:
        // da li' non c'e' un «avanti», c'e' il tasto per entrare.
        await wrapper.get('[data-testid="talos-intro-cta"]').trigger('click')
        expect(wrapper.emitted('close')).toEqual([['completed']])
        wrapper.unmount()
    })

    it('dice «non ora» solo dove si sta davvero saltando qualcosa', async () => {
        /**
         * Visto sul tablet il 2026-08-03, dove il PIN non c'e'. Finche i passi
         * erano tre, il ramo «non ora» copriva il solo PIN e la frase era
         * giusta: si salta la protezione. Con Modello, Autonomia e Background
         * il ramo e' diventato di tutti, e le pagine nuove offrivano «Non ora»
         * a chi non stava saltando niente.
         */
        const wrapper = await mountSetup()
        await wrapper.get('[data-testid="talos-setup-name"]').setValue('Nino')
        await wrapper.get('[data-testid="talos-setup-next"]').trigger('click')
        await flushPromises()
        // Sul PIN, senza PIN, «non ora» e' la parola giusta.
        expect(wrapper.get('[data-testid="talos-setup-next"]').text()).toBe('Not now')

        await wrapper.get('[data-testid="talos-setup-next"]').trigger('click')
        await flushPromises()
        // Sul modello no: si va avanti, non si rinuncia a nulla.
        expect(wrapper.get('[data-testid="talos-setup-next"]').text()).toBe('Next')

        await wrapper.get('[data-testid="talos-setup-next"]').trigger('click')
        await flushPromises()
        expect(wrapper.get('[data-testid="talos-setup-next"]').text()).toBe('Next')
        wrapper.unmount()
    })

    it('scrive negli STESSI tre permessi che leggono le Impostazioni', async () => {
        /**
         * Owner: «una pagina guidata per impostare i permessi dentro l'app».
         *
         * Guidata, non duplicata. I tre menu a tendina esistono gia' nel
         * pannello Strumenti agente; clonarli qui sarebbe una seconda casa per
         * la stessa impostazione — il difetto che stiamo togliendo altrove. La
         * pagina prende UNA decisione e la scrive dove sta gia', percio' questo
         * test guarda il magazzino e non lo schermo.
         */
        const wrapper = await mountSetup()
        await wrapper.get('[data-testid="talos-setup-name"]').setValue('Nino')
        for (let step = 0; step < 3; step += 1) {
            await wrapper.get('[data-testid="talos-setup-next"]').trigger('click')
            await flushPromises()
        }
        // Owner 2026-08-06: la pagina decide TUTTI i permessi in un colpo, ma
        // ora dice anche quali strumenti stanno dentro ciascuno. «Lascia fare
        // tutto» è il tasto in cima, e la scelta si conferma andando avanti.
        await wrapper.get('[data-testid="talos-tool-permissions-all-allow"]').trigger('click')
        await wrapper.get('[data-testid="talos-setup-next"]').trigger('click')
        await flushPromises()

        expect(state.toolPermissions).toEqual([{ read: 'allow', write: 'allow', outbound: 'allow' }])
        // E la scelta e' registrata COME scelta: «chiedimelo» sarebbe uguale al
        // predefinito, quindi senza questo elenco il passo non risulterebbe mai
        // fatto per chi sceglie la prudenza.
        expect(state.toolsChosen.sort()).toEqual(['outbound', 'read', 'write'])
        wrapper.unmount()
    })

    it('registra anche la prudenza come una decisione', async () => {
        const wrapper = await mountSetup()
        await wrapper.get('[data-testid="talos-setup-name"]').setValue('Nino')
        for (let step = 0; step < 3; step += 1) {
            await wrapper.get('[data-testid="talos-setup-next"]').trigger('click')
            await flushPromises()
        }
        await wrapper.get('[data-testid="talos-tool-permissions-all-ask"]').trigger('click')
        await wrapper.get('[data-testid="talos-setup-next"]').trigger('click')
        await flushPromises()

        expect(state.toolPermissions).toEqual([{ read: 'ask', write: 'ask', outbound: 'ask' }])
        expect(state.toolsChosen.sort()).toEqual(['outbound', 'read', 'write'])
        wrapper.unmount()
    })

    /**
     * ⛔⛔⭐ IL VERSO CONTRARIO — e senza di lui il difetto era invisibile.
     *
     * I due test qui sopra provano che TOCCARE la scheda registra una scelta.
     * Nessuno provava il contrario: passare oltre SENZA toccarla.
     *
     * E li' stava il difetto. La pagina scriveva tutti e tre i permessi premendo
     * «avanti», e `setToolPermissions` registra come SCELTA ogni azione che
     * riceve — giustamente. ⇒ Chiunque attraversasse l'introduzione senza
     * guardare gli interruttori usciva con tutte e tre le azioni «scelte», e da
     * quel momento `talosEffectiveToolPermissions` non poteva piu' aggiornargli
     * il default: restava congelato quello del giorno dell'installazione.
     *
     * ⛔ E' il difetto peggiore possibile qui, perche' colpisce chi ha l'app da
     * PIU' tempo: l'owner, misurando la sua il 2026-08-08, aveva ancora
     * `allow/allow/allow` mentre il codice diceva `ask` da una settimana.
     *
     * Owner 2026-08-09, regola d'oro: ogni funzione si prova anche al contrario.
     * Questo test e' quel contrario.
     */
    it('⛔ passare oltre SENZA toccare la scheda non e una scelta', async () => {
        const wrapper = await mountSetup()
        await wrapper.get('[data-testid="talos-setup-name"]').setValue('Nino')
        for (let step = 0; step < 3; step += 1) {
            await wrapper.get('[data-testid="talos-setup-next"]').trigger('click')
            await flushPromises()
        }
        // La scheda e' a schermo. Non la si tocca: si preme solo «avanti».
        await wrapper.get('[data-testid="talos-setup-next"]').trigger('click')
        await flushPromises()

        expect(state.toolPermissions).toEqual([])
        expect(state.toolsChosen).toEqual([])
        wrapper.unmount()
    })

    it('offre il background senza chiederlo da solo, e lascia passare', async () => {
        /**
         * Owner: «senza questa non possiamo andare avanti» — ma un onboarding
         * che non lascia passare e un onboarding che le persone disinstallano.
         * La pagina spiega, offre un pulsante, e il tasto avanti resta.
         */
        const permissions = await import('@/services/devicePermissions')
        const spy = vi.spyOn(permissions, 'requestTalosBatteryExemption')
        const wrapper = await mountSetup()
        await wrapper.get('[data-testid="talos-setup-name"]').setValue('Nino')
        await wrapper.get('[data-testid="talos-setup-next"]').trigger('click')
        await flushPromises()
        await wrapper.get('[data-testid="talos-setup-next"]').trigger('click')
        await flushPromises()
        await wrapper.get('[data-testid="talos-setup-next"]').trigger('click')
        await flushPromises()
        await wrapper.get('[data-testid="talos-tool-permissions-all-ask"]').trigger('click')
        await wrapper.get('[data-testid="talos-setup-next"]').trigger('click')
        await flushPromises()

        expect(wrapper.find('[data-testid="talos-setup-background"]').exists()).toBe(true)
        // Niente e stato chiesto al sistema per il solo fatto di essere arrivati
        // qui: la richiesta parte dal dito, come dice la guida di Android.
        expect(spy).not.toHaveBeenCalled()
        // E si puo chiudere senza concedere.
        expect(wrapper.find('[data-testid="talos-intro-cta"]').exists()).toBe(true)

        /*
         * ⭐ E NON C'E' SOLO IL BACKGROUND — owner 2026-08-16: «i permessi
         * devono essere completi, assicurati che ci siano anche quelli del
         * controllo del dispositivo, e skippabili».
         *
         * Il passo ne chiedeva UNO; gli altri nove esistevano solo in
         * Impostazioni, dove chi ha appena installato l'app non sa di dover
         * andare. La prima volta che il microfono serviva, la richiesta
         * arrivava a freddo in mezzo a un'altra cosa.
         *
         * ⛔ E il pannello e' QUELLO delle Impostazioni, non una copia: le
         * righe e i loro stati vivono in `permissionRows.ts` e cambiano, e due
         * schermate che li disegnano per conto loro divergono al primo cambio.
         */
        expect(wrapper.find('[data-testid="talos-setup-all-permissions"]').exists()).toBe(true)
        // ⛔ E nemmeno mostrarli chiede niente da solo.
        expect(spy).not.toHaveBeenCalled()
        wrapper.unmount()
    })

    it('asks the device for nothing at all', async () => {
        // Android is explicit: permissions are requested when the person invokes
        // the feature that needs them, never at first launch.
        const permissions = await import('@/services/devicePermissions')
        const spy = vi.spyOn(permissions, 'requestTalosNotifications')
        const mic = vi.spyOn(permissions, 'requestTalosMicrophone')
        const wrapper = await mountSetup()
        await wrapper.get('[data-testid="talos-setup-name"]').setValue('Nino')
        await wrapper.get('[data-testid="talos-setup-next"]').trigger('click')
        expect(spy).not.toHaveBeenCalled()
        expect(mic).not.toHaveBeenCalled()
        wrapper.unmount()
    })

    it('does not carry a single slide of marketing', async () => {
        const wrapper = await mountSetup()
        // What the owner called "molto fake": promises about things that do not
        // exist on this device yet.
        expect(wrapper.text()).not.toMatch(/roadmap/i)
        expect(wrapper.text()).not.toMatch(/step \d of 6/i)
        wrapper.unmount()
    })
})
