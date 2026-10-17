import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { PERCORSO_TESTI_SERVER, PERCORSO_TESTI_VARIE, estraiTestiR4, estraiTestiServerR4 } from './testi-server-r4.mjs'

/* K3-C3a2: il dizionario si prende dal COMMIT, non dall'albero di lavoro, e porta la sua provenienza. */
function git(radice, ...argomenti) {
    return execFileSync('git', ['-C', radice, ...argomenti], { encoding: 'utf8' }).trim()
}

function repoDiProva() {
    const radice = mkdtempSync(join(tmpdir(), 'r4-testi-'))
    git(radice, 'init', '-q')
    git(radice, 'config', 'user.email', 'prova@example.invalid')
    git(radice, 'config', 'user.name', 'prova')
    git(radice, 'config', 'core.autocrlf', 'false')
    mkdirSync(join(radice, dirname(PERCORSO_TESTI_SERVER)), { recursive: true })
    return radice
}

describe('testi del server r4 (K3-C3a2)', () => {
    it('TSR4-01 estrae it ed en dal commit fissato, con commit completo, percorso e impronta della sorgente', async () => {
        const radice = repoDiProva()
        try {
            const sorgente = "export default {\n  it: { 'a.b': 'Ciao {nome}' },\n  en: { 'a.b': 'Hello {nome}' },\n};\n"
            writeFileSync(join(radice, PERCORSO_TESTI_SERVER), sorgente)
            git(radice, 'add', '.')
            git(radice, 'commit', '-q', '-m', 'uno')
            const commit = git(radice, 'rev-parse', 'HEAD')
            // l'albero di lavoro cambia dopo il commit: non deve entrare
            writeFileSync(join(radice, PERCORSO_TESTI_SERVER), "export default { it: { 'a.b': 'SPORCO' }, en: { 'a.b': 'DIRTY' } };\n")
            const testi = await estraiTestiServerR4({ r4: radice, commit: commit.slice(0, 9) })
            assert.deepEqual(testi, {
                origine: { commit, percorso: PERCORSO_TESTI_SERVER, sha256: createHash('sha256').update(sorgente).digest('hex') },
                it: { 'a.b': 'Ciao {nome}' },
                en: { 'a.b': 'Hello {nome}' },
            })
        } finally {
            rmSync(radice, { recursive: true, force: true })
        }
    })

    it('TSR4-02 una forma diversa da { it, en } si ferma con un errore, non scrive un dizionario vuoto', async () => {
        const radice = repoDiProva()
        try {
            writeFileSync(join(radice, PERCORSO_TESTI_SERVER), 'export default { solo: {} };\n')
            git(radice, 'add', '.')
            git(radice, 'commit', '-q', '-m', 'uno')
            await assert.rejects(estraiTestiServerR4({ r4: radice, commit: 'HEAD' }), /forma inattesa/)
        } finally {
            rmSync(radice, { recursive: true, force: true })
        }
    })

    it("TSR4-03 un'altra area con un prefisso: solo le sue chiavi, con la provenienza del file e il prefisso", async () => {
        const radice = repoDiProva()
        try {
            mkdirSync(join(radice, dirname(PERCORSO_TESTI_VARIE)), { recursive: true })
            const sorgente = "export default {\n  it: { 'doctor.a': 'Uno', 'altro.b': 'Due' },\n  en: { 'doctor.a': 'One', 'altro.b': 'Two' },\n};\n"
            writeFileSync(join(radice, PERCORSO_TESTI_VARIE), sorgente)
            git(radice, 'add', '.')
            git(radice, 'commit', '-q', '-m', 'uno')
            const commit = git(radice, 'rev-parse', 'HEAD')
            const testi = await estraiTestiR4({ r4: radice, commit, percorso: PERCORSO_TESTI_VARIE, prefisso: 'doctor.' })
            assert.deepEqual(testi, {
                origine: { commit, percorso: PERCORSO_TESTI_VARIE, sha256: createHash('sha256').update(sorgente).digest('hex'), prefisso: 'doctor.' },
                it: { 'doctor.a': 'Uno' },
                en: { 'doctor.a': 'One' },
            })
            // K3-C3b: più prefissi nella stessa area (il pannello vuole `usage.` e `review.` di `varie`)
            const due = await estraiTestiR4({ r4: radice, commit, percorso: PERCORSO_TESTI_VARIE, prefisso: ['doctor.', 'altro.'] })
            assert.deepEqual(due.it, { 'doctor.a': 'Uno', 'altro.b': 'Due' })
            assert.deepEqual(due.origine.prefisso, ['doctor.', 'altro.'])
        } finally {
            rmSync(radice, { recursive: true, force: true })
        }
    })
})
