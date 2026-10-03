/*
 * ⛔⛔⛔ D2 — LE LETTURE FUORI DAL PROGETTO CHIEDONO (owner 03/10/2026, «Chiedere sempre, credenziali sempre»).
 *
 * Il difetto, misurato dallo stress test della CLI del 03/10: `elenca "C:/Users/<persona>"` passava senza nessuna domanda e
 * metteva nel contesto `.ssh/id_ed25519`, `.claude/.credentials.json`, `.codex/auth.json`, `.docker/config.json`; `leggi`
 * apriva `AppData/Roaming/TALOS/registro.log`. Il controllo di `elenca` era solo sulla PAROLA `..` (`RISALITA`), e `leggi`
 * chiedeva solo per un segreto o una cartella nascosta fuori dal progetto (F15).
 *
 * Decisione dell'owner: fuori dalla cartella della sessione una lettura (`leggi`) o un elenco (`elenca`) CHIEDONO; le
 * credenziali chiedono sempre, anche con «Accesso completo». `cerca` rifiuta già un `dentro` assoluto o con `..` (T-13):
 * qui si fissa che resta così.
 *
 * Come fanno gli altri (letto il 03/10/2026): OpenCode `c42ae0d` chiede `external_directory` per read/glob/grep/list fuori
 * dal progetto, di serie `"*": "ask"` (`packages/opencode/src/tool/external-directory.ts`, `agent/agent.ts:122`); Claude Code
 * legge senza chiedere solo «within the working directory and additional directories» (doc permissions); Codex `c73775f`
 * legge ovunque di serie ma ha i glob `deny_read` (`protocol/src/permissions/target.rs:186-204`); OWASP LLM06:2025.
 */
import { strict as assert } from 'node:assert'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, parse } from 'node:path'
import { describe, it } from 'node:test'

import { talosLavora } from '../src/kernel/talosHarness.mjs'
import { motivoDaChiedere } from '../src/path-policy.mjs'
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs'

describe('D2 — leggere ed elencare fuori dalla cartella della sessione chiede alla persona', () => {
    /** Una radice con DENTRO il progetto e, accanto, una cartella «fuori» con un file che il modello non deve vedere da solo. */
    function scena(t) {
        const radice = mkdtempSync(join(tmpdir(), 'talos-d2-letture-'))
        t.after(() => rimuoviCartellaDiProva(radice))
        const progetto = join(radice, 'progetto')
        const fuori = join(radice, 'fuori')
        mkdirSync(join(progetto, 'src'), { recursive: true })
        mkdirSync(fuori, { recursive: true })
        writeFileSync(join(progetto, 'app.js'), 'export const a = 1\n')
        writeFileSync(join(progetto, 'src', 'b.js'), 'export const b = 2\n')
        writeFileSync(join(fuori, 'diario-privato.txt'), 'CONTENUTO-PRIVATO-FUORI\n')
        return { radice, progetto, fuori }
    }

    function reteDiRisposte(...risposte) {
        const chiamate = []
        return {
            chiamate,
            fetch: async (url, opzioni) => {
                const indice = chiamate.length
                chiamate.push({ corpo: JSON.parse(opzioni.body) })
                const scelta = risposte[Math.min(indice, risposte.length - 1)]
                return {
                    ok: true, status: 200,
                    json: async () => ({ choices: [{ message: scelta }], usage: { prompt_tokens: 10, completion_tokens: 5 } }),
                    text: async () => '',
                }
            },
        }
    }

    const TASK = { consegna: 'un compito qualunque, per la prova' }
    const CONCLUSO = { role: 'assistant', content: 'fatto', tool_calls: [] }
    const chiama = (nome, argomenti) => ({ role: 'assistant', content: null, tool_calls: [{ id: 'call_1', function: { name: nome, arguments: JSON.stringify(argomenti) } }] })

    /** Un giro con UNA chiamata: le domande arrivate alla persona e ciò che il modello ha ricevuto. */
    async function giro(cartella, nome, argomenti, { risposta = true, ...extra } = {}) {
        const rete = reteDiRisposte(chiama(nome, argomenti), CONCLUSO)
        const domande = []
        const ricevute = []
        await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch,
            chiediApprovazioneFn: async (azione) => { domande.push(azione); return risposta },
            onGiro(e) { if (e.tipo === 'ricevuta') ricevute.push(e.ricevuta) },
            ...extra,
        })
        const messaggioTool = rete.chiamate[1]?.corpo.messages.find((m) => m.role === 'tool')
        return { domande, ricevute, testoTool: messaggioTool?.content ?? '' }
    }

    // ─────────────────────────────── 1. IL CASO DELLO STRESS TEST ───────────────────────────────

    it('⛔⛔⛔⛔ `elenca` di una cartella ASSOLUTA fuori dal progetto chiede, e col NO la cartella non viene aperta', async (t) => {
        const { progetto, fuori } = scena(t)
        const { domande, testoTool } = await giro(progetto, 'elenca', { percorso: fuori }, { risposta: false })
        assert.equal(domande.length, 1, 'una cartella fuori dal progetto non si elenca senza un sì')
        assert.equal(domande[0].tipo, 'elenca')
        assert.equal(domande[0].segreto?.classe, 'fuori-workspace')
        assert.match(testoTool, /^REFUSED\./u, `al modello arriva un rifiuto parlante: «${testoTool}»`)
        assert.ok(!testoTool.includes('diario-privato.txt'), 'il nome del file fuori non deve arrivare al modello')
    })

    it('⛔⛔⛔ col SÌ la stessa cartella si elenca: la domanda non è un divieto', async (t) => {
        const { progetto, fuori } = scena(t)
        const { domande, testoTool } = await giro(progetto, 'elenca', { percorso: fuori })
        assert.equal(domande.length, 1)
        assert.ok(testoTool.includes('diario-privato.txt'), `col sì l'elenco arriva: «${testoTool}»`)
    })

    it('⛔⛔⛔⛔ `leggi` di un file ASSOLUTO fuori dal progetto chiede, e col NO il contenuto non arriva', async (t) => {
        const { progetto, fuori } = scena(t)
        const { domande, testoTool } = await giro(progetto, 'leggi', { percorso: join(fuori, 'diario-privato.txt') }, { risposta: false })
        assert.equal(domande.length, 1, 'un file fuori dal progetto non si legge senza un sì')
        assert.equal(domande[0].tipo, 'leggi')
        assert.match(testoTool, /^REFUSED\./u)
        assert.ok(!testoTool.includes('CONTENUTO-PRIVATO-FUORI'), 'il contenuto non deve arrivare al modello')
    })

    it('⛔⛔⛔ `leggi ../fuori/…` (relativo che risale) chiede come l\'assoluto', async (t) => {
        const { progetto } = scena(t)
        const { domande, testoTool } = await giro(progetto, 'leggi', { percorso: '../fuori/diario-privato.txt' }, { risposta: false })
        assert.equal(domande.length, 1)
        assert.ok(!testoTool.includes('CONTENUTO-PRIVATO-FUORI'))
    })

    it('⛔⛔⛔ senza un canale per chiedere, la lettura fuori NON parte (nessuno a cui chiedere non è un sì)', async (t) => {
        const { progetto, fuori } = scena(t)
        const rete = reteDiRisposte(chiama('leggi', { percorso: join(fuori, 'diario-privato.txt') }), CONCLUSO)
        await talosLavora({ cartella: progetto, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch, permessiPerAttrezzo: { leggi: 'sempre' } })
        const testo = rete.chiamate[1]?.corpo.messages.find((m) => m.role === 'tool')?.content ?? ''
        assert.match(testo, /outside the session folder/u, `il modello deve sapere PERCHÉ: «${testo}»`)
        assert.ok(!testo.includes('CONTENUTO-PRIVATO-FUORI'))
    })

    // ─────────────────────────────── 2. PARITÀ: DENTRO IL PROGETTO NIENTE CAMBIA ───────────────────────────────

    it('⛔⛔⛔⛔ PARITÀ — `elenca` (radice e `src`) e `leggi app.js` dentro il progetto fanno ZERO domande', async (t) => {
        const { progetto } = scena(t)
        for (const [nome, argomenti, atteso] of [['elenca', {}, 'app.js'], ['elenca', { percorso: 'src' }, 'src/b.js'], ['leggi', { percorso: 'app.js' }, 'export const a = 1']]) {
            const { domande, testoTool } = await giro(progetto, nome, argomenti)
            assert.equal(domande.length, 0, `${nome} ${JSON.stringify(argomenti)} dentro il progetto non chiede`)
            assert.ok(testoTool.includes(atteso), `${nome}: «${testoTool}»`)
        }
    })

    it('⛔⛔ PARITÀ — un assoluto che punta DENTRO il progetto non chiede', async (t) => {
        const { progetto } = scena(t)
        const { domande, testoTool } = await giro(progetto, 'leggi', { percorso: join(progetto, 'app.js') })
        assert.equal(domande.length, 0)
        assert.ok(testoTool.includes('export const a = 1'))
    })

    it('⛔⛔ `cerca` con un `dentro` assoluto resta rifiutato senza cercare (T-13): niente porta laterale', async (t) => {
        const { progetto, fuori } = scena(t)
        const { domande, testoTool } = await giro(progetto, 'cerca', { testo: 'CONTENUTO-PRIVATO', dentro: fuori })
        assert.equal(domande.length, 0)
        assert.match(testoTool, /Nothing was searched/u)
        assert.ok(!testoTool.includes('diario-privato'))
    })

    // ─────────────────────────────── 3. LA FRASE PER LA PERSONA, E LE CREDENZIALI ───────────────────────────────

    it('⭐⭐⭐ la domanda dice QUALE cartella, in lingua naturale e senza nomi tecnici', async (t) => {
        const { progetto, fuori } = scena(t)
        const { domande } = await giro(progetto, 'elenca', { percorso: fuori }, { risposta: false })
        const frase = domande[0].segreto?.frase ?? ''
        assert.ok(frase.includes(fuori), `la persona deve vedere quale cartella: «${frase}»`)
        /* K4b (03/10/2026): la frase arriva INGLESE con la sua chiave; l'italiano lo dice il dizionario dell'interfaccia */
        assert.match(frase, /outside the working folder/u)
        assert.equal(domande[0].segreto?.fraseChiave, 'server.approval.list.outside')
        for (const tecnico of ['elenca', 'workspace', 'fuori-workspace', 'motivoDaChiedere']) assert.ok(!frase.includes(tecnico), `«${tecnico}» in «${frase}»`)
    })

    it('⛔⛔⛔ con «Accesso completo» (cartella = radice del disco) fuori non c\'è niente, ma le credenziali chiedono SEMPRE', () => {
        const radiceDelDisco = parse(tmpdir()).root
        const home = join(tmpdir(), 'casa-finta')
        assert.equal(motivoDaChiedere({ tipo: 'leggi', percorso: join(tmpdir(), 'qualunque.txt'), cartella: radiceDelDisco, home }), null)
        assert.equal(motivoDaChiedere({ tipo: 'elenca', percorso: join(tmpdir(), 'cartella'), cartella: radiceDelDisco, home }), null)
        assert.equal(motivoDaChiedere({ tipo: 'leggi', percorso: '~/.ssh/id_ed25519', cartella: radiceDelDisco, home })?.classe, 'segreto')
        assert.equal(motivoDaChiedere({ tipo: 'elenca', percorso: '~/.aws', cartella: radiceDelDisco, home })?.classe, 'segreto')
    })

    it('⛔⛔ la shell NON cambia: `cat ../fratello/note.txt` resta il comportamento di ieri (solo le letture chiedono)', () => {
        const cartella = join(tmpdir(), 'progetto-finto')
        assert.equal(motivoDaChiedere({ tipo: 'shell', comando: 'cat ../fratello/note.txt', cartella, home: join(tmpdir(), 'casa-finta') }), null)
    })

    it('⛔ senza una cartella non si dice «fuori»: nessun falso allarme', () => {
        assert.equal(motivoDaChiedere({ tipo: 'leggi', percorso: join(tmpdir(), 'x.txt'), home: join(tmpdir(), 'casa-finta') }), null)
    })

    // ─────────────────────────────── ACCESSO COMPLETO (review del 03/10/2026) ───────────────────────────────

    it('⛔⛔⛔ con «Accesso completo» leggere ed elencare fuori NON chiede, anche con la cartella di sessione scelta; le credenziali sì', async (t) => {
        /* FULL-ACCESS-03 e B2-01 erano diventati rossi: in una sessione a cartella SCELTA l'Accesso completo non allarga la cartella
           alla radice (BC-14), quindi la sola cartella non bastava a far tacere la regola. Scrivere fuori passava, leggere fuori no. */
        const { progetto, fuori } = scena(t)
        mkdirSync(join(fuori, '.ssh'), { recursive: true })
        writeFileSync(join(fuori, '.ssh', 'id_ed25519'), 'CHIAVE-PRIVATA\n')
        const pieno = { livelloAccesso: 'accesso-pieno' }
        const elenco = await giro(progetto, 'elenca', { percorso: fuori }, pieno)
        assert.equal(elenco.domande.length, 0, 'con Accesso completo una cartella fuori si elenca senza domanda')
        assert.ok(elenco.testoTool.includes('diario-privato.txt'), `l'elenco arriva: «${elenco.testoTool}»`)
        const lettura = await giro(progetto, 'leggi', { percorso: join(fuori, 'diario-privato.txt') }, pieno)
        assert.equal(lettura.domande.length, 0, 'con Accesso completo un file fuori si legge senza domanda')
        assert.ok(lettura.testoTool.includes('CONTENUTO-PRIVATO-FUORI'))
        const chiave = await giro(progetto, 'leggi', { percorso: join(fuori, '.ssh', 'id_ed25519') }, { ...pieno, risposta: false })
        assert.equal(chiave.domande.length, 1, 'una chiave privata chiede SEMPRE, anche con Accesso completo')
        assert.notEqual(chiave.domande[0].segreto?.classe, 'fuori-workspace', 'chiede perché è una credenziale, non perché è fuori')
        assert.ok(!chiave.testoTool.includes('CHIAVE-PRIVATA'))
    })
})

/*
 * ⛔⛔ D2 — LA LETTURA ANTICIPATA (P18: le letture di una risposta partono appena la chiamata è completa nello stream) NON
 * apre una cartella fuori dal progetto prima della domanda. Stessa forma di VEL-02 (`velocita-letture-insieme.test.mjs`, il
 * segreto di `leggi`): la chiamata prima di `elenca` è una `leggi` il cui hook fa nascere un file FUORI; se l'elenco fosse
 * partito in anticipo non lo vedrebbe. Mutante del desktop (review 03/10): togliere `motivoDaChiedere` dalla partenza
 * anticipata di `elenca` lasciava verde tutto il resto di questo file.
 */
describe('D2 — la lettura anticipata di `elenca` non apre una cartella fuori prima del sì', () => {
    const enc = new TextEncoder()
    const sse = (pezzi) => new Response(new ReadableStream({
        start(c) {
            for (const p of pezzi) c.enqueue(enc.encode(`data: ${JSON.stringify(p)}\n\n`))
            c.enqueue(enc.encode('data: [DONE]\n\n'))
            c.close()
        },
    }))
    const chiamate = (elenco) => sse([{ choices: [{ delta: { tool_calls: elenco.map(([nome, argomenti], index) => ({
        index, id: `call_${index}`, function: { name: nome, arguments: JSON.stringify(argomenti) },
    })) } }] }])
    const finale = () => sse([{ choices: [{ delta: { content: 'finito' } }] }])

    it('⛔⛔⛔ `elenca` fuori nella stessa risposta di una `leggi`: si chiede in ordine, e la cartella si apre DOPO il sì', async (t) => {
        const radice = mkdtempSync(join(tmpdir(), 'talos-d2-anticipata-'))
        t.after(() => rimuoviCartellaDiProva(radice))
        const progetto = join(radice, 'progetto')
        const fuori = join(radice, 'fuori')
        mkdirSync(progetto, { recursive: true })
        mkdirSync(fuori, { recursive: true })
        writeFileSync(join(progetto, 'a.txt'), 'alfa\n')
        writeFileSync(join(fuori, 'vecchio.txt'), 'x\n')
        const domande = []
        let hookFinito = false
        let primaLeggi = true
        let n = 0
        const esito = await talosLavora({
            cartella: progetto, task: { consegna: 'elenca' }, modello: 'x', chiave: 'y', onDelta: () => {},
            fetchDiRete: async () => (n++ === 0 ? chiamate([['leggi', { percorso: 'a.txt' }], ['elenca', { percorso: fuori }]]) : finale()),
            chiediApprovazioneFn: async (azione) => { domande.push({ tipo: azione.tipo, dopoLHook: hookFinito }); return true },
            hookFn: async (evento) => {
                if (evento?.tipo !== 'pre_tool_call' || evento.azione !== 'leggi' || !primaLeggi) return undefined
                primaLeggi = false
                await new Promise((r) => setTimeout(r, 400))
                writeFileSync(join(fuori, 'nuovo.txt'), 'y\n')
                hookFinito = true
                return undefined
            },
        })
        const risultati = esito.messaggiFinali.filter((m) => m.role === 'tool')
        assert.deepEqual(domande, [{ tipo: 'elenca', dopoLHook: true }], 'la cartella fuori chiede, e chiede DOPO la chiamata precedente')
        assert.match(risultati[1].content, /nuovo\.txt/u, `la cartella si elenca DOPO il sì, non in anticipo: «${risultati[1].content}»`)
    })

})
