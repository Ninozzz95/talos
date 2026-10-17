import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/*
 * ⛔ Release v0.1.41 (17/10/2026): `src/lib/tools/chiaveDiChiamata.ts` portava tre byte NUL veri dentro i template (il separatore
 * fra nome e argomenti). Funzionava, ma git tratta come BINARIO un file con un NUL: nella PR pubblica il suo contenuto non si
 * vedeva, e nessuno l'avrebbe rivisto. Il separatore si scrive con l'escape `\u0000`, che a runtime dà la stessa stringa.
 */
const SRC = resolve(__dirname, '..', '..', '..', 'src')
const ESTENSIONI = /\.(ts|tsx|js|mjs|vue|css|json)$/u

function fileDi(cartella: string): string[] {
    return readdirSync(cartella).flatMap((nome) => {
        const percorso = join(cartella, nome)
        return statSync(percorso).isDirectory() ? fileDi(percorso) : ESTENSIONI.test(nome) ? [percorso] : []
    })
}

describe('igiene del sorgente', () => {
    it('SRC-NUL-01 nessun file di src/ contiene un byte NUL (git lo tratterebbe come binario)', () => {
        const conNul = fileDi(SRC).filter((f) => readFileSync(f).includes(0)).map((f) => relative(SRC, f).replaceAll('\\', '/'))
        expect(conNul).toEqual([])
    })
})
