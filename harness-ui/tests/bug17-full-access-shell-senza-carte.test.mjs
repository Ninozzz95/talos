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
    /* A3-R1 (07/10/2026): prima qui si asseriva `true` — cioè si fissava il difetto. Il sì dell'Accesso pieno si deriva dal
       livello e non si scrive fra i sì di sessione, o sopravvive al downgrade (B17-F009-05). */
    assert.equal(consensiSessione.rootWsl, undefined, 'il sì dell\'Accesso pieno non si scrive fra i sì della persona')
    const secondo = await giro(t, { consensiSessione, rootWslDelComandoFn: comeRoot })
    assert.equal(secondo.interrogati.length, 0, 'dal secondo giro né carta né sonda')
    assert.equal(secondo.eseguiti.length, 1)
})

test('B17-F009-02: accesso pieno + root — `cat .env` senza carta; `cat ~/.ssh/id_rsa` UNA carta (owner 16/10 notte: le credenziali della casa chiedono sempre)', async (t) => {
    const progetto = await giro(t, { rootWslDelComandoFn: comeRoot, chiamate: [['shell', { comando: 'cat .env' }]] })
    assert.equal(progetto.chieste.length, 0, 'un segreto del progetto resta libero in accesso pieno (owner 12/10)')
    assert.equal(progetto.eseguiti.length, 1)
    const casa = await giro(t, { rootWslDelComandoFn: comeRoot, chiamate: [['shell', { comando: 'cat ~/.ssh/id_rsa' }]] })
    assert.equal(casa.chieste.length, 1, 'una credenziale della casa chiede anche in accesso pieno')
    assert.equal(casa.chieste[0].segreto?.credenzialeDellaCasa, true)
    assert.equal(casa.eseguiti.length, 1, 'dopo il sì il comando gira')
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

/*
 * ⛔⛔ A3-R1 (07/10/2026, riserva R1 della review BUG-17) — IL SÌ DELL'ACCESSO PIENO NON È UN SÌ DELLA PERSONA.
 *   Prima della cura l'Accesso pieno SCRIVEVA `consensiSessione.rootWsl = true`: abbassato il permesso, la carta di root
 *   non tornava più, e il sì «una volta per sessione» risultava dato senza che nessuno l'avesse dato. Forma di Hermes
 *   (`tools/approval.py:53-54`, `:268-283`): il permesso massimo si DERIVA dal livello corrente, non si scrive fra i sì.
 */
test('B17-F009-05: Accesso pieno, poi «Scrive nel progetto» — la carta di root TORNA (il downgrade revoca)', async (t) => {
    const consensiSessione = {}
    const pieno = await giro(t, { consensiSessione, rootWslDelComandoFn: comeRoot })
    assert.equal(pieno.chieste.length, 0, 'in Accesso pieno nessuna carta')
    const abbassato = await giro(t, { consensiSessione, livelloAccesso: 'nessuno', rootWslDelComandoFn: comeRoot })
    assert.equal(abbassato.chieste.length, 1, 'dopo il downgrade la carta di root si chiede di nuovo')
    assert.equal(abbassato.chieste[0].wslRoot.utente, 'root')
})

test('B17-F009-06: contropelo — il sì DATO DALLA PERSONA sopravvive a Accesso pieno e ritorno', async (t) => {
    const consensiSessione = {}
    const prima = await giro(t, { consensiSessione, livelloAccesso: 'nessuno', rootWslDelComandoFn: comeRoot })
    assert.equal(prima.chieste.length, 1, 'la persona risponde sì alla carta di root')
    assert.equal(consensiSessione.rootWsl, true)
    await giro(t, { consensiSessione, rootWslDelComandoFn: comeRoot })
    const dopo = await giro(t, { consensiSessione, livelloAccesso: 'nessuno', rootWslDelComandoFn: comeRoot })
    assert.equal(dopo.chieste.length, 0, 'il sì della persona vale per tutta la sessione, qualunque livello ci sia stato in mezzo')
    assert.equal(dopo.interrogati.length, 0, 'e non si rispende la sonda')
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

/*
 * ⛔⛔ Owner 12/10/2026, «FULL ACCESS PER LEGGE NON DEVE CHIEDERE NESSUN PERMESSO» — il perimetro di BUG-17 (solo la shell) si
 *   allarga a TUTTO l'Accesso pieno: anche una lettura o un elenco su un segreto (owner: «File segreti» fra quelle da togliere) e
 *   una scrittura dopo un contenuto sospetto (F-027). Stesso confine di Claude Code `bypassPermissions` e Hermes «yolo»: nessuna
 *   domanda; restano le scelte ESPLICITE della persona (un «chiedi» o un «nega» per attrezzo). Queste due prove prima fissavano il
 *   contrario («chiede ANCORA»).
 */
test('B17-UNIT-03: accesso pieno — una SCRITTURA dopo un contenuto sospetto non chiede più (owner 12/10)', async () => {
    const esito = await verificaPermessoScrittura(
        { tipo: 'scrivi', percorso: 'nota.txt' },
        { livelloAccesso: 'accesso-pieno', sospetto: { motivi: ['istruzione-per-un-ia'], fonte: 'pagina-web' } },
    )
    assert.equal(esito.consentito, true)
    assert.equal(esito.via, 'nessun-vincolo')
})

test('B17-UNIT-04: accesso pieno — leggere un segreto del PROGETTO non chiede (owner 12/10); una credenziale della CASA sì, e senza nessuno davanti si rifiuta (owner 16/10 notte)', async () => {
    const progetto = await verificaPermessoScrittura({ tipo: 'leggi', percorso: '.env' }, { livelloAccesso: 'accesso-pieno' })
    assert.equal(progetto.consentito, true)
    assert.equal(progetto.via, 'nessun-vincolo')
    for (const azione of [{ tipo: 'leggi', percorso: '~/.ssh/id_rsa' }, { tipo: 'elenca', percorso: '~/.ssh' }, { tipo: 'leggi', percorso: '~/.npmrc' }]) {
        const esito = await verificaPermessoScrittura(azione, { livelloAccesso: 'accesso-pieno' })
        assert.equal(esito.consentito, false, JSON.stringify(azione))
        assert.equal(esito.via, 'segreto-forza-conferma', JSON.stringify(azione))
    }
    /* AL CONTRARIO: ~/.ssh/config non è una credenziale (non ha chiavi) e in accesso pieno resta libero */
    assert.equal((await verificaPermessoScrittura({ tipo: 'leggi', percorso: '~/.ssh/config' }, { livelloAccesso: 'accesso-pieno' })).via, 'nessun-vincolo')
})

test('B17-UNIT-06: contropelo — sotto l\'Accesso pieno il segreto e il contenuto sospetto chiedono come prima', async () => {
    for (const livelloAccesso of [undefined, 'scrittura-progetto', 'su-richiesta']) {
        const lettura = await verificaPermessoScrittura({ tipo: 'leggi', percorso: '.env' }, { livelloAccesso })
        assert.equal(lettura.via, 'segreto-forza-conferma', `${livelloAccesso}: lettura di un segreto`)
    }
    // il livello di serie (nessun livello al kernel): senza cartella «Scrive nel progetto» chiederebbe prima per «fuori dal progetto»
    const scrittura = await verificaPermessoScrittura({ tipo: 'scrivi', percorso: 'nota.txt' },
        { permessiPerAttrezzo: { scrivi: 'sempre' }, sospetto: { motivi: ['istruzione-per-un-ia'], fonte: 'pagina-web' } })
    assert.equal(scrittura.via, 'contenuto-sospetto', 'scrittura dopo un contenuto sospetto')
})

test('B17-UNIT-07: contropelo — in accesso pieno le scelte ESPLICITE della persona restano sovrane («chiedi» e «nega» per attrezzo)', async () => {
    const chiede = await verificaPermessoScrittura({ tipo: 'leggi', percorso: '.env' }, { livelloAccesso: 'accesso-pieno', permessiPerAttrezzo: { leggi: 'chiedi' } })
    assert.equal(chiede.consentito, false, 'il «chiedi» scelto dalla persona fa la sua domanda')
    const nega = await verificaPermessoScrittura({ tipo: 'leggi', percorso: '.env' }, { livelloAccesso: 'accesso-pieno', permessiPerAttrezzo: { leggi: 'nega' } })
    assert.equal(nega.consentito, false)
    assert.equal(nega.via, 'permesso-per-attrezzo-nega')
})

test('B17-UNIT-05: contropelo — «Scrive nel progetto» + shell + segreto chiede come prima (F15 resta in piedi)', async () => {
    const esito = await verificaPermessoScrittura({ tipo: 'shell', comando: 'cat .env' }, {})
    assert.equal(esito.consentito, false)
    assert.equal(esito.via, 'segreto-forza-conferma')
})
