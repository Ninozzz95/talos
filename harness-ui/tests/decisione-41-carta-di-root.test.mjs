/*
 * Decisione 41 dell'owner (02/11/2026, reperto D11 del Tester). Sulla macchina dell'owner la carta dice root con `tools.wslNormalUser`
 *   acceso perché Ubuntu NON ha un utente normale (misurato il 03/11: uid 0, nessuna riga `normale=`), e TALOS non crea utenti: la
 *   preferenza non può fare niente. Qui `wsl.exe` è finto al confine, come in `rev-f009-utente-wsl-scelta.test.mjs`, ma risponde come
 *   quella distro. File a sé: le cache della distro e dei fatti vivono nel processo.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import childProcess from 'node:child_process'
import { mock } from 'node:test'
import { syncBuiltinESMExports } from 'node:module'

const spawnVero = childProcess.spawn
const FATTI = 'utente=root\nuid=0\nmontaggio=/mnt/c rw,noatime,aname=drvfs;path=C:\\;uid=0;gid=0\n'
mock.method(childProcess, 'spawnSync', (programma, argomenti) => {
    if (programma === 'wsl.exe' && argomenti?.[0] === '-l') return { status: 0, stdout: '  NAME      STATE           VERSION\n* Ubuntu    Running         2\n', stderr: '' }
    throw new Error(`spawnSync inatteso: ${programma}`)
})
mock.method(childProcess, 'spawn', (programma, argomenti, opzioni) => {
    if (programma !== 'wsl.exe') return spawnVero(programma, argomenti, opzioni)
    return spawnVero(process.execPath, ['-e', `process.stdout.write(${JSON.stringify(FATTI)})`], { ...opzioni, shell: false })
})
syncBuiltinESMExports()
const { rootWslDelComando } = await import('../src/kernel/talosHarness.mjs')
const { distroSenzaUtenteNormale } = await import('../src/kernel/utente-wsl.mjs')

test('D41-FATTI: «senza utente normale» vuol dire root di serie e nessun altro utente, e niente fatti non vuol dire niente', () => {
    assert.equal(distroSenzaUtenteNormale({ uid: 0, utenteNormale: null }), true)
    assert.equal(distroSenzaUtenteNormale({ uid: 0, utenteNormale: 'mario' }), false)
    assert.equal(distroSenzaUtenteNormale({ uid: 1000, utenteNormale: null }), false)
    assert.equal(distroSenzaUtenteNormale(null), false)
})

test('D41-RADICE: preferenza accesa e nessun utente normale nella distro: root, e il perché viaggia con la risposta', async () => {
    assert.deepEqual(await rootWslDelComando('ls', { dove: 'wsl2', usaUtenteNormale: true }), { distro: 'Ubuntu', utente: 'root', nessunUtenteNormale: true })
    assert.deepEqual(await rootWslDelComando('ls', { dove: 'wsl2', usaUtenteNormale: false }), { distro: 'Ubuntu', utente: 'root', nessunUtenteNormale: true })
})
