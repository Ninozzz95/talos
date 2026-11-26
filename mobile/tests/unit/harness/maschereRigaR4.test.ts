import { describe, expect, it } from 'vitest'
import { conversazioneDaEventi } from '@/lib/harness/r4/eventiR4'
import { corpoAttrezzoR4 } from '@/lib/harness/r4/corpoAttrezzoR4'
import { talosSequenzaDaMetadata } from '@/lib/chat/sequenzaDelTurno'
import { talosToolActivityLabel } from '@/lib/tools/toolLabels'

/**
 * P5 della 0.1.50 (riga 156): la riga dell'attività mostra gli argomenti con le maschere del PC (`forme-di-segreto.mjs`:
 * `oscuraPerStruttura`, `oscuraFormeDiSegreto`, `oscuraTestoInArrivo`), come `renderizzaArgomentiAttrezzo` di `legacy/app.js`.
 * Prima la riga corta, gli argomenti JSON, i grezzi e gli argomenti a pezzi mostravano il segreto in chiaro (le carte no: le maschera
 * il nucleo). I segreti sono FINTI e scritti a pezzi, una forma ciascuno: chiave `sk-…`, token in un'intestazione, valore di un `*_KEY`.
 */
const CHIAVE = ['sk', 'ant', 'api03', 'FINTO0FINTO1FINTO2FINTO3'].join('-')
const GETTONE = ['FINTO', '9gettone', '8intestazione', '7lungo'].join('')
const VALORE = ['valore', 'Finto', '42', 'senzaForma'].join('')
const SEGRETI = [CHIAVE, GETTONE, VALORE]
const COMANDO = `curl -H "Authorization: Bearer ${GETTONE}" https://esempio.invalid; export OPENROUTER_API_KEY=${VALORE}`

const vivi = (argomenti: string[], nome = 'shell') => conversazioneDaEventi([
    { type: 'RunStarted', runId: 'g', input: { consegna: 'x' } },
    { type: 'ToolCallStart', toolCallId: 'a', toolCallName: nome },
    ...argomenti.map((delta) => ({ type: 'ToolCallArgs', toolCallId: 'a', delta })),
]).inCorso!.confini[0]!.attrezzi[0]!
const corpo = (argomenti: string, risultato = false) =>
    JSON.stringify(corpoAttrezzoR4({ nome: 'shell', argomenti, ...(risultato ? { risultato: { contenuto: 'ok' } } : {}) }, 'it'))
const senzaSegreti = (testo: string) => { for (const s of SEGRETI) expect(testo).not.toContain(s) }

describe('maschere della riga dell\'attività (P5, come il PC)', () => {
    it('MASCHERA-01 la riga corta (dettaglio) non mostra il segreto', () => {
        senzaSegreti(String(vivi([JSON.stringify({ comando: COMANDO })]).detail))
        senzaSegreti(String(vivi([JSON.stringify({ comando: `node x.js --chiave ${CHIAVE}` })]).detail))
    })
    it('MASCHERA-02 gli argomenti JSON non mostrano il segreto, né per forma né per nome del campo', () => {
        senzaSegreti(corpo(JSON.stringify({ comando: COMANDO, api_key: CHIAVE, annidato: { password: VALORE } }), true))
    })
    it('MASCHERA-03 i grezzi (non JSON) non mostrano il segreto', () => {
        senzaSegreti(corpo(`${COMANDO} --chiave ${CHIAVE}`, true))
    })
    it('MASCHERA-04 gli argomenti che arrivano a pezzi non mostrano il segreto spezzato a metà', () => {
        const pezzi = [`{"comando":"node x.js --chiave ${CHIAVE.slice(0, 12)}`, CHIAVE.slice(12), '"}']
        for (let n = 1; n <= pezzi.length; n += 1) {
            const riga = vivi(pezzi.slice(0, n))
            // nemmeno la metà già arrivata: `sk-ant-api0…` è ancora sotto la lunghezza minima della forma
            expect(corpo(riga.argomenti ?? '') + String(riga.detail)).not.toContain(CHIAVE.slice(0, 10))
        }
        expect(corpo(`token ${CHIAVE.slice(0, 15)}`)).not.toContain(CHIAVE.slice(0, 15))
    })
    it('MASCHERA-05 un testo senza segreti resta identico', () => {
        const normali = { comando: 'npm test -- --run', percorso: 'src/a.ts', opzioni: { righe: 20 } }
        expect(vivi([JSON.stringify(normali)]).detail).toBe('src/a.ts') // `percorso` viene prima di `comando` (CAMPI_DETTAGLIO)
        expect(vivi([JSON.stringify({ comando: 'npm test -- --run' })]).detail).toBe('npm test -- --run')
        expect(corpoAttrezzoR4({ nome: 'shell', argomenti: JSON.stringify(normali) }, 'it').map((p) => p.tipo === 'argomento' && p.valore))
            .toEqual(['npm test -- --run', 'src/a.ts', '{"righe":20}'])
        expect(corpoAttrezzoR4({ nome: 'shell', argomenti: 'ls -la src', risultato: { contenuto: 'ok' } }, 'it')[0])
            .toEqual({ tipo: 'argomentiGrezzi', testo: 'ls -la src' })
    })
})

/**
 * Giro 2 (revisore ROSSO su fc9741cbb, R1 e R2): un JSON A METÀ passava da `oscuraTestoInArrivo` come testo, che non conosce la
 * struttura né gli escape. Ora si chiude e si legge per struttura come sul PC (`leggiArgomentiDellaRiga`, carta-dal-testo.js).
 * Campioni e nuclei sono quelli della sonda del revisore; il nucleo è un pezzo del segreto dopo il prefisso pubblico, che non si
 * deve vedere a NESSUN taglio, carattere per carattere.
 */
const a = (...p: string[]) => p.join('')
const ANNIDATI: [string, string][] = [ // R1: valori annidati sotto un nome di segreto, una frase-password con spazi
    [JSON.stringify({ secrets: { utente: 'nino', db: a('valore', 'AnnidatoFinto77') }, cartella: 'x' }), 'valoreAnnidato'],
    [`{"secrets": {"db": "${a('valore', 'AnnidatoFinto77')}"}, "cartella": "x"}`, 'valoreAnnidato'],
    [JSON.stringify({ comando: 'x', password: a('cavallo ', 'batteria graffetta corretta') }), 'graffetta'],
    [JSON.stringify({ credentials: { user: 'nino', key: a('chiave', 'SenzaFormaFinta9') }, x: 1 }), 'chiaveSenza'],
]
const nelComando = (testo: string) => JSON.stringify({ comando: `curl -s https://esempio.invalid ${testo} && echo fatto` })
const ESCAPE: [string, string][] = [ // R2: un PEM con gli a capo scritti `\n` nel JSON, una chiave Z.AI, la password di un indirizzo
    [nelComando(a('-----BEGIN RSA ', 'PRIVATE KEY-----\nMIIEpAIBAAKCAQEA1234567890abcdefABCDEF\n-----END RSA ', 'PRIVATE KEY-----')), 'MIIEpA'],
    [nelComando(a('0123456789abcdef0123456789abcdef', '.AbCdEfGhIjKlMnOp')), 'AbCdEfGh'],
    [nelComando(a('https://utente:', 'Passw0rdFinta@esempio.invalid/x')), 'Passw0'],
]
type Riga = { name: string; detail?: string | null; argomenti?: string }
const visto = (r: Riga | undefined) => (r
    ? `${talosToolActivityLabel({ name: r.name, detail: r.detail ?? null })}\n${JSON.stringify(corpoAttrezzoR4({ nome: r.name, argomenti: r.argomenti ?? '' }, 'it'))}`
    : '')
/* la chiamata interrotta a metà: il messaggio salvato, riletto come dopo la ricarica */
const salvato = (argomenti: string) => {
    const c = conversazioneDaEventi([
        { type: 'RunStarted', runId: 'g', input: { consegna: 'x' } },
        { type: 'ToolCallStart', toolCallId: 'a', toolCallName: 'shell' },
        { type: 'ToolCallArgs', toolCallId: 'a', delta: argomenti },
        { type: 'RunError', runId: 'g', message: 'interrotto', code: 'X' },
    ])
    const m = c.messaggi.find((x) => (x.metadata as Record<string, unknown> | undefined)?.talos_sequenza)
    const seq = talosSequenzaDaMetadata((m?.metadata as Record<string, unknown> | undefined)?.talos_sequenza) ?? []
    expect(seq.length).toBeGreaterThan(0) // la riga c'è davvero: altrimenti la prova non proverebbe niente
    return seq.flatMap((s) => (s.tipo === 'attrezzi' ? s.attrezzi.map((x) => visto(x as Riga)) : [])).join('\n')
}
const tagliVisti = (json: string, nucleo: string, vede: (taglio: string) => string) => {
    const visti: number[] = []
    for (let n = 1; n <= json.length; n += 1) if (vede(json.slice(0, n)).includes(nucleo)) visti.push(n)
    return visti
}

describe('maschere della riga, giro 2: il JSON a metà si chiude e si legge per struttura (R1, R2)', () => {
    it('MASCHERA-06 (R1) un JSON annidato a metà non mostra il valore sotto un nome di segreto, a nessun taglio', () => {
        for (const [json, nucleo] of ANNIDATI) expect(tagliVisti(json, nucleo, (t) => visto(vivi([t])))).toEqual([])
    })
    it('MASCHERA-07 (R2) un taglio sul `\\` di un escape non mostra il PEM; a metà JSON nemmeno Z.AI e `utente:password@`', () => {
        const pem = ESCAPE[0]![0]
        expect(pem.slice(0, pem.indexOf('\\n') + 1).endsWith('\\')).toBe(true) // il taglio del revisore c'è fra quelli provati
        for (const [json, nucleo] of ESCAPE) expect(tagliVisti(json, nucleo, (t) => visto(vivi([t])))).toEqual([])
    })
    it('MASCHERA-08 interrotta a metà: il messaggio salvato e riletto non mostra il segreto, a nessun taglio', () => {
        for (const [json, nucleo] of [...ANNIDATI, ...ESCAPE]) expect(tagliVisti(json, nucleo, salvato)).toEqual([])
    })
    const righe = (argomenti: string, risultato: boolean) => corpoAttrezzoR4({ nome: 'shell', argomenti, ...(risultato ? { risultato: { contenuto: 'ok' } } : {}) }, 'it')
        .flatMap((p) => (p.tipo === 'argomento' ? [[p.chiave, p.valore]] : []))
    it('MASCHERA-09 (mutante R1) gli argomenti si leggono per STRUTTURA, non come testo mascherato e poi letto', () => {
        for (const risultato of [true, false]) {
            expect(righe(ANNIDATI[2]![0], risultato)).toEqual([['comando', 'x'], ['password', '[redacted]']])
            expect(righe(ANNIDATI[3]![0], risultato)).toEqual([['credentials', '[redacted]'], ['x', '1']])
        }
    })
    it('MASCHERA-10 a metà: le righe già chiuse si vedono, il valore aperto è «…», un JSON che non si chiude non si mostra', () => {
        expect(righe('{"comando":"npm test","percorso":"src/a', false)).toEqual([['comando', 'npm test'], ['percorso', '…']])
        expect(righe('{"comando":"npm test","perc', false)).toEqual([['comando', 'npm test']])
        expect(corpoAttrezzoR4({ nome: 'shell', argomenti: '{"comando":"npm test","forza":tr' }, 'it')).toEqual([])
    })
})
