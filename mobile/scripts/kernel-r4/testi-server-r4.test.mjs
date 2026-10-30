import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PERCORSO_REGOLE_ERRORI, PERCORSO_TESTI_SERVER, PERCORSO_TESTI_VARIE, estraiRegoleR4, estraiTestiR4, estraiTestiServerR4 } from './testi-server-r4.mjs'

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
    /* D-0147-ERR-2: le regole del desktop come DATI (chiave, sorgente, flag, nomi dei parametri), dal commit e non dall'albero. */
    it("TSR4-04 una tabella di regole: chiavi, espressioni e parametri nell'ordine del file; una tabella che manca si ferma", () => {
        const radice = repoDiProva()
        try {
            mkdirSync(join(radice, dirname(PERCORSO_REGOLE_ERRORI)), { recursive: true })
            const sorgente = [
                "import { t } from '../i18n';",
                'const ALTRA = [1];',
                'const TABELLA = [',
                String.raw`  { chiave: 'errori.kernel.uno', re: /^(?:One\.|Uno\.)$/u },`,
                '  // un commento in mezzo',
                String.raw`  { chiave: 'errori.kernel.due', re: /^Two (\d+)$/u, parametri: (m) => ({ n: m[1], q: t('errori.kernel.x', { n: m[1] }) }) },`,
                '];',
                'export function f() {}',
                '',
            ].join('\n')
            writeFileSync(join(radice, PERCORSO_REGOLE_ERRORI), sorgente)
            git(radice, 'add', '.')
            git(radice, 'commit', '-q', '-m', 'uno')
            const commit = git(radice, 'rev-parse', 'HEAD')
            // l'albero di lavoro cambia dopo il commit: non deve entrare
            writeFileSync(join(radice, PERCORSO_REGOLE_ERRORI), 'const TABELLA = [\n];\n')
            const { origine, regole } = estraiRegoleR4({ r4: radice, commit, percorso: PERCORSO_REGOLE_ERRORI, tabella: 'TABELLA' })
            assert.deepEqual(origine, { commit, percorso: PERCORSO_REGOLE_ERRORI, tabella: 'TABELLA', sha256: createHash('sha256').update(sorgente).digest('hex') })
            assert.deepEqual(regole, [
                { chiave: 'errori.kernel.uno', sorgente: String.raw`^(?:One\.|Uno\.)$`, flag: 'u', parametri: [] },
                { chiave: 'errori.kernel.due', sorgente: String.raw`^Two (\d+)$`, flag: 'u', parametri: ['n', 'q'] },
            ])
            assert.throws(() => estraiRegoleR4({ r4: radice, commit, percorso: PERCORSO_REGOLE_ERRORI, tabella: 'MANCA' }), /manca MANCA/)
        } finally {
            rmSync(radice, { recursive: true, force: true })
        }
    })

    /*
     * MOD-20, lato script (Desktop, 27/10): la tabella che il telefono usa (`errori-kernel-r4.json`) è ESATTAMENTE `MESSAGGI_DEL_KERNEL`
     * del desktop al commit che dichiara: rosso se una voce si aggiunge, sparisce o cambia. Senza quel commit nel clone, lo si dice.
     */
    it('TSR4-05 MOD-20: le regole nel JSON del telefono sono quelle di components/errori.js al commit dichiarato', (t) => {
        const qui = dirname(fileURLToPath(import.meta.url))
        const json = JSON.parse(readFileSync(join(qui, '..', '..', 'src', 'lib', 'harness', 'r4', 'testi', 'errori-kernel-r4.json'), 'utf8'))
        const radice = git(qui, 'rev-parse', '--show-toplevel')
        try {
            git(radice, 'cat-file', '-e', `${json.origineRegole.commit}^{commit}`)
        } catch {
            t.skip(`il commit ${json.origineRegole.commit.slice(0, 9)} non è in questo clone`)
            return
        }
        const { origine, regole } = estraiRegoleR4({ r4: radice, commit: json.origineRegole.commit, percorso: json.origineRegole.percorso, tabella: json.origineRegole.tabella })
        assert.deepEqual(origine, json.origineRegole)
        assert.deepEqual(regole, json.regole)
    })
})
