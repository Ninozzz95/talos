/**
 * RIPUBBLICA-01..04 (ASS-149 cura 2, ledger approvato dal Desktop 29/10; owner: «solo quando premi il pulsante», cioè mai senza un
 * gesto della persona). Misura M9 sul Pad: spento e riacceso il Debug wireless, l'annuncio della porta torna in meno di 1 s e TALOS si
 * riaggancia da solo. Quando la scoperta fallisce, la riga dice cosa fare e il pulsante apre le opzioni sviluppatore già sulla riga
 * giusta; il gesto lo fa la persona, e al ritorno nell'app la scoperta riparte da sola, senza un secondo tocco.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { talosPonteAzioneDelMotivo } from '@/lib/privilege/pontePasso'
import { TALOS_EN_MESSAGES } from '@/i18n/locales/en'
import { TALOS_IT_MESSAGES } from '@/i18n/locales/it'

const it_ = TALOS_IT_MESSAGES.ponte as Record<string, string>
const en = TALOS_EN_MESSAGES.ponte as Record<string, string>

describe('RIPUBBLICA spegni e riaccendi il Debug wireless, poi torna qui', () => {
    it('RIPUBBLICA-01 solo la scoperta fallita porta il pulsante di ripubblicazione; la rete locale tolta resta ai permessi', () => {
        expect(talosPonteAzioneDelMotivo('connect-not-announced')).toBe('developer-republish')
        expect(talosPonteAzioneDelMotivo('paired-not-connected')).toBe('developer-republish')
        expect(talosPonteAzioneDelMotivo('local-network-blocked')).toBe('app-permissions')
        for (const r of ['pairing-not-announced', 'connect-refused', 'bad-code', undefined]) expect(talosPonteAzioneDelMotivo(r)).toBeNull()
    })

    it('RIPUBBLICA-02 la frase dice cosa fare, in italiano e in inglese', () => {
        for (const k of ['reasonConnectNotAnnounced', 'reasonPairedNotConnected']) {
            expect(it_[k], k).toMatch(/Spegni e riaccendi Debug wireless, poi torna qui/u)
            expect(en[k], k).toMatch(/Turn wireless debugging off and on, then come back here/u)
        }
        expect(it_.republishAction).toBeTruthy()
        expect(en.republishAction).toBeTruthy()
    })

    it('RIPUBBLICA-03 una voce sola: lo stesso pulsante cambia stato, mai due pulsanti insieme', () => {
        const s = readFileSync(resolve(__dirname, '../../../src/screens/PrivilegeScreen.vue'), 'utf8')
        expect(s.match(/data-testid="talos-ponte-reason-action"/gu)).toHaveLength(1)
        expect(s).toMatch(/:data-azione="ponteAzione"/u)
        expect(s).toMatch(/@click="void premiAzioneDelMotivo\(\)"/u)
    })

    it('RIPUBBLICA-04 al ritorno dalle opzioni sviluppatore la scoperta riparte da sola', () => {
        const s = readFileSync(resolve(__dirname, '../../../src/screens/PrivilegeScreen.vue'), 'utf8')
        expect(s).toMatch(/ripubblicaInAttesa = true/u)
        expect(s).toMatch(/if \(ripubblicaInAttesa\) \{\n\s+ripubblicaInAttesa = false\n\s+void ricollega\(\)/u)
    })
})
