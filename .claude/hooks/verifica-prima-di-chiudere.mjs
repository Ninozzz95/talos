#!/usr/bin/env node
/**
 * L'hook che mi impedisce di chiudere un turno in cui ho toccato il codice
 * senza aver eseguito NIENTE per vedere se regge.
 *
 * ## I difetti che lo fanno nascere, tutti dello stesso giorno
 *
 * 2026-08-08. Tre volte, in poche ore, ho detto che una cosa era fatta e non
 * lo era. Non per distrazione: perché **leggere il proprio codice non è
 * provarlo**, e da dentro le due cose si somigliano.
 *
 * 1. «Le frasi delle due lingue sono scritte» — non lo erano. Le ha trovate
 *    una guardia del pannello, non io.
 * 2. «Catalogo, sicurezza, etichette, icone, i18n e toolset: tutto collegato»
 *    — mancava l'ultimo centimetro, `deps.device`, e il modello non vedeva
 *    nessuno dei nove tool. Il typecheck era pulito e 4.312 prove passavano.
 * 3. «La grammatica adesso compila» — vero, e nello stesso momento l'app
 *    moriva su un carattere UTF-8 monco. L'ho scoperto perché sono andato a
 *    guardare, non perché qualcosa me l'abbia detto.
 *
 * ## Perché una regola in più non basta
 *
 * Esistono già, e sono vincolanti: «provato o non è finito», «riprodurre prima
 * di dire risolto», «niente è chiuso finché non è visto sul dispositivo». Le ho
 * violate lo stesso, e senza accorgermene — che è esattamente la ragione per
 * cui l'hook `non-fermarti.mjs` esiste. Una regola che si può violare senza
 * accorgersene non è una soluzione; serve un meccanismo che se ne accorga al
 * posto mio.
 *
 * ## ⛔ La regola, e perché NON guarda le parole
 *
 * La tentazione era cercare le affermazioni — «fatto», «risolto», «funziona» —
 * e chiedere le prove. È fragile in due sensi opposti: in italiano quelle
 * parole compaiono ovunque (falsi allarmi a ogni turno di conversazione), e
 * basta scrivere «ora dovrebbe andare» per aggirarla.
 *
 * La regola vera non ha bisogno di leggere niente:
 *
 *     se in questo turno ho MODIFICATO del codice
 *     e non ho ESEGUITO nessuna verifica
 *     allora il turno non si chiude.
 *
 * Due fatti osservabili, nessun giudizio. Un turno di sola conversazione passa
 * sempre; un turno che ha cambiato dei file no.
 *
 * ## La via d'uscita, che è deliberatamente esplicita
 *
 * `⛔ NON VERIFICATO: <cosa manca e perché>` — la stessa forma di
 * `⛔ FERMATA:`. Ci sono casi legittimi: una modifica che serve al prossimo
 * passo, una build che dura venti minuti e sta partendo, un file che non è
 * codice. In tutti, il costo è scrivere una riga che NOMINA cosa non ho
 * provato. È lì che ci si accorge che si stava per dire «fatto».
 *
 * L'asimmetria del costo è la stessa dell'altro hook: bloccare per sbaglio
 * costa un comando in più; lasciar passare un «fatto» falso costa all'owner la
 * fiducia in tutto il resto — e lo scopre lui, ore dopo, sul suo telefono.
 */

/** Gli strumenti con cui si CAMBIA qualcosa. */
const MODIFICA = new Set(['Edit', 'Write', 'NotebookEdit'])

/**
 * I comandi che contano come verifica ESEGUITA.
 *
 * ⛔ Non «aver aperto il file»: aver fatto girare qualcosa che può dire di no.
 * `git status` non è una verifica, `vitest` sì; leggere il logcat dopo aver
 * toccato il telefono lo è, perché è la sola cosa che smentisce.
 */
const VERIFICHE = [
    /\bvitest\b/i,
    /\bnpm\s+(run\s+)?(test|typecheck|build|lint)\b/i,
    /\bnpx\s+(vue-)?tsc\b/i,
    /\bgradlew\b/i,
    /\badb(\.exe)?\b/i,
    /\bapksigner\b/i,
    /\bpytest\b|\bcargo\s+test\b|\bgo\s+test\b/i,
    // Il telecomando del Pad: trovare e toccare sul dispositivo vero.
    /device\.mjs\b/i,
]

const NON_VERIFICATO = /⛔\s*NON\s+VERIFICATO\s*:/i

const RAGIONE = [
    'In questo turno hai MODIFICATO del codice e non hai ESEGUITO nessuna',
    'verifica: né i test, né il typecheck, né una build, né una prova sul',
    'dispositivo. Leggere il proprio codice non è provarlo — il 2026-08-08 è',
    'successo tre volte in poche ore, e ogni volta il difetto era in un punto',
    'che rileggendo sembrava a posto.',
    '',
    'Fai girare adesso la verifica che morde per ciò che hai toccato:',
    '`npm run typecheck` e `npx vitest run` per il TypeScript, `gradlew` per il',
    'nativo, `scripts/device.mjs` più `adb` per qualunque cosa si veda sul Pad.',
    '',
    'Se c\'è un motivo vero per non verificare adesso — la modifica serve al',
    'passo successivo, la build sta partendo, il file non è codice — scrivilo:',
    '«⛔ NON VERIFICATO: <cosa manca e perché>». Nominarlo è il punto in cui ci',
    'si accorge se il motivo esiste davvero.',
].join(' ')

/**
 * La decisione, come funzione pura — così ha una prova sua, e la parte che può
 * sbagliare (il giudizio) si può provare senza lanciare un processo.
 *
 * @param {object} input  il payload dell'hook `Stop`
 * @param {Array}  turno  gli eventi di questo turno, dal transcript
 * @returns `null` per «lascia passare», o l'oggetto da stampare per bloccare.
 */
export function decidiVerifica(input, turno) {
    if (input?.stop_hook_active === true) return null
    if (input?.stop_reason && input.stop_reason !== 'end_turn') return null

    const messaggio = typeof input?.last_assistant_message === 'string'
        ? input.last_assistant_message
        : ''
    if (NON_VERIFICATO.test(messaggio)) return null

    let haModificato = false
    let haVerificato = false
    for (const evento of turno ?? []) {
        const nome = evento?.name ?? ''
        if (MODIFICA.has(nome)) haModificato = true
        // Il comando puo' stare in `command` (Bash, PowerShell) o essere il
        // nome stesso dello strumento.
        const comando = typeof evento?.command === 'string' ? evento.command : ''
        if (VERIFICHE.some((forma) => forma.test(comando))) haVerificato = true
    }

    if (!haModificato) return null
    if (haVerificato) return null
    return { decision: 'block', reason: RAGIONE }
}

/**
 * Gli strumenti usati DA QUANDO l'owner ha parlato l'ultima volta.
 *
 * Si legge il transcript perché è l'unica fonte di ciò che è successo davvero:
 * quello che ricordo io è esattamente la cosa che questo hook non deve credere.
 */
export function eventiDelTurno(testoTranscript) {
    const righe = String(testoTranscript ?? '').split('\n').filter(Boolean)
    const eventi = []
    for (const riga of righe) {
        let voce
        try { voce = JSON.parse(riga) } catch { continue }
        // Un turno nuovo dell'owner azzera il conto.
        if (voce?.type === 'user' && !voce?.isMeta && typeof voce?.message?.content === 'string') {
            eventi.length = 0
            continue
        }
        const contenuto = voce?.message?.content
        if (!Array.isArray(contenuto)) continue
        for (const parte of contenuto) {
            if (parte?.type !== 'tool_use') continue
            eventi.push({
                name: parte.name,
                command: parte?.input?.command ?? parte?.input?.file_path ?? '',
            })
        }
    }
    return eventi
}

function leggiStdin() {
    return new Promise((resolve) => {
        let dati = ''
        process.stdin.setEncoding('utf8')
        process.stdin.on('data', (pezzo) => { dati += pezzo })
        process.stdin.on('end', () => resolve(dati))
        setTimeout(() => resolve(dati), 4000)
    })
}

async function main() {
    let input = {}
    try {
        input = JSON.parse(await leggiStdin())
    } catch {
        process.exit(0)
    }
    let turno = []
    try {
        const { readFileSync } = await import('node:fs')
        turno = eventiDelTurno(readFileSync(input.transcript_path, 'utf8'))
    } catch {
        // Senza transcript non si giudica: un hook che blocca al buio e' peggio
        // di un hook che lascia passare.
        process.exit(0)
    }
    const esito = decidiVerifica(input, turno)
    if (esito) process.stdout.write(JSON.stringify(esito))
    process.exit(0)
}

if (process.argv[1] && process.argv[1].endsWith('verifica-prima-di-chiudere.mjs')) void main()
