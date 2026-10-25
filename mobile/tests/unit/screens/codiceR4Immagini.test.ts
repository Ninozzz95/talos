// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { TalosR4ClientePonte } from '@/lib/harness/r4/clienteR4'
import type { TalosMobileModelProfileView } from '@/components/chat/mobileChatTypes'
import type { TalosPickedFile } from '@/services/nativeFilePicker'
import testiAllegati from '@/lib/harness/r4/testi/app-allegati-r4.json'

/**
 * ⛔ K3-C Allegati A2 (ledger `LEDGER-K3-ALLEGATI-2026-10-16.md`; owner 16/10 «Immagini», «Anteprima vera», consenso «Stessa regola
 * della chat»). La galleria e la fotocamera della chat nel Codice su r4: il controllo del desktop (`allegaFile`), il consenso della
 * chat col fornitore del modello del Codice, il caricamento in r4 (`POST /api/v1/chat-images`), il vassoio della chat e l'invio con
 * `immagini` e la bolla. Le risposte di r4 sono quelle VERE registrate sul Pad (`immagini-risposte-2161afb32.json`).
 */
const vere = JSON.parse(readFileSync(resolve(__dirname, '..', '..', 'fixtures', 'r4', 'immagini-risposte-2161afb32.json'), 'utf8'))
const ID1: string = vere.immagine1.d.data.id
const SESSIONE = '33333333-3333-4333-8333-333333333333'
const en = testiAllegati.en as Record<string, string>

const stato = vi.hoisted(() => ({
    richieste: [] as { metodo: string; percorso: string; corpo?: string }[],
    rispondi: null as null | ((r: { metodo: string; percorso: string; corpo?: string }) => { stato: number; corpo: string } | null),
    lette: [] as string[],
    scelte: [] as TalosPickedFile[],
    scatti: 0,
    shell: { image_attachment_consent: 'allow' as 'allow' | 'ask' | 'deny' },
    setShell: [] as Record<string, unknown>[],
}))
vi.mock('vue-router', async () => {
    const { reactive } = await import('vue')
    const rotta = reactive({ params: { id: '33333333-3333-4333-8333-333333333333' } })
    return { useRoute: () => rotta, useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }
})
vi.mock('@/lib/harness/terminalePonte', () => ({ talosR4Pronto: async () => ({ disponibile: true, acceso: true, porta: 4178, cartella: '/data/w' }) }))
vi.mock('@/services/secureKeyStore', () => ({ getProviderKey: async () => null }))
vi.mock('@/services/nativeCamera', () => ({
    createTalosNativeCamera: () => ({
        pickPhotos: async () => stato.scelte,
        takePhoto: async () => { stato.scatti += 1; return stato.scelte.slice(0, 1) },
    }),
}))
vi.mock('@/stores/chatController', async () => {
    const { ref, reactive } = await import('vue')
    const chat = {
        profiles: ref<TalosMobileModelProfileView[]>([]), discoveryProblems: ref([]), refreshingModels: ref(false),
        endpoints: reactive<Record<string, string | null>>({}), selectedModelId: ref<string | null>(null), effort: ref('medium'),
    }
    return { useChatController: () => chat }
})
vi.mock('@/lib/harness/r4/clienteR4', () => ({
    talosClienteR4: (): TalosR4ClientePonte => ({
        richiesta: async (r) => {
            stato.richieste.push(r)
            const scelta = stato.rispondi?.(r)
            if (scelta) return scelta
            const ok = (d: unknown) => ({ stato: 200, corpo: JSON.stringify(d) })
            if (r.metodo === 'GET' && r.percorso === '/api/v1/sessions') return ok({ ok: true, data: { items: [{ sessionId: SESSIONE, nome: 'Prova', permessi: 'Full access', permessiPerAttrezzo: {}, modello: 'deepseek:deepseek-v4-pro', reasoning: null }] } })
            if (r.percorso === '/api/v1/chat-images') return { stato: vere.immagine1.stato, corpo: JSON.stringify(vere.immagine1.d) }
            if (r.percorso.endsWith('/resume') || r.percorso.endsWith('/queue')) return ok(vere.soloImmagine.d)
            return ok({ ok: true, data: {} })
        },
        immagine: async ({ id }) => { stato.lette.push(id); return { stato: 200, tipo: 'image/png', base64: 'AQID' } },
        apriFlusso: async () => undefined,
        chiudiFlusso: async () => undefined,
        apriTerminale: async () => undefined,
        scriviTerminale: async () => undefined,
        ridimensionaTerminale: async () => undefined,
        chiudiTerminale: async () => undefined,
        addListener: async () => ({ remove: async () => undefined }),
    }),
}))
vi.mock('@/stores/settings', () => ({
    useSettingsStore: () => ({
        state: {
            chat_layout: { message_style: 'sections', bubble_scale: 'large' },
            shell: { debug_diagnostics: false, streaming_animation: 'fade', composer_shape: 'calm', composer_plus: 'dropdown', codice_model: null, codice_effort: null, ...stato.shell },
            voice: { dictation_language: 'auto' },
        },
        setShell: async (patch: Record<string, unknown>) => { stato.setShell.push(patch) },
    }),
}))
vi.mock('@/composables/useTalosMobileDictation', async () => {
    const { ref } = await import('vue')
    return { useTalosMobileDictation: () => ({ visible: ref(true), status: ref('idle'), level: ref(0), error: ref(''), errorCode: ref(null), toggle: vi.fn(), cancel: vi.fn(), finisci: vi.fn() }) }
})

import CodiceR4Screen from '@/screens/CodiceR4Screen.vue'
import TalosMobileComposer from '@/components/chat/TalosMobileComposer.vue'
import { TALOS_BYTE_IMMAGINE } from '@/lib/chat/byteImmagine'
import { useAllegatiR4 } from '@/composables/useAllegatiR4'

const foto = (nome: string, tipo = 'image/png', byte?: number): TalosPickedFile => {
    const blob = new Blob([new Uint8Array([137, 80, 78, 71])], { type: tipo })
    return { name: nome, declaredMediaType: tipo, sizeBytes: byte ?? blob.size, source: { kind: 'web-blob', blob } }
}
async function asciuga() { for (let i = 0; i < 8; i++) { await flushPromises(); await vi.dynamicImportSettled() } }
async function schermata() {
    const w = mount(CodiceR4Screen, { attachTo: document.body, global: { stubs: { teleport: true } } })
    await asciuga()
    return w
}
const compositore = (w: ReturnType<typeof mount>) => w.getComponent(TalosMobileComposer)
const caricamenti = () => stato.richieste.filter((r) => r.percorso === '/api/v1/chat-images')
const invii = () => stato.richieste.filter((r) => r.metodo === 'POST' && /\/(resume|queue)$/u.test(r.percorso)).map((r) => JSON.parse(r.corpo ?? '{}'))
const vassoio = (w: ReturnType<typeof mount>) => compositore(w).props('attachments') as { displayName: string; status: string; vaultFileId: string | null; error: string | null }[]

afterEach(() => {
    document.body.innerHTML = ''
    stato.richieste = []
    stato.rispondi = null
    stato.lette = []
    stato.scelte = []
    stato.scatti = 0
    stato.shell.image_attachment_consent = 'allow'
    stato.setShell = []
})

describe('le immagini nel Codice su r4 (K3-C Allegati A2)', () => {
    it('CIM-01 galleria e fotocamera: l\'immagine si carica in r4 come dataURL e il vassoio della chat la mostra pronta con l\'id di r4', async () => {
        stato.scelte = [foto('Foto 16-10 alle 21.00.png')]
        const w = await schermata()
        expect(compositore(w).props('attachmentsAvailable')).toBe(true)
        // A3: «Dalla Libreria» resta spenta nel Codice, e il perché si dice in parole semplici
        expect(compositore(w).props('contextDisabledReason')).toBe('The Library is not connected to Code yet: attach a file from the device or from the ▤ panel.')
        compositore(w).vm.$emit('pickPhotos')
        await asciuga()
        expect(caricamenti().map((r) => JSON.parse(r.corpo!))).toEqual([{ nome: 'Foto 16-10 alle 21.00.png', dataUrl: 'data:image/png;base64,iVBORw==' }])
        expect(vassoio(w)).toMatchObject([{ displayName: 'Foto 16-10 alle 21.00.png', status: 'authorized', vaultFileId: `r4:${ID1}`, error: null }])
        compositore(w).vm.$emit('takePhoto')
        await asciuga()
        expect(stato.scatti).toBe(1)
        expect(vassoio(w)).toHaveLength(2)
        compositore(w).vm.$emit('removeAttachment', (vassoio(w)[0] as unknown as { id: string }).id)
        await asciuga()
        expect(vassoio(w)).toHaveLength(1)
        w.unmount()
    })

    it('CIM-02 il consenso della chat: «chiedi» fa la domanda col nome del fornitore del Codice; «No» non carica; «Sempre» si ricorda; «mai» lo dice', async () => {
        stato.shell.image_attachment_consent = 'ask'
        stato.scelte = [foto('a.png'), foto('b.png')]
        const w = await schermata()
        compositore(w).vm.$emit('pickPhotos')
        await asciuga()
        const domanda = document.querySelector('[data-testid="talos-image-consent"]')
        expect(domanda?.textContent).toContain('To show them to the model, TALOS sends them to DeepSeek.')
        ;(document.querySelector('[data-testid="talos-image-consent-no"]') as HTMLElement).click()
        await asciuga()
        expect(caricamenti()).toEqual([])
        expect(vassoio(w)).toEqual([])
        compositore(w).vm.$emit('pickPhotos')
        await asciuga()
        ;(document.querySelector('[data-testid="talos-image-consent-always"]') as HTMLElement).click()
        await asciuga()
        expect(stato.setShell).toEqual([{ image_attachment_consent: 'allow' }])
        expect(caricamenti()).toHaveLength(2)
        expect(document.querySelector('[data-testid="talos-image-consent"]')).toBeNull()
        w.unmount()

        stato.shell.image_attachment_consent = 'deny'
        stato.richieste = []
        const w2 = await schermata()
        compositore(w2).vm.$emit('pickPhotos')
        await asciuga()
        expect(document.querySelector('[data-testid="talos-image-consent"]')).toBeNull()
        expect(caricamenti()).toEqual([])
        expect(compositore(w2).props('attachmentError')).toBe('Images cannot leave this device. Change the choice in Settings → Privacy.')
        w2.unmount()
    })

    it('CIM-03 l\'invio porta le immagini a r4: col testo, il testo; da sole, la frase per il modello del desktop; il vassoio si svuota', async () => {
        stato.scelte = [foto('a.png')]
        const w = await schermata()
        compositore(w).vm.$emit('pickPhotos')
        await asciuga()
        await w.get('[data-testid="talos-composer-prompt"]').setValue('Cosa vedi?')
        compositore(w).vm.$emit('send')
        await asciuga()
        expect(invii()).toEqual([{ messaggio: 'Cosa vedi?', immagini: [{ id: ID1 }] }])
        expect(vassoio(w)).toEqual([])
        // a giro vivo l'immagine va nella coda di r4 col testo
        compositore(w).vm.$emit('pickPhotos')
        await asciuga()
        compositore(w).vm.$emit('queue', 'E questa?')
        await asciuga()
        expect(invii()[1]).toEqual({ messaggio: 'E questa?', immagini: [{ id: ID1 }] })
        expect(vassoio(w)).toEqual([])
        w.unmount()

        stato.richieste = []
        const w2 = await schermata()
        compositore(w2).vm.$emit('pickPhotos')
        await asciuga()
        compositore(w2).vm.$emit('send')
        await asciuga()
        expect(invii()).toEqual([{ messaggio: 'Describe the attached image.', immagini: [{ id: ID1 }] }])
        w2.unmount()
    })

    it('CIM-04 il controllo del desktop: formato e peso si dicono con le sue parole e non caricano; un rifiuto di r4 lascia la bozza fallita', async () => {
        stato.scelte = [foto('x.gif', 'image/gif')]
        const w = await schermata()
        compositore(w).vm.$emit('pickPhotos')
        await asciuga()
        expect(compositore(w).props('attachmentError')).toBe(`${en['attachments.imageFormat']} · ${en['attachments.imageFormatBody']}`)
        stato.scelte = [foto('grande.jpg', 'image/jpeg', 5 * 1024 * 1024 + 1)]
        compositore(w).vm.$emit('pickPhotos')
        await asciuga()
        expect(compositore(w).props('attachmentError')).toBe(`${en['attachments.imageTooLarge']} · ${en['attachments.imageTooLargeBody']}`)
        expect(caricamenti()).toEqual([])
        stato.scelte = [foto('a.png')]
        stato.rispondi = (r) => (r.percorso === '/api/v1/chat-images' ? { stato: vere.formatoSbagliato.stato, corpo: JSON.stringify(vere.formatoSbagliato.d) } : null)
        compositore(w).vm.$emit('pickPhotos')
        await asciuga()
        // ⛔ D-F3-1 (Desktop 25/10): mai il codice né la frase inglese di r4 nel vassoio; `QUERY_INVALID` su un'immagine è il formato
        expect(vassoio(w)).toMatchObject([{ status: 'failed', error: `${en['attachments.imageFailed']} · ${en['attachments.imageFormatBody']}` }])
        compositore(w).vm.$emit('send')
        await asciuga()
        expect(invii()).toEqual([])
        // uno stato d'errore non si crede nemmeno se il corpo porta un id
        compositore(w).vm.$emit('removeAttachment', (vassoio(w)[0] as unknown as { id: string }).id)
        stato.rispondi = (r) => (r.percorso === '/api/v1/chat-images' ? { stato: 500, corpo: JSON.stringify(vere.immagine1.d) } : null)
        compositore(w).vm.$emit('pickPhotos')
        await asciuga()
        expect(vassoio(w)).toMatchObject([{ status: 'failed', error: `${en['attachments.imageFailed']} · TALOS could not add this file.` }])
        w.unmount()
    })

    it('CIM-05 l\'anteprima vera: la schermata dà alle bolle il lettore di r4; un\'immagine appena caricata non si rilegge, le altre una volta sola', async () => {
        stato.scelte = [foto('a.png')]
        const w = await schermata()
        const lettore = (w.vm.$ as unknown as { provides: Record<symbol, unknown> }).provides[TALOS_BYTE_IMMAGINE as symbol] as (id: string) => Promise<Uint8Array | null>
        expect(typeof lettore).toBe('function')
        compositore(w).vm.$emit('pickPhotos')
        await asciuga()
        expect(Array.from((await lettore(`r4:${ID1}`))!)).toEqual([137, 80, 78, 71])
        expect(stato.lette).toEqual([])
        const altro = 'b'.repeat(64)
        expect(Array.from((await lettore(`r4:${altro}`))!)).toEqual([1, 2, 3])
        await lettore(`r4:${altro}`)
        expect(stato.lette).toEqual([altro])
        expect(await lettore('vault-file-1')).toBeNull()
        w.unmount()
    })

    it('CIM-06 una scelta a metà e la sessione che cambia: il vassoio resta vuoto e niente si carica', async () => {
        let scelte!: () => void
        const lavoro = useAllegatiR4({
            cliente: () => ({ richiesta: async (r: { percorso: string }) => { stato.richieste.push(r as never); return { stato: vere.immagine1.stato, corpo: JSON.stringify(vere.immagine1.d) } } }) as unknown as TalosR4ClientePonte,
            fotocamera: () => ({ pickPhotos: () => new Promise<TalosPickedFile[]>((ok) => { scelte = () => ok([foto('a.png')]) }), takePhoto: async () => [] }),
            selettoreFile: () => ({ pickFiles: async () => [] }),
            consenso: () => 'allow', ricordaSempre: () => undefined, fornitore: () => ({ id: 'deepseek', nome: 'DeepSeek' }), lingua: () => 'en', t: (k) => k,
        })
        const scelta = lavoro.scegli('galleria')
        await flushPromises()
        lavoro.svuota()
        scelte()
        await scelta
        await asciuga()
        expect(lavoro.vassoio).toEqual([])
        expect(caricamenti()).toEqual([])
    })
})
