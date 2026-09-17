/*
 * ⛔⛔⛔ BC-57 — `prova` DICEVA «exit 0» SU UNA CARTELLA CHE NON HA UNA SUITE.
 *
 * La segnalazione (trascritto dell'app installata 0.1.13, sessione `4c3e1649`,
 * cartella `C:\Users\Antonino\Desktop`, `comandoProva: 'npm test'`): l'attrezzo
 * ha risposto `exit 0` con uscita VUOTA. Un `exit 0` e' la forma esatta di «i
 * test passano»: il modello ci costruisce sopra il resto del task, e il nudge
 * «scritture senza prova» si azzera — cioe' il risultato sbagliato coincide con
 * quello giusto, e nessuno lo guarda.
 *
 * ⛔ MISURATO PRIMA DI SCRIVERE LA CURA, non dedotto (17/09/2026, Node v24.18.0,
 * Windows 11): lo stesso `spawn(comando, {cwd, shell:true})` su una cartella
 * senza `package.json` NON da' `exit 0`. Da' `4294963238` (cioe' `-4058`
 * senza segno, l'`ENOENT` di libuv su Windows) e 436 byte su stderr, e npm
 * dichiara di aver cercato il file risalendo fino alla RADICE del disco
 * (`npm error path C:\package.json`). Dal kernel, via `talosLavora` con un
 * fornitore finto, l'esito misurato e' identico: `exit 4294963238` col testo
 * npm intero. ⇒ **La forma «exit 0 + uscita vuota» NON e' stata riprodotta**
 * su questo codice: la prima prova qui sotto e' il verbale di quella misura, e
 * resta rossa il giorno in cui il comportamento cambia.
 *
 * ⇒ La cura non aspetta la causa: l'attrezzo non puo' MAI dire «exit 0, tutto
 *   bene» quando non ha nemmeno una suite da lanciare. Prima di lanciare
 *   `comandoProva` si verifica che una suite riconoscibile ci sia, e se manca
 *   `prova` risponde con un codice != 0 e NON conta come «provato».
 *
 * ⛔ Ricerca 17/09/2026, «come trattano il caso gli altri»: ne' Claude Code ne'
 *   Codex CLI hanno un attrezzo `prova` — i test si lanciano con l'attrezzo di
 *   shell generico (developers.openai.com/codex/cli: Codex «can run shell
 *   commands including build steps, test suites, and linters, and can react to
 *   the output»; per Claude Code la stessa cosa passa da Bash). ⇒ Non esiste un
 *   equivalente da copiare: il loro «comando di test assente» e' semplicemente
 *   l'errore del comando, con exit code e stderr veri. La nostra garanzia in
 *   piu' e' proprio quella che mancava: un attrezzo DEDICATO deve distinguere
 *   «la suite e' rossa» da «la suite non c'e'».
 */
import { strict as assert } from 'node:assert'
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { talosLavora } from '../src/kernel/talosHarness.mjs'
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs'

const enc = new TextEncoder()

/** Un finto backend: gli si danno i fotogrammi, li manda come SSE e chiude con `[DONE]`. */
const fintoBackend = (fotogrammi) => new Response(new ReadableStream({
    start(c) {
        for (const f of fotogrammi) c.enqueue(enc.encode(`data: ${JSON.stringify(f)}\n\n`))
        c.enqueue(enc.encode('data: [DONE]\n\n'))
        c.close()
    },
}))

/* ⛔ FABBRICHE, non valori: un `Response` si legge UNA volta sola — riusarlo fra due prove le fa
   morire tutte con «ReadableStream is locked». Misurato scrivendo questo file. */
const chiamata = (nome, argomenti = {}, id = `call_${nome}`) => () => fintoBackend([
    { choices: [{ delta: { tool_calls: [{ index: 0, id, function: { name: nome, arguments: JSON.stringify(argomenti) } }] } }] },
])
const testoFinale = () => fintoBackend([{ choices: [{ delta: { content: 'finito' } }] }])

/**
 * Fa girare `talosLavora` su una sequenza di chiamate decise da noi: al giro
 * `i` risponde con la `i`-esima, poi con del testo. Nessuna rete vera.
 */
async function giro(cartella, chiamate, opzioni = {}) {
    let n = 0
    const ricevute = []
    const esito = await talosLavora({
        cartella, task: { consegna: 'lavora' }, modello: 'x', chiave: 'y',
        onDelta: () => {},
        onGiro: (e) => { if (e.tipo === 'ricevuta') ricevute.push(e.ricevuta) },
        fetchDiRete: async () => (n < chiamate.length ? chiamate[n++]() : testoFinale()),
        ...opzioni,
    })
    return { esiti: esito.messaggiFinali.filter((m) => m.role === 'tool').map((m) => m.content), ricevute }
}

/** Lo stesso giro che fa npm, riscritto nel test: serve a PROVARE la precondizione, non a fidarsene. */
function manifestoPiuVicinoNelTest(dove) {
    let corrente = dove
    for (;;) {
        const candidato = join(corrente, 'package.json')
        if (existsSync(candidato)) return candidato
        const sopra = dirname(corrente)
        if (sopra === corrente) return null
        corrente = sopra
    }
}

function cartellaTemporanea(t, { packageJson } = {}) {
    const cartella = mkdtempSync(join(tmpdir(), 'bc57-'))
    t.after(() => rimuoviCartellaDiProva(cartella))
    if (packageJson) writeFileSync(join(cartella, 'package.json'), JSON.stringify(packageJson))
    return cartella
}

describe('BC-57 — `prova` senza una suite da lanciare', () => {
    it('⭐⭐⭐ VERBALE DELLA MISURA — lo spawn grezzo su una cartella senza package.json NON da\' «exit 0 vuoto»', async (t) => {
        const cartella = cartellaTemporanea(t)
        const misura = await new Promise((ok) => {
            const p = spawn('npm test', { cwd: cartella, shell: true, windowsHide: true })
            let testo = ''
            p.stdout?.on('data', (d) => { testo += d })
            p.stderr?.on('data', (d) => { testo += d })
            p.on('close', (codice) => ok({ codice, testo }))
            p.on('error', (e) => ok({ codice: -1, testo: String(e.message) }))
        })
        assert.notEqual(misura.codice, 0, 'se un giorno npm uscisse 0 qui, la segnalazione BC-57 avrebbe una causa nuova da indagare')
        assert.ok(misura.testo.trim().length > 0, 'e nemmeno l\'uscita e\' vuota: npm spiega per esteso che non trova package.json')
    })

    it('⛔ CURA — niente package.json: `prova` NON lancia il comando e lo dice, con codice != 0', async (t) => {
        const cartella = cartellaTemporanea(t)
        const { esiti, ricevute } = await giro(cartella, [chiamata('prova')])
        assert.equal(esiti.length, 1)
        assert.ok(esiti[0].includes('nessuna suite trovata in'), `atteso «nessuna suite trovata», ricevuto: ${esiti[0]}`)
        assert.ok(esiti[0].includes('package.json'), 'l\'esito dice COSA manca, non solo che manca qualcosa')
        assert.ok(!esiti[0].startsWith('exit 0'), 'un exit 0 qui e\' esattamente il difetto BC-57')
        assert.notEqual(ricevute.at(-1).evidence.exitCode, 0, 'anche la ricevuta porta un codice != 0: chi legge la prova a macchina non deve vedere un successo')
    })

    it('⛔ CURA — package.json senza scripts.test: stessa risposta, motivo diverso', async (t) => {
        const cartella = cartellaTemporanea(t, { packageJson: { name: 'x', version: '1.0.0' } })
        const { esiti } = await giro(cartella, [chiamata('prova')])
        assert.ok(esiti[0].includes('nessuna suite trovata in'), esiti[0])
        assert.ok(esiti[0].includes('scripts.test'), `il motivo nomina il campo assente: ${esiti[0]}`)
    })

    it('⛔ CURA — un comando che non e\' npm: si verifica che il PROGRAMMA esista', async (t) => {
        const cartella = cartellaTemporanea(t)
        const { esiti } = await giro(cartella, [chiamata('prova')], { comandoProva: 'programma-che-non-esiste-xyz --tutto' })
        assert.ok(esiti[0].includes('nessuna suite trovata in'), esiti[0])
        assert.ok(esiti[0].includes('programma-che-non-esiste-xyz'), `il motivo nomina il programma: ${esiti[0]}`)
    })

    it('⭐ AL CONTRARIO — quando la suite C\'E\', il comando parte come sempre', async (t) => {
        const cartella = cartellaTemporanea(t)
        const { esiti } = await giro(cartella, [chiamata('prova')], { comandoProva: 'node --version' })
        assert.ok(!esiti[0].includes('nessuna suite trovata'), `il cancello non deve mordere su un comando valido: ${esiti[0]}`)
        assert.ok(esiti[0].startsWith('exit 0'), `node --version esce 0: ${esiti[0]}`)
        assert.ok(/v\d+\./.test(esiti[0]), 'e il suo testo vero arriva in conversazione')
    })

    it('⭐ AL CONTRARIO — `npm test` con package.json E scripts.test passa il cancello', async (t) => {
        const cartella = cartellaTemporanea(t, { packageJson: { name: 'x', version: '1.0.0', scripts: { test: 'node --version' } } })
        const { esiti } = await giro(cartella, [chiamata('prova')])
        assert.ok(!esiti[0].includes('nessuna suite trovata'), `package.json + scripts.test = suite riconoscibile: ${esiti[0]}`)
    })

    /*
     * ⛔⛔⛔ B1, BOCCIATURA DEL CONTROLLORE AVVERSARIALE (17/09, stesso giorno).
     *
     * La prima versione del cancello pretendeva il `package.json` NELLA cartella, e sbagliava:
     * npm RISALE l'albero fino alla radice del disco (misurato, `npm error path C:\package.json`),
     * quindi in un monorepo un `npm test` lanciato da una sottocartella ESEGUE la suite del
     * genitore. Il cancello la rifiutava: un falso «non provato» su una suite che gira davvero.
     * ⛔ E la strettezza non serviva nemmeno al caso che l'ha fatta nascere: sopra il Desktop
     *   non c'e' nessun `package.json` fino a `C:\`, quindi quel caso resta rifiutato lo stesso.
     * ⇒ Si guarda dove guarda npm, e la regola `scripts.<nome>` si applica a QUEL manifesto.
     */
    it('⛔⛔⛔ B1 — MONOREPO: da una sottocartella vuota la suite del GENITORE si esegue, non si rifiuta', async (t) => {
        const radice = cartellaTemporanea(t, { packageJson: { name: 'radice', version: '1.0.0', scripts: { test: 'node --version' } } })
        const dentro = join(radice, 'pacchetto')
        mkdirSync(dentro)
        const { esiti } = await giro(dentro, [chiamata('prova')])
        assert.ok(!esiti[0].includes('nessuna suite trovata'), `npm qui esce 0 eseguendo la suite del genitore: rifiutarla e' un falso «non provato» — ricevuto: ${esiti[0]}`)
        assert.ok(esiti[0].startsWith('exit 0'), `e la suite del genitore passa davvero: ${esiti[0]}`)
    })

    it('⛔⛔ B1 — DESKTOP-LIKE: nessun package.json fino alla radice del disco, il rifiuto resta', async (t) => {
        const cartella = cartellaTemporanea(t)
        assert.equal(manifestoPiuVicinoNelTest(cartella), null,
            'PRECONDIZIONE: questa macchina non deve avere un package.json in %TEMP% ne sopra — se salta, il caso «Desktop» non e riproducibile qui e la prova sotto non direbbe niente')
        const { esiti } = await giro(cartella, [chiamata('prova')])
        assert.ok(esiti[0].includes('nessuna suite trovata in'), esiti[0])
        assert.ok(esiti[0].includes('package.json'), esiti[0])
    })

    it('⛔ B1 — `--workspace`: lo script vive in un ALTRO manifesto, quindi non si giudica', async (t) => {
        const cartella = cartellaTemporanea(t, { packageJson: { name: 'radice', version: '1.0.0', workspaces: ['x'] } })
        for (const comandoProva of ['npm run test --workspace=x', 'npm run test -w x', 'npm test --workspaces', 'npm run test -ws']) {
            const { esiti } = await giro(cartella, [chiamata('prova')], { comandoProva })
            assert.ok(!esiti[0].includes('scripts.test'),
                `"${comandoProva}": lo script sta in x/package.json, non qui — pretenderlo nella radice e' un rifiuto falso (docs.npmjs.com/cli/v11/using-npm/workspaces, 17/09/2026). Ricevuto: ${esiti[0]}`)
        }
    })

    it('⛔ B1 — `bun test` usa il runner INCORPORATO di Bun: non si pretende scripts.test', async (t) => {
        const cartella = cartellaTemporanea(t, { packageJson: { name: 'x', version: '1.0.0' } })
        const { esiti } = await giro(cartella, [chiamata('prova')], { comandoProva: 'bun test' })
        assert.ok(!esiti[0].includes('scripts.test'),
            `bun riserva «bun test» al proprio runner e IGNORA scripts.test (bun.com/docs/test + oven-sh/bun discussion #26312, letti 17/09/2026). Ricevuto: ${esiti[0]}`)
    })

    it('⭐ B1 — `bun run test` invece nomina uno script, e lo si pretende', async (t) => {
        const cartella = cartellaTemporanea(t, { packageJson: { name: 'x', version: '1.0.0' } })
        const { esiti } = await giro(cartella, [chiamata('prova')], { comandoProva: 'bun run test' })
        assert.ok(esiti[0].includes('scripts.test'), `«bun run X» e' l'alias di sempre per uno script: ${esiti[0]}`)
    })

    it('⛔⛔ IL NUDGE — una prova RIFIUTATA non conta come «provato»: il contatore delle scritture NON si azzera', async (t) => {
        const cartella = cartellaTemporanea(t)
        const chiamate = [
            chiamata('scrivi', { percorso: 'a.txt', contenuto: 'a' }, 'c1'),
            chiamata('scrivi', { percorso: 'b.txt', contenuto: 'b' }, 'c2'),
            chiamata('scrivi', { percorso: 'c.txt', contenuto: 'c' }, 'c3'),
            chiamata('prova', {}, 'c4'),
            chiamata('scrivi', { percorso: 'd.txt', contenuto: 'd' }, 'c5'),
        ]
        const { esiti } = await giro(cartella, chiamate)
        assert.equal(esiti.length, 5)
        assert.ok(esiti[2].includes('scritture senza chiamare'), 'alla terza scrittura il promemoria c\'e\' gia\' (soglia 3)')
        assert.ok(esiti[3].includes('nessuna suite trovata'), 'la prova in mezzo e\' stata rifiutata')
        assert.ok(esiti[4].includes('scritture senza chiamare'), 'e la quarta scrittura lo ripete: una prova mai eseguita non azzera niente')
        assert.ok(esiti[4].includes('4 scritture'), `il contatore e\' andato avanti, non ripartito: ${esiti[4]}`)
    })
})
