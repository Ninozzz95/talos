import { describe, expect, it, vi } from 'vitest'
import { resumeTalosAgentLoop, runTalosAgentLoop, type TalosAgentLoopDeps } from '@/lib/tools/agentLoop'

/**
 * ⛔ Il checkpoint non porta i byte delle immagini.
 *
 * MISURATO dallo schermo dell'owner, 2026-08-07: in una conversazione che
 * generava immagini compariva
 * `TALOS_TOOL_AUTHORIZATION_CHECKPOINT_INVALID:loop_too_large` dentro un
 * riquadro rosso. Il checkpoint copiava i turni con il base64 dentro, e il
 * tetto è 8 MB: due immagini generate bastano.
 *
 * La cura non è alzare il tetto — è non metterci i byte. Le immagini sono già
 * nella Libreria e ogni parte porta il suo `attachmentId`.
 */

const GROSSA = 'A'.repeat(5_000_000)

function deps(patch: Partial<TalosAgentLoopDeps> = {}): TalosAgentLoopDeps {
    return {
        complete: vi.fn(async () => ({
            text: '',
            toolCalls: [{ id: 'c1', name: 'generate_image', arguments: { prompt: 'un gatto' } }],
        })) as never,
        execute: vi.fn(async () => ({
            ok: true,
            content: 'immagine creata',
            images: [{
                type: 'image' as const,
                attachmentId: 'file-del-gatto',
                name: 'gatto.png',
                mediaType: 'image/png' as const,
                base64: GROSSA,
                sha256: '',
            }],
        })) as never,
        // Un'autorizzazione pendente ferma il giro e forza il checkpoint.
        preflight: vi.fn(async () => ({ status: 'authorization_required', request: { id: 'r1' } })) as never,
        ...patch,
    }
}

describe('il peso del checkpoint', () => {
    it('⛔ i byte dell immagine NON finiscono nel checkpoint', async () => {
        // Primo giro: l'immagine entra nei turni.
        let checkpointVisto: unknown = null
        const complete = vi.fn()
            .mockResolvedValueOnce({
                text: '',
                toolCalls: [{ id: 'c1', name: 'generate_image', arguments: {} }],
            })
            .mockResolvedValue({ text: 'fatto', toolCalls: [] })

        await runTalosAgentLoop([{ role: 'user', content: 'disegna un gatto' }], deps({
            complete: complete as never,
            preflight: undefined,
            onBeforeModelCheckpoint: async (checkpoint) => { checkpointVisto = checkpoint },
        }))

        const peso = JSON.stringify(checkpointVisto).length
        // Il tetto vero è 8.000.000: senza la cura, un solo `GROSSA` da 5 MB
        // ci arriva già vicino, e due lo superano.
        expect(peso).toBeLessThan(100_000)
        // Ma il riferimento c'è, altrimenti non si potrebbe rimettere niente.
        expect(JSON.stringify(checkpointVisto)).toContain('file-del-gatto')
    })

    it('al ritorno i byte vengono RIMESSI da chi li ha', async () => {
        const rehydrateImage = vi.fn(async () => ({ base64: 'RIMESSA', mediaType: 'image/png' }))
        const complete = vi.fn(async () => ({ text: 'ecco', toolCalls: [] }))

        await resumeTalosAgentLoop(
            {
                schema_version: 1,
                stage: 'before_model',
                turns: [{
                    role: 'user',
                    content: 'guarda',
                    parts: [{
                        type: 'image', attachmentId: 'file-del-gatto', name: 'gatto.png',
                        mediaType: 'image/png', base64: '', sha256: '',
                    }],
                }],
                completion: null,
                spoken: [],
                executed: [],
                rounds: 1,
                stoppedByLimit: false,
                messageAttachments: [],
            } as never,
            deps({ complete: complete as never, preflight: undefined, rehydrateImage: rehydrateImage as never }),
        )

        expect(rehydrateImage).toHaveBeenCalledWith('file-del-gatto')
        const turniMandati = complete.mock.calls[0]![0] as Array<{ parts?: Array<{ base64: string }> }>
        expect(turniMandati[0]!.parts?.[0]?.base64).toBe('RIMESSA')
    })

    it('se i byte non si ritrovano la parte si TOGLIE, non si manda vuota', async () => {
        // Un'immagine senza byte e' un allegato che il provider rifiuta: il
        // turno morirebbe per una ragione che nessuno riuscirebbe a spiegare.
        const complete = vi.fn(async () => ({ text: 'ecco', toolCalls: [] }))

        await resumeTalosAgentLoop(
            {
                schema_version: 1,
                stage: 'before_model',
                turns: [{
                    role: 'user',
                    content: 'guarda',
                    parts: [{
                        type: 'image', attachmentId: 'sparito', name: 'x.png',
                        mediaType: 'image/png', base64: '', sha256: '',
                    }],
                }],
                completion: null,
                spoken: [],
                executed: [],
                rounds: 1,
                stoppedByLimit: false,
                messageAttachments: [],
            } as never,
            deps({
                complete: complete as never,
                preflight: undefined,
                rehydrateImage: (async () => null) as never,
            }),
        )

        const turniMandati = complete.mock.calls[0]![0] as Array<{ parts?: unknown[] }>
        expect(turniMandati[0]!.parts).toHaveLength(0)
    })
})

describe('un modello che non vede non riceve immagini', () => {
    /**
     * MISURATO sul Pad il 2026-08-07 con `deepseek-v4-flash`: si chiede
     * «disegna un gatto», il tool disegna e salva, e poi il giro passa
     * l'immagine al modello «da guardare». Il modello non ha la vista, e il
     * turno moriva con un riquadro rosso — DOPO aver fatto tutto il lavoro e
     * DOPO che l'utente aveva dato il consenso.
     *
     * L'immagine esiste lo stesso ed e' in Libreria: meglio un modello che non
     * guarda che un turno che muore.
     */
    function conImmagine(patch: Partial<TalosAgentLoopDeps> = {}): TalosAgentLoopDeps {
        const complete = vi.fn()
            .mockResolvedValueOnce({
                text: '',
                toolCalls: [{ id: 'c1', name: 'generate_image', arguments: {} }],
            })
            .mockResolvedValue({ text: 'ecco il gatto', toolCalls: [] })
        return deps({ complete: complete as never, preflight: undefined, ...patch })
    }

    it('senza vista: nessun turno con l immagine, e il giro FINISCE', async () => {
        const deps0 = conImmagine({ modelSeesImages: () => false })
        const esito = await runTalosAgentLoop([{ role: 'user', content: 'disegna' }], deps0)

        const turniMandati = (deps0.complete as ReturnType<typeof vi.fn>).mock.calls[1]![0] as
            Array<{ parts?: unknown[] }>
        expect(turniMandati.some((turno) => (turno.parts?.length ?? 0) > 0)).toBe(false)
        // E soprattutto: il giro arriva in fondo invece di morire.
        expect(esito.text).toContain('ecco il gatto')
    })

    it('con la vista: l immagine arriva, come prima', async () => {
        const deps0 = conImmagine({ modelSeesImages: () => true })
        await runTalosAgentLoop([{ role: 'user', content: 'disegna' }], deps0)

        const turniMandati = (deps0.complete as ReturnType<typeof vi.fn>).mock.calls[1]![0] as
            Array<{ parts?: unknown[] }>
        expect(turniMandati.some((turno) => (turno.parts?.length ?? 0) > 0)).toBe(true)
    })

    it('e senza il gancio si passa comunque: nessun chiamante regredisce', async () => {
        const deps0 = conImmagine()
        await runTalosAgentLoop([{ role: 'user', content: 'disegna' }], deps0)

        const turniMandati = (deps0.complete as ReturnType<typeof vi.fn>).mock.calls[1]![0] as
            Array<{ parts?: unknown[] }>
        expect(turniMandati.some((turno) => (turno.parts?.length ?? 0) > 0)).toBe(true)
    })
})
