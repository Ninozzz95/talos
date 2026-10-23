import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/*
 * Visto sul Pad il 21/10/2026 con TALOS in inglese (riprese del video): «Where the model runs» proponeva «Automatico». Il catalogo
 * inglese aveva la parola italiana (`localModels.backendName.auto`), e nessun cancello confrontava le lingue. Regola dell'owner
 * «ogni parola in inglese e italiano»: il catalogo inglese non contiene parole italiane evidenti.
 */
const PAROLE_ITALIANE = /\b(automatico|impostazioni|chiudi|annulla|salva|modello|modelli|della|delle|degli|nella|questo|questa|scegli|riprova|attendi|errore|accesso|ancora|perché|però|anche|sono|stato|nessuno|nessuna)\b|[àèìòù]/i

describe('catalogo inglese', () => {
    it('I18N-EN-01 nessuna stringa del catalogo inglese contiene parole italiane', () => {
        const sorgente = readFileSync(resolve(__dirname, '../../../src/i18n/locales/en.ts'), 'utf8')
        // apici E virgolette doppie (22/10/2026: il cancello dei dispositivi ha scoperto che le voci fra virgolette doppie sfuggivano)
        const voce = /^\s*([A-Za-z0-9_]+):\s*(['"])((?:(?!\2)[^\\]|\\.)*)\2/gm
        const italiane: string[] = []
        for (let m = voce.exec(sorgente); m; m = voce.exec(sorgente)) if (PAROLE_ITALIANE.test(m[3])) italiane.push(`${m[1]}: ${m[3]}`)
        expect(italiane).toEqual([])
        // AL CONTRARIO: il controllo vede davvero una parola italiana
        expect(PAROLE_ITALIANE.test('Automatico')).toBe(true)
        expect(PAROLE_ITALIANE.test('Automatic')).toBe(false)
    })
})
