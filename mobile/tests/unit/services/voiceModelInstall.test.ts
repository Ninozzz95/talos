import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * ⭐⭐⭐ FASE 5, BLOCCO 3b — l'orchestratore che scarica e attiva il motore
 * voce, riusando il motore di trasferimento generico che già muove i GGUF.
 *
 * ⛔ Si mocka al confine VERO — `@/services/modelTransfer` (il bridge
 * nativo), non `@/stores/modelTransfers` — cosi lo store reattivo che
 * l'orchestratore osserva (`talosModelTransfers.items`, RIASSEGNATO da
 * `applyStatus()` a ogni giro del poller, non mutato in place) è quello
 * VERO. È esattamente il posto dove un'assunzione sbagliata sul come lo
 * stato cambia si sarebbe rotta senza dirlo — vedi il test «tracks progress
 * across MULTIPLE poll ticks» qui sotto per la prova, fatta e non assunta.
 */
const bridge = vi.hoisted(() => ({
    start: vi.fn(),
    status: vi.fn(),
    acknowledge: vi.fn(async () => undefined),
}))
vi.mock('@/services/modelTransfer', () => ({
    talosAcknowledgeArrivals: bridge.acknowledge,
    talosStartModelTransfer: bridge.start,
    talosPauseModelTransfer: vi.fn(async () => ({ ok: true })),
    talosResumeModelTransfer: vi.fn(async () => ({ ok: true })),
    talosCancelModelTransfer: vi.fn(async () => ({ ok: true })),
    talosModelTransferStatus: bridge.status,
}))

const plugin = vi.hoisted(() => ({
    installManifest: vi.fn(),
    activateModel: vi.fn(),
}))
vi.mock('@/services/personalVoice', () => ({
    talosVoiceModelInstallManifest: plugin.installManifest,
    talosActivateVoiceModel: plugin.activateModel,
}))

const MANIFEST = {
    engineBuild: 'moss-nano-test',
    artifacts: [
        {
            repo: 'Org/TTS', revision: 'rev1', modelName: 'moss-nano-test/TTS-Dir', targetDir: 'TTS-Dir',
            files: [{ path: 'a.onnx', bytes: 100, sha256: 'h'.repeat(64) }],
        },
        {
            repo: 'Org/Tok', revision: 'rev2', modelName: 'moss-nano-test/Tok-Dir', targetDir: 'Tok-Dir',
            files: [{ path: 'b.onnx', bytes: 200, sha256: 'i'.repeat(64) }],
        },
    ],
}

function transferItem(modelName: string, haveBytes: number, totalBytes: number, extra: Record<string, unknown> = {}) {
    return {
        id: modelName, jobId: 1, createdAtMs: 1, phase: 'running', active: true,
        repo: 'r', revision: 'v', paths: ['p'], modelName,
        haveBytes, totalBytes, runner: 'USER_INITIATED_JOB', networkBound: true,
        failure: null, resumable: true, ...extra,
    }
}

function statusResponse(items: ReturnType<typeof transferItem>[], completed: Array<{ id: string, modelName: string }> = []) {
    return {
        phase: items[0]?.phase ?? 'idle', active: items.some((i) => i.active),
        repo: null, revision: null, paths: [], modelName: null,
        haveBytes: 0, totalBytes: 0, runner: null, networkBound: true,
        failure: null, resumable: false, readFailure: null,
        items, completed,
    }
}

beforeEach(() => {
    vi.useRealTimers()
    vi.resetModules()
    bridge.start.mockReset()
    bridge.status.mockReset()
    bridge.acknowledge.mockClear()
    plugin.installManifest.mockReset().mockResolvedValue(MANIFEST)
    plugin.activateModel.mockReset()
})

describe('talosInstallPersonalVoiceModel', () => {
    it('starts a transfer for EACH artifact, never merges them into one', async () => {
        bridge.start.mockResolvedValueOnce({
            ok: true, started: { id: 'x1', phase: 'queued', runner: 'USER_INITIATED_JOB', networkBound: true },
        }).mockResolvedValueOnce({
            ok: true, started: { id: 'x2', phase: 'queued', runner: 'USER_INITIATED_JOB', networkBound: true },
        })
        bridge.status.mockResolvedValue(statusResponse([]))
        plugin.activateModel.mockResolvedValue({ activated: true, supported: true })

        const { talosInstallPersonalVoiceModel } = await import('@/services/voiceModelInstall')
        const result = await talosInstallPersonalVoiceModel()

        expect(result).toEqual({ ok: true })
        expect(bridge.start).toHaveBeenCalledTimes(2)
        expect(bridge.start).toHaveBeenNthCalledWith(1, expect.objectContaining({ repo: 'Org/TTS', modelName: 'moss-nano-test/TTS-Dir' }))
        expect(bridge.start).toHaveBeenNthCalledWith(2, expect.objectContaining({ repo: 'Org/Tok', modelName: 'moss-nano-test/Tok-Dir' }))
    })

    /**
     * ⛔⛔ La prova che il `watch` superficiale (senza `deep: true`) basta
     * davvero, invece di un'assunzione lasciata scritta in un commento:
     * `applyStatus()` in `stores/modelTransfers.ts` fa
     * `state.items = rows.map(...)` a ogni giro del poller — RIASSEGNA
     * l'array — quindi un `watch` sulla sola identità del riferimento si
     * ri-attiva da solo. Il primo sospetto (letto solo `talosBeginModelTransfer`,
     * che invece MUTA con `.splice()`/`.push()`) sarebbe stato sbagliato se
     * lasciato scritto senza controllare chi chiama davvero durante
     * l'attesa — il poller, non quella funzione.
     */
    it('tracks progress across MULTIPLE poll ticks, not just the first snapshot', async () => {
        vi.useFakeTimers()
        bridge.start.mockResolvedValueOnce({
            ok: true, started: { id: 'x1', phase: 'queued', runner: 'USER_INITIATED_JOB', networkBound: true },
        }).mockResolvedValueOnce({
            ok: true, started: { id: 'x2', phase: 'queued', runner: 'USER_INITIATED_JOB', networkBound: true },
        })
        // ⛔ Una coda esplicita, non `mockResolvedValueOnce` incatenati:
        // `talosBeginModelTransfer` chiama `talosRefreshModelTransfer` da
        // SOLO (una volta per artifact, quindi due volte qui) PRIMA che
        // l'orchestratore inizi a osservare — una catena di "once" contati a
        // mano si sarebbe disallineata proprio su quel dettaglio, ed è
        // infatti il bug che il primo giro di questo test ha trovato.
        const queue = [
            statusResponse([transferItem('moss-nano-test/TTS-Dir', 5, 100), transferItem('moss-nano-test/Tok-Dir', 10, 200)]),
            statusResponse([transferItem('moss-nano-test/TTS-Dir', 10, 100), transferItem('moss-nano-test/Tok-Dir', 20, 200)]),
            statusResponse([transferItem('moss-nano-test/TTS-Dir', 90, 100), transferItem('moss-nano-test/Tok-Dir', 150, 200)]),
            statusResponse([]),
        ]
        bridge.status.mockImplementation(async () => queue.shift() ?? statusResponse([]))
        plugin.activateModel.mockResolvedValue({ activated: true, supported: true })

        const { talosInstallPersonalVoiceModel } = await import('@/services/voiceModelInstall')
        const progress: unknown[] = []
        const done = talosInstallPersonalVoiceModel((p) => progress.push(p))

        // Ogni giro del poller (1s) consuma UNA risposta dalla coda - il
        // terzo giro (byte avanzati) è quello che un `watch` superficiale
        // sull'array riassegnato perderebbe se `talosModelTransfers.items`
        // non cambiasse riferimento a ogni `applyStatus`.
        await vi.advanceTimersByTimeAsync(1_000)
        await vi.advanceTimersByTimeAsync(1_000)
        // Quarto giro: la lista si svuota, l'attivazione parte.
        await vi.advanceTimersByTimeAsync(1_000)

        const result = await done
        expect(result).toEqual({ ok: true })

        const downloading = progress.filter((p): p is { phase: 'downloading', haveBytes: number, totalBytes: number } =>
            (p as { phase: string }).phase === 'downloading')
        expect(downloading.length).toBeGreaterThanOrEqual(2)
        // L'ULTIMO valore osservato prima della sparizione deve essere quello
        // avanzato (90+150=240), non il primo snapshot (5+10=15) congelato -
        // questo è esattamente il numero che una callback mai richiamata di
        // nuovo lascerebbe indietro.
        expect(downloading.at(-1)).toEqual({ phase: 'downloading', haveBytes: 240, totalBytes: 300 })
        expect(progress.at(-1)).toEqual({ phase: 'done' })
    })

    it('reports failure the moment either artifact reports one, without waiting for the other', async () => {
        bridge.start.mockResolvedValueOnce({
            ok: true, started: { id: 'x1', phase: 'queued', runner: 'USER_INITIATED_JOB', networkBound: true },
        }).mockResolvedValueOnce({
            ok: true, started: { id: 'x2', phase: 'queued', runner: 'USER_INITIATED_JOB', networkBound: true },
        })
        bridge.status.mockResolvedValue(statusResponse([
            transferItem('moss-nano-test/TTS-Dir', 10, 100),
            transferItem('moss-nano-test/Tok-Dir', 20, 200, { failure: 'hash-mismatch' }),
        ]))

        const { talosInstallPersonalVoiceModel } = await import('@/services/voiceModelInstall')
        const result = await talosInstallPersonalVoiceModel()
        expect(result).toEqual({ ok: false, reason: 'hash-mismatch' })
        expect(plugin.activateModel).not.toHaveBeenCalled()
    })

    /**
     * ⛔ AL CONTRARIO: se `activateModel` (il lato nativo, che ricontrolla i
     * file veri) dice che non era davvero tutto arrivato, l'orchestratore
     * non deve dichiarare successo solo perché la lista si è svuotata.
     */
    it('does not claim success if native activation refuses - the list emptying is not proof by itself', async () => {
        bridge.start.mockResolvedValueOnce({
            ok: true, started: { id: 'x1', phase: 'queued', runner: 'USER_INITIATED_JOB', networkBound: true },
        }).mockResolvedValueOnce({
            ok: true, started: { id: 'x2', phase: 'queued', runner: 'USER_INITIATED_JOB', networkBound: true },
        })
        bridge.status.mockResolvedValue(statusResponse([]))
        plugin.activateModel.mockResolvedValue({ activated: false, supported: false })

        const { talosInstallPersonalVoiceModel } = await import('@/services/voiceModelInstall')
        const result = await talosInstallPersonalVoiceModel()
        expect(result).toEqual({ ok: false, reason: 'not-activated' })
    })

    it('stops before starting any transfer when the manifest itself is empty', async () => {
        plugin.installManifest.mockResolvedValue({ engineBuild: 'x', artifacts: [] })
        const { talosInstallPersonalVoiceModel } = await import('@/services/voiceModelInstall')
        const result = await talosInstallPersonalVoiceModel()
        expect(result).toEqual({ ok: false, reason: 'empty-manifest' })
        expect(bridge.start).not.toHaveBeenCalled()
    })
})
