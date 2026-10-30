import { describe, expect, it } from 'vitest'
import { statoPillolaRagionamento } from '@/lib/chat/statoPillolaRagionamento'

/*
 * J3 (24/10/2026) — l'adattatore del mobile attorno alla porta fissata (`pillolaRagionamento.ts`): il lessico del telefono (`off`
 * per `none`), i livelli DICHIARATI dal profilo, e i motori che un livello non lo ricevono. La regola resta quella della porta.
 */
const profilo = (p: Partial<{ provider: string, effort_levels: string[], reasoning_mandatory: boolean }> = {}) => ({
    provider: 'openrouter', effort_levels: ['low', 'medium', 'high'], reasoning_mandatory: false, ...p,
})
const valori = (s: ReturnType<typeof statoPillolaRagionamento>) => s.voci.map((v) => v.valore)

describe('statoPillolaRagionamento — la porta nel lessico del telefono', () => {
    it('PILL-STATO-01 i livelli dichiarati, «off» in testa come il cursore di prima; ✓ sul livello scelto', () => {
        const s = statoPillolaRagionamento({ profilo: profilo(), scelto: 'high' })
        expect(s.nascosta).toBe(false)
        expect(valori(s)).toEqual(['off', 'low', 'medium', 'high'])
        expect(s.voci.filter((v) => v.scelta).map((v) => v.valore)).toEqual(['high'])
        expect(s.mostrato).toBe('high')
        expect(s.nota).toBeNull()
    })

    it('PILL-STATO-02 ragionamento obbligatorio (RAG-OBB): niente «off»', () => {
        expect(valori(statoPillolaRagionamento({ profilo: profilo({ reasoning_mandatory: true }), scelto: 'low' }))).toEqual(['low', 'medium', 'high'])
    })

    it('PILL-STATO-03 nessuna scelta: niente ✓ e la pillola dice «Auto» (`mostrato` null)', () => {
        const s = statoPillolaRagionamento({ profilo: profilo(), scelto: null })
        expect(s.toccato).toBe(false)
        expect(s.mostrato).toBeNull()
        expect(s.voci.some((v) => v.scelta)).toBe(false)
    })

    it('PILL-STATO-04 BUG-18 nel lessico del telefono: «minimal» scende a «low», mai a «off» (anche con «off» in lista)', () => {
        const s = statoPillolaRagionamento({ profilo: profilo({ effort_levels: ['low', 'high'] }), scelto: 'minimal' })
        expect(s.mostrato).toBe('low')
        expect(statoPillolaRagionamento({ profilo: profilo(), scelto: 'max' }).mostrato).toBe('high')
        expect(statoPillolaRagionamento({ profilo: profilo(), scelto: 'off' }).mostrato).toBe('off')
    })

    it('PILL-STATO-05 nascosta: nessun profilo, nessun livello dichiarato, solo «off»', () => {
        expect(statoPillolaRagionamento({ profilo: null, scelto: 'high' }).nascosta).toBe(true)
        expect(statoPillolaRagionamento({ profilo: profilo({ effort_levels: [] }), scelto: 'high' }).nascosta).toBe(true)
        expect(statoPillolaRagionamento({ profilo: profilo({ effort_levels: ['off'] }), scelto: 'off' }).nascosta).toBe(true)
        expect(statoPillolaRagionamento({ profilo: profilo({ effort_levels: ['none', 'banana'] }), scelto: 'off' }).nascosta).toBe(true)
    })

    it('PILL-STATO-06 REV5-P5: un modello `local:` del PC senza voce nel catalogo non riceve livelli finti — la pillola sta nascosta', () => {
        // `modelliDelPc.ts`: senza `supportedEfforts` né `livelliRagionamento` il profilo arriva con `effort_levels: []`. La porta,
        // con `livelliAmmessi` vuoto, offrirebbe la scala intera (PILLOLA-RAG-01): l'adattatore non la chiama così.
        const s = statoPillolaRagionamento({ profilo: profilo({ provider: 'computer', effort_levels: [] }), scelto: 'high' })
        expect(s.nascosta).toBe(true)
        expect(s.voci).toEqual([])
    })

    it('PILL-STATO-07 il motore del telefono non riceve il livello (solo acceso/spento): i livelli dedotti sono finti, nascosta', () => {
        // `mobileModelCatalog.ts` deduce low/medium/high per un modello che ragiona; `localAdapter` e il motore ospite leggono solo
        // `thinking` / `none` (TalosMotoreOspiteHttp.java:168-172)
        expect(statoPillolaRagionamento({ profilo: profilo({ provider: 'local' }), scelto: 'high' }).nascosta).toBe(true)
        // ⛔ D3 (Pad 28/10/2026, OK Desktop): per il motore del telefono niente nota A9 «decide il fornitore» — non c'è un fornitore che
        // decide, e il piede diceva già «funziona senza un'impostazione di ragionamento». Una frase sola (PIEDE-09).
        expect(statoPillolaRagionamento({ profilo: profilo({ provider: 'local' }), scelto: 'high' }).nota).toBeNull()
    })

    it('PILL-STATO-08 A9, i quattro casi della riga, coi valori nel lessico del telefono', () => {
        const filo = { none: null, low: 'low', medium: 'high', high: 'high', auto: 'high' }
        expect(statoPillolaRagionamento({ profilo: profilo(), scelto: 'medium', filo }).nota).toEqual({ chiave: 'effortSentAs', scelto: 'medium', inviato: 'high' })
        expect(statoPillolaRagionamento({ profilo: profilo(), scelto: 'off', filo }).nota).toEqual({ chiave: 'effortNotTaken', scelto: 'off' })
        expect(statoPillolaRagionamento({ profilo: profilo(), scelto: null, filo }).nota).toEqual({ chiave: 'effortAutoSent', inviato: 'high' })
        expect(statoPillolaRagionamento({ profilo: profilo({ effort_levels: [] }), scelto: 'low', filo }).nota).toEqual({ chiave: 'effortNotSent' })
        // con la mappa restano solo i livelli che partono così come sono
        expect(valori(statoPillolaRagionamento({ profilo: profilo(), scelto: 'low', filo }))).toEqual(['low', 'high'])
    })
})
