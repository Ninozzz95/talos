#!/usr/bin/env node

/**
 * N1 (25/10/2026) — i testi completi delle licenze dei componenti NATIVI e delle librerie Android, per le Note legali.
 *
 * MIT, BSD, Apache-2.0 e Zlib chiedono che il testo, o l'avviso di copyright, viaggi col binario. AboutLibraries gira in
 * `offlineMode` (niente rete durante la build Gradle) e quindi non porta i testi; i componenti nativi non li vede nessuno.
 * Questo script li prende dalle copie upstream ALLA VERSIONE spedita, elencate in `fonti.json` (tag o commit nell'indirizzo),
 * controlla l'impronta sha256 di ogni testo e scrive `src/generated/nativeLicenses.json`. Nessun testo è copiato a mano.
 *
 *  - `url`: un file pubblico a un tag o a un commit (`base64`: le pagine `?format=TEXT` di googlesource);
 *  - `git`: un file di un repository locale a un riferimento (`third_party/llama.cpp` del sottomodulo; `$IROH_FFI` = il clone
 *    di iroh-ffi, in sola lettura: si legge con `git show`);
 *  - `rust`: i crate dentro `libiroh_ffi.so`, con cargo-about (deve essere già installato) su una copia esportata del tag, col
 *    Cargo.lock della build. Il clone non si tocca.
 *
 * Uso da mobile/:  node scripts/licenze-native/genera-licenze-native.mjs [--aggiorna-impronte]
 *   --aggiorna-impronte  scrive in `fonti.json` le impronte dei testi nuovi (sha256 null). Un'impronta già scritta che non
 *                        torna ferma lo script sempre: un testo upstream cambiato si guarda, non si accetta in silenzio.
 * Variabile: TALOS_IROH_FFI = percorso del clone di iroh-ffi (altrimenti quello di `fonti.json`, relativo a mobile/).
 */

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const QUI = path.dirname(fileURLToPath(import.meta.url))
const MOBILE = path.resolve(QUI, '..', '..')
const FONTI = path.join(QUI, 'fonti.json')
const USCITA = path.join(MOBILE, 'src', 'generated', 'nativeLicenses.json')

const sha256 = (testo) => createHash('sha256').update(testo, 'utf8').digest('hex')
/** A capo uniformi: le copie googlesource e quelle git su Windows non devono cambiare impronta. */
const normalizza = (testo) => testo.replace(/\r\n?/gu, '\n')

async function leggiFonte(fonte, cloneIroh) {
    if (fonte.url) {
        const risposta = await fetch(fonte.url)
        if (!risposta.ok) throw new Error(`${fonte.url}: HTTP ${risposta.status}`)
        const corpo = await risposta.text()
        return { testo: normalizza(fonte.base64 ? Buffer.from(corpo, 'base64').toString('utf8') : corpo), da: fonte.url }
    }
    if (fonte.git) {
        const repo = fonte.git.repo === '$IROH_FFI' ? cloneIroh : path.resolve(MOBILE, fonte.git.repo)
        const rif = execFileSync('git', ['-C', repo, 'rev-parse', `${fonte.git.rif}^{commit}`], { encoding: 'utf8' }).trim()
        const testo = execFileSync('git', ['-C', repo, 'show', `${rif}:${fonte.git.percorso}`], { encoding: 'utf8' })
        const nome = fonte.git.repo === '$IROH_FFI' ? 'n0-computer/iroh-ffi' : fonte.git.repo
        return { testo: normalizza(testo), da: `${nome} ${fonte.git.rif} (${rif.slice(0, 12)}) ${fonte.git.percorso}` }
    }
    throw new Error(`fonte senza url né git: ${JSON.stringify(fonte)}`)
}

/** Legge una fonte, controlla l'impronta, e torna la voce del file generato. */
async function voce(fonte, chi, opzioni, nuove) {
    const { testo, da } = await leggiFonte(fonte, opzioni.cloneIroh)
    if (!testo.trim()) throw new Error(`${chi}: testo vuoto da ${da}`)
    const impronta = sha256(testo)
    if (fonte.sha256 === null) {
        if (!opzioni.aggiorna) throw new Error(`${chi}: impronta non fissata (${impronta}); rilancia con --aggiorna-impronte e rileggi il testo`)
        fonte.sha256 = impronta
        nuove.push(`${chi}: ${impronta}`)
    } else if (fonte.sha256 !== impronta) {
        throw new Error(`${chi}: il testo di ${da} è cambiato (atteso ${fonte.sha256}, letto ${impronta})`)
    }
    return { titolo: fonte.titolo, fonte: da, sha256: impronta, testo }
}

/**
 * N1-bis (25/10/2026) — MPL-2.0 §3.2(a): chi riceve il binario deve sapere dove sta il sorgente dei file MPL. Per ogni crate sotto
 * una licenza MPL il JSON porta il suo indirizzo su crates.io alla versione compilata (lo stesso pacchetto che cargo ha scaricato);
 * il pannello lo mostra sotto l'intestazione della licenza. CDLA-Permissive-2.0 chiede solo il testo.
 */
const CON_SORGENTE = /^MPL-/u
const sorgenteCrate = (crate) => {
    const [nome, versione] = crate.split(' ')
    return `https://crates.io/crates/${nome}/${versione}`
}

function crateRust(fonti, cloneIroh, opzioni, nuove) {
    const lock = readFileSync(path.join(cloneIroh, 'Cargo.lock'), 'utf8')
    const improntaLock = sha256(normalizza(lock))
    if (fonti.lockSha256 === null) {
        if (!opzioni.aggiorna) throw new Error(`Cargo.lock di iroh-ffi: impronta non fissata (${improntaLock})`)
        fonti.lockSha256 = improntaLock
        nuove.push(`Cargo.lock: ${improntaLock}`)
    } else if (fonti.lockSha256 !== improntaLock) {
        throw new Error(`Cargo.lock di iroh-ffi cambiato: atteso ${fonti.lockSha256}, letto ${improntaLock}`)
    }
    const commit = execFileSync('git', ['-C', cloneIroh, 'rev-parse', `${fonti.tag}^{commit}`], { encoding: 'utf8' }).trim()
    const cartella = mkdtempSync(path.join(tmpdir(), 'talos-n1-iroh-'))
    try {
        const archivio = path.join(cartella, 'sorgente.tar')
        execFileSync('git', ['-C', cloneIroh, 'archive', '-o', archivio, commit])
        execFileSync('tar', ['-xf', 'sorgente.tar'], { cwd: cartella })
        writeFileSync(path.join(cartella, 'Cargo.lock'), lock)
        writeFileSync(path.join(cartella, 'about.toml'), [
            'accepted = ["MIT", "Apache-2.0", "Apache-2.0 WITH LLVM-exception", "BSD-2-Clause", "BSD-3-Clause", "ISC", "Zlib",',
            '  "Unicode-3.0", "Unicode-DFS-2016", "CC0-1.0", "MPL-2.0", "0BSD", "BSL-1.0", "CDLA-Permissive-2.0", "OpenSSL", "Unlicense"]',
            `targets = ["${fonti.bersaglio}"]`,
            'ignore-build-dependencies = true',
            'ignore-dev-dependencies = true',
            '',
        ].join('\n'))
        // REV6-N1 (25/10/2026): un cargo-about diverso cambierebbe i testi in silenzio; la versione è fissata in `fonti.json`.
        const versione = execFileSync('cargo-about', ['--version'], { encoding: 'utf8' }).trim()
        if (versione !== `cargo-about ${fonti.cargoAbout}`) {
            throw new Error(`cargo-about: fissata la ${fonti.cargoAbout}, trovata «${versione}»; un'altra versione cambia i testi, si decide prima`)
        }
        execFileSync('cargo-about', ['generate', '--format', 'json', '--locked', '-o', 'about.json'], { cwd: cartella, stdio: ['ignore', 'ignore', 'inherit'] })
        const dati = JSON.parse(readFileSync(path.join(cartella, 'about.json'), 'utf8'))
        const licenze = dati.licenses
            .map((l) => ({
                id: l.id,
                testo: normalizza(l.text),
                crates: [...new Set(l.used_by.map((u) => `${u.crate.name} ${u.crate.version}`))].sort(),
            }))
            .map((l) => (CON_SORGENTE.test(l.id) ? { ...l, sorgenti: l.crates.map(sorgenteCrate) } : l))
            .sort((a, b) => a.id.localeCompare(b.id) || a.crates[0].localeCompare(b.crates[0]))
        const vuote = licenze.filter((l) => !l.testo.trim())
        if (vuote.length) throw new Error(`cargo-about: licenze senza testo per ${vuote.flatMap((l) => l.crates).join(', ')}`)
        // REV6-N1: l'impronta di TUTTO l'elenco (testi, crate, sorgenti): basta una differenza in un testo per fermarsi.
        const improntaLicenze = sha256(JSON.stringify(licenze))
        if (fonti.licenzeSha256 === null) {
            if (!opzioni.aggiorna) throw new Error(`testi dei crate Rust: impronta non fissata (${improntaLicenze})`)
            fonti.licenzeSha256 = improntaLicenze
            nuove.push(`testi dei crate Rust: ${improntaLicenze}`)
        } else if (fonti.licenzeSha256 !== improntaLicenze) {
            throw new Error(`testi dei crate Rust cambiati: atteso ${fonti.licenzeSha256}, letto ${improntaLicenze}`)
        }
        return {
            fonte: `n0-computer/iroh-ffi ${fonti.tag} (${commit.slice(0, 12)}), Cargo.lock della build (sha256 ${improntaLock.slice(0, 12)}), ${versione}, ${fonti.bersaglio}`,
            crates: dati.crates.length,
            licenze,
        }
    } finally {
        rmSync(cartella, { recursive: true, force: true })
    }
}

async function main() {
    const opzioni = { aggiorna: process.argv.includes('--aggiorna-impronte') }
    const fonti = JSON.parse(readFileSync(FONTI, 'utf8'))
    // il clone in `fonti.json` è relativo a mobile/ (nessun percorso personale nel repository pubblico)
    opzioni.cloneIroh = process.env.TALOS_IROH_FFI || path.resolve(MOBILE, fonti.rust.clone)
    const nuove = []

    const componenti = {}
    for (const [nome, elenco] of Object.entries(fonti.componenti)) {
        componenti[nome] = []
        for (const fonte of elenco) componenti[nome].push(await voce(fonte, `${nome} / ${fonte.titolo}`, opzioni, nuove))
    }
    const android = { perLicenza: {}, perLibreria: {} }
    for (const gruppo of ['perLicenza', 'perLibreria']) {
        for (const [chiave, fonte] of Object.entries(fonti.android[gruppo])) {
            android[gruppo][chiave] = await voce(fonte, `android ${chiave}`, opzioni, nuove)
            // REV6: il testo proprio di una libreria dice quali sue licenze copre; per le altre il pannello aggiunge il testo comune.
            if (gruppo === 'perLibreria') {
                if (!fonte.copre?.length) throw new Error(`android ${chiave}: manca «copre», le licenze che il suo testo copre`)
                android[gruppo][chiave].copre = fonte.copre
            }
        }
    }
    const rust = crateRust(fonti.rust, opzioni.cloneIroh, opzioni, nuove)

    writeFileSync(USCITA, `${JSON.stringify({ schema: 'talos.mobile.licenze-native.v1', componenti, rust, android })}\n`)
    if (nuove.length) writeFileSync(FONTI, `${JSON.stringify(fonti, null, 2)}\n`)
    const testi = Object.values(componenti).flat().length + Object.keys(android.perLicenza).length + Object.keys(android.perLibreria).length
    console.log(`nativeLicenses.json: ${testi} testi, ${rust.licenze.length} licenze per ${rust.crates} crate Rust`)
    for (const riga of nuove) console.log(`impronta fissata — ${riga}`)
}

main().catch((errore) => {
    console.error(`⛔ ${errore.message}`)
    process.exit(1)
})
