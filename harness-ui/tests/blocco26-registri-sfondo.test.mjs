/*
 * ⛔⛔ Blocco 26 (rilievo R6 del Tester, forma chiusa il 01/11/2026 con l'OK di CLI, Mobile e Performance) — i registri dei comandi
 *   in sottofondo FUORI dal progetto (PO-26). Con l'opzione `cartellaSfondo` il registro va in `<dati del progetto>/background/<id>.log`
 *   e nel progetto non nasce niente; senza, tutto resta com'era (`.talos/processi-sfondo/`, la CLI la passerà lei).
 *   - `leggi` rilegge il registro senza chiedere, col percorso pieno o con `background/<id>.log`, SOLO per i registri di questa sessione
 *     (un insieme esatto, normalizzato col percorso reale — condizioni di Performance);
 *   - un altro file della cartella dati, un collegamento dentro `background/`, il registro di un'altra sessione: si chiede come prima;
 *   - il percorso assoluto non esce dal PC verso il ponte (condizione del Mobile): esito, riga dei Processi ed eventi portano
 *     `background/<id>.log`.
 *   Ogni prova ha il suo verso contrario.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, linkSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { talosLavora, eseguiComandoSandboxato, INTESTAZIONE_SFONDO, testoSfondoPerGliEventi, identitaRegistroDiSfondo, stessoRegistroDiSfondo } from '../src/kernel/talosHarness.mjs'
import { togliConfiniDati } from '../src/kernel/confine-dati.mjs'
import { avviaSessione, eseguiComandoDiretto } from '../src/agent-service.mjs'
import { processiDaEventi, registriSfondoDaEventi } from '../src/session-registry.mjs'
import { iscriviConRigiocata } from '../src/iscrizione-sessione.mjs'
import { creaOperazioni } from '../src/remoto/operazioni.mjs'
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs'

/* ⛔ La cartella canonica (PR pubblica #45: sul runner la Temp è un nome corto 8.3 che `realpath` espande). */
function cartella(t, nome = 'talos-b26-') {
    const c = realpathSync.native(mkdtempSync(join(tmpdir(), nome)))
    t.after(() => rimuoviCartellaDiProva(c))
    return c
}
function scena(t) {
    const radice = cartella(t)
    const progetto = join(radice, 'progetto')
    const dati = join(radice, 'dati-app', '.workspaces', 'progetto-0123456789')
    mkdirSync(progetto)
    mkdirSync(dati, { recursive: true })
    return { radice, progetto, dati }
}

/* Un fornitore che fa UNA chiamata per richiesta (o più, se `prossima` dà un elenco di chiamate); `prossima(n, esiti)` la decide
   guardando gli esiti già arrivati. Gli id: `c<n>`, e `c<n>-<i>` per la i-esima di un elenco. */
function fornitore(prossima, esiti, alModello = []) {
    let n = 0
    return async (_url, init) => {
        /* ciò che il MODELLO riceve davvero: i messaggi `tool` della richiesta (il testo per il modello, prima degli eventi) */
        try {
            for (const m of JSON.parse(init?.body ?? '{}').messages ?? []) {
                if (m?.role === 'tool' && !alModello.some((x) => x.id === m.tool_call_id)) alModello.push({ id: m.tool_call_id, testo: togliConfiniDati(String(m.content)) })
            }
        } catch { /* corpo non JSON */ }
        const c = prossima(n, esiti)
        n++
        const elenco = c && Array.isArray(c[0]) ? c : (c ? [c] : null)
        const message = elenco
            ? { role: 'assistant', content: null, tool_calls: elenco.map((x, i) => ({ id: elenco.length > 1 ? `c${n}-${i}` : `c${n}`, type: 'function', function: { name: x[0], arguments: JSON.stringify(x[1]) } })) }
            : { role: 'assistant', content: 'fatto' }
        return new Response(JSON.stringify({ choices: [{ message, finish_reason: c ? 'tool_calls' : 'stop' }] }), { headers: { 'Content-Type': 'application/json' } })
    }
}

/* L'esecutore finto: fa ciò che fa il gestore vero quando sfonda (scrive il registro dove gli si dice, risponde subito). */
const USCITA = 'USCITA-DEL-REGISTRO-0042'
function esecutoreCheSfonda(visti) {
    return async (comando, _cartella, { fileSfondo } = {}) => {
        visti.push(fileSfondo)
        const percorso = typeof fileSfondo === 'string' ? fileSfondo : fileSfondo?.percorso
        const mostrato = fileSfondo && typeof fileSfondo === 'object' ? fileSfondo.mostrato : null
        if (percorso) { mkdirSync(dirname(percorso), { recursive: true }); writeFileSync(percorso, `${USCITA}\n`) }
        return {
            codice: null, messoInSfondo: true, daSfondo: 'avvio',
            ...(percorso ? { fileSfondo: percorso } : {}), ...(mostrato ? { fileSfondoMostrato: mostrato } : {}),
            /* la riga del gestore vero (ritocco D1): il percorso pieno, e accanto il nome corto */
            testo: `${INTESTAZIONE_SFONDO}: started in the background on request.\nOutput file: ${percorso}${mostrato ? ` (${mostrato})` : ''}`, parziale: '',
        }
    }
}

async function giro({ progetto, dati, prossima, registriSfondoFn, eseguiComandoSandboxatoFn, livelloAccesso }) {
    const esiti = []
    const chieste = []
    const eventi = []
    const alModello = []
    await talosLavora({
        cartella: progetto, task: { consegna: 'lavora' }, modello: 'f', chiave: 'k', giriMassimi: 8,
        fetchDiRete: fornitore(prossima, esiti, alModello),
        onGiro: (e) => { if (e.tipo === 'tool-esito') { esiti.push(togliConfiniDati(String(e.content))); eventi.push(e) } },
        chiediApprovazioneFn: async (a) => { chieste.push(a); return a?.tipo === 'shell' },
        ...(livelloAccesso ? { livelloAccesso } : {}),
        ...(eseguiComandoSandboxatoFn ? { eseguiComandoSandboxatoFn } : {}),
        ...(dati === undefined ? {} : { cartellaSfondo: dati }),
        ...(registriSfondoFn ? { registriSfondoFn } : {}),
    })
    return { esiti, chieste: chieste.filter((a) => a?.tipo !== 'shell'), eventi, alModello }
}
const sfondaPoi = (...dopo) => (n, e) => (n === 0 ? ['shell', { comando: 'npm run dev', background: true }] : dopo[n - 1]?.(e) ?? null)

test('RS-01 con l opzione il nucleo chiede il registro nella cartella dati, col nome da mostrare; nel progetto non nasce niente', async (t) => {
    const { progetto, dati } = scena(t)
    const visti = []
    const { esiti, eventi, alModello } = await giro({ progetto, dati, prossima: sfondaPoi(), eseguiComandoSandboxatoFn: esecutoreCheSfonda(visti) })
    assert.deepEqual(visti, [{ percorso: join(dati, 'background', 'c1.log'), mostrato: 'background/c1.log' }])
    assert.deepEqual(readdirSync(progetto), [], 'niente .talos/processi-sfondo nel progetto')
    assert.equal(readFileSync(join(dati, 'background', 'c1.log'), 'utf8'), `${USCITA}\n`)
    assert.equal(eventi[0].fileSfondo, join(dati, 'background', 'c1.log'), 'il PC tiene il percorso vero')
    assert.equal(eventi[0].fileSfondoMostrato, 'background/c1.log')
    /* ritocco D1: il MODELLO legge il percorso pieno (shell: tail, cat) col nome corto accanto; l EVENTO solo il nome corto */
    const alModelloC1 = alModello.find((m) => m.id === 'c1')?.testo ?? ''
    assert.ok(alModelloC1.includes(`Output file: ${join(dati, 'background', 'c1.log')} (background/c1.log)`), alModelloC1)
    assert.match(esiti[0], /Output file: background\/c1\.log$/mu)
    assert.ok(!esiti[0].includes(dati), 'l evento non porta il percorso assoluto')
})

test('RS-02 al contrario: senza l opzione il registro resta in .talos/processi-sfondo del progetto, come oggi (caratterizzazione)', async (t) => {
    const { progetto } = scena(t)
    const visti = []
    const { eventi } = await giro({ progetto, dati: undefined, prossima: sfondaPoi(), eseguiComandoSandboxatoFn: esecutoreCheSfonda(visti) })
    assert.deepEqual(visti, [join(progetto, '.talos', 'processi-sfondo', 'c1.log')], 'una stringa, come prima')
    assert.equal(existsSync(join(progetto, '.talos', 'processi-sfondo', 'c1.log')), true)
    assert.equal(Object.hasOwn(eventi[0], 'fileSfondoMostrato'), false, 'nessun campo nuovo senza opzione')
})

test('RS-03 il gestore VERO (shell vera): con la destinazione nei dati scrive lì, il testo dice background/<id>.log, il progetto resta vuoto', { timeout: 30_000 }, async (t) => {
    const { progetto, dati } = scena(t)
    const percorso = join(dati, 'background', 'vero1.log')
    const esito = await eseguiComandoSandboxato(`node -e "console.log('inizio-sfondo');setTimeout(()=>console.log('fine-sfondo'),300)"`, progetto, {
        segnaleSfondo: new AbortController().signal, fileSfondo: { percorso, mostrato: 'background/vero1.log' }, inSfondoSubito: true,
    })
    assert.equal(esito.messoInSfondo, true)
    assert.equal(esito.fileSfondo, percorso)
    assert.equal(esito.fileSfondoMostrato, 'background/vero1.log')
    /* ritocco D1: il testo per il modello porta il percorso pieno col nome corto accanto; la sua versione per gli eventi solo il corto */
    assert.ok(esito.testo.includes(`Output file: ${percorso} (background/vero1.log)`), esito.testo)
    const perGliEventi = testoSfondoPerGliEventi(esito.testo, esito.fileSfondo, esito.fileSfondoMostrato)
    assert.match(perGliEventi, /Output file: background\/vero1\.log$/mu)
    assert.ok(!perGliEventi.includes(dati), 'la versione per gli eventi non porta il percorso assoluto')
    await esito.uscita
    await new Promise((r) => setTimeout(r, 200))
    assert.match(readFileSync(percorso, 'utf8'), /fine-sfondo/u, 'l uscita dopo lo sfondo è nel registro')
    assert.deepEqual(readdirSync(progetto), [])
})

test('RS-04 il modello rilegge il registro con leggi, col percorso pieno E con background/<id>.log, senza chiedere', async (t) => {
    const { progetto, dati } = scena(t)
    const pieno = join(dati, 'background', 'c1.log')
    const { esiti, chieste } = await giro({ progetto, dati, eseguiComandoSandboxatoFn: esecutoreCheSfonda([]),
        prossima: sfondaPoi(() => ['leggi', { percorso: pieno }], () => ['leggi', { percorso: 'background/c1.log' }], () => ['leggi', { percorso: 'background\\c1.log' }]) })
    assert.deepEqual(chieste, [], 'nessuna domanda per il registro di questa sessione')
    for (const i of [1, 2, 3]) {
        assert.doesNotMatch(esiti[i], /^REFUSED/u, esiti[i])
        assert.ok(esiti[i].includes(USCITA), esiti[i].slice(0, 300))
    }
})

test('RS-05 al contrario: un altro file della cartella dati CHIEDE (e col no non si legge)', async (t) => {
    const { progetto, dati } = scena(t)
    const altro = join(dati, '.harness-ui-library', 'voce.txt')
    mkdirSync(dirname(altro), { recursive: true })
    writeFileSync(altro, 'SEGRETO-DELLA-LIBRERIA\n')
    const accanto = join(dati, 'background', 'note.txt')
    const { esiti, chieste } = await giro({ progetto, dati, eseguiComandoSandboxatoFn: esecutoreCheSfonda([]),
        prossima: sfondaPoi(() => { writeFileSync(accanto, 'ACCANTO\n'); return ['leggi', { percorso: altro }] }, () => ['leggi', { percorso: accanto }]) })
    assert.equal(chieste.length, 2)
    assert.match(esiti[1], /^DECLINED\. The person said no/u)
    assert.match(esiti[2], /^DECLINED\. The person said no/u)
    assert.doesNotMatch(esiti.join('\n'), /SEGRETO-DELLA-LIBRERIA|ACCANTO/u)
})

test('RS-06 il registro di un ALTRA sessione, accanto nella stessa cartella: col percorso pieno chiede, col riferimento corto non si legge', async (t) => {
    const { progetto, dati } = scena(t)
    const suo = join(dati, 'background', 'altra-sessione-7.log')
    mkdirSync(dirname(suo), { recursive: true })
    writeFileSync(suo, 'USCITA-DI-UN-ALTRA-SESSIONE\n')
    const { esiti, chieste } = await giro({ progetto, dati, eseguiComandoSandboxatoFn: esecutoreCheSfonda([]),
        prossima: sfondaPoi(() => ['leggi', { percorso: suo }], () => ['leggi', { percorso: 'background/altra-sessione-7.log' }]) })
    assert.equal(chieste.length, 1, 'solo il percorso pieno arriva alla domanda')
    assert.match(esiti[1], /^DECLINED\. The person said no/u)
    assert.doesNotMatch(esiti.join('\n'), /USCITA-DI-UN-ALTRA-SESSIONE/u)
})

test('RS-07 un collegamento FISICO messo al posto del registro, verso un file di fuori: CHIEDE', async (t) => {
    const { radice, progetto, dati } = scena(t)
    const segreto = join(radice, '.ssh-finto', 'chiave.txt')
    mkdirSync(dirname(segreto))
    writeFileSync(segreto, 'SEGRETO\n')
    const registro = join(dati, 'background', 'c1.log')
    let saltata = null
    const { esiti, chieste } = await giro({ progetto, dati, eseguiComandoSandboxatoFn: esecutoreCheSfonda([]),
        prossima: sfondaPoi(() => {
            try { rmSync(registro, { force: true }); linkSync(segreto, registro) } catch (e) { saltata = e.code; return null }
            return ['leggi', { percorso: 'background/c1.log' }]
        }, () => ['leggi', { percorso: registro }]) })
    if (saltata) { t.skip(`hard links refused here (${saltata})`); return }
    assert.equal(chieste.length, 1, 'il percorso pieno chiede; il riferimento corto non apre niente')
    assert.doesNotMatch(esiti.join('\n'), /SEGRETO/u)
})

test('RS-08 un collegamento SIMBOLICO al posto del registro: CHIEDE', async (t) => {
    const { radice, progetto, dati } = scena(t)
    const segreto = join(radice, '.ssh-finto', 'chiave.txt')
    mkdirSync(dirname(segreto))
    writeFileSync(segreto, 'SEGRETO\n')
    const registro = join(dati, 'background', 'c1.log')
    let saltata = null
    const { esiti, chieste } = await giro({ progetto, dati, eseguiComandoSandboxatoFn: esecutoreCheSfonda([]),
        prossima: sfondaPoi(() => {
            try { rmSync(registro, { force: true }); symlinkSync(segreto, registro, 'file') } catch (e) { saltata = e.code; return null }
            return ['leggi', { percorso: registro }]
        }) })
    if (saltata) { t.skip(`symbolic links refused here (${saltata})`); return }
    assert.equal(chieste.length, 1)
    assert.doesNotMatch(esiti.join('\n'), /SEGRETO/u)
})

test('RS-09 una GIUNZIONE dentro background/ che porta fuori: nessun file «dentro» passa senza chiedere', async (t) => {
    const { radice, progetto, dati } = scena(t)
    const fuori = join(radice, '.ssh-finto')
    mkdirSync(fuori)
    writeFileSync(join(fuori, 'c1.log'), 'SEGRETO\n')
    const { esiti, chieste } = await giro({ progetto, dati, eseguiComandoSandboxatoFn: esecutoreCheSfonda([]),
        prossima: sfondaPoi(() => { symlinkSync(fuori, join(dati, 'background', 'giunzione'), 'junction'); return ['leggi', { percorso: join(dati, 'background', 'giunzione', 'c1.log') }] },
            () => ['leggi', { percorso: 'background/giunzione/c1.log' }]) })
    assert.equal(chieste.length, 1, 'il percorso pieno chiede; il riferimento con una cartella in mezzo non è un riferimento')
    assert.doesNotMatch(esiti.join('\n'), /SEGRETO/u)
})

test('RS-10 se la cartella background È una giunzione verso fuori, nemmeno il registro passa senza chiedere', async (t) => {
    const { radice, progetto, dati } = scena(t)
    const fuori = join(radice, 'altrove')
    mkdirSync(fuori)
    symlinkSync(fuori, join(dati, 'background'), 'junction')
    const { chieste } = await giro({ progetto, dati, eseguiComandoSandboxatoFn: esecutoreCheSfonda([]),
        prossima: sfondaPoi(() => ['leggi', { percorso: join(dati, 'background', 'c1.log') }]) })
    assert.equal(chieste.length, 1, 'il percorso reale non è quello dichiarato')
})

test('RS-11 i registri dei giri PRIMA (dall ospite, registriSfondoFn) si rileggono; senza, dal giro dopo si chiede', async (t) => {
    const { progetto, dati } = scena(t)
    const vecchio = join(dati, 'background', 'giro-prima.log')
    mkdirSync(dirname(vecchio), { recursive: true })
    writeFileSync(vecchio, 'USCITA-DEL-GIRO-PRIMA\n')
    const conOspite = await giro({ progetto, dati, registriSfondoFn: () => [vecchio], prossima: (n) => (n === 0 ? ['leggi', { percorso: 'background/giro-prima.log' }] : null) })
    assert.deepEqual(conOspite.chieste, [])
    assert.ok(conOspite.esiti[0].includes('USCITA-DEL-GIRO-PRIMA'), conOspite.esiti[0])
    const senza = await giro({ progetto, dati, prossima: (n) => (n === 0 ? ['leggi', { percorso: vecchio }] : null) })
    assert.equal(senza.chieste.length, 1)
    assert.match(senza.esiti[0], /^DECLINED\. The person said no/u)
})

test('RS-18 due letture nella stessa risposta (partono insieme, in anticipo): il riferimento corto legge il registro, non il progetto', async (t) => {
    const { progetto, dati } = scena(t)
    /* un file omonimo NEL progetto: una lettura anticipata del riferimento corto leggerebbe lui */
    mkdirSync(join(progetto, 'background'))
    writeFileSync(join(progetto, 'background', 'c1.log'), 'FILE-DEL-PROGETTO\n')
    writeFileSync(join(progetto, 'altro.txt'), 'altro\n')
    const { esiti, chieste } = await giro({ progetto, dati, eseguiComandoSandboxatoFn: esecutoreCheSfonda([]),
        prossima: sfondaPoi(() => [['leggi', { percorso: 'background/c1.log' }], ['leggi', { percorso: 'altro.txt' }]]) })
    assert.deepEqual(chieste, [])
    assert.ok(esiti[1].includes(USCITA), esiti[1].slice(0, 300))
    assert.doesNotMatch(esiti[1], /FILE-DEL-PROGETTO/u)
})

test('RS-19 una cartella dati che non si risolve: il comando gira senza registro e lo dice; nel progetto non ricade niente', async (t) => {
    const { progetto } = scena(t)
    const visti = []
    const { esiti } = await giro({ progetto, dati: async () => { throw new Error('disco assente') }, prossima: sfondaPoi(), eseguiComandoSandboxatoFn: esecutoreCheSfonda(visti) })
    assert.deepEqual(visti, [null], 'nessuna destinazione, mai il progetto')
    assert.deepEqual(readdirSync(progetto), [])
    assert.match(esiti[0], /^IN BACKGROUND/u)
})

test('RS-20 la nota di fine DENTRO il turno: al modello il percorso pieno, nell evento il nome corto; all ospite il nome corto', async (t) => {
    const { progetto, dati } = scena(t)
    writeFileSync(join(progetto, 'altro.txt'), 'altro\n')
    const all = []
    const finisceSubito = async (...a) => ({ ...(await esecutoreCheSfonda([])(...a)), uscita: Promise.resolve({ codice: 0 }) })
    const esiti = [], alModello = [], ospite = []
    await talosLavora({
        cartella: progetto, task: { consegna: 'lavora' }, modello: 'f', chiave: 'k', giriMassimi: 6, cartellaSfondo: dati,
        eseguiComandoSandboxatoFn: finisceSubito, segnalaUscitaSfondo: (u) => ospite.push(u),
        fetchDiRete: fornitore(sfondaPoi(() => ['leggi', { percorso: 'altro.txt' }]), all, alModello),
        onGiro: (e) => { if (e.tipo === 'tool-esito') esiti.push(togliConfiniDati(String(e.content))) },
        chiediApprovazioneFn: async (a) => a?.tipo === 'shell',
    })
    const pieno = join(dati, 'background', 'c1.log')
    const c2 = alModello.find((m) => m.id === 'c2')?.testo ?? ''
    assert.ok(c2.includes(`Its full output is in ${pieno}.`), c2)
    assert.match(esiti[1], /Its full output is in background\/c1\.log\./u)
    assert.ok(!esiti.join('\n').includes(dati), 'nessun evento porta il percorso assoluto')
    assert.equal(ospite[0]?.file, 'background/c1.log')
})

test('RS-12 l insieme della sessione dagli eventi: solo i ToolCallResult con un file di sfondo, e la riga dei Processi porta il nome da mostrare', () => {
    const eventi = [
        { type: 'ToolCallArgs', toolCallId: 'a', fileSfondo: 'C:\\non-un-esito.log', _sequenza: 0 },
        { type: 'ToolCallStart', toolCallId: 'a', toolCallName: 'shell', _sequenza: 1 },
        { type: 'ToolCallArgs', toolCallId: 'a', delta: JSON.stringify({ comando: 'npm run dev' }), _sequenza: 2 },
        { type: 'ToolCallResult', toolCallId: 'a', content: `${INTESTAZIONE_SFONDO}: x\nOutput file: background/a.log`, inSfondo: true, fileSfondo: 'C:\\dati\\background\\a.log', fileSfondoMostrato: 'background/a.log', _sequenza: 3 },
        { type: 'ToolCallResult', toolCallId: 'b', content: 'exit 0', _sequenza: 4 },
        { type: 'CUSTOM', name: 'x', value: { fileSfondo: 'C:\\finto.log' }, _sequenza: 5 },
    ]
    assert.deepEqual(registriSfondoDaEventi(eventi), ['C:\\dati\\background\\a.log'])
    assert.deepEqual(registriSfondoDaEventi([]), [])
    const [riga] = processiDaEventi(eventi).processi
    assert.equal(riga.fileSfondo, 'C:\\dati\\background\\a.log')
    assert.equal(riga.fileSfondoMostrato, 'background/a.log')
})

test('RS-13 agent-service porta l opzione e l insieme al nucleo SOLO se l ospite li dà (un opzione nuova lungo tutto il filo)', async () => {
    const visti = []
    const fn = async (input) => { visti.push(input); return { comeFinita: 'concluso', detto: 'fatto' } }
    const registri = () => ['C:/dati/background/a.log']
    await avviaSessione({ cartella: '/tmp/x', task: { consegna: 'p' }, modello: 'm', chiave: 'k', onEvento: () => {}, talosLavoraFn: fn,
        cartellaSfondoFn: async () => 'C:/dati/progetto', registriSfondoFn: registri })
    assert.equal(typeof visti[0].cartellaSfondo, 'function')
    assert.equal(await visti[0].cartellaSfondo(), 'C:/dati/progetto')
    assert.equal(visti[0].registriSfondoFn, registri)
    await avviaSessione({ cartella: '/tmp/x', task: { consegna: 'p' }, modello: 'm', chiave: 'k', onEvento: () => {}, talosLavoraFn: fn,
        cartellaDatiProgettoFn: async () => 'C:/dati/progetto' })
    assert.equal(Object.hasOwn(visti[1], 'cartellaSfondo'), false, 'la cartella dati della Libreria da sola non sposta i registri')
    assert.equal(Object.hasOwn(visti[1], 'registriSfondoFn'), false)
})

test('RS-14 il `!` della persona: con la cartella dati il registro va lì e l evento porta il nome da mostrare; senza, come oggi', async (t) => {
    const { progetto, dati } = scena(t)
    for (const conDati of [true, false]) {
        const visti = [], eventi = [], note = []
        const fatto = await eseguiComandoDiretto({
            cartella: progetto, comando: 'npm run dev', onEvento: (e) => eventi.push(e),
            eseguiComandoSandboxatoFn: async (...a) => ({ ...(await esecutoreCheSfonda(visti)(...a)), uscita: Promise.resolve({ codice: 0 }) }),
            segnalaUscitaSfondo: (u) => note.push(u),
            ...(conDati ? { cartellaSfondoFn: async () => dati } : {}),
        })
        await new Promise((r) => setImmediate(r))
        const risultato = eventi.find((e) => e.type === 'ToolCallResult')
        const id = risultato.toolCallId
        if (conDati) {
            assert.deepEqual(visti, [{ percorso: join(dati, 'background', `${id}.log`), mostrato: `background/${id}.log` }])
            assert.equal(risultato.fileSfondoMostrato, `background/${id}.log`)
            assert.equal(note[0].file, `background/${id}.log`, 'la nota di fine passa dalla coda (eventi verso il ponte): il riferimento corto')
            assert.deepEqual(readdirSync(progetto), [])
            /* ritocco D1: il testo cucito nella storia del modello porta il percorso pieno; l evento solo il nome corto */
            assert.ok(String(fatto.testo).includes(join(dati, 'background', `${id}.log`)), String(fatto.testo))
            assert.ok(!String(risultato.content).includes(dati), String(risultato.content))
            assert.match(String(risultato.content), new RegExp(`Output file: background/${id}\\.log$`, 'mu'))
        } else {
            assert.deepEqual(visti, [join(progetto, '.talos', 'processi-sfondo', `${id}.log`)])
            assert.equal(Object.hasOwn(risultato, 'fileSfondoMostrato'), false)
        }
    }
})

test('RS-17 il registro passa la cartella dati SOLO con una cartella dati vera (il server), e l insieme dal giornale della sessione', async (t) => {
    const { createSessionRegistry } = await import('../src/session-registry.mjs')
    const store = cartella(t, 'talos-b26-registro-')
    const runs = []
    const avviaSessioneFn = (input) => {
        let risolvi
        const promessa = new Promise((r) => { risolvi = r })
        runs.push({ input, risolvi })
        input.onEvento({ type: 'RunStarted', threadId: `t${runs.length}`, runId: `r${runs.length}` })
        return promessa
    }
    const fine = (i) => { runs[i].input.onEvento({ type: 'RunFinished' }); runs[i].risolvi({ ok: true, esito: { detto: 'ok', comeFinita: 'concluso', messaggiFinali: [] } }) }
    const base = { avviaSessioneFn, modello: 'm', chiave: 'k', cartellaEsisteFn: () => true, cartellaStore: store,
        preparaEsecuzioneFn: () => ({ cartella: store, comandoProva: 'npm test', task: { id: 'task', consegna: 'lavora' } }) }
    const conDati = createSessionRegistry({ ...base, cartellaDatiProgettoFn: async () => 'C:/dati/progetto' })
    const { sessionId } = conDati.avvia('task')
    assert.equal(await runs[0].input.cartellaSfondoFn(), 'C:/dati/progetto')
    runs[0].input.onEvento({ type: 'ToolCallResult', toolCallId: 'z1', content: 'IN BACKGROUND', inSfondo: true, fileSfondo: 'C:/dati/progetto/background/z1.log', fileSfondoMostrato: 'background/z1.log' })
    assert.deepEqual([...runs[0].input.registriSfondoFn()], ['C:/dati/progetto/background/z1.log'], 'il giornale vivo della sessione')
    fine(0)
    await conDati.attendiAssestamento(sessionId)
    await conDati.chiudi?.()
    const senza = createSessionRegistry(base)
    const altra = senza.avvia('task')
    assert.equal(Object.hasOwn(runs[1].input, 'cartellaSfondoFn'), false, 'col default (il progetto) i registri restano dove erano')
    fine(1)
    await senza.attendiAssestamento(altra.sessionId)
    await senza.chiudi?.()
})

/*
 * A5 della CLI (FORMA-BLOCCO-ALLINEAMENTO-CLI-2026-11-02.md:177): la CLI non passa `cartellaDatiProgettoFn`, che sposterebbe anche Libreria e Ricerche, quindi il
 * registro del suo `!` restava nel progetto. L'opzione separata del registro sposta SOLO i registri dello sfondo, del modello e del `!`. Assente = come oggi.
 */
test('RS-25 l opzione dei soli registri di sfondo: il modello e il `!` li scrivono lì, Libreria e Ricerche restano dove sono; assente come oggi', async (t) => {
    const { createSessionRegistry } = await import('../src/session-registry.mjs')
    const store = cartella(t, 'talos-b26-a5-')
    const runs = [], diretti = [], chieste = []
    const avviaSessioneFn = (input) => {
        let risolvi
        const promessa = new Promise((r) => { risolvi = r })
        runs.push({ input, risolvi })
        input.onEvento({ type: 'RunStarted', threadId: `t${runs.length}`, runId: `r${runs.length}` })
        return promessa
    }
    const fine = (i) => { runs[i].input.onEvento({ type: 'RunFinished' }); runs[i].risolvi({ ok: true, esito: { detto: 'ok', comeFinita: 'concluso', messaggiFinali: [] } }) }
    const base = { avviaSessioneFn, modello: 'm', chiave: 'k', cartellaEsisteFn: () => true, cartellaStore: store,
        preparaEsecuzioneFn: () => ({ cartella: store, comandoProva: 'npm test', task: { id: 'task', consegna: 'lavora' } }),
        eseguiComandoDirettoFn: (argomenti) => { diretti.push(argomenti); return new Promise(() => {}) } }
    const prova = async (opzioni) => {
        const registro = createSessionRegistry({ ...base, ...opzioni })
        const { sessionId } = registro.avvia('task')
        const giro = runs.at(-1)
        fine(runs.length - 1)
        await registro.attendiAssestamento(sessionId)
        registro.shell(sessionId, 'npm run dev')
        await new Promise((r) => setImmediate(r))
        return { giro: giro.input, bang: diretti.at(-1) }
    }
    /* la forma della CLI: solo l'opzione nuova */
    const cli = await prova({ cartellaSfondoProgettoFn: async (c) => { chieste.push(c); return 'C:/dati/sfondo' } })
    assert.equal(await cli.giro.cartellaSfondoFn(), 'C:/dati/sfondo', 'il modello')
    assert.equal(await cli.bang.cartellaSfondoFn(), 'C:/dati/sfondo', 'il `!` della persona')
    assert.equal(await cli.giro.cartellaDatiProgettoFn(), store, 'Libreria e Ricerche restano nel progetto, come oggi nella CLI')
    assert.deepEqual(chieste, [store, store], 'riceve la cartella di partenza della sessione, come cartellaDatiProgettoFn')
    /* tutte e due: vince quella dei registri, la Libreria segue la sua */
    const entrambe = await prova({ cartellaDatiProgettoFn: async () => 'C:/dati/progetto', cartellaSfondoProgettoFn: async () => 'C:/dati/sfondo' })
    assert.equal(await entrambe.giro.cartellaSfondoFn(), 'C:/dati/sfondo')
    assert.equal(await entrambe.bang.cartellaSfondoFn(), 'C:/dati/sfondo')
    assert.equal(await entrambe.giro.cartellaDatiProgettoFn(), 'C:/dati/progetto')
    /* AL CONTRARIO: assente, come oggi, nei due versi */
    const server = await prova({ cartellaDatiProgettoFn: async () => 'C:/dati/progetto' })
    assert.equal(await server.giro.cartellaSfondoFn(), 'C:/dati/progetto')
    assert.equal(await server.bang.cartellaSfondoFn(), 'C:/dati/progetto')
    const nessuna = await prova({})
    assert.equal(Object.hasOwn(nessuna.giro, 'cartellaSfondoFn'), false)
    assert.equal(Object.hasOwn(nessuna.bang, 'cartellaSfondoFn'), false)
})

/* Il ponte: lo stesso banco di `remoto-ponte-eventi.test.mjs`, col registro finto che rigioca la storia. */
function ponte({ storia = [], processi = null } = {}) {
    const sessionRegistry = {
        esiste: () => true,
        iscriviti(_id, ascolta, daSequenza) { for (const e of storia) if ((e._sequenza ?? 0) > daSequenza) ascolta(e); return () => {} },
    }
    const ricevuti = []
    const contesto = { dispositivo: { id: 'A' }, iscrizioni: new Map(), iscrivi(sub, chiudi) { contesto.iscrizioni.set(sub, chiudi); return (data) => { ricevuti.push(data); return Promise.resolve() } } }
    const chiama = async () => ({ dati: { registrato: true, processi, motivo: null, guardia: null, interrotta: false } })
    return { contesto, ricevuti, operazioni: creaOperazioni({ chiama, sessionRegistry, iscriviConRigiocata, ogni: () => null, smetti: () => {} }) }
}
const ASSOLUTO = 'C:\\Users\\Mario Rossi\\AppData\\Roaming\\TALOS\\.workspaces\\p-01\\background\\c1.log'

test('RS-15 verso il ponte il percorso assoluto del registro non esce: eventi e riga dei Processi portano background/<id>.log', async () => {
    const storia = [{ type: 'ToolCallResult', toolCallId: 'c1', content: `${INTESTAZIONE_SFONDO}: x\nOutput file: background/c1.log`, inSfondo: true, fileSfondo: ASSOLUTO, fileSfondoMostrato: 'background/c1.log', _sequenza: 1 }]
    const b = ponte({ storia, processi: [{ toolCallId: 'c1', esito: 'in-sfondo', inSfondo: true, fileSfondo: ASSOLUTO, fileSfondoMostrato: 'background/c1.log' }] })
    await b.operazioni.esegui('session.events', { sessionId: 'x', sub: 's', after: 0 }, b.contesto)
    const evento = b.ricevuti.find((e) => e.type === 'ToolCallResult')
    assert.equal(evento.fileSfondo, 'background/c1.log')
    assert.equal(evento.fileSfondoMostrato, 'background/c1.log')
    const elenco = await b.operazioni.esegui('session.processes', { sessionId: 'x' }, b.contesto)
    assert.equal(elenco.processi[0].fileSfondo, 'background/c1.log')
    assert.doesNotMatch(JSON.stringify([b.ricevuti, elenco]), /Mario|AppData/u)
})

/* Revisione del blocco 26 (Mobile, 02/11/2026 notte): R26-1/R26-2 — le altre forme dello stesso percorso; R26-3 — i registri dei giri prima. */
test('RS-21 (R26-1/2) ogni forma dello stesso registro diventa il nome corto: barre in avanti, maiuscole diverse, /mnt/c di WSL; un altro file no', () => {
    const pieno = 'C:\\Users\\Mario\\AppData\\Roaming\\TALOS\\progetti\\p1\\background\\call_7.log'
    const corto = 'background/call_7.log'
    const testo = [
        `Output file: ${pieno} (${corto})`,
        'avanti: C:/Users/Mario/AppData/Roaming/TALOS/progetti/p1/background/call_7.log',
        'maiuscole: c:\\users\\MARIO\\appdata\\roaming\\talos\\progetti\\p1\\background\\CALL_7.LOG',
        'wsl: /mnt/c/Users/Mario/AppData/Roaming/TALOS/progetti/p1/background/call_7.log',
        'altro: C:/Users/Mario/AppData/Roaming/TALOS/progetti/p1/background/call_8.log',
    ].join('\n')
    const evento = testoSfondoPerGliEventi(testo, pieno, corto)
    assert.equal(evento.split('\n').slice(0, 4).join('\n'), ['Output file: background/call_7.log', 'avanti: background/call_7.log',
        'maiuscole: background/call_7.log', 'wsl: background/call_7.log'].join('\n'))
    assert.match(evento, /altro: C:\/Users\/Mario\/.*call_8\.log/u, 'un file diverso resta com è')
    assert.equal(testoSfondoPerGliEventi('niente', pieno, corto), 'niente')
    assert.equal(testoSfondoPerGliEventi(`x ${pieno}`, pieno, 'costa $1 $& $$'), 'x costa $1 $& $$', 'il nome sostituisce alla lettera')
})

test('RS-22 (R26-3) il percorso di un registro di un giro PRIMA, dentro un esito di questo giro: al modello pieno, nell evento il nome corto', async (t) => {
    const { progetto, dati } = scena(t)
    const vecchio = join(dati, 'background', 'giro-prima.log')
    mkdirSync(dirname(vecchio), { recursive: true })
    writeFileSync(vecchio, 'x\n')
    writeFileSync(join(progetto, 'nota.txt'), `il registro: ${vecchio.replace(/\\/gu, '/')}\n`)
    const { esiti, alModello } = await giro({ progetto, dati, registriSfondoFn: () => [vecchio], prossima: (n) => (n === 0 ? ['leggi', { percorso: 'nota.txt' }] : null) })
    assert.ok(esiti[0].includes('background/giro-prima.log'), esiti[0])
    assert.ok(!esiti[0].includes(dati.replace(/\\/gu, '/')) && !esiti[0].includes(dati), `nessun percorso assoluto nell evento: ${esiti[0]}`)
    assert.ok((alModello.find((m) => m.id === 'c1')?.testo ?? '').includes(vecchio.replace(/\\/gu, '/')), 'il modello legge il file com è')
})

test('RS-23 (R26-1) il ponte: il testo dell evento col percorso scritto con le barre in avanti esce col nome corto', async () => {
    const avanti = ASSOLUTO.replace(/\\/gu, '/')
    const storia = [{ type: 'ToolCallResult', toolCallId: 'c1', content: `guardo ${avanti}`, inSfondo: true, fileSfondo: ASSOLUTO, fileSfondoMostrato: 'background/c1.log', _sequenza: 1 }]
    const b = ponte({ storia, processi: [] })
    await b.operazioni.esegui('session.events', { sessionId: 'x', sub: 's', after: 0 }, b.contesto)
    const evento = b.ricevuti.find((e) => e.type === 'ToolCallResult')
    assert.equal(evento.content, 'guardo background/c1.log')
})

test('RS-24 (S3) fra controllo e lettura: lo stesso registro resta lo stesso; sostituito da un altro file (o sparito) non lo è più', async (t) => {
    const { dati } = scena(t)
    const registro = join(dati, 'background', 'c9.log')
    mkdirSync(dirname(registro), { recursive: true })
    writeFileSync(registro, 'mio\n')
    const identita = await identitaRegistroDiSfondo([registro], registro)
    assert.ok(identita, 'il registro della sessione ha la sua identità')
    assert.equal(await stessoRegistroDiSfondo(identita), true, 'non toccato: è lo stesso')
    writeFileSync(registro, 'mio, con una riga in più\n', { flag: 'a' })
    assert.equal(await stessoRegistroDiSfondo(identita), true, 'un comando che scrive ancora nel registro non lo cambia')
    rmSync(registro)
    writeFileSync(join(dati, 'background', 'segreto.txt'), 'altro\n')
    writeFileSync(registro, 'sostituito\n')
    assert.equal(await stessoRegistroDiSfondo(identita), false, 'un file nuovo al suo posto non è il registro')
    rmSync(registro)
    assert.equal(await stessoRegistroDiSfondo(identita), false, 'sparito: no')
    assert.equal(await stessoRegistroDiSfondo(null), false)
    assert.equal(await identitaRegistroDiSfondo([registro], join(dati, 'background', 'segreto.txt')), null, 'fuori dall insieme: nessuna identità')
})

test('RS-16 un registro VECCHIO (nel progetto) arriva al ponte col nome relativo alla SUA cartella, .talos/processi-sfondo/<id>.log, anche nel testo', async () => {
    const vecchio = 'C:\\Users\\Mario\\progetto\\.talos\\processi-sfondo\\c2.log'
    const strano = 'C:\\Users\\Mario\\altrove\\c4.log'
    const storia = [{ type: 'ToolCallResult', toolCallId: 'c2', content: `IN BACKGROUND\nOutput file: ${vecchio}`, inSfondo: true, fileSfondo: vecchio, _sequenza: 1 },
        { type: 'ToolCallResult', toolCallId: 'c3', content: 'exit 0', _sequenza: 2 },
        { type: 'ToolCallResult', toolCallId: 'c4', content: 'IN BACKGROUND', inSfondo: true, fileSfondo: strano, _sequenza: 3 }]
    const b = ponte({ storia, processi: [{ toolCallId: 'c2', fileSfondo: vecchio, fileSfondoMostrato: null }, { toolCallId: 'c3', fileSfondo: null }] })
    await b.operazioni.esegui('session.events', { sessionId: 'x', sub: 's', after: 0 }, b.contesto)
    const [due, tre, quattro] = b.ricevuti.filter((e) => e.type === 'ToolCallResult')
    assert.equal(due.fileSfondo, '.talos/processi-sfondo/c2.log')
    assert.equal(due.fileSfondoMostrato, '.talos/processi-sfondo/c2.log')
    assert.equal(due.content, 'IN BACKGROUND\nOutput file: .talos/processi-sfondo/c2.log', 'anche il testo, mai il percorso del PC')
    assert.deepEqual(tre, storia[1], 'un evento senza registro passa com è')
    assert.equal(quattro.fileSfondo, '…/c4.log', 'un percorso che non è un registro noto perde le cartelle')
    const elenco = await b.operazioni.esegui('session.processes', { sessionId: 'x' }, b.contesto)
    assert.deepEqual(elenco.processi.map((p) => p.fileSfondo), ['.talos/processi-sfondo/c2.log', null])
    assert.doesNotMatch(JSON.stringify([b.ricevuti, elenco]), /Mario/u)
})
