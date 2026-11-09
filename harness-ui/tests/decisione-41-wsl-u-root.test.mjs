/*
 * Revisione del blocco dati, BD3 (S2): la carta di root guardava solo l'utente con cui TALOS lancia, mai il testo del comando. Con un utente
 * normale, `wsl.exe -u root -- …` girava da root senza nessuna carta: dentro Linux risponde grazie all'interop, e dalla shell di Windows è
 * la strada diretta. `wsl.exe` è finto al confine, come in `rev-f009-utente-wsl-scelta.test.mjs`: una distro con root di serie e `mario`.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import childProcess from 'node:child_process'
import { mock } from 'node:test'
import { syncBuiltinESMExports } from 'node:module'

const spawnVero = childProcess.spawn
const FATTI = 'utente=root\nuid=0\nnormale=mario\nmontaggio=/mnt/c rw,noatime,aname=drvfs;path=C:\\;uid=0;gid=0\n'
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
const { comandoChiedeRootWsl } = await import('../src/kernel/utente-wsl.mjs')

const CON_ROOT = [
    'wsl -u root -- rm -rf /opt/x',
    'wsl.exe -u root -- rm -rf /opt/x',
    'WSL.EXE -u root id',
    'wsl.exe --user root -d Ubuntu id',
    'wsl -d Ubuntu -u root adduser nuovo',
    'wsl --distribution Ubuntu --user root id',
    'wsl -d "Ubuntu" -u "root" id',
    "wsl -u 'root' id",
    'wsl --user=root id',
    'wsl -u 0 id',
    'wsl --system id',
    'wsl -d Ubuntu --system id',
    'C:\\Windows\\System32\\wsl.exe -u root id',
    '/mnt/c/Windows/System32/wsl.exe -u root id',
    '"C:\\Windows\\System32\\wsl.exe" -u root id',
    'echo prima && wsl -u root id',
    'ls; wsl.exe -u root id',
    'ls | wsl -u root tee /etc/x',
    '(wsl -u root id)',
    'cmd /c wsl -u root id',
    'powershell -c "wsl -u root id"',
]
const SENZA_ROOT = [
    'wsl -l -v',
    'wsl --status',
    'wsl -u mario id',
    'wsl --user mario id',
    'wsl -d Ubuntu id',
    'wsl -d root id',
    'wsl --distribution root id',
    'wsl -- id -u root',
    'wsl -- -u root',
    'wsl -e --system',
    'wsl -d Ubuntu -- id -u root',
    'wsl --exec id -u root',
    'wsl -e id -u root',
    'wsl id -u root',
    'ls wsl -u root',
    'mywsl -u root id',
    'wsl-tools -u root',
    'grep "wsl" -u root',
    'cat wsl.exe.log',
    'id -u root',
    '',
]

test('BD3-01: tutte le forme scritte di root si riconoscono, anche dentro una riga più lunga', () => {
    for (const comando of CON_ROOT) assert.equal(comandoChiedeRootWsl(comando), true, comando)
})

test('BD3-02: al contrario, un altro utente, una distro di nome root, gli argomenti del comando Linux e il testo qualunque non chiedono niente', () => {
    for (const comando of SENZA_ROOT) assert.equal(comandoChiedeRootWsl(comando), false, comando)
    assert.equal(comandoChiedeRootWsl(null), false)
})

test('BD3-03: con un utente normale la carta c è, in Linux e da Windows, e dice che lo chiede il comando', async () => {
    const attesa = { distro: 'Ubuntu', utente: 'root', sceltoDalComando: true }
    assert.deepEqual(await rootWslDelComando('wsl.exe -u root -- rm -rf /opt/x', { dove: 'wsl2', usaUtenteNormale: true }), attesa)
    assert.deepEqual(await rootWslDelComando('wsl -u root -- rm -rf /opt/x', { dove: 'windows', usaUtenteNormale: true }), attesa)
})

test('BD3-04: al contrario, un comando normale con un utente normale non ha carta, e `id -u root` nemmeno', async () => {
    assert.equal(await rootWslDelComando('ls -la', { dove: 'wsl2', usaUtenteNormale: true }), null)
    assert.equal(await rootWslDelComando('id -u root', { dove: 'wsl2', usaUtenteNormale: true }), null)
    assert.equal(await rootWslDelComando('wsl -u mario id', { dove: 'windows', usaUtenteNormale: true }), null)
})
