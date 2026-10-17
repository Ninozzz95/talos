import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { HEADER_NODE, OPZIONI_PTY_ANDROID, clangDellNdk, compilaPtyAndroid, controllaDipendenzePty, headerDiNode, tarDiSistema } from './compila-pty-android.mjs'

/**
 * ⛔ K3-TERM T1 (ledger `LEDGER-K3-TERMINALE-2026-10-16.md`; owner 16/10 «node-pty ufficiale»): il `pty.node` di node-pty 1.1.0
 * compilato con l'NDK per il Node dell'app. Misura sul Pad del 16/10: 420 KB, `/dev/pts`, ridimensiona, Ctrl-C.
 */

/** Un ELF64 little-endian minimo (lo stesso di `scripts/node-nativo/node-nativo.test.mjs`): un PT_LOAD e un PT_DYNAMIC. */
function elfDiProva({ needed = [] }) {
    const stringhe = ['']
    const posizione = (testo) => { const p = Buffer.byteLength(stringhe.join('\0') + '\0'); stringhe.push(testo); return p }
    const voci = []
    for (const n of needed) voci.push([1, posizione(n)])
    const tabella = Buffer.from(stringhe.join('\0') + '\0')
    const VADDR = 0x400000
    const intestazione = 64, programmi = 56 * 2
    const inizioStringhe = intestazione + programmi
    const inizioDinamica = inizioStringhe + tabella.length + ((8 - (tabella.length % 8)) % 8)
    voci.push([5, VADDR + inizioStringhe], [10, tabella.length], [0, 0])
    const totale = inizioDinamica + voci.length * 16
    const b = Buffer.alloc(totale)
    b.write('\x7fELF', 0, 'latin1'); b[4] = 2; b[5] = 1; b[6] = 1
    b.writeUInt16LE(3, 16); b.writeUInt16LE(183, 18); b.writeUInt32LE(1, 20)
    b.writeBigUInt64LE(64n, 32); b.writeUInt16LE(64, 52); b.writeUInt16LE(56, 54); b.writeUInt16LE(2, 56)
    const programma = (i, tipo, offset, vaddr, dimensione) => {
        const o = intestazione + i * 56
        b.writeUInt32LE(tipo, o); b.writeBigUInt64LE(BigInt(offset), o + 8); b.writeBigUInt64LE(BigInt(vaddr), o + 16)
        b.writeBigUInt64LE(BigInt(vaddr), o + 24); b.writeBigUInt64LE(BigInt(dimensione), o + 32); b.writeBigUInt64LE(BigInt(dimensione), o + 40)
    }
    programma(0, 1, 0, VADDR, totale)
    programma(1, 2, inizioDinamica, VADDR + inizioDinamica, voci.length * 16)
    tabella.copy(b, inizioStringhe)
    voci.forEach(([tag, valore], i) => { b.writeBigUInt64LE(BigInt(tag), inizioDinamica + i * 16); b.writeBigUInt64LE(BigInt(valore), inizioDinamica + i * 16 + 8) })
    return b
}

const sha = (b) => createHash('sha256').update(b).digest('hex')

describe('compila-pty-android (K3-TERM T1)', () => {
    it('PTY-AND-01 le opzioni del ledger: API 26, libc++ statica, pagine da 16 KB, eccezioni N-API, nessun percorso del PC', () => {
        for (const o of ['--target=aarch64-linux-android26', '-std=c++17', '-fexceptions', '-DNAPI_CPP_EXCEPTIONS', '-shared',
            '-static-libstdc++', '-Wl,-z,undefs', '-Wl,-soname,pty.node', '-Wl,-z,max-page-size=16384']) {
            assert.ok(OPZIONI_PTY_ANDROID.includes(o), o)
        }
        assert.equal(HEADER_NODE.versione, '24.18.0')
        assert.equal(HEADER_NODE.sha256, '6c7d41d83c3481d2301115b8ce4a44b7d4fbfa52859b1aac14f445d460137887')
        assert.equal(HEADER_NODE.url, 'https://nodejs.org/dist/v24.18.0/node-v24.18.0-headers.tar.gz')
    })

    it('PTY-AND-02 gli header di Node: uno sha256 diverso è un errore; giusti si estraggono una volta e poi si riusano', async () => {
        const lavoro = mkdtempSync(join(tmpdir(), 'pty-hdr-'))
        try {
            const sorgente = join(lavoro, 'sorgente')
            mkdirSync(join(sorgente, 'node-v24.18.0', 'include', 'node'), { recursive: true })
            writeFileSync(join(sorgente, 'node-v24.18.0', 'include', 'node', 'node_api.h'), '/* napi */\n')
            const archivio = join(lavoro, 'h.tgz')
            execFileSync(tarDiSistema(), ['-czf', archivio, '-C', sorgente, 'node-v24.18.0'])
            const byte = readFileSync(archivio)
            const atteso = { versione: '24.18.0', url: 'https://esempio.invalid/h.tgz', sha256: sha(byte) }
            const cache = join(lavoro, 'cache')
            let chiamate = 0
            const scaricaFn = async (url) => { chiamate += 1; assert.equal(url, atteso.url); return byte }
            const include = await headerDiNode({ cache, scaricaFn, atteso })
            assert.equal(readFileSync(join(include, 'node_api.h'), 'utf8'), '/* napi */\n')
            assert.equal(await headerDiNode({ cache, scaricaFn, atteso }), include)
            assert.equal(chiamate, 1, 'la seconda volta si riusa la cache')
            const altra = join(lavoro, 'altra')
            await assert.rejects(headerDiNode({ cache: altra, scaricaFn: async () => Buffer.from('falso'), atteso }), /sha256/u)
            assert.equal(existsSync(join(altra, 'node-v24.18.0')), false, 'un archivio sbagliato non viene estratto')
        } finally { rmSync(lavoro, { recursive: true, force: true }) }
    })

    it('PTY-AND-03 il binario dipende solo dalle librerie di sistema: libc++_shared o una libreria nostra lo rifiutano', () => {
        assert.doesNotThrow(() => controllaDipendenzePty(elfDiProva({ needed: ['libm.so', 'libdl.so', 'libc.so'] })))
        assert.throws(() => controllaDipendenzePty(elfDiProva({ needed: ['libc++_shared.so', 'libc.so'] })), /libc\+\+_shared\.so/u)
        assert.throws(() => controllaDipendenzePty(elfDiProva({ needed: ['libutil.so'] })), /libutil\.so/u)
        assert.throws(() => controllaDipendenzePty(Buffer.from('non un elf')), /ELF/u)
    })

    it('PTY-AND-04 il clang++ dell\'NDK fissato, per Windows e per Linux; se manca lo dice col percorso', () => {
        const sdk = join('C:', 'sdk')
        const visti = []
        const esiste = (p) => { visti.push(p); return true }
        assert.equal(clangDellNdk({ sdk, versione: '29.0.14206865', piattaforma: 'win32', existsFn: esiste }),
            join(sdk, 'ndk', '29.0.14206865', 'toolchains', 'llvm', 'prebuilt', 'windows-x86_64', 'bin', 'clang++.exe'))
        assert.equal(clangDellNdk({ sdk, versione: '29.0.14206865', piattaforma: 'linux', existsFn: esiste }),
            join(sdk, 'ndk', '29.0.14206865', 'toolchains', 'llvm', 'prebuilt', 'linux-x86_64', 'bin', 'clang++'))
        assert.throws(() => clangDellNdk({ sdk, versione: '29.0.14206865', piattaforma: 'linux', existsFn: () => false }), /29\.0\.14206865/u)
    })

    it('PTY-AND-05 compila il pty.cc di node-pty con gli header giusti, ripulisce, controlla e dà impronta e peso', () => {
        const lavoro = mkdtempSync(join(tmpdir(), 'pty-comp-'))
        try {
            const nodePty = join(lavoro, 'node-pty')
            const nodeAddonApi = join(lavoro, 'node-addon-api')
            const include = join(lavoro, 'include', 'node')
            const uscita = join(lavoro, 'pacchetto', 'prebuilds', 'android-arm64', 'pty.node')
            const comandi = []
            const binario = elfDiProva({ needed: ['libc.so'] })
            const eseguiFn = (comando, argomenti) => {
                comandi.push([comando, argomenti])
                const o = argomenti[argomenti.indexOf('-o') + 1]
                writeFileSync(o, comando.includes('strip') ? binario : Buffer.concat([binario, Buffer.from('simboli')]))
            }
            const esito = compilaPtyAndroid({ nodePty, nodeAddonApi, include, uscita, clang: join(lavoro, 'bin', 'clang++'), eseguiFn })
            const [compila, ripulisci] = comandi
            assert.equal(compila[0], join(lavoro, 'bin', 'clang++'))
            for (const o of OPZIONI_PTY_ANDROID) assert.ok(compila[1].includes(o), o)
            assert.ok(compila[1].includes(join(nodePty, 'src', 'unix', 'pty.cc')))
            assert.deepEqual(compila[1].slice(compila[1].indexOf('-I'), compila[1].indexOf('-I') + 4), ['-I', include, '-I', nodeAddonApi])
            assert.ok(compila[1].some((a) => a.startsWith('-ffile-prefix-map=') && a.includes(lavoro)), 'i percorsi del PC non restano nel binario')
            assert.equal(ripulisci[0], join(lavoro, 'bin', 'llvm-strip'))
            assert.deepEqual(readFileSync(uscita), binario)
            assert.deepEqual(esito, { sha256: sha(binario), byte: binario.length })
        } finally { rmSync(lavoro, { recursive: true, force: true }) }
    })
})
