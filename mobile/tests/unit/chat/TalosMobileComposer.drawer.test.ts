// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import TalosMobileComposer from '@/components/chat/TalosMobileComposer.vue'
import type { TalosMobileModelProfileView } from '@/components/chat/mobileChatTypes'

// F3-T4bis (owner #13, Claude screenshots): drawer mode = minimal bar
// ("+" / model chip / mic) with the tool controls in an organized bottom
// drawer. Classic mode stays byte-identical when the toggle is off.
const profile: TalosMobileModelProfileView = {
    id: 'profile-claude', provider: 'anthropic', model: 'claude-opus', display_name: 'Claude Opus',
    status: 'healthy', has_secret: true, effort_levels: ['low', 'medium', 'high'], supports_thinking: true,
    show_in_composer: true, capabilities: null, probe_ok: true,
}

function mountComposer(overrides: Record<string, unknown> = {}) {
    return mount(TalosMobileComposer, {
        global: { stubs: { teleport: true } },
        props: {
            prompt: '', modelProfiles: [profile], routingProfiles: [],
            selectedModelProfileId: profile.id, selectedRoutingProfileId: null,
            selectedEffort: 'high', thinking: false, canSend: true, sending: false,
            sendDisabledReason: '', dictationSupported: true,
            ...overrides,
        },
    })
}

describe('composer drawer mode (F3-T4bis)', () => {
    it('renders the minimal bar: add-to-chat, model chip, mic — no inline tool row', async () => {
        const wrapper = mountComposer({ drawerMode: true })
        expect(wrapper.find('[aria-label="Add to chat"]').exists()).toBe(true)
        const chip = wrapper.get('[data-testid="talos-composer-model-chip"]')
        expect(chip.text()).toContain('Claude Opus')
        expect(chip.text()).toContain('High')
        expect(wrapper.find('[aria-label="Dictate"]').exists()).toBe(true)
        for (const gone of ['Choose reasoning effort', 'Attach a file', 'Improve prompt', 'Toggle extended thinking']) {
            expect(wrapper.find(`[aria-label="${gone}"]`).exists()).toBe(false)
        }
    })

    it('anche con la vecchia forma classic apre allegati dal più e sforzo dal modello', async () => {
        const wrapper = mountComposer({ drawerMode: false })
        expect(wrapper.find('[aria-label="Add to chat"]').exists()).toBe(true)
        await wrapper.get('[aria-label="Add to chat"]').trigger('click')
        await vi.dynamicImportSettled()
        await flushPromises()
        await vi.dynamicImportSettled()
        expect(wrapper.find('[aria-label="Attach a file"]').exists()).toBe(true)
        expect(wrapper.find('[data-testid="talos-composer-model-chip"]').exists()).toBe(true)
    })

    it('opens the organized drawer from "+" and forwards the tool actions', async () => {
        const wrapper = mountComposer({ drawerMode: true })
        await wrapper.get('[aria-label="Add to chat"]').trigger('click')
        await vi.dynamicImportSettled()
        await flushPromises()
        await vi.waitFor(() => expect(wrapper.find('[data-testid="talos-composer-drawer"]').exists()).toBe(true))
        const drawer = wrapper.get('[data-testid="talos-composer-drawer"]')
        expect(drawer.text()).toContain('What do you want to do?')
        await drawer.get('[data-testid="talos-drawer-attach"]').trigger('click')
        expect(wrapper.emitted('attach')).toHaveLength(1)
        // the attach tile closes the drawer (single-shot action)
        await vi.waitFor(() => expect(wrapper.find('[data-testid="talos-composer-drawer"]').exists()).toBe(false))
    })

    /**
     * ⛔⛔⛔ Owner 6/9: "naviga sul web... non ha senso lì [nel drawer del +],
     * sparisce e basta" — sostituisce il test precedente, che verificava il
     * toggle proprio qui. Non spostato altrove: la modalità classica
     * (drawerMode:false, dropdown) tiene la sua copia del toggle, invariata
     * — resta l'unico modo di attivare la navigazione web quando il
     * composer è in drawer mode.
     */
    it('non mostra più il toggle "naviga sul web" nel drawer organizzato', async () => {
        const wrapper = mountComposer({ drawerMode: true })
        await wrapper.get('[aria-label="Add to chat"]').trigger('click')
        await vi.dynamicImportSettled()
        await flushPromises()
        await vi.waitFor(() => expect(wrapper.find('[data-testid="talos-composer-drawer"]').exists()).toBe(true))
        expect(wrapper.find('[data-testid="talos-drawer-browse"]').exists()).toBe(false)
    })

    /**
     * ⛔⛔ Owner 2026-08-27: il drawer "+" aveva la SUA implementazione a
     * bottoni per l'effort — mai passata al segmented slider
     * (`TalosMobileEffortPicker`) che il drawer "Model & reasoning" usa dal
     * refactor `b86bdd46`. Prima cura: farli condividere lo stesso
     * componente (questo test verificava proprio quello).
     *
     * ⛔⛔⛔ Owner 6/9, un passo oltre: "togli dal drawer del + la sezione
     * ragionamento/effort... non ha senso lì" — condividere il componente
     * non bastava, era comunque una SECONDA superficie per la stessa
     * scelta. Il drawer "+" ora non mostra affatto reasoning/effort: quella
     * scelta vive SOLO nel drawer dedicato "Model & reasoning" (verificato
     * poco sotto, "the model chip opens the dedicated model & reasoning
     * drawer").
     */
    it('il drawer "+" NON mostra reasoning/effort: quella scelta vive solo nel drawer "Model & reasoning"', async () => {
        const wrapper = mountComposer({ drawerMode: true })
        await wrapper.get('[aria-label="Add to chat"]').trigger('click')
        await vi.dynamicImportSettled()
        await flushPromises()
        await vi.waitFor(() => expect(wrapper.find('[data-testid="talos-composer-drawer"]').exists()).toBe(true))
        expect(wrapper.find('[data-testid="talos-mobile-effort-picker"]').exists()).toBe(false)
        expect(wrapper.find('[data-testid="talos-mobile-effort-slider"]').exists()).toBe(false)
        expect(wrapper.find('[data-testid="talos-mobile-thinking-toggle"]').exists()).toBe(false)
        // I vecchi bottoni propri del drawer non esistono più da tempo.
        expect(wrapper.find('[data-testid="talos-drawer-thinking"]').exists()).toBe(false)
        expect(wrapper.find('[data-testid^="talos-drawer-effort-"]').exists()).toBe(false)
    })

    it('the model chip opens the dedicated model & reasoning drawer', async () => {
        const wrapper = mountComposer({ drawerMode: true })
        await wrapper.get('[data-testid="talos-composer-model-chip"]').trigger('click')
        await vi.waitFor(() => expect(wrapper.find('[data-testid="talos-model-drawer"]').exists()).toBe(true))
        expect(wrapper.find('[data-testid="talos-mobile-composer-model-picker"]').exists()).toBe(true)
        expect(wrapper.find('[data-testid="talos-mobile-effort-picker"]').exists()).toBe(true)
    })

    /**
     * ⭐⭐⭐ 2/9 — picker Planner (piano §15.6, K): la sezione "esecutore" è
     * additiva e SPENTA per costruzione quando `showExecutorModel` non è
     * passata — il caso di ChatScreen.vue/ogni altro chiamante esistente,
     * mai toccato da questa feature.
     */
    it('EXECUTOR-MODEL-01 hides the executor section when the caller never asked for it (regular chat, unchanged)', async () => {
        const wrapper = mountComposer({ drawerMode: true })
        await wrapper.get('[data-testid="talos-composer-model-chip"]').trigger('click')
        await vi.waitFor(() => expect(wrapper.find('[data-testid="talos-model-drawer"]').exists()).toBe(true))
        expect(wrapper.find('[data-testid="talos-executor-model-section"]').exists()).toBe(false)
    })

    it('EXECUTOR-MODEL-02 lets a caller that opts in pick an executor model independently of the main one', async () => {
        const executorProfile: TalosMobileModelProfileView = {
            id: 'profile-flash', provider: 'openrouter', model: 'z-ai/glm-4.7-flash', display_name: 'GLM 4.7 Flash',
            status: 'healthy', has_secret: true, effort_levels: [], supports_thinking: false,
            show_in_composer: true, capabilities: null, probe_ok: true,
        }
        const wrapper = mountComposer({
            drawerMode: true,
            showExecutorModel: true,
            executorModelProfiles: [profile, executorProfile],
            selectedExecutorModelProfileId: null,
        })
        await wrapper.get('[data-testid="talos-composer-model-chip"]').trigger('click')
        await vi.waitFor(() => expect(wrapper.find('[data-testid="talos-model-drawer"]').exists()).toBe(true))

        const section = wrapper.get('[data-testid="talos-executor-model-section"]')
        // "Automatico" is the honest default: checked, nothing chosen yet.
        const automatic = section.get('[data-testid="talos-executor-model-automatic"]')
        expect(automatic.attributes('aria-pressed')).toBe('true')

        const executorRow = section.get(`[data-model-profile-id="${executorProfile.id}"]`)
        await executorRow.trigger('click')
        expect(wrapper.emitted('selectExecutorModelProfile')).toEqual([[executorProfile.id]])
        // AL CONTRARIO: the MAIN model picker is untouched by that click — two independent choices, not one list feeding both.
        expect(wrapper.emitted('selectModelProfile')).toBeUndefined()

        await automatic.trigger('click')
        expect(wrapper.emitted('selectExecutorModelProfile')).toEqual([[executorProfile.id], [null]])
    })

    it('P1-CTX-UI-04 opens one-turn Library controls from a compact source chip', async () => {
        const wrapper = mountComposer({
            drawerMode: true,
            libraryContextEnabled: true,
            libraryContextMode: 'smart_relevant_v1',
            librarySourceCount: 1,
            libraryTurnOverride: null,
            libraryFiles: [{
                id: 'vault-brief',
                display_name: 'Brief.md',
                media_type: 'text/markdown',
                size_bytes: 128,
                private_uri: 'talos-vault/files/vault-brief',
                status: 'available',
                trust: 'untrusted',
                sha256: 'a'.repeat(64),
                extracted_text: 'brief',
                failure_code: null,
                metadata: { origin: 'uploaded', library_shared: true },
                created_at: '2026-07-29T12:00:00.000Z',
                updated_at: '2026-07-29T12:00:00.000Z',
            }],
        })

        const chip = wrapper.get('[data-testid="talos-composer-library-chip"]')
        expect(chip.text()).toMatch(/Relevant sources only.*1 source/i)
        /**
         * Owner 2026-07-29: "fai in modo che sia solo un icona nella pill, il
         * Testo solo per i display grandi tipo tablet."
         *
         * On a phone this row holds the plus, the model chip and this one, and
         * three labels compete for width that does not exist — the model name,
         * the thing you actually need to read, is what gets truncated. The icon
         * stays; the words wait for room.
         *
         * `md:` is 768px, which is exactly TALOS_TABLET_WIDTH_MEDIA_QUERY, so
         * the visual breakpoint and the app's own definition of a tablet cannot
         * drift apart.
         */
        /**
         * ⛔ Aggiornato il 2026-09-13: l'owner ha chiesto la pillola del
         * contesto SOLO ICONA, accanto a quella del modello, a ogni larghezza.
         * Le parole non spariscono: restano in sr-only e nel nome accessibile,
         * quindi chi ascolta lo schermo sente ancora modo e numero di fonti.
         */
        const chipLabel = wrapper.get('[data-testid="talos-composer-library-chip-label"]')
        expect(chipLabel.classes()).toContain('sr-only')
        // The icon is never hidden: on a phone it is all that remains.
        expect(chip.find('svg').exists()).toBe(true)
        // And the accessible name still carries the whole meaning.
        expect(chip.attributes('aria-label')).toBeTruthy()
        await chip.trigger('click')
        await vi.waitFor(() => {
            expect(wrapper.find('[data-testid="talos-library-context-sheet"]').exists()).toBe(true)
        })

        await wrapper.get('[data-testid="talos-library-turn-include-vault-brief"]').trigger('click')
        expect(wrapper.emitted('updateLibraryTurnOverride')?.at(-1)).toEqual([{
            included_file_ids: ['vault-brief'],
            excluded_file_ids: [],
        }])
    })
})

// Owner 2026-07-24 — immersive composer (compact→expand) and the "+" dropdown.
describe('composer immersive + plus-dropdown (owner 2026-07-24)', () => {
    it('MOTION-COMPOSER-01/02 Calm mantiene geometria e focus senza collasso', async () => {
        const wrapper = mountComposer({ drawerMode: true, immersiveComposer: true, prompt: '' })
        document.body.appendChild(wrapper.element)
        const surface = wrapper.get<HTMLElement>('[data-testid="talos-mobile-composer"]')
        const field = wrapper.get<HTMLTextAreaElement>('textarea')
        surface.element.style.setProperty('--talos-motion-duration-composer-expand', '180ms')
        surface.element.style.setProperty('--talos-motion-duration-composer-collapse', '150ms')
        vi.spyOn(surface.element, 'offsetHeight', 'get').mockImplementation(
            () => wrapper.find('[data-testid="talos-composer-model-chip"]').exists() ? 100 : 50,
        )

        field.element.focus()
        await flushPromises()
        expect(document.activeElement).toBe(field.element)
        expect(surface.attributes('data-talos-motion-intent')).toBeUndefined()
        expect(surface.element.style.getPropertyValue('--talos-composer-layout-shift')).toBe('')

        surface.element.dispatchEvent(new Event('animationend', { bubbles: true }))
        await nextTick()
        expect(surface.attributes('data-talos-motion-intent')).toBeUndefined()
        expect(surface.element.style.getPropertyValue('--talos-composer-layout-shift')).toBe('')

        field.element.blur()
        await flushPromises()
        expect(document.activeElement).not.toBe(field.element)
        expect(surface.attributes('data-talos-motion-intent')).toBeUndefined()
        expect(surface.element.style.getPropertyValue('--talos-composer-layout-shift')).toBe('')

        wrapper.unmount()
        document.body.replaceChildren()
    })

    it('MOTION-COMPOSER-03 focus e blur rapidi non nascondono comandi', async () => {
        const wrapper = mountComposer({ drawerMode: true, immersiveComposer: true, prompt: '' })
        document.body.appendChild(wrapper.element)
        const surface = wrapper.get<HTMLElement>('[data-testid="talos-mobile-composer"]')
        const field = wrapper.get<HTMLTextAreaElement>('textarea')
        surface.element.style.setProperty('--talos-motion-duration-composer-expand', '180ms')
        surface.element.style.setProperty('--talos-motion-duration-composer-collapse', '150ms')
        vi.spyOn(surface.element, 'offsetHeight', 'get').mockImplementation(
            () => wrapper.find('[data-testid="talos-composer-model-chip"]').exists() ? 100 : 50,
        )

        await wrapper.get('textarea').trigger('focus')
        await nextTick()
        await wrapper.get('textarea').trigger('blur')
        await flushPromises()

        expect(surface.attributes('data-talos-motion-intent')).not.toBe('composer-expand')
        // ⛔ 13/09: i comandi che NON devono sparire sono il «+» e il microfono —
        // stanno accanto al campo e restano. La pillola del modello invece torna
        // al fuoco: e' il senso della forma compatta, «una riga a riposo».
        expect(wrapper.find('[aria-label="Add to chat"]').exists()).toBe(true)
        expect(wrapper.find('[aria-label="Dictate"]').exists()).toBe(true)
        expect(field.element).toBeTruthy()

        wrapper.unmount()
        document.body.replaceChildren()
    })
    /**
     * ⛔⛔ RADDRIZZATA il 13/09. Questa guardia portava il commento «compact: no
     * model chip row» e poi PRETENDEVA che la pillola del modello esistesse a
     * campo vuoto. Commento e asserzione dicevano il contrario, e cosi' la
     * sparizione della forma compatta (12/09) e' passata inosservata per un
     * giorno: il test era verde MENTRE il difetto era a schermo.
     */
    it('legacy immersive: a riposo una riga sola, e al fuoco tornano gli strumenti', async () => {
        const wrapper = mountComposer({ drawerMode: true, immersiveComposer: true, prompt: '' })
        // a riposo: niente riga strumenti
        expect(wrapper.find('[data-testid="talos-composer-model-chip"]').exists()).toBe(false)
        // ma i due comandi accanto al campo restano SEMPRE
        expect(wrapper.find('[aria-label="Add to chat"]').exists()).toBe(true)
        expect(wrapper.find('[aria-label="Dictate"]').exists()).toBe(true)

        await wrapper.get('textarea').trigger('focus')
        expect(wrapper.find('[data-testid="talos-composer-model-chip"]').exists()).toBe(true)

        await wrapper.get('textarea').trigger('blur')
        expect(wrapper.find('[data-testid="talos-composer-model-chip"]').exists()).toBe(false)
    })
    it('CODE-COMPOSER-LANDSCAPE-IME-SAFE-01 reflows the same component below the status bar without runtime branching', async () => {
        const source = (await import('@/components/chat/TalosMobileComposer.vue?raw')).default

        expect(source).toContain('@media (orientation: landscape) and (max-height: 180px)')
        expect(source).toMatch(/max-height:\s*calc\(100dvh - env\(safe-area-inset-top\)\)/)
        expect(source).toMatch(/textarea\s*\{[^}]*height:\s*48px !important/s)
        expect(source).not.toContain('display: none')
        expect(source).not.toContain('display: none')
        expect(source).toMatch(/overflow-y:\s*auto/)
        expect(source).not.toContain('useTalosMediaQuery')
    })

    it('immersive: stays expanded when there is content (never collapses over a draft)', async () => {
        const wrapper = mountComposer({ drawerMode: true, immersiveComposer: true, prompt: 'hello' })
        expect(wrapper.find('[data-testid="talos-composer-model-chip"]').exists()).toBe(true)
    })

    it('immersive OFF keeps the bar always visible', async () => {
        const wrapper = mountComposer({ drawerMode: true, immersiveComposer: false, prompt: '' })
        expect(wrapper.find('[data-testid="talos-composer-model-chip"]').exists()).toBe(true)
    })

    it('legacy plus-dropdown: il più apre il foglio e allega chiudendolo', async () => {
        const wrapper = mountComposer({ drawerMode: true, plusDropdown: true })
        await wrapper.get('[aria-label="Add to chat"]').trigger('click')
        await vi.dynamicImportSettled()
        await flushPromises()
        expect(wrapper.find('[data-testid="talos-composer-drawer"]').exists()).toBe(true)
        await wrapper.get('[data-testid="talos-drawer-attach"]').trigger('click')
        expect(wrapper.emitted('attach')).toHaveLength(1)
        expect(wrapper.find('[data-testid="talos-composer-drawer"]').exists()).toBe(false)
    })

    it('plus-dropdown OFF: "+" opens the bottom drawer as before', async () => {
        const wrapper = mountComposer({ drawerMode: true, plusDropdown: false })
        await wrapper.get('[aria-label="Add to chat"]').trigger('click')
        await vi.dynamicImportSettled()
        await flushPromises()
        expect(wrapper.find('[data-testid="talos-composer-drawer"]').exists()).toBe(true)
        await vi.waitFor(() => expect(wrapper.find('[data-testid="talos-composer-drawer"]').exists()).toBe(true))
    })

    // Owner device feedback: the compact immersive pill must be [+] input [mic]
    // [send] on one line — + and mic must NOT disappear in the compact state.
    // Owner device feedback: the compact immersive pill must be [+] input [mic]
    // on one line — + and mic must NOT disappear in the compact state.
    // ⛔ 13/09: la terza asserzione era CAPOVOLTA rispetto al proprio commento
    // («the model chip only appears once expanded») e pretendeva il contrario.
    it('legacy compact: più e microfono restano, il modello no, a campo vuoto', async () => {
        const wrapper = mountComposer({ drawerMode: true, immersiveComposer: true, prompt: '' })
        expect(wrapper.find('[aria-label="Add to chat"]').exists()).toBe(true)
        expect(wrapper.find('[aria-label="Dictate"]').exists()).toBe(true)
        // the model chip only appears once expanded (on focus/content)
        expect(wrapper.find('[data-testid="talos-composer-model-chip"]').exists()).toBe(false)
        // …e con del testo la riga torna, senza bisogno del fuoco
        const conTesto = mountComposer({ drawerMode: true, immersiveComposer: true, prompt: 'ciao' })
        expect(conTesto.find('[data-testid="talos-composer-model-chip"]').exists()).toBe(true)
    })
    // Owner device bug: tapping "+" blurred the field and dismissed the keyboard.
    // The tap must cancel the pointerdown (Android WebView blurs on pointerdown,
    // before any mousedown handler could run).
    it('immersive compact: tapping "+" cancels the pointerdown so the field keeps focus', async () => {
        const wrapper = mountComposer({ drawerMode: true, immersiveComposer: true, prompt: '' })
        const ev = new Event('pointerdown', { bubbles: true, cancelable: true })
        wrapper.get('[aria-label="Add to chat"]').element.dispatchEvent(ev)
        expect(ev.defaultPrevented).toBe(true)
    })

    // SF-critic fix: aria must describe the surface the "+" actually opens.
    it('il più annuncia un dialogo con entrambe le preferenze precedenti', async () => {
        const on = mountComposer({ drawerMode: true, plusDropdown: true })
        expect(on.get('[aria-label="Add to chat"]').attributes('aria-haspopup')).toBe('dialog')
        const off = mountComposer({ drawerMode: true, plusDropdown: false })
        expect(off.get('[aria-label="Add to chat"]').attributes('aria-haspopup')).toBe('dialog')
    })

    // Global review (test axis): duplicate mics with the SAME accessible name
    // shipped in R21 — the morphing right button plus a second one in each
    // control row. One control per label, in every mode.
    it.each([
        ['drawer', { drawerMode: true }],
        ['classic', { drawerMode: false }],
        ['immersive', { drawerMode: true, immersiveComposer: true }],
    ])('exposes exactly one dictation control in %s mode', (_mode, overrides) => {
        const wrapper = mountComposer({ ...overrides, dictationSupported: true, prompt: '' })
        expect(wrapper.findAll('[aria-label="Dictate"]')).toHaveLength(1)
    })

    // Re-review 2026-07-25: the previous version PERMITTED two controls sharing
    // the name ("right button + live pill"), rubber-stamping the duplication it
    // was meant to catch. Exactly one control may be named "Stop dictation";
    // the pill's own control is "Cancel dictation".
    it('exposes exactly one Stop-dictation control while listening', async () => {
        /*
         * ⛔ IL PUNTO DI QUESTO CASO ERA «UNO SOLO», non «esiste».
         *
         * Il difetto che difendeva: due comandi di stop contemporanei, uno
         * nella barra e uno nel compositore. Dal 2026-08-10 la barra e' un
         * componente caricato al bisogno, quindi il compositore non puo' piu'
         * averne uno suo — e la difesa diventa esattamente questa: mentre si
         * detta, il compositore non disegna NESSUN comando di dettatura, cosi'
         * il solo che esiste e' quello della barra (provato in
         * `barraDettatura.test.ts`).
         */
        /*
         * ⛔⛔ 2026-09-13 — QUESTA GUARDIA ERA STATA SVUOTATA, E IL DIFETTO E'
         * ARRIVATO SULLO SCHERMO DELL'OWNER.
         *
         * Il commento qui sopra diceva gia' la cosa giusta — «il compositore
         * non disegna NESSUN comando di dettatura» — ma l'asserzione sotto
         * pretendeva l'opposto, cioe' che `talos-composer-action` esistesse e
         * si chiamasse «Stop dictation». Qualcuno l'aveva adattata alla forma
         * del compositore Calm senza toccare l'INTENTO, e da quel momento il
         * caso non difendeva piu' niente: passava sia con un comando che con
         * due.
         *
         * Il 13/09, spostando il comando accanto al campo, i due stop sono
         * tornati davvero: quello della barra e il tondo accento del
         * compositore, quest'ultimo da solo su una riga vuota. Questo test era
         * verde.
         *
         * ⇒ Ora asserisce cio' che il suo nome promette: mentre si detta, nel
         * compositore non c'e' NESSUN comando di dettatura ne' il campo. Il
         * solo stop che esiste e' quello della barra, provato in
         * `barraDettatura.test.ts`.
         */
        const wrapper = mountComposer({ drawerMode: true, dictationSupported: true, dictationListening: true })
        await flushPromises()
        expect(wrapper.findAll('[data-testid="talos-composer-action"]')).toHaveLength(0)
        expect(wrapper.findAll('[aria-label="Stop dictation"]')).toHaveLength(0)
        expect(wrapper.findAll('[aria-label="Dictate"]')).toHaveLength(0)
        expect(wrapper.findAll('textarea')).toHaveLength(0)
        expect(wrapper.findAll('.talos-composer-field-row')).toHaveLength(0)
    })

    // Owner device 2026-07-25: the mic was "extremely hard" to start. Root cause:
    // in compact the right button is vertically centred; tapping it focused the
    // textarea, the pill EXPANDED, and the button moved away before the click
    // resolved. The press must not steal focus, and activating the mic must
    // actively blur so the keyboard gets out of the way for speech.
    it('the right button does not steal focus (no layout shift mid-tap)', async () => {
        const wrapper = mountComposer({ drawerMode: true, immersiveComposer: true, dictationSupported: true, prompt: '' })
        const ev = new Event('pointerdown', { bubbles: true, cancelable: true })
        wrapper.get('[aria-label="Dictate"]').element.dispatchEvent(ev)
        expect(ev.defaultPrevented).toBe(true)
    })

    it('starting dictation blurs the composer so the keyboard yields', async () => {
        const wrapper = mountComposer({ drawerMode: true, dictationSupported: true, prompt: '' })
        const field = wrapper.get('textarea').element as HTMLTextAreaElement
        field.focus()
        await wrapper.get('[aria-label="Dictate"]').trigger('click')
        expect(wrapper.emitted('toggleDictation')).toHaveLength(1)
        expect(document.activeElement).not.toBe(field)
    })

    it('legacy plus-dropdown: Escape chiude il foglio', async () => {
        const wrapper = mountComposer({ drawerMode: true, plusDropdown: true })
        await wrapper.get('[aria-label="Add to chat"]').trigger('click')
        await vi.dynamicImportSettled()
        await flushPromises()
        expect(wrapper.find('[data-testid="talos-composer-drawer"]').exists()).toBe(true)
        await wrapper.get('[data-testid="talos-composer-drawer"]').trigger('keydown.escape')
        await vi.waitFor(() => expect(wrapper.find('[data-testid="talos-composer-drawer"]').exists()).toBe(false))
    })
})

// F4-#20 — the enhancer must never present a mute disabled control on touch
// (title tooltips do not exist there): the control stays tappable and a tap
// with missing prerequisites emits the REASON for the UI to surface.
describe('enhancer visible reason (F4-#20)', () => {
    it('drawer row stays tappable with an empty prompt and explains itself', async () => {
        const wrapper = mountComposer({ drawerMode: true })
        await wrapper.get('[aria-label="Add to chat"]').trigger('click')
        await vi.dynamicImportSettled()
        await flushPromises()
        await vi.waitFor(() => expect(wrapper.find('[data-testid="talos-drawer-tab-create"]').exists()).toBe(true))
        await wrapper.get('[data-testid="talos-drawer-tab-create"]').trigger('click')
        const row = wrapper.get('[data-testid="talos-drawer-enhance"]')
        expect(row.attributes('disabled')).toBeUndefined()
        expect(row.text()).toContain('Write a message first')
        await row.trigger('click')
        expect(wrapper.emitted('enhancePrompt')).toBeUndefined()
        const blocked = wrapper.emitted('enhanceBlocked')
        expect(blocked).toHaveLength(1)
        expect(String(blocked![0][0])).toContain('Write a message first')
    })

    it('la voce del cassetto APRE il pannello, e la spesa parte quando si risponde', async () => {
        /**
         * Decisione cambiata 2026-08-04. Owner: «prima che parta l'enhancing
         * bisogna selezionare modello e ragionamento ove previsto, e il tono».
         *
         * Prima il tocco faceva partire la chiamata: chi voleva un modello
         * diverso scopriva di non poterlo scegliere mentre il conto correva.
         */
        const wrapper = mountComposer({ drawerMode: true, prompt: 'Migliora questo testo' })
        await wrapper.get('[aria-label="Add to chat"]').trigger('click')
        await vi.dynamicImportSettled()
        await flushPromises()
        await vi.waitFor(() => expect(wrapper.find('[data-testid="talos-drawer-tab-create"]').exists()).toBe(true))
        await wrapper.get('[data-testid="talos-drawer-tab-create"]').trigger('click')
        await wrapper.get('[data-testid="talos-drawer-enhance"]').trigger('click')

        expect(wrapper.emitted('enhanceBlocked')).toBeUndefined()
        // Niente e' ancora partito.
        expect(wrapper.emitted('enhancePrompt')).toBeUndefined()

        await vi.waitFor(() => expect(wrapper.find('[data-testid="talos-enhancer-setup"]').exists()).toBe(true))
        await wrapper.get('[data-testid="talos-enhancer-start"]').trigger('click')
        expect(wrapper.emitted('enhancePrompt')).toHaveLength(1)
    })

    it('classic wand stays tappable with an empty prompt and reports the reason', async () => {
        const wrapper = mountComposer({ drawerMode: false })
        await wrapper.get('[aria-label="Add to chat"]').trigger('click')
        await vi.dynamicImportSettled()
        await flushPromises()
        await wrapper.get('[data-testid="talos-drawer-tab-create"]').trigger('click')
        const wand = wrapper.get('[data-testid="talos-drawer-enhance"]')
        expect(wand.attributes('disabled')).toBeUndefined()
        await wand.trigger('click')
        expect(wrapper.emitted('enhancePrompt')).toBeUndefined()
        expect(wrapper.emitted('enhanceBlocked')).toHaveLength(1)
    })

    it('classic wand reports the model reason when no model is callable', async () => {
        const wrapper = mountComposer({
            drawerMode: false, prompt: 'Testo', modelProfiles: [], selectedModelProfileId: null,
        })
        await wrapper.get('[aria-label="Add to chat"]').trigger('click')
        await vi.dynamicImportSettled()
        await flushPromises()
        await wrapper.get('[data-testid="talos-drawer-tab-create"]').trigger('click')
        await wrapper.get('[data-testid="talos-drawer-enhance"]').trigger('click')
        const blocked = wrapper.emitted('enhanceBlocked')
        expect(blocked).toHaveLength(1)
        expect(String(blocked![0][0]).toLowerCase()).toContain('model')
    })
})

// 12/09: il foglio «+» sul mockup «Cosa vuoi fare?» — categorie, ricerca, voci vere.
describe('foglio «+» sul mockup (categorie, ricerca, voci)', () => {
    async function apri(overrides: Record<string, unknown> = {}) {
        const wrapper = mountComposer({ drawerMode: true, ...overrides })
        await wrapper.get('[aria-label="Add to chat"]').trigger('click')
        await vi.dynamicImportSettled()
        await flushPromises()
        await vi.waitFor(() => expect(wrapper.find('[data-testid="talos-drawer-tab-attach"]').exists()).toBe(true))
        return wrapper
    }

    it('apre su Allega e cambia categoria con le schede (aria-selected e pannello)', async () => {
        const wrapper = await apri()
        expect(wrapper.get('[data-testid="talos-drawer-tab-attach"]').attributes('aria-selected')).toBe('true')
        expect(wrapper.find('[data-testid="talos-drawer-attach"]').exists()).toBe(true)
        expect(wrapper.find('[data-testid="talos-drawer-preset-slides"]').exists()).toBe(false)
        await wrapper.get('[data-testid="talos-drawer-tab-create"]').trigger('click')
        expect(wrapper.get('[data-testid="talos-drawer-tab-create"]').attributes('aria-selected')).toBe('true')
        expect(wrapper.get('[data-testid="talos-drawer-tab-attach"]').attributes('aria-selected')).toBe('false')
        expect(wrapper.find('[data-testid="talos-drawer-preset-slides"]').exists()).toBe(true)
        expect(wrapper.find('[data-testid="talos-drawer-attach"]').exists()).toBe(false)
        // il riquadro acceso sta nella scheda scelta
        expect(wrapper.find('[data-testid="talos-drawer-tab-create"] [data-talos-indicator]').exists()).toBe(true)
        expect(wrapper.find('[data-testid="talos-drawer-tab-attach"] [data-talos-indicator]').exists()).toBe(false)
    })

    it('le frecce spostano la scheda attiva (APG tabs, attivazione automatica)', async () => {
        const wrapper = await apri()
        await wrapper.get('[data-testid="talos-drawer-tab-attach"]').trigger('keydown', { key: 'ArrowRight' })
        expect(wrapper.get('[data-testid="talos-drawer-tab-create"]').attributes('aria-selected')).toBe('true')
        await wrapper.get('[data-testid="talos-drawer-tab-create"]').trigger('keydown', { key: 'ArrowLeft' })
        expect(wrapper.get('[data-testid="talos-drawer-tab-attach"]').attributes('aria-selected')).toBe('true')
    })

    it('la ricerca guarda tutte le categorie e nasconde le schede', async () => {
        const wrapper = await apri()
        await wrapper.get('[data-testid="talos-drawer-search"]').setValue('memor')
        expect(wrapper.find('[data-testid="talos-drawer-tab-attach"]').exists()).toBe(false)
        expect(wrapper.find('[data-testid="talos-drawer-memory-new"]').exists()).toBe(true)
        expect(wrapper.find('[data-testid="talos-drawer-attach"]').exists()).toBe(false)
    })

    it('«Crea presentazione» precompila (preset) e chiude il foglio', async () => {
        const wrapper = await apri()
        await wrapper.get('[data-testid="talos-drawer-tab-create"]').trigger('click')
        await wrapper.get('[data-testid="talos-drawer-preset-slides"]').trigger('click')
        expect(wrapper.emitted('preset')).toEqual([['slides']])
        await flushPromises()
        expect(wrapper.find('[data-testid="talos-composer-drawer"]').exists()).toBe(false)
    })

    it('«Nuova nota» naviga alla stazione; «Strumenti del modello» è un interruttore', async () => {
        const wrapper = await apri({ agentToolsEnabled: true })
        await wrapper.get('[data-testid="talos-drawer-tab-tools"]').trigger('click')
        expect(wrapper.get('[data-testid="talos-drawer-note-new"]').text()).toContain('New note')
        await wrapper.get('[data-testid="talos-drawer-note-new"]').trigger('click')
        expect(wrapper.emitted('navigate')).toEqual([['note-new']])

        const w2 = await apri({ agentToolsEnabled: true })
        await w2.get('[data-testid="talos-drawer-tab-agent"]').trigger('click')
        const sw = w2.get('[data-testid="talos-drawer-agent-tools"]')
        expect(sw.attributes('role')).toBe('switch')
        expect(sw.attributes('aria-checked')).toBe('true')
        await sw.trigger('click')
        expect(w2.emitted('setAgentToolsEnabled')).toEqual([[false]])
    })

    it('Codice compare sotto Agente solo dove il ponte c’è', async () => {
        const senza = await apri()
        await senza.get('[data-testid="talos-drawer-tab-agent"]').trigger('click')
        expect(senza.find('[data-testid="talos-drawer-harness"]').exists()).toBe(false)
        const con = await apri({ harnessAvailable: true })
        await con.get('[data-testid="talos-drawer-tab-agent"]').trigger('click')
        expect(con.find('[data-testid="talos-drawer-harness"]').exists()).toBe(true)
    })
})
