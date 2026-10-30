import { describe, expect, it } from 'vitest'
import { talosPrivilegedReason } from '@/lib/device/privilegedShell'

/**
 * UNITA-18 (ASS-145..147): ogni motivo nuovo ha la sua frase per il modello. Senza, cadeva nel ripiego generico «The bridge said: …» e il
 * modello non sapeva né l'unità né se riprovare.
 */
describe('i motivi nuovi delle impostazioni hanno una frase', () => {
    it.each(['value-out-of-range', 'brightness-scale-unknown', 'power-saver-while-charging', 'not-applied'])('«%s»', (motivo) => {
        expect(talosPrivilegedReason(motivo)).not.toMatch(/did not manage it/u)
    })
})
