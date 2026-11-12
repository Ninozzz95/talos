// Regenerates the PC numbers used by the phone's parity test for the compaction rule (judge v1523, 11/11/2026).
//
// How to regenerate, from anywhere:
//   node harness-ui/scripts/genera-parita-pc.mjs [repository root]
// The root defaults to the repository that holds this script. The script loads the REAL PC module
// (harness-ui/src/kernel/compattazione-desktop.mjs, with talosHarness.mjs for the estimate), runs it on the inputs in
// mobile/tests/unit/kernel/paritaRiassuntoAtteso.casi.mjs and writes mobile/tests/unit/kernel/paritaRiassuntoAtteso.pc.json
// with its sources: for the rule file and for the estimate file (talosHarness.mjs, where stimaToken lives), the path, the
// last commit, the sha256 and whether it had local changes. Then run the phone test:
//   cd mobile && npx vitest run tests/unit/kernel/paritaRiassuntoAtteso.test.ts
// Packages that harness-ui/ has not installed are resolved from mobile/ (the phone clone has no harness-ui/node_modules).
//
// Why it lives here and not in mobile/: LANE-01 (owner 25/09/2026) forbids any mobile source, script or test from naming a
// path of another lane, so the phone never reads harness-ui; it only reads the .pc.json written by this script.
//
// The committed .pc.json was generated from the PC files at commit fb6bbcb6c (fb6bbcb6c0410bc1cbd5ddefe29f4bed3fd00297):
// compattazione-desktop.mjs sha256 541e91b3b48b7820f6ed2e03d3dd114d531d92834105ad4bafb02cd1c17223b5 and talosHarness.mjs sha256
// 3366cbb8064e85947d5cc45c5c61e10de91adbd3afda823291f27cb7a73139ec. If either file changes, rerun this script and the phone
// test: a different number is a parity failure to fix on the phone (or a decision to take for both). The note below compares
// only the sha256 (judge v1535, point 4): a new commit that leaves the file identical is not a change.
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, renameSync } from 'node:fs'
import { register } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'

export const COMMIT_DEL_PC_REGISTRATO = 'fb6bbcb6c0410bc1cbd5ddefe29f4bed3fd00297'
export const SHA256_DEL_PC_REGISTRATO = '541e91b3b48b7820f6ed2e03d3dd114d531d92834105ad4bafb02cd1c17223b5'
export const SHA256_DELLA_STIMA_REGISTRATO = '3366cbb8064e85947d5cc45c5c61e10de91adbd3afda823291f27cb7a73139ec'

const qui = path.dirname(fileURLToPath(import.meta.url))
const radice = path.resolve(process.argv[2] ?? path.join(qui, '..', '..'))
const mobile = pathToFileURL(path.join(radice, 'mobile', 'package.json')).href
register(`data:text/javascript,${encodeURIComponent(`
export async function resolve(specifier, context, next) {
    try { return await next(specifier, context) } catch (error) {
        if (error?.code !== 'ERR_MODULE_NOT_FOUND' || /^[./]|^[a-z]+:/i.test(specifier)) throw error
        return next(specifier, { ...context, parentURL: ${JSON.stringify(mobile)} })
    }
}`)}`)
const relativo = 'harness-ui/src/kernel/compattazione-desktop.mjs'
const filePc = path.join(radice, relativo)
const pc = await import(pathToFileURL(filePc).href)
const { casiDellaParita, argomentiDelCaso, COSTANTI } = await import(pathToFileURL(path.join(radice, 'mobile/tests/unit/kernel/paritaRiassuntoAtteso.casi.mjs')).href)
const casi = casiDellaParita()
const git = (...a) => execFileSync('git', ['-C', radice, ...a], { encoding: 'utf8' }).trim()
const fonte = (file) => ({
    file,
    commit: git('log', '-1', '--format=%H', '--', file),
    sha256: createHash('sha256').update(readFileSync(path.join(radice, file))).digest('hex'),
    modificatoNelWorktree: git('status', '--short', '--', file) !== '',
})
const uscita = {
    fonte: { ...fonte(relativo), stima: fonte('harness-ui/src/kernel/talosHarness.mjs') },
    costanti: Object.fromEntries(COSTANTI.map((k) => [k, pc[k]])),
    casi: casi.length,
    risultati: casi.map((caso) => pc[caso.funzione](...argomentiDelCaso(caso))),
}
const destinazione = path.join(radice, 'mobile/tests/unit/kernel/paritaRiassuntoAtteso.pc.json')
writeFileSync(`${destinazione}.tmp`, `${JSON.stringify(uscita)}\n`)
renameSync(`${destinazione}.tmp`, destinazione)
const cambiato = uscita.fonte.sha256 !== SHA256_DEL_PC_REGISTRATO || uscita.fonte.stima.sha256 !== SHA256_DELLA_STIMA_REGISTRATO
console.log(JSON.stringify({ ...uscita, risultati: `${uscita.risultati.length} numbers` }))
if (cambiato) console.log('NOTE: a PC file is not the one recorded in this script (sha256 differs): update the constants above after the phone test is green.')
