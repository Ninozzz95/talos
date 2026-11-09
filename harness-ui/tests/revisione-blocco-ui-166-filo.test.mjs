/*
 * Revisione avversaria del blocco UI (04/11/2026), decisione 166 lungo TUTTO il filo: registro vero, servizio vero, nucleo vero, fornitore
 * finto. La prova del ramo (`fermato-poi-domanda-nuova.test.mjs`) chiama il nucleo da solo; qui si guarda cosa riceve il modello quando a
 * fermare il giro non è lo Stop della persona ma un messaggio mandato a giro in corso (`reindirizza`, il «Seguito» della 165), e quando
 * la persona preme «Riprendi da dove ti eri fermato» (ripresa senza messaggio).
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { talosLavora, SEGNO_GIRO_FERMATO } from '../src/kernel/talosHarness.mjs'
import { createSessionRegistry } from '../src/session-registry.mjs'
import { avviaSessione } from '../src/agent-service.mjs'
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs'

const enc = new TextEncoder()
const sse = (pezzi) => pezzi.map((p) => `data: ${typeof p === 'string' ? p : JSON.stringify(p)}\n\n`).join('')
const interrotto = () => Object.assign(new Error('The operation was aborted.'), { name: 'AbortError' })
const appeso = (signal, onPrimoPezzo) => new Response(new ReadableStream({
    start(c) {
        c.enqueue(enc.encode(sse([{ choices: [{ delta: { content: '1. Mela\n2. Pera\n' } }] }])))
        const via = () => { try { c.error(interrotto()) } catch { /* già chiuso */ } }
        if (signal?.aborted) via(); else signal?.addEventListener('abort', via, { once: true })
        setTimeout(onPrimoPezzo, 30)
    },
}), { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
const intera = (testo) => new Response(sse([{ choices: [{ delta: { content: testo } }] }, { choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 5 } }, '[DONE]']),
    { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
const testo = (m) => (typeof m?.content === 'string' ? m.content : JSON.stringify(m?.content ?? ''))
const attendi = async (cond, ms = 15_000) => { const t0 = Date.now(); while (!cond()) { if (Date.now() - t0 > ms) throw new Error('tempo scaduto'); await new Promise((r) => setTimeout(r, 20)) } }

function banco(t, { primoPezzo, eseguiComandoDirettoFn }) {
    const progetto = mkdtempSync(join(tmpdir(), 'talos-rev166-'))
    writeFileSync(join(progetto, 'uno.txt'), 'x')
    t.after(() => rimuoviCartellaDiProva(progetto))
    const corpi = []
    let n = 0
    const fetchDiRete = async (_url, init) => {
        corpi.push(JSON.parse(init.body).messages)
        return n++ === 0 ? appeso(init?.signal, () => primoPezzo()) : intera('A Tokyo sono le 01:15.')
    }
    const registro = createSessionRegistry({
        modello: 'z-ai/glm-5.3-flash', chiave: 'fixture', guardaWorkspaceFn: () => () => {}, ...(eseguiComandoDirettoFn ? { eseguiComandoDirettoFn } : {}),
        preparaEsecuzioneFn: (taskId) => ({ cartella: progetto, comandoProva: 'node -e 0', task: { id: taskId, consegna: 'Scrivi un elenco numerato di 60 frutti.' } }),
        avviaSessioneFn: (input) => avviaSessione({ ...input, talosLavoraFn: (k) => talosLavora({ ...k, fetchDiRete }) }),
    })
    t.after(async () => { try { await registro.chiudi?.() } catch { /* già chiuso */ } })
    return { registro, corpi }
}

test('REV166-FILO-01 — un messaggio mandato a giro in corso (reindirizza, «Seguito») NON deve far leggere al modello «la persona ha fermato apposta, non finirlo»', async (t) => {
    let sessione
    const b = banco(t, { primoPezzo: () => b.registro.reindirizza(sessione, 'Usa solo frutti italiani, e continua.') })
    const avvio = b.registro.avvia('t', { permessiScelto: 'Workspace write', modalitaOperativaScelta: 'normale' })
    sessione = avvio.sessionId
    const eventi = []
    t.after(b.registro.iscriviti(sessione, (e) => eventi.push(e)))
    await attendi(() => b.corpi.length >= 2 && eventi.filter((e) => e.type === 'RunFinished' || e.type === 'RunError').length >= 2)
    const mandati = b.corpi[1]
    const iCorrezione = mandati.findIndex((m) => m.role === 'user' && testo(m).includes('frutti italiani'))
    assert.ok(iCorrezione > 0, 'premessa: la correzione è arrivata al modello')
    const prima = mandati.slice(0, iCorrezione).map(testo).join('\n')
    assert.ok(!prima.includes(SEGNO_GIRO_FERMATO),
        `una correzione a giro in corso non è uno Stop della persona: il modello ha letto «${mandati.slice(0, iCorrezione).filter((m) => testo(m).includes(SEGNO_GIRO_FERMATO)).map(testo)[0]?.slice(0, 200)}» subito prima di «Usa solo frutti italiani, e continua.»`)
})

test('REV166-FILO-02 — Stop della persona, poi «Riprendi da dove ti eri fermato» (resume senza messaggio) dal registro vero: il segno non arriva al modello', async (t) => {
    let sessione
    const b = banco(t, { primoPezzo: () => b.registro.ferma(sessione) })
    sessione = b.registro.avvia('t', { permessiScelto: 'Workspace write', modalitaOperativaScelta: 'normale' }).sessionId
    const eventi = []
    t.after(b.registro.iscriviti(sessione, (e) => eventi.push(e)))
    await attendi(() => eventi.some((e) => e.type === 'RunFinished' || e.type === 'RunError'))
    await new Promise((r) => setTimeout(r, 100))
    const ripresa = b.registro.resume(sessione, null, [])
    assert.ok(ripresa && !ripresa.erroreAvvio && !ripresa.code, `premessa: la ripresa parte (${JSON.stringify(ripresa)?.slice(0, 160)})`)
    await attendi(() => b.corpi.length >= 2)
    assert.ok(!b.corpi[1].some((m) => testo(m).includes(SEGNO_GIRO_FERMATO)), 'il modello legge «non riprendere» proprio quando la persona chiede di riprendere')
})

test('REV166-FILO-03 — Stop della persona, poi una domanda nuova dal registro vero: il segno c è, una volta, subito prima della domanda', async (t) => {
    let sessione
    const b = banco(t, { primoPezzo: () => b.registro.ferma(sessione) })
    sessione = b.registro.avvia('t', { permessiScelto: 'Workspace write', modalitaOperativaScelta: 'normale' }).sessionId
    const eventi = []
    t.after(b.registro.iscriviti(sessione, (e) => eventi.push(e)))
    await attendi(() => eventi.some((e) => e.type === 'RunFinished' || e.type === 'RunError'))
    await new Promise((r) => setTimeout(r, 100))
    b.registro.resume(sessione, 'Che ore sono a Tokyo adesso?')
    await attendi(() => b.corpi.length >= 2)
    const mandati = b.corpi[1]
    const segni = mandati.map((m, i) => [i, m]).filter(([, m]) => testo(m).includes(SEGNO_GIRO_FERMATO))
    assert.equal(segni.length, 1, JSON.stringify(mandati.map((m) => m.role)))
    const iDomanda = mandati.findIndex((m) => m.role === 'user' && testo(m).includes('Tokyo'))
    assert.ok(segni[0][0] < iDomanda, 'il segno sta prima della domanda nuova')
    assert.equal(segni[0][1].role, 'system')
})

/* ═════ Seconda forma della 166 (OK di Performance, CLI e Mobile, 04/11 sera): le prove che mancavano ═════ */

test('REV166-FILO-04 — AL CONTRARIO dello Stop della persona: uno stop del MODELLO o del SISTEMA (domanda scaduta) non scrive la nota', async (t) => {
    for (const daChi of ['modello', 'sistema']) {
        let sessione
        const b = banco(t, { primoPezzo: () => b.registro.ferma(sessione, { daChi }) })
        sessione = b.registro.avvia('t', { permessiScelto: 'Workspace write', modalitaOperativaScelta: 'normale' }).sessionId
        const eventi = []
        t.after(b.registro.iscriviti(sessione, (e) => eventi.push(e)))
        await attendi(() => eventi.some((e) => e.type === 'RunFinished' || e.type === 'RunError'))
        await new Promise((r) => setTimeout(r, 100))
        b.registro.resume(sessione, 'Che ore sono a Tokyo adesso?')
        await attendi(() => b.corpi.length >= 2)
        assert.ok(b.corpi[1].some((m) => m.role === 'user' && testo(m).includes('Tokyo')), `premessa (${daChi}): la domanda nuova arriva`)
        assert.ok(!b.corpi[1].some((m) => testo(m).includes(SEGNO_GIRO_FERMATO)), `${daChi}: «la persona ha fermato» sarebbe falso`)
    }
})

test('REV166-POP-02 — condizione del Mobile: Stop, poi un comando della persona da raccontare, poi il «Riprendi» del telefono (`/resume {}`): il segno non arriva al modello, il racconto sì', async (t) => {
    let sessione
    const b = banco(t, {
        primoPezzo: () => b.registro.ferma(sessione),
        eseguiComandoDirettoFn: async ({ comando }) => ({ ok: true, codice: 0, enforcement: 'nessuno', cartellaFinale: null, comando, testo: 'USCITA-DEL-COMANDO' }),
    })
    sessione = b.registro.avvia('t', { permessiScelto: 'Workspace write', modalitaOperativaScelta: 'normale' }).sessionId
    const eventi = []
    t.after(b.registro.iscriviti(sessione, (e) => eventi.push(e)))
    await attendi(() => eventi.some((e) => e.type === 'RunFinished' || e.type === 'RunError'))
    await new Promise((r) => setTimeout(r, 100))
    b.registro.comandiNellaConversazione(sessione, true)
    const lanciato = b.registro.shell(sessione, 'echo ciao')
    await lanciato
    await new Promise((r) => setTimeout(r, 50))
    const ripresa = b.registro.resume(sessione, null, [])
    assert.ok(ripresa && !ripresa.erroreAvvio && !ripresa.code, `premessa: la ripresa parte (${JSON.stringify(ripresa)?.slice(0, 160)})`)
    await attendi(() => b.corpi.length >= 2)
    const mandati = b.corpi[1]
    assert.ok(mandati.some((m) => testo(m).includes('USCITA-DEL-COMANDO')), 'premessa: il racconto del comando arriva al modello')
    assert.ok(!mandati.some((m) => testo(m).includes(SEGNO_GIRO_FERMATO)), 'i racconti messi DOPO la nota la nascondevano alla ripresa')
})

test('REV166-EVENTI-01 — condizione del Mobile: la nota NON diventa mai un evento del giro (né testo, né un CUSTOM nuovo): l esportazione del telefono scrive gli sconosciuti come JSON grezzo', async (t) => {
    let sessione
    const b = banco(t, { primoPezzo: () => b.registro.ferma(sessione) })
    sessione = b.registro.avvia('t', { permessiScelto: 'Workspace write', modalitaOperativaScelta: 'normale' }).sessionId
    const eventi = []
    t.after(b.registro.iscriviti(sessione, (e) => eventi.push(e)))
    await attendi(() => eventi.some((e) => e.type === 'RunFinished' || e.type === 'RunError'))
    await new Promise((r) => setTimeout(r, 100))
    b.registro.resume(sessione, 'Che ore sono a Tokyo adesso?')
    await attendi(() => b.corpi.length >= 2 && eventi.filter((e) => e.type === 'RunFinished' || e.type === 'RunError').length >= 2)
    assert.ok(b.corpi[1].some((m) => testo(m).includes(SEGNO_GIRO_FERMATO)), 'premessa: la nota c è, per il modello')
    const conLaNota = eventi.filter((e) => JSON.stringify(e).includes(SEGNO_GIRO_FERMATO))
    assert.deepEqual(conLaNota.map((e) => `${e.type}${e.name ? `:${e.name}` : ''}`), [], 'nessun evento porta la nota al telefono')
})
