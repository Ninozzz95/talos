import { describe, expect, it } from 'vitest'
import {
    TALOS_EMPTY_TOOL_AUTHORIZATIONS,
    resolveTalosToolAuthorization,
    type TalosToolAuthorizationRequestV1,
} from '@/lib/tools/toolAuthorizations'

/**
 * ⛔ «Per questa richiesta» — la strada nuova, guardata riga per riga.
 *
 * La regola che questi test fissano vale piu' di tutte le altre: **in questo
 * contratto `allow_turn` non aggiunge nessun potere**. Consente la chiamata che
 * l'ha chiesta e non scrive nessuna concessione permanente — esattamente come
 * «una volta».
 *
 * Tutto l'allargamento vive nel piano IN MEMORIA, che muore col turno. E' una
 * scelta deliberata: se un giorno un difetto portasse questa strada fuori
 * strada, al peggio si comporterebbe come «una volta» — mai come «sempre».
 */

/**
 * ⛔ Un'impronta VERA, 64 esadecimali.
 *
 * `exactRequest` la valida con `SHA256.test`, e la prima versione di questo
 * test usava «abc»: la richiesta non combaciava e tutto rispondeva `ask`. Il
 * codice e' piu' severo di quanto avessi assunto, ed e' la direzione giusta —
 * un'impronta malformata non deve poter far passare niente.
 */
const IMPRONTA = 'a'.repeat(64)
const ALTRA = 'b'.repeat(64)

function richiesta(
    patch: Partial<TalosToolAuthorizationRequestV1> = {},
): TalosToolAuthorizationRequestV1 {
    return {
        schema_version: 1,
        id: 'r1',
        checkpoint_id: 'k1',
        session_id: 's1',
        send_id: 'i1',
        model_profile_id: null,
        call_id: 'c1',
        tool: 'web_search',
        actions: ['outbound'],
        input: { q: 'x' },
        input_digest: IMPRONTA,
        allow_persistent: true,
        decision: 'allow_turn',
        created_at: '2026-08-07T00:00:00.000Z',
        ...patch,
    } as TalosToolAuthorizationRequestV1
}

function base() {
    return {
        tool: 'web_search',
        requiredActions: ['outbound'] as const,
        permissions: { read: 'ask', write: 'ask', outbound: 'ask' } as const,
        grants: TALOS_EMPTY_TOOL_AUTHORIZATIONS,
        callId: 'c1',
        inputDigest: IMPRONTA,
    }
}

describe('allow_turn nel contratto delle autorizzazioni', () => {
    it('consente la chiamata che l ha chiesta', () => {
        const esito = resolveTalosToolAuthorization({ ...base(), request: richiesta() })
        expect(esito.status).toBe('allowed')
    })

    it('⛔ e la consente come «una volta», NON come una concessione permanente', () => {
        // La `source` non e' cosmetica: distingue nel registro un permesso che
        // muore da uno che resta.
        const esito = resolveTalosToolAuthorization({ ...base(), request: richiesta() })
        expect(esito).toMatchObject({ source: 'allow_turn' })
    })

    it('⛔ non vale per una chiamata DIVERSA, nemmeno dello stesso tool', () => {
        // L'allargamento a piu' passi lo fa il PIANO, con i suoi due pavimenti.
        // Questo contratto resta legato alla singola richiesta.
        const esito = resolveTalosToolAuthorization({
            ...base(),
            callId: 'un-altra-chiamata',
            request: richiesta(),
        })
        expect(esito.status).not.toBe('allowed')
    })

    it('⛔ non vale se gli argomenti sono cambiati', () => {
        const esito = resolveTalosToolAuthorization({
            ...base(),
            inputDigest: ALTRA,
            request: richiesta(),
        })
        expect(esito.status).not.toBe('allowed')
    })

    it('non ha bisogno di `allow_persistent`: non e una concessione permanente', () => {
        const esito = resolveTalosToolAuthorization({
            ...base(),
            request: richiesta({ allow_persistent: false }),
        })
        expect(esito.status).toBe('allowed')
    })

    it('e un «nega» resta un nega, qualunque cosa venga dopo', () => {
        const esito = resolveTalosToolAuthorization({
            ...base(),
            request: richiesta({ decision: 'deny' }),
        })
        expect(esito.status).toBe('denied')
    })
})
