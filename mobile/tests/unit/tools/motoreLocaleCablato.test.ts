import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * ⛔⛔ ART-L-09 — visto dal vivo il 2026-10-23 sul Pad (APK di prova vc150, Spark-X2.5-4B).
 *
 * `artifact_create({ title, kind })` annunciato al motore locale col SUO contratto, e poi rifiutato: il controllo
 * preliminare del controller (`preflightTalosToolExecution`) non riceveva `motoreLocale` e validava con lo schema delle
 * API («html» obbligatorio). Il modello ha riprovato, ha ricevuto «Already attempted… it failed», e ha rinunciato.
 *
 * Il passaggio vive nel controller, che si prova solo col motore nativo e il ponte degli artefatti simulati: questo
 * cancello sul sorgente rende ROSSA ogni chiamata all'esecutore che dimentica il motore.
 */
describe('ART-L-09 ogni via verso l’esecutore sa se la chiamata viene dal motore locale', () => {
    const sorgente = readFileSync(resolve(__dirname, '../../../src/stores/chatController.ts'), 'utf8')

    for (const funzione of ['preflightTalosToolExecution', 'executeTalosTool']) {
        it(`${funzione}: ogni chiamata passa motoreLocale`, () => {
            const chiamate = [...sorgente.matchAll(new RegExp(`await ${funzione}\\(`, 'g'))]
            expect(chiamate.length, `nessuna chiamata a ${funzione} trovata`).toBeGreaterThan(0)
            for (const chiamata of chiamate) {
                // le dipendenze sono l'oggetto subito dopo: guardo fino alla sua chiusura al primo livello
                const da = sorgente.indexOf('{', chiamata.index!)
                let profondita = 0
                let fine = da
                for (; fine < sorgente.length; fine += 1) {
                    if (sorgente[fine] === '{') profondita += 1
                    if (sorgente[fine] === '}') profondita -= 1
                    if (profondita === 0) break
                }
                expect(sorgente.slice(da, fine), `${funzione} alla riga ${sorgente.slice(0, chiamata.index).split('\n').length}`)
                    .toMatch(/\bmotoreLocale\s*:/)
            }
        })
    }
})
