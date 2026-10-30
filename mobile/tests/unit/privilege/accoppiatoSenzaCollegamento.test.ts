/**
 * ACCOPPIATO-01..04 (ASS-149, owner 29/10 con la foto della notifica; OK del Desktop alla cura 1). Sul Pad l'accoppiamento era RIUSCITO
 * (la chiave di TALOS dev fra le autorizzate) ma il collegamento no, perché adbd non annuncia la sua porta: la notifica diceva «La
 * finestrella mostra un codice nuovo ogni volta: riaprila e scrivi quello (connect-refused)», cioè incolpava un codice giusto.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { talosPonteMotivo, talosPonteMotivoDopoAccoppiamento } from '@/lib/privilege/pontePasso'
import { TALOS_EN_MESSAGES } from '@/i18n/locales/en'
import { TALOS_IT_MESSAGES } from '@/i18n/locales/it'

const it_ = TALOS_IT_MESSAGES.ponte as Record<string, string>
const en = TALOS_EN_MESSAGES.ponte as Record<string, string>

describe('ACCOPPIATO il codice era giusto, manca solo il collegamento', () => {
    it('ACCOPPIATO-01 il motivo ha la sua frase, che non nomina il codice', () => {
        expect(talosPonteMotivo('paired-not-connected')).toBe('ponte.reasonPairedNotConnected')
        expect(it_.reasonPairedNotConnected).toMatch(/Accoppiato/u)
        expect(it_.reasonPairedNotConnected).not.toMatch(/codice/iu)
        expect(en.reasonPairedNotConnected).toMatch(/Paired/u)
        expect(en.reasonPairedNotConnected).not.toMatch(/\bcode\b/iu)
    })

    it('ACCOPPIATO-02 la notifica ha la sua frase, che non nomina il codice', () => {
        expect(it_.floatPairedNotConnected).toMatch(/Accoppiato/u)
        expect(it_.floatPairedNotConnected).not.toMatch(/codice/iu)
        expect(en.floatPairedNotConnected).toMatch(/Paired/u)
        expect(en.floatPairedNotConnected).not.toMatch(/\bcode\b/iu)
    })

    it('ACCOPPIATO-03 dopo un accoppiamento riuscito ogni fallimento del collegamento diventa «accoppiato», tranne la rete locale tolta', () => {
        for (const r of ['connect-not-announced', 'connect-refused', undefined]) expect(talosPonteMotivoDopoAccoppiamento(r)).toBe('paired-not-connected')
        expect(talosPonteMotivoDopoAccoppiamento('local-network-blocked')).toBe('local-network-blocked')
    })

    it('ACCOPPIATO-04 la schermata passa la frase alla notifica, usa il motivo dopo l\'accoppiamento e toglie il motivo quando è collegato', () => {
        const s = readFileSync(resolve(__dirname, '../../../src/screens/PrivilegeScreen.vue'), 'utf8')
        expect(s).toMatch(/pairedNotConnected: t\('ponte\.floatPairedNotConnected'\)/u)
        expect(s).toMatch(/mostraMotivo\(talosPonteMotivoDopoAccoppiamento\(collegato\.reason\)\)/u)
        expect(s).toMatch(/if \(ponteCollegato\.value\) \{\n\s+togliMotivo\(\)/u)
    })
})
