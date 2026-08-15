// @vitest-environment jsdom
/**
 * ⛔⛔ DALLA BARRA IL MODELLO NON SI CAMBIAVA — rilievo #9 dell'owner.
 *
 * ## Il difetto
 *
 * 12 agosto, provando i tool col motore locale: «per rifare la prova con Sonnet
 * 5 bisogna **uscire dall'assistente**, perché dalla barra il modello non si
 * cambia». E c'era la metà peggiore: chi parlava alla barra non sapeva nemmeno
 * **quale cervello stesse rispondendo** — quindi una risposta sbagliata non si
 * poteva attribuire al modello invece che all'app.
 *
 * ## ⛔ DOVE sta, e l'ha deciso l'owner
 *
 * La prima versione metteva un gettone sopra la pillola. Owner 2026-08-15: «lo
 * mettiamo in una sezione nel riquadro che si apre premendo il tasto più, sopra
 * i file della libreria, **così non occupiamo spazio nella pillola
 * assistente**». ⇒ Il percorso è `+` → riga «Modello» → elenco, e questi test
 * lo percorrono per intero: se qualcuno riporta la riga fuori dal riquadro,
 * falliscono.
 *
 * ## Ciò che questo file difende, e perché MONTA il componente
 *
 * Le altre prove della barra leggono il sorgente, perché difendono un ORDINE
 * (l'ascolto prima del database) che in jsdom non si osserva. Qui no: la cosa
 * da difendere è un ESITO, e ha quattro forme che una grep non distingue.
 *
 *   1. La riga porta il nome del modello **scelto davvero**, non una parola
 *      qualsiasi: con `selectedModelId` puntato a Haiku deve dire Haiku.
 *   2. Senza nessun modello configurato la riga **non c'è**: aprirebbe un
 *      elenco vuoto, cioè un comando che non fa niente.
 *   3. ⛔ Scegliere passa da `controller.selectModel`, che il controller stesso
 *      dichiara «l'UNICA porta che scrive `composer_model`». Chi un giorno
 *      scrivesse `selectedModelId.value = id` vedrebbe la riga cambiare e la
 *      CHAT restare com'era — il difetto tornerebbe travestito da cura, e solo
 *      questa asserzione lo prende.
 *   4. ⛔ La pillola resta com'era: fuori dal riquadro non compare niente di
 *      nuovo. È la richiesta dell'owner, ed è anche la forma a riposo misurata
 *      contro Gemini.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { computed, defineComponent, h, nextTick, reactive, ref } from 'vue'
import { mount } from '@vue/test-utils'

const selectModel = vi.fn(async () => {})
/*
 * ⛔ Gli allegati della barra, per la prova del pulsante invia: un array vero
 * che i test possono riempire, perche' `items` non e' un ref ma una lista letta
 * direttamente dal template.
 */
const allegatiFinti: Array<{ id: string, displayName: string }> = []
/** La porta d'uscita: se non viene chiamata, il pulsante e' morto. */
const inviato = vi.fn(async () => true)
const profiles = ref<Array<Record<string, unknown>>>([])
const selectedModelId = ref<string | null>(null)

/*
 * ⛔ Il controller è finto SOLO per i modelli: tutto il resto della barra (voce,
 * allegati, consensi) qui non serve e trascinarlo dentro renderebbe la prova
 * un test del mock. Ciò che conta è che la barra chieda l'elenco e la scelta a
 * QUESTE porte, con questi nomi.
 */
vi.mock('@/stores/chatController', () => ({
    useChatController: () => ({
        chat: {
            state: reactive({ streamingText: '', streaming: false, error: null }),
            activeSession: ref(null),
            messages: ref([]),
            streaming: ref(false),
            stopStreaming: vi.fn(),
            send: inviato,
        },
        profiles: computed(() => profiles.value),
        selectedModelId,
        selectModel,
        refreshingModels: computed(() => false),
        discoveryProblems: computed(() => []),
        refreshConfiguredProviders: vi.fn(async () => {}),
        pendingToolAuthorizations: ref([]),
        toolAuthorizationPromptVisible: ref(false),
        dismissToolAuthorization: vi.fn(),
        decideToolAuthorization: vi.fn(),
        attachments: {
            items: allegatiFinti,
            bindings: ref([]),
            vaultFiles: [],
            vaultLoading: ref(false),
            initialize: vi.fn(async () => {}),
            clearSent: vi.fn(),
            remove: vi.fn(),
            pickPhotos: vi.fn(),
            takePhoto: vi.fn(),
            selectFiles: vi.fn(),
            attachExisting: vi.fn(),
        },
        init: vi.fn(async () => {}),
        newSession: vi.fn(async () => {}),
    }),
}))

/**
 * Il pannello vero è un pezzo grande e pigro (è lo stesso della chat, e ha già i
 * suoi test). Qui conta solo che la barra glielo passi e ne ascolti la scelta —
 * quindi una controfigura che espone un bottone per profilo.
 */
const PannelloFinto = defineComponent({
    props: { modelProfiles: { type: Array, default: () => [] } },
    emits: ['selectModelProfile'],
    setup(props, { emit }) {
        return () => h('div', { 'data-testid': 'finto-pannello' },
            (props.modelProfiles as Array<{ id: string, display_name: string }>).map((p) =>
                h('button', {
                    'data-scelta': p.id,
                    onClick: () => emit('selectModelProfile', p.id),
                }, p.display_name)))
    },
})

function profilo(id: string, nome: string): Record<string, unknown> {
    return {
        id,
        display_name: nome,
        provider: 'anthropic',
        model: id,
        status: 'enabled',
        show_in_composer: true,
        capabilities: {},
    }
}

async function apriLaBarra() {
    const { default: TalosBarraRoot } = await import('@/components/barra/TalosBarraRoot.vue')
    const wrapper = mount(TalosBarraRoot, {
        props: { modo: { tipo: 'assistente', contesto: { nodi: 0, testo: '' } } as never },
        global: { stubs: { teleport: true, SceltaModello: PannelloFinto } },
    })
    await nextTick()
    return wrapper
}

/** Il `+`: la porta del riquadro, che è dove il modello vive adesso. */
async function apriIlRiquadro(barra: Awaited<ReturnType<typeof apriLaBarra>>) {
    await barra.find('[data-testid="talos-barra-allega"]').trigger('click')
    await nextTick()
    const riquadro = barra.find('[data-testid="talos-barra-menu-allegati"]')
    expect(riquadro.exists(), 'il `+` deve aprire il riquadro').toBe(true)
    return riquadro
}

describe('⛔ dalla barra il modello si vede e si cambia', () => {
    beforeEach(() => {
        selectModel.mockClear()
        selectedModelId.value = null
        profiles.value = []
    })

    it('la riga porta il nome del modello SCELTO, non un nome qualsiasi', async () => {
        profiles.value = [profilo('sonnet', 'Sonnet 5'), profilo('haiku', 'Haiku 4.5')]
        selectedModelId.value = 'haiku'
        const barra = await apriLaBarra()
        const riquadro = await apriIlRiquadro(barra)

        const riga = riquadro.find('[data-testid="talos-barra-modello"]')
        expect(riga.exists()).toBe(true)
        expect(riga.text()).toContain('Haiku 4.5')
        expect(riga.text()).not.toContain('Sonnet 5')
    })

    it('⛔ sta nel riquadro del `+`, SOPRA la Libreria — e non nella pillola', async () => {
        profiles.value = [profilo('haiku', 'Haiku 4.5')]
        selectedModelId.value = 'haiku'
        const barra = await apriLaBarra()

        // Chiuso il riquadro, la barra non mostra niente del modello: è la
        // richiesta dell'owner, «così non occupiamo spazio nella pillola».
        expect(barra.find('[data-testid="talos-barra-modello"]').exists()).toBe(false)

        /*
         * ⛔ L'ordine si legge sull'HTML e si ancora a due IDENTIFICATIVI, non
         * a due parole: le parole sono tradotte, e una prova che dipende dalla
         * lingua è una prova che si rompe il giorno in cui si cambia una
         * traduzione — o che passa per il motivo sbagliato.
         */
        const riquadro = await apriIlRiquadro(barra)
        const html = riquadro.html()
        const modello = html.indexOf('talos-barra-modello')
        const libreria = html.indexOf('talos-barra-libreria-vuota')
        expect(modello, 'la riga del modello deve stare nel riquadro').toBeGreaterThan(-1)
        expect(libreria, 'la sezione Libreria deve esserci').toBeGreaterThan(-1)
        expect(modello, 'il modello sta SOPRA i file della Libreria').toBeLessThan(libreria)
    })

    it('⛔ nessun modello configurato: NESSUNA riga, non una riga vuota', async () => {
        profiles.value = []
        const barra = await apriLaBarra()
        const riquadro = await apriIlRiquadro(barra)
        expect(riquadro.find('[data-testid="talos-barra-modello"]').exists()).toBe(false)
    })

    it('⛔ scegliere passa da selectModel — l\'unica porta che cambia anche la chat', async () => {
        profiles.value = [profilo('sonnet', 'Sonnet 5'), profilo('haiku', 'Haiku 4.5')]
        selectedModelId.value = 'haiku'
        const barra = await apriLaBarra()
        const riquadro = await apriIlRiquadro(barra)

        await riquadro.find('[data-testid="talos-barra-modello"]').trigger('click')
        await nextTick()
        const pannello = barra.find('[data-testid="talos-barra-menu-modello"]')
        expect(pannello.exists(), 'la riga deve aprire l\'elenco').toBe(true)
        // ⛔ E il riquadro si chiude: due pannelli sovrapposti sopra un'altra
        // app coprono ciò che la persona stava guardando.
        expect(barra.find('[data-testid="talos-barra-menu-allegati"]').exists()).toBe(false)

        await pannello.find('[data-scelta="sonnet"]').trigger('click')
        await nextTick()

        expect(selectModel).toHaveBeenCalledWith('sonnet')
        expect(barra.find('[data-testid="talos-barra-menu-modello"]').exists()).toBe(false)
    })
})


/**
 * ⛔⛔ UN ALLEGATO PRONTO E' GIA' QUALCOSA DA MANDARE — owner 2026-08-15.
 *
 * > «non c'e' un pulsante invia appena attach un file, resta il pulsante
 * > microfono, **non puoi non vederlo**»
 *
 * Aveva ragione, e si vedeva negli scatti che avevo appena guardato io: il
 * gettone `prova-talos.txt` sopra la pillola, e a destra il microfono. Avevo
 * verificato che il gettone COMPARISSE, non che si potesse **fare qualcosa** con
 * quel gettone.
 *
 * ⛔ E il difetto era DOPPIO, come sempre in questi casi: mostrare il pulsante
 * senza toccare `invia()` avrebbe lasciato un **pulsante morto** — quello usciva
 * subito se il testo era vuoto. Le due condizioni devono restare uguali, e
 * questi test le legano.
 */
describe("⛔ con un allegato, la barra sa di avere qualcosa da mandare", () => {
    beforeEach(() => {
        selectModel.mockClear()
        profiles.value = []
        allegatiFinti.length = 0
    })

    it("a mani vuote c'e' il microfono, non l'invio", async () => {
        const barra = await apriLaBarra()
        expect(barra.find('[data-testid="talos-barra-microfono"]').exists()).toBe(true)
        expect(barra.find('[data-testid="talos-barra-invia"]').exists()).toBe(false)
    })

    it("⛔ con un allegato e NESSUN testo, compare l'INVIO", async () => {
        allegatiFinti.push({ id: 'a1', displayName: 'prova-talos.txt' })
        const barra = await apriLaBarra()
        expect(
            barra.find('[data-testid="talos-barra-invia"]').exists(),
            "un file scelto e nessun modo di mandarlo: e' il difetto dell'owner",
        ).toBe(true)
        expect(barra.find('[data-testid="talos-barra-microfono"]').exists()).toBe(false)
    })

    /*
     * ⛔ La meta' che rende il pulsante VIVO. Un bottone che si vede e non fa
     * niente e' peggio di un bottone che non c'e': la persona lo preme, non
     * succede nulla, e conclude che l'app e' rotta.
     */
    it("⛔ e premerlo MANDA DAVVERO: niente pulsante morto", async () => {
        allegatiFinti.push({ id: 'a1', displayName: 'prova-talos.txt' })
        const barra = await apriLaBarra()
        await barra.find('form').trigger('submit')
        await nextTick()
        await nextTick()
        expect(inviato, 'invia() deve aver chiamato chat.send anche senza testo').toHaveBeenCalled()
    })
})
