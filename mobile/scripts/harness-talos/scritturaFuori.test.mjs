import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, dirname, join } from 'node:path'
import * as kernel from './talosHarness.mjs'
const { talosLavora, posizioneNelProgetto } = kernel
const ambienteShellPulito = (env) => kernel.ambienteShellPulito(env)

/*
 * ⛔⛔ P4-quater (02/10/2026) — il Codice del Pad scrive solo dentro la cartella della sessione.
 *   Prima: con «Workspace write» il registro passava `livelloAccesso` assente e `discoNode` faceva `join(radice, percorso)`
 *   senza controllo ⇒ `scrivi`/`leggi` con `../` uscivano dalla cartella. Sul Pad, accanto a `workspace/` ci sono il codice
 *   del server, il kernel e `state/server-token`.
 * Decisioni dell'owner: come il desktop (`75108d7ee`): fuori ⇒ si chiede, percorso VERO, consenso per cartella e
 *   sottocartelle; le cartelle di TALOS non si leggono né si scrivono con nessun permesso; letture fuori libere.
 */

function cartelle(t) {
    const radice = mkdtempSync(join(tmpdir(), 'talos-fuori-'))
    const progetto = join(radice, 'workspace'); mkdirSync(progetto)
    const fuori = join(radice, 'fuori'); mkdirSync(fuori)
    const stato = join(radice, 'state'); mkdirSync(stato)
    writeFileSync(join(stato, 'server-token'), 'GETTONE-SEGRETO')
    const collegamenti = []
    const collega = (bersaglio, nome) => {
        const p = join(progetto, nome); symlinkSync(bersaglio, p, 'junction'); collegamenti.push(p); return p
    }
    // I collegamenti si staccano PRIMA di cancellare: una rimozione ricorsiva non deve mai attraversarli.
    t.after(() => {
        for (const p of collegamenti) { try { unlinkSync(p) } catch { /* già via */ } }
        rmSync(radice, { recursive: true, force: true })
    })
    return { radice, progetto, fuori, stato, collega }
}

const chiama = (id, nome, argomenti) => ({ id, type: 'function', function: { name: nome, arguments: JSON.stringify(argomenti) } })

/** Un giro vero del kernel con un modello finto che chiede `chiamate` e poi chiude. */
async function giro(progetto, chiamate, opzioni = {}) {
    let richiesta = 0
    const domande = []
    const { risposta, ...resto } = opzioni
    const risultato = await talosLavora({
        cartella: progetto, task: { consegna: 'Scrivi i file di prova.' }, modello: 'test', chiave: 'test',
        fetchDiRete: async () => ({
            ok: true, status: 200, text: async () => '',
            json: async () => ({
                choices: [{ message: richiesta++ === 0
                    ? { role: 'assistant', content: null, tool_calls: chiamate }
                    : { role: 'assistant', content: 'Fatto.' } }],
                usage: { prompt_tokens: 10, completion_tokens: 10 },
            }),
        }),
        ...(risposta === undefined ? {} : {
            chiediApprovazioneFn: async (azione) => { domande.push(azione); return typeof risposta === 'function' ? risposta(azione) : risposta },
        }),
        ...resto,
    })
    const esito = (id) => risultato.messaggiFinali.find((m) => m.tool_call_id === id)?.content ?? ''
    return { esito, domande }
}

describe('P4-quater — il confine della cartella del Codice', () => {
    it('FUORI-01 con «Workspace write» una scrittura fuori (../, anche nascosto in mezzo) CHIEDE; dentro scrive da sola', async (t) => {
        const { radice, progetto } = cartelle(t)
        const { esito, domande } = await giro(progetto, [
            chiama('dentro', 'scrivi', { percorso: 'dentro.txt', contenuto: 'qui' }),
            chiama('r', 'scrivi', { percorso: '../relativo.txt', contenuto: 'fuori' }),
            chiama('m', 'scrivi', { percorso: 'sotto/../../mezzo.txt', contenuto: 'fuori' }),
        ], { livelloAccesso: 'scrittura-progetto', risposta: false })
        assert.equal(readFileSync(join(progetto, 'dentro.txt'), 'utf8'), 'qui', 'dentro non si chiede niente')
        assert.equal(domande.length, 2, 'una domanda per ciascuna scrittura fuori')
        for (const d of domande) {
            assert.equal(d.tipo, 'scrivi')
            assert.ok(d.fuoriDalProgetto, 'la domanda porta il fatto')
            assert.match(d.fuoriDalProgetto.frase, /fuori dalla cartella della sessione/)
            assert.equal(typeof d.fuoriDalProgetto.chiave, 'string')
        }
        assert.equal(existsSync(join(radice, 'relativo.txt')), false)
        assert.equal(existsSync(join(radice, 'mezzo.txt')), false)
        assert.match(esito('r'), /^REFUSED\./)
        assert.match(esito('m'), /^REFUSED\./)
    })

    it('FUORI-01b un percorso che comincia con / finisce DENTRO, come lo scrive `discoNode` (join): si misura quel file', async (t) => {
        // ⛔ Sul telefono `discoNode` fa `join(radice, percorso)`: «/etc/x» diventa «<cartella>/etc/x». Il confine misura il file
        //   che verrà scritto davvero, non quello che il percorso sembra dire (desktop: `resolve`, qui: `join`).
        const { progetto } = cartelle(t)
        const posizione = await posizioneNelProgetto(progetto, '/etc/talos-prova.txt')
        assert.deepEqual({ dentro: posizione.dentro, verificato: posizione.verificato }, { dentro: true, verificato: true })
        const { domande } = await giro(progetto, [chiama('a', 'scrivi', { percorso: '/sotto/a.txt', contenuto: 'qui' })],
            { livelloAccesso: 'scrittura-progetto', risposta: false })
        assert.equal(domande.length, 0)
        assert.equal(readFileSync(join(progetto, 'sotto', 'a.txt'), 'utf8'), 'qui')
    })

    it('FUORI-02 col sì la scrittura fuori parte; senza nessuno a cui chiedere è rifiutata e lo dice', async (t) => {
        const { radice, progetto } = cartelle(t)
        const conSi = join(radice, 'con-si.txt')
        const si = await giro(progetto, [chiama('a', 'scrivi', { percorso: '../con-si.txt', contenuto: 'approvato' })],
            { livelloAccesso: 'scrittura-progetto', risposta: true })
        assert.equal(readFileSync(conSi, 'utf8'), 'approvato')
        assert.doesNotMatch(si.esito('a'), /REFUSED/)
        const senza = await giro(progetto, [chiama('b', 'scrivi', { percorso: '../senza.txt', contenuto: 'x' })],
            { livelloAccesso: 'scrittura-progetto' })
        assert.equal(existsSync(join(radice, 'senza.txt')), false)
        assert.match(senza.esito('b'), /REFUSED\..*fuori dalla cartella della sessione/s)
    })

    it('FUORI-03 un collegamento DENTRO la cartella che porta FUORI conta come fuori', async (t) => {
        const { progetto, fuori, collega } = cartelle(t)
        collega(fuori, 'link')
        const { domande } = await giro(progetto, [chiama('s', 'scrivi', { percorso: 'link/nuovo.txt', contenuto: 'x' })],
            { livelloAccesso: 'scrittura-progetto', risposta: false })
        assert.equal(domande.length, 1)
        assert.ok(domande[0].fuoriDalProgetto)
        assert.equal(existsSync(join(fuori, 'nuovo.txt')), false)
        const posizione = await posizioneNelProgetto(progetto, 'link/nuovo.txt')
        assert.deepEqual({ dentro: posizione.dentro, verificato: posizione.verificato }, { dentro: false, verificato: true })
    })

    it('FUORI-04 il consenso «per questa cartella» vale fino a fine sessione, sottocartelle comprese; altrove chiede', async (t) => {
        const { radice, progetto, fuori } = cartelle(t)
        const altrove = join(radice, 'altrove'); mkdirSync(altrove)
        const consensiSessione = {}
        const prima = await giro(progetto, [chiama('a', 'scrivi', { percorso: '../fuori/a.txt', contenuto: '1' })],
            { livelloAccesso: 'scrittura-progetto', consensiSessione, risposta: true })
        assert.equal(prima.domande.length, 1)
        // Ciò che il registro fa con «Consenti in questa cartella per la sessione».
        ;(consensiSessione.cartelleFuori ??= []).push(prima.domande[0].fuoriDalProgetto.chiave)
        mkdirSync(join(fuori, 'sotto'))
        const dopo = await giro(progetto, [
            chiama('b', 'scrivi', { percorso: '../fuori/b.txt', contenuto: '2' }),
            chiama('c', 'scrivi', { percorso: '../fuori/sotto/c.txt', contenuto: '3' }),
            chiama('x', 'scrivi', { percorso: '../altrove/x.txt', contenuto: '4' }),
        ], { livelloAccesso: 'scrittura-progetto', consensiSessione, risposta: false })
        assert.equal(readFileSync(join(fuori, 'b.txt'), 'utf8'), '2')
        assert.equal(readFileSync(join(fuori, 'sotto', 'c.txt'), 'utf8'), '3')
        assert.equal(dopo.domande.length, 1, 'solo la cartella mai consentita chiede')
        assert.equal(existsSync(join(altrove, 'x.txt')), false)
    })

    it('FUORI-05 le cartelle di TALOS non si scrivono né si leggono, con nessun permesso', async (t) => {
        const { progetto, stato } = cartelle(t)
        for (const opzioni of [
            { livelloAccesso: 'scrittura-progetto', risposta: true },
            { risposta: true }, // «Full access» / nessun livello: la protezione vale lo stesso
        ]) {
            const { esito, domande } = await giro(progetto, [
                chiama('w', 'scrivi', { percorso: '../state/server-token', contenuto: 'sovrascritto' }),
                chiama('r', 'leggi', { percorso: '../state/server-token' }),
            ], { ...opzioni, cartelleProtette: [stato] })
            assert.equal(readFileSync(join(stato, 'server-token'), 'utf8'), 'GETTONE-SEGRETO', 'mai scritto')
            assert.match(esito('w'), /^REFUSED\./)
            assert.match(esito('r'), /^REFUSED\./)
            assert.doesNotMatch(esito('r'), /GETTONE-SEGRETO/, 'il segreto non arriva al modello')
            assert.equal(domande.length, 0, 'non si chiede: è un no e basta')
        }
    })

    it('FUORI-05b un collegamento dentro la cartella verso una cartella di TALOS non apre la porta', async (t) => {
        const { progetto, stato, collega } = cartelle(t)
        collega(stato, 'scorciatoia')
        const { esito } = await giro(progetto, [chiama('r', 'leggi', { percorso: 'scorciatoia/server-token' })],
            { risposta: true, cartelleProtette: [stato] })
        assert.match(esito('r'), /^REFUSED\./)
        assert.doesNotMatch(esito('r'), /GETTONE-SEGRETO/)
    })

    it('FUORI-07 senza livello (banco) tutto resta come prima: nessuna domanda, si scrive dove dice il percorso', async (t) => {
        const { radice, progetto } = cartelle(t)
        const { domande } = await giro(progetto, [chiama('a', 'scrivi', { percorso: '../banco.txt', contenuto: 'banco' })])
        assert.equal(domande.length, 0)
        assert.equal(readFileSync(join(radice, 'banco.txt'), 'utf8'), 'banco')
    })

    it('FUORI-08 con «Workspace write» la shell e le altre azioni NON cominciano a chiedere', async (t) => {
        const { progetto } = cartelle(t)
        const { domande } = await giro(progetto, [chiama('s', 'shell', { comando: 'echo ciao' })],
            { livelloAccesso: 'scrittura-progetto', risposta: false })
        assert.equal(domande.length, 0, 'il registro ora passa il canale anche a «Workspace write»: chiede solo la scrittura fuori')
    })

    it('FUORI-06 le letture fuori dalla cartella restano libere (owner: come il desktop)', async (t) => {
        const { progetto, fuori } = cartelle(t)
        writeFileSync(join(fuori, 'leggibile.txt'), 'contenuto fuori')
        const { esito } = await giro(progetto, [chiama('r', 'leggi', { percorso: '../fuori/leggibile.txt' })],
            { livelloAccesso: 'scrittura-progetto', risposta: false })
        assert.match(esito('r'), /contenuto fuori/)
    })
})

/*
 * ⛔⛔⛔ P4-quater, secondo giro (owner 02/10/2026: «voglio il +1 su Hermes… non negoziabile»). Decisioni: TUTTA l'area di
 *   TALOS tranne le cartelle di lavoro; shell con una guardia ora (gabbia vera dopo la release); l'elenco di Hermes
 *   (`agent/file_safety.py` a `bfc7152687`) più le chiavi private in lettura; la shell senza le chiavi nell'ambiente
 *   (Hermes `tools/environments/local_env_policy.py:20-46`).
 */
function area(t) {
    const radice = mkdtempSync(join(tmpdir(), 'talos-area-'))
    const progetto = join(radice, 'workspace'); mkdirSync(progetto)
    const stato = join(radice, 'state'); mkdirSync(stato)
    writeFileSync(join(stato, 'server-token'), 'GETTONE-SEGRETO')
    writeFileSync(join(radice, 'talos-exec.js'), '// ponte')
    const casa = join(radice, 'casa'); mkdirSync(join(casa, '.ssh'), { recursive: true })
    mkdirSync(join(casa, '.aws')); mkdirSync(join(casa, '.gnupg'))
    writeFileSync(join(casa, '.ssh', 'id_ed25519'), 'CHIAVE-PRIVATA')
    writeFileSync(join(casa, '.ssh', 'id_ed25519.pub'), 'chiave-pubblica')
    writeFileSync(join(casa, '.aws', 'credentials'), 'AWS-SEGRETO')
    writeFileSync(join(casa, '.gnupg', 'pubring.kbx'), 'GPG-SEGRETO')
    t.after(() => rmSync(radice, { recursive: true, force: true }))
    // Sul Pad: l'area è /data/local/tmp/talos (la cartella di `node`), la cartella di lavoro è `workspace/` dentro di lei.
    const confini = { cartelleProtette: [radice], cartelleConsentite: [progetto], caseUtente: [casa] }
    return { radice, progetto, stato, casa, confini }
}

describe('P4-quater «+1 su Hermes» — area, credenziali, shell', () => {
    it('AREA-01 tutta l\'area di TALOS è chiusa in lettura e scrittura, tranne la cartella di lavoro', async (t) => {
        const { progetto, radice, confini } = area(t)
        writeFileSync(join(progetto, 'mio.txt'), 'mio')
        const { esito, domande } = await giro(progetto, [
            chiama('pid', 'leggi', { percorso: '../talos-exec.js' }),
            chiama('w', 'scrivi', { percorso: '../talos-exec.js', contenuto: 'sovrascritto' }),
            chiama('nuovo', 'scrivi', { percorso: '../nuovo-accanto.txt', contenuto: 'x' }),
            chiama('mio', 'leggi', { percorso: 'mio.txt' }),
        ], { ...confini, risposta: true })
        assert.match(esito('pid'), /^REFUSED\./)
        assert.match(esito('w'), /^REFUSED\./)
        assert.match(esito('nuovo'), /^REFUSED\./, 'anche ciò che ancora non esiste, dentro l\'area')
        assert.equal(readFileSync(join(radice, 'talos-exec.js'), 'utf8'), '// ponte')
        assert.equal(existsSync(join(radice, 'nuovo-accanto.txt')), false)
        assert.match(esito('mio'), /mio/)
        assert.equal(domande.length, 0, 'l\'area non si chiede: è un no')
    })

    it('AREA-04 una cartella di sessione scelta DENTRO l\'area (fuori dalle cartelle di lavoro) non riapre l\'area', async (t) => {
        const { radice, stato, progetto } = area(t)
        // «Full access» con una cartella libera = `state/`: la sessione parte lì, ma il gettone resta chiuso.
        const { esito } = await giro(stato, [
            chiama('r', 'leggi', { percorso: 'server-token' }),
            chiama('w', 'scrivi', { percorso: 'server-token', contenuto: 'sovrascritto' }),
        ], { cartelleProtette: [radice], cartelleConsentite: [progetto], risposta: true })
        assert.match(esito('r'), /^REFUSED\./); assert.doesNotMatch(esito('r'), /GETTONE-SEGRETO/)
        assert.match(esito('w'), /^REFUSED\./)
        assert.equal(readFileSync(join(stato, 'server-token'), 'utf8'), 'GETTONE-SEGRETO')
    })

    it('AREA-02 senza un elenco di cartelle consentite (banco), la cartella della sessione è consentita da sola', async (t) => {
        const { progetto, radice } = area(t)
        writeFileSync(join(progetto, 'qui.txt'), 'qui')
        const { esito } = await giro(progetto, [chiama('q', 'leggi', { percorso: 'qui.txt' })],
            { cartelleProtette: [radice] })
        assert.match(esito('q'), /qui/)
    })

    it('AREA-03 «cerca» non legge un file dell\'area raggiunto con un collegamento (niente oracolo sul gettone)', async (t) => {
        const { progetto, stato, confini } = area(t)
        try { symlinkSync(join(stato, 'server-token'), join(progetto, 'ponte.js'), 'file') }
        catch (errore) { t.skip(`collegamenti a file non permessi qui (${errore.code})`); return }
        writeFileSync(join(progetto, 'vero.js'), 'const GETTONE = 1')
        const { esito } = await giro(progetto, [chiama('c', 'cerca', { testo: 'GETTONE-SEGRETO' })], confini)
        assert.doesNotMatch(esito('c'), /ponte\.js/, 'il file protetto non combacia: non è stato letto')
    })

    it('CRED-01 chiavi e credenziali di casa non si scrivono, con nessun permesso (elenco di Hermes)', async (t) => {
        const { progetto, casa } = area(t)
        // senza l'area: la regola delle credenziali da sola
        const { esito, domande } = await giro(progetto, [
            chiama('k', 'scrivi', { percorso: '../casa/.ssh/authorized_keys', contenuto: 'ssh-ed25519 ATTACCO' }),
            chiama('a', 'scrivi', { percorso: '../casa/.aws/config', contenuto: 'x' }),
            chiama('n', 'scrivi', { percorso: '../casa/.netrc', contenuto: 'machine x' }),
        ], { caseUtente: [casa], risposta: true })
        for (const id of ['k', 'a', 'n']) assert.match(esito(id), /^REFUSED\./, id)
        assert.equal(existsSync(join(casa, '.ssh', 'authorized_keys')), false)
        assert.equal(existsSync(join(casa, '.netrc')), false)
        assert.equal(domande.length, 0)
    })

    it('CRED-02 i .env non si leggono da nessuna parte (.env.example sì), come Hermes; .netrc e .git-credentials neanche', async (t) => {
        const { progetto, confini } = area(t)
        mkdirSync(join(progetto, 'sotto'))
        writeFileSync(join(progetto, '.env'), 'OPENAI_API_KEY=segreto-env')
        writeFileSync(join(progetto, 'sotto', '.ENV.local'), 'segreto-locale')
        writeFileSync(join(progetto, '.env.example'), 'OPENAI_API_KEY=')
        writeFileSync(join(progetto, '.git-credentials'), 'https://u:segreto@host')
        const { esito } = await giro(progetto, [
            chiama('e', 'leggi', { percorso: '.env' }),
            chiama('l', 'leggi', { percorso: 'sotto/.ENV.local' }),
            chiama('x', 'leggi', { percorso: '.env.example' }),
            chiama('g', 'leggi', { percorso: '.git-credentials' }),
        ], { ...confini, risposta: true })
        assert.match(esito('e'), /^REFUSED\./); assert.doesNotMatch(esito('e'), /segreto-env/)
        assert.match(esito('l'), /^REFUSED\./)
        assert.match(esito('x'), /OPENAI_API_KEY=/)
        assert.match(esito('g'), /^REFUSED\./)
    })

    it('CRED-03 le chiavi private non si leggono (più di Hermes): id_* negata, .pub permessa', async (t) => {
        const { progetto, casa } = area(t)
        const { esito } = await giro(progetto, [
            chiama('p', 'leggi', { percorso: '../casa/.ssh/id_ed25519' }),
            chiama('pub', 'leggi', { percorso: '../casa/.ssh/id_ed25519.pub' }),
            chiama('aws', 'leggi', { percorso: '../casa/.aws/credentials' }),
            chiama('gpg', 'leggi', { percorso: '../casa/.gnupg/pubring.kbx' }),
        ], { caseUtente: [casa] })
        assert.match(esito('p'), /^REFUSED\./); assert.doesNotMatch(esito('p'), /CHIAVE-PRIVATA/)
        assert.match(esito('pub'), /chiave-pubblica/)
        assert.match(esito('aws'), /^REFUSED\./)
        assert.match(esito('gpg'), /^REFUSED\./)
    })

    it('CRED-04 ~/.ssh/config si scrive solo col sì, con qualunque livello; senza nessuno a cui chiedere è un no', async (t) => {
        const { progetto, casa } = area(t)
        const si = await giro(progetto, [chiama('c', 'scrivi', { percorso: '../casa/.ssh/config', contenuto: 'Host x' })],
            { caseUtente: [casa], risposta: true })
        assert.equal(si.domande.length, 1)
        assert.equal(readFileSync(join(casa, '.ssh', 'config'), 'utf8'), 'Host x')
        rmSync(join(casa, '.ssh', 'config'))
        const senza = await giro(progetto, [chiama('c', 'scrivi', { percorso: '../casa/.ssh/config', contenuto: 'Host y' })],
            { caseUtente: [casa] })
        assert.match(senza.esito('c'), /^REFUSED\./)
        assert.equal(existsSync(join(casa, '.ssh', 'config')), false)
    })

    it('NT-01 i percorsi dello spazio NT di Windows si rifiutano sul testo, prima di toccare il disco (Hermes :144-173)', async (t) => {
        const { progetto } = area(t)
        const { esito } = await giro(progetto, [
            chiama('u', 'leggi', { percorso: '\\\\?\\UNC\\attaccante.example\\share\\x' }),
            chiama('q', 'scrivi', { percorso: '\\??\\C:\\x.txt', contenuto: 'x' }),
            chiama('d', 'leggi', { percorso: '//./pipe/x' }),
        ], { risposta: true })
        for (const id of ['u', 'q', 'd']) assert.match(esito(id), /^REFUSED\..*namespace/s, id)
    })

    it('SHELL-01 la guardia rifiuta, senza domanda e con qualunque livello, i comandi che nominano l\'area o un segreto', async (t) => {
        const { progetto, radice, confini } = area(t)
        writeFileSync(join(progetto, '.env'), 'X=segreto')
        const comandi = {
            rel: 'cat ../state/server-token',
            win: 'type ..\\state\\server-token',
            ass: `cat ${join(radice, 'state', 'server-token')}`,
            nome: 'cd .. && cat state/server-token',
            su: 'ls ..',
            env: 'cat .env',
            ponte: 'cat ../talos-exec.js',
        }
        const { esito, domande } = await giro(progetto,
            Object.entries(comandi).map(([id, comando]) => chiama(id, 'shell', { comando })), { ...confini, risposta: true })
        for (const id of Object.keys(comandi)) {
            assert.match(esito(id), /^REFUSED\./, `${id}: ${comandi[id]}`)
            assert.doesNotMatch(esito(id), /GETTONE-SEGRETO|X=segreto/, id)
        }
        assert.equal(domande.length, 0)
    })

    it('SHELL-02 i comandi normali dentro la cartella passano', async (t) => {
        const { progetto, confini } = area(t)
        const { esito } = await giro(progetto, [
            chiama('e', 'shell', { comando: 'echo pronto' }),
            chiama('u', 'shell', { comando: 'node -e "console.log(1+1)"' }),
        ], confini)
        assert.match(esito('e'), /pronto/)
        assert.doesNotMatch(esito('u'), /REFUSED/)
    })

    it('ENV-01 l\'ambiente della shell perde chiavi, segreti e le cartelle del server; tiene ciò che serve per lavorare', () => {
        const pulito = ambienteShellPulito({
            PATH: '/bin', HOME: '/', LD_LIBRARY_PATH: '/data/local/tmp/talos', TMPDIR: '/t',
            TALOS_KERNEL_SUL_TELEFONO: '1',
            OPENROUTER_API_KEY: 'k1', OPENAI_API_KEY: 'k2', ANTHROPIC_API_KEY: 'k3', DEEPSEEK_API_KEY: 'k4', GEMINI_API_KEY: 'k5',
            GITHUB_TOKEN: 't', ANTHROPIC_TOKEN: 't2', MIO_SECRET: 's', DB_PASSWORD: 'p', openrouter_api_key: 'minuscolo',
            OLLAMA_ENDPOINT: 'http://127.0.0.1:11434',
            TALOS_HARNESS_UI_STATE_DIR: '/data/local/tmp/talos/state', TALOS_HARNESS_UI_PUBLIC_DIR: '/p', TALOS_BANCO_DIR: '/b',
        })
        assert.deepEqual(Object.keys(pulito).sort(),
            ['HOME', 'LD_LIBRARY_PATH', 'PATH', 'TALOS_KERNEL_SUL_TELEFONO', 'TMPDIR'])
    })

    /*
     * ⛔ Trovato sul Pad il 02/10 (P4-ter, primo compito vero di coding): «lancia i test con node» ⇒ `exit 127, node:
     * inaccessible or not found`. Il server gira su `/data/local/tmp/talos/node` e le sue librerie sono già in
     * LD_LIBRARY_PATH, ma la sua cartella non era nel PATH dei comandi. Owner 02/10 «Sì, come Hermes»
     * (`tools/environments/local.py:632-660` @ `4e7403130e`: i runtime gestiti vanno nel PATH della shell dell'agente).
     */
    it('ENV-03 la cartella del node che fa girare il server sta in testa al PATH dei comandi, una volta sola', () => {
        const cartellaNode = dirname(process.execPath)
        const pulito = ambienteShellPulito({ PATH: ['/usr/bin', '/bin'].join(delimiter) })
        assert.deepEqual(pulito.PATH.split(delimiter), [cartellaNode, '/usr/bin', '/bin'])
        const giaDentro = ambienteShellPulito({ PATH: ['/usr/bin', cartellaNode].join(delimiter) })
        assert.deepEqual(giaDentro.PATH.split(delimiter), ['/usr/bin', cartellaNode])
        assert.equal(ambienteShellPulito({}).PATH, cartellaNode)
    })

    /*
     * ⛔ Trovato sul Pad il 02/10: l'attrezzo «prova» falliva con `spawn /data/data/com.termux/files/usr/bin/sh ENOENT` —
     * lo stesso difetto curato il 3/9 in `eseguiInLoco` (il Node per Android cerca una shell Termux che non c'è), rimasto
     * in `eseguiProva` con `shell: true`. Nessuno spawn del kernel può più chiedere la shell «di sistema» di Node.
     */
    it('ENV-04 nessun comando del kernel parte con shell: true (la shell Termux che sul telefono non esiste)', () => {
        const sorgente = readFileSync(new URL('./talosHarness.mjs', import.meta.url), 'utf8')
        const chiamate = sorgente.match(/spawn\([^)]*\)/g) ?? []
        assert.ok(chiamate.length >= 2, 'spawn della shell e della prova trovati')
        for (const chiamata of chiamate) assert.doesNotMatch(chiamata, /shell:\s*true/, chiamata)
    })

    it('ENV-02 sul telefono la shell vera parte senza le chiavi del server', async (t) => {
        const { progetto } = area(t)
        const prima = { chiave: process.env.OPENROUTER_API_KEY, telefono: process.env.TALOS_KERNEL_SUL_TELEFONO }
        process.env.OPENROUTER_API_KEY = 'chiave-finta-di-prova'
        process.env.TALOS_KERNEL_SUL_TELEFONO = '1'
        t.after(() => {
            if (prima.chiave === undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY = prima.chiave
            if (prima.telefono === undefined) delete process.env.TALOS_KERNEL_SUL_TELEFONO; else process.env.TALOS_KERNEL_SUL_TELEFONO = prima.telefono
        })
        const { esito } = await giro(progetto, [
            chiama('s', 'shell', { comando: 'node -e "process.stdout.write(String(process.env.OPENROUTER_API_KEY))"' }),
        ])
        assert.doesNotMatch(esito('s'), /chiave-finta-di-prova/)
        assert.match(esito('s'), /undefined/)
    })
})
