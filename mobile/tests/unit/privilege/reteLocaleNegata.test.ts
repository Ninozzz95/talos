/**
 * RETE-NEGATA-WEB-01..03 (ASS-148, owner 28/10: «Messaggio chiaro + pulsante»). Se la persona toglie «Rete locale» su Android 17, il ponte
 * dice la causa vera e offre il pulsante verso i permessi dell'app, invece del muto «TALOS non sente l'annuncio».
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { talosPonteAzioneDelMotivo, talosPonteMotivo } from '@/lib/privilege/pontePasso'
import { TALOS_EN_MESSAGES } from '@/i18n/locales/en'
import { TALOS_IT_MESSAGES } from '@/i18n/locales/it'

describe('RETE-NEGATA il ponte quando la rete locale è stata tolta', () => {
    it('RETE-NEGATA-WEB-01 local-network-blocked ha la sua frase, in italiano e in inglese, che nomina il permesso', () => {
        const chiave = talosPonteMotivo('local-network-blocked')
        expect(chiave).toBe('ponte.reasonLocalNetworkBlocked')
        const it = (TALOS_IT_MESSAGES.ponte as Record<string, string>).reasonLocalNetworkBlocked
        const en = (TALOS_EN_MESSAGES.ponte as Record<string, string>).reasonLocalNetworkBlocked
        expect(it).toMatch(/Rete locale/u)
        expect(en).toMatch(/Local network/u)
        expect((TALOS_IT_MESSAGES.ponte as Record<string, string>).openAppPermissions).toBeTruthy()
        expect((TALOS_EN_MESSAGES.ponte as Record<string, string>).openAppPermissions).toBeTruthy()
    })

    it('RETE-NEGATA-WEB-02 solo questo motivo porta un pulsante, verso i permessi dell\'app', () => {
        expect(talosPonteAzioneDelMotivo('local-network-blocked')).toBe('app-permissions')
        for (const altro of ['pairing-not-announced', 'connect-refused', 'bad-code', undefined]) expect(talosPonteAzioneDelMotivo(altro)).toBeNull()
    })

    it('RETE-NEGATA-WEB-03 la schermata del ponte mostra il pulsante sotto il motivo e apre app-permissions', () => {
        const schermo = readFileSync(resolve(__dirname, '../../../src/screens/PrivilegeScreen.vue'), 'utf8')
        expect(schermo).toMatch(/data-testid="talos-ponte-reason-action"/u)
        // ASS-149 cura 2: lo stesso pulsante fa due cose secondo il motivo (premiAzioneDelMotivo); per la rete locale apre i permessi
        expect(schermo).toMatch(/@click="void premiAzioneDelMotivo\(\)"/u)
        expect(schermo).toMatch(/open\(\{ target: ponteAzione\.value \}\)/u)
    })
})
