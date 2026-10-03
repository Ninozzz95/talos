/*
 * F001b, decisione owner 01/10/2026 «Ricerca che continua» (riferimento esplicito, nella sessione, in memoria): ripgrep che
 * supera il tempo della risposta resta vivo nella sessione e si riprende con `cerca {"continua": id}`. E un timeout senza
 * risultati non fa più partire la camminata in JavaScript. Confronto coi concorrenti in `src/kernel/ricerche-in-corso.mjs`.
 * Confine di processo finto (come SEARCH32): `spawn` restituisce un ripgrep che manda righe nel tempo.
 */
import assert from 'node:assert/strict'
import test, { mock } from 'node:test'
import { createRequire, syncBuiltinESMExports } from 'node:module'
import { EventEmitter } from 'node:events'
import { mkdtemp, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { cercaNelProgetto, tempoRipgrepPer } from '../src/kernel/talosHarness.mjs'
import { creaRegistroRicerche } from '../src/kernel/ricerche-in-corso.mjs'
import { rimuoviCartellaDiProvaAttesa } from './aiuto/rimuovi-cartella-di-prova.mjs'
const childProcess = createRequire(import.meta.url)('node:child_process')
const dormi = (ms) => new Promise((ok) => setTimeout(ok, ms))

/* Ogni elemento di `piani` è UN processo rg: righe nel tempo, poi l'uscita. `uccisi` conta i kill. */
async function banco(t, piani) {
    const radice = await mkdtemp(join(tmpdir(), 'talos-rc-'))
    await mkdir(join(radice, '.git'))
    const prima = process.env.TALOS_RG_PATH
    process.env.TALOS_RG_PATH = process.execPath
    const stato = { avviati: [], uccisi: 0, elencate: 0 }
    const patch = mock.method(childProcess, 'spawn', (_exe, args) => {
        const piano = piani[Math.min(stato.avviati.length, piani.length - 1)]
        stato.avviati.push(args)
        const figlio = new EventEmitter()
        figlio.stdout = new EventEmitter(); figlio.stderr = new EventEmitter()
        const timer = []
        let chiuso = false
        const chiudi = (codice, segnale) => { if (chiuso) return; chiuso = true; timer.forEach(clearTimeout); figlio.emit('close', codice, segnale) }
        figlio.kill = () => { stato.uccisi++; queueMicrotask(() => chiudi(null, 'SIGTERM')); return true }
        for (const { dopoMs, testo } of piano.righe ?? []) timer.push(setTimeout(() => { if (!chiuso) figlio.stdout.emit('data', Buffer.from(testo)) }, dopoMs))
        if (piano.stderr) timer.push(setTimeout(() => { if (!chiuso) figlio.stderr.emit('data', Buffer.from(piano.stderr)) }, 1))
        timer.push(setTimeout(() => chiudi(piano.codice ?? 0, null), piano.chiusuraMs ?? 5))
        return figlio
    })
    syncBuiltinESMExports()
    t.after(async () => {
        patch.mock.restore(); syncBuiltinESMExports()
        if (prima === undefined) delete process.env.TALOS_RG_PATH; else process.env.TALOS_RG_PATH = prima
        await rimuoviCartellaDiProvaAttesa(radice)
    })
    const disco = { async elenca() { stato.elencate++; return [] }, async leggi() { assert.fail('nessuna camminata JS') } }
    const cerca = (argomenti, opzioni = {}) => cercaNelProgetto(disco, argomenti, { radice, tempoRgMs: 120, ...opzioni })
    return { cerca, stato }
}

const LENTO = { righe: [{ dopoMs: 10, testo: 'src/a.txt:1:needle uno\n' }, { dopoMs: 400, testo: 'src/b.txt:2:needle due\n' }], chiusuraMs: 600 }

test('RC-01: oltre il tempo della risposta la ricerca CONTINUA: mostra ciò che c è e dà il riferimento, rg non muore', async (t) => {
    const { cerca, stato } = await banco(t, [LENTO])
    const ricerche = creaRegistroRicerche()
    const esito = await cerca({ testo: 'needle' }, { ricerche })
    assert.match(esito, /\[TALOS: this search is still running as search "r1"/u)
    assert.match(esito, /cerca \{"continua":"r1"\}/u)
    assert.match(esito, /src\/a\.txt:1:needle uno/u)
    assert.doesNotMatch(esito, /src\/b\.txt/u)
    assert.equal(stato.uccisi, 0, 'ripgrep resta vivo')
    assert.equal(stato.elencate, 0, 'nessuna camminata JS')
})

test('RC-02: «continua» a ricerca finita dà tutto, e la pagina dopo si chiede ancora con «continua»', async (t) => {
    const { cerca } = await banco(t, [LENTO])
    const ricerche = creaRegistroRicerche()
    await cerca({ testo: 'needle' }, { ricerche })
    await dormi(700)
    const esito = await cerca({ continua: 'r1' }, { ricerche })
    assert.match(esito, /\[TALOS: search "r1" finished/u)
    assert.match(esito, /src\/a\.txt:1:needle uno/u)
    assert.match(esito, /src\/b\.txt:2:needle due/u)
    assert.doesNotMatch(esito, /still running/u)
})

test('RC-03: senza registro, un timeout SENZA risultati non fa partire la camminata JS e lo dice', async (t) => {
    const { cerca, stato } = await banco(t, [{ righe: [], chiusuraMs: 2000 }])
    const esito = await cerca({ testo: 'needle' })
    assert.equal(stato.elencate, 0, 'prima qui ripartiva la camminata lenta')
    assert.equal(stato.uccisi, 1)
    assert.match(esito, /took longer than 0\.12 s and was stopped/u)
})

test('RC-04: con 2 ricerche già vive la terza non continua: si ferma al tempo e dice perché', async (t) => {
    const { cerca, stato } = await banco(t, [{ righe: [{ dopoMs: 5, testo: 'x.txt:1:needle\n' }], chiusuraMs: 3000 }])
    const ricerche = creaRegistroRicerche()
    await cerca({ testo: 'needle' }, { ricerche })
    await cerca({ testo: 'needle', dentro: '' }, { ricerche })
    const terza = await cerca({ testo: 'altro' }, { ricerche })
    assert.match(terza, /2 searches are already running in this session/u)
    assert.equal(stato.uccisi, 1)
    ricerche.fermaTutte()
})

test('RC-05: Stop ferma le ricerche vive, e «continua» dice che il risultato è parziale', async (t) => {
    const { cerca, stato } = await banco(t, [LENTO])
    const ricerche = creaRegistroRicerche()
    await cerca({ testo: 'needle' }, { ricerche })
    ricerche.fermaTutte('fermata')
    await dormi(20)
    assert.equal(stato.uccisi, 1)
    const esito = await cerca({ continua: 'r1' }, { ricerche })
    assert.match(esito, /\[TALOS: search "r1" was stopped with Stop; the results below are partial/u)
    assert.match(esito, /src\/a\.txt:1:needle uno/u)
})

test('RC-06: il tetto di durata ferma la ricerca e lo dichiara', async (t) => {
    const { cerca } = await banco(t, [LENTO])
    const ricerche = creaRegistroRicerche({ durataMassimaMs: 200 })
    await cerca({ testo: 'needle' }, { ricerche })
    await dormi(260)
    const esito = await cerca({ continua: 'r1' }, { ricerche })
    assert.match(esito, /\[TALOS: search "r1" reached its time limit \(0\.2 s\) and was stopped; the results below are partial/u)
})

test('RC-07: finita da più del tempo di conservazione, «continua» rifiuta e dice di rifarla', async (t) => {
    const { cerca } = await banco(t, [LENTO])
    const ricerche = creaRegistroRicerche({ conservaDopoMs: 30 })
    await cerca({ testo: 'needle' }, { ricerche })
    await dormi(700)
    const esito = await cerca({ continua: 'r1' }, { ricerche })
    assert.match(esito, /^NOT FOUND\. There is no search "r1" in this session/u) // H-05
    assert.match(esito, /run the search again/u)
})

test('RC-08: «continua» senza registro rifiuta con il perché', async (t) => {
    const { cerca } = await banco(t, [LENTO])
    const esito = await cerca({ continua: 'r1' })
    assert.match(esito, /^NOT FOUND\. Searches do not continue in the background here/u) // H-05
})

test('RC-09: se ripgrep fallisce per EAGAIN si ritenta su un solo thread (-j 1), come Claude Code', async (t) => {
    const { cerca, stato } = await banco(t, [
        { righe: [], stderr: 'rg: failed to spawn thread: Resource temporarily unavailable (os error 11)', codice: 2, chiusuraMs: 5 },
        { righe: [{ dopoMs: 2, testo: 'src/a.txt:1:needle\n' }], chiusuraMs: 10 },
    ])
    const esito = await cerca({ testo: 'needle' })
    assert.equal(stato.avviati.length, 2)
    assert.deepEqual(stato.avviati[1].slice(0, 2), ['-j', '1'])
    assert.match(esito, /src\/a\.txt:1:needle/u)
})

test('RC-10: i percorsi WSL hanno 60 s, gli altri 20 s (Claude Code: 60 su WSL)', () => {
    assert.equal(tempoRipgrepPer('\\\\wsl.localhost\\Ubuntu\\home\\me\\progetto'), 60_000)
    assert.equal(tempoRipgrepPer('\\\\wsl$\\Ubuntu\\home'), 60_000)
    assert.equal(tempoRipgrepPer('C:\\Users\\me\\progetto'), 20_000)
})

test('RC-11: anche la ricerca dei NOMI continua', async (t) => {
    const { cerca } = await banco(t, [{ righe: [{ dopoMs: 5, testo: 'src/alfa.mjs\0' }, { dopoMs: 400, testo: 'src/alfa-due.mjs\0' }], chiusuraMs: 600 }])
    const ricerche = creaRegistroRicerche()
    const prima = await cerca({ nome: 'alfa' }, { ricerche })
    assert.match(prima, /still running as search "r1"/u)
    await dormi(700)
    const dopo = await cerca({ continua: 'r1' }, { ricerche })
    assert.match(dopo, /src\/alfa-due\.mjs/u)
})

test('RC-12: oltre i byte massimi la ricerca in sottofondo si ferma e lo dichiara', async (t) => {
    const { cerca } = await banco(t, [{ righe: [{ dopoMs: 5, testo: 'src/a.txt:1:needle\n' }, { dopoMs: 200, testo: 'x'.repeat(5000) + '\n' }], chiusuraMs: 2000 }])
    const ricerche = creaRegistroRicerche({ byteMassimi: 1000 })
    await cerca({ testo: 'needle' }, { ricerche })
    await dormi(300)
    const esito = await cerca({ continua: 'r1' }, { ricerche })
    assert.match(esito, /\[TALOS: search "r1" produced too much output and was stopped; the results below are partial/u)
})

test('RC-13: col ripgrep VERO su un albero vero, la ricerca che continua arriva a TUTTI i file', async (t) => {
    const { writeFile } = await import('node:fs/promises')
    const radice = await mkdtemp(join(tmpdir(), 'talos-rc13-'))
    t.after(() => rimuoviCartellaDiProvaAttesa(radice))
    await mkdir(join(radice, '.git'))
    for (let d = 0; d < 20; d++) {
        await mkdir(join(radice, `d${d}`))
        await Promise.all(Array.from({ length: 50 }, (_, f) => writeFile(join(radice, `d${d}`, `f${f}.txt`), `riga\nago nel pagliaio ${d}-${f}\nfine\n`)))
    }
    const prima = process.env.TALOS_RG_PATH
    delete process.env.TALOS_RG_PATH
    t.after(() => { if (prima !== undefined) process.env.TALOS_RG_PATH = prima })
    const ricerche = creaRegistroRicerche()
    const disco = { async elenca() { assert.fail('nessuna camminata JS') }, async leggi() { assert.fail('nessuna camminata JS') } }
    const primo = await cercaNelProgetto(disco, { testo: 'ago nel pagliaio' }, { radice, ricerche, tempoRgMs: 1 })
    assert.match(primo, /still running as search "r1"/u, primo.slice(0, 300))
    let finale
    for (let i = 0; i < 50 && !/finished/u.test(finale ?? ''); i++) finale = await cercaNelProgetto(disco, { continua: 'r1' }, { radice, ricerche, tempoRgMs: 2000 })
    assert.match(finale, /\[TALOS: search "r1" finished/u)
    // 1000 file con la parola: la prima pagina ne mostra 40 e dice quanti ne restano, con la via per proseguire
    assert.match(finale, /… and 960 more files with matches not shown/u)
    assert.match(finale, /nextOffset: 40\. Continue with cerca \{"continua":"r1","offset":40\}/u)
    const ultima = await cercaNelProgetto(disco, { continua: 'r1', offset: 960 }, { radice, ricerche })
    assert.equal(ultima.split('\n').filter((r) => /ago nel pagliaio/u.test(r)).length, 40)
    assert.doesNotMatch(ultima, /nextOffset/u)
})
