// @vitest-environment jsdom

import { reactive } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Rientrando nella pagina del repository, la barra del download in corso non si vedeva da nessuna parte.
 *
 * ## Il difetto, MISURATO sul Pad il 22/10/2026 (APK di prova dal worktree)
 *
 * /settings/models/local/unsloth/Qwen3-1.7B-GGUF, con Q4_0 già sul telefono: si sceglie la scheda Q8_0, «Scarica
 * Q8_0», la barra compare. Si esce verso /settings/models/local e si rientra mentre il nativo è ancora `running`
 * (821 MB di 1,8 GB). La pagina riparte su Q4_0 — «Già sul dispositivo · Q4_0» — e `[role=progressbar]` vale ZERO
 * fino alla fine; nella fila delle varianti (IQ1_S…Q8_0) nessun segno di quale si sta scaricando.
 *
 * Atteso: senza una scelta della persona la pagina si apre sulla variante IN SCARICAMENTO (quella i cui `paths`
 * contengono la chiave della riga), e la sua scheda nella fila porta lo stato di download.
 */

const REPO = 'unsloth/Qwen3-1.7B-GGUF'
const Q4 = 'Qwen3-1.7B-Q4_0.gguf'
const Q8 = 'Qwen3-1.7B-Q8_0.gguf'
const TOTALE_Q8 = 1_800_000_000

const harness = vi.hoisted(() => ({
    state: null as never,
    installati: [] as Array<{ path: string, bytes: number, name: string, chattable: boolean }>,
    release: vi.fn(),
}))

vi.mock('@/stores/modelTransfers', () => ({
    talosPauseManagedModelTransfer: vi.fn(async () => ({ ok: true as const })),
    talosResumeManagedModelTransfer: vi.fn(async () => ({ ok: true as const })),
    talosCancelManagedModelTransfer: vi.fn(async () => ({ ok: true as const })),
    talosRetainModelTransferObserver: vi.fn(() => harness.release),
}))

vi.mock('@/stores/localModels', () => ({
    talosLocalModels: new Proxy({}, { get: (_, key) => harness.state[key as never] }),
    talosOpenModelRepo: vi.fn(async () => undefined),
    talosCloseModelRepo: vi.fn(),
    talosDescribeModelRepo: vi.fn(async () => null),
    talosExamineSet: vi.fn(async () => undefined),
    talosExamineRepo: vi.fn(async () => undefined),
    talosDownloadSet: vi.fn(async () => ({ ok: true as const })),
    talosSetLocalContext: vi.fn(),
    talosSetLocalKvCacheType: vi.fn(),
    talosRefreshDeviceCapacity: vi.fn(async () => undefined),
    talosRefreshLeftovers: vi.fn(async () => undefined),
    talosRefreshHuggingFaceToken: vi.fn(async () => undefined),
}))

// Solo l'elenco dei file sul telefono è finto: il resto del modulo resta quello vero.
vi.mock('@/services/localEngine', async (importOriginal) => ({
    ...await importOriginal<typeof import('@/services/localEngine')>(),
    talosLocalInstalledModels: vi.fn(async () => ({ models: [...harness.installati], unreadable: [] })),
}))

vi.mock('@/services/clipboard', () => ({ writeTalosClipboardText: vi.fn(async () => undefined) }))

import TalosMobileLocalRepoDetail from '@/components/talos/models/TalosMobileLocalRepoDetail.vue'

function variante(label: string, path: string, bytes: number) {
    return {
        label, quantisation: label, paths: [path], sizes: [bytes], totalBytes: bytes, sha256: ['a'.repeat(64)],
        incomplete: false, expectedShards: 1, foundShards: 1, security: 'safe', examination: { state: 'unread' },
    }
}

function fileSulTelefono(path: string, bytes: number) {
    return { path: `/data/user/0/ai.talos.dev/files/models/${REPO}/${path}`, bytes, name: path, chattable: true }
}

/** La riga del trasferimento come la proietta lo store dal nativo: Q8_0 a 821 MB di 1,8 GB. */
function trasferimentoQ8(phase = 'running', haveBytes = 821_000_000) {
    return {
        id: 'transfer-q8', jobId: 100_102, createdAtMs: 1, phase, active: phase !== 'paused',
        repo: REPO, revision: 'main', paths: [Q8], modelName: 'Qwen3-1.7B-GGUF Q8_0',
        haveBytes, totalBytes: TOTALE_Q8, runner: 'USER_INITIATED_JOB', networkBound: true,
        failure: null, resumable: true,
    }
}

beforeEach(() => {
    harness.release.mockClear()
    harness.installati = [fileSulTelefono(Q4, 1_000_000_000)]
    harness.state = reactive({
        repo: {
            id: REPO, revision: 'main', loading: false, failure: null,
            sets: [
                variante('IQ1_S', 'Qwen3-1.7B-IQ1_S.gguf', 500_000_000),
                variante('Q4_0', Q4, 1_000_000_000),
                variante('Q8_0', Q8, TOTALE_Q8),
            ],
        },
        device: { availableRamBytes: 5 * 1024 ** 3, freeStorageBytes: 20 * 1024 ** 3, lowMemoryThresholdBytes: 0 },
        context: 4096,
        kvCacheType: 'auto',
        transfer: { items: [trasferimentoQ8()], active: true, paused: false, modelName: null, haveBytes: 0, totalBytes: 0, runner: null, networkBound: true, failure: null },
        leftovers: { items: [], totalBytes: 0 },
    }) as never
})

async function rientra() {
    const wrapper = mount(TalosMobileLocalRepoDetail, { props: { repoId: REPO, revision: 'main' } })
    await flushPromises()
    return wrapper
}

describe('rientro nella pagina del repository con un download in corso', () => {
    it('si apre sulla variante in scaricamento, con la sua barra, non su quella già sul telefono', async () => {
        const wrapper = await rientra()

        expect(wrapper.get('[data-testid="talos-models-variant-label"]').text()).toBe('Q8_0')
        expect(wrapper.findAll('[role="progressbar"]').length).toBeGreaterThan(0)
        const barra = wrapper.get('[data-testid="talos-models-download-progress"]')
        expect(barra.attributes('aria-valuenow')).toBe('46')
        expect(wrapper.find('[data-testid="talos-models-downloaded"]').exists()).toBe(false)
        wrapper.unmount()
    })

    it('la scheda della variante in scaricamento lo dice nella fila, e solo lei', async () => {
        const wrapper = await rientra()

        const segno = wrapper.get(`[data-testid="talos-models-rail-downloading-${Q8}"]`)
        expect(segno.text()).toContain('46%')
        // Lo stato a parole, dalla stessa chiave del Centro download (en e it ci sono già).
        expect(segno.text()).toContain('Downloading')
        expect(wrapper.find(`[data-testid="talos-models-rail-downloading-${Q4}"]`).exists()).toBe(false)
        wrapper.unmount()
    })

    it('la scelta della persona vince: toccata Q4_0 resta Q4_0, e la scheda Q8_0 tiene il suo segno', async () => {
        const wrapper = await rientra()

        await wrapper.get(`[data-testid="talos-models-rail-${Q4}"]`).trigger('click')
        await flushPromises()

        expect(wrapper.get('[data-testid="talos-models-variant-label"]').text()).toBe('Q4_0')
        expect(wrapper.find('[data-testid="talos-models-downloaded"]').exists()).toBe(true)
        expect(wrapper.find(`[data-testid="talos-models-rail-downloading-${Q8}"]`).exists()).toBe(true)
        wrapper.unmount()
    })

    it('a download finito resta su Q8_0 e dice «già sul dispositivo», senza saltare su Q4_0', async () => {
        const wrapper = await rientra()
        expect(wrapper.get('[data-testid="talos-models-variant-label"]').text()).toBe('Q8_0')

        // Il nativo ha finito: la riga sparisce e il file compare sul telefono.
        harness.installati = [fileSulTelefono(Q4, 1_000_000_000), fileSulTelefono(Q8, TOTALE_Q8)]
        harness.state.transfer.items = []
        await flushPromises()

        expect(wrapper.get('[data-testid="talos-models-variant-label"]').text()).toBe('Q8_0')
        expect(wrapper.get('[data-testid="talos-models-downloaded"]').text()).toContain('Q8_0')
        expect(wrapper.find(`[data-testid="talos-models-rail-downloading-${Q8}"]`).exists()).toBe(false)
        wrapper.unmount()
    })
})

/*
 * Revisione avversaria del 22/10/2026, rilievo 9 — l'osservatore `resta-sulla-variante-finita` e la scelta della riga.
 */
describe('la variante in scaricamento: repository cambiato, due download, trasferimenti fermi', () => {
    const IQ1 = 'Qwen3-1.7B-IQ1_S.gguf'

    function trasferimento(path: string, phase: string, id: string) {
        return { ...trasferimentoQ8(phase), id, paths: [path], active: phase === 'running' }
    }

    it('RD-09a cambiando repository la variante del vecchio non resta «scelta»: nel nuovo, a download finito, si resta sulla sua', async () => {
        const wrapper = await rientra()
        expect(wrapper.get('[data-testid="talos-models-variant-label"]').text()).toBe('Q8_0')

        // Un altro repository, con la sua variante B in scaricamento e la A già sul telefono.
        const ALTRO = 'bartowski/Altro-GGUF'
        const A = 'Altro-Q4_0.gguf'
        const B = 'Altro-Q8_0.gguf'
        harness.installati = [{ path: `/data/user/0/ai.talos.dev/files/models/${ALTRO}/${A}`, bytes: 1, name: A, chattable: true }]
        await wrapper.setProps({ repoId: ALTRO })
        harness.state.repo = { id: ALTRO, revision: 'main', loading: false, failure: null, sets: [variante('Q4_0', A, 1_000_000_000), variante('Q8_0', B, TOTALE_Q8)] } as never
        harness.state.transfer.items = [{ ...trasferimentoQ8(), id: 'transfer-b', repo: ALTRO, paths: [B] }] as never
        await flushPromises()
        expect(wrapper.get('[data-testid="talos-models-variant-label"]').text()).toBe('Q8_0')

        // B finisce: la pagina resta su B, non salta su A.
        harness.installati = [...harness.installati, { path: `/data/user/0/ai.talos.dev/files/models/${ALTRO}/${B}`, bytes: 1, name: B, chattable: true }]
        harness.state.transfer.items = [] as never
        await flushPromises()

        expect(wrapper.get('[data-testid="talos-models-variant-label"]').text()).toBe('Q8_0')
        wrapper.unmount()
    })

    it('RD-09b due varianti in scaricamento: finita la prima, la pagina resta su quella che si guardava', async () => {
        harness.state.transfer.items = [trasferimento(IQ1, 'running', 'transfer-iq1'), trasferimento(Q8, 'running', 'transfer-q8')] as never
        const wrapper = await rientra()
        expect(wrapper.get('[data-testid="talos-models-variant-label"]').text()).toBe('IQ1_S')

        harness.installati = [...harness.installati, fileSulTelefono(IQ1, 500_000_000)]
        harness.state.transfer.items = [trasferimento(Q8, 'running', 'transfer-q8')] as never
        await flushPromises()

        expect(wrapper.get('[data-testid="talos-models-variant-label"]').text()).toBe('IQ1_S')
        wrapper.unmount()
    })

    it('RD-09c un trasferimento fallito prima nella fila non nasconde quello che sta scaricando', async () => {
        harness.state.transfer.items = [trasferimento(IQ1, 'failed', 'transfer-iq1'), trasferimento(Q8, 'running', 'transfer-q8')] as never

        const wrapper = await rientra()

        expect(wrapper.get('[data-testid="talos-models-variant-label"]').text()).toBe('Q8_0')
        wrapper.unmount()
    })

    it('RD-09c AL CONTRARIO — solo una variante in pausa: la pagina si apre su di lei, come prima', async () => {
        harness.state.transfer.items = [trasferimento(Q8, 'paused', 'transfer-q8')] as never

        const wrapper = await rientra()

        expect(wrapper.get('[data-testid="talos-models-variant-label"]').text()).toBe('Q8_0')
        wrapper.unmount()
    })
})
