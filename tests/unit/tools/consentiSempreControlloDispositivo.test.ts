import { describe, expect, it } from 'vitest'
import {
    TALOS_EMPTY_TOOL_AUTHORIZATIONS,
    applyTalosToolAuthorizationGrant,
    resolveTalosToolAuthorization,
} from '@/lib/tools/toolAuthorizations'


/**
 * ⛔⛔ ORDINE DELL'OWNER, 2026-08-13, ripetuto tre volte:
 *
 * > «voglio che metti quel maledetto pulsante consenti sempre e ci deve essere
 * > anche per il controllo dispositivo. Non voglio nessuna eccezione. Sarà
 * > l'utente a consentirlo. Quindi non è un problema.»
 *
 * Il bottone spariva per TRE cancelli in fila, e questo test morde sul terzo —
 * quello che non sapeva nemmeno che l'eccezione esistesse.
 *
 * ⛔ Il test è scritto per FALLIRE col codice di prima: con
 * `allow_persistent: input.forceConfirmation !== true` il primo caso dà
 * `false`. Se un giorno tornasse quella riga, questo file diventa rosso.
 */
describe('⛔ «Consenti sempre» per il controllo del dispositivo', () => {
    const base = {
        tool: 'device_screen_drive' as const,
        requiredActions: ['write', 'outbound'] as const,
        permissions: { read: 'allow', write: 'ask', outbound: 'ask' } as const,
        grants: TALOS_EMPTY_TOOL_AUTHORIZATIONS,
    }

    it('il tool che dichiara l\'eccezione OFFRE il sempre, anche con confirmation always', () => {
        const esito = resolveTalosToolAuthorization({
            ...base,
            forceConfirmation: true,
            sempreConsentibile: true,
        } as never)
        expect(esito.status).toBe('ask')
        expect((esito as { allow_persistent: boolean }).allow_persistent).toBe(true)
    })

    /*
     * ⛔ E LA METÀ CONTRARIA, che è la prova che la porta non si è spalancata
     * per tutti: senza l'eccezione scritta nel catalogo, `forceConfirmation`
     * continua a spegnere il «sempre» esattamente come prima.
     */
    it('senza eccezione dichiarata il sempre resta spento', () => {
        const esito = resolveTalosToolAuthorization({
            ...base,
            forceConfirmation: true,
        } as never)
        expect(esito.status).toBe('ask')
        expect((esito as { allow_persistent: boolean }).allow_persistent).toBe(false)
    })

    /*
     * ⛔⛔ IL QUARTO CANCELLO, e senza questo gli altri tre non servono a niente.
     *
     * MISURATO sul Pad: toccato «Consenti sempre», la richiesta SUCCESSIVA
     * chiedeva di nuovo. Il bottone c'era, la concessione veniva scritta, e non
     * veniva mai riletta — perche' `forceConfirmation` spegneva la
     * consultazione del grant PRIMA di guardarlo.
     *
     * Un «sempre» che si puo' dare e non vale mai e' peggio di un «sempre» che
     * non c'e': la persona crede di aver deciso, e la decisione non esiste.
     */
    it('concesso il sempre, la volta dopo NON chiede più', () => {
        const grants = applyTalosToolAuthorizationGrant(
            TALOS_EMPTY_TOOL_AUTHORIZATIONS,
            'device_screen_drive',
            ['write', 'outbound'],
            0,
            '2026-08-13T09:00:00.000Z',
        )
        const esito = resolveTalosToolAuthorization({
            ...base,
            grants,
            forceConfirmation: true,
            sempreConsentibile: true,
        } as never)
        expect(esito).toMatchObject({ status: 'allowed', source: 'persistent' })
    })
})
