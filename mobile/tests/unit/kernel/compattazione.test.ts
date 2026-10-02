import { describe, expect, it } from 'vitest'
import {
    CARATTERI_MINIMI_RIDUCIBILI, ESITO_DOPPIONE, MARCATORE_ACCORCIATO,
    MARCATORE_INDICE, MARCATORE_RIASSUNTO, SCHEMA_RECORD_COMPATTAZIONE, TETTO_TOKEN_DEFAULT, VARIABILE_TETTO_TOKEN,
    accorciaTesto, applicaRecord, budgetCoda, calcolaSoglie, riduciCodaSottoPressione, classificaErroreFornitore,
    costruisciProiezione, costruisciRichiestaDiRiassunto, creaRecord, decidiCompattazione, dividiPerCompattazione,
    eRecordValido, indiceMeccanico, leggiTettoEsplicito, misuraOccupazione, oscuraPerRiassunto, reasoningPerRiassunto,
    riattaccaEffimeri, staccaEffimeri, valutaRispostaDiRiassunto,
    type TalosMessaggioCompattabile,
} from '@/lib/kernel/compattazione'

/*
 * P4-ter (02/10/2026) — il nucleo della compattazione, portato dal desktop (`AVM-integrazione-r4` @ `e027390ba`,
 * `harness-ui/tests/compattazione-desktop.test.mjs`): stessi casi, stessi numeri. In più: la finestra UTILE di Hermes
 * (`agent/context_compressor.py:2730-2769` @ `89937f8685`) e i segreti oscurati prima del riassuntore (`:1198-1202`).
 */
type M = TalosMessaggioCompattabile
const sys = (content: string): M => ({ role: 'system', content })
const user = (content: string): M => ({ role: 'user', content })
const chiamata = (id: string, name: string, args: unknown): M => ({ role: 'assistant', content: '', tool_calls: [{ id, type: 'function', function: { name, arguments: JSON.stringify(args) } }] })
const esito = (id: string, content: string): M => ({ role: 'tool', tool_call_id: id, content })
const testo = (content: string): M => ({ role: 'assistant', content })

describe('compattazione — il nucleo portato dal desktop', () => {
    it('CTX-PURE-CAP il tetto esplicito viene dall ambiente, intero positivo; altrimenti nessuno', () => {
        expect(leggiTettoEsplicito({})).toBeNull()
        expect(leggiTettoEsplicito({ [VARIABILE_TETTO_TOKEN]: '150000' })).toBe(150_000)
        expect(leggiTettoEsplicito({ [VARIABILE_TETTO_TOKEN]: ' 42 ' })).toBe(42)
        for (const brutto of ['0', '-5', 'abc', '1.5', '', '   ', '1e3']) expect(leggiTettoEsplicito({ [VARIABILE_TETTO_TOKEN]: brutto })).toBeNull()
    })

    it('CTX-PURE-THRESHOLDS il minore fra tetto e 0,75 finestra; emergenza 0,90 finestra o tetto × 1,2', () => {
        expect(calcolaSoglie({ tettoToken: 200_000, finestraToken: null })).toEqual({ soglia: 200_000, warningTokens: 160_000, emergenza: 240_000, fonte: 'tetto', tettoToken: 200_000, finestraToken: null, finestraUtile: null })
        expect(calcolaSoglie({ tettoToken: 200_000, finestraToken: 1_000_000 })).toMatchObject({ soglia: 200_000, warningTokens: 160_000, emergenza: 900_000, fonte: 'tetto' })
        expect(calcolaSoglie({ tettoToken: 200_000, finestraToken: 128_000 })).toMatchObject({ soglia: 96_000, warningTokens: 76_800, emergenza: 115_200, fonte: 'finestra' })
        expect(calcolaSoglie({ tettoToken: -1, finestraToken: 0 }).soglia).toBe(TETTO_TOKEN_DEFAULT)
    })

    it('CTX-WINDOW-VERIFIED-MATH il default storico non limita una finestra verificata', () => {
        const verificata = calcolaSoglie({ finestraToken: 1_000_000 })
        expect([verificata.soglia, verificata.emergenza, verificata.warningTokens]).toEqual([750_000, 900_000, 600_000])
        expect(decidiCompattazione({ token: 163_901, soglia: verificata.soglia, emergenza: verificata.emergenza }).scatta).toBe(false)
        expect(calcolaSoglie({ finestraToken: 262_144 }).soglia).toBe(196_608)
        expect(calcolaSoglie({ tettoToken: 150_000, finestraToken: 1_000_000 }).soglia).toBe(150_000)
        expect(calcolaSoglie({ finestraToken: null }).soglia).toBe(200_000)
    })

    it('CTX-WINDOW-USABLE (owner 02/10, Hermes) la soglia si calcola sulla finestra MENO la risposta riservata', () => {
        // Un modello locale da 4.096 con 1.024 di risposta: utile 3.072 ⇒ scatta a 2.304, emergenza 2.764. Senza la
        // riserva scattava a 3.072 = la finestra utile intera: il motore rifiutava prima («prompt troppo lungo»).
        const piccola = calcolaSoglie({ finestraToken: 4_096, riservaUscita: 1_024 })
        expect(piccola).toMatchObject({ soglia: 2_304, emergenza: 2_764, finestraUtile: 3_072, fonte: 'finestra' })
        expect(calcolaSoglie({ finestraToken: 8_192, riservaUscita: 1_024 }).soglia).toBe(5_376)
        // Una riserva che mangia tutta la finestra non vale (Hermes `_effective_input_window`): si usa la finestra intera.
        expect(calcolaSoglie({ finestraToken: 2_048, riservaUscita: 4_096 })).toMatchObject({ soglia: 1_536, finestraUtile: 2_048 })
        // Senza riserva i numeri del desktop restano identici.
        expect(calcolaSoglie({ finestraToken: 128_000 }).soglia).toBe(96_000)
    })

    it('CTX-PURE-MEASURE il numero del fornitore più la stima dei messaggi aggiunti; senza ancora, stima dichiarata', () => {
        const lista = [sys('a'.repeat(400)), user('b'.repeat(400)), testo('c'.repeat(400))]
        expect(misuraOccupazione({ ancora: null, messaggi: lista })).toEqual({ token: 300, misura: 'stimato' })
        expect(misuraOccupazione({ ancora: { promptTokens: 5_000, lunghezza: 2 }, messaggi: lista })).toEqual({ token: 5_100, misura: 'fornitore' })
        expect(misuraOccupazione({ ancora: { promptTokens: 5_000, lunghezza: 9 }, messaggi: lista })).toEqual({ token: 300, misura: 'stimato' })
        expect(misuraOccupazione({ ancora: { promptTokens: 0, lunghezza: 1 }, messaggi: lista }).misura).toBe('stimato')
        expect(misuraOccupazione({ ancora: { promptTokens: 1, lunghezza: 2, stima: 200 }, messaggi: lista })).toEqual({ token: 300, misura: 'stimato' })
        expect(misuraOccupazione({ ancora: { promptTokens: 60, lunghezza: 2, stima: 200 }, messaggi: lista })).toEqual({ token: 160, misura: 'fornitore' })
        expect(misuraOccupazione({ ancora: { promptTokens: 5_000, lunghezza: 2, stima: 200 }, messaggi: lista, finestraToken: 4_000 })).toEqual({ token: 300, misura: 'stimato' })
    })

    it('CTX-PURE-DECIDE soglia, emergenza, e i due esaurimenti', () => {
        expect(decidiCompattazione({ token: 100, soglia: 200, emergenza: 240 })).toEqual({ scatta: false, motivo: null })
        expect(decidiCompattazione({ token: 200, soglia: 200, emergenza: 240 })).toEqual({ scatta: true, motivo: 'soglia' })
        expect(decidiCompattazione({ token: 200, soglia: 200, emergenza: 240, tentativiEsauriti: true })).toEqual({ scatta: false, motivo: null })
        expect(decidiCompattazione({ token: 240, soglia: 200, emergenza: 240, tentativiEsauriti: true })).toEqual({ scatta: true, motivo: 'emergenza' })
        expect(decidiCompattazione({ token: 240, soglia: 200, emergenza: 240, tentativiEsauriti: true, emergenzaEsaurita: true })).toEqual({ scatta: false, motivo: null })
        expect(decidiCompattazione({ token: Number.NaN, soglia: 200, emergenza: 240 })).toEqual({ scatta: false, motivo: null })
    })

    it('CTX-PURE-EPHEMERAL i system in coda si staccano e si riattaccano; quelli in testa restano', () => {
        const piano = sys('Modalità Piano attiva.')
        const lista = [sys('agente'), sys('preambolo'), user('ciao'), testo('ok'), piano]
        const { messaggi, effimeri } = staccaEffimeri(lista)
        expect(effimeri).toEqual([piano])
        expect(messaggi).toEqual(lista.slice(0, 4))
        expect(riattaccaEffimeri(messaggi, effimeri)).toEqual(lista)
        expect(staccaEffimeri([sys('a'), sys('b'), user('c')]).effimeri).toEqual([])
        expect(staccaEffimeri([sys('a'), sys('b')]).effimeri).toEqual([])
        expect(staccaEffimeri(null)).toEqual({ messaggi: [], effimeri: [] })
    })
})

function storiaDiEsempio(): M[] {
    return [
        sys('agente'), sys('preambolo'),
        user('richiesta 1'),
        chiamata('c1', 'leggi', { percorso: 'src/a.mjs' }), esito('c1', 'contenuto a'),
        testo('fatto 1'),
        user('richiesta 2'),
        chiamata('c2', 'scrivi', { percorso: 'src/b.mjs' }), esito('c2', 'scritto sha 0a1b2c3d4e'),
        chiamata('c3', 'prova', {}), esito('c3', 'Error: test rosso\nok'),
        testo('fatto 2'),
        user('richiesta 3'),
        chiamata('c4', 'elenca', { percorso: '.' }), esito('c4', 'a b'),
        user('richiesta 4'),
        chiamata('c5', 'leggi', { percorso: 'src/c.mjs' }), esito('c5', 'contenuto c'),
        testo('fatto 4'),
    ]
}

describe('compattazione — divisione, indice, richiesta, proiezione', () => {
    it('CTX-PURE-SPLIT testa = tutti i system; coda = ultimi 2 scambi mai spezzati; ultime 3 richieste letterali', () => {
        const parti = dividiPerCompattazione(storiaDiEsempio())
        expect(parti.testa).toHaveLength(2)
        expect(parti.tagliabile).toBe(true)
        expect(parti.coda[0]!.content).toBe('richiesta 4')
        expect(parti.coda.some((m) => m.tool_calls?.[0]?.id === 'c5') && parti.coda.some((m) => m.role === 'tool' && m.tool_call_id === 'c5')).toBe(true)
        expect(parti.richiesteLetterali.map((m) => m.content)).toEqual(['richiesta 2', 'richiesta 3'])
        expect(parti.mezzo.some((m) => m.role === 'system')).toBe(false)
        const aperti = new Set(parti.coda.flatMap((m) => (m.tool_calls ?? []).map((c) => c.id)))
        expect(parti.coda.filter((m) => m.role === 'tool').every((m) => aperti.has(m.tool_call_id!))).toBe(true)
    })

    it('CTX-PURE-SPLIT-TOOL-BOUNDARY il taglio cade sempre all inizio di uno scambio', () => {
        const lista = [sys('s'), user('u'), chiamata('x', 'leggi', { percorso: 'a' }), esito('x', '1'), esito('x', '2'), testo('t'), chiamata('y', 'leggi', { percorso: 'b' }), esito('y', '3')]
        const parti = dividiPerCompattazione(lista, { scambiChiusi: 3 })
        expect(parti.coda[0]!.role).toBe('user')
        expect(parti.tagliabile).toBe(false)
        const due = [sys('s'), user('u1'), chiamata('x', 'leggi', {}), esito('x', '1'), testo('t'), user('u2'), chiamata('y', 'leggi', {}), esito('y', '3')]
        const p2 = dividiPerCompattazione(due, { scambiChiusi: 2 })
        expect(p2.coda[0]!.content).toBe('u2')
        expect(p2.coda.some((m) => m.tool_calls?.[0]?.id === 'y') && p2.coda.some((m) => m.role === 'tool' && m.tool_call_id === 'y')).toBe(true)
    })

    it('CTX-PURE-SPLIT-NOTHING una storia corta non è tagliabile', () => {
        expect(dividiPerCompattazione([sys('s'), user('u')]).tagliabile).toBe(false)
        expect(dividiPerCompattazione([sys('s'), user('u'), chiamata('a', 'leggi', {}), esito('a', 'x'), testo('t')]).tagliabile).toBe(false)
        expect(dividiPerCompattazione([]).tagliabile).toBe(false)
    })

    it('CTX-PURE-INDEX percorsi, impronte, errori, ≤5 file riletti, fusione col precedente', () => {
        const parti = dividiPerCompattazione(storiaDiEsempio())
        const indice = indiceMeccanico(parti.mezzo)
        expect(indice.percorsi).toEqual(expect.arrayContaining(['src/a.mjs', 'src/b.mjs', '.']))
        expect(indice.impronte).toEqual(['0a1b2c3d4e'])
        expect(indice.errori).toEqual(['Error: test rosso ← prova'])
        expect(indice.fileRiletti).toEqual(['src/b.mjs', 'src/a.mjs'])
        expect(indice.testo.startsWith(MARCATORE_INDICE)).toBe(true)
        const fuso = indiceMeccanico([chiamata('z', 'leggi', { percorso: 'src/z.mjs' })], { precedente: indice })
        expect(fuso.fileRiletti).toEqual(['src/z.mjs', 'src/b.mjs', 'src/a.mjs'])
        expect(fuso.errori.some((e) => e.startsWith('Error: test rosso'))).toBe(true)
        const molti = indiceMeccanico(Array.from({ length: 8 }, (_, i) => chiamata(`k${i}`, 'leggi', { percorso: `f${i}.txt` })))
        expect(molti.fileRiletti).toHaveLength(5)
        expect(molti.fileRiletti[0]).toBe('f7.txt')
    })

    it('CTX-PURE-INDEX-PROVENANCE ogni impronta porta l attrezzo e il comando che l ha prodotta', () => {
        const comando = 'false; echo "rc_false=$?"; nosuchcmd_xyz 2>/dev/null; echo "rc_notfound=$?"; echo ---; seq 1 20000 | md5sum; echo ---; curl -s -o /dev/null'
        const lista = [
            user('audit'),
            chiamata('s1', 'shell', { comando }),
            esito('s1', 'exit 0\nrc_false=0\n---\ne071f707df7bbeee2a6a1eb48011ddd0  -\n---'),
            testo('L md5 è e071f707df7bbeee2a6a1eb48011ddd0 e il commit 3f2a9c1b.'),
            chiamata('l1', 'leggi', { percorso: 'src/a.mjs' }),
            esito('l1', 'hash 0a1b2c3d4e'),
        ]
        const indice = indiceMeccanico(lista)
        expect(indice.impronte).toEqual(['e071f707df7bbeee2a6a1eb48011ddd0', '3f2a9c1b', '0a1b2c3d4e'])
        expect(indice.origini.e071f707df7bbeee2a6a1eb48011ddd0).toBe(`shell «${comando}»`)
        expect(indice.origini['3f2a9c1b']).toBe("testo dell'assistente")
        expect(indice.origini['0a1b2c3d4e']).toBe('leggi «src/a.mjs»')
        expect(indice.testo).toContain(`  · shell «${comando}»: e071f707df7bbeee2a6a1eb48011ddd0`)
        const lungo = indiceMeccanico([chiamata('x', 'shell', { comando: `echo ${'a'.repeat(400)}\nsha256sum f` }), esito('x', 'ab12cd34ef')])
        expect(lungo.origini.ab12cd34ef).toHaveLength('shell «»'.length + 240)
        expect(lungo.origini.ab12cd34ef!.endsWith('…»') && !lungo.origini.ab12cd34ef!.includes('\n')).toBe(true)
        expect(indiceMeccanico([esito('orfano', 'deadbeef1')]).origini.deadbeef1).toBe('risultato di un attrezzo')
        const record = creaRecord({ coveredThrough: 1, riassunto: [], indice })
        const fuso = indiceMeccanico([chiamata('z', 'leggi', { percorso: 'b' })], { precedente: record.indice })
        expect(fuso.origini.e071f707df7bbeee2a6a1eb48011ddd0).toBe(`shell «${comando}»`)
        const vecchio = indiceMeccanico([], { precedente: { percorsi: [], impronte: ['cafe1234'], errori: [], fileRiletti: [] } })
        expect(vecchio.testo).toContain('provenienza non registrata (compattazione precedente): cafe1234')
        expect(indiceMeccanico([user('x')]).testo).toContain('- Impronte trovate nei risultati: (nessuno)')
    })

    it('CTX-PURE-INDEX-OUR-ERRORS l indice riconosce gli errori dei nostri attrezzi con la provenienza', () => {
        const lista = [
            chiamata('l1', 'leggi', { percorso: '/tmp/audit-solo-tmp.txt' }),
            esito('l1', "error: ENOENT: no such file or directory, open 'C:\\tmp\\audit-solo-tmp.txt'"),
            chiamata('s1', 'shell', { comando: 'cd tasktest && node test_totale.mjs' }),
            esito('s1', 'exit 1 [sandbox: wsl2]\nAssertionError: atteso [### ]'),
            chiamata('s2', 'shell', { comando: 'echo ok' }),
            esito('s2', 'exit 0 [sandbox: wsl2]\nok'),
            chiamata('s3', 'shell', { comando: 'ls' }),
            esito('s3', 'exit 12 [sandbox: none]\n"AAA" non è riconosciuto'),
            testo('✗ la prova è rossa'),
        ]
        const indice = indiceMeccanico(lista)
        expect(indice.errori).toEqual([
            "error: ENOENT: no such file or directory, open 'C:\\tmp\\audit-solo-tmp.txt' ← leggi «/tmp/audit-solo-tmp.txt»",
            'exit 1 [sandbox: wsl2] ← shell «cd tasktest && node test_totale.mjs»',
            'AssertionError: atteso [### ] ← shell «cd tasktest && node test_totale.mjs»',
            'exit 12 [sandbox: none] ← shell «ls»',
            '✗ la prova è rossa',
        ])
        expect(indice.testo).not.toContain('exit 0')
        const molti = indiceMeccanico(Array.from({ length: 25 }, (_, i) => [chiamata(`e${i}`, 'shell', { comando: `cmd${i}` }), esito(`e${i}`, 'exit 1 [sandbox: wsl2]')]).flat())
        expect(molti.errori).toHaveLength(20)
        expect(molti.errori[0]).toBe('exit 1 [sandbox: wsl2] ← shell «cmd5»')
        expect(molti.errori.at(-1)).toBe('exit 1 [sandbox: wsl2] ← shell «cmd24»')
        expect(indiceMeccanico([chiamata('d', 'shell', { comando: 'cmd24' }), esito('d', 'exit 1 [sandbox: wsl2]')], { precedente: molti }).errori).toHaveLength(20)
    })

    it('CTX-PURE-INDEX-RECENT-HASHES al tetto di 20 escono le impronte più vecchie', () => {
        const impronta = (i: number) => `${((i * 2654435761) >>> 0).toString(16).padStart(8, '0')}abcdef${String(i).padStart(2, '0')}`
        const giro = (i: number) => [chiamata(`c${i}`, 'shell', { comando: `sha256sum f${i}` }), esito(`c${i}`, `${impronta(i)}  f${i}`)]
        const prima = indiceMeccanico(Array.from({ length: 15 }, (_, i) => giro(i)).flat())
        expect(prima.impronte).toHaveLength(15)
        const dopo = indiceMeccanico(Array.from({ length: 10 }, (_, i) => giro(15 + i)).flat(), { precedente: prima })
        expect(dopo.impronte).toEqual(Array.from({ length: 20 }, (_, i) => impronta(5 + i)))
        expect(impronta(0) in dopo.origini).toBe(false)
        expect(dopo.origini[impronta(24)]).toBe('shell «sha256sum f24»')
        expect(indiceMeccanico(giro(24), { precedente: dopo }).impronte).toEqual(dopo.impronte)
    })

    it('CTX-PURE-SUMMARY-REQUEST nessun attrezzo, budget dichiarato, riassunto precedente senza il suo indice', () => {
        const parti = dividiPerCompattazione(storiaDiEsempio())
        const ultimo = costruisciRichiestaDiRiassunto(parti).at(-1)!
        expect(ultimo.role).toBe('user')
        expect(ultimo.content).toMatch(/CONTEXT COMPACTION/)
        expect(ultimo.content).toMatch(/at most 1200 words/)
        expect(ultimo.content).toMatch(/Do not call any tool/)
        expect(ultimo.content).not.toMatch(/MERGE it/)
        const precedente = user(`${MARCATORE_RIASSUNTO}\n\nvecchio riassunto\n\n${MARCATORE_INDICE}\n- Percorsi toccati: x`)
        const conPrecedente = costruisciRichiestaDiRiassunto({ testa: parti.testa, mezzo: [precedente, ...parti.mezzo] })
        expect(conPrecedente.at(-1)!.content).toMatch(/MERGE it/)
        expect(conPrecedente.find((m) => typeof m.content === 'string' && m.content.startsWith(MARCATORE_RIASSUNTO))!.content).toBe(`${MARCATORE_RIASSUNTO}\n\nvecchio riassunto`)
    })

    it('CTX-PURE-EVALUATE testo finito sì; attrezzo, troncato, vuoto no', () => {
        expect(valutaRispostaDiRiassunto({ scelta: { content: ' ok ' }, finishReason: 'stop' })).toEqual({ ok: true, riassunto: 'ok', motivo: null })
        expect(valutaRispostaDiRiassunto({ scelta: { content: 'ok' } })).toEqual({ ok: true, riassunto: 'ok', motivo: null })
        expect(valutaRispostaDiRiassunto({ scelta: { content: 'ok', tool_calls: [{ id: 'x' }] }, finishReason: 'tool_calls' }).motivo).toBe('attrezzo')
        expect(valutaRispostaDiRiassunto({ scelta: { content: 'ok' }, finishReason: 'length' }).motivo).toBe('troncato')
        expect(valutaRispostaDiRiassunto({ scelta: { content: '   ' }, finishReason: 'stop' }).motivo).toBe('vuoto')
        expect(valutaRispostaDiRiassunto({}).motivo).toBe('vuoto')
    })

    it('CTX-PURE-PROJECTION-AND-RECORD proiezione = testa + richieste letterali + un messaggio + coda; applicaRecord la rifà', () => {
        const grezza = storiaDiEsempio()
        const parti = dividiPerCompattazione(grezza)
        const proiezione = costruisciProiezione({ testa: parti.testa, richiesteLetterali: parti.richiesteLetterali, riassunto: 'RIASSUNTO', indice: 'INDICE', coda: parti.coda })
        expect(proiezione[2]!.content).toBe('richiesta 2')
        expect(proiezione.find((m) => typeof m.content === 'string' && m.content.startsWith(MARCATORE_RIASSUNTO))!.content).toMatch(/RIASSUNTO\n\nINDICE$/)
        expect(proiezione).toHaveLength(2 + parti.richiesteLetterali.length + 1 + parti.coda.length)
        const record = creaRecord({ coveredThrough: grezza.length, riassunto: proiezione, tokenPrima: 9_000, tokenDopo: 3_000, misura: 'fornitore', at: '2026-09-24T10:00:00.000Z', modello: 'm', indice: { percorsi: ['a'] } })
        expect(record.schema).toBe(SCHEMA_RECORD_COMPATTAZIONE)
        expect(eRecordValido(record)).toBe(true)
        expect(record.indice).toEqual({ percorsi: ['a'], impronte: [], origini: {}, errori: [], fileRiletti: [] })
        expect(applicaRecord([...grezza, user('nuova'), testo('risposta')], record)).toEqual([...proiezione, user('nuova'), testo('risposta')])
        expect(applicaRecord(grezza.slice(0, 5), record)).toEqual(grezza.slice(0, 5))
        expect(applicaRecord(grezza, { schema: 'altro' })).toEqual(grezza)
        expect(() => creaRecord({ coveredThrough: -1, riassunto: [] })).toThrow(TypeError)
        expect(() => creaRecord({ coveredThrough: 1, riassunto: 'no' as never })).toThrow(TypeError)
        expect(creaRecord({ coveredThrough: 0, riassunto: [], misura: 'boh' as never }).misura).toBe('stimato')
    })

    it('CTX-PURE-OVERFLOW le forme reali del contesto pieno; un 400 qualunque no', () => {
        const e = (message: string, stato: number) => Object.assign(new Error(message), { stato })
        expect(classificaErroreFornitore(e("HTTP 400: {\"error\":{\"code\":400,\"message\":\"This endpoint's maximum context length is 131072 tokens. However, you requested about 135349 tokens\"}}", 400))).toBe('contesto-pieno')
        expect(classificaErroreFornitore(e('HTTP 400: {"error":{"code":"context_length_exceeded"}}', 400))).toBe('contesto-pieno')
        expect(classificaErroreFornitore(e('prompt is too long: 233153 tokens > 200000 maximum', 400))).toBe('contesto-pieno')
        expect(classificaErroreFornitore(e('Payload too large', 413))).toBe('contesto-pieno')
        expect(classificaErroreFornitore(Object.assign(e('non entra nella finestra', 400), { code: 'LOCAL_CONTEXT_EXCEEDED' }))).toBe('contesto-pieno')
        // Il motore locale del telefono: `promptTooLongFailure` (`localAdapter.ts:306-312`) porta questo messaggio.
        expect(classificaErroreFornitore(new Error('TALOS_LOCAL_PROMPT_TOO_LONG'))).toBe('contesto-pieno')
        expect(classificaErroreFornitore(e('HTTP 400: Invalid value for tool_choice', 400))).toBeNull()
        expect(classificaErroreFornitore(e('HTTP 429: rate limited', 429))).toBeNull()
        expect(classificaErroreFornitore(null)).toBeNull()
    })

    it('CTX-PURE-REASONING si abbassa, mai si alza, e non si inventa', () => {
        expect(reasoningPerRiassunto(undefined)).toBeUndefined()
        expect(reasoningPerRiassunto(null)).toBeUndefined()
        expect(reasoningPerRiassunto({ effort: 'high' })).toEqual({ effort: 'low' })
        expect(reasoningPerRiassunto({ effort: 'minimal' })).toEqual({ effort: 'minimal' })
        expect(reasoningPerRiassunto({ enabled: true })).toEqual({ enabled: true })
    })
})

describe('compattazione — la coda sotto pressione (owner 26/09, «come Hermes»)', () => {
    const stimaCaratteri = (lista: readonly M[]) => Math.ceil(JSON.stringify(lista).length / 4)
    const lungo = (lettera: string, n: number) => `INIZIO-${lettera.repeat(n)}-FINE`

    it('CTX-PURE-TAIL-SHORTEN inizio e fine col rimando, idempotente, sotto i riducibili non si tocca', () => {
        const corto = accorciaTesto(lungo('a', 10_000))
        expect(corto.startsWith('INIZIO-') && corto.endsWith('-FINE') && corto.includes(MARCATORE_ACCORCIATO)).toBe(true)
        expect(corto.length).toBeLessThan(2_000)
        expect(accorciaTesto(corto)).toBe(corto)
        const breve = 'b'.repeat(CARATTERI_MINIMI_RIDUCIBILI - 1)
        expect(accorciaTesto(breve)).toBe(breve)
    })

    it('CTX-PURE-TAIL-UNDER-BUDGET una coda dentro il tetto morbido torna lo STESSO oggetto', () => {
        const coda = [chiamata('c1', 'leggi', { percorso: 'a.txt' }), esito('c1', 'x'.repeat(3_000)), testo('ok')]
        const r = riduciCodaSottoPressione(coda, { budgetToken: 10_000, stima: stimaCaratteri })
        expect(r.coda).toBe(coda)
        expect([r.ridotti, r.alMinimo, r.tetto]).toEqual([0, false, 15_000])
    })

    it('CTX-PURE-TAIL-PRESSURE-ORDER doppioni, poi i vecchi, gli ultimi 3 intatti se basta', () => {
        const grande = lungo('g', 20_000)
        const coda = [
            user('rileggi'),
            chiamata('c1', 'leggi', { percorso: 'g.txt' }), esito('c1', grande),
            chiamata('c2', 'leggi', { percorso: 'g.txt' }), esito('c2', grande),
            chiamata('c3', 'leggi', { percorso: 'h.txt' }), esito('c3', lungo('h', 4_000)),
            testo('Letto.'),
        ]
        const r = riduciCodaSottoPressione(coda, { budgetToken: 5_000, stima: stimaCaratteri })
        expect(r.coda.map((m) => m.role)).toEqual(coda.map((m) => m.role))
        expect(r.coda.map((m) => m.tool_call_id ?? null)).toEqual(coda.map((m) => m.tool_call_id ?? null))
        expect(r.coda[2]!.content).toBe(ESITO_DOPPIONE)
        expect(r.coda[4]!.content).toBe(grande)
        expect([r.ridotti, r.alMinimo]).toEqual([1, false])
        const stretta = riduciCodaSottoPressione(coda, { budgetToken: 2_000, stima: stimaCaratteri })
        expect(stretta.coda[4]!.content).toContain(MARCATORE_ACCORCIATO)
        expect(stretta.coda.slice(-3)).toEqual(coda.slice(-3))
        expect(stimaCaratteri(stretta.coda)).toBeLessThanOrEqual(3_000)
    })

    it('CTX-PURE-TAIL-LAST-RESORT anche il più recente si accorcia; al minimo solo se nemmeno così rientra', () => {
        const r = riduciCodaSottoPressione([chiamata('c1', 'leggi', { percorso: 'g.txt' }), esito('c1', lungo('g', 60_000)), testo('Letto.')], { budgetToken: 1_000, stima: stimaCaratteri })
        expect(r.coda[1]!.content).toContain(MARCATORE_ACCORCIATO)
        expect(r.alMinimo).toBe(false)
        const bloccata = riduciCodaSottoPressione([user('z'.repeat(40_000))], { budgetToken: 1_000, stima: stimaCaratteri })
        expect(bloccata.alMinimo).toBe(true)
        expect(bloccata.coda[0]!.content).toHaveLength(40_000)
    })

    it('CTX-PURE-TAIL-ARGUMENTS gli argomenti enormi si accorciano DENTRO il JSON, che resta valido', () => {
        const coda = [chiamata('w1', 'scrivi', { percorso: 'out.txt', contenuto: lungo('w', 30_000) }), esito('w1', 'scritto'), testo('uno'), testo('due'), testo('tre')]
        const { coda: ridotta } = riduciCodaSottoPressione(coda, { budgetToken: 1_000, stima: stimaCaratteri })
        const args = JSON.parse(ridotta[0]!.tool_calls![0]!.function.arguments)
        expect(args.percorso).toBe('out.txt')
        expect(args.contenuto).toContain(MARCATORE_ACCORCIATO)
        expect(ridotta[0]!.tool_calls![0]!.id).toBe('w1')
    })

    it('CTX-PURE-TAIL-BUDGET il budget della coda è il 20% della soglia', () => {
        expect([budgetCoda(200_000), budgetCoda(20_000), budgetCoda(0), budgetCoda(Number.NaN)]).toEqual([40_000, 4_000, 1, 1])
    })
})

describe('compattazione — «+1 su Hermes»: i segreti non arrivano al riassuntore (owner 02/10)', () => {
    const CHIAVE = 'sk-or-v1-0123456789abcdef0123456789abcdef'

    it('CTX-REDACT-01 le chiavi spariscono, percorsi, impronte e comandi restano', () => {
        const testoConSegreti = [
            `Authorization: Bearer ${CHIAVE}`,
            'export OPENROUTER_API_KEY=sk-or-v1-zzzzzzzzzzzzzzzzzzzz',
            'https://utente:password123@example.org/repo.git',
            'https://generativelanguage.googleapis.com/v1/models?key=AIzaSyA1234567890abcdefghijklmnopqrstuv',
            'file src/lib/kernel/compattazione.ts sha e071f707df7bbeee2a6a1eb48011ddd0',
            'seq 1 20000 | md5sum',
        ].join('\n')
        const pulito = oscuraPerRiassunto(testoConSegreti)
        expect(pulito).not.toContain(CHIAVE)
        expect(pulito).not.toContain('sk-or-v1-zzzz')
        expect(pulito).not.toContain('password123')
        expect(pulito).not.toContain('AIzaSyA1234567890')
        expect(pulito).toContain('src/lib/kernel/compattazione.ts')
        expect(pulito).toContain('e071f707df7bbeee2a6a1eb48011ddd0')
        expect(pulito).toContain('seq 1 20000 | md5sum')
    })

    it('CTX-REDACT-02 la richiesta di riassunto non porta chiavi negli esiti, negli argomenti o nel riassunto precedente', () => {
        const mezzo = [
            user('configura il fornitore'),
            chiamata('s1', 'shell', { comando: `curl -H "Authorization: Bearer ${CHIAVE}" https://openrouter.ai/api/v1/models` }),
            esito('s1', `exit 0\nchiave usata: ${CHIAVE}`),
            user(`${MARCATORE_RIASSUNTO}\n\nprima avevo visto ${CHIAVE}`),
            testo('fatto'),
        ]
        const richiesta = costruisciRichiestaDiRiassunto({ testa: [sys('agente')], mezzo })
        expect(JSON.stringify(richiesta)).not.toContain(CHIAVE)
        expect(JSON.stringify(richiesta)).toContain('openrouter.ai/api/v1/models')
        // Il JSON degli argomenti resta valido dopo l'oscuramento.
        const args = JSON.parse(richiesta.find((m) => m.tool_calls)!.tool_calls![0]!.function.arguments)
        expect(args.comando).toContain('curl')
        // E anche ciò che il riassuntore restituisce passa dall'oscuramento prima di diventare memoria.
        expect(valutaRispostaDiRiassunto({ scelta: { content: `ho usato ${CHIAVE}` }, finishReason: 'stop' }).riassunto).not.toContain(CHIAVE)
    })
})
