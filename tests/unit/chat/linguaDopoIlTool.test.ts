import { describe, expect, it } from 'vitest'
import { talosProjectLocalToolConversation } from '@/lib/chat/localToolPromptProtocol'

/**
 * ⛔⛔ LINGUA-DOPO-IL-TOOL-01 — l'esito è in inglese, e il modello ci passa.
 *
 * ## Misurato sul Pad il 2026-08-19, `gemma-3-4b-it-Q4_K_M`
 *
 *   «Ciao, come stai?»                     → «Ciao! Sto bene…»          ITALIANO ✓
 *   «Dimmi le coordinate del telefono»      → «The phone's coordinates…» INGLESE  ✗
 *
 * La differenza è cosa ha letto per ultimo: il risultato del tool, che i nostri
 * strumenti scrivono in inglese perché è la lingua in cui parlano ai modelli.
 *
 * ## Cosa dice la ricerca (2026-08-19)
 *
 * È un difetto noto e ha un nome: **language consistency bottleneck** — compito
 * risolto bene, lingua sbagliata. Il lavoro di agosto 2026 «When the API Speaks
 * the Wrong Language» studia esattamente questo caso (output degli strumenti in
 * inglese, risposta nella lingua sbagliata) e conclude che si cura col
 * **post-training**.
 *
 * ⇒ Su un GGUF di terzi il post-training non è una leva che abbiamo. Quella che
 * abbiamo è **la posizione del promemoria**: la riga sulla lingua sta nel
 * prompt di sistema, cioè all'inizio, mentre l'inglese del tool è l'ultima cosa
 * che il modello legge prima di rispondere. Si mette il promemoria **dove
 * guarda per ultimo**: in fondo alla busta dei risultati.
 *
 * ⛔ E la riga di sistema NON si toglie: le due non si escludono, e il confronto
 * del 19/8 dice perché vale la pena — alla stessa domanda Gemini risponde «non
 * ho accesso alle coordinate GPS», in italiano. Noi il dato ce l'abbiamo: ci
 * manca solo di dirlo nella lingua giusta.
 */

const RISULTATI = [{
    role: 'tool',
    name: 'device_location',
    tool_call_id: 'c1',
    content: 'Latitude 41.899925, longitude 12.478631 (accurate to about 18 m).',
}]

const TURNI = [
    { role: 'system', content: 'You are TALOS.' },
    { role: 'user', content: 'Dimmi le coordinate del telefono' },
    {
        role: 'assistant',
        content: '',
        tool_calls: [{ type: 'function' as const, id: 'c1', function: { name: 'device_location', arguments: '{}' } }],
    },
    ...RISULTATI,
]

function bustaDi(locale: string | null | undefined): string {
    const proiezione = talosProjectLocalToolConversation({
        transport: 'prompt-json-v1',
        turns: TURNI as never,
        tools: [{ type: 'function', function: { name: 'device_location' } }],
        capabilities: { supportsTools: false, supportsToolCalls: false, supportsSystemRole: true },
        locale,
    } as never)
    // La busta è l'ultimo turno utente della proiezione: quello che il modello
    // legge subito prima di rispondere.
    const ultimo = [...proiezione.turns].reverse().find((turno) => turno.role === 'user')
    return ultimo?.content ?? ''
}

describe('LINGUA-DOPO-IL-TOOL-01 il promemoria sta dove il modello guarda per ultimo', () => {
    it('la busta dei risultati nomina la lingua della persona', () => {
        const busta = bustaDi('it')
        expect(busta).toContain('Italian')
    })

    it('la nomina anche per un\'altra lingua, senza tabelle scritte a mano', () => {
        expect(bustaDi('de')).toContain('German')
        expect(bustaDi('pt-BR')).toContain('Portuguese')
    })

    it('il promemoria arriva DOPO i dati, non prima', () => {
        const busta = bustaDi('it')
        expect(busta.indexOf('Italian')).toBeGreaterThan(busta.indexOf('41.899925'))
    })

    it('senza locale la busta resta quella di prima, senza righe monche', () => {
        const busta = bustaDi(null)
        expect(busta).toContain('41.899925')
        expect(busta).not.toMatch(/reply in\s*\./i)
    })

    it('⛔ i dati del tool restano marcati come non fidati', () => {
        expect(bustaDi('it')).toContain('untrusted tool data')
    })
})
