import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { FUORI_DAL_PACCHETTO, NODE_PTY_TIENI, NOME_MANIFESTO_PACCHETTO, PACCHETTO_SCHEMA, preparaPacchettoR4 } from './prepara-pacchetto-r4.mjs'

/**
 * ⛔ K1 (ledger `LEDGER-K1-PACCHETTO-R4-2026-10-14.md`; owner 14/10 «Sorgente com'è»): dalla copia di r4 al pacchetto di
 * produzione per l'APK. Le cartelle restano quelle del desktop; fuori le prove e sqlite-vec (sul Pad rifiuta la piattaforma
 * `android`); di TypeScript solo i `lib.*.d.ts`, che il cancello semantico del kernel legge per percorso (`talosHarness.mjs:8788`).
 * ⛔ K3-TERM T1 (owner 16/10 «node-pty ufficiale», ledger `LEDGER-K3-TERMINALE-2026-10-16.md`): node-pty entra ridotto alla sua
 * parte JS, con il `pty.node` per Android compilato dal suo `src/unix/pty.cc` (prima, 14/10, era tolto per intero).
 */

function scrivi(radice, percorso, testo) {
    const pieno = join(radice, ...percorso.split('/'))
    mkdirSync(join(pieno, '..'), { recursive: true })
    writeFileSync(pieno, testo)
}

function pacchettoNpm(radice, nome, { versione = '1.0.0', licenza = 'MIT', testoLicenza = 'MIT License\n' } = {}) {
    const base = `node_modules/${nome}`
    const dichiarazione = { name: nome, version: versione }
    if (licenza !== null) dichiarazione.license = licenza
    scrivi(radice, `${base}/package.json`, JSON.stringify(dichiarazione))
    scrivi(radice, `${base}/index.js`, 'module.exports = 1\n')
    if (testoLicenza !== null) scrivi(radice, `${base}/LICENSE`, testoLicenza)
}

function vendorDiProva({ schema = 'talos.mobile.kernel-r4.v1', manifesto = true } = {}) {
    const vendor = mkdtempSync(join(tmpdir(), 'r4-vendor-'))
    scrivi(vendor, 'harness-ui/server.mjs', 'export const server = 1\n')
    scrivi(vendor, 'harness-ui/package.json', '{"name":"talos-harness-ui-backend"}\n')
    scrivi(vendor, 'harness-ui/package-lock.json', '{"lockfileVersion":3}\n')
    scrivi(vendor, 'harness-ui/src/kernel/talosHarness.mjs', 'export const kernel = 1\n')
    scrivi(vendor, 'harness-ui/tests/kernel.test.mjs', 'export {}\n')
    scrivi(vendor, 'harness-ui/node_modules/vecchio/index.js', 'residuo della copia per le prove\n')
    scrivi(vendor, 'context-engine/package.json', '{"name":"@talos/context-engine"}\n')
    scrivi(vendor, 'context-engine/src/engine.mjs', 'export const ce = 1\n')
    scrivi(vendor, 'docs/assistenza/README.md', '# Assistenza\n')
    if (manifesto) writeFileSync(join(vendor, 'manifesto-r4.json'), JSON.stringify({ schema, commit: 'a'.repeat(40), conteggio: 0, file: [] }))
    return vendor
}

/** npm finto: scrive ciò che un `npm ci`/`npm install` vero lascerebbe in `node_modules`, e annota gli argomenti. */
function npmFinto({ senzaLicenza = false } = {}) {
    const chiamate = []
    const npmFn = (argomenti, cartella) => {
        chiamate.push({ argomenti, cartella })
        const completo = argomenti[0] === 'ci' && !argomenti.includes('--omit=dev')
        if (cartella.endsWith('harness-ui') || completo) {
            pacchettoNpm(cartella, 'zod', { licenza: 'MIT' })
            pacchettoNpm(cartella, 'node-pty', { versione: '1.1.0', licenza: 'MIT' })
            for (const f of ['lib/index.js', 'lib/unixTerminal.js', 'src/unix/pty.cc', 'binding.gyp', 'README.md', 'typings/node-pty.d.ts',
                'prebuilds/darwin-x64/pty.node', 'prebuilds/win32-x64/conpty.dll', 'deps/winpty/README.md', 'third_party/conpty/x.dll']) {
                scrivi(cartella, `node_modules/node-pty/${f}`, `${f}\n`)
            }
            pacchettoNpm(cartella, 'node-addon-api', { versione: '7.1.1', licenza: 'MIT' })
            scrivi(cartella, 'node_modules/node-addon-api/napi.h', '// napi\n')
            // come png-js@1.1.0 (dipendenza di pdfkit): niente campo `license`, ma il file LICENSE c'è
            pacchettoNpm(cartella, 'solo-file', { licenza: null, testoLicenza: 'MIT License\n\nCopyright (c) 2017 Esempio\n' })
            if (senzaLicenza) pacchettoNpm(cartella, 'senza-licenza', { licenza: null, testoLicenza: null })
            if (completo) {
                pacchettoNpm(cartella, 'typescript', { versione: '5.9.2', licenza: 'Apache-2.0' })
                scrivi(cartella, 'node_modules/typescript/lib/lib.es5.d.ts', 'interface Array<T> {}\n')
                scrivi(cartella, 'node_modules/typescript/lib/lib.dom.d.ts', 'interface Window {}\n')
                scrivi(cartella, 'node_modules/typescript/lib/typescript.js', 'compilatore intero\n')
            }
        } else if (cartella.endsWith('context-engine')) {
            pacchettoNpm(cartella, 'zod', { licenza: 'MIT' })
            pacchettoNpm(cartella, 'sqlite-vec', { licenza: 'MIT OR Apache' })
            pacchettoNpm(cartella, 'sqlite-vec-linux-arm64', { licenza: 'MIT OR Apache' })
        }
    }
    return { npmFn, chiamate }
}

const impronta = (b) => createHash('sha256').update(b).digest('hex')

/** Il compilatore finto: guarda cosa c'è al momento della chiamata e scrive un `pty.node` di prova dove gli si chiede. */
function ptyFinto({ guasto = null } = {}) {
    const chiamate = []
    const fn = async ({ nodePty, nodeAddonApi, uscita }) => {
        chiamate.push({ nodePty, nodeAddonApi, uscita, sorgentePresente: existsSync(join(nodePty, 'src', 'unix', 'pty.cc')),
            napiPresente: existsSync(join(nodeAddonApi, 'napi.h')) })
        if (guasto) throw new Error(guasto)
        mkdirSync(join(uscita, '..'), { recursive: true })
        const byte = Buffer.from('ELF pty.node di prova\n')
        writeFileSync(uscita, byte)
        return { sha256: impronta(byte), byte: byte.length, nodePty: '1.1.0', nodeAddonApi: '7.1.1', headerNode: '24.18.0' }
    }
    return { fn, chiamate }
}

function elencoRelativo(cartella, base = cartella) {
    const trovati = []
    for (const voce of readdirSync(cartella, { withFileTypes: true })) {
        const pieno = join(cartella, voce.name)
        if (voce.isDirectory()) trovati.push(...elencoRelativo(pieno, base))
        else trovati.push(pieno.slice(base.length + 1).split(/[\\/]/u).join('/'))
    }
    return trovati.sort()
}

function conPulizia(...cartelle) {
    return () => { for (const c of cartelle) rmSync(c, { recursive: true, force: true }) }
}

describe('preparaPacchettoR4 (K1)', () => {
    it('K1-PACC-01 fuori prove e sqlite-vec; node-pty ridotto con il pty.node per Android; dentro docs/assistenza; di TypeScript solo i lib.*.d.ts', async () => {
        const vendor = vendorDiProva()
        const uscita = join(mkdtempSync(join(tmpdir(), 'r4-pacc-')), 'pacchetto')
        const pulisci = conPulizia(vendor, join(uscita, '..'))
        try {
            await preparaPacchettoR4({ compilaPtyFn: ptyFinto().fn, vendor, uscita, npmFn: npmFinto().npmFn })
            assert.equal(existsSync(join(uscita, 'harness-ui', 'tests')), false)
            const nodePty = join(uscita, 'harness-ui', 'node_modules', 'node-pty')
            assert.deepEqual(elencoRelativo(nodePty), ['LICENSE', 'lib/index.js', 'lib/unixTerminal.js', 'package.json', 'prebuilds/android-arm64/pty.node'])
            assert.equal(existsSync(join(uscita, 'harness-ui', 'node_modules', 'node-addon-api')), false, 'node-addon-api serve solo per compilare')
            assert.equal(existsSync(join(uscita, 'harness-ui', 'node_modules', 'vecchio')), false, 'i node_modules della copia non entrano')
            assert.equal(existsSync(join(uscita, 'context-engine', 'node_modules', 'sqlite-vec')), false)
            assert.equal(existsSync(join(uscita, 'context-engine', 'node_modules', 'sqlite-vec-linux-arm64')), false)
            assert.equal(readFileSync(join(uscita, 'docs', 'assistenza', 'README.md'), 'utf8'), '# Assistenza\n')
            assert.equal(readFileSync(join(uscita, 'harness-ui', 'server.mjs'), 'utf8'), 'export const server = 1\n')
            assert.ok(existsSync(join(uscita, 'harness-ui', 'node_modules', 'zod', 'index.js')))
            assert.ok(existsSync(join(uscita, 'context-engine', 'node_modules', 'zod', 'index.js')))
            assert.deepEqual(readdirSync(join(uscita, 'harness-ui', 'node_modules', 'typescript', 'lib')).sort(), ['lib.dom.d.ts', 'lib.es5.d.ts'])
            assert.ok(!FUORI_DAL_PACCHETTO.includes('harness-ui/node_modules/node-pty'))
            assert.deepEqual(NODE_PTY_TIENI, ['lib', 'package.json', 'LICENSE'])
        } finally { pulisci() }
    })

    it('K1-PACC-02 il manifesto corrisponde ai byte e porta il commit r4 della copia', async () => {
        const vendor = vendorDiProva()
        const uscita = join(mkdtempSync(join(tmpdir(), 'r4-pacc-')), 'pacchetto')
        const pulisci = conPulizia(vendor, join(uscita, '..'))
        try {
            const manifesto = await preparaPacchettoR4({ compilaPtyFn: ptyFinto().fn, vendor, uscita, npmFn: npmFinto().npmFn })
            assert.equal(manifesto.schema, PACCHETTO_SCHEMA)
            assert.equal(manifesto.commit, 'a'.repeat(40))
            assert.equal(manifesto.conteggio, manifesto.file.length)
            assert.ok(manifesto.file.some((f) => f.percorso === 'THIRD_PARTY_LICENSES.txt'))
            for (const f of manifesto.file) {
                const byte = readFileSync(join(uscita, ...f.percorso.split('/')))
                assert.equal(f.sha256, impronta(byte), f.percorso)
                assert.equal(f.byte, byte.length, f.percorso)
            }
            assert.deepEqual(JSON.parse(readFileSync(join(uscita, NOME_MANIFESTO_PACCHETTO), 'utf8')), manifesto)
        } finally { pulisci() }
    })

    it('K1-PACC-03 le licenze nominano ogni pacchetto rimasto; uno senza licenza fa fallire e viene nominato', async () => {
        const vendor = vendorDiProva()
        const uscita = join(mkdtempSync(join(tmpdir(), 'r4-pacc-')), 'pacchetto')
        const pulisci = conPulizia(vendor, join(uscita, '..'))
        try {
            await preparaPacchettoR4({ compilaPtyFn: ptyFinto().fn, vendor, uscita, npmFn: npmFinto().npmFn })
            const licenze = readFileSync(join(uscita, 'THIRD_PARTY_LICENSES.txt'), 'utf8')
            assert.match(licenze, /zod@1\.0\.0 — MIT/u)
            assert.match(licenze, /typescript@5\.9\.2 — Apache-2\.0/u)
            assert.match(licenze, /MIT License/u)
            assert.match(licenze, /solo-file@1\.0\.0 — MIT License \(from the LICENSE file; package\.json declares none\)/u)
            assert.doesNotMatch(licenze, /sqlite-vec|node-addon-api/u)
            assert.match(licenze, /node-pty@1\.1\.0 — MIT/u)
            const altra = join(uscita, '..', 'altra')
            await assert.rejects(preparaPacchettoR4({ compilaPtyFn: ptyFinto().fn, vendor, uscita: altra, npmFn: npmFinto({ senzaLicenza: true }).npmFn }), /senza-licenza/u)
        } finally { pulisci() }
    })

    it('K1-PACC-04 una copia senza manifesto, o con uno schema diverso, è un errore e il pacchetto non viene scritto', async () => {
        for (const opzioni of [{ manifesto: false }, { schema: 'altro.v1' }]) {
            const vendor = vendorDiProva(opzioni)
            const uscita = join(mkdtempSync(join(tmpdir(), 'r4-pacc-')), 'pacchetto')
            const pulisci = conPulizia(vendor, join(uscita, '..'))
            try {
                await assert.rejects(preparaPacchettoR4({ compilaPtyFn: ptyFinto().fn, vendor, uscita, npmFn: npmFinto().npmFn }), /manifesto-r4\.json/u)
                assert.equal(existsSync(uscita), false)
            } finally { pulisci() }
        }
    })

    it('K1-PACC-05 npm riceve esattamente gli argomenti del ledger', async () => {
        const vendor = vendorDiProva()
        const uscita = join(mkdtempSync(join(tmpdir(), 'r4-pacc-')), 'pacchetto')
        const pulisci = conPulizia(vendor, join(uscita, '..'))
        const { npmFn, chiamate } = npmFinto()
        try {
            await preparaPacchettoR4({ compilaPtyFn: ptyFinto().fn, vendor, uscita, npmFn })
            const comuni = ['--os=linux', '--cpu=arm64', '--ignore-scripts', '--no-audit', '--no-fund']
            assert.deepEqual(chiamate.map((c) => c.argomenti), [
                ['ci', '--omit=dev', ...comuni],
                ['install', '--omit=dev', '--no-package-lock', ...comuni],
                ['ci', ...comuni],
            ])
            assert.ok(chiamate[0].cartella.endsWith(join('pacchetto', 'harness-ui')))
            assert.ok(chiamate[1].cartella.endsWith(join('pacchetto', 'context-engine')))
            assert.ok(!chiamate[2].cartella.startsWith(uscita), 'il ci completo per TypeScript avviene fuori dal pacchetto')
        } finally { pulisci() }
    })

    it('K1-PACC-06 il pty.node si compila dal node-pty installato, prima di ridurlo, e il manifesto lo dichiara; un guasto ferma tutto', async () => {
        const vendor = vendorDiProva()
        const uscita = join(mkdtempSync(join(tmpdir(), 'r4-pacc-')), 'pacchetto')
        const pulisci = conPulizia(vendor, join(uscita, '..'))
        const pty = ptyFinto()
        try {
            const manifesto = await preparaPacchettoR4({ compilaPtyFn: pty.fn, vendor, uscita, npmFn: npmFinto().npmFn })
            assert.equal(pty.chiamate.length, 1)
            const [c] = pty.chiamate
            assert.equal(c.nodePty, join(uscita, 'harness-ui', 'node_modules', 'node-pty'))
            assert.equal(c.nodeAddonApi, join(uscita, 'harness-ui', 'node_modules', 'node-addon-api'))
            assert.equal(c.uscita, join(uscita, 'harness-ui', 'node_modules', 'node-pty', 'prebuilds', 'android-arm64', 'pty.node'))
            assert.ok(c.sorgentePresente && c.napiPresente, 'si compila quando sorgente e header ci sono ancora')
            const voce = manifesto.file.find((f) => f.percorso === 'harness-ui/node_modules/node-pty/prebuilds/android-arm64/pty.node')
            assert.ok(voce)
            assert.deepEqual(manifesto.ptyAndroid, { sha256: voce.sha256, byte: voce.byte, nodePty: '1.1.0', nodeAddonApi: '7.1.1', headerNode: '24.18.0' })
            const altra = join(uscita, '..', 'altra')
            await assert.rejects(preparaPacchettoR4({ compilaPtyFn: ptyFinto({ guasto: 'clang non trovato' }).fn, vendor, uscita: altra, npmFn: npmFinto().npmFn }), /clang non trovato/u)
            assert.equal(existsSync(join(altra, NOME_MANIFESTO_PACCHETTO)), false, 'senza pty.node il pacchetto non si chiude')
        } finally { pulisci() }
    })
})
