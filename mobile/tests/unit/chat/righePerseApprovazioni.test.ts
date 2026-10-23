// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createChatStore, type ChatCompletion } from '@/stores/chat'
import { createMemoryChatRepository } from '@/repositories/memoryChatRepository'
import { createTalosChatSendIdentity } from '@/lib/chat/sendSnapshot'
import { talosToolConsentCopy } from '@/lib/tools/toolLabels'
import { talosTestT } from '../../helpers/talosTestI18n'

/*
 * ⛔ Righe degli attrezzi perse dopo le approvazioni (Pad, 20/10/2026 sera; brief
 * `BRIEF-SUBAGENTE-RIGHE-PERSE-APPROVAZIONI-2026-10-20.md`, ledger `LEDGER-RIGHE-PERSE-APPROVAZIONI-2026-10-20.md`).
 *
 * Copione dell'owner: giro 1 `notes_list`, giro 2 `tasks_list`, giro 3 `memory_search {query:'caffè'}`, giro 4 `artifact_create`,
 * giro 5 testo; ogni giro che chiede il permesso si ferma («aspetta te») e riparte dopo «Consenti».
 *
 * Ogni pausa salva un messaggio dell'assistente (vuoto, `tool_authorization_pending_checkpoint_id`) e ogni ripresa ne salva un
 * altro, con le righe dei SOLI giri che ha eseguito lei. La lista nascondeva la bolla sospesa vuota e già decisa, ma la risposta
 * dopo ereditava solo dalla precedente diretta (`TalosMobileMessageList.vue` `esitiDaMostrare`/`ragionamentoDaMostrare`) e mai le
 * sue righe: con tre permessi spariscono le righe di `notes_list` e `tasks_list` e due ricevute su tre. E durante la ripresa la
 * sospesa restava visibile accanto alla risposta in volo: due bolle.
 */
const mock = vi.hoisted(() => ({
    controller: null as unknown,
}))
vi.mock('@/stores/chatController', () => ({
    useChatController: () => mock.controller,
}))
vi.mock('@/stores/settings', () => ({
    useSettingsStore: () => ({
        state: {
            chat_layout: { message_style: 'sections', bubble_scale: 'compact' },
            shell: { streaming_animation: 'typewriter' },
        },
    }),
}))

import TalosMobileMessageList from '@/components/chat/TalosMobileMessageList.vue'

const NOTE = { name: 'notes_list', detail: null }
const ATTIVITA = { name: 'tasks_list', detail: null }
const MEMORIA = { name: 'memory_search', detail: 'caffè' }
const VISIVO = { name: 'artifact_create', detail: null }
const RISPOSTA = 'Ecco la tua tazza di caffè.'

function orologio(): () => string {
    let tick = 0
    return () => `2026-10-20T21:00:${String(tick++).padStart(2, '0')}.000Z`
}

function sospesa(checkpoint: string) {
    return {
        text: '',
        metadata: { tool_authorization_pending_checkpoint_id: checkpoint, tool_authorization_pending_count: 1 },
        finishReason: 'tool_authorization',
    }
}

/** Il permesso deciso, come lo scrive il coordinatore: l'attività `tool.authorization` con lo stesso id del checkpoint. */
async function decidi(repository: ReturnType<typeof createMemoryChatRepository>, sessionId: string, checkpoint: string, tool: string, now: () => string) {
    await repository.appendToolActivity({
        id: checkpoint, session_id: sessionId, message_id: null, operation: 'tool.authorization', status: 'succeeded',
        payload: { contract: 'x', checkpoint: { id: checkpoint, requests: [{ id: `r-${checkpoint}`, tool, decision: 'allow_once' }] } },
        evidence: {}, created_at: now(),
    } as never)
}

/**
 * Il copione dell'owner, dal negozio vero: un invio e tre riprese. `fermaNelTerzo` tiene la terza ripresa a metà (dopo la riga
 * di `memory_search`), per guardare lo schermo DURANTE.
 */
async function copione(fermaNelTerzo: false | 'dopo-la-riga' | 'prima-della-riga' = false) {
    const now = orologio()
    let sequenza = 0
    const repository = createMemoryChatRepository({ now })
    let riprendi: () => void = () => {}
    const pausa = new Promise<void>((resolve) => { riprendi = resolve })
    let inPausa = false
    const complete: ChatCompletion = async (_turns, stream, _tools, invocation) => {
        const checkpoint = (invocation as { continuation?: { checkpoint_id?: string } } | undefined)?.continuation?.checkpoint_id
        if (!checkpoint) return sospesa('cp-1') as never
        if (checkpoint === 'cp-1') {
            stream?.onToolRound?.([NOTE])
            return sospesa('cp-2') as never
        }
        if (checkpoint === 'cp-2') {
            stream?.onToolRound?.([ATTIVITA])
            return sospesa('cp-3') as never
        }
        if (fermaNelTerzo === 'prima-della-riga') {
            inPausa = true
            await pausa
        }
        stream?.onToolRound?.([MEMORIA])
        if (fermaNelTerzo === 'dopo-la-riga') {
            inPausa = true
            await pausa
        }
        stream?.onToolRound?.([VISIVO])
        stream?.onChunk(RISPOSTA)
        return { text: RISPOSTA, finishReason: 'stop' }
    }
    const store = createChatStore(complete, { repository, translate: talosTestT('en'), now, makeId: () => `m-${++sequenza}` })
    await store.initialize()
    const sessione = await store.createSession('Caffè')
    await store.send('Fammi vedere note, attività e memoria sul caffè, poi disegnami una tazza.')
    const identity = createTalosChatSendIdentity({
        sendId: 'send-caffe',
        sessionId: sessione.id,
        sessionTitle: sessione.title,
        surface: sessione.surface,
        modelProfileId: null,
        acceptedAt: now(),
    })
    const continua = (checkpoint: string) => store.continueFromCheckpoint({ identity, runtime: {}, checkpoint_id: checkpoint, checkpoint: { phase: 'before_tools' } })
    for (const [checkpoint, tool] of [['cp-1', NOTE.name], ['cp-2', ATTIVITA.name]] as const) {
        await decidi(repository, sessione.id, checkpoint, tool, now)
        await store.refreshAuthorizationOutcomes()
        await continua(checkpoint)
    }
    await decidi(repository, sessione.id, 'cp-3', MEMORIA.name, now)
    await store.refreshAuthorizationOutcomes()
    const terza = continua('cp-3')
    if (fermaNelTerzo) await vi.waitFor(() => expect(inPausa).toBe(true))
    else await terza
    await store.refreshAuthorizationOutcomes()
    return { store, repository, sessione, riprendi, terza }
}

type Store = Awaited<ReturnType<typeof copione>>['store']

async function lista(store: Store, sending: boolean) {
    mock.controller = { chat: store, toolActivity: { value: [] } }
    const w = mount(TalosMobileMessageList, {
        props: { messages: store.messages as never, sending, pendingAuthorizationIds: [] },
        global: { stubs: { teleport: true }, mocks: { $t: (chiave: string) => chiave } },
    })
    await vi.dynamicImportSettled()
    await flushPromises()
    await vi.dynamicImportSettled()
    await flushPromises()
    return w
}

/** Le bolle dell'assistente a schermo: i messaggi non nascosti più la risposta in volo. */
function bolle(w: Awaited<ReturnType<typeof lista>>) {
    return [
        ...w.findAll('article[data-message-kind="assistant"]').filter((nodo) => !nodo.classes().includes('hidden')),
        ...w.findAll('[data-testid="talos-mobile-streaming"]'),
    ]
}

const tEn = talosTestT('en')
const titolo = (tool: string) => talosToolConsentCopy({ name: tool, title: tool, description: '' }, tEn).title

/** Le ricevute nell'ordine del documento, come titolo dello strumento. */
function ricevute(nodo: ReturnType<typeof bolle>[number]): string[] {
    return nodo.findAll('[data-testid="talos-authorization-outcome"]').map((riga) => riga.text().replace('chat.permissionGranted', '').trim())
}

/** Apre il gruppo degli attrezzi, se c'è, perché tutte le righe siano nel testo. */
async function apri(nodo: ReturnType<typeof bolle>[number]): Promise<void> {
    const gruppo = nodo.find('[data-testid="talos-tool-group"] button')
    if (gruppo.exists() && gruppo.attributes('aria-expanded') === 'false') await gruppo.trigger('click')
}

/** Il testo delle righe degli attrezzi, senza la riga di riassunto del gruppo (che le nomina tutte). */
function testoDelleRighe(nodo: ReturnType<typeof bolle>[number]): string {
    const riassunto = nodo.find('[data-testid="talos-tool-group"] button')
    return nodo.findAll('[data-segmento="attrezzi"]').map((blocco) => blocco.text()).join(' ')
        .replace(riassunto.exists() ? riassunto.text() : '', '')
}

/** Le quattro righe del copione, nell'ordine: posizione nel testo delle righe. */
function ordineDelleRighe(testo: string): number[] {
    return ['Looking at your notes', 'Looking at your tasks', 'Checking what it remembers: caffè', 'Making an interactive visual'].map((pezzo) => testo.indexOf(pezzo))
}

describe('righe degli attrezzi dopo tre permessi (Pad 20/10)', () => {
    it('RPA-00 caratterizzazione: sul disco le righe ci sono tutte, sparse nei messaggi delle riprese', async () => {
        const { repository, sessione } = await copione()
        const assistente = (await repository.listMessages(sessione.id)).filter((messaggio) => messaggio.role === 'assistant')
        expect(assistente.map((messaggio) => messaggio.metadata?.talos_sequenza ?? null)).toEqual([
            null,
            [{ tipo: 'attrezzi', attrezzi: [NOTE] }],
            [{ tipo: 'attrezzi', attrezzi: [ATTIVITA] }],
            [{ tipo: 'attrezzi', attrezzi: [MEMORIA] }, { tipo: 'attrezzi', attrezzi: [VISIVO] }, { tipo: 'testo', testo: RISPOSTA }],
        ])
    })

    it('RPA-01 a fine giro: UNA bolla, tre ricevute in ordine, le quattro righe in ordine e il gruppo che si forma', async () => {
        const { store } = await copione()
        const w = await lista(store, false)
        const visibili = bolle(w)
        expect(visibili).toHaveLength(1)
        const bolla = visibili[0]!
        await apri(bolla)
        const posizioni = ordineDelleRighe(testoDelleRighe(bolla))
        expect(posizioni.every((posizione) => posizione >= 0), bolla.text()).toBe(true)
        expect([...posizioni].sort((a, b) => a - b)).toEqual(posizioni)
        expect(bolla.get('[data-testid="talos-tool-group"] button').text()).toContain('4 steps')
        expect(ricevute(bolla)).toEqual([titolo(NOTE.name), titolo(ATTIVITA.name), titolo(MEMORIA.name)])
        expect(bolla.text()).toContain(RISPOSTA)
    })

    it('RPA-02 dopo essere usciti e rientrati: la stessa bolla, nulla di perso', async () => {
        const { repository, sessione } = await copione()
        const riaperta = createChatStore(vi.fn() as never, { repository, translate: talosTestT('en') })
        await riaperta.initialize()
        await riaperta.selectSession(sessione.id)
        const w = await lista(riaperta, false)
        const visibili = bolle(w)
        expect(visibili).toHaveLength(1)
        expect(ricevute(visibili[0]!)).toEqual([titolo(NOTE.name), titolo(ATTIVITA.name), titolo(MEMORIA.name)])
        await apri(visibili[0]!)
        const posizioni = ordineDelleRighe(testoDelleRighe(visibili[0]!))
        expect(posizioni.every((posizione) => posizione >= 0), visibili[0]!.text()).toBe(true)
        expect([...posizioni].sort((a, b) => a - b)).toEqual(posizioni)
    })

    it('RPA-03 durante la terza ripresa: UNA bolla, con le ricevute e le righe di prima più quella in corso', async () => {
        const { store, riprendi, terza } = await copione('dopo-la-riga')
        const w = await lista(store, true)
        const visibili = bolle(w)
        expect(visibili.map((nodo) => nodo.attributes('data-testid') ?? nodo.attributes('data-message-id'))).toEqual(['talos-mobile-streaming'])
        const bolla = visibili[0]!
        expect(ricevute(bolla)).toEqual([titolo(NOTE.name), titolo(ATTIVITA.name), titolo(MEMORIA.name)])
        // La riga viva si vede anche a gruppo chiuso.
        expect(bolla.get('[data-testid="talos-tool-activity"]').text()).toContain('caffè')
        await apri(bolla)
        const testo = testoDelleRighe(bolla)
        const [note, attivita, memoria] = ordineDelleRighe(testo)
        expect([note, attivita, memoria].every((posizione) => posizione! >= 0), testo).toBe(true)
        expect(note).toBeLessThan(attivita!)
        expect(attivita).toBeLessThan(memoria!)
        riprendi()
        await terza
    })

    it('RPA-05 appena dopo «Consenti», prima del primo giro: la bolla c’è già, con le righe di prima CONCLUSE (nessuna in corso)', async () => {
        const { store, riprendi, terza } = await copione('prima-della-riga')
        const w = await lista(store, true)
        const visibili = bolle(w)
        expect(visibili.map((nodo) => nodo.attributes('data-testid') ?? nodo.attributes('data-message-id'))).toEqual(['talos-mobile-streaming'])
        const bolla = visibili[0]!
        expect(ricevute(bolla)).toEqual([titolo(NOTE.name), titolo(ATTIVITA.name), titolo(MEMORIA.name)])
        expect(bolla.find('[data-testid="talos-tool-activity"]').exists()).toBe(false)
        const testo = testoDelleRighe(bolla)
        expect(testo).toContain('Looking at your notes')
        expect(testo.indexOf('Looking at your notes')).toBeLessThan(testo.indexOf('Looking at your tasks'))
        riprendi()
        await terza
    })
})

describe('la catena delle bolle sospese senza righe (GESTITA-RAG, più permessi)', () => {
    const esito = (tool: string) => [{ tool, concesso: true }]
    const sospesaVuota = (id: string, checkpoint: string, extra: Record<string, unknown>) => ({
        id, role: 'assistant', content: '', created_at: '2026-10-20T21:00:00.000Z', state: 'persisted',
        metadata: { tool_authorization_pending_checkpoint_id: checkpoint, tool_authorization_pending_count: 1 }, ...extra,
    })

    it('RPA-04 tre passi sospesi col solo ragionamento: un blocco, i tre ragionamenti e le tre ricevute in ordine', async () => {
        mock.controller = { chat: { state: { sending: false }, activeSession: { value: null } }, toolActivity: { value: [] } }
        const w = mount(TalosMobileMessageList, {
            props: {
                messages: [
                    sospesaVuota('a', 'cp-a', { reasoning: 'Primo passo.', authorizationOutcome: esito('notes_list') }),
                    sospesaVuota('b', 'cp-b', { reasoning: 'Secondo passo.', authorizationOutcome: esito('tasks_list') }),
                    sospesaVuota('c', 'cp-c', { reasoning: 'Terzo passo.', authorizationOutcome: esito('memory_search') }),
                    { id: 'd', role: 'assistant', content: 'Fatto.', reasoning: 'Ultimo.', created_at: '2026-10-20T21:00:05.000Z', state: 'persisted', metadata: {} },
                ] as never,
                sending: false,
                pendingAuthorizationIds: [],
            },
            global: { stubs: { teleport: true }, mocks: { $t: (chiave: string) => chiave } },
        })
        await flushPromises()
        const risposta = w.get('[data-message-id="d"]')
        expect(ricevute(risposta as never)).toEqual([titolo('notes_list'), titolo('tasks_list'), titolo('memory_search')])
        const blocchi = risposta.findAll('[data-testid="talos-reasoning-text"]')
        expect(blocchi).toHaveLength(1)
        const testo = blocchi[0]!.text()
        const posizioni = ['Primo passo.', 'Secondo passo.', 'Terzo passo.', 'Ultimo.'].map((pezzo) => testo.indexOf(pezzo))
        expect(posizioni.every((posizione) => posizione >= 0), testo).toBe(true)
        expect([...posizioni].sort((a, b) => a - b)).toEqual(posizioni)
    })
})
