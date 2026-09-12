import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'

/**
 * ⛔⛔⛔ IL DIFETTO, OSSERVATO SUL PAD DELL'OWNER IL 10/9 — non ipotizzato.
 *
 * Al primo avvio di una build di RILASCIO, nel logcat, in chiaro:
 *
 *     I adbd: adbd service requested 'shell,v2,raw:LD_LIBRARY_PATH=…
 *             OPENROUTER_API_KEY=sk-or-… node …'
 *
 * A ogni avvio. Leggibile da chiunque abbia `adb` e da qualunque app con
 * `READ_LOGS`. L'owner ha dovuto ruotare la chiave. E `terminalePonte.ts`
 * mappa CINQUE provider sulle rispettive `*_API_KEY`: qualunque fosse
 * configurata usciva allo stesso modo.
 *
 * A stamparla non era nessun `Log.*` di TALOS — era `adbd`, che registra
 * ogni comando che gli viene chiesto di eseguire (AOSP
 * `packages/modules/adb/daemon/shell_service.cpp`, `ForkAndExec()` →
 * `__android_log_security_bswrite(SEC_TAG_ADB_SHELL_CMD, command_.c_str())`,
 * letto alla fonte il 2026-09-10).
 *
 * ⛔⛔ QUESTO FILE È SCRITTO PER DIVENTARE ROSSO SE IL SEGRETO TORNA IN UNA
 * RIGA DI COMANDO. Non prova che «il segreto arriva a destinazione»: quello
 * lo provava anche il codice rotto di ieri. Ogni controllo negativo qui
 * dentro ha accanto il suo CONTROLLO POSITIVO — la forma insicura del 28/8,
 * ricostruita apposta — contro cui lo stesso rilevatore deve accendersi.
 * Un rilevatore inerte supera una prova negativa esattamente come uno vero.
 */

const EXEC_JS = resolve(process.cwd(), 'android/app/src/main/assets/talos-node-lib/talos-exec.js')
const PLUGIN_KT = resolve(process.cwd(), 'android/app/src/main/java/ai/talos/terminal/TalosTerminalPlugin.kt')
const SEGRETI_KT = resolve(process.cwd(), 'android/app/src/main/java/ai/talos/terminal/TalosPonteSegreti.kt')
const PONTE_KT = resolve(process.cwd(), 'android/app/src/main/java/ai/talos/agent/TalosPonteAdb.kt')

/**
 * Una chiave dalla FORMA vera: deve essere riconoscibile a occhio in un output.
 *
 * ⛔ Ma il valore dice a voce alta di essere finto, e non e' pignoleria: il
 * cancello dei dati personali del rilascio cerca **le forme delle chiavi**, e un
 * fixture indistinguibile da una chiave vera fa una di due cose, entrambe
 * dannose — o fa fermare una pubblicazione per niente, o insegna a chi la vede
 * che quel tipo di allarme si ignora. Vedi
 * [[cancello-4-non-guardava-tutto-mobile]]: qui il repository diventa pubblico.
 */
const SEGRETO = 'sk-or-v1-FINTA0000non0e0una0chiave0000mai0esistita'

/**
 * ⛔ LE FORME INSICURE, riconosciute per COME SONO SCRITTE, non per come si
 * chiamano: un rinominare `prefissiChiamante` in altro modo non deve poter
 * far passare lo stesso difetto.
 */
const FORME_INSICURE = [
    {
        nome: 'un token «VAR=valore» costruito da due variabili (il segreto finisce in argv)',
        regex: /"\$\{?[A-Za-z_]\w*\}?\s*=\s*\$/,
    },
    {
        nome: 'un valore letto dall\'ambiente del chiamante interpolato dentro un literal',
        regex: /=\$\{[^}]*getString\(/,
    },
]

/** IL RILEVATORE — uno solo, per le due direzioni. */
function formeInsicureIn(sorgente: string): string[] {
    return FORME_INSICURE.filter(forma => forma.regex.test(sorgente)).map(forma => forma.nome)
}

/**
 * Il codice com'era scritto fino al 9/9, copiato riga per riga da
 * `TalosTerminalPlugin.eseguiComando` e `avviaServerHarness`. Serve a
 * provare che il rilevatore qui sopra MORDE.
 */
const CODICE_DEL_VENTOTTO = `
    val valore = ambiente.getString(nome) ?: ""
    prefissiAmbiente.add("$nome=$valore")
    prefissiChiamante.add("$nome=\${ambiente.getString(nome) ?: ""}")
`

describe('il rilevatore delle forme insicure MORDE', () => {
    it('⛔ CONTROLLO POSITIVO — riconosce entrambe le forme del 28/8', () => {
        expect(formeInsicureIn(CODICE_DEL_VENTOTTO)).toEqual(FORME_INSICURE.map(f => f.nome))
    })

    it('non si accende su un prefisso costante, che nella riga di comando ci deve stare', () => {
        // `LD_LIBRARY_PATH` la legge il caricatore dinamico prima che Node
        // esista: non c'è nessuno stdin da cui possa arrivare, e non è un
        // segreto. Se il rilevatore la respingesse, sarebbe inutilizzabile.
        expect(formeInsicureIn('private const val PREFISSO_LD = "LD_LIBRARY_PATH=$AREA_REMOTA"')).toEqual([])
        expect(formeInsicureIn('"TALOS_HARNESS_UI_PORT=$PORTA_SERVER",')).toEqual([])
    })
})

describe('nessun segreto nella riga di comando consegnata ad adb', () => {
    it('⛔ TalosTerminalPlugin.kt non costruisce più nessun token VAR=valore dal chiamante', () => {
        expect(formeInsicureIn(readFileSync(PLUGIN_KT, 'utf8'))).toEqual([])
    })

    it('⛔ nemmeno TalosPonteSegreti.kt, che è il posto dove sarebbe più comodo rifarlo', () => {
        expect(formeInsicureIn(readFileSync(SEGRETI_KT, 'utf8'))).toEqual([])
    })

    it('l\'ambiente del chiamante viaggia sull\'ingresso in ENTRAMBI i metodi del plugin', () => {
        const plugin = readFileSync(PLUGIN_KT, 'utf8')
        // `eseguiComando` e `avviaServerHarness`: due, non uno.
        expect(plugin.match(/ingresso = consegna\.ingresso/g)).toHaveLength(2)
        expect(plugin.match(/consegna\.cancella\(\)/g)).toHaveLength(2)
    })

    /**
     * ⛔ Il riaggancio rilancia il comando da capo: un secondo giro senza
     * ingresso vedrebbe uno stdin vuoto, cioè un ambiente senza chiavi,
     * proprio quando il ponte era già in difficoltà.
     */
    it('TalosPonteAdb.shell passa l\'ingresso a ENTRAMBI i tentativi', () => {
        const ponte = readFileSync(PONTE_KT, 'utf8')
        expect(ponte.match(/attesaMs = 30_000, ingresso = ingresso/g)).toHaveLength(2)
    })
})

describe('il protocollo fra Kotlin e talos-exec.js è lo stesso da entrambi i lati', () => {
    const js = readFileSync(EXEC_JS, 'utf8')
    const kt = readFileSync(SEGRETI_KT, 'utf8')

    function costanteJs(nome: string): string {
        const trovato = js.match(new RegExp(`const ${nome} = '([^']+)'`))
        if (!trovato) throw new Error(`costante ${nome} non trovata in talos-exec.js`)
        return trovato[1]
    }

    function costanteKt(nome: string): string {
        const trovato = kt.match(new RegExp(`const val ${nome} = "([^"]+)"`))
        if (!trovato) throw new Error(`costante ${nome} non trovata in TalosPonteSegreti.kt`)
        return trovato[1]
    }

    /**
     * ⛔ Non è pignoleria: `/data/local/tmp/talos/talos-exec.js` SOPRAVVIVE a
     * un `adb install -r`, e il plugin rifiuta di procedere se il telefono
     * non dichiara ESATTAMENTE questa stringa. Due lati che scivolano
     * indipendentemente = un telefono che non si aggiorna mai più.
     */
    it('la versione del protocollo combacia', () => {
        expect(costanteJs('VERSIONE')).toBe(costanteKt('VERSIONE_TALOS_EXEC'))
    })

    it('i due flag combaciano', () => {
        expect(costanteJs('FLAG_AMBIENTE')).toBe(costanteKt('FLAG_AMBIENTE_STDIN'))
        expect(costanteJs('FLAG_VERSIONE')).toBe(costanteKt('FLAG_VERSIONE'))
    })
})

/**
 * ⛔⛔ QUI SI ESEGUE DAVVERO `talos-exec.js`, con un vero processo figlio e
 * un vero stdin — non si legge il sorgente. È l'unico modo di sapere se il
 * canale funziona senza avere il telefono in mano: sul device `execSync`
 * userà `/system/bin/sh`, qui la shell della piattaforma (vedi
 * `shellDaUsare()` nello script, e il perché scritto lì).
 */
describe('talos-exec.js — il canale stdin, eseguito per davvero', () => {
    /**
     * ⛔⛔ SI ESEGUE UNA COPIA IN `tmpdir()`, NON IL FILE DOV'È — e non è
     * una comodità, è fedeltà. Sul telefono lo script vive in
     * `/data/local/tmp/talos/`, dove sopra di lui non c'è nessun
     * `package.json`: Node lo tratta quindi da CommonJS, ed è per questo
     * che `require()` funziona. Dentro `mobile/` invece c'è un
     * `package.json` con `"type": "module"`, che lo renderebbe ESM e lo
     * farebbe morire con «require is not defined in ES module scope» —
     * un errore del BANCO DI PROVA, non del codice spedito. Misurato
     * lanciandolo la prima volta, non previsto.
     */
    let scriptIsolato = ''
    beforeAll(() => {
        scriptIsolato = join(mkdtempSync(join(tmpdir(), 'talos-exec-prova-')), 'talos-exec.js')
        copyFileSync(EXEC_JS, scriptIsolato)
    })

    /**
     * ⛔ Il comando cambia per piattaforma perché a cambiare è la SHELL che
     * lo esegue, non ciò che si sta provando: che una variabile arrivata da
     * stdin sia nell'ambiente del comando figlio.
     */
    const COMANDO = process.platform === 'win32'
        ? 'echo %TALOS_PROVA_SEGRETO%'
        : 'printf %s "$TALOS_PROVA_SEGRETO"'

    function esegui(comando: string, flag: string[], ingresso: string) {
        const argomenti = [scriptIsolato, Buffer.from(comando, 'utf8').toString('base64'), ...flag]
        const figlio = spawnSync(process.execPath, argomenti, {
            input: ingresso,
            encoding: 'utf8',
            timeout: 30_000,
        })
        return { ...figlio, argomenti }
    }

    it('il segreto arriva al comando figlio, e NON è in nessun argomento', () => {
        const esito = esegui(COMANDO, ['--ambiente-da-stdin'], JSON.stringify({ TALOS_PROVA_SEGRETO: SEGRETO }))

        expect(esito.stdout).toContain(SEGRETO)
        expect(esito.status).toBe(0)
        // La metà che conta: il canale pubblico è pulito.
        expect(esito.argomenti.some(a => a.includes(SEGRETO))).toBe(false)
        // ⛔ E nemmeno in base64: il comando stesso non lo nomina.
        const comandoDecodificato = Buffer.from(esito.argomenti[1], 'base64').toString('utf8')
        expect(comandoDecodificato).not.toContain(SEGRETO)
    })

    it('⛔ CONTROLLO POSITIVO — la forma del 28/8 il segreto ce l\'aveva, negli argomenti', () => {
        // Non si esegue: si costruisce la riga com'era, e si guarda.
        const comeEra = ['LD_LIBRARY_PATH=/data/local/tmp/talos', `OPENROUTER_API_KEY=${SEGRETO}`, 'node', EXEC_JS]
        expect(comeEra.some(a => a.includes(SEGRETO))).toBe(true)
    })

    it('--versione dichiara il protocollo, ignorando il comando', () => {
        const esito = esegui('echo NON-DEVE-ESEGUIRSI', ['--versione'], '')

        expect(esito.stdout.trim()).toBe('talos-exec/2')
        expect(esito.stdout).not.toContain('NON-DEVE-ESEGUIRSI')
        expect(esito.status).toBe(0)
    })

    it('⛔ AL CONTRARIO — senza il flag, stdin non viene letto e la variabile non esiste', () => {
        const esito = esegui(COMANDO, [], JSON.stringify({ TALOS_PROVA_SEGRETO: SEGRETO }))

        expect(esito.stdout).not.toContain(SEGRETO)
        expect(esito.status).toBe(0)
    })

    /**
     * ⛔⛔ IL DIFETTO DI OGGI IN UN'ALTRA VESTE: `JSON.parse` cita il testo
     * attorno all'errore nel proprio messaggio. Se quel messaggio venisse
     * propagato, un payload malformato scriverebbe la chiave dentro
     * `stderr`, che risale il ponte fino all'interfaccia — avremmo spostato
     * la fuga invece di chiuderla.
     */
    it('⛔ AL CONTRARIO — un JSON malformato NON fa comparire il segreto in stderr', () => {
        const esito = esegui(COMANDO, ['--ambiente-da-stdin'], `{"OPENROUTER_API_KEY": "${SEGRETO}"`)

        expect(esito.status).not.toBe(0)
        expect(esito.stderr).not.toContain(SEGRETO)
        expect(esito.stderr).toContain('stdin non contiene un oggetto JSON valido')
    })

    it('⛔ AL CONTRARIO — un nome non POSIX è rifiutato, e stderr cita il nome, mai il valore', () => {
        const ingresso = JSON.stringify({ 'chiave; rm -rf /': SEGRETO })

        const esito = esegui(COMANDO, ['--ambiente-da-stdin'], ingresso)

        expect(esito.status).not.toBe(0)
        expect(esito.stderr).toContain('chiave; rm -rf /')
        expect(esito.stderr).not.toContain(SEGRETO)
    })

    /**
     * ⛔ Un ambiente atteso e mai arrivato non si ingoia: senza questa riga
     * il server partirebbe senza chiavi e fallirebbe molto più tardi,
     * lontano dalla causa.
     */
    it('⛔ AL CONTRARIO — col flag ma senza byte, lo dichiara su stderr', () => {
        const esito = esegui(COMANDO, ['--ambiente-da-stdin'], '')

        expect(esito.stderr).toContain('stdin era vuoto')
    })

    /**
     * ⛔ Prima del 10/9 uno spazio bastava a spezzare un valore in due —
     * limite dichiarato nel commento del 28/8, conseguenza diretta del
     * passare per una riga di comando. Un canale serializzato non ce l'ha,
     * e va provato che non ce l'abbia.
     */
    it('un valore con spazi e virgolette arriva intatto', () => {
        const cattivo = 'va lore "con" virgolette'
        const comando = process.platform === 'win32'
            ? 'echo %TALOS_PROVA_SEGRETO%'
            : 'printf %s "$TALOS_PROVA_SEGRETO"'

        const esito = esegui(comando, ['--ambiente-da-stdin'], JSON.stringify({ TALOS_PROVA_SEGRETO: cattivo }))

        expect(esito.stdout).toContain('va lore')
        expect(esito.stdout).toContain('virgolette')
    })
})
