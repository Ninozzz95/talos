import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick } from 'vue'
import { useConversazioneR4 } from '@/composables/useConversazioneR4'
import type { TalosR4ClientePonte } from '@/lib/harness/r4/clienteR4'
import { fraseErroreR4 } from '@/lib/harness/r4/fraseErroreR4'

/**
 * ⛔ Difetto dal vivo (owner 27/10/2026, Server-PC, OnePlus13): sul PC il giro è finito in errore e il PC è fermo; DENTRO la sessione
 * il dispositivo resta «al lavoro». La logica del giro è giusta (USR4-33..35, ALD-01..04, verdi anche su v0.1.46): il buco è il
 * trasporto. L'iscrizione remota `session.events` (`operazioni.mjs:377`) non aveva battito e il dispositivo non aveva un guardiano:
 * un flusso rimasto aperto ma muto non chiudeva mai il giro. Cura concordata col Desktop:
 *   · (a) il PC manda `CUSTOM talos.battito` ogni 15 s su ogni iscrizione viva (senza `_sequenza`);
 *   · (b) qui: a giro vivo, 40 s senza niente dal flusso ⇒ se il flusso ha già portato un battito è morto e si riapre da
 *     `ultimaSequenza` (la rigiocata porta la fine); se non ne ha mai portato (un PC di prima) si chiede la riga a
 *     `GET /api/v1/sessions` e si riapre solo se il PC la dice conclusa. A giro fermo, mai.
 */
type Ascoltatore = (dati: Record<string, unknown>) => void
/** La riga della sessione nell'elenco del PC: `true`/`false` = conclusa o no; un oggetto = i campi; `null` = assente; `'appeso'` = il PC non risponde. */
type RigaFinta = boolean | null | 'appeso' | { conclusa?: boolean; interrotta?: boolean }
function clienteFinto(riga: () => RigaFinta = () => null, invioRifiutato = false, opzioni: { flussoGuasto?: () => boolean } = {}) {
    const ascoltatori: Record<string, Ascoltatore[]> = {}
    const flussi: { id: string; percorso: string }[] = []
    const chiusi: string[] = []
    const elenchi: number[] = []
    const richieste: { metodo: string; percorso: string; corpo?: string }[] = []
    const ponte: TalosR4ClientePonte = {
        richiesta: async (r) => {
            richieste.push({ metodo: r.metodo, percorso: r.percorso, ...(r.corpo ? { corpo: r.corpo } : {}) })
            if (r.metodo === 'GET' && r.percorso === '/api/v1/sessions') {
                elenchi.push(Date.now())
                const v = riga()
                if (v === 'appeso') return new Promise(() => {})
                const campi = v === null ? null : typeof v === 'boolean' ? { conclusa: v, interrotta: false } : v
                const items = campi === null ? [] : [{ sessionId: 's1', nome: 'Sessione', ...campi }]
                return { stato: 200, corpo: JSON.stringify({ ok: true, data: { items } }) }
            }
            if (invioRifiutato && r.percorso.endsWith('/resume')) {
                return { stato: 503, corpo: JSON.stringify({ ok: false, error: { code: 'REMOTE_UNAVAILABLE', message: 'The computer is not reachable right now.' } }) }
            }
            return { stato: 200, corpo: '{"ok":true,"data":{}}' }
        },
        apriFlusso: async (f) => {
            flussi.push(f)
            if (opzioni.flussoGuasto?.()) throw new Error('DISCONNECTED')
        },
        chiudiFlusso: async ({ id }) => { chiusi.push(id) },
        addListener: async (evento, ascoltatore) => {
            ;(ascoltatori[evento] ??= []).push(ascoltatore)
            return { remove: async () => { ascoltatori[evento] = (ascoltatori[evento] ?? []).filter((a) => a !== ascoltatore) } }
        },
    }
    const pezzoA = (id: string, testo: string) => { for (const a of [...(ascoltatori['r4Pezzo'] ?? [])]) a({ id, testo }) }
    const pezzo = (testo: string) => pezzoA(flussi.at(-1)!.id, testo)
    const errore = (motivo: string) => { for (const a of [...(ascoltatori['r4Errore'] ?? [])]) a({ id: flussi.at(-1)!.id, motivo }) }
    return { ponte, pezzo, pezzoA, errore, flussi, chiusi, elenchi, richieste }
}
let scope = effectScope()
beforeEach(() => { vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] }) })
afterEach(() => { scope.stop(); scope = effectScope(); vi.useRealTimers() })
const monta = (opzioni: Parameters<typeof useConversazioneR4>[0]) => scope.run(() => useConversazioneR4(opzioni))!
const aspetta = async () => {
    for (let i = 0; i < 6; i++) {
        await new Promise((fatto) => setTimeout(fatto, 0))
        await nextTick()
    }
}
const passano = async (ms: number) => {
    for (let fatti = 0; fatti < ms; fatti += 5000) {
        vi.advanceTimersByTime(5000)
        await aspetta()
    }
}

const sse = (evento: Record<string, unknown>) => `data: ${JSON.stringify(evento)}\n\n`
const fineStoria = sse({ type: 'CUSTOM', name: 'talos.fine-rigiocata', value: {} })
const avvio = sse({ type: 'RunStarted', threadId: 't1', runId: 'r1', input: { consegna: 'Ciao' }, _sequenza: 5 })
const parla = sse({ type: 'TextMessageStart', messageId: 'm1', role: 'assistant', _sequenza: 6 })
const battito = sse({ type: 'CUSTOM', name: 'talos.battito', value: {} })
const guasto = sse({ type: 'RunError', message: 'The ChatGPT plan did not complete the answer.', code: 'CHATGPT_ERRORE', _sequenza: 7 })

async function aGiroVivo(c: ReturnType<typeof clienteFinto>) {
    const conv = monta({ cliente: c.ponte, cartella: '/w', sessioneId: 's1', attesaRiapertura: () => 0 })
    await conv.apri()
    c.pezzo(fineStoria + avvio + parla)
    await aspetta()
    expect(conv.sorgente.sending.value).toBe(true)
    return conv
}

describe('il guardiano del flusso a giro vivo', () => {
    it('GFR-01 ⛔ un PC che manda il battito e poi tace 40 s: il flusso si riapre da `ultimaSequenza` e la fine arriva', async () => {
        const c = clienteFinto()
        const conv = await aGiroVivo(c)
        c.pezzo(battito)
        await aspetta()
        await passano(35_000)
        expect(c.flussi).toHaveLength(1)
        await passano(10_000)
        expect(c.chiusi).toEqual([c.flussi[0]!.id])
        expect(c.flussi).toHaveLength(2)
        expect(c.flussi[1]!.percorso).toBe('/api/v1/sessions/s1/events?after=6')
        // la rigiocata dal 6 porta la fine che il flusso morto aveva perso
        c.pezzo(guasto + fineStoria)
        await aspetta()
        expect(conv.sorgente.sending.value).toBe(false)
    })

    it('GFR-02 ⛔ un PC di prima (mai un battito), 40 s muti, e la riga del PC dice conclusa: si riapre', async () => {
        const c = clienteFinto(() => true)
        const conv = await aGiroVivo(c)
        await passano(45_000)
        expect(c.elenchi.length).toBeGreaterThan(0)
        expect(c.flussi).toHaveLength(2)
        expect(c.flussi[1]!.percorso).toBe('/api/v1/sessions/s1/events?after=6')
        c.pezzo(guasto + fineStoria)
        await aspetta()
        expect(conv.sorgente.sending.value).toBe(false)
    })

    it('GFR-03 un PC di prima con il giro ancora vivo (un comando lungo): nessuna riapertura, si richiede solo ogni 40 s', async () => {
        const c = clienteFinto(() => false)
        const conv = await aGiroVivo(c)
        const letture = c.elenchi.length
        await passano(45_000)
        expect(c.flussi).toHaveLength(1)
        expect(c.elenchi.length).toBe(letture + 1)
        await passano(20_000)
        expect(c.elenchi.length).toBe(letture + 1)
        expect(conv.sorgente.sending.value).toBe(true)
    })

    // dopo la revisione avversaria (RG-02): oltre 120 s senza una sequenza nuova si guarda la riga anche col battito; col giro vivo sul PC
    // non si riapre e la riga si legge al più una volta in 2 minuti
    it('GFR-04 col battito ogni 15 s e il giro vivo sul PC: niente riapertura, al più una lettura della riga in 2 minuti', async () => {
        const c = clienteFinto(() => false)
        const conv = await aGiroVivo(c)
        const letture = c.elenchi.length
        for (let i = 0; i < 8; i++) {
            await passano(15_000)
            c.pezzo(battito)
            await aspetta()
        }
        expect(c.flussi).toHaveLength(1)
        expect(c.elenchi.length - letture).toBeLessThanOrEqual(1)
        expect(conv.sorgente.sending.value).toBe(true)
    })

    it('GFR-06 una riapertura di troppo (ritorno dal sottofondo) non fa danni: i pezzi del flusso vecchio si ignorano, la rigiocata non raddoppia', async () => {
        const c = clienteFinto()
        const conv = await aGiroVivo(c)
        c.pezzo(battito)
        await aspetta()
        await passano(45_000)
        expect(c.flussi).toHaveLength(2)
        const vecchio = c.flussi[0]!.id
        // Android ritardava il timer: i pezzi in coda del flusso vecchio arrivano DOPO la riapertura
        c.pezzoA(vecchio, sse({ type: 'TextMessageContent', messageId: 'm1', delta: 'dal flusso vecchio', _sequenza: 7 }))
        await aspetta()
        expect(conv.sorgente.testo.value).toBe('')
        expect(conv.ultimaSequenza.value).toBe(6)
        // la rigiocata riparte DOPO il 6 (`?after=6`): l'evento 7 perso dal flusso vecchio arriva una volta sola, poi la fine
        expect(c.flussi[1]!.percorso).toBe('/api/v1/sessions/s1/events?after=6')
        c.pezzo(sse({ type: 'TextMessageContent', messageId: 'm1', delta: 'Una volta', _sequenza: 7 }) + guasto + fineStoria)
        await aspetta()
        const risposte = conv.messaggi.value.filter((m) => m.role === 'assistant')
        expect(risposte.map((m) => m.content)).toEqual(['Una volta'])
        expect(conv.sorgente.sending.value).toBe(false)
    })

    /*
     * ⛔ Prova dal vivo sulla 4177 (27/10/2026, 20:06, vc319, `TALOS_PROVA_ISCRIZIONE_MUTA`): il flusso è diventato muto PROPRIO dal
     * RunStarted del messaggio mandato dal dispositivo. `inviando` restava vero, `inCorso` nullo: il guardiano guardava solo `inCorso`
     * e non scattava mai, mentre il pulsante (inviando || inCorso) restava «Interrompi risposta», senza la bolla della persona.
     * Il caso «Continua» dal OnePlus dell'owner. Il guardiano usa la stessa regola del pulsante.
     */
    it('GFR-07 ⛔ messaggio mandato dal dispositivo e il RunStarted non arriva mai: dopo 40 s si riapre e il giro si chiude', async () => {
        const c = clienteFinto()
        const conv = monta({ cliente: c.ponte, cartella: '/w', sessioneId: 's1', attesaRiapertura: () => 0 })
        await conv.apri()
        c.pezzo(fineStoria + sse({ type: 'RunFinished', threadId: 't0', runId: 'r0', result: {}, _sequenza: 4 }) + battito)
        await aspetta()
        expect(await conv.invia('Leggi i file e riassumi')).toBe(true)
        expect(conv.sorgente.sending.value).toBe(true)
        await passano(45_000)
        expect(c.flussi).toHaveLength(2)
        expect(c.flussi[1]!.percorso).toBe('/api/v1/sessions/s1/events?after=4')
        c.pezzo(sse({ type: 'RunStarted', threadId: 't1', runId: 'r1', input: { consegna: 'Leggi i file e riassumi', seguito: true }, _sequenza: 5 })
            + sse({ type: 'RunFinished', threadId: 't1', runId: 'r1', result: { detto: 'Fatto.' }, _sequenza: 6 }) + fineStoria)
        await aspetta()
        expect(conv.sorgente.sending.value).toBe(false)
        expect(conv.messaggi.value.some((m) => m.role === 'user' && m.content === 'Leggi i file e riassumi')).toBe(true)
    })

    it('GFR-08 ⛔ lo stesso su un PC di prima (mai un battito): la riga dice conclusa, si riapre', async () => {
        const c = clienteFinto(() => true)
        const conv = monta({ cliente: c.ponte, cartella: '/w', sessioneId: 's1', attesaRiapertura: () => 0 })
        await conv.apri()
        c.pezzo(fineStoria)
        await aspetta()
        expect(await conv.invia('Continua')).toBe(true)
        await passano(45_000)
        expect(c.flussi).toHaveLength(2)
        c.pezzo(sse({ type: 'RunStarted', threadId: 't1', runId: 'r1', input: { consegna: 'Continua', seguito: true }, _sequenza: 1 })
            + sse({ type: 'RunError', message: 'The ChatGPT plan did not complete the answer.', code: 'CHATGPT_ERRORE', _sequenza: 2 }) + fineStoria)
        await aspetta()
        expect(conv.sorgente.sending.value).toBe(false)
    })

    it('GFR-09 un invio RIFIUTATO dal PC (prima di ogni flusso): fermo da solo, e il guardiano non riapre niente', async () => {
        const c = clienteFinto(() => true, true)
        const conv = monta({ cliente: c.ponte, cartella: '/w', sessioneId: 's1', attesaRiapertura: () => 0 })
        await conv.apri()
        c.pezzo(fineStoria + battito)
        await aspetta()
        expect(await conv.invia('Continua')).toBe(false)
        expect(conv.sorgente.sending.value).toBe(false)
        expect(conv.errore.value?.code).toBe('REMOTE_UNAVAILABLE')
        const letture = c.elenchi.length
        await passano(180_000)
        expect(c.flussi).toHaveLength(1)
        expect(c.elenchi.length).toBe(letture)
    })

    /*
     * Desktop 27/10: un tetto. Un PC che dopo la riapertura resta muto (né eventi né battito) non va riaperto per sempre: al più 3
     * riaperture del guardiano senza una sequenza nuova, poi ci si ferma e lo si dice con la frase del PC (`OPERATION_FAILED.timeout`).
     */
    it('GFR-10 ⛔ al più 3 riaperture senza una sequenza nuova, poi fermo con «Il computer non ha risposto in tempo.»', async () => {
        const c = clienteFinto()
        const conv = monta({ cliente: c.ponte, cartella: '/w', sessioneId: 's1', attesaRiapertura: () => 0 })
        await conv.apri()
        c.pezzo(fineStoria + battito)
        await aspetta()
        expect(await conv.invia('Continua')).toBe(true)
        await passano(200_000)
        expect(c.flussi).toHaveLength(4)
        expect(conv.sorgente.sending.value).toBe(false)
        expect(conv.errore.value).toMatchObject({ code: 'OPERATION_FAILED', reason: 'timeout', message: 'The computer did not answer in time.' })
        expect(fraseErroreR4(conv.errore.value, 'it')).toBe('Il computer non ha risposto in tempo.')
        await passano(120_000)
        expect(c.flussi).toHaveLength(4)
    })

    it('GFR-11 una sequenza nuova dopo una riapertura azzera il conto: il tetto vale per i silenzi di fila', async () => {
        const c = clienteFinto()
        const conv = monta({ cliente: c.ponte, cartella: '/w', sessioneId: 's1', attesaRiapertura: () => 0 })
        await conv.apri()
        c.pezzo(fineStoria + battito)
        await aspetta()
        expect(await conv.invia('Continua')).toBe(true)
        await passano(90_000)
        expect(c.flussi.length).toBe(3)
        // la terza apertura porta l'avvio del giro: il conto riparte da zero
        c.pezzo(sse({ type: 'RunStarted', threadId: 't1', runId: 'r1', input: { consegna: 'Continua', seguito: true }, _sequenza: 1 }))
        await aspetta()
        await passano(130_000)
        expect(c.flussi.length).toBe(6)
        expect(conv.errore.value).toBeNull()
        expect(conv.sorgente.sending.value).toBe(true)
    })

    /*
     * Desktop 27/10 (GFR-12): dopo il tetto lo schermo NON deve sembrare al lavoro — è proprio la lamentela dell'owner. Il giro visto
     * (`inCorso`) resta dentro, non si inventa una fine; il flag `collegamentoPerso` spegne `sending` (niente rotellina, niente ferma,
     * compositore libero); un messaggio scritto va al PC per la via normale; il primo evento vero riporta lo stato normale.
     */
    async function alTetto(c: ReturnType<typeof clienteFinto>) {
        const conv = monta({ cliente: c.ponte, cartella: '/w', sessioneId: 's1', attesaRiapertura: () => 0 })
        await conv.apri()
        c.pezzo(fineStoria + battito)
        await aspetta()
        expect(await conv.invia('Continua')).toBe(true)
        c.pezzo(sse({ type: 'RunStarted', threadId: 't1', runId: 'r1', input: { consegna: 'Continua', seguito: true }, _sequenza: 1 }))
        await aspetta()
        expect(conv.inCorso.value).not.toBeNull()
        await passano(200_000)
        expect(c.flussi).toHaveLength(4)
        return conv
    }

    it('GFR-12 ⛔ al tetto col giro visto: niente «al lavoro», l’errore e il collegamento perso; un evento vero riporta lo stato normale', async () => {
        const c = clienteFinto()
        const conv = await alTetto(c)
        expect(conv.collegamentoPerso.value).toBe(true)
        expect(conv.sorgente.sending.value).toBe(false)
        expect(conv.inCorso.value).not.toBeNull()
        expect(conv.errore.value).toMatchObject({ code: 'OPERATION_FAILED', reason: 'timeout' })
        // un evento vero, con una sequenza nuova: il collegamento c'è, lo stato torna quello del giro
        c.pezzo(sse({ type: 'TextMessageStart', messageId: 'm1', role: 'assistant', _sequenza: 2 }))
        await aspetta()
        expect(conv.collegamentoPerso.value).toBe(false)
        expect(conv.sorgente.sending.value).toBe(true)
    })

    it('GFR-12b ⛔ col collegamento perso un messaggio scritto arriva al PC per la via normale, non sparisce', async () => {
        const c = clienteFinto()
        const conv = await alTetto(c)
        const prima = c.richieste.length
        expect(await conv.invia('Sei ancora lì?')).toBe(true)
        const nuove = c.richieste.slice(prima)
        expect(nuove).toContainEqual({ metodo: 'POST', percorso: '/api/v1/sessions/s1/resume', corpo: expect.stringContaining('Sei ancora lì?') })
    })

    it('GFR-12c «Riconnetti»: errore via, conto a zero, si riapre dallo stesso punto', async () => {
        const c = clienteFinto()
        const conv = await alTetto(c)
        await conv.riconnetti()
        await aspetta()
        expect(conv.errore.value).toBeNull()
        expect(conv.collegamentoPerso.value).toBe(false)
        expect(c.flussi).toHaveLength(5)
        expect(c.flussi[4]!.percorso).toBe('/api/v1/sessions/s1/events?after=1')
        // e il guardiano riparte con un conto nuovo: altre 3 riaperture prima di arrendersi di nuovo
        await passano(130_000)
        expect(c.flussi).toHaveLength(8)
    })

    it('GFR-05 a giro fermo il guardiano non fa niente, anche dopo minuti di silenzio', async () => {
        const c = clienteFinto(() => true)
        const conv = monta({ cliente: c.ponte, cartella: '/w', sessioneId: 's1', attesaRiapertura: () => 0 })
        await conv.apri()
        c.pezzo(fineStoria)
        await aspetta()
        const letture = c.elenchi.length
        await passano(180_000)
        expect(c.flussi).toHaveLength(1)
        expect(c.elenchi.length).toBe(letture)
    })
})

/*
 * ⛔ Revisione avversaria del guardiano (agente, 27/10/2026 sera): due blocchi e cinque correzioni, ognuna col suo test rosso.
 *   · RG-01/03 (blocco): un PC riavviato a metà giro non scrive una fine (`session-registry.mjs:549,567-569`: senza terminale e non
 *     viva = interrotta). RG-02: il battito prova l'iscrizione del PONTE, non la fonte degli eventi: se quella si perde il battito
 *     continua e il guardiano non scattava. Regola: a giro vivo, 120 s senza una sequenza nuova (anche col battito) ⇒ la riga del PC;
 *     conclusa o interrotta ⇒ si riapre una volta, e se la rigiocata non porta niente ci si arrende subito.
 *   · RG-04 404 · RG-05 invio fallito dopo la resa · RG-06 trasporto che cade subito · RG-07 controllo della riga appeso ·
 *     RG-08 il battito dopo una resa per silenzio · RG-09 l'invio rinfresca l'orologio del guardiano.
 */
describe('il guardiano dopo la revisione avversaria', () => {
    const avvio = (n: number) => sse({ type: 'RunStarted', threadId: 't1', runId: 'r1', input: { consegna: 'Continua', seguito: true }, _sequenza: n })
    const attrezzo = (n: number) => sse({ type: 'ToolCallStart', toolCallId: 'c1', toolCallName: 'shell', _sequenza: n })
    /** `ms` di tempo con un battito ogni 15 s sul flusso di adesso. */
    const conBattito = async (c: ReturnType<typeof clienteFinto>, ms: number) => {
        for (let fatti = 0; fatti < ms; fatti += 15_000) {
            await passano(15_000)
            c.pezzo(battito)
            await aspetta()
        }
    }
    async function giroVisto(c: ReturnType<typeof clienteFinto>, conBattitoIniziale = true) {
        const conv = monta({ cliente: c.ponte, cartella: '/w', sessioneId: 's1', attesaRiapertura: () => 0 })
        await conv.apri()
        c.pezzo(fineStoria + (conBattitoIniziale ? battito : '') + avvio(1) + attrezzo(2))
        await aspetta()
        expect(conv.sorgente.sending.value).toBe(true)
        return conv
    }

    it('RG-01 ⛔ PC riavviato a metà giro (riga interrotta), il battito continua: una riapertura, poi la resa, mai «al lavoro» per sempre', async () => {
        const c = clienteFinto(() => ({ conclusa: false, interrotta: true }))
        const conv = await giroVisto(c)
        await conBattito(c, 135_000)
        expect(c.flussi).toHaveLength(2)
        expect(c.flussi[1]!.percorso).toBe('/api/v1/sessions/s1/events?after=2')
        await conBattito(c, 135_000)
        expect(conv.collegamentoPerso.value).toBe(true)
        expect(conv.sorgente.sending.value).toBe(false)
        expect(conv.errore.value).toMatchObject({ code: 'OPERATION_FAILED', reason: 'timeout' })
    })

    it('RG-02 ⛔ la fonte degli eventi persa e il battito che arriva lo stesso, col giro concluso sul PC: si riapre e la fine arriva', async () => {
        const c = clienteFinto(() => true)
        const conv = await giroVisto(c)
        await conBattito(c, 135_000)
        expect(c.flussi).toHaveLength(2)
        c.pezzo(sse({ type: 'RunFinished', threadId: 't1', runId: 'r1', result: {}, _sequenza: 3 }) + fineStoria)
        await aspetta()
        expect(conv.sorgente.sending.value).toBe(false)
        expect(conv.collegamentoPerso.value).toBe(false)
    })

    it('RG-02b un comando lungo e muto su un PC vivo (riga né conclusa né interrotta): mai riaperture, mai resa, la riga ogni ~120 s', async () => {
        const c = clienteFinto(() => ({ conclusa: false, interrotta: false }))
        const conv = await giroVisto(c)
        const letture = c.elenchi.length
        await conBattito(c, 300_000)
        expect(c.flussi).toHaveLength(1)
        expect(conv.sorgente.sending.value).toBe(true)
        expect(c.elenchi.length - letture).toBeGreaterThanOrEqual(2)
        expect(c.elenchi.length - letture).toBeLessThanOrEqual(3)
    })

    it('RG-03 ⛔ PC di prima (mai un battito) riavviato a metà giro: la riga interrotta basta per riaprire e poi arrendersi', async () => {
        const c = clienteFinto(() => ({ conclusa: false, interrotta: true }))
        const conv = await giroVisto(c, false)
        await passano(45_000)
        expect(c.flussi).toHaveLength(2)
        await passano(45_000)
        expect(conv.collegamentoPerso.value).toBe(true)
        expect(conv.sorgente.sending.value).toBe(false)
    })

    it('RG-04 la sessione sparita sul PC (404) a giro visto: niente rotellina accanto a «la sessione non esiste più»', async () => {
        const c = clienteFinto()
        const conv = await giroVisto(c)
        c.errore('HTTP 404')
        await aspetta()
        expect(conv.errore.value).toMatchObject({ code: 'NOT_FOUND', reason: 'session-not-found' })
        expect(conv.sorgente.sending.value).toBe(false)
    })

    it('RG-05 dopo la resa, un invio che il PC non riceve (REMOTE_UNAVAILABLE) non riporta «al lavoro»', async () => {
        let rifiuta = false
        const c = clienteFinto()
        const originale = c.ponte.richiesta
        c.ponte.richiesta = async (r) => (rifiuta && r.percorso.endsWith('/resume')
            ? { stato: 503, corpo: JSON.stringify({ ok: false, error: { code: 'REMOTE_UNAVAILABLE', message: 'The computer is not reachable right now.' } }) }
            : originale(r))
        const conv = await giroVisto(c)
        await passano(200_000)
        expect(conv.collegamentoPerso.value).toBe(true)
        rifiuta = true
        expect(await conv.invia('Ci sei?')).toBe(false)
        await aspetta()
        expect(conv.collegamentoPerso.value).toBe(true)
        expect(conv.sorgente.sending.value).toBe(false)
        expect(conv.errore.value?.code).toBe('REMOTE_UNAVAILABLE')
    })

    it('RG-06 ⛔ un trasporto che cade subito a ogni apertura (PC spento): al più 6 cadute di fila, poi la resa', async () => {
        let guasto = false
        const c = clienteFinto(() => null, false, { flussoGuasto: () => guasto })
        const conv = await giroVisto(c)
        guasto = true
        c.errore('DISCONNECTED')
        await passano(60_000)
        expect(conv.collegamentoPerso.value).toBe(true)
        expect(conv.sorgente.sending.value).toBe(false)
    })

    it('RG-07 il controllo della riga che non torna mai (ponte mezzo morto) non spegne il guardiano: scade e conta, poi la resa', async () => {
        const c = clienteFinto(() => 'appeso')
        const conv = await giroVisto(c, false)
        await passano(400_000)
        expect(conv.collegamentoPerso.value).toBe(true)
        expect(conv.sorgente.sending.value).toBe(false)
    })

    it('RG-08 dopo una resa per silenzio, un battito sul flusso di adesso riporta lo stato normale (il giro gira davvero)', async () => {
        const c = clienteFinto()
        const conv = await giroVisto(c)
        await passano(200_000)
        expect(conv.collegamentoPerso.value).toBe(true)
        c.pezzo(battito)
        await aspetta()
        expect(conv.collegamentoPerso.value).toBe(false)
        expect(conv.sorgente.sending.value).toBe(true)
    })

    it('RG-09 l’invio rinfresca l’orologio del guardiano: un PC di prima fermo da minuti non riapre subito dopo l’invio', async () => {
        const c = clienteFinto(() => true)
        const conv = monta({ cliente: c.ponte, cartella: '/w', sessioneId: 's1', attesaRiapertura: () => 0 })
        await conv.apri()
        c.pezzo(fineStoria)
        await aspetta()
        await passano(300_000)
        expect(await conv.invia('Continua')).toBe(true)
        await passano(15_000)
        expect(c.flussi).toHaveLength(1)
    })
})

/*
 * ⛔ Il battito con lo stato della fonte (Desktop 27/10 sera, r4 `fix/battito-con-stato`): a ogni battito il PC legge dal registro
 * `value: { ultimaSequenza, lavora }` (`lavora` = né conclusa né interrotta, gli stessi campi della riga dell'elenco). Regole:
 *   (1) due battiti DI FILA con una `ultimaSequenza` più avanti della mia ⇒ il flusso ha perso eventi: si riapre subito da `after`;
 *   (2) `lavora:false` a giro VISTO (non a messaggio appena mandato: il giro nuovo può non essere ancora partito), senza fine dopo una
 *       riapertura ⇒ il giro sul PC è finito o interrotto: niente «al lavoro», la frase del PC «sessione interrotta» (non l'errore di
 *       collegamento, e niente «Riconnetti»);
 *   (3) un battito senza quei campi è un PC di prima: valgono le regole di prima (RG-01..09).
 */
describe('il battito con lo stato della fonte', () => {
    const battitoCon = (ultimaSequenza: number, lavora: boolean) => sse({ type: 'CUSTOM', name: 'talos.battito', value: { ultimaSequenza, lavora } })
    async function giroVisto(c: ReturnType<typeof clienteFinto>) {
        const conv = monta({ cliente: c.ponte, cartella: '/w', sessioneId: 's1', attesaRiapertura: () => 0 })
        await conv.apri()
        c.pezzo(fineStoria + battitoCon(0, false) + sse({ type: 'RunStarted', threadId: 't1', runId: 'r1', input: { consegna: 'Continua', seguito: true }, _sequenza: 1 })
            + sse({ type: 'ToolCallStart', toolCallId: 'c1', toolCallName: 'shell', _sequenza: 2 }))
        await aspetta()
        return conv
    }

    it('BST-01 ⛔ due battiti di fila col PC più avanti: si riapre SUBITO da `after`, senza aspettare 40 s', async () => {
        const c = clienteFinto()
        await giroVisto(c)
        c.pezzo(battitoCon(5, true))
        await aspetta()
        expect(c.flussi).toHaveLength(1)
        c.pezzo(battitoCon(5, true))
        await aspetta()
        expect(c.flussi).toHaveLength(2)
        expect(c.flussi[1]!.percorso).toBe('/api/v1/sessions/s1/events?after=2')
    })

    it('BST-02 un battito solo più avanti (un evento in volo) e poi la sequenza arriva: niente riapertura', async () => {
        const c = clienteFinto()
        await giroVisto(c)
        c.pezzo(battitoCon(3, true))
        c.pezzo(sse({ type: 'ToolCallEnd', toolCallId: 'c1', _sequenza: 3 }))
        c.pezzo(battitoCon(3, true))
        await aspetta()
        expect(c.flussi).toHaveLength(1)
    })

    it('BST-03 ⛔ il PC dice `lavora:false` a giro visto e la rigiocata non porta una fine: sessione interrotta, niente «al lavoro», niente «Riconnetti»', async () => {
        const c = clienteFinto()
        const conv = await giroVisto(c)
        c.pezzo(battitoCon(2, false))
        await aspetta()
        expect(c.flussi).toHaveLength(2)
        c.pezzo(fineStoria + battitoCon(2, false))
        await aspetta()
        expect(conv.sorgente.sending.value).toBe(false)
        expect(conv.errore.value).toMatchObject({ code: 'SESSION_NOT_READY', reason: 'interrupted-write-message' })
        expect(fraseErroreR4(conv.errore.value, 'it')).toBe('Questa sessione è stata interrotta: scrivi un nuovo messaggio per riprenderla in sicurezza.')
        expect(conv.riconnettibile.value).toBe(false)
        // un messaggio nuovo va al PC per la via normale
        expect(await conv.invia('Riprendi da dove eri')).toBe(true)
        expect(c.richieste.some((r) => r.percorso === '/api/v1/sessions/s1/resume')).toBe(true)
    })

    it('BST-03b la rigiocata dopo la riapertura porta la fine vera: nessun errore, il giro si chiude come sul PC', async () => {
        const c = clienteFinto()
        const conv = await giroVisto(c)
        c.pezzo(battitoCon(2, false))
        await aspetta()
        c.pezzo(sse({ type: 'RunError', message: 'The ChatGPT plan did not complete the answer.', code: 'CHATGPT_ERRORE', _sequenza: 3 }) + fineStoria)
        await aspetta()
        expect(conv.sorgente.sending.value).toBe(false)
        expect(conv.errore.value?.code).not.toBe('SESSION_NOT_READY')
        expect(conv.collegamentoPerso.value).toBe(false)
    })

    it('BST-04 messaggio appena mandato e il giro non ancora partito sul PC (`lavora:false`, stessa sequenza): la regola (2) non scatta', async () => {
        const c = clienteFinto()
        const conv = monta({ cliente: c.ponte, cartella: '/w', sessioneId: 's1', attesaRiapertura: () => 0 })
        await conv.apri()
        // la storia finisce al 4 (il giro di prima concluso): il battito dice lo stesso punto
        c.pezzo(sse({ type: 'RunFinished', threadId: 't0', runId: 'r0', result: {}, _sequenza: 4 }) + fineStoria + battitoCon(4, false))
        await aspetta()
        expect(await conv.invia('Continua')).toBe(true)
        c.pezzo(battitoCon(4, false))
        c.pezzo(battitoCon(4, false))
        await aspetta()
        expect(c.flussi).toHaveLength(1)
        expect(conv.sorgente.sending.value).toBe(true)
        expect(conv.errore.value).toBeNull()
    })

    it('BST-05 dopo «interrotta», il giro nuovo che parte riporta tutto normale', async () => {
        const c = clienteFinto()
        const conv = await giroVisto(c)
        c.pezzo(battitoCon(2, false))
        await aspetta()
        c.pezzo(fineStoria + battitoCon(2, false))
        await aspetta()
        expect(conv.errore.value?.code).toBe('SESSION_NOT_READY')
        expect(await conv.invia('Riprendi')).toBe(true)
        c.pezzo(sse({ type: 'RunStarted', threadId: 't1', runId: 'r2', input: { consegna: 'Riprendi', seguito: true }, _sequenza: 3 }))
        await aspetta()
        expect(conv.errore.value).toBeNull()
        expect(conv.sorgente.sending.value).toBe(true)
    })
})

/**
 * RICOLL-01..06 — R3 delle righe in corso (owner 27/10/2026 «nulla deve fare sembrare la ui bloccata»; bozzetto approvato il 28/10,
 * scena 9a/9b «Linea caduta»): oggi, a giro vivo, il flusso che cade e si riapre non si vede, e l'orb continua come se lavorasse.
 * Ora la conversazione espone `ricollegamento` ({ tentativo, dal }: l'ora della PRIMA caduta, i tentativi che crescono) finché il
 * primo pezzo del flusso riaperto non arriva; poi `ricollegato` per 2 s. La sorgente dello streaming dice `inPausa` (l'orb si
 * ferma) ma `sending` resta vero (il giro sul PC non è finito: Ferma resta). A giro fermo niente; alla resa del guardiano la riga
 * lascia il posto all'errore con «Riconnetti», e «Riconnetti» la riporta.
 */
describe('RICOLL la linea che cade durante un giro', () => {
    it('RICOLL-01 il flusso cade a giro vivo: riga «riprovo · tentativo 1» dall\'ora della caduta, orb fermo, Ferma resta', async () => {
        const c = clienteFinto()
        const conv = await aGiroVivo(c)
        expect(conv.ricollegamento.value).toBeNull()
        const prima = Date.now()
        c.errore('DISCONNECTED')
        expect(conv.ricollegamento.value).toEqual({ tentativo: 1, dal: prima })
        expect(conv.sorgente.inPausa!.value).toBe(true)
        expect(conv.sorgente.sending.value).toBe(true)
    })

    it('RICOLL-02 cade di nuovo prima di un pezzo: tentativo 2, l\'ora resta quella della prima caduta', async () => {
        const c = clienteFinto()
        const conv = await aGiroVivo(c)
        const prima = Date.now()
        c.errore('DISCONNECTED')
        await aspetta()
        expect(c.flussi).toHaveLength(2)
        vi.advanceTimersByTime(3000)
        c.errore('DISCONNECTED')
        expect(conv.ricollegamento.value).toEqual({ tentativo: 2, dal: prima })
    })

    it('RICOLL-03 il primo pezzo del flusso riaperto: la riga se ne va, «Ricollegato» per 2 s, l\'orb riparte', async () => {
        const c = clienteFinto()
        const conv = await aGiroVivo(c)
        c.errore('DISCONNECTED')
        await aspetta()
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] })
        c.pezzo(battito)
        await nextTick()
        expect(conv.ricollegamento.value).toBeNull()
        expect(conv.ricollegato.value).toBe(true)
        expect(conv.sorgente.inPausa!.value).toBe(false)
        vi.advanceTimersByTime(1900)
        expect(conv.ricollegato.value).toBe(true)
        vi.advanceTimersByTime(200)
        expect(conv.ricollegato.value).toBe(false)
    })

    it('RICOLL-04 a giro fermo il flusso che cade si riapre in silenzio: nessuna riga', async () => {
        const c = clienteFinto()
        const conv = monta({ cliente: c.ponte, cartella: '/w', sessioneId: 's1', attesaRiapertura: () => 0 })
        await conv.apri()
        c.pezzo(sse({ type: 'RunFinished', threadId: 't0', runId: 'r0', result: {}, _sequenza: 4 }) + fineStoria)
        await aspetta()
        c.errore('DISCONNECTED')
        await aspetta()
        expect(c.flussi).toHaveLength(2)
        expect(conv.ricollegamento.value).toBeNull()
        expect(conv.sorgente.inPausa!.value).toBe(false)
    })

    it('RICOLL-05 alla resa per cadute la riga lascia il posto all\'errore con Riconnetti; Riconnetti la riporta a tentativo 1', async () => {
        const c = clienteFinto(() => null, false, { flussoGuasto: () => true })
        const conv = await (async () => {
            const k = monta({ cliente: c.ponte, cartella: '/w', sessioneId: 's1', attesaRiapertura: () => 0 })
            // il primo flusso si apre bene, poi ogni riapertura cade (PC spento)
            let primo = true
            const apriVero = c.ponte.apriFlusso
            c.ponte.apriFlusso = async (f) => { if (primo) { primo = false; c.flussi.push(f); return } return apriVero(f) }
            await k.apri()
            c.pezzo(fineStoria + avvio + parla)
            await aspetta()
            return k
        })()
        c.errore('DISCONNECTED')
        for (let i = 0; i < 8; i++) await aspetta()
        expect(conv.collegamentoPerso.value).toBe(true)
        expect(conv.riconnettibile.value).toBe(true)
        expect(conv.ricollegamento.value).toBeNull()
        const ora = Date.now()
        void conv.riconnetti()
        expect(conv.ricollegamento.value).toEqual({ tentativo: 1, dal: ora })
    })

    it('RICOLL-06 la sessione sparita (404) o la conversazione chiusa: niente riga', async () => {
        const c = clienteFinto()
        const conv = await aGiroVivo(c)
        c.errore('HTTP 404')
        expect(conv.ricollegamento.value).toBeNull()
        const c2 = clienteFinto()
        const conv2 = await aGiroVivo(c2)
        c2.errore('DISCONNECTED')
        await conv2.chiudi()
        expect(conv2.ricollegamento.value).toBeNull()
    })
})

/**
 * ATT-01..03 — R4 delle righe in corso (bozzetto approvato il 28/10, scene 3a/6): la conversazione dice alla coda in streaming a che
 * punto è l'attesa della prima parola. `inviato` dal tocco fino al RunStarted; poi `giro` dall'ora del RunStarted (il suo
 * `timestamp`, portato sull'orologio del dispositivo da `oraDelPc`), con ripiego sull'ora dell'invio; niente a giro chiuso.
 */
describe('ATT l\'attesa della prima parola nel Codice', () => {
    const avvioAlle = (ms: number | null) => sse({ type: 'RunStarted', threadId: 't1', runId: 'r9', input: { consegna: 'Ciao', seguito: true }, _sequenza: 10, ...(ms === null ? {} : { timestamp: ms }) })
    async function pronta(opzioni: Partial<Parameters<typeof useConversazioneR4>[0]> = {}) {
        const c = clienteFinto()
        const conv = monta({ cliente: c.ponte, cartella: '/w', sessioneId: 's1', attesaRiapertura: () => 0, ...opzioni })
        await conv.apri()
        c.pezzo(sse({ type: 'RunFinished', threadId: 't0', runId: 'r0', result: {}, _sequenza: 9 }) + fineStoria)
        await aspetta()
        return { c, conv }
    }

    it('ATT-01 dal tocco su Invia al via del giro: «inviato» con l\'ora del tocco', async () => {
        const { conv } = await pronta()
        expect(conv.sorgente.attesa!.value).toBeNull()
        const ora = Date.now()
        expect(await conv.invia('Ciao')).toBe(true)
        expect(conv.sorgente.attesa!.value).toEqual({ fase: 'inviato', dal: ora, chi: null })
    })

    it('ATT-02 il giro parte: «giro» dall\'ora del RunStarted, portata sull\'orologio del dispositivo', async () => {
        const { c, conv } = await pronta({ oraDelPc: (ms: number) => ms + 5_000 })
        await conv.invia('Ciao')
        const t = Date.now() - 2_000
        c.pezzo(avvioAlle(t))
        await aspetta()
        expect(conv.sorgente.attesa!.value).toEqual({ fase: 'giro', dal: t + 5_000, chi: null })
    })

    it('ATT-03 un RunStarted senza ora conta dall\'invio; a giro chiuso niente attesa', async () => {
        const { c, conv } = await pronta()
        const ora = Date.now()
        await conv.invia('Ciao')
        c.pezzo(avvioAlle(null))
        await aspetta()
        expect(conv.sorgente.attesa!.value).toEqual({ fase: 'giro', dal: ora, chi: null })
        c.pezzo(sse({ type: 'RunFinished', threadId: 't1', runId: 'r9', result: {}, _sequenza: 11 }))
        await aspetta()
        expect(conv.sorgente.attesa!.value).toBeNull()
    })

    // revisione del Desktop su R4 (S3): un giro partito ALTROVE (dal PC, da un'automazione) senza ora non conta da un invio vecchio
    it('ATT-04 giro chiuso, poi un RunStarted senza ora partito da un altro: `dal` nullo (niente secondi), mai l\'ora dell\'invio vecchio', async () => {
        const { c, conv } = await pronta()
        await conv.invia('Ciao')
        c.pezzo(avvioAlle(null))
        await aspetta()
        c.pezzo(sse({ type: 'RunFinished', threadId: 't1', runId: 'r9', result: {}, _sequenza: 11 }))
        await aspetta()
        c.pezzo(sse({ type: 'RunStarted', threadId: 't2', runId: 'r10', input: { consegna: 'Automazione', origine: 'automazione' }, _sequenza: 12 }))
        await aspetta()
        expect(conv.sorgente.attesa!.value).toEqual({ fase: 'giro', dal: null, chi: null })
    })
})
