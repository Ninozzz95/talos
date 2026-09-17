import { createHash } from 'node:crypto'
import { readFile, stat, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const HOTFIX_CRITICAL_TOOLS_ID = 'desktop-critical-tools-2026-09-15-v1'

function sostituisciUnaVolta(testo, cerca, sostituzione, etichetta) {
  const primo = testo.indexOf(cerca)
  if (primo < 0) throw new Error(`Hotfix ${HOTFIX_CRITICAL_TOOLS_ID}: marker assente (${etichetta}).`)
  if (testo.indexOf(cerca, primo + cerca.length) >= 0) {
    throw new Error(`Hotfix ${HOTFIX_CRITICAL_TOOLS_ID}: marker ambiguo (${etichetta}).`)
  }
  return testo.slice(0, primo) + sostituzione + testo.slice(primo + cerca.length)
}

export function trasformaKernelCriticalTools(sorgente) {
  let testo = String(sorgente)
  const firma = `/* ${HOTFIX_CRITICAL_TOOLS_ID} */`
  if (testo.includes(firma)) return testo

  testo = sostituisciUnaVolta(
    testo,
    "    const conto = { letti: 0, binari: 0, troppoGrandi: 0, illeggibili: 0, tettoLetture: false, tettoRicerca: false }",
    "    const conto = { letti: 0, binari: 0, troppoGrandi: 0, illeggibili: 0, tettoLetture: false, tettoRicerca: false }\n    const fileTroppoGrandi = []",
    'cerca: registro file oversize',
  )

  testo = sostituisciUnaVolta(
    testo,
    "        if (typeof taglia === 'number' && taglia > MAX_BYTE_FILE) { conto.troppoGrandi += 1; continue }",
    "        if (typeof taglia === 'number' && taglia > MAX_BYTE_FILE) {\n            conto.troppoGrandi += 1\n            if (fileTroppoGrandi.length < 20) fileTroppoGrandi.push(p)\n            continue\n        }",
    'cerca: file oversize',
  )

  testo = sostituisciUnaVolta(
    testo,
    "    const coda = avvisi.length > 0 ? `\\n${avvisi.join('\\n')}` : ''",
    "    if (conto.troppoGrandi > 0) {\n        const nonElencati = Math.max(0, conto.troppoGrandi - fileTroppoGrandi.length)\n        avvisi.push(`⚠ incomplete scan: ${conto.troppoGrandi} file(s) were skipped because they exceed ${Math.round(MAX_BYTE_FILE / (1024 * 1024))} MiB: ${fileTroppoGrandi.join(', ')}${nonElencati > 0 ? `, … and ${nonElencati} more` : ''}. Inspect those paths directly or narrow the search.`)\n    }\n    const coda = avvisi.length > 0 ? `\\n${avvisi.join('\\n')}` : ''",
    'cerca: avviso oversize con percorsi',
  )

  testo = sostituisciUnaVolta(
    testo,
    "        return `no file matches. Scanned ${percorsi.length} files${dettaglio}.`\n            + (chiaveTesto ? ' Try a shorter or different \"testo\".' : '')\n            + coda",
    "        const esitoRicerca = avvisi.length > 0\n            ? 'inconclusive search: no match was found in the files actually inspected, but the search was not exhaustive.'\n            : 'no file matches.'\n        return `${esitoRicerca} Scanned ${percorsi.length} files${dettaglio}.`\n            + (chiaveTesto ? ' Try a shorter or different \"testo\".' : '')\n            + coda",
    'cerca: nessun falso negativo esaustivo',
  )

  testo = sostituisciUnaVolta(
    testo,
    "String(esito).slice(0, 8_000)",
    "uscitaUtile(String(esito), 8_000, 0.5)",
    'output tool: truncation esplicita',
  )

  testo = sostituisciUnaVolta(
    testo,
    "                else if (nome === 'leggi') {",
    `${firma}\n                else if (nome === 'prova' && (\n                    String(argomenti.codice_prova ?? argomenti.codiceProva ?? '').trim()\n                    || ['libera', 'path'].includes(String(argomenti.tipo ?? '').trim().toLowerCase())\n                )) {\n                    esito = 'REFUSED. Arbitrary prova code/materialization is disabled by the desktop security hotfix. Use a structured prova mode; no probe file was created or executed.'\n                }\n                else if (nome === 'leggi') {`,
    'prova: fail closed prima del dispatch',
  )

  return testo
}

function sha256(testo) {
  return createHash('sha256').update(testo).digest('hex')
}

export async function applicaHotfixCriticalTools({ desktopRoot } = {}) {
  const root = desktopRoot ? resolve(desktopRoot) : dirname(dirname(fileURLToPath(import.meta.url)))
  const staging = join(root, '.staging')
  const kernel = join(staging, 'harness-ui', 'src', 'kernel', 'talosHarness.mjs')
  const manifestPath = join(staging, 'MANIFEST.json')
  const originale = await readFile(kernel, 'utf8')
  const corretto = trasformaKernelCriticalTools(originale)
  if (corretto !== originale) await writeFile(kernel, corretto, 'utf8')

  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  const relativo = 'harness-ui/src/kernel/talosHarness.mjs'
  const voce = Array.isArray(manifest.files) ? manifest.files.find((file) => file.path === relativo) : null
  if (!voce) throw new Error(`Hotfix ${HOTFIX_CRITICAL_TOOLS_ID}: ${relativo} assente dal manifest desktop.`)
  const bytes = (await stat(kernel)).size
  voce.bytes = bytes
  voce.sha256 = sha256(await readFile(kernel))
  manifest.totaleByte = manifest.files.reduce((somma, file) => somma + Number(file.bytes || 0), 0)
  manifest.hotfixes = [...new Set([...(Array.isArray(manifest.hotfixes) ? manifest.hotfixes : []), HOTFIX_CRITICAL_TOOLS_ID])]
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8')
  return { kernel, manifestPath, changed: corretto !== originale, id: HOTFIX_CRITICAL_TOOLS_ID }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  applicaHotfixCriticalTools().then(({ id, changed }) => {
    console.log(`${id}: ${changed ? 'applicato' : 'gia applicato'} allo staging desktop.`)
  }).catch((errore) => {
    console.error(`Hotfix desktop non applicato: ${errore instanceof Error ? errore.message : String(errore)}`)
    process.exitCode = 1
  })
}
