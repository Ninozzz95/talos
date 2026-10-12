/*
 * F-P-004 (S1, stress test della CLI 0.5.5, 12/10/2026) — `type .\.e*v` e `type keys\id_*` LEGGEVANO I SEGRETI.
 * Il passo delle parole della shell (`paroleDellaShell`, path-policy.mjs) leggeva `\` SEMPRE come escape di bash: `.\.e*v` diventava `..e*v`
 * (nessun file) e `keys\id_*` diventava `keysid_*`. Ma in cmd e PowerShell `\` è il separatore delle cartelle: lo stesso testo apre `.env` e
 * `keys\id_ed25519`, e i canary arrivavano al modello. Le forme nude (`type .en*`, `.e?v`, `*.pem`) erano già rifiutate. Cura: ogni parola
 * si legge in TUTTE E DUE le grammatiche, e il segreto vale se una delle due lo nomina. Prova riprodotta dalla sessione CLI 2/2.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { motivoDaChiedere } from '../src/path-policy.mjs'

const CARTELLA = process.platform === 'win32' ? 'C:\\lavoro\\progetto' : '/lavoro/progetto'
const HOME = process.platform === 'win32' ? 'C:\\Users\\prova' : '/home/prova'
const radice = CARTELLA.replace(/\\/g, '/')
const DISCO = {
    [radice]: { nomi: ['.env', 'README.md', 'keys', 'src'] },
    [radice + '/keys']: { nomi: ['id_ed25519', 'id_ed25519.pub', 'note.txt'] },
    [radice + '/src']: { nomi: ['index.ts'] },
}
const elenca = (cartella) => DISCO[String(cartella).replace(/\\/g, '/')] ?? { errore: 'ENOENT' }
const chiede = (comando) => motivoDaChiedere({ tipo: 'shell', comando, cartella: CARTELLA, home: HOME, elenca, puntiNascosti: false })
const nome = (r) => (r ? r.percorso.replace(/\\/g, '/') : null)
const bs = String.fromCharCode(92)

test('F-P-004-01: a wildcard inside a word with a Windows path separator asks, naming the real secret file', () => {
    for (const [comando, atteso] of [
        [`type .${bs}.e*v`, '.env'],
        [`type keys${bs}id_*`, 'id_ed25519'],
        [`type .${bs}keys${bs}id_e?25519`, 'id_ed25519'],
        [`Get-Content .${bs}.en?`, '.env'],
    ]) {
        const r = chiede(comando)
        assert.ok(r, `${comando}: must ask`)
        assert.equal(r.classe, 'segreto', comando)
        assert.ok(nome(r).endsWith(atteso), `${comando}: ${nome(r)}`)
    }
})

test('F-P-004-02: AL CONTRARIO — the bash readings still hold, and harmless Windows paths stay silent', () => {
    assert.equal(nome(chiede(`cat .e${bs}nv`)), '.env', 'the bash escape still recomposes .env')
    for (const comando of [`type .${bs}README.md`, `type src${bs}index.ts`, `dir keys${bs}*.txt`, `type keys${bs}id_ed25519.pub`]) {
        assert.equal(chiede(comando), null, comando)
    }
})

/*
 * F-P-004c (S3, stesso stress test): `echo import * from fs` veniva rifiutato perché il `*` nudo si espandeva su `.env` (con i file nascosti
 * visibili, come su Windows). Un comando che stampa soltanto i suoi argomenti non legge nessun file.
 */
const chiedeConNascosti = (comando) => motivoDaChiedere({ tipo: 'shell', comando, cartella: CARTELLA, home: HOME, elenca, puntiNascosti: true })

test('F-P-004c-01: a bare star given to a print-only command does not ask', () => {
    for (const comando of ['echo import * from fs', 'echo * > lista.txt', 'printf "%s\\n" *', 'Write-Output *', 'Write-Host *.md', '/usr/bin/echo *']) {
        assert.equal(chiedeConNascosti(comando), null, comando)
    }
})

test('F-P-004c-02: AL CONTRARIO — commands that read still ask, and so does a print-only command that names a secret or reads inside $()', () => {
    for (const comando of ['cat *', 'type *', 'echo ok; cat *', 'echo ok && type *', 'echo $(cat *)', 'echo x > .env', 'echo ok | type .e*v']) {
        const r = chiedeConNascosti(comando)
        assert.ok(r, `${comando}: must ask`)
        assert.equal(r.classe, 'segreto', comando)
    }
})
