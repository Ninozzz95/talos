/*
 * Dalla revisione del bugfixer (16/10/2026, preesistente): un glob dentro le virgolette di un INTERPRETE ANNIDATO non chiedeva —
 * `powershell -c "gc .e*v"`, `bash -c 'cat .e*v'`, `cmd /c "type .e*v"` leggevano il `.env`. Le virgolette impediscono il glob al
 * primo livello; ma quel testo è un comando che l'interprete rilegge. Disco finto (`elenca`), come c005-glob-sui-nomi-segreti.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { motivoDaChiedere } from '../src/path-policy.mjs'

const CARTELLA = process.platform === 'win32' ? 'C:\\lavoro\\progetto' : '/lavoro/progetto'
const HOME = process.platform === 'win32' ? 'C:\\Users\\prova' : '/home/prova'
const radice = CARTELLA.replace(/\\/g, '/')
const fabbricaElenca = (albero) => (cartella) => {
    const chiave = String(cartella).replace(/\\/g, '/')
    return chiave in albero ? { nomi: albero[chiave] } : { errore: 'ENOENT' }
}
const CON_SEGRETI = { [radice]: ['.env', 'README.md', 'src', 'package.json'], [radice + '/src']: ['index.ts'] }
const PULITO = { [radice]: ['README.md', 'src', 'package.json', '.gitignore'], [radice + '/src']: ['index.ts'] }
const chiede = (comando, albero = CON_SEGRETI) =>
    motivoDaChiedere({ tipo: 'shell', comando, cartella: CARTELLA, home: HOME, elenca: fabbricaElenca(albero) })
const codificato = (testo) => Buffer.from(testo, 'utf16le').toString('base64')

test('GL-ANN-01 — a glob inside a nested interpreter command asks and names the real file', () => {
    for (const comando of [
        'powershell -c "gc .e*v"', 'pwsh -Command \'Get-Content .e?v\'', 'powershell -comm "gc .en*"', 'powershell.exe -NoProfile -c "gc .e*v"',
        'powershell "gc .e*v"', `pwsh -enc ${codificato('gc .e*v')}`, `powershell -EncodedCommand ${codificato('Get-Content .en[v]')}`,
        "bash -c 'cat .e*v'", 'sh -lc "cat .en[v]"', "zsh -c 'cat .e?v'", 'cmd /c "type .e*v"', 'cmd.exe /C "type .en*"', 'cmd /k type .e?v',
    ]) {
        const r = chiede(comando)
        assert.ok(r, comando)
        assert.match(r.percorso.replace(/\\/g, '/'), /\.env$|\.e\*v|\.e\?v|\.en/u, comando)
    }
})

test('GL-ANN-02 — AL CONTRARIO: the same interpreters with no secret behind the glob, or plain commands, ask nothing', () => {
    for (const comando of ['powershell -c "gc README.md"', "bash -c 'ls src'", 'cmd /c "type package.json"', `pwsh -enc ${codificato('Get-ChildItem src')}`,
        'git commit -m "glob .e*v in bash -c"', 'echo "bash -c \'cat .e*v\'"']) {
        assert.equal(chiede(comando), null, comando)
    }
    for (const comando of ['powershell -c "gc .e*v"', "bash -c 'cat .e*v'", 'cmd /c "type .e*v"']) {
        assert.equal(chiede(comando, PULITO), null, `${comando} (no .env on disk)`)
    }
})

/* Riverifica del bugfixer (16/10 notte): le forme che il primo giro non prendeva */
test('GL-ANN-03 — options after -c, fish --command, cmd /c glued, iex and a script block ask too', () => {
    for (const comando of [
        "bash -c -- 'cat .e*v'", "bash -c -e 'cat .e*v'", "sh -c -x 'cat .e?v'", "sh -c -- 'cat .en*'",
        "fish --command='cat .e*v'", "fish --command 'cat .e*v'",
        'cmd /c"type .e*v"', 'cmd /C"type .en*"', 'cmd //c "type .e*v"', 'cmd //C"type .e?v"',
        `powershell -c "iex 'gc .e*v'"`, `pwsh -c "Invoke-Expression 'Get-Content .e?v'"`, 'powershell -c "& {gc .e*v}"', 'pwsh -c ". { gc .en* }"',
    ]) {
        assert.ok(chiede(comando), comando)
    }
})

test('GL-ANN-04 — AL CONTRARIO: the same new forms with no secret behind, and look-alike commands, ask nothing', () => {
    for (const comando of ["bash -c -- 'ls src'", "fish --command='ls src'", 'cmd /c"type package.json"', `powershell -c "iex 'Get-Date'"`,
        'powershell -c "& {Get-ChildItem src}"', 'git -c core.pager=less log', 'python -c "print(1)"', 'cmd /d echo ciao', 'cmd //c "type package.json"']) {
        assert.equal(chiede(comando), null, comando)
    }
    for (const comando of ["bash -c -- 'cat .e*v'", 'cmd /c"type .e*v"', `powershell -c "iex 'gc .e*v'"`, 'powershell -c "& {gc .e*v}"']) {
        assert.equal(chiede(comando, PULITO), null, `${comando} (no .env on disk)`)
    }
})
