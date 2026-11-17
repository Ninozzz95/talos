/*
 * ⛔ Il lanciatore nativo dei comandi su Windows (decisione 374, R1 dei nipoti staccati; owner 12/11/2026, decisione 1037: nostro exe in
 *   Rust; forma VERDE del giudice v1629). L'exe è `native/lanciatore/` (crate).
 *
 * Perché: Node mette ogni figlio in un Job con SILENT_BREAKAWAY_OK (libuv v1.52.1 `src/win/process.c:77-96`), quindi un programma che il
 *   comando lascia acceso (`start "" /b`, `detached: true`) non è più di nessuno: il comando «finisce» mentre lui scrive ancora, e «Ferma»
 *   (`taskkill /T`, che segue la catena dei padri) non lo raggiunge. Hermes (`hermes_cli/local_runtime/processes.py:47-67`) e Codex
 *   (`codex-rs/utils/pty/src/win/job.rs:91-95`) tengono i discendenti in un Job senza breakaway; qui lo fa il lanciatore.
 *
 * Come: al posto di `spawn(comando, { shell: true })` il nucleo lancia l'exe con la riga che Node avrebbe dato alla shell, IDENTICA
 *   (`<comspec> /d /s /c "<comando>"`, verbatim, come `normalizeSpawnArguments` di Node). L'exe parte la shell sospesa in un Job SENZA
 *   nome (giro g4), la riprende e scrive sul canale (maniglia 3) `{"avvio"}`, `{"uscita"}`, `{"albero":"vuoto"}`. Qui quel processo
 *   diventa un oggetto che si comporta come il ChildProcess della shell (stdout, stderr, `exit` all'uscita della SHELL, `close` alla
 *   chiusura dei tubi) e in più porta `alberoVuoto` (una promessa: l'ultimo processo del Job è uscito) e `fermaAlbero()` (chiude il Job
 *   intero, anche dopo l'uscita della shell). Il codice d'uscita è quello della shell.
 * ⛔ Ripiego mai silenzioso (§4): exe assente, impronta diversa, avvio rifiutato (Defender, un criterio), shell che non è cmd ⇒ il comando
 *   parte come oggi, `statoDelLanciatore()` dice «nipoti seguiti: no» col motivo (la diagnostica lo mostra) e il log del server lo dice
 *   UNA volta per motivo. Linux, macOS e Android non passano di qui.
 * ⛔ Giro di cura dopo i revisori B e C (12/11/2026):
 *   - un lanciatore che PARTE e muore prima della riga «avvio» (libreria che manca, antivirus che lo chiude, `{"errore":"avvio"}`) non
 *     lascia più il comando non eseguito: il comando riparte con lo `spawn` di prima dentro lo stesso oggetto, motivo «morto». Si può
 *     perché l'exe scrive «avvio» PRIMA di far ripartire la shell sospesa: nessun «avvio» ⇒ il comando non è mai girato (mai due volte);
 *   - `TALOS_LANCIATORE` non conta nell'app installata (come `TALOS_IROH_BINDING`, `src/remoto/binding.mjs:35-36`);
 *   - l'impronta dell'exe e il riferimento si rileggono a OGNI lancio (un file sostituito dopo il primo controllo non passa);
 *   - uno Stop arrivato prima di «avvio» si ridà all'arrivo di «avvio» (`TerminateJobObject` chiude solo i processi che ci sono già);
 *   - «bloccato» si dice solo se il comando di prima parte dove il lanciatore no (una cartella che non esiste non è colpa sua).
 * ⛔ Giro piccolo g4 (13/11/2026, giudice v1738): il Job non ha più un NOME, come Codex (`codex-rs/utils/pty/src/win/job.rs:73`) e Hermes
 *   (`hermes_cli/local_runtime/processes.py:61-62`). Prima «Ferma» rilanciava l'exe con `--ferma "<nome>"` (OpenJobObjectW): un nome
 *   già preso lasciava il comando senza gruppo (Stop lo raggiungeva 0 volte su 5, comando e nipote vivi) e, prima di «avvio», il «ferma»
 *   chiudeva il gruppo di chi aveva preso il nome (5 su 5). Ora il nucleo scrive `ferma` sull'entrata del lanciatore (maniglia 4) e il
 *   lanciatore chiude il Job dalla sua maniglia; risponde `{"ferma":true|false}`. Nessun exe si rilancia per fermare.
 */
import { spawn as spawnReale } from 'node:child_process'
import { createHash } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, isAbsolute, join } from 'node:path'
import { PassThrough } from 'node:stream'
import { fileURLToPath } from 'node:url'
import { percorsoTaskkill } from '../taskkill-di-sistema.mjs'

export const NOME_LANCIATORE = 'talos-lanciatore.exe'
const QUI = dirname(fileURLToPath(import.meta.url))
/** Dove l'exe scaricato e verificato sta a regime (`scripts/scarica-lanciatore.mjs`), e il riferimento con la sua impronta. */
const CANDIDATI = [join(QUI, '..', '..', 'native', 'lanciatore-bin', NOME_LANCIATORE), join(QUI, '..', '..', '..', 'native', 'lanciatore-bin', NOME_LANCIATORE)]
const RIFERIMENTI = [join(QUI, '..', '..', 'native', 'lanciatore-binding.json'), join(QUI, '..', '..', '..', 'native', 'lanciatore-binding.json')]
/** Quanto si aspetta, dopo «ferma», che l'albero si svuoti prima di chiudere il lanciatore dalla sua maniglia. */
const ATTESA_FERMA_MS = 2_000
/**
 * ⛔ Il guardiano su «avvio» (cure dopo il ripasso, revisore C, 12/11/2026): un lanciatore che parte, non scrive «avvio» e non esce
 *   teneva il comando in attesa fino allo scadere del suo tempo (124), mai girato e senza un avviso. Se «avvio» non arriva entro questa
 *   soglia il lanciatore si chiude e il comando riparte con lo `spawn` di prima (motivo «appeso»).
 *   La soglia sta ben sopra il tempo che «avvio» impiega davvero: misurato il 12/11/2026 su 300 lanci con la CPU fra il 58 e il 65%
 *   (altri lavori sulla macchina): mediana 25 ms, 95º centile fino a 177 ms, massimo 1126 ms. Dieci secondi sono 9 volte quel massimo.
 *   Sbagliare per difetto costa più che aspettare: un lanciatore sano ma lento verrebbe chiuso a comando appena partito.
 */
export const SOGLIA_AVVIO_MS = 10_000
/** Stop dato prima di «avvio»: quanto si aspetta che «avvio» arrivi prima di chiudere il lanciatore (appeso) senza aspettare i 2 s. */
export const ATTESA_AVVIO_ALLO_STOP_MS = 500
let sogliaAvvio = SOGLIA_AVVIO_MS
/** Per le prove coi processi veri: accorcia (o rimette, con `null`) la soglia del guardiano. */
export function sogliaAvvioPerProve(ms) { sogliaAvvio = Number.isFinite(ms) && ms > 0 ? ms : SOGLIA_AVVIO_MS }

let statoAttuale = { nipoti: false, motivo: 'mai-usato' }
const MOTIVI_DEL_LANCIO = new Set(['bloccato', 'shell', 'job', 'morto', 'appeso', 'incerto'])
const motiviDetti = new Set()
/** L'ultimo «avvio» col Job diceva che Windows ha rifiutato l'appoggio (`"appoggio":false`, `main.rs` `riga_avvio`). */
let appoggioRifiutato = false

/**
 * ⛔ Giro piccolo dopo il controllore (12/11/2026): senza l'appoggio del Job un lanciatore ucciso fra la creazione della shell sospesa e
 *   la sua ripartenza la lascia sospesa (15 su 160 prima della cura). Non si fa finta che ci sia: UNA riga nel log, e la diagnostica
 *   lo porta finché un lancio dopo non lo riceve. I nipoti restano seguiti (il Job c'è): non è un ripiego.
 */
function segnaAppoggio(rifiutato, log = console.warn) {
    appoggioRifiutato = rifiutato
    if (!rifiutato || motiviDetti.has('appoggio')) return
    motiviDetti.add('appoggio')
    /* cura unica dei gialli (13/11/2026, revisore B): senza l'appoggio KILL_ON_JOB_CLOSE non c'è mai, e manca anche il legame del primo
       piano (strada Codex): lo si dice nella stessa riga */
    try { log('[launcher] Windows refused the safety net of a command\'s group: a command stopped in its very first instant may stay paused, and a command in the foreground does not stop when the helper or TALOS stops (appoggio)') } catch { /* il log non ferma il comando */ }
}

/**
 * ⛔ Cura unica dei gialli (13/11/2026, revisore B): il lanciatore è finito dopo «avvio», senza dire l'uscita, con il comando già in
 *   sottofondo. Lì il comando è girato e continua da solo (KILL_ON_JOB_CLOSE tolto da «sfondo»: 10 su 10 vivi): prima il log diceva
 *   «può non essere girato» (`incerto`), falso. Ora dice ciò che è vero, una volta.
 */
function diciSlegato(log = console.warn) {
    if (motiviDetti.has('slegato')) return
    motiviDetti.add('slegato')
    try { log('[launcher] the helper stopped while a command ran in the background: the command keeps running on its own, but TALOS no longer sees when it ends and Stop no longer reaches it (slegato)') } catch { /* il log non ferma il comando */ }
}

/**
 * ⛔ Cura unica dei gialli (13/11/2026, revisore B): l'entrata del lanciatore non si può più scrivere quando il comando va in sottofondo
 *   (lanciatore vivo). «Muore con me» resta acceso: il comando si ferma se l'aiutante o TALOS si fermano. Prima nessuno lo diceva.
 */
function diciSfondoNonDetto(log = console.warn) {
    if (motiviDetti.has('sfondo')) return
    motiviDetti.add('sfondo')
    try { log('[launcher] a command sent to the background could not tell the helper: it stops if the helper or TALOS stops (sfondo)') } catch { /* il log non ferma il comando */ }
}

/** L'ultimo comando col Job ha detto che Windows non ha tolto l'appoggio dopo la ripartenza (`{"sgancio":false}`, `main.rs`). */
let sganciRifiutato = false

/**
 * ⛔ Giro 3 (13/11/2026, punto 3): se Windows non toglie l'appoggio dopo la ripartenza della shell, il Job resta «muore con me» per
 *   tutta la sua vita: chiuso il lanciatore (TALOS chiuso o aggiornato) si chiudono anche i programmi lasciati in sottofondo. UNA riga
 *   nel log, e la diagnostica lo porta finché un lancio dopo non lo ritoglie.
 */
function segnaSgancio(rifiutato, log = console.warn) {
    sganciRifiutato = rifiutato
    if (!rifiutato || motiviDetti.has('sgancio')) return
    motiviDetti.add('sgancio')
    try { log('[launcher] Windows did not let go the programs a command leaves running: they stop when TALOS closes or is updated (sgancio)') } catch { /* il log non ferma il comando */ }
}

/** ⛔ Giro 3: uno Stop che non ha potuto chiudere il gruppo di un comando (senza Job, exe cambiato, «ferma» non riuscito) si dice, una volta. */
function diciFermo(log = console.warn) {
    if (motiviDetti.has('fermo')) return
    motiviDetti.add('fermo')
    try { log('[launcher] Stop could not close the group of a command: the programs it started may keep running until they end (fermo)') } catch { /* il log non ferma il comando */ }
}

function annota(motivo, log = console.warn) {
    statoAttuale = motivo === null ? { nipoti: true, motivo: null } : { nipoti: false, motivo }
    if (motivo === null || motiviDetti.has(motivo)) return
    motiviDetti.add(motivo)
    // «incerto» non è un ripiego riuscito: lì non è vero che «i comandi girano come prima», e non si sa se quel comando è girato
    const riga = motivo === 'incerto'
        ? `[launcher] the helper that starts commands stopped before saying how a command ended: that command may not have run (${motivo})`
        : `[launcher] programs left running by a command are not followed on this PC (${motivo}): commands run as before`
    try { log(riga) } catch { /* il log non ferma il comando */ }
}

/**
 * «Nipoti seguiti: sì/no» e il motivo del no, per la diagnostica (§10.6). `motivo`: assente, impronta, non-fissato, bloccato, shell, job,
 * morto, appeso, incerto, mai-usato. Coi nipoti seguiti, `appoggio: false` se l'ultimo lancio ha detto che Windows ha rifiutato
 * l'appoggio del Job (senza, il campo non c'è); `sgancio: false` se ha detto che Windows non l'ha tolto dopo la ripartenza (giro 3).
 */
export function statoDelLanciatore() {
    if (process.platform !== 'win32') return { nipoti: false, motivo: 'non-windows' }
    // l'exe si cerca e si controlla ADESSO: uno stato vecchio non deve dire «assente» quando c'è, né «seguiti» con un exe cambiato
    const l = trovaLanciatore()
    if (!l.percorso) return { nipoti: false, motivo: l.motivo }
    // ciò che si vede solo lanciando (avvio rifiutato, shell diversa, Job rifiutato, lanciatore morto) vale finché un lancio dopo non riesce
    const s = MOTIVI_DEL_LANCIO.has(statoAttuale.motivo) ? { ...statoAttuale } : { nipoti: true, motivo: null }
    if (!s.nipoti) return s
    return { ...s, ...(appoggioRifiutato ? { appoggio: false } : {}), ...(sganciRifiutato ? { sgancio: false } : {}) }
}

const impronta = (percorso) => createHash('sha256').update(readFileSync(percorso)).digest('hex')

/**
 * L'exe da usare, o il motivo per non usarlo.
 * - `TALOS_LANCIATORE` (prove e sviluppo: l'exe costruito in locale) vince e non si confronta con l'impronta, ma SOLO fuori dall'app
 *   installata: il guscio imposta sempre `TALOS_DESKTOP_DATA_DIR`, e lì una variabile ereditata dall'ambiente della persona (o messa
 *   da un altro programma) non deve far eseguire un exe non verificato. La stessa regola di iroh (`src/remoto/binding.mjs:35-36`).
 * - senza, l'exe accanto al pacchetto vale solo se la sua impronta è quella del riferimento firmato dalla costruzione. ⛔ Riferimento
 *   e impronta si rileggono a OGNI chiamata (revisore B, 12/11): tenuti in memoria dopo il primo controllo, un exe sostituito a
 *   server acceso sarebbe partito a ogni comando. Costo misurato il 12/11/2026 su un exe di 276.992 byte: mediana 1,13 ms, p95
 *   1,34 ms a controllo (1000 giri, CPU attorno al 32%). Per fermare l'exe non si rilancia più (giro g4): «ferma» va al lanciatore già
 *   partito, sulla sua entrata.
 */
export function trovaLanciatore({ ambiente = process.env, candidati = CANDIDATI, riferimenti = RIFERIMENTI } = {}) {
    const app = Boolean(ambiente.TALOS_DESKTOP_DATA_DIR)
    const daAmbiente = !app && typeof ambiente.TALOS_LANCIATORE === 'string' ? ambiente.TALOS_LANCIATORE.trim() : ''
    if (daAmbiente) return existsSync(daAmbiente) ? { percorso: daAmbiente, motivo: null } : { percorso: null, motivo: 'assente' }
    const percorso = candidati.find((c) => existsSync(c))
    if (!percorso) return { percorso: null, motivo: 'assente' }
    let attesa = null
    for (const r of riferimenti) {
        try { attesa = JSON.parse(readFileSync(r, 'utf8'))?.sha256 ?? null; break } catch { /* il prossimo */ }
    }
    if (typeof attesa !== 'string' || !/^[0-9a-f]{64}$/u.test(attesa)) return { percorso: null, motivo: 'non-fissato' }
    let vera = null
    try { vera = impronta(percorso) } catch { vera = null }
    return vera === attesa ? { percorso, motivo: null } : { percorso: null, motivo: 'impronta' }
}

/** La shell di `spawn(…, { shell: true })` su Windows, come la sceglie Node: `comspec`, o `cmd.exe`; il lanciatore la vuole assoluta. */
function shellDiNode(ambiente = process.env) {
    const comspec = ambiente.comspec || 'cmd.exe'
    if (!/^(?:.*\\)?cmd(?:\.exe)?$/iu.test(comspec)) return null // con una shell che non è cmd Node non usa /d /s /c: ripiego
    const assoluta = isAbsolute(comspec) ? comspec : join(ambiente.SystemRoot || 'C:\\Windows', 'System32', 'cmd.exe')
    return { comspec, assoluta }
}

/**
 * Il posto di `spawn(comando, opzioni)` per i comandi di shell su Windows. Fuori da Windows, o senza `shell: true`, è `spawn` com'era.
 * Torna il ChildProcess (ripiego) o un `ProcessoLanciato` che si usa allo stesso modo.
 */
export function lanciaComando(comando, opzioni, { spawnFn = spawnReale, piattaforma = process.platform, ambiente = process.env, log = console.warn } = {}) {
    if (piattaforma !== 'win32' || opzioni?.shell !== true) return spawnFn(comando, opzioni)
    const l = trovaLanciatore({ ambiente })
    if (!l.percorso) { annota(l.motivo, log); return spawnFn(comando, opzioni) }
    const shell = shellDiNode(ambiente)
    if (!shell) { annota('shell', log); return spawnFn(comando, opzioni) }
    if (/"/u.test(l.percorso) || /"/u.test(shell.assoluta)) { annota('shell', log); return spawnFn(comando, opzioni) }
    const { shell: _shell, stdio: _stdio, ...resto } = opzioni
    let figlio
    try {
        figlio = spawnFn(l.percorso, [], {
            ...resto,
            windowsVerbatimArguments: true,
            // la riga che Node darebbe alla shell, identica, dopo la shell (prova 9 del giudice, §10.2); nessun nome di Job (giro g4)
            argv0: `"${l.percorso}" "${shell.assoluta}" ${shell.comspec} /d /s /c "${comando}"`,
            // 3: il canale del lanciatore; 4: la sua entrata, dove il nucleo scrive «ferma» (giro g4)
            stdio: ['pipe', 'pipe', 'pipe', 'pipe', 'pipe'],
        })
    } catch { figlio = null }
    if (!figlio || !Number.isSafeInteger(figlio.pid)) {
        /* Il lanciatore non è partito: il comando parte come oggi. ⛔ «bloccato» (Defender, un criterio di controllo delle app, file
           sparito) si dice solo se il comando di prima PARTE dove lui no: con una cartella che non esiste non parte nessuno dei due
           (Node dà un processo senza PID e l'errore dopo), e non è il lanciatore il guasto (giro di cura del 12/11). */
        figlio?.on?.('error', () => {})
        const diPrima = spawnFn(comando, opzioni)
        if (Number.isSafeInteger(diPrima?.pid)) annota('bloccato', log)
        return diPrima
    }
    // «seguiti: sì» si dice all'arrivo della riga «avvio», non qui: un lanciatore che parte e muore subito non segue niente
    return new ProcessoLanciato(figlio, { lanciatore: l.percorso, spawnFn, log, ripiego: () => spawnFn(comando, opzioni) })
}

/** Un tubo del processo vero dentro il tubo che il nucleo tiene in mano: stessi dati, stessa fine, stessa chiusura. */
function collega(sorgente, facciata) {
    if (!sorgente) { facciata.end(); return }
    if (sorgente.readableEnded) { facciata.end(); return }
    if (sorgente.destroyed) { facciata.destroy(); return }
    let finita = false
    sorgente.once('end', () => { finita = true; facciata.end() })
    sorgente.once('close', () => { if (!finita) facciata.destroy() })
    // un errore del tubo arriva a chi lo ascolta; se nessuno lo ascolta il tubo si chiude e basta (mai un'eccezione che ferma il server)
    sorgente.on('error', (e) => { facciata.destroy(facciata.listenerCount('error') > 0 ? e : undefined) })
    sorgente.pipe(facciata, { end: false })
}

/**
 * Il processo di un comando partito col lanciatore, visto come il ChildProcess della sua shell.
 * - `pid`: quello del lanciatore, che vive finché vive l'albero (la scheda Processi somma i discendenti; dopo un riavvio di TALOS si
 *   riconosce lui, e con lui tutto il comando).
 * - `exit` all'uscita della shell, col suo codice; `close` quando esce la shell e i suoi tubi si chiudono (come prima).
 * - `alberoVuoto`: si risolve all'uscita dell'ultimo processo del Job; `fermaAlbero()` chiude il Job intero.
 * - `stdout` e `stderr` sono tubi SUOI, in cui entrano quelli del processo vero. Servono al ripiego qui sotto: chi usa il comando tiene
 *   in mano i tubi dal primo istante (cattura, file del sottofondo), e il processo vero può cambiare dopo.
 * ⛔ Le righe del canale vengono solo dal lanciatore: la shell non eredita la maniglia (§10.1). Una riga che non si capisce si scarta.
 * ⛔ Il ripiego (giro di cura del 12/11, revisori B e C): se il lanciatore finisce senza aver scritto «avvio» (né «uscita»), il comando
 *   NON è mai partito (l'exe scrive «avvio» prima di far ripartire la shell sospesa). Allora, se nessuno ha chiesto lo Stop, il
 *   comando parte con lo `spawn` di prima (`ripiego()`), DENTRO questo oggetto: `pid` diventa il suo (evento `ripiego`, chi ha annunciato
 *   il PID lo riannuncia), i tubi, `exit` e `close` sono i suoi, l'albero non si segue (`nipotiSeguiti: false`, finisce con la shell) e
 *   «Ferma» lo chiude come un comando di prima (`taskkill /T /F` sul SUO PID). Del lanciatore morto fuori non esce niente: né il suo
 *   codice, né ciò che ha scritto. Con «avvio» arrivato non si riparte MAI (niente comando due volte); con lo Stop già chiesto nemmeno.
 * ⛔ Il guardiano (cure dopo il ripasso del 12/11, `SOGLIA_AVVIO_MS`): se «avvio» non arriva in tempo il lanciatore è appeso. Si chiude
 *   lui dalla sua maniglia (la shell sospesa, se c'è già, muore con lui: l'appoggio del Job), e si decide come sopra QUANDO È
 *   FINITO E IL CANALE È CHIUSO, cioè dopo aver riletto tutto ciò che ha scritto: senza «avvio» il comando riparte (motivo «appeso»);
 *   con «avvio» arrivato proprio lì (la gara alla soglia) NON riparte, mai, e `forseNonGirato` dice a chi legge l'esito che quel
 *   comando può non essere girato (motivo «incerto»): lo abbiamo chiuso noi mentre partiva.
 * ⛔ «Avvio» e poi il lanciatore finisce senza dire l'uscita, e nessuno l'ha fermato (revisore C, 12/11): il comando non si rilancia
 *   (potrebbe essere girato: mai due volte), esce col codice che c'è, e anche lì `forseNonGirato` e il motivo «incerto» dicono che
 *   non si sa com'è andata. Dopo uno Stop della persona, o allo scadere del tempo del comando, no: lì è stato fermato.
 */
export class ProcessoLanciato extends EventEmitter {
    constructor(figlio, { lanciatore, spawnFn = spawnReale, log = console.warn, ripiego = null }) {
        super()
        this.figlio = figlio
        this.lanciatore = lanciatore
        this.spawnFn = spawnFn
        this.log = log
        /** La riga «avvio» ha detto che il Job NON c'è (Windows l'ha rifiutato): «ferma» chiude l'albero della shell dalla fotografia, e un programma il cui padre è già uscito può restare. */
        this.senzaJob = false
        /** «Ferma» ha risposto `true`: il gruppo è chiuso, e solo da qui il lanciatore si può chiudere dalla sua maniglia (giro 3). */
        this.gruppoChiuso = false
        this.gruppoNonChiuso = false
        /** «sfondo» già scritto sull'entrata (strada Codex): una volta. */
        this.mandatoInSfondo = false
        this.stdin = figlio.stdin
        this.stdout = new PassThrough()
        this.stderr = new PassThrough()
        this.stdio = [this.stdin, this.stdout, this.stderr]
        this.pid = figlio.pid
        this.pidShell = null
        /** Il processo del comando ripartito con lo `spawn` di prima, se il lanciatore è morto prima di «avvio». */
        this.diPrima = null
        this.exitCode = null
        this.signalCode = null
        this.nipotiSeguiti = true
        this.killed = false
        /** Vero se non si sa se il comando è girato (lanciatore chiuso dal guardiano mentre scriveva «avvio», o finito dopo «avvio» senza dire l'uscita): chi dà l'esito lo dice. */
        this.forseNonGirato = false
        this.lanciatoreUscito = false
        let risolviAlbero
        this.alberoVuoto = new Promise((r) => { risolviAlbero = r })
        this.alberoFinito = false
        const finisciAlbero = () => { if (this.alberoFinito) return; this.alberoFinito = true; risolviAlbero() }
        let usciti = false
        let tubiChiusi = 0
        const tubi = [this.stdout, this.stderr]
        const forseChiudi = () => { if (usciti && tubiChiusi >= tubi.length && !this.chiuso) { this.chiuso = true; this.emit('close', this.exitCode, this.signalCode) } }
        for (const t of tubi) t.once('close', () => { tubiChiusi += 1; forseChiudi() })
        const esci = (codice, segnale) => {
            if (usciti) return
            usciti = true
            this.exitCode = codice
            this.signalCode = segnale
            this.emit('exit', codice, segnale)
            // come Node all'uscita di un figlio (`flushStdio`): un tubo che nessuno ha mai letto non deve tenere appeso `close`
            for (const t of tubi) { if (t.readableFlowing === null) t.resume() }
            forseChiudi()
        }
        /* I tubi del lanciatore entrano nei nostri solo quando si sa che il comando è partito («avvio», o una riga che lo implica):
           prima di allora la shell è sospesa e non può aver scritto niente, e ciò che scrive un lanciatore che muore non è del comando. */
        let collegato = false
        const collegaIlLanciatore = () => {
            if (collegato) return
            collegato = true
            collega(figlio.stdout, this.stdout)
            collega(figlio.stderr, this.stderr)
        }
        let guardianoScattato = false
        const segnaIncerto = () => {
            this.forseNonGirato = true
            this.nipotiSeguiti = false
            annota('incerto', log)
        }
        let accumulo = ''
        figlio.stdio?.[3]?.setEncoding?.('utf8')
        figlio.stdio?.[3]?.on?.('data', (pezzo) => {
            accumulo += pezzo
            if (accumulo.length > 65_536) accumulo = accumulo.slice(-4096)
            let a
            while ((a = accumulo.indexOf('\n')) >= 0) {
                const riga = accumulo.slice(0, a).trim()
                accumulo = accumulo.slice(a + 1)
                let m = null
                try { m = JSON.parse(riga) } catch { continue }
                if (!m || typeof m !== 'object') continue
                if (Number.isSafeInteger(m.avvio) && m.avvio > 0 && this.pidShell === null) {
                    this.pidShell = m.avvio
                    if (m.nipoti === false) { this.nipotiSeguiti = false; this.senzaJob = true }
                    annota(m.nipoti === false ? 'job' : null, log)
                    segnaAppoggio(m.nipoti !== false && m.appoggio === false, log)
                    segnaSgancio(false, log)
                    // la gara alla soglia: il guardiano era già scattato e stiamo chiudendo questo lanciatore. Il comando può essere
                    // partito o no: lo si segna SUBITO, prima di ogni `exit`, perché chi dà l'esito lo legga
                    if (guardianoScattato && !this.killed) segnaIncerto()
                    collegaIlLanciatore()
                    /* ⛔ Stop nel primissimo istante (revisore C, 12/11: il comando lavorava ancora ~2,1 s). Il «ferma» scritto prima di
                       questa riga resta nel tubo e il lanciatore lo legge dopo la ripartenza della shell (giro g4); lo si ridà lo
                       stesso, come prima: un secondo `TerminateJobObject` non tocca niente fuori dal gruppo. Una volta. */
                    if (this.killed && !this.alberoFinito) this.chiudiIlJob()
                }
                // giro 3: Windows non ha tolto l'appoggio dopo la ripartenza (solo col Job, dopo «avvio», col valore esatto `false`)
                if (m.sgancio === false && this.pidShell !== null && !this.senzaJob) segnaSgancio(true, log)
                // giro g4: la risposta a «ferma». Senza Job il lanciatore ha chiuso solo la shell: i suoi figli possono restare, si dice
                if (typeof m.ferma === 'boolean' && this.killed) { if (m.ferma && !this.senzaJob) this.gruppoChiuso = true; else this.fermaNonRiuscito() }
                if (Number.isSafeInteger(m.uscita) && m.uscita >= 0) { collegaIlLanciatore(); esci(m.uscita, null) }
                if (m.albero === 'vuoto') finisciAlbero()
                if (typeof m.errore === 'string' && !usciti && typeof ripiego !== 'function') {
                    // senza ripiego possibile (oggetto costruito a mano) l'errore si dice; col ripiego decide la fine del lanciatore, qui sotto
                    this.emit('error', Object.assign(new Error(`the launcher could not start the shell (${m.errore}${Number.isSafeInteger(m.codice) ? ` ${m.codice}` : ''})`), { code: 'ELAUNCHER' }))
                }
            }
        })
        figlio.on('error', (e) => { if (!usciti && !this.diPrima) this.emit('error', e) })
        // l'entrata del lanciatore: scriverci dopo la sua uscita dà EPIPE, che non deve fermare il server (vale «ferma» non riuscito)
        figlio.stdio?.[4]?.on?.('error', () => { if (this.killed) this.fermaNonRiuscito() })
        const riparti = (motivo) => {
            for (const t of [figlio.stdout, figlio.stderr]) t?.resume?.() // ciò che ha scritto il lanciatore morto si butta
            this.nipotiSeguiti = false
            let nuovo = null
            let errore = null
            try { nuovo = ripiego() } catch (e) { errore = e }
            if (!nuovo) {
                for (const t of tubi) t.destroy()
                finisciAlbero()
                if (this.listenerCount('error') > 0) this.emit('error', errore ?? new Error('the command could not start'))
                else esci(uscitaDelLanciatore.codice, uscitaDelLanciatore.segnale)
                return
            }
            this.diPrima = nuovo
            this.stdin = nuovo.stdin ?? null
            this.stdio[0] = this.stdin
            // un comando di prima che NON parte nemmeno lui (senza PID) non fa dire niente del lanciatore, come in `lanciaComando`
            if (Number.isSafeInteger(nuovo.pid)) { this.pid = nuovo.pid; annota(motivo, log) }
            collega(nuovo.stdout, this.stdout)
            collega(nuovo.stderr, this.stderr)
            nuovo.on('error', (e) => { finisciAlbero(); this.emit('error', e) })
            nuovo.once('exit', (codice, segnale) => { finisciAlbero(); esci(codice, segnale) })
            nuovo.once('close', (codice, segnale) => {
                finisciAlbero()
                // un comando che non è partito chiude senza `exit` (Node): si chiude anche qui, senza inventare un'uscita
                if (!usciti) { usciti = true; this.exitCode = codice ?? null; this.signalCode = segnale ?? null }
                forseChiudi()
            })
            this.emit('ripiego', nuovo)
        }
        /* Il lanciatore è uscito: di solito dopo `albero vuoto`. Se esce prima con «avvio» già scritto (ucciso, o il nucleo non ha letto
           le righe), il comando finisce come prima: `exit` col codice che c'è, e l'albero non si sa più seguire (§4: un lanciatore
           ucciso non ferma nessuno). Se esce SENZA «avvio» il comando non è mai partito: riparte con lo spawn di prima, a meno che
           qualcuno abbia già chiesto lo Stop («Ferma» è una promessa: un comando fermato prima di partire non parte dopo). */
        let uscitaDelLanciatore = null
        let deciso = false
        const lanciatoreFinito = () => {
            if (!uscitaDelLanciatore || deciso) return
            deciso = true
            const partito = this.pidShell !== null || usciti
            if (!partito && !this.killed && typeof ripiego === 'function') { riparti(guardianoScattato ? 'appeso' : 'morto'); return }
            // annunciato («avvio») e finito senza dire l'uscita, e nessuno l'ha fermato: non si rilancia (mai due volte), ma non si
            // sa se è girato, e lo si segna PRIMA di `exit`, perché chi dà l'esito lo legga
            // in sottofondo il comando è girato e continua da solo (revisore B): niente dubbio, la riga vera
            if (this.pidShell !== null && !usciti && !this.killed) {
                if (this.mandatoInSfondo) { this.nipotiSeguiti = false; diciSlegato(log) } else segnaIncerto()
            }
            collegaIlLanciatore()
            esci(uscitaDelLanciatore.codice, uscitaDelLanciatore.segnale)
            finisciAlbero()
        }
        const canale = figlio.stdio?.[3]
        let canaleChiuso = !canale
        // le righe del canale possono arrivare DOPO l'`exit` del lanciatore: si decide quando il canale è chiuso (solo lui lo tiene)
        canale?.once?.('close', () => { canaleChiuso = true; lanciatoreFinito() })
        figlio.on('exit', (codice, segnale) => {
            this.lanciatoreUscito = true
            uscitaDelLanciatore = { codice, segnale }
            if (canaleChiuso) lanciatoreFinito()
        })
        /* Il guardiano. Solo dove c'è un ripiego (i comandi lanciati da `lanciaComando`): senza, chiudere il lanciatore non farebbe
           girare niente. ⛔ Quando la soglia scade NON si decide subito: si lascia passare un giro degli eventi, così ciò che il
           lanciatore ha già scritto nel tubo si legge prima (un giro degli eventi rimasto fermo, il PC tornato dalla sospensione: lì la
           soglia scade a «avvio» già arrivato, e chiudere il Job fermerebbe un comando sano). ⛔ Giro g4: prima di «avvio» il Job
           non ha nome e la sua sola maniglia è del lanciatore: si chiude lui, e la shell sospesa, se c'è già, muore con lui (l'appoggio). */
        const scatta = () => {
            if (this.pidShell !== null || uscitaDelLanciatore || this.killed) return
            guardianoScattato = true
            this.chiudiIlLanciatore()
        }
        if (typeof ripiego === 'function') setTimeout(() => { setImmediate(scatta) }, sogliaAvvio).unref?.()
    }

    /**
     * `taskkill /T /F` per percorso intero (`taskkill-di-sistema.mjs`), sul PID dato. `seNonParte`: ciò che resta da fare. ⛔ Giro 3:
     * SOLO per il comando ripartito senza lanciatore (`diPrima`), fermato come il nucleo ferma ogni comando senza lanciatore; mai sul
     * lanciatore.
     */
    boia(pid, seNonParte = () => {}) {
        try {
            const boia = this.spawnFn(percorsoTaskkill(process.env.SystemRoot), ['/PID', String(pid), '/T', '/F'], { windowsHide: true })
            boia?.on?.('error', seNonParte)
        } catch { seNonParte() }
    }

    /**
     * ⛔ «ferma» sull'entrata del lanciatore (maniglia 4, giro g4): il lanciatore chiude il Job dalla SUA maniglia (`main.rs`,
     * `ascolta_ferma`) e risponde `{"ferma":true|false}`. Nessun exe si rilancia e nessun nome si apre: prima qui partiva l'exe con
     * `--ferma "<nome>"`, che con un nome già preso chiudeva il gruppo di un altro programma. Falso se non si è potuto scrivere.
     */
    scriviFerma() {
        const entrata = this.figlio.stdio?.[4]
        if (!entrata || entrata.destroyed || entrata.writable === false || this.lanciatoreGiaUscito()) return false
        try { entrata.write('ferma\n'); return true } catch { return false }
    }

    /**
     * ⛔ Strada Codex (owner 13/11/2026 12:45): il comando va in sottofondo. Il Job tiene «muore con me» (KILL_ON_JOB_CLOSE) finché la
     * shell gira, come Codex (`codex-rs/utils/pty/src/win/job.rs:240-257`): un lanciatore ucciso, o TALOS chiuso, ferma il comando in
     * primo piano. La riga `sfondo` sull'entrata lo toglie (`main.rs`, `sgancia`): il comando sopravvive alla chiusura di TALOS e resta
     * adottabile dopo un riavvio. Anche prima di «avvio» (resta nel tubo). Una volta; vero se è stata scritta.
     * Claude Code fa il contrario all'uscita: chiude di forza i comandi in sottofondo ancora accesi 1,5 s dopo averglielo chiesto
     * (`CHANGELOG.md:787`: «Changed exit to force-kill background commands still running 1.5 seconds after being asked to stop»);
     * TALOS li lascia vivere e li riprende dopo un riavvio. (Citazione corretta il 13/11/2026: il rapporto dell'autore diceva
     * `CHANGELOG.md:1063`, che parla dei server MCP alla chiusura; revisori B e C.)
     */
    inSfondo() {
        const entrata = this.figlio.stdio?.[4]
        if (this.mandatoInSfondo || this.diPrima || this.lanciatoreGiaUscito()) return false
        // ⛔ cura unica dei gialli (revisore B): lanciatore vivo ma entrata chiusa, il comando resta legato a lui (e a TALOS): si dice
        if (!entrata || entrata.destroyed || entrata.writable === false) { diciSfondoNonDetto(this.log); return false }
        this.mandatoInSfondo = true
        try { entrata.write('sfondo\n'); return true } catch { diciSfondoNonDetto(this.log); return false }
    }

    /** Il lanciatore è già uscito: l'uscita vista qui, o `exitCode`/`signalCode` che Node scrive prima di dire `exit`. */
    lanciatoreGiaUscito() {
        const f = this.figlio
        return this.lanciatoreUscito || typeof f?.exitCode === 'number' || typeof f?.signalCode === 'string'
    }

    /**
     * ⛔ Il lanciatore si chiude SOLO dalla sua maniglia, mai per PID (giro 3, 13/11/2026; giudice v1724 strada b e v1733 a).
     * `figlio.kill()` passa dalla maniglia che Node tiene del processo dal suo avvio (libuv `uv_process_kill` → `uv__kill` →
     * `TerminateProcess(process_handle, 1)`, `src/win/process.c:1371` e `:1304`): finché Node la tiene Windows non dà quel PID a nessun
     * altro, e quando l'ha chiusa (subito dopo l'uscita, `:884`) `kill` non fa niente. Prima qui c'era `taskkill /PID <lanciatore> /T /F`:
     * `taskkill.exe` apre il PID 70-100 ms dopo la decisione, e nella gara del guardiano il lanciatore usciva da solo in quel tempo (45
     * dei 56 colpi del revisore, 24 dei 54 nella gara del giro 3, tutti decisi a lanciatore ancora vivo, trovavano il PID già libero:
     * Windows avrebbe potuto averlo ridato). La finestra piccola fra l'uscita vera e quella vista dal nucleo (misura del giudice: 0,86
     * ms di mezzo, 3,39 al massimo su 200 lanci) qui non conta più: per maniglia non c'è un PID da sbagliare. Gli altri processi del
     * comando (shell, figli, nipoti staccati) si chiudono col Job (`TerminateJobObject`, dal lanciatore stesso: giro g4), che chiude
     * solo i membri del gruppo: Codex colpisce allo stesso modo solo per maniglia (`codex-rs/utils/pty/src/win/job.rs:114`) e solo i
     * membri confermati del Job (`:314`). Vero se il colpo è partito.
     */
    chiudiDallaManiglia() {
        if (this.lanciatoreGiaUscito()) return false
        try { return this.figlio.kill?.() !== false } catch { return false }
    }

    /**
     * «Ferma»: il lanciatore chiude il suo Job (`scriviFerma`). Il lanciatore NON si chiude qui: esce da solo quando il gruppo è vuoto
     * (il ripiego dei 2 s lo chiude dalla sua maniglia se non lo fa). Se «ferma» non si può scrivere, o la risposta è `false`
     * (`fermaNonRiuscito`), mai un colpo per PID.
     */
    chiudiIlJob() {
        // ridato all'arrivo di «avvio»: un «chiuso» di prima non vale per la shell che ora c'è
        this.gruppoChiuso = false
        if (!this.scriviFerma()) this.fermaNonRiuscito()
    }

    /**
     * ⛔ Il gruppo non si è potuto chiudere (giro 3): Job che non c'è, «ferma» che non si scrive o che risponde `false`. Prima
     * di «avvio» non è partito niente (e l'appoggio del Job chiude la shell sospesa col lanciatore): il lanciatore si chiude dalla sua
     * maniglia. Dopo «avvio» si chiude lo stesso dalla sua maniglia (è la sola cosa che si raggiunge senza un PID: altrimenti lo Stop
     * resterebbe appeso), e il log dice una volta che i programmi del comando possono restare accesi finché non finiscono. Una volta.
     */
    fermaNonRiuscito() {
        if (this.alberoFinito || this.gruppoNonChiuso) return
        this.gruppoNonChiuso = true
        const dopoAvvio = this.pidShell !== null
        this.chiudiDallaManiglia()
        if (dopoAvvio) diciFermo(this.log)
    }

    /**
     * Chiude un lanciatore che non ha scritto «avvio» (il guardiano, l'attesa breve dello Stop), dalla sua maniglia: prima di «avvio»
     * niente è partito, e la shell sospesa, se c'è già, muore con lui (l'appoggio del Job). ⛔ Mai per PID (giro 3): prima qui c'era
     * `taskkill /PID <lanciatore> /T /F`, e nella gara del guardiano il lanciatore usciva da solo prima che taskkill aprisse il PID.
     */
    chiudiIlLanciatore() {
        this.chiudiDallaManiglia()
    }

    /** Chiude il Job intero (shell, figli e nipoti staccati). Vero se c'era ancora qualcosa da chiudere. */
    fermaAlbero() {
        if (this.alberoFinito) return false
        if (this.diPrima) {
            /* Il comando ripartito senza lanciatore si ferma come lo ferma il nucleo senza lanciatore (`uccidiAlberoDelProcesso`):
               `taskkill /T /F` sul SUO PID, e mai su un PID già uscito (Windows lo riusa: il colpo cadrebbe su un albero estraneo). */
            const d = this.diPrima
            if (!Number.isSafeInteger(d.pid) || typeof d.exitCode === 'number' || typeof d.signalCode === 'string') return false
            this.killed = true
            this.boia(d.pid, () => { try { d.kill('SIGTERM') } catch { /* era già morto */ } })
            return true
        }
        if (this.killed) return true // lo Stop e il tempo possono arrivare insieme: un Job si chiude una volta
        this.killed = true
        this.chiudiIlJob()
        /* Il ripiego dei 2 s: un «ferma» che risponde `true` senza che l'albero si svuoti (o che non risponde) non lascia il comando
           «in corso». Uno solo per comando, anche quando «Ferma» si ridà all'arrivo di «avvio». ⛔ Giro 3: mai per PID. Col gruppo
           chiuso il lanciatore si chiude dalla sua maniglia; col gruppo non chiuso anche, e lo Stop che non l'ha raggiunto si dice. */
        const tardi = setTimeout(() => {
            if (this.alberoFinito) return
            if (this.gruppoChiuso) this.chiudiDallaManiglia(); else this.fermaNonRiuscito()
        }, ATTESA_FERMA_MS)
        tardi.unref?.()
        this.alberoVuoto.then(() => clearTimeout(tardi))
        /* Stop dato prima di «avvio» a un lanciatore appeso: il «ferma» resta nel suo tubo senza risposta e il comando
           resterebbe «in corso» fino ai 2 s. Se «avvio» non arriva nemmeno dopo l'attesa breve, il lanciatore si chiude subito: dopo
           uno Stop non riparte niente, quindi chiudere un lanciatore solo lento non toglie nulla a nessuno. */
        setTimeout(() => { if (this.pidShell === null && !this.alberoFinito) this.chiudiIlLanciatore() }, ATTESA_AVVIO_ALLO_STOP_MS).unref?.()
        return true
    }

    /** Come `ChildProcess.kill`: qui ferma l'albero intero. */
    kill() { return this.fermaAlbero() }
}

/** Per le prove: dimentica stato e motivi già detti. */
export function azzeraLanciatorePerProve() {
    statoAttuale = { nipoti: false, motivo: 'mai-usato' }
    motiviDetti.clear()
    appoggioRifiutato = false
    sganciRifiutato = false
}
