/*
 * ⛔⛔ OSS-1 e OSS-2 — LE DUE COSE CHE LA SCHEDA «PROCESSI» NON POTEVA SAPERE.
 * Osservazioni dal giro vero del 17/09/2026 (coda `.claude/CODA-BUG-CRITICI-2026-09-08.md`).
 *
 * OSS-1 — al REPLAY di una sessione la durata di ogni processo era «0 s». Non e'
 *   un difetto di calcolo: il client la ricavava da `ricevutoA`, cioe' dall'ora in
 *   cui l'evento gli e' ARRIVATO, e al replay tutti gli eventi arrivano insieme.
 *   Una durata misurata sull'osservatore invece che sull'oggetto non e' una
 *   durata. ⇒ Il tempo si misura DOVE succede — nel kernel, intorno
 *   all'esecuzione dell'attrezzo — e viaggia dentro l'evento.
 *
 * OSS-2 — `prova` non compariva affatto fra i processi, perche' i suoi
 *   `ToolCallArgs` sono `{}`: il comando eseguito non e' un argomento del
 *   modello, e' una impostazione della sessione (`comandoProva`). Chi guarda gli
 *   eventi non aveva modo di sapere CHE COSA e' stato eseguito e DOVE.
 *
 * ⛔ La forma dei campi non e' inventata qui: AG-UI dichiara «loose event format
 *   matching» e questo progetto estende gia' gli eventi standard nello stesso
 *   modo (`contesto` su RunStarted, `prima`/`allegato` su StateDelta, vedi
 *   `agui-events.mjs`). ⇒ Campi ADDITIVI e OMESSI quando assenti: un consumer
 *   che non li conosce vede l'oggetto identico a prima, byte per byte.
 *
 * ⛔⛔ E MAI ZERO AL POSTO DI «NON MISURATO». E' la stessa disciplina che il
 *   kernel applica gia' a `usage`/`totali` («mai un contatore che dice zero dove
 *   la verita' e' ignoto»): per gli attrezzi che non misuriamo il campo NON C'E'.
 *   Uno zero e' indistinguibile da «istantaneo», ed e' esattamente l'errore che
 *   OSS-1 descrive.
 */
import { strict as assert } from 'node:assert'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { eventoPerEsitoTool, toolCallResult, toolCallStart } from '../src/agui-events.mjs'
import { avviaSessione } from '../src/agent-service.mjs'
import { talosLavora } from '../src/kernel/talosHarness.mjs'
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs'

const enc = new TextEncoder()
const fintoBackend = (fotogrammi) => new Response(new ReadableStream({
    start(c) {
        for (const f of fotogrammi) c.enqueue(enc.encode(`data: ${JSON.stringify(f)}\n\n`))
        c.enqueue(enc.encode('data: [DONE]\n\n'))
        c.close()
    },
}))
const chiamata = (nome, argomenti = {}, id = `call_${nome}`) => () => fintoBackend([
    { choices: [{ delta: { tool_calls: [{ index: 0, id, function: { name: nome, arguments: JSON.stringify(argomenti) } }] } }] },
])
const testoFinale = () => fintoBackend([{ choices: [{ delta: { content: 'finito' } }] }])

async function giro(cartella, chiamate, opzioni = {}) {
    let n = 0
    const eventi = []
    await talosLavora({
        cartella, task: { consegna: 'lavora' }, modello: 'x', chiave: 'y',
        onDelta: (e) => eventi.push(e),
        onGiro: (e) => eventi.push(e),
        fetchDiRete: async () => (n < chiamate.length ? chiamate[n++]() : testoFinale()),
        ...opzioni,
    })
    return eventi
}

describe('OSS-1/OSS-2 — i campi nuovi dei due eventi di tool-call', () => {
    it('toolCallStart porta `avviatoA` solo quando c\'e\', e l\'oggetto di prima resta identico', () => {
        assert.deepEqual(
            toolCallStart({ toolCallId: 'c1', toolCallName: 'prova' }),
            { type: 'ToolCallStart', toolCallId: 'c1', toolCallName: 'prova' },
        )
        assert.deepEqual(
            toolCallStart({ toolCallId: 'c1', toolCallName: 'prova', avviatoA: 1_758_000_000_123 }),
            { type: 'ToolCallStart', toolCallId: 'c1', toolCallName: 'prova', avviatoA: 1_758_000_000_123 },
        )
    })

    it('⛔ `avviatoA` non entra se non e\' un numero finito: mai un `null` o un `NaN` travestito da ora', () => {
        for (const brutto of [null, undefined, Number.NaN, Infinity, '1758000000123']) {
            assert.deepEqual(
                toolCallStart({ toolCallId: 'c1', toolCallName: 'prova', avviatoA: brutto }),
                { type: 'ToolCallStart', toolCallId: 'c1', toolCallName: 'prova' },
                `avviatoA: ${String(brutto)} non e\' un'ora e non deve comparire`,
            )
        }
    })

    it('toolCallResult porta `durataMs`, `comando` e `cwd` solo quando ci sono', () => {
        assert.deepEqual(
            toolCallResult({ messageId: 'm1', toolCallId: 'c1', content: 'exit 0' }),
            { type: 'ToolCallResult', messageId: 'm1', toolCallId: 'c1', content: 'exit 0', role: 'tool' },
        )
        assert.deepEqual(
            toolCallResult({ messageId: 'm1', toolCallId: 'c1', content: 'exit 0', durataMs: 842, comando: 'npm test', cwd: 'C:\\p' }),
            { type: 'ToolCallResult', messageId: 'm1', toolCallId: 'c1', content: 'exit 0', role: 'tool', durataMs: 842, comando: 'npm test', cwd: 'C:\\p' },
        )
    })

    it('⛔ `durataMs` e\' un INTERO di millisecondi: un decimale si arrotonda, un non-numero sparisce', () => {
        assert.equal(toolCallResult({ messageId: 'm', toolCallId: 'c', content: 'x', durataMs: 12.7 }).durataMs, 13)
        for (const brutto of [null, Number.NaN, -1, 'presto']) {
            assert.equal('durataMs' in toolCallResult({ messageId: 'm', toolCallId: 'c', content: 'x', durataMs: brutto }), false,
                `durataMs: ${String(brutto)} non e\' una durata`)
        }
    })

    it('eventoPerEsitoTool inoltra i tre campi senza reinventarli', () => {
        assert.deepEqual(
            eventoPerEsitoTool({ messageId: 'm1', toolCallId: 'c1', content: 'exit 0\nok', durataMs: 5, comando: 'npm test', cwd: '/p' }),
            { type: 'ToolCallResult', messageId: 'm1', toolCallId: 'c1', content: 'exit 0\nok', role: 'tool', durataMs: 5, comando: 'npm test', cwd: '/p' },
        )
        assert.deepEqual(
            eventoPerEsitoTool({ messageId: 'm1', toolCallId: 'c1', content: 'exit 0\nok' }),
            { type: 'ToolCallResult', messageId: 'm1', toolCallId: 'c1', content: 'exit 0\nok', role: 'tool' },
        )
    })
})

describe('OSS-1/OSS-2 — il kernel misura e dichiara', () => {
    function cartellaTemporanea(t, { packageJson } = {}) {
        const cartella = mkdtempSync(join(tmpdir(), 'oss12-'))
        t.after(() => rimuoviCartellaDiProva(cartella))
        if (packageJson) writeFileSync(join(cartella, 'package.json'), JSON.stringify(packageJson))
        return cartella
    }

    it('⛔ Il verbale del PARSER resta quello di prima: `tool-inizio` non cambia forma', async (t) => {
        const cartella = cartellaTemporanea(t)
        const eventi = await giro(cartella, [chiamata('elenca')])
        const inizio = eventi.find((e) => e.tipo === 'tool-inizio')
        assert.deepEqual(inizio, { tipo: 'tool-inizio', giro: 0, indice: 0, toolCallId: 'call_elenca', nome: 'elenca' },
            'l\'ora si timbra dove nasce l\'evento AG-UI (agent-service.mjs), non qui: due prove del kernel confrontano questa forma per intero')
    })

    it('⭐⭐⭐ `prova` — `tool-esito` porta `durataMs`, `comando` e `cwd`', async (t) => {
        const cartella = cartellaTemporanea(t)
        const eventi = await giro(cartella, [chiamata('prova')], { comandoProva: 'node --version' })
        const esito = eventi.find((e) => e.tipo === 'tool-esito')
        assert.equal(Number.isInteger(esito.durataMs), true, `durataMs intero: ${esito.durataMs}`)
        assert.ok(esito.durataMs >= 0, 'una durata non e\' mai negativa')
        assert.equal(esito.comando, 'node --version', 'OSS-2: il comando eseguito non e\' negli argomenti del modello, quindi viaggia qui')
        assert.equal(esito.cwd, cartella, 'e la cartella in cui e\' girato')
    })

    it('⭐⭐⭐ `shell` — `tool-esito` porta `durataMs` e la cartella EFFETTIVA', async (t) => {
        const cartella = cartellaTemporanea(t)
        const eventi = await giro(cartella, [chiamata('shell', { comando: 'node --version' })], { permessi: { accessoPieno: true } })
        const esito = eventi.find((e) => e.tipo === 'tool-esito')
        assert.equal(Number.isInteger(esito.durataMs), true, `durataMs intero: ${esito.durataMs}`)
        /*
         * ⛔⛔ B2 (bocciatura del controllore, 17/09) — LA PRIMA VERSIONE DI QUESTA RIGA NON
         *   POTEVA SMENTIRE NIENTE: chiedeva solo che `cwd` fosse una stringa non vuota, e una
         *   stringa qualunque l'avrebbe superata. Si asserisce la FORMA attesa, misurata:
         *   sul ciclo degli attrezzi `tracciaCartella` resta false, quindi `p.cartellaFinale` e'
         *   sempre `null` e `cwd` esce nella forma della cartella RICHIESTA (qui: Windows).
         */
        assert.equal(esito.cwd, cartella, 'sul ciclo degli attrezzi la cartella effettiva non viene tracciata: `cwd` resta quella richiesta, nella sua forma nativa')
    })

    it('⛔⛔ UN ATTREZZO CHE NON MISURIAMO NON DICE ZERO: il campo NON C\'E\'', async (t) => {
        const cartella = cartellaTemporanea(t)
        const eventi = await giro(cartella, [chiamata('elenca')])
        const esito = eventi.find((e) => e.tipo === 'tool-esito')
        assert.equal('durataMs' in esito, false, 'uno zero qui direbbe «istantaneo», cioe\' una bugia misurabile')
        assert.equal('comando' in esito, false, '`elenca` non esegue nessun comando')
    })

    it('⛔ Una `prova` RIFIUTATA (nessuna suite) non inventa una durata: non ha eseguito niente', async (t) => {
        const cartella = cartellaTemporanea(t)
        const eventi = await giro(cartella, [chiamata('prova')])
        const esito = eventi.find((e) => e.tipo === 'tool-esito')
        assert.equal('durataMs' in esito, false, 'niente e\' girato: non c\'e\' nessun tempo da riportare')
        assert.equal(esito.comando, 'npm test', 'ma il comando che AVREBBE lanciato si dice lo stesso: e\' cio\' che spiega il rifiuto')
    })
})

describe('OSS-1/OSS-2 — la traduzione in eventi AG-UI porta i campi fino al client', () => {
    const TASK = { consegna: 'x' }

    it('⭐⭐⭐ ToolCallStart e ToolCallResult arrivano col tempo dentro', async () => {
        const eventi = []
        const prima = Date.now()
        await avviaSessione({
            cartella: '/tmp/x', task: TASK, modello: 'm', chiave: 'k',
            onEvento: (e) => eventi.push(e),
            talosLavoraFn: async (input) => {
                input.onDelta?.({ tipo: 'tool-inizio', indice: 0, giro: 0, toolCallId: 'c1', nome: 'prova', avviatoA: 1_758_000_000_123 })
                input.onGiro?.({ tipo: 'risposta', giro: 0, risposta: { role: 'assistant', content: '', tool_calls: [] } })
                input.onGiro?.({ tipo: 'tool-esito', giro: 0, toolCallId: 'c1', content: 'exit 0\nok', durataMs: 842, comando: 'npm test', cwd: 'C:\\p' })
                return { comeFinita: 'concluso', messaggiFinali: [] }
            },
        })
        const start = eventi.find((e) => e.type === 'ToolCallStart')
        assert.equal(start.avviatoA, 1_758_000_000_123)
        const risultato = eventi.find((e) => e.type === 'ToolCallResult')
        assert.equal(risultato.durataMs, 842)
        assert.equal(risultato.comando, 'npm test')
        assert.equal(risultato.cwd, 'C:\\p')
    })

    it('⛔ Senza misure dal kernel, il RISULTATO resta quello di prima — ma lo START porta comunque l\'ora del server', async () => {
        const eventi = []
        const prima = Date.now()
        await avviaSessione({
            cartella: '/tmp/x', task: TASK, modello: 'm', chiave: 'k',
            onEvento: (e) => eventi.push(e),
            talosLavoraFn: async (input) => {
                input.onDelta?.({ tipo: 'tool-inizio', indice: 0, giro: 0, toolCallId: 'c1', nome: 'elenca' })
                input.onGiro?.({ tipo: 'risposta', giro: 0, risposta: { role: 'assistant', content: '', tool_calls: [] } })
                input.onGiro?.({ tipo: 'tool-esito', giro: 0, toolCallId: 'c1', content: 'ok' })
                return { comeFinita: 'concluso', messaggiFinali: [] }
            },
        })
        const start = eventi.find((e) => e.type === 'ToolCallStart')
        assert.deepEqual(start, { type: 'ToolCallStart', toolCallId: 'c1', toolCallName: 'elenca', avviatoA: start.avviatoA })
        assert.ok(start.avviatoA >= prima && start.avviatoA <= Date.now(), 'l\'ora la mette il server, sempre: e\' il timbro che il replay non puo\' ricostruire')
        const risultato = eventi.find((e) => e.type === 'ToolCallResult')
        assert.deepEqual(risultato, { type: 'ToolCallResult', messageId: risultato.messageId, toolCallId: 'c1', content: 'ok', role: 'tool' },
            'nessuna chiave fantasma: un attrezzo non misurato non dice ne 0 ne null')
    })
})
