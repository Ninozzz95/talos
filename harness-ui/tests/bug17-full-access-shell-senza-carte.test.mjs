/*
 * ⛔⛔ BUG-17 (owner 05/10/2026, «in full access ogni comando terminale viene accettato in automatico
 *   senza passare dall'utente di default») — con «Accesso pieno» la SHELL non fa più NESSUNA domanda:
 *   né F009 (WSL come root), né F15 (segreti), né F-027 (contenuto sospetto). Perimetro:
 *   · solo `shell` — `leggi`/`elenca` sui segreti chiedono ancora, e le SCRITTURE con contenuto
 *     sospetto chiedono ancora (non sono comandi terminale);
 *   · un per-attrezzo «chiedi» resta sovrano (scelta più stretta della persona);
 *   · gli ALTRI livelli non cambiano nulla: «Scrive nel progetto» (nessun livello al kernel) e shell
 *     su «Sempre» continuano a ricevere la carta F009 «una volta per sessione»
 *     (rev-f009-utente-wsl.test.mjs, ora con livelloAccesso 'nessuno').
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { talosLavora, verificaPermessoScrittura } from '../src/kernel/talosHarness.mjs'
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

const comeRoot = async () => ({ distro: 'Ubuntu', utente: 'root' })

async function giro(t, { chiamate = [['shell', { comando: 'echo ciao' }]], livelloAccesso = 'accesso-pieno', consensiSessione = {}, rootWslDelComandoFn, permessiPerAttrezzo } = {}) {
    const cartella = mkdtempSync(join(tmpdir(), 'talos-b17-'))
    t.after(() => rimuoviCartellaDiProva(cartella))
    const chieste = [], eseguiti = [], esiti = [], ricevute = [], interrogati = []
    await talosLavora({
        cartella, task: { consegna: 'lavora' }, modello: 'f', chiave: 'k', giriMassimi: 4,
        /* 'nessuno' = la politica «Scrive nel progetto», che arriva al kernel SENZA livello (livelloDaPermessi). */
        livelloAccesso: livelloAccesso === 'nessuno' ? undefined : livelloAccesso,
        fetchDiRete: fornitore(chiamate),
        onGiro: (e) => { if (e.tipo === 'tool-esito') esiti.push(togliConfiniDati(String(e.content))); if (e.tipo === 'ricevuta') ricevute.push(e.ricevuta) },
        chiediApprovazioneFn: async (a) => { chieste.push(a); return true },
        eseguiComandoSandboxatoFn: async (comando, _cartella, opzioni) => { eseguiti.push({ comando, opzioni }); return { codice: 0, testo: 'ciao', enforcement: 'wsl2', wsl: { utente: 'root', root: true, disco: { montaggio: '/mnt/c', metadata: false } } } },
        consensiSessione,
        ...(rootWslDelComandoFn ? { rootWslDelComandoFn: async (comando, opzioni) => { interrogati.push({ comando, opzioni }); return rootWslDelComandoFn(comando, opzioni) } } : {}),
        ...(permessiPerAttrezzo ? { permessiPerAttrezzo } : {}),
    })
    return { chieste, eseguiti, esiti, ricevute, interrogati }
}

/* ── F009 in accesso pieno: il sì di sessione si concede da solo ────────────────────────────── */

test('B17-F009-01: accesso pieno + WSL root — ZERO carte, il comando gira, il sì di sessione si concede da solo', async (t) => {
    const consensiSessione = {}
    const primo = await giro(t, { consensiSessione, rootWslDelComandoFn: comeRoot, chiamate: [['shell', { comando: 'echo uno' }], ['shell', { comando: 'echo due' }]] })
    assert.equal(primo.chieste.length, 0, 'in accesso pieno nessuna carta, nemmeno la prima volta')
    assert.deepEqual(primo.eseguiti.map((e) => e.comando), ['echo uno', 'echo due'])
    assert.equal(consensiSessione.rootWsl, true, 'il sì «una volta per sessione» è concesso da solo')
    const secondo = await giro(t, { consensiSessione, rootWslDelComandoFn: comeRoot })
    assert.equal(secondo.interrogati.length, 0, 'dal secondo giro né carta né sonda')
    assert.equal(secondo.eseguiti.length, 1)
})

test('B17-F009-02: accesso pieno + segreto + root — nessuna carta nemmeno per `cat ~/.ssh/id_rsa`', async (t) => {
    const { chieste, eseguiti } = await giro(t, { rootWslDelComandoFn: comeRoot, chiamate: [['shell', { comando: 'cat ~/.ssh/id_rsa' }]] })
    assert.equal(chieste.length, 0, 'F15 non interrompe più la shell in accesso pieno (owner 05/10)')
    assert.equal(eseguiti.length, 1)
})

test('B17-F009-03: un per-attrezzo «chiedi» resta sovrano anche in accesso pieno', async (t) => {
    const { chieste, eseguiti } = await giro(t, { rootWslDelComandoFn: comeRoot, permessiPerAttrezzo: { shell: 'chiedi' } })
    assert.equal(chieste.length, 1, 'una carta sola: quella del comando scelto dalla persona')
    assert.equal(chieste[0].wslRoot, undefined, 'non si aggiunge la seconda carta di root')
    assert.equal(eseguiti.length, 1)
})

test('B17-F009-04: contropelo — «Scrive nel progetto» (nessun livello) chiede ANCORA la carta di root', async (t) => {
    const { chieste } = await giro(t, { livelloAccesso: 'nessuno', rootWslDelComandoFn: comeRoot })
    assert.equal(chieste.length, 1, 'il perimetro della decisione 01/10 resta per gli altri livelli')
    assert.equal(chieste[0].wslRoot.utente, 'root')
})

/* ── il cancello dei permessi, chiamato da solo ─────────────────────────────────────────────── */

test('B17-UNIT-01: accesso pieno + shell + segreto — via «nessun-vincolo», nessun canale richiesto', async () => {
    const esito = await verificaPermessoScrittura({ tipo: 'shell', comando: 'cat .env' }, { livelloAccesso: 'accesso-pieno' })
    assert.equal(esito.consentito, true)
    assert.equal(esito.via, 'nessun-vincolo')
})

test('B17-UNIT-02: accesso pieno + shell + contenuto sospetto — nessuna domanda (F-027 fuori dalla shell)', async () => {
    const esito = await verificaPermessoScrittura(
        { tipo: 'shell', comando: 'echo ciao' },
        { livelloAccesso: 'accesso-pieno', sospetto: { motivi: ['istruzione-per-un-ia'], fonte: 'pagina-web' } },
    )
    assert.equal(esito.consentito, true)
    assert.equal(esito.via, 'nessun-vincolo')
})

test('B17-UNIT-03: contropelo — una SCRITTURA con contenuto sospetto chiede ANCORA anche in accesso pieno', async () => {
    const esito = await verificaPermessoScrittura(
        { tipo: 'scrivi', percorso: 'nota.txt' },
        { livelloAccesso: 'accesso-pieno', sospetto: { motivi: ['istruzione-per-un-ia'], fonte: 'pagina-web' } },
    )
    assert.equal(esito.consentito, false)
    assert.equal(esito.via, 'contenuto-sospetto')
})

test('B17-UNIT-04: contropelo — una LETTURA su un segreto chiede ANCORA anche in accesso pieno', async () => {
    const esito = await verificaPermessoScrittura({ tipo: 'leggi', percorso: '.env' }, { livelloAccesso: 'accesso-pieno' })
    assert.equal(esito.consentito, false)
    assert.equal(esito.via, 'segreto-forza-conferma')
})

test('B17-UNIT-05: contropelo — «Scrive nel progetto» + shell + segreto chiede come prima (F15 resta in piedi)', async () => {
    const esito = await verificaPermessoScrittura({ tipo: 'shell', comando: 'cat .env' }, {})
    assert.equal(esito.consentito, false)
    assert.equal(esito.via, 'segreto-forza-conferma')
})
