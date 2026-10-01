/*
 * Fase B «casa di esecuzione» — le due viste dello stesso percorso (`src/kernel/percorsi-casa-linux.mjs`), come `wslpath`.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { vistaWindows, vistaLinux } from '../src/kernel/percorsi-casa-linux.mjs'

const o = { distro: 'Ubuntu' }

test('PCL-01: da Linux a Windows — /mnt/<x> è il disco, il resto è la distro via \\\\wsl.localhost, i relativi restano', () => {
    assert.equal(vistaWindows('/mnt/c/proj/a.txt', o), 'C:\\proj\\a.txt')
    assert.equal(vistaWindows('/mnt/d', o), 'D:\\')
    assert.equal(vistaWindows('/tmp/x', o), '\\\\wsl.localhost\\Ubuntu\\tmp\\x')
    assert.equal(vistaWindows('/home/u/.bashrc', o), '\\\\wsl.localhost\\Ubuntu\\home\\u\\.bashrc')
    assert.equal(vistaWindows('/', o), '\\\\wsl.localhost\\Ubuntu\\')
    assert.equal(vistaWindows('a/b.txt', o), 'a/b.txt')
    assert.equal(vistaWindows('C:\\x\\y', o), 'C:\\x\\y')
    assert.equal(vistaWindows('', o), '')
    assert.equal(vistaWindows('//server/x', o), '//server/x', 'un UNC scritto con le barre non è un percorso di Linux')
    assert.equal(vistaWindows('/mnt/cc/x', o), '\\\\wsl.localhost\\Ubuntu\\mnt\\cc\\x', '/mnt/cc non è un disco')
})

test('PCL-02: da Windows a Linux — e ciò che Linux non raggiunge è null, mai indovinato', () => {
    assert.equal(vistaLinux('C:\\proj\\a.txt', o), '/mnt/c/proj/a.txt')
    assert.equal(vistaLinux('c:/proj/a.txt', o), '/mnt/c/proj/a.txt')
    assert.equal(vistaLinux('C:\\', o), '/mnt/c')
    assert.equal(vistaLinux('C:', o), '/mnt/c')
    assert.equal(vistaLinux('\\\\wsl.localhost\\Ubuntu\\tmp\\x', o), '/tmp/x')
    assert.equal(vistaLinux('\\\\wsl$\\ubuntu\\tmp', o), '/tmp')
    assert.equal(vistaLinux('\\\\wsl.localhost\\Ubuntu', o), '/')
    assert.equal(vistaLinux('\\\\wsl.localhost\\Debian\\x', o), null, 'un altra distro')
    assert.equal(vistaLinux('\\\\server\\share\\x', o), null, 'un server di rete')
    assert.equal(vistaLinux('a\\b.txt', o), 'a/b.txt')
    assert.equal(vistaLinux('/tmp/x', o), '/tmp/x')
})

test('PCL-03: andata e ritorno — la stessa cosa nelle due viste', () => {
    for (const p of ['/mnt/c/proj/a b/c.txt', '/tmp/x', '/home/u/.ssh/id_rsa', '/mnt/d/x']) assert.equal(vistaLinux(vistaWindows(p, o), o), p)
    for (const p of ['C:\\proj\\a.txt', '\\\\wsl.localhost\\Ubuntu\\etc\\hostname']) assert.equal(vistaWindows(vistaLinux(p, o), o), p)
})
