#!/usr/bin/env node
/**
 * L'hook che mi impedisce di fermarmi quando non ho bisogno di niente.
 *
 * ## Il difetto che lo fa nascere
 *
 * Owner, 2026-08-06: «ma ti sei fermato, capisci quello che voglio dire? perché
 * ti sei fermato se non hai bisogno di me, dobbiamo risolvere sta cosa».
 *
 * Avevo appena scritto: «Adesso proseguo su fase 5 e poi il centro notifiche,
 * **salvo che tu voglia** che parta prima da qualcos'altro» — e poi ho chiuso il
 * turno. Quella coda è una richiesta di permesso travestita da proseguimento: se
 * davvero proseguivo, proseguivo.
 *
 * La regola «corsa continua» esisteva già in memoria e l'ho violata lo stesso.
 * Una regola che si può violare senza accorgersene non è una soluzione: serviva
 * un meccanismo che se ne accorga al posto mio, ed è questo.
 *
 * ## Come funziona
 *
 * Guarda l'ultima cosa che ho scritto. Se contiene un'**offerta di continuare**
 * — «vuoi che», «se sei d'accordo», «salvo che tu voglia», «procedo?» — e NON
 * dichiara una fermata legittima, risponde `decision: "block"`, che in Claude
 * Code rimette il modello al lavoro **nello stesso turno** invece di restituire
 * il controllo all'utente.
 *
 * ## Il contratto, e perché è fatto così
 *
 * Ci sono fermate legittime (una decisione che è dell'owner, un'autorizzazione,
 * un blocco tecnico). L'hook non può riconoscerle da fuori — quindi non prova a
 * indovinare: chiede che le si **dichiari**. Se scrivo `⛔ FERMATA:` seguito dal
 * motivo, la fermata passa.
 *
 * Il costo dell'errore è asimmetrico ed è la ragione della forma:
 * bloccare per sbaglio costa qualche altro passo di lavoro; lasciar passare una
 * fermata inutile costa all'owner l'attesa di una risposta che non doveva
 * servire. Il primo si nota subito, il secondo lo si scopre ore dopo.
 *
 * ## Non si avvita
 *
 * `stop_hook_active` è la guardia che la documentazione indica proprio per
 * questo: quando è vera l'hook ha già bloccato una volta, e lascia passare. Al
 * massimo un blocco per turno.
 */

const OFFERTE = [
    // Il caso esatto del 2026-08-06.
    /salvo che tu (voglia|preferisca)/i,
    /se (sei d'accordo|preferisci|vuoi)/i,
    /vuoi che (proceda|continui|parta|faccia|inizi)/i,
    /(procedo|continuo|parto|inizio)\s*\?/i,
    /fammi sapere (se|quando|come)/i,
    /dimmi (se|quando|tu|come) (vuoi|preferisci|procedere)/i,
    /(ti va|va bene) (se|che)\b/i,
    /aspetto (il tuo|un tuo|conferma|indicazioni)/i,
    /quale (preferisci|vuoi che)/i,
    /shall i (proceed|continue|start)/i,
    /(let me know|want me to)\b/i,
]

/** La dichiarazione che rende una fermata legittima, e quindi permessa. */
const FERMATA_DICHIARATA = /⛔\s*FERMATA\s*:/i

function leggiStdin() {
    return new Promise((resolve) => {
        let dati = ''
        process.stdin.setEncoding('utf8')
        process.stdin.on('data', (pezzo) => { dati += pezzo })
        process.stdin.on('end', () => resolve(dati))
        // Se stdin non arriva, non si blocca niente: un hook che pende è peggio
        // di un hook che lascia passare.
        setTimeout(() => resolve(dati), 4000)
    })
}

const RAGIONE = [
    'Ti sei fermato senza averne bisogno: il tuo ultimo messaggio finisce con',
    'un\'offerta di continuare, che è una richiesta di permesso travestita.',
    'Se stavi per proseguire, prosegui adesso — nello stesso turno, senza',
    'chiedere. La regola è la «corsa continua»: sugli step approvati si va da',
    'soli.',
    '',
    'Se invece sei davvero bloccato, dillo in modo esplicito scrivendo',
    '«⛔ FERMATA: <quale delle cinque fermate legittime>» e allora potrai',
    'chiudere il turno.',
].join(' ')

/**
 * La decisione, come funzione pura — così ha una prova sua.
 *
 * Separata dal maneggio di stdin di proposito: la parte che può sbagliare è il
 * giudizio, non la lettura, e un giudizio che si prova solo lanciando l'intero
 * processo è un giudizio che nessuno prova.
 *
 * @returns `null` per «lascia passare», o l'oggetto da stampare per bloccare.
 */
export function decidiFermata(input) {
    // Già bloccato una volta in questo turno: si lascia passare, come indica la
    // documentazione. Un hook che blocca all'infinito è un'app che non risponde.
    if (input?.stop_hook_active === true) return null

    // `max_tokens` non è una scelta: è il turno che è finito da solo, e
    // rimandarlo al lavoro produrrebbe solo un altro troncamento.
    if (input?.stop_reason && input.stop_reason !== 'end_turn') return null

    const messaggio = typeof input?.last_assistant_message === 'string'
        ? input.last_assistant_message
        : ''
    if (messaggio.length === 0) return null

    // Una fermata dichiarata è una fermata permessa. È l'unica via d'uscita, ed
    // è deliberatamente esplicita: costringe a NOMINARE il motivo, che è il
    // punto in cui ci si accorge che il motivo non c'è.
    if (FERMATA_DICHIARATA.test(messaggio)) return null

    // Si guarda la CODA, non tutto il testo: citare una domanda a metà di un
    // messaggio lungo è normale, chiuderci sopra il turno no.
    const coda = messaggio.slice(-600)
    if (!OFFERTE.some((forma) => forma.test(coda))) return null

    return { decision: 'block', reason: RAGIONE }
}

async function main() {
    let input = {}
    try {
        input = JSON.parse(await leggiStdin())
    } catch {
        // Un ingresso illeggibile non deve trattenere nessuno.
        process.exit(0)
    }
    const esito = decidiFermata(input)
    if (esito) process.stdout.write(JSON.stringify(esito))
    process.exit(0)
}

// Eseguito come hook, non quando lo importa la sua prova.
if (process.argv[1] && process.argv[1].endsWith('non-fermarti.mjs')) void main()
