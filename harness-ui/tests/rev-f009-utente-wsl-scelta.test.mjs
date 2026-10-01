/*
 * ⛔⛔ F009 — LA SCELTA DELL'UTENTE, provata al confine del processo. Sulla macchina dell'owner (01/10/2026) Ubuntu NON ha un
 *   utente normale, quindi il WSL vero non può mostrare `-u <utente>`: qui `wsl.exe` è finto al confine (`spawnSync` per
 *   `wsl -l -v`, `spawn` per la sonda dei fatti e per il comando), e risponde come una distro con root predefinito e un
 *   utente normale `mario`. Tutto il resto — destinazione, sonda del programma, argv, esito — è il codice vero.
 *   File a sé: le cache della distro e dei fatti vivono nel processo, e qui devono nascere dalla distro finta.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import childProcess from 'node:child_process'
import { mock } from 'node:test'
import { syncBuiltinESMExports } from 'node:module'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs'

const spawnVero = childProcess.spawn
const chiamate = []
const FATTI = 'utente=root\nuid=0\nnormale=mario\nmontaggio=/mnt/c rw,noatime,aname=drvfs;path=C:\\;metadata;uid=0;gid=0\n'
mock.method(childProcess, 'spawnSync', (programma, argomenti, opzioni) => {
    if (programma === 'wsl.exe' && argomenti?.[0] === '-l') return { status: 0, stdout: '  NAME      STATE           VERSION\n* Ubuntu    Running         2\n', stderr: '' }
    throw new Error(`spawnSync inatteso: ${programma} ${JSON.stringify(argomenti)} ${JSON.stringify(opzioni ?? {})}`)
})
mock.method(childProcess, 'spawn', (programma, argomenti, opzioni) => {
    if (programma !== 'wsl.exe') return spawnVero(programma, argomenti, opzioni)
    chiamate.push(argomenti)
    const utente = argomenti[2] === '-u' ? argomenti[3] : 'root'
    const script = argomenti.includes('sh') && argomenti[argomenti.indexOf('sh') + 1] === '-c' ? `process.stdout.write(${JSON.stringify(FATTI)})`
        : argomenti.some((a) => /command -v/.test(a)) ? 'process.exit(0)'
            : `process.stdout.write(${JSON.stringify(utente + '\n')})`
    return spawnVero(process.execPath, ['-e', script], { ...opzioni, shell: false })
})
syncBuiltinESMExports()
const { eseguiComandoSandboxato, rootWslDelComando, statoWsl } = await import('../src/kernel/talosHarness.mjs')

function cartellaDiProva(t) {
    const cartella = mkdtempSync(join(tmpdir(), 'talos-f009-scelta-'))
    t.after(() => rimuoviCartellaDiProva(cartella))
    return cartella
}
const comandi = () => chiamate.filter((a) => a.includes('-lc') && !a.some((x) => /command -v/.test(x)))

test('SCELTA-01: con la preferenza accesa e un utente normale, il comando parte con `-u mario` e l esito lo dice', async (t) => {
    const prima = comandi().length
    const r = await eseguiComandoSandboxato('id -un', cartellaDiProva(t), { dove: 'wsl2', wsl: { usaUtenteNormale: true } })
    const argv = comandi().slice(prima)[0]
    assert.deepEqual(argv.slice(0, 6), ['-d', 'Ubuntu', '-u', 'mario', '--exec', 'bash'])
    assert.equal(r.testo.trim(), 'mario')
    assert.equal(r.wsl.utente, 'mario')
    assert.equal(r.wsl.root, false)
})

test('SCELTA-02: senza preferenza (TALOS-BANCO, CLI, mobile) l argv è quello di prima — nessun `-u`', async (t) => {
    const prima = comandi().length
    const r = await eseguiComandoSandboxato('id -un', cartellaDiProva(t), { dove: 'wsl2' })
    const argv = comandi().slice(prima)[0]
    assert.deepEqual(argv.slice(0, 4), ['-d', 'Ubuntu', '--exec', 'bash'])
    assert.equal(r.wsl.utente, 'root')
    assert.equal(r.wsl.root, true)
    const spenta = await eseguiComandoSandboxato('id -un', cartellaDiProva(t), { dove: 'wsl2', wsl: { usaUtenteNormale: false } })
    assert.equal(spenta.wsl.utente, 'root')
})

test('SCELTA-03: col ripiego automatico la sonda del programma chiede con lo STESSO utente del comando', async (t) => {
    const prima = chiamate.length
    await eseguiComandoSandboxato('npm --version', cartellaDiProva(t), { wsl: { usaUtenteNormale: true } })
    const sonda = chiamate.slice(prima).find((a) => a.some((x) => /command -v/.test(x)))
    assert.ok(sonda, 'la sonda del programma è partita')
    assert.deepEqual(sonda.slice(0, 4), ['-d', 'Ubuntu', '-u', 'mario'])
})

test('SCELTA-04: i fatti si chiedono una volta e si tengono — non una sonda in più per ogni comando', () => {
    const sonde = chiamate.filter((a) => a.includes('sh') && a[a.indexOf('sh') + 1] === '-c')
    assert.equal(sonde.length, 1)
})

test('SCELTA-05: la conferma di root segue la stessa scelta — con mario non serve, spenta sì', async () => {
    assert.equal(await rootWslDelComando('ls', { dove: 'wsl2', usaUtenteNormale: true }), null)
    assert.deepEqual(await rootWslDelComando('ls', { dove: 'wsl2', usaUtenteNormale: false }), { distro: 'Ubuntu', utente: 'root' })
    assert.equal(await rootWslDelComando('dir', { dove: 'windows', usaUtenteNormale: false }), null, 'su Windows non c è root di WSL')
    if (process.platform !== 'win32') return // statoWsl dichiara WSL assente fuori da Windows
    const stato = await statoWsl({ usaUtenteNormale: true })
    assert.deepEqual(stato, { disponibile: true, distro: 'Ubuntu', utentePredefinito: 'root', predefinitoRoot: true, utenteNormale: 'mario',
        utenteUsato: 'mario', root: false, montaggi: [{ montaggio: '/mnt/c', metadata: true }] })
})
