import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { livelliDaMostrare, statoDelLivello, SCALA_RAGIONAMENTO } from '@/lib/chat/pillolaRagionamento'

/*
 * J3 (24/10/2026) — la regola della pillola del ragionamento è una PORTA FISSATA di
 * `harness-ui/frontend/src/components/pillola-ragionamento.js` @ c6d1cbff2. Questi sono i casi di
 * `tests/unit/pillola-ragionamento.test.mjs` dello stesso commit: stessi ingressi, stesse uscite (sha256 del file del desktop
 * 54f073eb…db7). Un ritocco alla logica che li cambia fa rosso qui; uno che cambia il file fa rosso in `desktopPortedConformance`.
 */
const TUTTI = SCALA_RAGIONAMENTO.map((valore) => ({ valore }))
const valori = (l: ReadonlyArray<{ valore: string }>) => l.map((x) => x.valore)

describe('pillola del ragionamento — porta fissata del desktop c6d1cbff2', () => {
    it('PILLOLA-RAG-01 livelli: quelli dichiarati dal modello, «none» resta; senza catalogo la lista intera', () => {
        expect(valori(livelliDaMostrare({ tutti: TUTTI, livelliAmmessi: ['high', 'low'] }))).toEqual(['none', 'low', 'high'])
        expect(valori(livelliDaMostrare({ tutti: TUTTI, livelliAmmessi: null }))).toEqual(SCALA_RAGIONAMENTO)
        expect(valori(livelliDaMostrare({ tutti: TUTTI, livelliAmmessi: [] }))).toEqual(SCALA_RAGIONAMENTO)
    })

    it('PILLOLA-RAG-02 A9: con la mappa del filo restano solo i livelli che partono così come sono («none» se il modello si spegne)', () => {
        const filo = { none: 'low', low: 'low', high: 'high', xhigh: 'max', max: 'max' }
        expect(valori(livelliDaMostrare({ tutti: TUTTI, livelliAmmessi: ['low', 'high', 'max'], filo }))).toEqual(['low', 'high', 'max'])
    })

    it('PILLOLA-RAG-03 una scelta della lista è mostrata e «toccata»; senza scelta e senza filo: «Automatico», niente nota', () => {
        const livelli = livelliDaMostrare({ tutti: TUTTI, livelliAmmessi: ['low', 'medium', 'high'] })
        const s = statoDelLivello({ livelli, valoreIniziale: 'medium' })
        expect(livelli[s.indice]!.valore).toBe('medium')
        expect(s.toccato).toBe(true)
        expect(s.nota).toBeNull()
        const auto = statoDelLivello({ livelli, valoreIniziale: null })
        expect(auto.toccato).toBe(false)
        expect(auto.nota).toBeNull()
    })

    it('PILLOLA-RAG-04 BUG-18: una scelta fuori lista scende al più vicino PIÙ DEBOLE, mai a «none», mai più su', () => {
        const livelli = livelliDaMostrare({ tutti: TUTTI, livelliAmmessi: ['low', 'medium', 'high'] }) // none, low, medium, high
        expect(livelli[statoDelLivello({ livelli, valoreIniziale: 'max' }).indice]!.valore).toBe('high')
        expect(livelli[statoDelLivello({ livelli, valoreIniziale: 'xhigh' }).indice]!.valore).toBe('high')
        const senzaNone = [{ valore: 'low' }, { valore: 'high' }]
        expect(senzaNone[statoDelLivello({ livelli: senzaNone, valoreIniziale: 'minimal' }).indice]!.valore, 'minimal non diventa mai none').toBe('low')
        expect(senzaNone[statoDelLivello({ livelli: senzaNone, valoreIniziale: 'medium' }).indice]!.valore, 'prima il più debole').toBe('low')
    })

    it('PILLOLA-RAG-05 A9: si mostra il livello che PARTE, e la nota dice la scelta e ciò che parte; null ⇒ «non lo riceve»', () => {
        const filo = { none: 'low', low: 'low', high: 'high', xhigh: 'max', max: 'max' }
        const livelli = livelliDaMostrare({ tutti: TUTTI, livelliAmmessi: ['low', 'high', 'max'], filo })
        const s = statoDelLivello({ livelli, valoreIniziale: 'xhigh', filo })
        expect(livelli[s.indice]!.valore).toBe('max')
        expect(s.nota).toEqual({ chiave: 'effortSentAs', scelto: 'xhigh', inviato: 'max' })
        const uguale = statoDelLivello({ livelli, valoreIniziale: 'high', filo })
        expect(uguale.nota, 'AL CONTRARIO: un livello che parte com\'è non porta la riga').toBeNull()
        const nonParte = statoDelLivello({ livelli: [{ valore: 'low' }, { valore: 'medium' }], valoreIniziale: 'none', filo: { none: null, low: 'low', medium: 'medium' } })
        expect(nonParte.toccato).toBe(false)
        expect(nonParte.senzaTacca).toBe(true)
        expect(nonParte.nota).toEqual({ chiave: 'effortNotTaken', scelto: 'none' })
    })

    it('PILLOLA-RAG-06 «Automatico + riga» (owner 09/10): senza scelta, nessuna tacca, e la nota dice che cosa parte', () => {
        const filo = { low: 'low', high: 'high', max: 'max', auto: 'max' }
        const livelli = livelliDaMostrare({ tutti: TUTTI, livelliAmmessi: ['low', 'high', 'max'], filo })
        const s = statoDelLivello({ livelli, valoreIniziale: null, filo })
        expect(s.toccato).toBe(false)
        expect(s.senzaTacca).toBe(true)
        expect(livelli[s.indice]!.valore).toBe('max')
        expect(s.nota).toEqual({ chiave: 'effortAutoSent', inviato: 'max' })
    })

    it('PILLOLA-RAG-07 nessun livello (owner 24/10): `nessuno`, la pillola non si mostra', () => {
        const s = statoDelLivello({ livelli: [], valoreIniziale: 'high', filo: {} })
        expect(s.nessuno).toBe(true)
        expect(s.nota).toEqual({ chiave: 'effortNotSent' })
        expect(statoDelLivello({ livelli: [{ valore: 'low' }] }).nessuno).toBe(false)
    })

    it('PILLOLA-RAG-PORTA la porta è registrata nel manifesto delle librerie portate, con la revisione del desktop', () => {
        const manifesto = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', '..', '..', 'upstream', 'desktop-ported-libs-manifest.json'), 'utf8'))
        const riga = manifesto.files.find((r: { mobile_path: string }) => r.mobile_path === 'mobile/src/lib/chat/pillolaRagionamento.ts')
        expect(riga).toBeTruthy()
        expect(riga.desktop_source).toContain('pillola-ragionamento.js')
        expect(riga.desktop_source).toContain('c6d1cbff2')
        expect(riga.reconciliation).toContain('07d816862bbc12f668848b950e34ca1aad3d14ceef6e5081ddc42d806892df4e')
    })
})
