/**
 * Porta gli scatti nuovi nella forma che il README si aspetta.
 *
 * ⛔ Non è pignoleria: `mobile/.gitignore` ignora `*.png` e poi riammette
 * `!docs/immagini/*.png`. L'eccezione nomina UNA estensione sola. Un `.jpg`
 * oggi passa perché nessuna regola lo cattura — ma passa per assenza di regola,
 * non per una decisione, e il giorno che qualcuno aggiunge `*.jpg` le immagini
 * spariscono dalla copia pubblicata senza che nessuno se ne accorga.
 *
 * È già successo: le immagini del README non arrivavano nella copia, e il
 * cancello controllava l'originale invece della copia.
 *
 * ⇒ Una cartella, un formato, e l'eccezione che lo copre per nome.
 *
 *   node scripts/normalizza-immagini.mjs <file.jpg> <nome-finale>
 */
import { readFileSync, unlinkSync } from 'node:fs'
import { resolve } from 'node:path'
import sharp from 'sharp'

const [entrata, nome] = process.argv.slice(2)
if (!entrata || !nome) {
    console.error('  uso: node scripts/normalizza-immagini.mjs <file> <nome-finale>')
    process.exit(1)
}

const CARTELLA = resolve(import.meta.dirname, '..', 'docs', 'immagini')
const dentro = resolve(CARTELLA, entrata)
const fuori = resolve(CARTELLA, `${nome}.png`)

const prima = readFileSync(dentro).length
const meta = await sharp(dentro).metadata()
await sharp(dentro).png({ compressionLevel: 9, palette: false }).toFile(fuori)
const dopo = readFileSync(fuori).length
unlinkSync(dentro)

console.log(
    `  ${entrata} → ${nome}.png   ${meta.width}×${meta.height}   `
    + `${(prima / 1024).toFixed(0)} KB → ${(dopo / 1024).toFixed(0)} KB`,
)
