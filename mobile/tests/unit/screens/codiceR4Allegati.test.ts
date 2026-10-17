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
 * ⛔ K3-C Allegati A3 (ledger `LEDGER-K3-ALLEGATI-2026-10-16.md`; owner 16/10 «L'app li scrive in allegati/», chip «Come il desktop»):
 * «Allega un file» nel Codice su r4. Il file scelto va al nativo (`allegaFile`: uri, nome, testo sì/no), che lo scrive in `allegati/`
 * e torna la ricevuta del desktop; il messaggio porta la riga del file (o il suo testo) per il modello e la bolla coi chip. Un'immagine
 * scelta come file va per la strada delle immagini, come `allegaFile` del desktop.
 */
const vere = JSON.parse(readFileSync(resolve(__dirname, '..', '..', 'fixtures', 'r4', 'immagini-risposte-2161afb32.json'), 'utf8'))
const ID1: string = vere.immagine1.d.data.id
const SESSIONE = '33333333-3333-4333-8333-333333333333'
const en = testiAllegati.en as Record<string, string>

const stato = vi.hoisted(() => ({
    richieste: [] as { metodo: string; percorso: string; corpo?: string }[],
    allegati: [] as Record<string, unknown>[],
    lette: [] as string[],
    rispostaFile: null as null | ((o: { uri: string; nome: string; testo: boolean }) => Promise<Record<string, unknown>>),
    file: [] as TalosPickedFile[],
    shell: { image_attachment_consent: 'allow' as 'allow' | 'ask' | 'deny' },
}))
vi.mock('vue-router', async () => {
    const { reactive } = await import('vue')
    const rotta = reactive({ params: { id: '33333333-3333-4333-8333-333333333333' } })
    return { useRoute: () => rotta, useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }
})
vi.mock('@/lib/harness/terminalePonte', () => ({ talosR4Pronto: async () => ({ disponibile: true, acceso: true, porta: 4178, cartella: '/w' }) }))
vi.mock('@/services/secureKeyStore', () => ({ getProviderKey: async () => null }))
vi.mock('@/services/nativeCamera', () => ({ createTalosNativeCamera: () => ({ pickPhotos: async () => [], takePhoto: async () => [] }) }))
vi.mock('@/services/nativeFilePicker', () => ({ createNativeFilePicker: () => ({ pickFiles: async () => stato.file }) }))
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
            const ok = (d: unknown) => ({ stato: 200, corpo: JSON.stringify(d) })
            if (r.metodo === 'GET' && r.percorso === '/api/v1/sessions') return ok({ ok: true, data: { items: [{ sessionId: SESSIONE, nome: 'Prova', permessi: 'Full access', permessiPerAttrezzo: {}, modello: 'deepseek:deepseek-v4-pro', reasoning: null }] } })
            if (r.percorso === '/api/v1/chat-images') return { stato: vere.immagine1.stato, corpo: JSON.stringify(vere.immagine1.d) }
            if (r.percorso.endsWith('/resume') || r.percorso.endsWith('/queue')) return ok(vere.soloImmagine.d)
            return ok({ ok: true, data: {} })
        },
        allegaFile: async (o) => { stato.allegati.push(o); return stato.rispostaFile!(o) },
        immagineScelta: async ({ uri }) => { stato.lette.push(uri); return { tipo: 'image/png', base64: 'iVBORw==' } },
        immagine: async () => ({ stato: 404, tipo: '', base64: '' }),
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
        setShell: async () => undefined,
    }),
}))
vi.mock('@/composables/useTalosMobileDictation', async () => {
    const { ref } = await import('vue')
    return { useTalosMobileDictation: () => ({ visible: ref(true), status: ref('idle'), level: ref(0), error: ref(''), errorCode: ref(null), toggle: vi.fn(), cancel: vi.fn(), finisci: vi.fn() }) }
})

import CodiceR4Screen from '@/screens/CodiceR4Screen.vue'
import TalosMobileComposer from '@/components/chat/TalosMobileComposer.vue'

const scelto = (nome: string, tipo: string, byte: number, uri = `content://documenti/${encodeURIComponent(nome)}`): TalosPickedFile => (
    { name: nome, declaredMediaType: tipo, sizeBytes: byte, source: { kind: 'native-uri', uri } })
const ricevuta = (nome: string, bytes: number, testo?: string) => ({ tipo: 'file', nome, percorso: `allegati/${nome}`, bytes, assoluto: `/w/allegati/${nome}`, ...(testo === undefined ? {} : { testo }) })
async function asciuga() { for (let i = 0; i < 8; i++) { await flushPromises(); await vi.dynamicImportSettled() } }
async function schermata() {
    const w = mount(CodiceR4Screen, { attachTo: document.body, global: { stubs: { teleport: true } } })
    await asciuga()
    return w
}
const compositore = (w: ReturnType<typeof mount>) => w.getComponent(TalosMobileComposer)
const invii = () => stato.richieste.filter((r) => r.metodo === 'POST' && /\/(resume|queue)$/u.test(r.percorso)).map((r) => JSON.parse(r.corpo ?? '{}'))
const vassoio = (w: ReturnType<typeof mount>) => compositore(w).props('attachments') as { id: string; displayName: string; status: string; sizeBytes: number; permissions: string[]; error: string | null }[]

afterEach(() => {
    document.body.innerHTML = ''
    stato.richieste = []
    stato.allegati = []
    stato.lette = []
    stato.rispostaFile = null
    stato.file = []
    stato.shell.image_attachment_consent = 'allow'
})

describe('i file dal telefono nel Codice su r4 (K3-C Allegati A3)', () => {
    it('CIF-01 il file scelto va al nativo (uri, nome, testo solo per i file di testo) ed entra nel vassoio col nome della ricevuta', async () => {
        stato.shell.image_attachment_consent = 'ask'
        stato.file = [scelto('NOTA.md', 'text/markdown', 812), scelto('dati.bin', 'application/octet-stream', 2048)]
        stato.rispostaFile = async (o) => (o.nome === 'NOTA.md' ? ricevuta('NOTA-2.md', 812, '# Nota') : ricevuta('dati.bin', 2048))
        const w = await schermata()
        expect(compositore(w).props('attachmentsAvailable')).toBe(true)
        compositore(w).vm.$emit('attach')
        await asciuga()
        expect(stato.allegati).toEqual([
            { uri: 'content://documenti/NOTA.md', nome: 'NOTA.md', testo: true },
            { uri: 'content://documenti/dati.bin', nome: 'dati.bin', testo: false },
        ])
        // un file non è un'immagine: nessuna domanda sul consenso
        expect(document.querySelector('[data-testid="talos-image-consent"]')).toBeNull()
        expect(vassoio(w)).toMatchObject([
            { displayName: 'NOTA-2.md', status: 'authorized', sizeBytes: 812, permissions: ['model.read'], error: null },
            { displayName: 'dati.bin', status: 'authorized', sizeBytes: 2048, permissions: ['model.read'], error: null },
        ])
        w.unmount()
    })

    it('CIF-02 l\'invio: per il modello la riga di ogni file (col testo se letto), nella bolla ciò che si è scritto coi chip', async () => {
        stato.file = [scelto('NOTA.md', 'text/markdown', 812), scelto('dati.bin', 'application/octet-stream', 2048)]
        stato.rispostaFile = async (o) => (o.nome === 'NOTA.md' ? ricevuta('NOTA.md', 812, '# Nota') : ricevuta('dati.bin', 2048))
        const w = await schermata()
        compositore(w).vm.$emit('attach')
        await asciuga()
        await w.get('[data-testid="talos-composer-prompt"]').setValue('Leggi')
        compositore(w).vm.$emit('send')
        await asciuga()
        expect(invii()).toEqual([{
            messaggio: 'Leggi\n\nAttachments of this message:\n- NOTA.md (/w/allegati/NOTA.md)\n- attached file: /w/allegati/dati.bin\n\n--- NOTA.md (/w/allegati/NOTA.md) ---\n# Nota',
            bolla: { testo: 'Leggi', allegati: [{ tipo: 'file', nome: 'NOTA.md', percorso: '/w/allegati/NOTA.md', caratteri: 6 }, { tipo: 'file', nome: 'dati.bin', percorso: '/w/allegati/dati.bin' }] },
        }])
        expect(vassoio(w)).toEqual([])
        w.unmount()
    })

    it('CIF-03 oltre 25 MiB non parte; un rifiuto del nativo lascia la bozza fallita col perché; un testo troppo lungo resta solo percorso', async () => {
        stato.file = [scelto('enorme.zip', 'application/zip', 25 * 1024 * 1024 + 1)]
        const w = await schermata()
        compositore(w).vm.$emit('attach')
        await asciuga()
        expect(stato.allegati).toEqual([])
        expect(compositore(w).props('attachmentError')).toBe(`${en['attachments.fileTooLarge']} · ${en['attachments.fileTooLargeBody']}`)
        stato.file = [scelto('a.txt', 'text/plain', 10)]
        stato.rispostaFile = async () => { throw Object.assign(new Error('FILE_WRITE_FAILED'), { code: 'FILE_WRITE_FAILED' }) }
        compositore(w).vm.$emit('attach')
        await asciuga()
        // Pad 16/10: il perché in parole, mai il codice grezzo del nativo (come la chat)
        expect(vassoio(w)).toMatchObject([{ status: 'failed', error: `${en['attachments.fileFailed']} · The file could not be copied into the attachments folder.` }])
        expect(vassoio(w)[0].error).not.toContain('FILE_WRITE_FAILED')
        compositore(w).vm.$emit('removeAttachment', vassoio(w)[0].id)
        // il nativo che rifiuta per il peso: le parole del desktop
        stato.rispostaFile = async () => { throw Object.assign(new Error('PAYLOAD_LIMIT'), { code: 'PAYLOAD_LIMIT' }) }
        compositore(w).vm.$emit('attach')
        await asciuga()
        expect(vassoio(w)).toMatchObject([{ status: 'failed', error: `${en['attachments.fileFailed']} · ${en['attachments.fileTooLargeBody']}` }])
        compositore(w).vm.$emit('removeAttachment', vassoio(w)[0].id)
        // una ricevuta che non è quella del desktop non si crede
        stato.rispostaFile = async () => ({ ...ricevuta('a.txt', 10), percorso: '../fuori/a.txt' })
        compositore(w).vm.$emit('attach')
        await asciuga()
        expect(vassoio(w)).toMatchObject([{ status: 'failed', error: `${en['attachments.fileFailed']} · ${en['attachments.serverNoConfirm']}` }])
        compositore(w).vm.$emit('removeAttachment', vassoio(w)[0].id)
        // il testo oltre il tetto dei caratteri non viaggia: resta la riga col percorso
        stato.file = [scelto('lungo.txt', 'text/plain', 200_000)]
        stato.rispostaFile = async () => ricevuta('lungo.txt', 200_000, 'x'.repeat(200_001))
        compositore(w).vm.$emit('attach')
        await asciuga()
        compositore(w).vm.$emit('send')
        await asciuga()
        // senza testo scritto il messaggio comincia dalle righe degli allegati (accorciato come il desktop, `app.js:22875`)
        expect(invii()[0].messaggio).toBe('Attachments of this message:\n- attached file: /w/allegati/lungo.txt')
        w.unmount()
    })

    it('CIF-04 un\'immagine scelta come file va per la strada delle immagini: letta dal nativo, consenso, `chat-images`', async () => {
        stato.shell.image_attachment_consent = 'deny'
        stato.file = [scelto('foto.png', 'image/png', 4)]
        const w = await schermata()
        compositore(w).vm.$emit('attach')
        await asciuga()
        expect(stato.lette).toEqual([])
        expect(compositore(w).props('attachmentError')).toBe('Images cannot leave this device. Change the choice in Settings → Privacy.')
        w.unmount()

        stato.shell.image_attachment_consent = 'allow'
        const w2 = await schermata()
        compositore(w2).vm.$emit('attach')
        await asciuga()
        expect(stato.lette).toEqual(['content://documenti/foto.png'])
        expect(stato.allegati).toEqual([])
        expect(stato.richieste.filter((r) => r.percorso === '/api/v1/chat-images').map((r) => JSON.parse(r.corpo!))).toEqual([{ nome: 'foto.png', dataUrl: 'data:image/png;base64,iVBORw==' }])
        expect(vassoio(w2)).toMatchObject([{ displayName: 'foto.png', status: 'authorized' }])
        compositore(w2).vm.$emit('send')
        await asciuga()
        expect(invii()).toEqual([{ messaggio: 'Describe the attached image.', immagini: [{ id: ID1 }] }])
        w2.unmount()
    })

    it('CIF-05 il tetto di 10 allegati vale per immagini e file insieme', async () => {
        stato.file = Array.from({ length: 11 }, (_, i) => scelto(`f${i}.bin`, 'application/octet-stream', 1))
        const w = await schermata()
        compositore(w).vm.$emit('attach')
        await asciuga()
        expect(stato.allegati).toEqual([])
        expect(compositore(w).props('attachmentError')).toBe(`${en['attachments.tooMany']} · ${en['attachments.tooManyBody'].replace('{massimo}', '10')}`)
        w.unmount()
    })
})
