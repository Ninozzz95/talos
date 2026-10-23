import { describe, expect, it } from 'vitest'
import { talosFraseDiFine, type TalosFineCorsa } from '@/lib/agent/pilotaDelloSchermo'

/*
 * 22/10/2026 (fase «dispositivi, non telefoni», regola dell'owner «ogni parola in inglese e italiano»): le frasi che il pilota dello
 * schermo DICE alla persona dall'altoparlante, mentre TALOS guida un'altra app, erano solo in italiano. Chi usa TALOS in inglese
 * sentiva l'italiano. Ogni frase esiste nelle due lingue e segue la lingua dell'app.
 */
const tutte: TalosFineCorsa[] = [
    { motivo: 'fine', esito: 'riuscito', testo: '' }, { motivo: 'fine', esito: 'fallito', testo: '' }, { motivo: 'fine', testo: '' },
    { motivo: 'mano-sullo-schermo' }, { motivo: 'freno-non-armato' }, { motivo: 'occhio-chiuso' }, { motivo: 'troppi-passi' },
    { motivo: 'tempo-scaduto' }, { motivo: 'troppi-fallimenti' }, { motivo: 'modello-non-capito' },
] as TalosFineCorsa[]

describe('le frasi del pilota dello schermo in due lingue', () => {
    it('PILOTA-LINGUE-01 in inglese nessuna frase è italiana, in italiano nessuna è inglese, e nessuna nomina il telefono', () => {
        for (const fine of tutte) {
            const en = talosFraseDiFine(fine, 'en')
            const it_ = talosFraseDiFine(fine, 'it')
            expect(en).not.toMatch(/\b(?:mi fermo|fatto|schermo|non|ci)\b/i)
            expect(it_).not.toMatch(/\b(?:I|stop|done|screen)\b/)
            expect(`${en} ${it_}`).not.toMatch(/\b(?:phone|telefono)\b/i)
        }
        expect(talosFraseDiFine({ motivo: 'fine', esito: 'riuscito', testo: 'wifi acceso' } as TalosFineCorsa, 'en')).toBe('Done: wifi acceso')
    })
})
