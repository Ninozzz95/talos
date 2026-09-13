import { describe, expect, it } from 'vitest'
import { talosPercheRichiestaScartata } from '@/lib/tools/toolAuthorizations'
import type { TalosToolAuthorizationRequestV1 } from '@/lib/tools/toolAuthorizations'

/**
 * ⛔ MISURATO sul Pad il 2026-08-09, Claude Sonnet 5, «apri la calcolatrice».
 * Si tocca «Consenti» e il modello riceve lo stesso «lo strumento è ancora in
 * attesa della tua autorizzazione», che poi ripete alla persona: «dovresti
 * vedere un prompt sul telefono». Il prompt era appena stato risposto.
 *
 * Il confronto ha QUATTRO condizioni e ne restituiva una sola risposta: «no».
 * Queste righe tengono ferme le quattro, e soprattutto tengono ferma la
 * DISTINZIONE: senza il motivo si va a cercare una scheda che non esiste.
 */
const IMPRONTA = 'a'.repeat(64)
const ALTRA_IMPRONTA = 'b'.repeat(64)

function richiesta(
    sopra: Partial<TalosToolAuthorizationRequestV1> = {},
): TalosToolAuthorizationRequestV1 {
    return {
        schema_version: 1,
        id: 'req-1',
        checkpoint_id: 'chk-1',
        session_id: 'ses-1',
        send_id: 'snd-1',
        model_profile_id: 'anthropic:claude-sonnet-5',
        call_id: 'call-1',
        tool: 'app_list',
        actions: ['read'],
        input: {},
        input_digest: IMPRONTA,
        allow_persistent: true,
        decision: 'allow_turn',
        created_at: '2026-08-09T04:00:00.000Z',
        decided_at: '2026-08-09T04:00:05.000Z',
        ...sopra,
    } as TalosToolAuthorizationRequestV1
}

describe('perche una richiesta gia decisa non e valsa', () => {
    it('null quando vale: e il caso normale, e va tenuto fermo per primo', () => {
        expect(talosPercheRichiestaScartata(
            richiesta(), 'app_list', 'call-1', IMPRONTA, ['read'],
        )).toBeNull()
    })

    it('assente quando non c e proprio', () => {
        expect(talosPercheRichiestaScartata(
            undefined, 'app_list', 'call-1', IMPRONTA, ['read'],
        )).toBe('assente')
    })

    it('CHIAMATA: stesso strumento, altra chiamata', () => {
        // E' il sospetto numero uno quando il motore locale rigenera gli id a
        // ogni giro: la decisione c'e', ma appartiene a un'altra chiamata.
        expect(talosPercheRichiestaScartata(
            richiesta(), 'app_list', 'call-2', IMPRONTA, ['read'],
        )).toBe('chiamata')
    })

    it('ARGOMENTI: la stessa chiamata con argomenti diversi', () => {
        expect(talosPercheRichiestaScartata(
            richiesta(), 'app_list', 'call-1', ALTRA_IMPRONTA, ['read'],
        )).toBe('argomenti')
    })

    it('⛔ ARGOMENTI anche quando l impronta non e un SHA256', () => {
        // Una richiesta con un'impronta storta non deve valere: e' il pavimento
        // che impedisce di far passare qualunque cosa mettendoci una stringa.
        expect(talosPercheRichiestaScartata(
            richiesta({ input_digest: 'corta' }), 'app_list', 'call-1', 'corta', ['read'],
        )).toBe('argomenti')
    })

    it('AZIONI: la scheda parlava di lettura, la chiamata vuole scrivere', () => {
        // ⛔ Vale in un verso solo: chi ha visto DI PIU' e ha detto si' copre il
        // meno. Il contrario e' un permesso che nessuno ha dato.
        expect(talosPercheRichiestaScartata(
            richiesta(), 'app_list', 'call-1', IMPRONTA, ['write'],
        )).toBe('azioni')
    })

    it('AZIONI: e chi ha concesso di piu copre il meno', () => {
        expect(talosPercheRichiestaScartata(
            richiesta({ actions: ['read', 'write'] }), 'app_list', 'call-1', IMPRONTA, ['write'],
        )).toBeNull()
    })

    it('STRUMENTO: un si dato per un altro strumento non vale qui', () => {
        expect(talosPercheRichiestaScartata(
            richiesta(), 'device_torch', 'call-1', IMPRONTA, ['read'],
        )).toBe('strumento')
    })

    it('CONTRATTO: una richiesta di un formato che non conosciamo', () => {
        expect(talosPercheRichiestaScartata(
            richiesta({ schema_version: 2 as 1 }), 'app_list', 'call-1', IMPRONTA, ['read'],
        )).toBe('contratto')
    })
})
