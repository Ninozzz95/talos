import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/*
 * Visto sul Pad il 22/10/2026 (giro dei 5 modelli × 3 varianti): la scheda di un repository di Hugging Face spiegava l'analisi
 * «come fa talosExamineRepo() nello store». Il nome di una funzione del codice e la parola «store» non dicono niente alla
 * persona: regola dell'owner «semplice a primo sguardo». Nessuna stringa dei cataloghi nomina una funzione del codice.
 */
const NOME_DI_FUNZIONE = /\b[A-Za-z_][A-Za-z0-9_]*\(\)/

function vociCon(lingua: 'en' | 'it', regola: RegExp): string[] {
    const sorgente = readFileSync(resolve(__dirname, `../../../src/i18n/locales/${lingua}.ts`), 'utf8')
    // apici E virgolette doppie (22/10/2026: le voci fra virgolette doppie sfuggivano)
    const voce = /^\s*([A-Za-z0-9_]+):\s*(['"])((?:(?!\2)[^\\]|\\.)*)\2/gm
    const trovate: string[] = []
    for (let m = voce.exec(sorgente); m; m = voce.exec(sorgente)) if (regola.test(m[3])) trovate.push(`${m[1]}: ${m[3]}`)
    return trovate
}

describe('cataloghi senza nomi del codice', () => {
    it('I18N-CODE-01 nessuna stringa inglese o italiana nomina una funzione del codice', () => {
        expect(vociCon('en', NOME_DI_FUNZIONE)).toEqual([])
        expect(vociCon('it', NOME_DI_FUNZIONE)).toEqual([])
        // AL CONTRARIO: il controllo vede davvero un nome di funzione, e non scambia le parentesi di una frase per codice
        expect(NOME_DI_FUNZIONE.test('come fa talosExamineRepo() nello store')).toBe(true)
        expect(NOME_DI_FUNZIONE.test('Quantizzazioni (3)')).toBe(false)
    })
})
