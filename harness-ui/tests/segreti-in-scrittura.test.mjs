/*
 * ⛔ Owner 16/10/2026 sera — I SEGRETI IN SCRITTURA («Chiedi, ma non in Full access»), dopo la ricerca sui concorrenti:
 *   · scrivere o modificare un segreto del progetto (`.env`, una chiave, `secrets.json`…) chiede come leggerlo, anche con «sempre» per
 *     attrezzo — tranne in Full access (regola del 12/10, «per legge»);
 *   · le credenziali della casa (`~/.ssh` tranne `config`, `.aws`, `.gnupg`, `.kube`, `.docker`, `.azure`, `.config/gh`,
 *     `.config/gcloud`, `.netrc`, `.pgpass`, `.npmrc`, `.pypirc`, `.git-credentials`) non si scrivono MAI, come Hermes
 *     (`agent/file_safety.py:176-219`): nessuna domanda, nemmeno in Full access, e il modello sa perché;
 *   · nessuno davanti ⇒ rifiuto col motivo;
 *   · owner 16/10 notte («No, separati»): il sì «per la sessione» dato per LEGGERE un segreto non vale per SCRIVERLO.
 * Ogni caso ha il suo verso contrario.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { talosLavora, verificaPermessoScrittura } from '../src/kernel/talosHarness.mjs'
import { createSessionRegistry } from '../src/session-registry.mjs'
import { attendiScritture } from '../src/session-store.mjs'
import { togliConfiniDati } from '../src/kernel/confine-dati.mjs'
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

function cartellaDiProva(t) {
    const cartella = mkdtempSync(join(tmpdir(), 'talos-segreti-scrittura-'))
    t.after(() => rimuoviCartellaDiProva(cartella))
    return cartella
}

async function giro(t, { chiamate, livelloAccesso = 'scrittura-progetto', risposta = true, senzaCanale = false, permessiPerAttrezzo, consensiSessione = {}, cartella = cartellaDiProva(t) } = {}) {
    const chieste = []
    const esiti = []
    await talosLavora({
        cartella, task: { consegna: 'lavora' }, modello: 'f', chiave: 'k', giriMassimi: 4, livelloAccesso,
        fetchDiRete: fornitore(chiamate),
        onGiro: (e) => { if (e.tipo === 'tool-esito') esiti.push(togliConfiniDati(String(e.content))) },
        ...(senzaCanale ? {} : { chiediApprovazioneFn: async (a) => { chieste.push(a); return risposta } }),
        ...(permessiPerAttrezzo ? { permessiPerAttrezzo } : {}),
        consensiSessione,
    })
    return { chieste, esiti, cartella }
}

/*
 * ⛔ Una CASA FINTA per tutto il file: se la regola si rompe (o un mutante la toglie), la scrittura deve finire in una cartella di
 *   prova, mai nel `~/.ssh/authorized_keys` vero della macchina. `homedir()` legge USERPROFILE su Windows e HOME altrove.
 */
const CASA_FINTA = mkdtempSync(join(tmpdir(), 'talos-casa-finta-'))
const casaVera = { USERPROFILE: process.env.USERPROFILE, HOME: process.env.HOME }
process.env.USERPROFILE = CASA_FINTA
process.env.HOME = CASA_FINTA
test.after(() => {
    for (const [k, v] of Object.entries(casaVera)) { if (v === undefined) delete process.env[k]; else process.env[k] = v }
    rimuoviCartellaDiProva(CASA_FINTA)
})
assert.equal(homedir(), CASA_FINTA, 'premessa: la casa è quella finta')
const CREDENZIALE = join(homedir(), '.ssh', 'authorized_keys')

test('SEGRETI-SCRITTURA-01: writing .env asks with the write sentence, also with «always»; on yes it is written', async (t) => {
    for (const permessiPerAttrezzo of [undefined, { scrivi: 'sempre' }]) {
        const { chieste, cartella } = await giro(t, { chiamate: [['scrivi', { percorso: '.env', contenuto: 'TOKEN=prova' }]], permessiPerAttrezzo })
        assert.equal(chieste.length, 1, `one card (${JSON.stringify(permessiPerAttrezzo)})`)
        assert.equal(chieste[0].segreto?.classe, 'segreto')
        assert.equal(chieste[0].segreto?.fraseChiave, 'server.approval.write.secret')
        assert.match(chieste[0].segreto.frase, /^This write changes a file that may contain keys or passwords \(\.env\)/u)
        assert.equal(readFileSync(join(cartella, '.env'), 'utf8'), 'TOKEN=prova', 'yes ⇒ written')
    }
})

test('SEGRETI-SCRITTURA-02: AL CONTRARIO — a plain project file writes with no card, and Full access writes .env with no card', async (t) => {
    const semplice = await giro(t, { chiamate: [['scrivi', { percorso: 'note.txt', contenuto: 'ciao' }]] })
    assert.equal(semplice.chieste.length, 0)
    assert.equal(readFileSync(join(semplice.cartella, 'note.txt'), 'utf8'), 'ciao')
    const pieno = await giro(t, { livelloAccesso: 'accesso-pieno', chiamate: [['scrivi', { percorso: '.env', contenuto: 'TOKEN=pieno' }]] })
    assert.equal(pieno.chieste.length, 0, 'Full access never asks (owner 12/10)')
    assert.equal(readFileSync(join(pieno.cartella, '.env'), 'utf8'), 'TOKEN=pieno')
})

test('SEGRETI-SCRITTURA-03: a no leaves .env untouched; nobody in front ⇒ refused with the reason', async (t) => {
    const no = await giro(t, { chiamate: [['scrivi', { percorso: '.env', contenuto: 'X=1' }]], risposta: false })
    assert.equal(no.chieste.length, 1)
    assert.equal(existsSync(join(no.cartella, '.env')), false)
    const nessuno = await giro(t, { chiamate: [['scrivi', { percorso: '.env', contenuto: 'X=1' }]], senzaCanale: true })
    assert.equal(existsSync(join(nessuno.cartella, '.env')), false)
    assert.ok(nessuno.esiti.some((e) => /reserved files \(keys, credentials, keychains\)/u.test(e) && /no active approval channel/u.test(e)), nessuno.esiti.join('\n'))
})

test('SEGRETI-SCRITTURA-04: file_edit on .env asks too; AL CONTRARIO on a plain file it does not', async (t) => {
    const cartella = cartellaDiProva(t)
    writeFileSync(join(cartella, '.env'), 'A=1\n')
    writeFileSync(join(cartella, 'note.txt'), 'A=1\n')
    for (const [percorso, attese] of [['.env', 1], ['note.txt', 0]]) {
        const esito = await verificaPermessoScrittura({ tipo: 'file_edit', percorso }, {
            livelloAccesso: 'scrittura-progetto', cartella, chiediApprovazioneFn: async () => true,
        })
        assert.equal(esito.consentito, true, percorso)
        assert.equal(esito.via === 'segreto-forza-conferma' ? 1 : 0, attese, `${percorso}: ${esito.via}`)
    }
})

test('SEGRETI-SCRITTURA-05: a home credential is NEVER written — no card, even in Full access and with «always»; the model is told why', async (t) => {
    for (const [livelloAccesso, permessiPerAttrezzo] of [['accesso-pieno', undefined], ['scrittura-progetto', { scrivi: 'sempre' }]]) {
        const { chieste, esiti } = await giro(t, { livelloAccesso, permessiPerAttrezzo, chiamate: [['scrivi', { percorso: CREDENZIALE, contenuto: 'ssh-ed25519 AAAA prova' }]] })
        assert.equal(chieste.length, 0, `${livelloAccesso}: no question is ever asked`)
        assert.ok(esiti.some((e) => /^REFUSED\. Nothing was written: .*login credential of this computer/su.test(e)), esiti.join('\n'))
    }
    /* file_edit su una credenziale che ESISTE: rifiutata prima di aprirla, e il file resta com'era */
    const aws = join(homedir(), '.aws', 'credentials')
    mkdirSync(join(homedir(), '.aws'), { recursive: true })
    const PRIMA = '[default]\nkey=VECCHIA\n'
    writeFileSync(aws, PRIMA)
    const modifica = await giro(t, { livelloAccesso: 'accesso-pieno', chiamate: [['file_edit', { percorso: aws, old_string: 'VECCHIA', new_string: 'NUOVA' }]] })
    assert.equal(modifica.chieste.length, 0)
    assert.ok(modifica.esiti.some((e) => /^REFUSED\. Nothing was changed: .*login credential of this computer/su.test(e)), modifica.esiti.join('\n'))
    assert.equal(readFileSync(aws, 'utf8'), PRIMA)
    for (const [tipo, percorso] of [['scrivi', join(homedir(), '.netrc')], ['file_edit', join(homedir(), '.aws', 'credentials')], ['scrivi', join(homedir(), '.config', 'gh', 'hosts.yml')]]) {
        const esito = await verificaPermessoScrittura({ tipo, percorso }, { livelloAccesso: 'accesso-pieno', cartella: tmpdir(), chiediApprovazioneFn: async () => true })
        assert.equal(esito.consentito, false, percorso)
        assert.equal(esito.via, 'credenziale-della-casa', percorso)
    }
})

test('SEGRETI-SCRITTURA-06: AL CONTRARIO — ~/.ssh/config asks instead (not in Full access), and a public file in the home is untouched by the rule', async (t) => {
    const config = join(homedir(), '.ssh', 'config')
    const chieste = []
    const chiede = await verificaPermessoScrittura({ tipo: 'scrivi', percorso: config }, { livelloAccesso: 'accesso-pieno', cartella: tmpdir(), chiediApprovazioneFn: async (a) => { chieste.push(a); return true } })
    assert.equal(chiede.consentito, true)
    assert.equal(chieste.length, 0, 'Full access: no card for ~/.ssh/config')
    const conCarta = await verificaPermessoScrittura({ tipo: 'scrivi', percorso: config }, { livelloAccesso: 'su-richiesta', cartella: tmpdir(), chiediApprovazioneFn: async (a) => { chieste.push(a); return true } })
    assert.equal(conCarta.via, 'segreto-forza-conferma')
    assert.equal(chieste.length, 1)
    const pubblico = await verificaPermessoScrittura({ tipo: 'scrivi', percorso: join(homedir(), '.config', 'altro.yml') }, { livelloAccesso: 'accesso-pieno', cartella: tmpdir() })
    assert.equal(pubblico.consentito, true)
})

test('SEGRETI-SCRITTURA-07: the «for this session» yes for READING .env does not cover WRITING it, and the write yes does not cover reading', async (t) => {
    const cartella = cartellaDiProva(t)
    const permesso = (azione, segretiConsentiti) => {
        const chieste = []
        return verificaPermessoScrittura(azione, { livelloAccesso: 'scrittura-progetto', cartella, consensiSessione: { segretiConsentiti }, chiediApprovazioneFn: async (a) => { chieste.push(a); return true } })
            .then((esito) => ({ esito, chieste }))
    }
    const scritturaDopoLettura = await permesso({ tipo: 'scrivi', percorso: '.env' }, ['.env'])
    assert.equal(scritturaDopoLettura.chieste.length, 1, 'the read yes does not open the write')
    assert.equal(scritturaDopoLettura.chieste[0].segreto.chiaveDelConsenso, 'scrittura:.env', 'the registry saves this key on «for this session»')
    const scritturaConsentita = await permesso({ tipo: 'scrivi', percorso: '.env' }, ['scrittura:.env'])
    assert.equal(scritturaConsentita.chieste.length, 0, 'the write yes covers the next write')
    const letturaDopoScrittura = await permesso({ tipo: 'leggi', percorso: '.env' }, ['scrittura:.env'])
    assert.equal(letturaDopoScrittura.chieste.length, 1, 'the write yes does not open the read')
    const letturaConsentita = await permesso({ tipo: 'leggi', percorso: '.env' }, ['.env'])
    assert.equal(letturaConsentita.chieste.length, 0, 'the read yes keeps its old meaning')
})

test('SEGRETI-SCRITTURA-08: the registry saves the write key on «for this session»; AL CONTRARIO a read keeps saving the bare path', async (t) => {
    const cartellaStore = mkdtempSync(join(tmpdir(), 'talos-segreti-registro-'))
    const runs = []
    const registry = createSessionRegistry({
        cartellaStore, modello: 'm', chiave: 'k', cartellaEsisteFn: () => true,
        preparaEsecuzioneFn: () => ({ cartella: cartellaStore, comandoProva: 'npm test', task: { id: 'task', consegna: 'lavora' } }),
        avviaSessioneFn(input) {
            let fine
            const promessa = new Promise((r) => { fine = r })
            runs.push({ input, fine })
            input.onEvento({ type: 'RunStarted', threadId: 't1', runId: 'r1' })
            return promessa
        },
    })
    t.after(async () => {
        /* il giro finto si chiude come in c2-r6: senza, il registro resta vivo e il processo della prova non esce */
        for (const { input: i, fine } of runs) {
            i.onEvento({ type: 'RunFinished', threadId: 't1', runId: 'r1' })
            fine({ ok: true, esito: { detto: 'ok', comeFinita: 'concluso', messaggiFinali: [{ role: 'user', content: 'x' }, { role: 'assistant', content: 'ok' }] } })
        }
        await registry.chiudi?.({ attesaMassimaMs: 1_000 })
        try { await attendiScritture({ cartellaStore }) } catch { /* pulizia comunque */ }
        rimuoviCartellaDiProva(cartellaStore)
    })
    const { sessionId } = registry.avvia('task', { permessiScelto: 'Workspace write', modalitaOperativaScelta: 'normale' })
    const { input } = runs[0]
    const siPerLaSessione = async (azione) => {
        const domanda = input.chiediApprovazioneFn(azione)
        await new Promise((r) => setTimeout(r, 10))
        const requestId = registry.domandaInAttesa(sessionId)?.requestId
        assert.ok(requestId, 'premessa: una domanda aperta')
        assert.deepEqual(registry.rispondiApprovazione(sessionId, requestId, true, { ambito: 'percorso' }), { ok: true })
        await domanda
    }
    await siPerLaSessione({ tipo: 'scrivi', percorso: '.env', segreto: { classe: 'segreto', percorso: '.env', chiaveDelConsenso: 'scrittura:.env' } })
    assert.deepEqual([...input.consensiSessione.segretiConsentiti], ['scrittura:.env'], 'the write yes is saved under its own key')
    await siPerLaSessione({ tipo: 'leggi', percorso: 'id_rsa', segreto: { classe: 'segreto', percorso: 'id_rsa' } })
    assert.deepEqual([...input.consensiSessione.segretiConsentiti], ['scrittura:.env', 'id_rsa'], 'a read keeps the bare path')
})
