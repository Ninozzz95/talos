/* Il kernel VERO dell'app, in Node, su un progetto vero. */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { discoNode, fontiDaDisco, costruisciCatalogo, risolviSimbolo } from './dist/kernelPerIlBanco.js'

const dove = mkdtempSync(join(tmpdir(), 'talos-banco-'))
mkdirSync(join(dove, 'src'), { recursive: true })
writeFileSync(join(dove, 'src', 'prezzo.ts'),
    'export function conSconto(centesimi: number): number {\n    return centesimi\n}\n')
writeFileSync(join(dove, 'src', 'vuoto.ts'), '// nessuna dichiarazione\n')

const fonti = fontiDaDisco(discoNode({ radice: dove }))
const spazio = await fonti.leggiSpazio()
console.log('  sorgenti lette :', spazio.sorgenti.length)
console.log('  elenco         :', typeof spazio.elenco === 'string' ? spazio.elenco : JSON.stringify(spazio.elenco))

const catalogo = await costruisciCatalogo(spazio.sorgenti, { elenco: spazio.elenco })
const presente = risolviSimbolo(catalogo, 'conSconto', 'src/prezzo.ts')
const assente = risolviSimbolo(catalogo, 'scontoFedelta', 'src/prezzo.ts')
console.log('  conSconto      :', presente.stato)
console.log('  scontoFedelta  :', assente.stato)
console.log('')
console.log(presente.stato === 'presente' && assente.stato === 'assente'
    ? '  ⇒ IL KERNEL DELL APP GIRA IN NODE, e distingue presente da assente.'
    : '  ⇒ NON funziona come sul Pad.')
rmSync(dove, { recursive: true, force: true })
