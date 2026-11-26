import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { chiudiJsonParziale } from '@/lib/harness/r4/chiudiJsonParzialeR4'
import { corpoAttrezzoR4 } from '@/lib/harness/r4/corpoAttrezzoR4'
// il PC, in sola lettura e solo nella prova: il pacchetto del telefono non lo importa (porta `lingua.js` e le etichette della pagina)
import { leggiArgomentiDellaRiga } from '../../../../harness-ui/frontend/src/components/carta-dal-testo.js'

/**
 * Giro 2 delle maschere (0.1.50 P5): `chiudiJsonParzialeR4.ts` è un PORTO copiato di `chiudiJsonParziale` del PC
 * (`harness-ui/frontend/src/components/carta-dal-testo.js`, nato in 070f771e1). Questa prova lo tiene uguale al PC:
 *   · PARITÀ-01: la stessa uscita della funzione del PC, presa dal suo file così com'è, su ogni taglio carattere per carattere;
 *   · PARITÀ-02: le righe del telefono sono quelle che il PC mostra (`leggiArgomentiDellaRiga(…).mostrati`) sugli stessi tagli.
 * Gli ingressi: i campioni della sonda del revisore (segreti FINTI, scritti a pezzi) più JSON senza segreti con escape e annidati.
 */
const a = (...p: string[]) => p.join('')
const nelComando = (testo: string) => JSON.stringify({ comando: `curl -s https://esempio.invalid ${testo} && echo fatto` })
const INGRESSI = [
    JSON.stringify({ secrets: { utente: 'nino', db: a('valore', 'AnnidatoFinto77') }, cartella: 'x' }),
    `{"secrets": {"db": "${a('valore', 'AnnidatoFinto77')}"}, "cartella": "x"}`,
    JSON.stringify({ comando: 'x', password: a('cavallo ', 'batteria graffetta corretta') }),
    JSON.stringify({ credentials: { user: 'nino', key: a('chiave', 'SenzaFormaFinta9') }, x: 1 }),
    nelComando(a('-----BEGIN RSA ', 'PRIVATE KEY-----\nMIIEpAIBAAKCAQEA1234567890abcdefABCDEF\n-----END RSA ', 'PRIVATE KEY-----')),
    nelComando(a('0123456789abcdef0123456789abcdef', '.AbCdEfGhIjKlMnOp')),
    nelComando(a('https://utente:', 'Passw0rdFinta@esempio.invalid/x')),
    nelComando(a('sk-ant-api03-', 'FINTO0FINTO1FINTO2FINTO3')),
    nelComando(a('ghp_', 'Q123456789abcdefABCDEF0123456789abcd')),
    nelComando(a('db-password=', 'hunter2zz')),
    '{ "percorso" : "src/a \\"b\\".ts" ,  "righe": [1, 2, {"da": 3, "a": null}], "vero": true, "testo": "x\\\\y\\u00e8" }',
    '[{"nome": "a", "valori": [[1], [2, [3]]]}, "fine"]',
]
const tagli = (testo: string) => Array.from({ length: testo.length }, (_, i) => testo.slice(0, i + 1))
const TAGLI = INGRESSI.flatMap(tagli)

/* la funzione del PC presa dal suo file così com'è (non è esportata): dalla riga `const SPAZIO` alla fine di `chiudiJsonParziale` */
const filePc = fs.readFileSync(path.resolve(__dirname, '../../../../harness-ui/frontend/src/components/carta-dal-testo.js'), 'utf8')
const dal = filePc.indexOf('const SPAZIO = ')
const al = filePc.indexOf('\n}\n', filePc.indexOf('function chiudiJsonParziale(', dal)) + 2
// eslint-disable-next-line @typescript-eslint/no-implied-eval
const chiudiDelPc = new Function(`${filePc.slice(dal, al)}\nreturn chiudiJsonParziale`)() as (testo: string) => string

describe('porto di chiudiJsonParziale: parità col PC', () => {
    it('PARITÀ-01 la stessa uscita della funzione del PC, su ogni taglio', () => {
        expect(dal).toBeGreaterThan(0)
        expect(TAGLI.length).toBeGreaterThan(500)
        const diversi = TAGLI.map((t) => t.trim()).filter((t) => chiudiJsonParziale(t) !== chiudiDelPc(t))
        expect(diversi).toEqual([])
    })
    it('PARITÀ-02 le righe del telefono sono quelle che il PC mostra, su ogni taglio', () => {
        const delTelefono = (t: string) => corpoAttrezzoR4({ nome: 'shell', argomenti: t }, 'it')
            .flatMap((p) => (p.tipo === 'argomento' ? [[p.chiave, p.valore]] : []))
        const delPc = (t: string) => {
            const mostrati = leggiArgomentiDellaRiga(t).mostrati as Record<string, unknown> | null
            return Object.entries(mostrati ?? {}).filter(([k]) => k !== 'descrizione')
                .map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)])
        }
        const diversi = TAGLI.filter((t) => JSON.stringify(delTelefono(t)) !== JSON.stringify(delPc(t)))
        expect(diversi).toEqual([])
    })
})
