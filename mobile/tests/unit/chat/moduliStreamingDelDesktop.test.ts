import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { creaRitmo } from '@/lib/streaming/desktop/ritmo-streaming.js'
import { chiudiInArrivo, confineDiRivelazione } from '@/lib/streaming/desktop/markdown-in-arrivo.js'

/**
 * ⛔ #24 (owner 23/10 «il testo lagga»): i due moduli puri dello streaming fluido del desktop (3cf97a30d → r4 1164aee98) sono COPIATI
 * byte per byte nel mobile, come il kernel: una fonte, uno SHA, un test che fallisce se la copia si allontana (regola del Desktop,
 * 23/10). Qui la parità e il contratto che il mobile usa: ritardo massimo dichiarato, niente gradini, il recinto aperto intatto.
 */
const CARTELLA = resolve(__dirname, '..', '..', '..', 'src', 'lib', 'streaming', 'desktop')
const versione = JSON.parse(readFileSync(resolve(CARTELLA, 'VERSIONE.json'), 'utf8')) as { sha: string, file: Record<string, { sha256: string }> }

describe('i moduli dello streaming del desktop, copiati (#24)', () => {
    it('STREAM-PARI-01 ogni copia è identica a quella dello SHA r4 dichiarato', () => {
        expect(versione.sha).toMatch(/^[0-9a-f]{9,40}$/)
        for (const [nome, { sha256 }] of Object.entries(versione.file)) {
            const impronta = createHash('sha256').update(readFileSync(resolve(CARTELLA, nome))).digest('hex')
            expect(impronta, nome).toBe(sha256)
        }
    })

    it('STREAM-RITMO-01 un pacchetto grosso esce a scorrere entro il ritardo dichiarato (260 ms), mai in un colpo', () => {
        const r = creaRitmo()
        r.arrivo(400, 0)
        const passi: number[] = []
        let prec = 0
        for (let t = 16; t <= 400; t += 16) {
            const m = r.avanza(t)
            passi.push(m - prec)
            prec = m
        }
        expect(prec).toBe(400)
        // tutto a schermo entro 260 ms + un fotogramma
        let fatto = 0
        const r2 = creaRitmo()
        r2.arrivo(400, 0)
        for (let t = 16; t <= 400; t += 16) if (r2.avanza(t) >= 400 && !fatto) fatto = t
        expect(fatto).toBeLessThanOrEqual(260 + 16)
        // nessun gradino: il passo più grande resta vicino alla media
        const pieni = passi.filter((p) => p > 0)
        expect(Math.max(...pieni)).toBeLessThanOrEqual(Math.ceil(400 / pieni.length) * 2)
    })

    it('STREAM-RECINTO-03 dentro un recinto aperto la coda non si tocca', () => {
        const coda = '```css\n.a { color: red; } /* **'
        expect(chiudiInArrivo(coda, { dentroFence: true })).toBe(coda)
        expect(confineDiRivelazione('ciao **mondo', 7, { finito: false })).toBeGreaterThanOrEqual(0)
    })
})
