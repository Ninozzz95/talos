import { describe, expect, it } from 'vitest'
// Il server importa il kernel col percorso del telefono: `vitest.config.ts` lo mappa sul kernel del repository.
import * as moduloHttp from '../../../android/app/src/main/assets/talos-harness-ui/harness-ui/src/http-app.mjs'
import { createSessionRegistry } from '../../../android/app/src/main/assets/talos-harness-ui/harness-ui/src/session-registry.mjs'

const { requireCustomTaskBody } = moduloHttp as unknown as { requireCustomTaskBody(corpo: unknown): Record<string, unknown> }

/**
 * REG-RAG-COD-13 — regressione trovata sul Pad il 24/09/2026 alle 23:41 (RAG-COD, barra del composer collegata al
 * Codice): una sessione nuova non partiva, «Avvio non riuscito: Query non valida». La POST
 * `/api/v1/sessions/custom` portava `reasoning: {effort: 'high'}`, e `requireCustomTaskBody` (`http-app.mjs`) non
 * ammetteva `reasoning` — il commento sopra lo diceva: «il canonico valida anche reasoning […] con helper che […] non
 * esistono ancora qui». Lo stesso buco c'era già con la barra interna del Codice (EFFORT-PICKER-01 lo prova solo contro
 * un server finto). Cura: il validatore del desktop (`reasoningRichiestaValido`, `AVM-harness-desktop/harness-ui/src/
 * config.mjs:249`, sola lettura) e il passaggio fino al giro.
 */
describe('REG-RAG-COD-13 il Codice accetta il livello di ragionamento all’avvio di una sessione', () => {
    const base = { cartellaId: 'workspace', consegna: 'ciao', client: 'mobile', modello: 'z-ai/glm-5.3-flash' }

    it('il corpo con reasoning è valido e il livello torna al chiamante', () => {
        expect(requireCustomTaskBody({ ...base, reasoning: { effort: 'high' } })).toMatchObject({ reasoning: { effort: 'high' } })
        expect(requireCustomTaskBody({ ...base, reasoning: { effort: 'none' } })).toMatchObject({ reasoning: { effort: 'none' } })
        expect(requireCustomTaskBody({ ...base, reasoning: { effort: 'max', summary: 'auto' } }))
            .toMatchObject({ reasoning: { effort: 'max', summary: 'auto' } })
        expect(requireCustomTaskBody(base).reasoning ?? null).toBeNull()
    })

    it('un reasoning malformato resta rifiutato', () => {
        for (const reasoning of [{ effort: 'turbo' }, { effort: 'high', extra: 1 }, [], 'high', {}, { summary: 'lungo' }]) {
            expect(() => requireCustomTaskBody({ ...base, reasoning })).toThrow()
        }
    })

    it('avviaLibero passa il livello al giro della sessione', async () => {
        const ricevuti: Array<Record<string, unknown>> = []
        const registro = createSessionRegistry({
            cartellaStore: '/finta',
            chiave: 'chiave-finta-mai-usata-in-rete',
            registraRigaFn: async () => undefined,
            elencaSessioniPersistiteFn: async () => [],
            preparaEsecuzioneLiberaFn: () => ({ cartella: '/finta/workspace', task: { consegna: 'ciao' }, comandoProva: null }),
            avviaSessioneFn: async (argomenti: Record<string, unknown>) => {
                ricevuti.push(argomenti)
                return { threadId: 't', runId: 'r', ok: true, esito: { comeFinita: 'concluso' }, erroreInterno: null }
            },
        } as never)
        const esito = registro.avviaLibero({
            cartellaId: 'workspace', consegna: 'ciao', modello: 'z-ai/glm-5.3-flash', mobile: true,
            reasoning: { effort: 'high' },
        } as never) as Record<string, unknown>
        expect(esito.erroreAvvio).toBeUndefined()
        await new Promise((ok) => setTimeout(ok, 0))
        expect(ricevuti[0]?.reasoning).toEqual({ effort: 'high' })
    })
})
