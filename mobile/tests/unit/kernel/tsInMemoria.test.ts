import { describe, expect, it } from 'vitest'
import ts from 'typescript'

/**
 * ⛔ La domanda che decide l'architettura: il compilatore TypeScript può fare
 * analisi SEMANTICA senza toccare il filesystem? Se sì, gira sul telefono con
 * un host virtuale sopra lo Storage Access Framework, e non serve un daemon.
 */
describe('il compilatore senza filesystem', () => {
    const file: Record<string, string> = {
        '/prezzo.ts': 'export function conSconto(c: number) { return c }\n',
        '/uso.ts': 'import { conSconto } from "./prezzo"\nexport const x = conSconto(10)\nexport const y = scontoFedelta(10)\n',
    }

    const host: ts.CompilerHost = {
        fileExists: (f) => f in file,
        readFile: (f) => file[f],
        getSourceFile: (f, target) => (f in file
            ? ts.createSourceFile(f, file[f]!, target, true)
            : undefined),
        getDefaultLibFileName: () => '/lib.d.ts',
        writeFile: () => {},
        getCurrentDirectory: () => '/',
        getCanonicalFileName: (f) => f,
        useCaseSensitiveFileNames: () => true,
        getNewLine: () => '\n',
    }

    it('⭐⭐⭐ trova un riferimento NON RISOLTO, in memoria, senza fs', () => {
        const program = ts.createProgram(['/uso.ts'], { noEmit: true, skipLibCheck: true }, host)
        const diagnostiche = program.getSemanticDiagnostics(program.getSourceFile('/uso.ts'))
        const codici = diagnostiche.map((d) => d.code)
        expect(codici).toContain(2304) // TS2304: Cannot find name 'scontoFedelta'
    })

    it('⭐ e NON accusa quello che si risolve davvero', () => {
        const program = ts.createProgram(['/uso.ts'], { noEmit: true, skipLibCheck: true }, host)
        const messaggi = program.getSemanticDiagnostics(program.getSourceFile('/uso.ts'))
            .map((d) => ts.flattenDiagnosticMessageText(d.messageText, ' '))
        expect(messaggi.some((m) => m.includes('conSconto'))).toBe(false)
        expect(messaggi.some((m) => m.includes('scontoFedelta'))).toBe(true)
    })

    it('⛔ e segue gli ALIAS attraverso i file — cosa che il solo parser non fa', () => {
        const conAlias = {
            ...file,
            '/riesporta.ts': 'export { conSconto as sconto } from "./prezzo"\n',
            '/usaAlias.ts': 'import { sconto } from "./riesporta"\nexport const z = sconto(1)\n',
        }
        const host2: ts.CompilerHost = {
            ...host,
            fileExists: (f) => f in conAlias,
            readFile: (f) => conAlias[f],
            getSourceFile: (f, target) => (f in conAlias
                ? ts.createSourceFile(f, conAlias[f]!, target, true)
                : undefined),
        }
        const program = ts.createProgram(['/usaAlias.ts'], { noEmit: true, skipLibCheck: true }, host2)
        const d = program.getSemanticDiagnostics(program.getSourceFile('/usaAlias.ts'))
        expect(d.filter((x) => x.code === 2304)).toHaveLength(0)
        // Un catalogo puramente sintattico direbbe che `sconto` non è dichiarato
        // in nessun file: è dichiarato come `conSconto` e rinominato in transito.
    })
})
