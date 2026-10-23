import { describe, expect, it, vi } from 'vitest'
import { carteAperteR4, creaSegnaleVista } from '@/lib/remoto/cartaVista'

/**
 * ⛔ R-M5a, `device.seen` (contratto col Desktop, 21/10/2026, dopo la prova dal vivo): «collegato» non vuol dire «visto». Dal Pad: app
 * uccisa con la carta appena nata, la connessione QUIC morta è rimasta «in linea» ~30 s e il PC ha tolto la sveglia ⇒ nessuna
 * notifica. Ora il PC toglie la sveglia SOLO su `device.seen {sessionId}` (per sessione e discendenti, idempotente, vale per le novità
 * nate prima); a telefono collegato senza conferma la sveglia parte dopo 10 s. Il telefono conferma quando una carta (permesso, domanda,
 * piano, anche di una figlia disegnata nella madre) è sullo schermo con l'app VISIBILE.
 */
const msg = (id: string, metadata: Record<string, unknown>) => ({ id, metadata })

describe('la carta vista dal telefono (device.seen)', () => {
    it('CV-01 le carte aperte sono permesso, domanda e piano con esito ancora nullo; quelle risposte no', () => {
        const messaggi = [
            msg('m1', { approvazione: { requestId: 'r1', azione: {}, esito: null } }),
            msg('m2', { domanda: { requestId: 'q1', questions: [], esito: { risposte: [] } } }),
            msg('m3', { piano: { proposta: 'x', esito: null } }),
            msg('m4', { approvazione: { requestId: 'r2', azione: {}, esito: null, figlia: { sessionId: 'f1' } } }),
            msg('m5', {}),
            { id: 'm6' },
        ]
        expect(carteAperteR4(messaggi)).toEqual(['approvazione:r1', 'piano:m3', 'approvazione:r2'])
    })

    it('CV-02 una carta nuova a schermo visibile manda device.seen una volta; un aggiornamento con la stessa carta no', async () => {
        const invia = vi.fn(async () => undefined)
        const s = creaSegnaleVista({ invia, visibile: () => true })
        s.aggiorna('s1', ['approvazione:r1'])
        s.aggiorna('s1', ['approvazione:r1'])
        expect(invia).toHaveBeenCalledTimes(1)
        expect(invia).toHaveBeenCalledWith('s1', ['approvazione:r1'])
        s.aggiorna('s1', ['approvazione:r1', 'domanda:q1'])
        expect(invia).toHaveBeenCalledTimes(2)
        s.aggiorna('s1', [])
        expect(invia).toHaveBeenCalledTimes(2)
    })

    it('CV-03 app nascosta: niente conferma (la sveglia deve partire); tornata visibile con la carta ancora lì: conferma', () => {
        const invia = vi.fn(async () => undefined)
        let visibile = false
        const s = creaSegnaleVista({ invia, visibile: () => visibile })
        s.aggiorna('s1', ['approvazione:r1'])
        expect(invia).not.toHaveBeenCalled()
        visibile = true
        s.tornataVisibile()
        expect(invia).toHaveBeenCalledWith('s1', ['approvazione:r1'])
        // nascosta e di nuovo visibile: la stessa carta si riconferma (il PC ha potuto svegliare nel frattempo; è idempotente)
        visibile = false
        s.nascosta()
        visibile = true
        s.tornataVisibile()
        expect(invia).toHaveBeenCalledTimes(2)
    })

    it('CV-04 senza sessione o senza carte non si manda niente; un rifiuto del PC non esce come errore', async () => {
        const invia = vi.fn(async () => { throw Object.assign(new Error('x'), { code: 'NOT_FOUND' }) })
        const s = creaSegnaleVista({ invia, visibile: () => true })
        s.aggiorna(null, ['approvazione:r1'])
        s.aggiorna('s1', [])
        expect(invia).not.toHaveBeenCalled()
        s.aggiorna('s1', ['domanda:q9'])
        await new Promise((r) => setTimeout(r, 0))
        expect(invia).toHaveBeenCalledTimes(1)
    })

    it('CV-05 una conferma che non parte (canale non pronto, PC che rifiuta) si ritenta al prossimo aggiornamento', async () => {
        let riuscire = false
        const invia = vi.fn(async () => { if (!riuscire) throw new Error('canale') })
        const s = creaSegnaleVista({ invia, visibile: () => true })
        s.aggiorna('s1', ['domanda:q1'])
        await new Promise((r) => setTimeout(r, 0))
        riuscire = true
        s.aggiorna('s1', ['domanda:q1'])
        await new Promise((r) => setTimeout(r, 0))
        expect(invia).toHaveBeenCalledTimes(2)
        s.aggiorna('s1', ['domanda:q1'])
        expect(invia).toHaveBeenCalledTimes(2)
    })
})
