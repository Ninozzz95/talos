/*
 * ⛔⛔ Ticket C-005 del banco (01/10/2026), lato kernel. Due difetti, una patch per il desktop.
 *
 * 1. FALSO POSITIVO. `pezziDelComando` spezza anche su `(`: in `python - <<'PY' … s.key() … PY` il pezzo `s.key` ha
 *    l'estensione `.key` e diventava un SEGRETO, e la prova del banco (000-count-nuclei) finiva lì. Un pezzo seguito SUBITO da
 *    `(` è una chiamata, non un nome di file. `open("x.key")` resta un segreto: dopo `x.key` viene la virgoletta.
 *
 * 2. IL MOTIVO DEL «NO» NON ARRIVAVA AL MODELLO. `rispondiApprovazione` risolveva solo un booleano e il modello leggeva
 *    sempre «l'owner non ha approvato questa azione.» — anche quando nessuno era stato interpellato (la CLI in modalità non
 *    interattiva risponde da sola, e sa perché). Ora un quarto argomento facoltativo `motivo` viaggia fino a
 *    `verificaPermessoScrittura`, che lo restituisce come motivo. Additivo: senza motivo tutto resta com'era.
 *    ⛔ E la risposta si legge FAIL-CLOSED: approva solo `true`. Un valore «vero» che non è `true` (l'oggetto col motivo,
 *    una stringa) è un no — prima `if (!approvato)` avrebbe letto l'oggetto come un SÌ.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { motivoDaChiedere } from '../src/path-policy.mjs'
import { verificaPermessoScrittura } from '../src/kernel/talosHarness.mjs'
import { createSessionRegistry } from '../src/session-registry.mjs'

const CARTELLA = process.platform === 'win32' ? 'C:\\lavoro\\progetto' : '/lavoro/progetto'
const HOME = process.platform === 'win32' ? 'C:\\Users\\prova' : '/home/prova'
const chiede = (comando) => motivoDaChiedere({ tipo: 'shell', comando, cartella: CARTELLA, home: HOME })

test('C005-CHIAMATA-NON-FILE: un metodo chiamato non è un file segreto', () => {
    assert.equal(chiede("python - <<'PY'\nimport json\nfor s in righe: print(s.key())\nPY\ncat /tmp/cp_keys.txt"), null)
    assert.equal(chiede('node -e "console.log(cert.pem())"'), null)
    assert.equal(chiede('python -c "x = conf.env(); print(x)"'), null)
})

test('C005-CHIAMATA-NON-FILE al contrario: un file segreto nominato resta un segreto, anche dentro una chiamata', () => {
    for (const comando of ['cat server.key', "python -c \"open('server.key').read()\"", 'node -e "fs.readFileSync(`id_rsa`)"', 'cat .env', 'cat ~/.ssh/id_rsa']) {
        assert.equal(chiede(comando)?.classe, 'segreto', comando)
    }
})

const azione = { tipo: 'scrivi', percorso: 'a.txt' }
const chiedi = (risposta) => verificaPermessoScrittura(azione, { livelloAccesso: 'su-richiesta', chiediApprovazioneFn: async () => risposta, cartella: CARTELLA })

test('C005-MOTIVO-AL-MODELLO: un no col motivo restituisce quel motivo', async () => {
    const esito = await chiedi({ approvato: false, motivo: 'TALOS did not run this: no one can approve it in this non-interactive run.' })
    assert.equal(esito.consentito, false)
    assert.equal(esito.motivo, 'TALOS did not run this: no one can approve it in this non-interactive run.')
})

test('C005-SOLO-TRUE-APPROVA: ogni risposta che non è true è un no, col motivo di sempre', async () => {
    assert.equal((await chiedi(true)).consentito, true)
    for (const risposta of [false, undefined, null, 'si', 1, { approvato: true }, { approvato: true, motivo: 'not a no' }, { approvato: false }, { approvato: false, motivo: '   ' }]) {
        const esito = await chiedi(risposta)
        assert.equal(esito.consentito, false, JSON.stringify(risposta))
        assert.equal(esito.motivo, 'the owner did not approve this action.', JSON.stringify(risposta))
    }
})

function sessioneConApprovazione() {
    let catturata
    return {
        avviaSessioneFn: async (input) => {
            catturata = input.chiediApprovazioneFn
            input.onEvento({ type: 'RunStarted', threadId: 't1', runId: 'r1' })
            return new Promise(() => {})
        },
        get chiediApprovazioneFn() { return catturata },
    }
}
const preparaEsecuzioneFinta = (taskId) => ({ cartella: '/tmp/x', comandoProva: 'npm test', task: { id: taskId, consegna: 'c' } })

test('C005-MOTIVO-DAL-REGISTRO: rispondiApprovazione(…, false, motivo) consegna il motivo al kernel; senza motivo resta false', async () => {
    for (const [motivo, atteso] of [['Denied: not interactive.', { approvato: false, motivo: 'Denied: not interactive.' }], [undefined, false], ['   ', false]]) {
        const finta = sessioneConApprovazione()
        const registro = createSessionRegistry({ avviaSessioneFn: finta.avviaSessioneFn, preparaEsecuzioneFn: preparaEsecuzioneFinta, modello: 'm', chiave: 'k', cartellaEsisteFn: () => true })
        const { sessionId } = registro.avvia('task-vero', { permessiScelto: 'On request' })
        const ricevuti = []
        registro.iscriviti(sessionId, (e) => ricevuti.push(e))
        const promessa = finta.chiediApprovazioneFn({ tipo: 'shell', comando: 'npm test' })
        await Promise.resolve()
        const richiesta = ricevuti.find((e) => e.type === 'ApprovalRequested')
        assert.deepEqual(registro.rispondiApprovazione(sessionId, richiesta.requestId, false, motivo), { ok: true })
        assert.deepEqual(await promessa, atteso, String(motivo))
        assert.equal(ricevuti.find((e) => e.type === 'ApprovalResolved').approvato, false)
    }
})

test('C005-MOTIVO-DAL-REGISTRO: un sì resta true anche se arriva un motivo', async () => {
    const finta = sessioneConApprovazione()
    const registro = createSessionRegistry({ avviaSessioneFn: finta.avviaSessioneFn, preparaEsecuzioneFn: preparaEsecuzioneFinta, modello: 'm', chiave: 'k', cartellaEsisteFn: () => true })
    const { sessionId } = registro.avvia('task-vero', { permessiScelto: 'On request' })
    const ricevuti = []
    registro.iscriviti(sessionId, (e) => ricevuti.push(e))
    const promessa = finta.chiediApprovazioneFn({ tipo: 'shell', comando: 'npm test' })
    await Promise.resolve()
    const richiesta = ricevuti.find((e) => e.type === 'ApprovalRequested')
    registro.rispondiApprovazione(sessionId, richiesta.requestId, true, 'ignorato')
    assert.equal(await promessa, true)
})

/* La conferma di root in WSL (F009) legge la stessa risposta: un no col motivo, o un valore vero che non è `true`, non esegue
   NIENTE. Impalcatura presa da tests/rev-f009-utente-wsl.test.mjs del desktop (integra 850452c9d). */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { talosLavora } from '../src/kernel/talosHarness.mjs'
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs'

function fornitore(chiamate) {
    let n = 0
    return async () => {
        const c = chiamate[n]
        n++
        const message = c
            ? { role: 'assistant', content: null, tool_calls: [{ id: `c${n}`, type: 'function', function: { name: c[0], arguments: JSON.stringify(c[1]) } }] }
            : { role: 'assistant', content: 'fatto' }
        return new Response(JSON.stringify({ choices: [{ message, finish_reason: c ? 'tool_calls' : 'stop' }] }), { headers: { 'Content-Type': 'application/json' } })
    }
}
async function giroComeRoot(t, risposta) {
    const cartella = mkdtempSync(join(tmpdir(), 'talos-c005-root-'))
    t.after(() => rimuoviCartellaDiProva(cartella))
    const eseguiti = [], esiti = []
    await talosLavora({
        cartella, task: { consegna: 'lavora' }, modello: 'f', chiave: 'k', giriMassimi: 4,
        /* A3-R1 (desktop 07/10/2026): con «Accesso pieno» la conferma di root NON si chiede più; il livello resta ASSENTE (come «Scrive nel
           progetto» e shell «Sempre») perché la domanda parta e si veda come legge la risposta. */
        fetchDiRete: fornitore([['shell', { comando: 'echo ciao' }]]),
        onGiro: (e) => { if (e.tipo === 'tool-esito') esiti.push(String(e.content)) },
        chiediApprovazioneFn: async () => risposta,
        eseguiComandoSandboxatoFn: async (comando) => { eseguiti.push(comando); return { codice: 0, testo: 'ciao', enforcement: 'wsl2', wsl: { utente: 'root', root: true, disco: { montaggio: '/mnt/c', metadata: false } } } },
        consensiSessione: {},
        rootWslDelComandoFn: async () => ({ distro: 'Ubuntu', utente: 'root' }),
    })
    return { eseguiti, esiti }
}

test('C005-SOLO-TRUE-APPROVA anche per root in WSL: un no col motivo o un «si» non eseguono niente', async (t) => {
    for (const risposta of [{ approvato: false, motivo: 'Denied: not interactive.' }, 'si', { approvato: true }]) {
        const { eseguiti, esiti } = await giroComeRoot(t, risposta)
        assert.equal(eseguiti.length, 0, JSON.stringify(risposta))
        assert.match(esiti[0], /did not confirm it/u)
    }
    assert.equal((await giroComeRoot(t, true)).eseguiti.length, 1, 'un sì vero esegue')
})

/*
 * Revisione avversariale 07/10/2026 (R-5): l'esenzione «seguito SUBITO da (» scambiava per una chiamata anche la sostituzione di
 * comando incollata a una parola: `cat ~/.ssh/id_rsa$(true)` apre `~/.ssh/id_rsa` e non veniva fermato. Un pezzo che finisce con `$`
 * e poi `(` è una sostituzione, non un metodo.
 */
test('C005-SOSTITUZIONE-NON-E-UNA-CHIAMATA: nome$(…) legge ancora il segreto, una chiamata vera resta esente', () => {
    for (const comando of ['cat ~/.ssh/id_rsa$(true)', 'cat ~/.ssh/id_rsa$(echo)', 'cat .env$(true)', 'cat ~/.aws/credentials$(:)']) {
        assert.notEqual(chiede(comando), null, `${comando} deve chiedere`)
    }
    assert.equal(chiede('python -c "print(s.key())"'), null, 'una chiamata vera resta esente')
    assert.equal(chiede('node -e "console.log(cert.pem())"'), null)
})

/*
 * Revisione del bugfixer del desktop (08/10/2026, provata su un bash vero): l'esenzione «seguito SUBITO da (» lasciava passare gli extglob
 * vuoti `*() ?() @() +() !()`, che in bash con `shopt -s extglob` ESPANDONO NEL FILE STESSO: `cat ~/.ssh/id_rsa*()` stampava il segreto
 * senza chiedere. Una chiamata vera ha una lettera, una cifra o `_` subito prima di `(`.
 */
test('C005-EXTGLOB: i cinque extglob vuoti dopo il nome di un segreto FERMANO, anche dopo uno shopt; le chiamate vere restano esenti', () => {
    for (const forma of ['*()', '?()', '@()', '+()', '!()']) {
        assert.notEqual(chiede(`cat ~/.ssh/id_rsa${forma}`), null, `cat ~/.ssh/id_rsa${forma} deve chiedere`)
        assert.notEqual(chiede(`shopt -s extglob\ncat ~/.ssh/id_rsa${forma}`), null, `dopo shopt: ~/.ssh/id_rsa${forma} deve chiedere`)
    }
    // Preesistente al C-005: il glob dopo `.env` non si riconosceva; ora il pezzo si controlla senza il carattere di pattern.
    for (const comando of ['cat .env*()', 'cat .env@()', 'cat ~/.aws/credentials+()']) assert.notEqual(chiede(comando), null, `${comando} deve chiedere`)
    // AL CONTRARIO: una chiamata vera (lettera, cifra o `_` prima della parentesi) non chiede, e la sostituzione di comando incollata sì.
    for (const comando of ['python -c "print(s.key())"', 'node -e "console.log(cert.pem())"', 'ruby -e "s.key2()"', 'python -c "obj.key_()"', 'python -c "k = id_ed25519()"', 'f(x); s.key()']) {
        assert.equal(chiede(comando), null, `${comando} è una chiamata, non un file`)
    }
    assert.notEqual(chiede('cat ~/.ssh/id_rsa$(true)'), null)
})
