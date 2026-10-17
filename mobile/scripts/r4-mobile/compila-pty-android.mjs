#!/usr/bin/env node
/**
 * ⛔ K3-TERM T1 — il `pty.node` di node-pty per il Node dell'app (ledger `LEDGER-K3-TERMINALE-2026-10-16.md`).
 *
 * Owner 16/10 «node-pty ufficiale»: il Terminale di r4 usa `node-pty` (`harness-ui/src/pty-terminal.mjs:176-186`), che non ha
 * una build per Android. Il modulo resta quello di npm, preso dal lockfile di r4 (1.1.0, con node-addon-api 7.1.1); qui si compila
 * soltanto il suo `src/unix/pty.cc` con l'NDK del progetto, contro gli header della stessa versione di Node che gira nell'app
 * (`libtalosnode.so`, 24.18.0, che esporta le funzioni N-API). Il risultato va in `prebuilds/android-arm64/pty.node`, il percorso
 * che `node-pty/lib/utils.js` `loadNativeModule` cerca già su `process.platform === 'android'`.
 *
 * Misura sul Pad (16/10, `untrusted_app`): caricato dalla cartella privata dell'app (il divieto di Android è su `execve`, non su
 * `dlopen`), `/system/bin/sh` su `/dev/pts`, ridimensiona, Ctrl-C ferma il comando e la shell resta.
 */
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { LIBRERIE_DI_SISTEMA, leggiSezioneDinamica } from '../node-nativo/node-nativo.mjs'

/** Gli header di Node della versione dell'app, con l'impronta di `SHASUMS256.txt` di nodejs.org (verificata il 16/10). */
export const HEADER_NODE = Object.freeze({
    versione: '24.18.0',
    url: 'https://nodejs.org/dist/v24.18.0/node-v24.18.0-headers.tar.gz',
    sha256: '6c7d41d83c3481d2301115b8ce4a44b7d4fbfa52859b1aac14f445d460137887',
})

/** L'NDK del progetto (`android/app/build.gradle` `ndkVersion`). */
export const VERSIONE_NDK = '29.0.14206865'

/**
 * Le opzioni del binario. API 26 = `minSdkVersion` (`forkpty` c'è dall'API 23). libc++ statica: il binario dipende solo da
 * libc/libm/libdl. `-z undefs`: le funzioni N-API le dà il Node che lo carica. Pagine da 16 KB come il resto dell'app.
 * Le opzioni di `binding.gyp` di node-pty per Linux: `-O2 -D_FORTIFY_SOURCE=2`; quelle di node-addon-api con le eccezioni.
 */
export const OPZIONI_PTY_ANDROID = Object.freeze([
    '--target=aarch64-linux-android26', '-std=c++17', '-O2', '-fPIC', '-fexceptions', '-D_FORTIFY_SOURCE=2',
    '-DNAPI_CPP_EXCEPTIONS', '-DBUILDING_NODE_EXTENSION', '-shared', '-static-libstdc++', '-Wl,-z,undefs',
    '-Wl,-soname,pty.node', '-Wl,-z,max-page-size=16384',
])

/** Il `clang++` dell'NDK fissato, per la macchina che costruisce. */
export function clangDellNdk({ sdk, versione = VERSIONE_NDK, piattaforma = process.platform, existsFn = existsSync }) {
    const host = piattaforma === 'win32' ? 'windows-x86_64' : piattaforma === 'darwin' ? 'darwin-x86_64' : 'linux-x86_64'
    const percorso = join(sdk, 'ndk', versione, 'toolchains', 'llvm', 'prebuilt', host, 'bin', piattaforma === 'win32' ? 'clang++.exe' : 'clang++')
    if (!existsFn(percorso)) throw new Error(`compilaPtyAndroid: NDK ${versione} non trovato (${percorso})`)
    return percorso
}

/**
 * Il `tar` da usare: su Windows quello di sistema (bsdtar, `System32\tar.exe`). Il `tar` GNU di Git Bash, primo nel PATH,
 * legge `C:\…` come `host:percorso` remoto e si ferma (misurato il 16/10).
 */
export function tarDiSistema(piattaforma = process.platform, env = process.env) {
    return piattaforma === 'win32' ? join(env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe') : 'tar'
}

async function scaricaVero(url) {
    const risposta = await fetch(url)
    if (!risposta.ok) throw new Error(`compilaPtyAndroid: ${url} → HTTP ${risposta.status}`)
    return Buffer.from(await risposta.arrayBuffer())
}

/**
 * La cartella `include/node` degli header di Node. Si scaricano una volta in `cache` e si estraggono solo se l'impronta è quella
 * attesa; poi si riusano.
 */
export async function headerDiNode({ cache, scaricaFn = scaricaVero, atteso = HEADER_NODE }) {
    const include = join(cache, `node-v${atteso.versione}`, 'include', 'node')
    if (existsSync(join(include, 'node_api.h'))) return include
    const byte = await scaricaFn(atteso.url)
    const impronta = createHash('sha256').update(byte).digest('hex')
    if (impronta !== atteso.sha256) throw new Error(`compilaPtyAndroid: header di Node ${atteso.versione} con sha256 ${impronta}, atteso ${atteso.sha256}`)
    mkdirSync(cache, { recursive: true })
    const appoggio = mkdtempSync(join(cache, 'header-'))
    try {
        const archivio = join(appoggio, 'header.tar.gz')
        writeFileSync(archivio, byte)
        execFileSync(tarDiSistema(), ['-xzf', archivio, '-C', appoggio])
        renameSync(join(appoggio, `node-v${atteso.versione}`), join(cache, `node-v${atteso.versione}`))
    } finally {
        rmSync(appoggio, { recursive: true, force: true })
    }
    return include
}

/** Il binario dipende solo dalle librerie che Android dà a ogni processo; altrimenti non si spedisce. */
export function controllaDipendenzePty(byte) {
    const { needed } = leggiSezioneDinamica(byte)
    const estranee = needed.filter((nome) => !LIBRERIE_DI_SISTEMA.includes(nome))
    if (estranee.length) throw new Error(`compilaPtyAndroid: pty.node dipende da ${estranee.join(', ')}, fuori dalle librerie di sistema`)
}

function eseguiVero(comando, argomenti) {
    execFileSync(comando, argomenti, { stdio: 'inherit' })
}

/**
 * Compila `nodePty/src/unix/pty.cc` in `uscita`, ripulito dai simboli; poi controlla le dipendenze. I percorsi della macchina che
 * costruisce si riscrivono (`-ffile-prefix-map`), così non finiscono nel binario.
 */
export function compilaPtyAndroid({ nodePty, nodeAddonApi, include, uscita, clang, eseguiFn = eseguiVero }) {
    mkdirSync(dirname(uscita), { recursive: true })
    const intero = `${uscita}.intero`
    const radici = [...new Set([nodePty, nodeAddonApi, include].map((p) => dirname(p)))]
    eseguiFn(clang, [
        ...OPZIONI_PTY_ANDROID,
        ...radici.map((r) => `-ffile-prefix-map=${r}=.`),
        '-I', include, '-I', nodeAddonApi,
        '-o', intero, join(nodePty, 'src', 'unix', 'pty.cc'),
    ])
    const strip = join(dirname(clang), basename(clang).endsWith('.exe') ? 'llvm-strip.exe' : 'llvm-strip')
    eseguiFn(strip, ['--strip-unneeded', '-o', uscita, intero])
    rmSync(intero, { force: true })
    const byte = readFileSync(uscita)
    controllaDipendenzePty(byte)
    return { sha256: createHash('sha256').update(byte).digest('hex'), byte: byte.length }
}

/**
 * Per `preparaPacchettoR4`: dal node-pty e dal node-addon-api che `npm ci` ha appena messo nel pacchetto. `ANDROID_HOME` (o
 * `ANDROID_SDK_ROOT`) dice dove sta l'SDK; gli header si tengono in `mobile/.kernel-r4/header-node`.
 */
export async function compilaPtyAndroidVero({ nodePty, nodeAddonApi, uscita, env = process.env, cache }) {
    const sdk = env.ANDROID_HOME || env.ANDROID_SDK_ROOT
    if (!sdk) throw new Error('compilaPtyAndroid: ANDROID_HOME (o ANDROID_SDK_ROOT) non impostata')
    const versione = (nome) => JSON.parse(readFileSync(join(nome, 'package.json'), 'utf8')).version
    const include = await headerDiNode({ cache: cache ?? join(dirname(fileURLToPath(import.meta.url)), '..', '..', '.kernel-r4', 'header-node') })
    const esito = compilaPtyAndroid({ nodePty, nodeAddonApi, include, uscita, clang: clangDellNdk({ sdk }) })
    return { ...esito, nodePty: versione(nodePty), nodeAddonApi: versione(nodeAddonApi), headerNode: HEADER_NODE.versione }
}
