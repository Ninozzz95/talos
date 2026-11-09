#!/usr/bin/env node
/*
 * Centro assistenza (owner 01/11/2026): scrive `harness-ui/aiuto/index.json` dalle pagine del sito ufficiale.
 *
 *   node scripts/costruisci-aiuto.mjs [--sito <cartella del repo talos-website>] [--uscita <file>]
 *
 * Si lancia sul PC a ogni versione e `aiuto/index.json` SI COMMITTA con il bump (owner 01/11/2026: il repo del sito è suo, privato,
 * e la compilazione automatica della release non lo legge; l'esportazione pubblica si ferma se il file manca da HEAD).
 *
 * Il sito va COSTRUITO prima (`npm run build` nel suo repo): si leggono le intestazioni dai sorgenti MDX di `src/content/docs/`
 * e il testo dalle pagine di `dist/docs/`. Ogni pagina di sorgente senza la sua pagina costruita ferma lo script (uscita 1): un
 * aiuto a cui manca una pagina senza dirlo è peggio di nessun aiuto.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { paginaDellIndice, VERSIONE_INDICE_AIUTO } from '../src/aiuto/costruisci-indice.mjs'

const qui = dirname(fileURLToPath(import.meta.url))
const argomento = (nome, predefinito) => {
    const i = process.argv.indexOf(nome)
    return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : predefinito
}
const sito = resolve(argomento('--sito', join(qui, '..', '..', '..', 'talos-website-private')))
const uscita = resolve(argomento('--uscita', join(qui, '..', 'aiuto', 'index.json')))
const sorgenti = join(sito, 'src', 'content', 'docs')
const costruito = join(sito, 'dist', 'docs')

function fileMdx(cartella) {
    const elenco = []
    for (const nome of readdirSync(cartella)) {
        const p = join(cartella, nome)
        if (statSync(p).isDirectory()) elenco.push(...fileMdx(p))
        else if (/\.mdx?$/iu.test(nome)) elenco.push(p)
    }
    return elenco
}

/* Lo stesso `generateId` del sito (`src/content.config.ts`): `x/index` → `x`; l'indice radice non è una pagina di aiuto. */
function percorsoDi(file) {
    let id = relative(sorgenti, file).split('\\').join('/').replace(/\.(md|mdx)$/iu, '')
    if (id.endsWith('/index')) id = id.slice(0, -'/index'.length)
    return id === 'index' ? null : id
}

const pagine = []
const mancanti = []
for (const file of fileMdx(sorgenti).sort()) {
    const percorso = percorsoDi(file)
    if (!percorso) continue
    let html
    try { html = readFileSync(join(costruito, percorso, 'index.html'), 'utf8') }
    catch { mancanti.push(percorso); continue }
    const pagina = paginaDellIndice({ percorso, mdx: readFileSync(file, 'utf8'), html })
    if (pagina.sezioni.length) pagine.push(pagina)
}
if (mancanti.length) {
    console.error(`costruisci-aiuto: ${mancanti.length} pagine senza la pagina costruita (il sito va costruito prima): ${mancanti.join(', ')}`)
    process.exit(1)
}

const git = (...a) => { try { return execFileSync('git', ['-C', sito, ...a], { encoding: 'utf8' }).trim() } catch { return null } }
const indice = {
    versione: VERSIONE_INDICE_AIUTO,
    fonte: { sito: 'https://talos-code.com/docs', commit: git('rev-parse', '--short=9', 'HEAD'), data: git('log', '-1', '--format=%cI') },
    pagine,
}
mkdirSync(dirname(uscita), { recursive: true })
const temporaneo = `${uscita}.tmp`
writeFileSync(temporaneo, `${JSON.stringify(indice)}\n`)
renameSync(temporaneo, uscita)
const sezioni = pagine.reduce((n, p) => n + p.sezioni.length, 0)
const perProdotto = pagine.reduce((m, p) => ({ ...m, [p.prodotto]: (m[p.prodotto] ?? 0) + 1 }), {})
console.log(`costruisci-aiuto: ${pagine.length} pagine, ${sezioni} sezioni, ${statSync(uscita).size} byte → ${uscita}`)
console.log(`  per prodotto: ${JSON.stringify(perProdotto)} · sito ${indice.fonte.commit}`)
