/*
 * `/settings` DELLA PERSONA (fase 8, decisione 8 dell'owner; forma `FORMA-SETTINGS-DELLA-PERSONA-2026-11-02.md`, OK di CLI, Mobile e
 * Performance il 02/11/2026 notte) — la rotta `POST /api/v1/app-settings/apply`, dalla finestra del PC e dal ponte del dispositivo.
 *
 * Una prova per ogni condizione:
 *   · PC: applica, ricevuta con Annulla, origine `{tipo:'persona'}`, `confermatoDa` `finestra-pc` dalla rotta (mai dal corpo);
 *   · CLI: dal ponte l'origine è `{tipo:'dispositivo', dispositivoId}`, MAI 'persona';
 *   · Mobile: dal ponte le voci di sicurezza e aggiornamenti ⇒ `PC_CONFIRMATION_REQUIRED` con `{chiave, nome…}`, niente scritto, e il
 *     codice NON è `CONSENT_REQUIRED`; una voce normale dal ponte passa con `confermatoDa: dispositivo`;
 *   · forma: origine esterna 403, chiave sconosciuta e valore fuori elenco rifiutati senza scrivere, revisione vecchia rifiutata, Annulla
 *     della persona su un cambio della persona;
 *   · Performance P1: con un giro in corso il cambio vale dalla PROSSIMA richiesta (il giro tiene modello, sforzo e attrezzi);
 *   · Performance P2: nessuna nota nel testo di sistema; la nota del cambio (giro 2, voce 1) va in coda alla conversazione col prossimo
 *     messaggio della persona.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp } from 'node:fs/promises'
import { mkdirSync, realpathSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { talosLavora } from '../src/kernel/talosHarness.mjs'
import { createSessionRegistry } from '../src/session-registry.mjs'
import { createHttpApp } from '../src/http-app.mjs'
import { avviaSessione } from '../src/agent-service.mjs'
import { creaServizioImpostazioni } from '../src/impostazioni/servizio-impostazioni.mjs'
import { creaCopiaFinestra } from '../src/impostazioni/copia-finestra.mjs'
import { creaFonteSessione, creaFontiDelServer } from '../src/impostazioni/fonti-impostazioni.mjs'
import { creaChiamataInterna } from '../src/remoto/chiamata-interna.mjs'
import { creaOperazioni } from '../src/remoto/operazioni.mjs'
import { creaCartelleDeiDispositivi } from '../src/remoto/cartelle-dispositivi.mjs'
import { iscriviConRigiocata } from '../src/iscrizione-sessione.mjs'
import { cartellaDiProva } from './aiuto/cartelle-di-prova.mjs'
import { rimuoviCartellaDiProvaAttesa } from './aiuto/rimuovi-cartella-di-prova.mjs'

const APPLICA = '/api/v1/app-settings/apply'
const DISP = 'dispositivo-A1'

async function ascolta(t, opzioni) {
    const server = createServer(createHttpApp({ senzaGettone: 'prove', staticHandler: async () => null, ...opzioni }))
    await new Promise((ok, ko) => { server.once('error', ko); server.listen(0, '127.0.0.1', ok) })
    t.after(() => new Promise((ok) => { server.closeAllConnections?.(); server.close(() => ok()) }))
    return `http://127.0.0.1:${server.address().port}`
}

/* Il banco senza giro: la copia della finestra (tema, aggiornamenti), l'utente di WSL (gruppo sicurezza) e una conversazione finta per lo
   sforzo. Il ponte VERO (`creaOperazioni` + `creaChiamataInterna`) e la finestra (la stessa chiamata interna senza origine remota). */
function banco({ consentita = true, gettone = null, annota = null } = {}) {
    const radice = cartellaDiProva('talos-imp-persona-')
    const crea = (...parti) => { const p = join(radice, ...parti); mkdirSync(p, { recursive: true }); return realpathSync(p) }
    const avm = crea('progetti', 'AVM')
    const dati = crea('dati')
    const copia = creaCopiaFinestra()
    const wsl = { valori: { usaUtenteNormale: true }, scritture: 0, leggi() { return { ...this.valori } }, imposta(p) { this.scritture += 1; Object.assign(this.valori, p) } }
    const conversazione = { sforzo: 'high', permessi: 'Workspace write', scritture: [] }
    const fonti = {
        ...creaFontiDelServer({ preferenzeWslStore: wsl }),
        sessione: {
            leggi: async ({ sessionId } = {}) => { if (sessionId !== 's1') throw Object.assign(new Error('this conversation is not available.'), { code: 'SESSION_NOT_FOUND' }); return { sforzo: conversazione.sforzo, permessi: conversazione.permessi } },
            scrivi: async (patch, contesto) => { conversazione.scritture.push({ patch, origine: contesto.origine, confermatoDa: contesto.confermatoDa }); if (Object.hasOwn(patch, 'sforzo')) conversazione.sforzo = patch.sforzo; if (Object.hasOwn(patch, 'permessi')) conversazione.permessi = patch.permessi },
        },
    }
    const servizio = creaServizioImpostazioni({ fonti, copiaFinestra: copia, ...(annota ? { annotaPerIlModelloFn: annota } : {}) })
    const sessionRegistry = {
        cartellePiuUsate: () => [{ percorso: avm, conteggio: 1, ultimaVolta: '2026-11-01T10:00:00.000Z' }],
        elenca: () => [{ sessionId: 's1', titolo: 's1' }],
        esiste: (id) => id === 's1',
        async cartellaPerChatFile(id) { return id === 's1' ? { ok: true, cartella: avm } : { code: 'NOT_FOUND', reason: 'session-not-found' } },
    }
    const cartelle = creaCartelleDeiDispositivi({ fileConsensi: join(dati, 'remoto', 'consensi.json'), fileSegreto: join(dati, 'remoto', 'segreto-cartelle'),
        sessionRegistry, cartelleAmmesse: [], cartelleEscluse: [dati] })
    if (consentita) cartelle.consentita = async () => true
    /* `gettone`: il server avviato col gettone (l'app installata); senza, la finestra non basta per le voci a carta sempre (F1 della CLI) */
    const httpApp = createHttpApp({ senzaGettone: 'prove', staticHandler: async () => null, sessionRegistry, impostazioniApp: servizio, remotoFn: () => ({ cartelle }), ...(gettone ? { token: gettone } : {}) })
    const chiama = creaChiamataInterna({ httpApp, porta: 4999, gettone })
    const operazioni = creaOperazioni({ chiama, sessionRegistry, iscriviConRigiocata, cartelle })
    const contesto = { dispositivo: { id: DISP, nome: 'OnePlus Pad 3' }, iscrizioni: new Map(), iscrivi: () => async () => {} }
    return {
        servizio, copia, wsl, conversazione,
        dalPc: (corpo) => chiama({ metodo: 'POST', percorso: APPLICA, corpo, origine: 'pc' }),
        pc: (metodo, percorso, corpo) => chiama({ metodo, percorso, corpo, origine: 'pc' }),
        dalPonte: (corpo) => operazioni.esegui('app-settings.apply', { corpo }, contesto),
        /* la rotta con l'origine remota SENZA il ponte davanti: il cancello vero sta nella rotta, non solo nel controllo veloce del ponte */
        dallaRottaRemota: (corpo) => chiama({ metodo: 'POST', percorso: APPLICA, corpo, origine: 'telefono', origineRemota: { tipo: 'telefono', nome: 'X', dispositivoId: DISP } }),
        operazioni,
    }
}

test('PERSONA-01 dalla finestra del PC: `/settings` valido APPLICA, scrive la ricevuta con l\'Annulla, origine «persona», confermatoDa «finestra-pc» dalla rotta', async () => {
    const b = banco()
    const { dati } = await b.dalPc({ changes: [{ key: 'appearance.theme', value: 'paper' }] })
    assert.equal((await b.copia.leggi()).valori.themePreset, 'paper', '⛔ /settings valido non applica')
    assert.match(dati.ricevuta, /^set-[a-f0-9]{12}$/u)
    assert.deepEqual(dati.cambi.map((c) => [c.chiave, c.dopo]), [['appearance.theme', 'paper']])
    const [ricevuta] = await b.servizio.ricevute()
    assert.equal(ricevuta.id, dati.ricevuta)
    assert.deepEqual(ricevuta.origine, { tipo: 'persona' })
    assert.deepEqual(ricevuta.confermatoDa, { tipo: 'finestra-pc' })
    /* il corpo non sceglie chi è: un campo in più nel corpo è un rifiuto, mai un'origine */
    await assert.rejects(b.dalPc({ changes: [{ key: 'appearance.theme', value: 'calm' }], origine: { tipo: 'modello' } }), (e) => e.code === 'QUERY_INVALID' && e.stato === 400)
    await assert.rejects(b.dalPc({ changes: [{ key: 'appearance.theme', value: 'calm' }], confermatoDa: { tipo: 'nessuno' } }), (e) => e.code === 'QUERY_INVALID')
    assert.equal((await b.servizio.ricevute()).length, 1)
})

test('PERSONA-02 chiave sconosciuta, valore fuori elenco, voce della conversazione senza conversazione: rifiutati SENZA scrivere niente', async () => {
    const b = banco()
    await assert.rejects(b.dalPc({ changes: [{ key: 'appearance.nonEsiste', value: 'x' }] }),
        (e) => e.code === 'SETTINGS_APPLY_REFUSED' && e.stato === 400 && e.reason === 'unknown-setting')
    await assert.rejects(b.dalPc({ changes: [{ key: 'appearance.theme', value: 'arcobaleno' }] }),
        (e) => e.code === 'SETTINGS_APPLY_REFUSED' && e.reason === 'invalid-value' && e.params?.chiave === 'appearance.theme')
    /* tutto o niente: una voce buona accanto a una storta non passa */
    await assert.rejects(b.dalPc({ changes: [{ key: 'appearance.theme', value: 'paper' }, { key: 'appearance.theme2', value: 'x' }] }), (e) => e.code === 'SETTINGS_APPLY_REFUSED')
    await assert.rejects(b.dalPc({ changes: [{ key: 'conversation.reasoningEffort', value: 'low' }] }), (e) => e.code === 'SETTINGS_APPLY_REFUSED' && e.reason === 'conversation-needed')
    await assert.rejects(b.dalPc({ changes: [] }), (e) => e.code === 'QUERY_INVALID')
    assert.equal((await b.servizio.ricevute()).length, 0)
    assert.equal((await b.copia.leggi()).valori.themePreset, undefined)
    assert.equal(b.conversazione.scritture.length, 0)
})

test('PERSONA-03 origine esterna: 403 senza scrivere (nessuna origine, un altro sito)', async (t) => {
    const b = banco()
    const base = await ascolta(t, { impostazioniApp: b.servizio })
    const corpo = JSON.stringify({ changes: [{ key: 'appearance.theme', value: 'paper' }] })
    const senza = await fetch(`${base}${APPLICA}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: corpo })
    assert.equal(senza.status, 403)
    const altro = await fetch(`${base}${APPLICA}`, { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://evil.example' }, body: corpo })
    assert.equal(altro.status, 403)
    assert.equal((await b.servizio.ricevute()).length, 0)
    /* la stessa rotta dalla finestra vera passa: il 403 era l'origine, non la rotta */
    const buona = await fetch(`${base}${APPLICA}`, { method: 'POST', headers: { 'content-type': 'application/json', origin: base }, body: corpo })
    assert.equal(buona.status, 200)
    /* le ALTRE rotte delle impostazioni restano chiuse al ponte: solo `apply` si apre */
    const remota = creaChiamataInterna({ httpApp: createHttpApp({ senzaGettone: 'prove', staticHandler: async () => null, impostazioniApp: b.servizio }), porta: 4999 })
    await assert.rejects(remota({ metodo: 'POST', percorso: '/api/v1/app-settings/undo', corpo: { receiptId: 'set-x' }, origine: 'telefono', origineRemota: { tipo: 'telefono', dispositivoId: DISP } }),
        (e) => e.code === 'REMOTE_ORIGIN_FORBIDDEN')
})

test('PERSONA-04 revisione vecchia: rifiutata «changed meanwhile», niente scritto; senza revisione si applica (è la persona a scegliere adesso)', async () => {
    const b = banco()
    const vista = await b.servizio.elenca({ query: 'appearance.theme' })
    const rev = Number(/Revision (\d+)/u.exec(vista.testo)[1])
    await b.dalPc({ changes: [{ key: 'appearance.theme', value: 'paper' }] }) // un altro cambio dopo la lettura
    await assert.rejects(b.dalPc({ changes: [{ key: 'appearance.theme', value: 'calm' }], expectedRevision: rev }),
        (e) => e.code === 'SETTINGS_CHANGED_MEANWHILE' && e.stato === 409 && e.params?.chiave === 'appearance.theme')
    await assert.rejects(b.dalPc({ changes: [{ key: 'appearance.theme', value: 'calm' }], expectedRevision: 99_999 }), (e) => e.code === 'SETTINGS_CHANGED_MEANWHILE')
    assert.equal((await b.copia.leggi()).valori.themePreset, 'paper')
    assert.equal((await b.servizio.ricevute()).length, 1)
    /* con la revisione giusta passa */
    const nuova = Number(/Revision (\d+)/u.exec((await b.servizio.elenca({ query: 'appearance.theme' })).testo)[1])
    await b.dalPc({ changes: [{ key: 'appearance.theme', value: 'calm' }], expectedRevision: nuova })
    assert.equal((await b.copia.leggi()).valori.themePreset, 'calm')
})

test('PERSONA-05 l\'Annulla della persona su un cambio della persona rimette il valore di prima; il secondo Annulla si rifiuta', async () => {
    const b = banco()
    await b.dalPc({ changes: [{ key: 'appearance.theme', value: 'paper' }] })
    const { dati } = await b.dalPc({ changes: [{ key: 'appearance.theme', value: 'ember' }] })
    const annullato = await b.pc('POST', '/api/v1/app-settings/undo', { receiptId: dati.ricevuta })
    assert.equal(annullato.dati.annullata, dati.ricevuta)
    assert.equal((await b.copia.leggi()).valori.themePreset, 'paper')
    const [ultima] = await b.servizio.ricevute()
    assert.equal(ultima.annulla, dati.ricevuta)
    await assert.rejects(b.pc('POST', '/api/v1/app-settings/undo', { receiptId: dati.ricevuta }), (e) => e.code === 'SETTINGS_UNDO_REFUSED')
})

test('PERSONA-06 (Mobile + CLI) dal PONTE: una voce normale si applica con origine e conferma «dispositivo», MAI «persona»', async () => {
    const b = banco()
    const dati = await b.dalPonte({ changes: [{ key: 'appearance.theme', value: 'paper' }] })
    assert.equal((await b.copia.leggi()).valori.themePreset, 'paper')
    const [ricevuta] = await b.servizio.ricevute()
    assert.equal(ricevuta.id, dati.ricevuta)
    assert.deepEqual(ricevuta.origine, { tipo: 'dispositivo', dispositivoId: DISP })
    assert.notEqual(ricevuta.origine.tipo, 'persona', 'la CLI legge «persona» come «al computer»')
    assert.deepEqual(ricevuta.confermatoDa, { tipo: 'dispositivo', dispositivoId: DISP })
    assert.ok(b.operazioni.elenco().includes('app-settings.apply'))
    /* una voce della conversazione dal ponte: l'origine arriva fino alla fonte della conversazione (che la mette nel suo evento) */
    await b.dalPonte({ sessionId: 's1', changes: [{ key: 'conversation.reasoningEffort', value: 'low' }] })
    assert.deepEqual(b.conversazione.scritture.at(-1).origine, { tipo: 'dispositivo', dispositivoId: DISP })
})

test('PERSONA-07 (Mobile) dal PONTE le voci di SICUREZZA e AGGIORNAMENTI: PC_CONFIRMATION_REQUIRED con chiave e nome, niente scritto, mai CONSENT_REQUIRED', async () => {
    const b = banco({ gettone: 'gettone-di-prova' }) // il contrario in fondo è la finestra VERA, cioè quella col gettone (F1 della CLI)
    for (const [chiave, valore] of [['updates.automatic', false], ['tools.wslNormalUser', false]]) {
        await assert.rejects(b.dalPonte({ changes: [{ key: chiave, value: valore }] }), (e) => {
            assert.equal(e.code, 'PC_CONFIRMATION_REQUIRED', chiave)
            assert.notEqual(e.code, 'CONSENT_REQUIRED')
            assert.equal(e.stato, 403)
            assert.equal(e.params?.chiave, chiave)
            assert.ok(typeof e.params?.nome === 'string' && e.params.nome.length > 0 && e.params.nome !== chiave, 'il nome del catalogo, non la chiave')
            assert.ok(typeof e.params?.nomeIt === 'string' && e.params.nomeIt.length > 0)
            return true
        })
    }
    /* insieme a una voce normale: tutto o niente, nemmeno il tema passa */
    await assert.rejects(b.dalPonte({ changes: [{ key: 'appearance.theme', value: 'paper' }, { key: 'updates.automatic', value: false }] }), (e) => e.code === 'PC_CONFIRMATION_REQUIRED')
    assert.equal(b.wsl.scritture, 0)
    assert.equal((await b.copia.leggi()).valori.themePreset, undefined)
    assert.equal((await b.copia.leggi()).valori.aggiornamentiAutomatici, undefined)
    assert.equal((await b.servizio.ricevute()).length, 0)
    /* AL CONTRARIO: la stessa voce dalla finestra del PC passa (è la conferma sul computer) */
    await b.dalPc({ changes: [{ key: 'tools.wslNormalUser', value: false }] })
    assert.equal(b.wsl.scritture, 1)
})

test('PERSONA-08 dal PONTE una voce della CONVERSAZIONE senza il consenso della cartella: CONSENT_REQUIRED (quello vero, della cartella), niente scritto; una voce dell\'app no', async () => {
    const b = banco({ consentita: false })
    await assert.rejects(b.dalPonte({ sessionId: 's1', changes: [{ key: 'conversation.reasoningEffort', value: 'low' }] }), (e) => e.code === 'CONSENT_REQUIRED' && e.params?.nome === 'AVM')
    await assert.rejects(b.dallaRottaRemota({ sessionId: 's1', changes: [{ key: 'conversation.reasoningEffort', value: 'low' }] }),
        (e) => e.code === 'CONSENT_REQUIRED' && e.stato === 403 && e.params?.nome === 'AVM')
    /* e le voci di sicurezza anche lì, senza il ponte davanti */
    await assert.rejects(b.dallaRottaRemota({ changes: [{ key: 'updates.automatic', value: false }] }), (e) => e.code === 'PC_CONFIRMATION_REQUIRED' && e.params?.chiave === 'updates.automatic')
    assert.equal(b.conversazione.scritture.length, 0)
    await b.dalPonte({ sessionId: 's1', changes: [{ key: 'appearance.theme', value: 'paper' }] })
    assert.equal((await b.copia.leggi()).valori.themePreset, 'paper')
})

/* ───────────── Giro 2 delle cure (02/11/2026 notte): revisione della CLI (F1, F2) e condizione del Mobile (voce 6) ───────────── */

test('PERSONA-10 (CLI F1) server SENZA gettone: un programma con `Origin` della finestra non cambia sicurezza né permessi; col gettone sì; una voce di costo sì', async (t) => {
    const b = banco()
    const base = await ascolta(t, { impostazioniApp: b.servizio })
    const applica = (corpo, intestazioni = {}) => fetch(`${base}${APPLICA}`, { method: 'POST', headers: { 'content-type': 'application/json', origin: base, ...intestazioni }, body: JSON.stringify(corpo) })
    for (const corpo of [{ changes: [{ key: 'tools.wslNormalUser', value: false }] }, { sessionId: 's1', changes: [{ key: 'conversation.permissions', value: 'fullAccess' }] },
        { sessionId: 's1', changes: [{ key: 'conversation.coordination', value: true }] }]) {
        const r = await applica(corpo)
        const busta = await r.json()
        assert.equal(r.status, 403, `⛔ ${corpo.changes[0].key} cambiata senza carta da un programma locale`)
        assert.equal(busta.error?.code, 'PC_CONFIRMATION_REQUIRED')
        assert.equal(busta.error?.reason, 'card-required', 'la finestra sa che deve passare dalla carta, non che serve il PC')
        assert.equal(busta.error?.params?.chiave, corpo.changes[0].key)
    }
    assert.equal(b.wsl.scritture, 0)
    assert.equal(b.conversazione.permessi, 'Workspace write')
    assert.equal(b.conversazione.scritture.length, 0)
    assert.equal((await b.servizio.ricevute()).length, 0, 'nessuna ricevuta «confermato dalla finestra»')
    /* una voce di costo, senza gettone, passa: il gruppo a carta sempre è il solo che cambia strada */
    const costo = await applica({ sessionId: 's1', changes: [{ key: 'conversation.reasoningEffort', value: 'low' }] })
    assert.equal(costo.status, 200)
    assert.equal(b.conversazione.sforzo, 'low')
    /* AL CONTRARIO: col gettone (l'app installata) la finestra vera applica, con la ricevuta «finestra-pc» */
    const g = banco()
    const conGettone = await ascolta(t, { impostazioniApp: g.servizio, token: 'gettone-di-prova' })
    for (const corpo of [{ changes: [{ key: 'tools.wslNormalUser', value: false }] }, { sessionId: 's1', changes: [{ key: 'conversation.permissions', value: 'fullAccess' }] }]) {
        const r = await fetch(`${conGettone}${APPLICA}`, { method: 'POST', headers: { 'content-type': 'application/json', origin: conGettone, cookie: 'talos_token=gettone-di-prova' }, body: JSON.stringify(corpo) })
        assert.equal(r.status, 200, corpo.changes[0].key)
    }
    assert.equal(g.wsl.scritture, 1)
    assert.equal(g.conversazione.permessi, 'Full access')
    assert.deepEqual((await g.servizio.ricevute()).map((r) => r.confermatoDa), [{ tipo: 'finestra-pc' }, { tipo: 'finestra-pc' }])
})

test('PERSONA-11 (CLI F2) dalla rotta remota una voce della conversazione SENZA modulo delle cartelle o senza registro: CONSENT_REQUIRED, chiuso a guasto, niente scritto', async () => {
    const b = banco()
    const remota = { tipo: 'telefono', nome: 'X', dispositivoId: DISP }
    const corpo = { sessionId: 's1', changes: [{ key: 'conversation.reasoningEffort', value: 'low' }] }
    const registro = { esiste: (id) => id === 's1', async cartellaPerChatFile(id) { return id === 's1' ? { ok: true, cartella: 'C:/x' } : { code: 'NOT_FOUND' } } }
    for (const [nome, opzioni] of [['senza modulo delle cartelle', { sessionRegistry: registro }], ['senza registro', { remotoFn: () => ({ cartelle: { consentita: async () => true } }) }], ['senza niente', {}]]) {
        const chiama = creaChiamataInterna({ httpApp: createHttpApp({ senzaGettone: 'prove', staticHandler: async () => null, impostazioniApp: b.servizio, ...opzioni }), porta: 4999 })
        await assert.rejects(chiama({ metodo: 'POST', percorso: APPLICA, corpo, origine: 'telefono', origineRemota: remota }),
            (e) => { assert.equal(e.code, 'CONSENT_REQUIRED', nome); assert.equal(e.stato, 403); return true })
    }
    assert.equal(b.conversazione.scritture.length, 0)
    assert.equal((await b.servizio.ricevute()).length, 0)
})

test('PERSONA-12 (Mobile, voce 6) dal ponte una voce della conversazione E di sicurezza, senza consenso della cartella: PC_CONFIRMATION_REQUIRED prima, mai CONSENT_REQUIRED', async () => {
    const b = banco({ consentita: false })
    for (const [chiave, valore] of [['conversation.permissions', 'fullAccess'], ['conversation.coordination', true]]) {
        const corpo = { sessionId: 's1', changes: [{ key: chiave, value: valore }] }
        for (const [porta, via] of [['ponte', b.dalPonte], ['rotta remota', b.dallaRottaRemota]]) {
            await assert.rejects(via(corpo), (e) => {
                assert.equal(e.code, 'PC_CONFIRMATION_REQUIRED', `${chiave} dal ${porta}`)
                assert.equal(e.stato, 403)
                assert.equal(e.params?.chiave, chiave)
                assert.ok(typeof e.params?.nomeIt === 'string' && e.params.nomeIt.length > 0)
                return true
            })
        }
    }
    /* insieme a una voce della conversazione normale: vince ancora il controllo più stretto */
    await assert.rejects(b.dalPonte({ sessionId: 's1', changes: [{ key: 'conversation.reasoningEffort', value: 'low' }, { key: 'conversation.permissions', value: 'readOnly' }] }),
        (e) => e.code === 'PC_CONFIRMATION_REQUIRED')
    assert.equal(b.conversazione.scritture.length, 0)
    /* il consenso resta vero per le voci normali della conversazione (PERSONA-08 non cambia) */
    await assert.rejects(b.dalPonte({ sessionId: 's1', changes: [{ key: 'conversation.reasoningEffort', value: 'low' }] }), (e) => e.code === 'CONSENT_REQUIRED')
})

test('PERSONA-13 (giro 2, voce 1) il modello viene informato: una nota per la conversazione dove la persona ha scritto, in inglese, coi nomi; mai senza conversazione, mai per un rifiuto', async () => {
    const note = []
    const b = banco({ annota: (sessionId, testo) => { note.push({ sessionId, testo }) } })
    const { dati } = await b.dalPc({ sessionId: 's1', changes: [{ key: 'conversation.reasoningEffort', value: 'low' }] })
    assert.equal(note.length, 1)
    assert.equal(note[0].sessionId, 's1')
    assert.match(note[0].testo, /^The user changed a setting on the computer: /u)
    assert.match(note[0].testo, /conversation\.reasoningEffort \(Reasoning (effort|level)[^)]*\): "high" → "low"/u)
    assert.match(note[0].testo, /It applies from this request\.$/u)
    assert.ok(!note[0].testo.includes(dati.ricevuta), 'la ricevuta resta della persona: il modello non la usa')
    /* dal ponte: dice da dove */
    await b.dalPonte({ sessionId: 's1', changes: [{ key: 'appearance.theme', value: 'paper' }] })
    assert.match(note.at(-1).testo, /^The user changed a setting from a paired device: appearance\.theme/u)
    /* l'Annulla della persona: il modello lo sa */
    await b.pc('POST', '/api/v1/app-settings/undo', { receiptId: dati.ricevuta })
    assert.match(note.at(-1).testo, /^The user undid a settings change on the computer: conversation\.reasoningEffort .*"low" → "high"/u)
    assert.equal(note.at(-1).sessionId, 's1')
    /* AL CONTRARIO: senza conversazione, per un valore già uguale, per un rifiuto — niente nota */
    const prima = note.length
    await b.dalPc({ changes: [{ key: 'appearance.density', value: 'comfortable' }] })
    await b.dalPc({ sessionId: 's1', changes: [{ key: 'appearance.theme', value: 'paper' }] }) // già così
    await assert.rejects(b.dalPc({ sessionId: 's1', changes: [{ key: 'appearance.theme', value: 'arcobaleno' }] }), (e) => e.code === 'SETTINGS_APPLY_REFUSED' && e.reason === 'invalid-value')
    assert.equal(note.length, prima)
    /* chi annota e si rompe non cambia l'esito */
    const rotto = banco({ annota: () => { throw new Error('registry gone') } })
    const esito = await rotto.dalPc({ sessionId: 's1', changes: [{ key: 'conversation.reasoningEffort', value: 'low' }] })
    assert.match(esito.dati.ricevuta, /^set-/u)
    assert.equal(rotto.conversazione.sforzo, 'low')
})

/* ───────────── Performance P1 e P2: il giro vero, col kernel vero e un fornitore finto ───────────── */

const enc = new TextEncoder()
const flusso = (fotogrammi) => new Response(new ReadableStream({ start(ctl) { for (const x of fotogrammi) ctl.enqueue(enc.encode(`data: ${JSON.stringify(x)}\n\n`)); ctl.enqueue(enc.encode('data: [DONE]\n\n')); ctl.close() } }))
const chiamata = (id, argomenti) => flusso([{ choices: [{ delta: { tool_calls: [{ index: 0, id, function: { name: 'app_settings', arguments: JSON.stringify(argomenti) } }] } }] }])
const finito = async (eventi, dopo) => {
    const inizio = Date.now()
    while (!eventi.slice(dopo).some((e) => e.type === 'RunFinished' || e.type === 'RunError') && Date.now() - inizio < 10_000) await new Promise((r) => setTimeout(r, 20))
}

test('PERSONA-09 (Performance P1 e P2) a giro in corso il cambio vale dalla PROSSIMA richiesta; nessuna nota nel testo di sistema; la nota del cambio in coda col prossimo messaggio (giro 2, voce 1)', async (t) => {
    const radice = await mkdtemp(join(tmpdir(), 'talos-imp-persona-giro-'))
    t.after(() => rimuoviCartellaDiProvaAttesa(radice))
    const progetto = join(radice, 'progetto')
    await mkdir(progetto, { recursive: true })
    let registro = null
    let base = null
    let sessionId = null
    const impostazioniApp = creaServizioImpostazioni({ fonti: { sessione: creaFonteSessione(() => registro) }, copiaFinestra: creaCopiaFinestra(),
        annotaPerIlModelloFn: (id, testo) => registro.annotaCambioDellaPersona(id, testo) }) // giro 2, voce 1: come in server.mjs
    const corpi = []
    let ricevuta = null
    const fetchDiRete = async (_url, init) => {
        corpi.push(JSON.parse(init?.body ?? '{}'))
        const n = corpi.length - 1
        if (n === 0) {
            /* la persona scrive `/settings` MENTRE il modello lavora (il `sessionId` arriva con la risposta della creazione) */
            const limite = Date.now() + 5_000
            while (!sessionId && Date.now() < limite) await new Promise((r) => setTimeout(r, 5))
            const r = await fetch(`${base}${APPLICA}`, { method: 'POST', headers: { 'content-type': 'application/json', origin: base },
                body: JSON.stringify({ sessionId, changes: [{ key: 'conversation.reasoningEffort', value: 'low' }, { key: 'conversation.model', value: 'z-ai/glm-5.3-flash' }] }) })
            ricevuta = (await r.json()).data?.ricevuta ?? null
            return chiamata('call-list', { action: 'list', section: 'appearance' })
        }
        return flusso([{ choices: [{ delta: { content: 'Fatto.' } }] }])
    }
    registro = createSessionRegistry({
        modello: 'm', chiave: 'k', guardaWorkspaceFn: () => () => {}, impostazioniApp,
        preparaEsecuzioneFn: (taskId) => ({ cartella: progetto, comandoProva: 'npm test', task: { id: taskId, consegna: 'lavora' } }),
        avviaSessioneFn: (input) => avviaSessione({ ...input, talosLavoraFn: (k) => talosLavora({ ...k, fetchDiRete }) }),
    })
    base = await ascolta(t, { sessionRegistry: registro, impostazioniApp, listaTaskDisponibili: () => [{ id: 'sconto-a-scaglioni', progetto: 'p', difficolta: 1, consegnaCorta: 'x' }] })
    const eventi = []
    /* la sessione nasce e il giro parte: il `sessionId` serve alla prima richiesta, quindi si legge dalla risposta prima che il fornitore la veda */
    const risposta = await fetch(`${base}/api/v1/sessions`, { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ taskId: 'sconto-a-scaglioni', permessi: 'Full access', reasoning: { effort: 'high' } }) })
    sessionId = (await risposta.json()).data.sessionId
    t.after(registro.iscriviti(sessionId, (e) => eventi.push(e)))
    await finito(eventi, 0)
    assert.ok(ricevuta, `il cambio a giro in corso non è passato: ${JSON.stringify(eventi.filter((e) => e.type === 'RunError'))}`)
    assert.equal(corpi.length, 2, 'due richieste nel primo giro')
    /* P1: dentro il giro modello, sforzo e attrezzi restano quelli dell'avvio */
    const sforzo = (c) => c.reasoning?.effort ?? c.reasoning_effort ?? null
    assert.equal(corpi[1].model, corpi[0].model, '⛔ il modello è cambiato a metà giro')
    assert.equal(sforzo(corpi[1]), sforzo(corpi[0]), '⛔ lo sforzo è cambiato a metà giro')
    assert.deepEqual(corpi[1].tools, corpi[0].tools, '⛔ gli attrezzi sono cambiati a metà giro')
    assert.equal(sforzo(corpi[0]), 'high')
    assert.equal(registro.impostazioniCorrenti(sessionId).reasoning.effort, 'low', 'il cambio è salvato')
    /* … e dalla prossima richiesta vale */
    const dopo = eventi.length
    registro.resume(sessionId, 'ancora')
    await finito(eventi, dopo)
    assert.equal(corpi.length, 3)
    assert.equal(sforzo(corpi[2]), 'low', 'la prossima richiesta porta lo sforzo nuovo')
    assert.match(String(corpi[2].model), /glm-5\.3-flash/u, 'la prossima richiesta porta il modello nuovo')
    /* P2: il testo di sistema è lo stesso, byte per byte, e nessun messaggio parla del cambio */
    const sistema = (c) => JSON.stringify((c.messages ?? []).filter((m) => m.role === 'system' || m.role === 'developer'))
    assert.equal(sistema(corpi[2]), sistema(corpi[0]), '⛔ la nota è finita nel testo di sistema (il prefisso si ricostruisce)')
    const tutto = JSON.stringify(corpi[2].messages ?? [])
    assert.ok(!tutto.includes(ricevuta), '⛔ la ricevuta è arrivata al modello')
    assert.doesNotMatch(tutto, /You changed|Hai cambiato|"persona"/u)
    /* Giro 2, voce 1 (scelta del Desktop): il modello viene informato con una nota in CODA alla conversazione, col prossimo messaggio della
       persona — mai nel testo di sistema (sopra), mai nelle richieste dello stesso giro (la nota non c'era ancora) */
    const testoDi = (c) => (typeof c === 'string' ? c : JSON.stringify(c ?? ''))
    const conNota = (c) => (c.messages ?? []).findIndex((m) => m.role === 'user' && /The user changed 2 settings on the computer/u.test(testoDi(m.content)))
    assert.equal(conNota(corpi[1]), -1, 'nello stesso giro niente nota')
    const i = conNota(corpi[2])
    assert.ok(i >= 0, `⛔ il modello non sa del cambio: ${tutto.slice(-600)}`)
    const nota = testoDi(corpi[2].messages[i].content)
    assert.match(nota, /conversation\.reasoningEffort .*"high" → "low"/u)
    assert.match(nota, /conversation\.model .*glm-5\.3-flash/u)
    const ultimo = corpi[2].messages.findLastIndex((m) => m.role === 'user')
    assert.match(testoDi(corpi[2].messages[ultimo].content), /ancora/u, 'il messaggio della persona resta l\'ultimo')
    assert.ok(i < ultimo, 'la nota viene PRIMA del messaggio della persona, in coda alla storia')
    assert.equal(registro.annotaCambioDellaPersona('nessuna', 'x'), false)
    /* consegnata una volta: il messaggio dopo non la ripete */
    const ancoraDopo = eventi.length
    registro.resume(sessionId, 'terzo')
    await finito(eventi, ancoraDopo)
    assert.equal(corpi.length, 4)
    assert.equal(corpi[3].messages.filter((m) => m.role === 'user' && /The user changed/u.test(testoDi(m.content))).length, 1, 'la nota resta una sola, nella storia')
    /* l'evento della sessione porta l'origine della persona */
    assert.ok(eventi.some((e) => e.name === 'talos.impostazioni-sessione' && e.value?.origine?.tipo === 'persona' && e.value?.confermatoDa?.tipo === 'finestra-pc'))
})

/*
 * Giro 3 della fase 8, debito B8 (rapporto del giro 2, mutante sopravvissuto): togliere `!consegnaCoda?.origine` faceva partire la nota del
 *   cambio della persona anche con un messaggio IN CODA che non è suo (una domanda o una risposta di un agente, `agent-dialogue`, come la
 *   consegna di `session-registry.mjs` per il dialogo fra agenti). Qui il giro vero col kernel vero: la voce di coda non della persona NON porta
 *   la nota e non la consuma; la voce di coda della persona (`autore: 'persona'`, senza origine) la porta, una volta.
 */
test('PERSONA-14 (giro 3, B8) un messaggio in coda che non è della persona non fa partire la nota al modello; quello della persona sì', async (t) => {
    const radice = await mkdtemp(join(tmpdir(), 'talos-imp-persona-coda-'))
    t.after(() => rimuoviCartellaDiProvaAttesa(radice))
    const progetto = join(radice, 'progetto')
    await mkdir(progetto, { recursive: true })
    const corpi = []
    const fetchDiRete = async (_url, init) => { corpi.push(JSON.parse(init?.body ?? '{}')); return flusso([{ choices: [{ delta: { content: 'Fatto.' } }] }]) }
    const registro = createSessionRegistry({
        modello: 'm', chiave: 'k', guardaWorkspaceFn: () => () => {},
        preparaEsecuzioneFn: (taskId) => ({ cartella: progetto, comandoProva: 'npm test', task: { id: taskId, consegna: 'lavora' } }),
        avviaSessioneFn: (input) => avviaSessione({ ...input, talosLavoraFn: (k) => talosLavora({ ...k, fetchDiRete }) }),
    })
    const base = await ascolta(t, { sessionRegistry: registro, listaTaskDisponibili: () => [{ id: 'sconto-a-scaglioni', progetto: 'p', difficolta: 1, consegnaCorta: 'x' }] })
    const eventi = []
    const risposta = await fetch(`${base}/api/v1/sessions`, { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ taskId: 'sconto-a-scaglioni', permessi: 'Full access' }) })
    const sessionId = (await risposta.json()).data.sessionId
    t.after(registro.iscriviti(sessionId, (e) => eventi.push(e)))
    await finito(eventi, 0)
    assert.equal(corpi.length, 1, 'il primo giro')
    /* la persona ha cambiato un'impostazione: la nota aspetta il suo prossimo messaggio */
    assert.equal(registro.annotaCambioDellaPersona(sessionId, 'The user changed a setting on the computer: NOTA-B8.'), true)
    const testoDi = (c) => (typeof c === 'string' ? c : JSON.stringify(c ?? ''))
    const note = (c) => (c.messages ?? []).filter((m) => m.role === 'user' && /NOTA-B8/u.test(testoDi(m.content))).length
    /* 1. un messaggio in coda di un AGENTE (origine presente): niente nota */
    let dopo = eventi.length
    const agente = registro.resume(sessionId, 'DOMANDA-DELL-AGENTE', [], { consegnaCoda: { codaId: 'coda-agente', origine: 'agent-dialogue', childId: 'figlia-1' } })
    assert.ok(!agente?.code, `la ripresa dell'agente è rifiutata: ${JSON.stringify(agente)}`)
    await finito(eventi, dopo)
    assert.equal(corpi.length, 2)
    assert.match(testoDi(corpi[1].messages.at(-1).content), /DOMANDA-DELL-AGENTE/u, 'controllo positivo: la richiesta è quella dell\'agente')
    assert.equal(note(corpi[1]), 0, '⛔ la nota della persona è partita con un messaggio in coda che non è suo')
    /* 2. il messaggio in coda della PERSONA (autore persona, nessuna origine): la nota parte, prima del suo messaggio */
    dopo = eventi.length
    const persona = registro.resume(sessionId, 'MESSAGGIO-DELLA-PERSONA', [], { consegnaCoda: { codaId: 'coda-persona', autore: 'persona' } })
    assert.ok(!persona?.code, `la ripresa della persona è rifiutata: ${JSON.stringify(persona)}`)
    await finito(eventi, dopo)
    assert.equal(corpi.length, 3)
    assert.equal(note(corpi[2]), 1, '⛔ la nota non è partita col messaggio della persona (o è partita due volte)')
    const ultimo = corpi[2].messages.findLastIndex((m) => m.role === 'user')
    assert.match(testoDi(corpi[2].messages[ultimo].content), /MESSAGGIO-DELLA-PERSONA/u)
    assert.ok(corpi[2].messages.findIndex((m) => m.role === 'user' && /NOTA-B8/u.test(testoDi(m.content))) < ultimo, 'la nota viene prima del messaggio della persona')
})
