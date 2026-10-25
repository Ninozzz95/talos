// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

const writeText = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
vi.mock('@/services/clipboard', () => ({ writeTalosClipboardText: writeText }))

// R1-5: the streaming/typing tail reads the chat store directly.
vi.mock('@/stores/chatController', () => ({
    useChatController: () => ({
        chat: {
            state: { sending: true, streamingText: null, streamingSessionId: 's1' },
            // The live reply belongs to a conversation now; without an active
            // session the component renders nothing at all.
            activeSession: { value: { id: 's1', title: 'A' } },
        },
        toolActivity: { value: [] as Array<{ name: string; detail: string | null }> },
    }),
}))

import TalosMobileMessageList from '@/components/chat/TalosMobileMessageList.vue'
import type { TalosMobileMessageView } from '@/components/chat/mobileChatTypes'

const messages: TalosMobileMessageView[] = [
    {
        id: 'user-1', role: 'user', content: 'Explain this', state: 'persisted',
        created_at: '2026-07-22T12:00:00.000Z', model_profile_id: 'deepseek:deepseek-chat',
        run_id: null, metadata: {},
        attachments: [{
            id: 'binding-1',
            vault_file_id: 'vault-1',
            grant_id: 'grant-1',
            display_name: 'architecture.pdf',
            media_type: 'application/pdf',
            size_bytes: 4096,
            permissions: ['browser.upload', 'model.read'],
            grant_status: 'active',
        }],
    },
    {
        id: 'assistant-1', role: 'assistant', content: '## Answer\n\nSafe.', state: 'persisted',
        created_at: '2026-07-22T12:00:01.000Z', model_profile_id: 'deepseek:deepseek-chat',
        run_id: 'run-1', metadata: {},
        browserActivities: [{
            id: 'tool-1', operation: 'navigate', status: 'succeeded',
            occurred_at: '2026-07-22T12:00:01.000Z', failure_code: null,
            evidence: {
                contract: 'talos.mobile.browser.evidence.v1', source: 'manual_local',
                activity: {
                    id: 'activity-1', operation: 'navigate', status: 'succeeded',
                    label: 'Opened page in isolated browser', run_id: 'run-1',
                    browser_session_id: 'manual-1', artifact_ids: [],
                    occurred_at: '2026-07-22T12:00:01.000Z',
                },
                artifacts: [], snapshot: null, retry: null,
            },
        }],
    },
    {
        id: 'system-1', role: 'system', content: 'Rate limit.', state: 'failed',
        created_at: '2026-07-22T12:00:02.000Z', model_profile_id: 'deepseek:deepseek-chat',
        run_id: null, metadata: { chat_error: {
            layer: 'provider', code: 'PROVIDER_HTTP_429', message: 'Rate limit.', retryable: true,
        } },
    },
]

const persistedReasoning = [
    '**Generating images concisely**',
    '',
    'I should keep the visual description concise and concrete.',
].join('\n')

afterEach(() => {
    document.body.innerHTML = ''
    writeText.mockClear()
})

describe('TalosMobileMessageList', () => {
    it('K3-C Allegati A3: a Code file chip shows its path as the title and the token estimate, never a made-up size', async () => {
        const base = { grant_id: '', vault_file_id: '', media_type: 'application/octet-stream', size_bytes: 0, permissions: ['model.read'] as const, grant_status: 'active' as const }
        const wrapper = mount(TalosMobileMessageList, {
            attachTo: document.body,
            props: {
                sending: false,
                messages: [{
                    id: 'user-r4', role: 'user', content: 'Read these', state: 'persisted', created_at: '2026-10-16T12:00:00.000Z',
                    model_profile_id: null, run_id: 'r', metadata: {},
                    attachments: [
                        { ...base, id: 'r4file:0:/w/allegati/NOTA.md', display_name: 'NOTA.md', percorso: '/w/allegati/NOTA.md', caratteri: 812 },
                        { ...base, id: 'r4file:1:/w/allegati/dati.bin', display_name: 'dati.bin', percorso: '/w/allegati/dati.bin' },
                    ],
                }],
            },
        })
        await flushPromises()
        const testo = wrapper.get('[data-message-attachment-id="r4file:0:/w/allegati/NOTA.md"]')
        expect(testo.text()).toContain('NOTA.md')
        expect(testo.text()).toContain('~203 token')
        expect(testo.attributes('title')).toBe('/w/allegati/NOTA.md')
        const binario = wrapper.get('[data-message-attachment-id="r4file:1:/w/allegati/dati.bin"]')
        expect(binario.text().trim()).toBe('dati.bin')
        expect(binario.attributes('title')).toBe('/w/allegati/dati.bin')
        expect(wrapper.text()).not.toContain('0 B')
    })

    it('renders role/state/metadata and safe assistant Markdown without page overflow classes', async () => {
        const wrapper = mount(TalosMobileMessageList, {
            attachTo: document.body,
            props: { messages, sending: false },
        })
        await vi.waitFor(() => {
            expect(wrapper.find('[data-message-id="assistant-1"] h2').exists()).toBe(true)
            // Both async chunks (content + browser activity) must land before
            // the assertions - their resolution order is not guaranteed.
            expect(wrapper.find('[data-testid="talos-mobile-browser-activity"]').exists()).toBe(true)
        })

        expect(wrapper.get('[data-message-id="user-1"]').attributes('data-message-kind')).toBe('user')
        expect(wrapper.get('[data-message-id="assistant-1"] h2').text()).toBe('Answer')
        expect(wrapper.get('[data-message-id="assistant-1"]').text()).toContain('deepseek:deepseek-chat')
        expect(wrapper.get('[data-message-id="assistant-1"] [data-testid="talos-mobile-browser-activity"]')
            .text()).toContain('Page navigation succeeded')
        const attachment = wrapper.get('[data-message-id="user-1"] [data-message-attachment-id="binding-1"]')
        expect(attachment.text()).toContain('architecture.pdf')
        expect(attachment.text()).toContain('4 KB')
        expect(attachment.attributes('title')).toBe('application/pdf')
        expect(wrapper.html()).not.toContain('talos-vault')
        expect(wrapper.html()).not.toContain('vault-1')
        expect(wrapper.html()).not.toContain('grant-1')
        expect(wrapper.get('[data-testid="talos-mobile-controlled-fault"]').attributes('data-fault-code')).toBe('PROVIDER_HTTP_429')
        expect(wrapper.get('[data-testid="talos-mobile-message-list"]').classes()).toContain('min-w-0')
        // blocchi di codice (23/10): `clip` taglia come `hidden` ma non fa del filo un contenitore di scorrimento, e la testata
        // del blocco può restare ferma (BLOCCO-UI-14)
        expect(wrapper.get('[data-testid="talos-mobile-message-list"]').classes()).toContain('[overflow-x:clip]')
    })

    it('copies a message and forwards reuse/resend/retry actions', async () => {
        const wrapper = mount(TalosMobileMessageList, {
            attachTo: document.body,
            props: { messages: messages.slice(0, 2), sending: false },
        })
        await flushPromises()

        await wrapper.get('[data-message-id="user-1"] [aria-label="Copy message"]').trigger('click')
        await vi.dynamicImportSettled()
        await wrapper.get('[data-message-id="user-1"] [data-testid="talos-message-overflow"]').trigger('click')
        await flushPromises()
        document.body.querySelector<HTMLElement>('[data-testid="talos-message-resend"]')!.click()
        await wrapper.get('[data-message-id="assistant-1"] [aria-label="Retry assistant response"]').trigger('click')
        await flushPromises()
        expect(writeText).toHaveBeenCalledWith('Explain this')
        expect(wrapper.emitted('resend')).toEqual([['user-1']])
        expect(wrapper.emitted('retry')).toEqual([['assistant-1']])
        expect(wrapper.get('[role="status"][data-testid="talos-mobile-message-action-status"]').text()).toBe('Message copied.')
    })

    it('uses the neutral Processing status with no mojibake while a turn is running', async () => {
        const wrapper = mount(TalosMobileMessageList, { props: { messages: [messages[0]!], sending: true } })
        await vi.waitFor(() => {
            expect(wrapper.get('[data-testid="talos-mobile-typing"]').text()).toContain('Processing')
        })
        expect(wrapper.text()).not.toContain('â')
    })
})

// R2-11 — ONE row-action grammar (competitor pattern: long-press a message
// opens its actions, same gesture as the chat rows). The hold clicks the SAME
// overflow trigger — no second menu implementation.
describe('first-bubble memory disclosure (MEMORY-PILL)', () => {
    const disclosure = (id: string, title: string) => ({
        id,
        title,
        kind: 'preference',
        scope_type: 'global',
        trust_level: 'untrusted',
    })

    function userMessage(
        id: string,
        metadata: Record<string, unknown>,
    ): TalosMobileMessageView {
        return {
            ...messages[0]!,
            id,
            content: id,
            metadata,
            attachments: [],
        }
    }

    it('MEMORY-PILL-01 renders one pill on the first relevant bubble without rewriting later provenance', async () => {
        const firstUsedMemories = [disclosure('memory-tone', 'Tone')]
        const laterUsedMemories = [disclosure('memory-tone', 'Tone')]
        const thread = [
            userMessage('plain-before-memory', {}),
            userMessage('first-memory-turn', { used_memories: firstUsedMemories }),
            userMessage('later-memory-turn', { used_memories: laterUsedMemories }),
        ]
        const wrapper = mount(TalosMobileMessageList, {
            props: { messages: thread, sending: false },
        })
        await flushPromises()

        expect(wrapper.findAll('[data-testid="talos-used-memories"]')).toHaveLength(1)
        expect(wrapper.get('[data-message-id="first-memory-turn"] [data-testid="talos-used-memories"]')
            .text()).toContain('1 memory used')
        expect(wrapper.find('[data-message-id="later-memory-turn"] [data-testid="talos-used-memories"]')
            .exists()).toBe(false)
        expect(thread[1]!.metadata.used_memories).toBe(firstUsedMemories)
        expect(thread[2]!.metadata.used_memories).toBe(laterUsedMemories)
    })

    it('MEMORY-PILL-02 keeps one pill and relocates it when an older relevant page is prepended', async () => {
        const later = userMessage('later-memory-turn', {
            used_memories: [disclosure('memory-tone', 'Tone')],
        })
        const newest = userMessage('newest-memory-turn', {
            used_memories: [disclosure('memory-tone', 'Tone')],
        })
        const wrapper = mount(TalosMobileMessageList, {
            props: { messages: [later, newest], sending: false, hasOlderMessages: true },
        })
        await flushPromises()
        expect(wrapper.findAll('[data-testid="talos-used-memories"]')).toHaveLength(1)
        expect(wrapper.get('[data-message-id="later-memory-turn"] [data-testid="talos-used-memories"]')
            .exists()).toBe(true)

        const older = userMessage('older-memory-turn', {
            used_memories: [disclosure('memory-tone', 'Tone')],
        })
        await wrapper.setProps({ messages: [older, later, newest], hasOlderMessages: false })

        expect(wrapper.findAll('[data-testid="talos-used-memories"]')).toHaveLength(1)
        expect(wrapper.get('[data-message-id="older-memory-turn"] [data-testid="talos-used-memories"]')
            .exists()).toBe(true)
        expect(wrapper.find('[data-message-id="later-memory-turn"] [data-testid="talos-used-memories"]')
            .exists()).toBe(false)
    })

    it('MEMORY-PILL-03 renders nothing for absent, empty or malformed provenance', async () => {
        const wrapper = mount(TalosMobileMessageList, {
            props: {
                messages: [
                    userMessage('absent-memory', {}),
                    userMessage('empty-memory', { used_memories: [] }),
                    userMessage('malformed-memory', { used_memories: 'memory-tone' }),
                ],
                sending: false,
            },
        })
        await flushPromises()

        expect(wrapper.find('[data-testid="talos-used-memories"]').exists()).toBe(false)
    })
})

describe('persisted reasoning row integration', () => {
    it('mostra il ragionamento sopra la risposta e lo espande sul posto', async () => {
        const assistant = {
            ...messages[1]!,
            metadata: {},
            reasoning: persistedReasoning,
        }
        const wrapper = mount(TalosMobileMessageList, {
            props: { messages: [assistant], sending: false },
            global: { stubs: { teleport: true } },
        })
        await flushPromises()

        const article = wrapper.get('[data-message-id="assistant-1"]')
        const row = article.get('[data-testid="talos-reasoning-toggle"]')
        const answer = article.get('[data-testid="talos-mobile-message-content"]')
        expect(row.text()).toContain('Reasoning')
        expect(article.element.compareDocumentPosition(answer.element) & Node.DOCUMENT_POSITION_FOLLOWING)
            .toBeTruthy()
        expect(article.get('details').element.open).toBe(false)

        await row.trigger('click')
        expect(article.get('details').element.open).toBe(true)
        expect(wrapper.find('[data-testid="talos-reasoning-drawer"]').exists()).toBe(false)
        expect(wrapper.get('[data-testid="talos-reasoning-text"]').text()).toBe(persistedReasoning)
    })

    it('does not expose a reasoning row on a non-assistant message', async () => {
        const user = {
            ...messages[0]!,
            metadata: {},
            reasoning: 'This must never be presented as model reasoning.',
        }
        const wrapper = mount(TalosMobileMessageList, { props: { messages: [user], sending: false } })
        await flushPromises()
        expect(wrapper.find('[data-testid="talos-reasoning-toggle"]').exists()).toBe(false)
    })
})

describe('message long-press opens the overflow menu (R2-11)', () => {
    it('a 500ms stationary hold opens the message overflow', async () => {
        const wrapper = mount(TalosMobileMessageList, {
            props: { messages, sending: false },
            attachTo: document.body,
        })
        // The overflow menu is an async chunk — let it land before holding.
        await vi.waitFor(() => {
            if (!document.body.querySelector('[aria-label="More message actions"]')) throw new Error('overflow trigger not mounted yet')
        })
        vi.useFakeTimers()
        try {
            const article = wrapper.findAll('article')[0].element
            article.dispatchEvent(new MouseEvent('pointerdown', { clientX: 50, clientY: 50, bubbles: true }))
            await vi.advanceTimersByTimeAsync(600)
            article.dispatchEvent(new MouseEvent('pointerup', { clientX: 50, clientY: 50, bubbles: true }))
        } finally {
            vi.useRealTimers()
        }
        await flushPromises()
        expect(document.body.querySelector('[aria-label="Reuse prompt"]')).not.toBeNull()
        wrapper.unmount()
    })

    it('a moved finger never opens the overflow (scroll stays scroll)', async () => {
        const wrapper = mount(TalosMobileMessageList, {
            props: { messages, sending: false },
            attachTo: document.body,
        })
        await flushPromises()
        vi.useFakeTimers()
        try {
            const article = wrapper.findAll('article')[0].element
            article.dispatchEvent(new MouseEvent('pointerdown', { clientX: 50, clientY: 50, bubbles: true }))
            article.dispatchEvent(new MouseEvent('pointermove', { clientX: 50, clientY: 90, bubbles: true }))
            await vi.advanceTimersByTimeAsync(700)
        } finally {
            vi.useRealTimers()
        }
        expect(document.body.querySelector('[aria-label="Reuse prompt"]')).toBeNull()
        wrapper.unmount()
    })

    // Revisione del Desktop 23/10 sui blocchi di codice: il gesto della testata apriva ANCHE il menu del messaggio.
    it('BLOCCO-UI-08 il tocco prolungato sulla testata di un blocco apre UN menu solo, quello del blocco', async () => {
        const conCodice = [{ ...messages[1]!, browserActivities: [], content: '```python\nprint(1)\n```' }]
        const wrapper = mount(TalosMobileMessageList, { props: { messages: conCodice, sending: false }, attachTo: document.body })
        await vi.waitFor(() => {
            if (!document.body.querySelector('[aria-label="More message actions"]')) throw new Error('overflow trigger not mounted yet')
        }, { timeout: 10_000 })
        vi.useFakeTimers()
        try {
            const etichetta = wrapper.get('.talos-code-block-header span').element
            etichetta.dispatchEvent(new MouseEvent('pointerdown', { clientX: 50, clientY: 50, bubbles: true }))
            await vi.advanceTimersByTimeAsync(600)
            etichetta.dispatchEvent(new MouseEvent('pointerup', { clientX: 50, clientY: 50, bubbles: true }))
        } finally {
            vi.useRealTimers()
        }
        await flushPromises()
        // il menu del messaggio è un FOGLIO (`talos-message-actions-sheet`), quello del blocco un menu: si contano tutti e due
        const aperti = [
            ...document.body.querySelectorAll<HTMLElement>('[data-testid="talos-row-actions-menu"]'),
            ...document.body.querySelectorAll<HTMLElement>('[data-testid="talos-message-actions-sheet"]'),
        ].filter((m) => !m.hidden)
        expect(aperti.map((m) => m.getAttribute('data-testid'))).toEqual(['talos-row-actions-menu'])
        expect(document.body.querySelector('[data-message-overflow-trigger]')?.getAttribute('aria-expanded')).toBe('false')
        wrapper.unmount()
    })

    // Specifica dei blocchi (Desktop, voce 1): «un test che legge l'overflow di ogni antenato». Visto sul Pad con vc167: la
    // testata non restava ferma perché il filo (`overflow-x-hidden`) e la bolla (`overflow-hidden`) erano contenitori di
    // scorrimento, e lo sticky si agganciava a loro. Un solo asse hidden basta: l'altro diventa auto.
    it('BLOCCO-UI-14 nessun antenato del blocco di codice, fino alla radice della lista, è un contenitore di scorrimento', async () => {
        const conCodice = [{ ...messages[1]!, browserActivities: [], content: '```python\nprint(1)\n```' }]
        const wrapper = mount(TalosMobileMessageList, { props: { messages: conCodice, sending: false }, attachTo: document.body })
        // il Markdown è un pezzo asincrono: prima c'è il testo semplice
        await vi.waitFor(() => wrapper.get('.talos-code-block'), { timeout: 10_000 })
        const radice = wrapper.get('[data-testid="talos-mobile-message-list"]').element
        const colpevoli: string[] = []
        for (let el = wrapper.get('.talos-code-block').element.parentElement; el; el = el.parentElement) {
            const classi = [...el.classList].filter((c) => /^overflow(-[xy])?-(hidden|auto|scroll)$/.test(c))
            const stile = getComputedStyle(el)
            const calcolati = [stile.overflow, stile.overflowX, stile.overflowY].filter((v) => /hidden|auto|scroll/.test(v))
            if (classi.length || calcolati.length) colpevoli.push(`${el.getAttribute('data-testid') ?? el.className}: ${[...classi, ...calcolati].join(' ')}`)
            if (el === radice) break
        }
        expect(colpevoli).toEqual([])
        wrapper.unmount()
    })
})

/**
 * ⛔⛔ IL MICROFONO CAMBIA PROPRIETARIO.
 *
 * Owner 2026-08-11: «quando premo il pulsante sound spunta l'icona microfono
 * accanto al testo. Questo non deve succedere. L'icona microfono deve spuntare
 * solo quando uso il microfono per parlare io con la voce».
 *
 * La riga era `message.role === 'assistant' && parla.lette.has(message.id)`:
 * il microfono su TALOS che PARLA. Questi casi stanno sul COMPONENTE e non
 * sulla regola pura, perche' la regola pura non dice niente su chi la chiama —
 * lezione gia' pagata due volte in questa sessione.
 */
describe('⛔ il microfono: sul dettato, non sulla risposta letta', () => {
    const riga = (over: Partial<TalosMobileMessageView>): TalosMobileMessageView => ({
        id: 'm', role: 'user', content: 'ciao', state: 'persisted',
        created_at: '2026-08-11T10:00:00.000Z', model_profile_id: null,
        run_id: null, metadata: {}, attachments: [],
        ...over,
    } as TalosMobileMessageView)

    async function schermo(righe: TalosMobileMessageView[]) {
        const wrapper = mount(TalosMobileMessageList, {
            props: { messages: righe, sending: false },
            global: { stubs: { Teleport: true } },
        })
        await flushPromises()
        return wrapper
    }

    it('⭐ un messaggio DETTATO porta il microfono', async () => {
        const wrapper = await schermo([riga({ id: 'u1', metadata: { dictated: true } })])
        expect(wrapper.find('[data-testid="talos-message-dictated"]').exists()).toBe(true)
    })

    it('⛔ uno scritto a tastiera NO', async () => {
        const wrapper = await schermo([riga({ id: 'u2' })])
        expect(wrapper.find('[data-testid="talos-message-dictated"]').exists()).toBe(false)
    })

    it('⛔ e una RISPOSTA non lo porta mai, nemmeno se marcata', async () => {
        // È il difetto dell'owner, al contrario: qualunque cosa ci sia nei
        // metadati di una risposta, il microfono lì non ci va — TALOS parla,
        // non ascolta.
        const wrapper = await schermo([
            riga({ id: 'a1', role: 'assistant', metadata: { dictated: true } }),
        ])
        expect(wrapper.find('[data-testid="talos-message-dictated"]').exists()).toBe(false)
    })

    /**
     * ⛔ Owner 2026-08-12: «il colore dell'icona microfono nella bolla di
     * domanda deve avere lo stesso colore del testo, adesso è bianco».
     *
     * La causa era `--talos-muted`: un token per il testo secondario **sul fondo
     * della pagina**, usato dentro una bolla il cui fondo è l'accento. Il grado
     * di «secondario» lo deve dare l'opacità, non un'altra tinta — se no l'icona
     * appartiene a una tavolozza che lì non esiste, e smette di seguire il tema.
     */
    it('⛔ il microfono prende il colore del TESTO della bolla, non quello della pagina', async () => {
        const wrapper = await schermo([riga({ id: 'u3', metadata: { dictated: true } })])
        const classi = wrapper.get('[data-testid="talos-message-dictated"]').classes().join(' ')

        expect(classi).toContain('text-current')
        expect(classi).not.toContain('--talos-muted')
    })
})
