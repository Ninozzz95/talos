import { describe, expect, it, vi } from 'vitest'
import { createTalosVisualArtifactTools } from '@/lib/tools/artifactTools'

/**
 * ⛔⛔⛔ Owner 2026-08-27 — «creare artefatti HTML interattivi in chat, come
 * fa ChatGPT: spirografi, simulazioni». `sources.create` è iniettato (mai
 * `TalosArtifactBridge` chiamato direttamente): il vero isolamento vive in
 * `TalosArtifactActivity.kt`/`TalosArtifactPathHandler.kt`, verificato sul
 * Pad (bridge irraggiungibile, `connect-src 'none'` blocca davvero
 * `fetch`) — qui si prova solo il contratto del tool, non la sandbox.
 */
describe('artifact_create — il tool che mostra un HTML isolato in chat', () => {
    it('un successo produce la scheda "artefatto" con titolo e id, non l\'HTML', async () => {
        const create = vi.fn(async () => ({ id: 'a1b2c3' }))
        const [tool] = createTalosVisualArtifactTools({ create })
        const result = await tool!.run(
            { title: 'Spirograph', html: '<!doctype html><html><body>x</body></html>' } as never,
            { sessionId: null },
        )
        expect(result.ok).toBe(true)
        expect(result.scheda).toEqual({ tipo: 'artefatto', titolo: 'Spirograph', id: 'a1b2c3' })
        expect(create).toHaveBeenCalledWith('Spirograph', '<!doctype html><html><body>x</body></html>')
        // ⛔ L'HTML non deve mai comparire nel risultato che il modello
        // legge — solo l'id, per lo stesso motivo per cui non viaggia
        // nell'Intent nativo (vedi TalosArtifactStore.kt).
        expect(JSON.stringify(result)).not.toContain('<body>x</body>')
    })

    it('un fallimento col codice TALOS_* leggibile lo passa intatto', async () => {
        const create = vi.fn(async () => { throw new Error('TALOS_ARTIFACT_TOO_LARGE') })
        const [tool] = createTalosVisualArtifactTools({ create })
        const result = await tool!.run(
            { title: 'x', html: 'y' } as never,
            { sessionId: null },
        )
        expect(result.ok).toBe(false)
        expect(result.code).toBe('TALOS_ARTIFACT_TOO_LARGE')
    })

    /*
     * ⛔ Verso contrario: un errore SENZA la forma TALOS_* (es. un'eccezione
     * nativa grezza) non deve trapelare com'è — cade su un codice generico
     * leggibile, mai il messaggio originale nel `content` che il modello
     * ripete alla persona.
     */
    it('⛔ un errore senza la forma TALOS_* cade su un codice generico, non il messaggio grezzo', async () => {
        const create = vi.fn(async () => { throw new Error('java.lang.SecurityException: boom') })
        const [tool] = createTalosVisualArtifactTools({ create })
        const result = await tool!.run(
            { title: 'x', html: 'y' } as never,
            { sessionId: null },
        )
        expect(result.ok).toBe(false)
        expect(result.code).toBe('TALOS_ARTIFACT_CREATE_FAILED')
        expect(result.content).not.toContain('SecurityException')
    })
})
