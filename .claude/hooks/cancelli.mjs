#!/usr/bin/env node
/**
 * ⭐⭐⭐ I CANCELLI — una tavola sola per tutte le regole vincolanti.
 *
 * ## Il difetto che lo fa nascere, e ha un NUMERO
 *
 * 2026-08-17. L'owner, in maiuscolo: «LA RICERCA WEB SEMPREEEEEEE FAI IN MODO
 * DI NON DIMENTICARLO MAI PIÙ». Aveva ragione: la Regola Zero della memoria
 * dice «ricerca web PRIMA, a OGNI fix», è scritta con tre ⛔ in cima
 * all'indice, e a metà sessione stavo implementando senza averla fatta.
 *
 * ⛔ E non è distrazione. La ricerca lo misura, ed è un fenomeno con un nome:
 * *«Omission Constraints Decay While Commission Constraints Persist in
 * Long-Context LLM Agents»* (arXiv 2604.20911).
 *
 *     rispetto dei DIVIETI      73% al turno 5  →  33% al turno 16
 *     rispetto degli OBBLIGHI   100%, costante
 *
 * «Non implementare senza aver cercato» è un DIVIETO. Decade per costruzione,
 * e decade proprio nei turni lunghi — cioè in tutti quelli che contano.
 *
 * ## ⛔ E la stessa ricerca dice che ciò che stavamo usando NON funziona
 *
 * | rimedio provato                    | effetto misurato                    |
 * |------------------------------------|-------------------------------------|
 * | ripetere l'avviso (la Regola Zero) | ⛔ cala dopo 2-3 ripetizioni        |
 * | dare token per «ricordare»         | ⛔ nullo senza applicazione esterna |
 * | una checklist                      | +15-30%, non affidabile             |
 * | **cancello esterno**               | ⭐ il più efficace e il più costante |
 *
 * ⇒ Un divieto scritto in un documento non si può rispettare a lungo. Va
 * trasformato in un fatto OSSERVABILE che qualcun altro controlla. È
 * esattamente ciò che questo progetto fa già altrove — il cancello sul
 * changelog dentro il workflow, quello sugli screenshot dentro lo script di
 * pubblicazione — e la ragione è sempre la stessa: *una regola che vive in una
 * testa salta al primo turno lungo*.
 *
 * ## ⛔ Perché UNA tavola e non un hook per regola
 *
 * Gli hook che c'erano — `mai-push`, `non-fermarti`,
 * `verifica-prima-di-chiudere` — sono nati uno alla volta, ognuno col suo file
 * e la sua lettura del transcript. Alla quarta regola quel modo diventa quattro
 * copie della stessa logica che divergono.
 *
 * Qui la logica è UNA e le regole sono RIGHE. Aggiungerne una è aggiungere una
 * riga, e la riga porta con sé la sua prova.
 *
 * ## ⛔⛔ E si dice anche quali regole NON si possono mettere qui
 *
 * Un cancello può controllare solo ciò che lascia una traccia. «Un-up rispetto
 * a Gemini», «lavoro coeso», «ambizione» sono giudizi, non fatti osservabili:
 * metterli qui vorrebbe dire un cancello che indovina, e un cancello che
 * indovina si impara a aggirare. Restano nella memoria, dove sono, e questa
 * tavola le elenca con `dove: 'giudizio'` — così chi legge vede l'insieme
 * intero e sa quali sono difese da un meccanismo e quali no.
 */

/**
 * ⛔ Il codice che CAMBIA COMPORTAMENTO. Non i test, non i documenti, non il
 * banco, non lo scratchpad.
 *
 * La scelta è di proporzione: un cancello che blocca ogni scrittura si fa
 * odiare e si finisce per spegnerlo, e un cancello spento difende zero. Questo
 * scatta dove sbagliare costa a una persona vera.
 */
const CODICE_DI_PRODUZIONE = [
    /[\\/]mobile[\\/]src[\\/]/i,
    /[\\/]mobile[\\/]android[\\/]app[\\/]src[\\/]/i,
]

/** I file che ESCONO, e che quindi si scrivono in inglese. */
const TESTI_PUBBLICI = [/CHANGELOG\.md$/i, /(^|[\\/])README\.md$/i]

/**
 * ⛔ Parole che in un testo pubblico tradiscono l'italiano, e che NON compaiono
 * in inglese. Poche e inequivocabili: una lista lunga produce falsi allarmi, e
 * un falso allarme al mese basta a far spegnere il cancello.
 *
 * ⛔ E i confini sono UNICODE, non `\b`. Trovato provandolo: in JavaScript `\b`
 * è definito su `[A-Za-z0-9_]`, quindi fra uno spazio e la `è` non c'è nessun
 * confine — `\bè stato\b` non trova MAI «è stato». Il cancello sarebbe stato
 * verde, silenzioso e inutile, e me ne sarei accorto il giorno in cui un
 * CHANGELOG in italiano fosse uscito su GitHub.
 */
const ITALIANO = /(?<!\p{L})(è stato|è stata|perché|poiché|non è|c'è|sono stati|dell'|nell'|un'altra)(?!\p{L})/iu

const STRUMENTI_CHE_SCRIVONO = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])

/**
 * ⭐⭐⭐ LA TAVOLA — ogni regola vincolante, e dove è difesa.
 *
 * `dove` dice la verità su ognuna:
 *   'qui'      questo file la fa rispettare
 *   'altrove'  ha già il suo hook, e resta lì finché funziona
 *   'giudizio' non è osservabile: vive nella memoria, e nessun cancello la copre
 */
export const TAVOLA = [
    {
        nome: 'ricerca-prima-di-implementare',
        dove: 'qui',
        memoria: 'web-research-before-implementation',
        /**
         * Scatta alla PRIMA scrittura di codice di produzione dopo che l'owner
         * ha parlato. Una ricerca per istruzione, che è esattamente ciò che
         * dice la Regola Zero — «a OGNI fix» — e non una per file toccato.
         */
        quando: (ctx) => STRUMENTI_CHE_SCRIVONO.has(ctx.strumento)
            && CODICE_DI_PRODUZIONE.some((forma) => forma.test(ctx.file)),
        soddisfatta: (eventi) => eventi.some((e) => e.name === 'WebSearch' || e.name === 'WebFetch'),
        motivo: [
            '⛔ REGOLA ZERO: stai per cambiare il codice senza aver fatto una ricerca web in questo turno.',
            '',
            'Non è pignoleria, è un numero: i DIVIETI decadono dal 73% al 33% fra il turno 5 e il turno 16',
            '(arXiv 2604.20911), e questo è il divieto che decade più spesso. La ricerca costa una chiamata;',
            'saltarla è già costato cinque muri di fila una volta.',
            '',
            'Fai una WebSearch (o una WebFetch) su come lo risolve lo stato dell\'arte, POI torna a scrivere.',
            'Se davvero non serve — è un rinominare, un commento, una riga di traduzione — dillo a voce',
            'nel messaggio prima di riprovare, con "⛔ SENZA RICERCA:" e il perché.',
        ].join('\n'),
    },
    {
        nome: 'lo-screenshot-si-guarda',
        dove: 'qui',
        memoria: 'screenshot-obbligatorio-e-fonte-di-anomalie',
        /**
         * ⛔ Uno screenshot preso e mai aperto è peggio di nessuno screenshot:
         * fa credere di aver guardato. È successo — tre volte l'owner ha
         * bocciato a colpo d'occhio una vista che io avevo dichiarato
         * «eccellente» senza averla davvero ispezionata.
         */
        quando: (ctx) => STRUMENTI_CHE_SCRIVONO.has(ctx.strumento)
            && CODICE_DI_PRODUZIONE.some((forma) => forma.test(ctx.file)),
        soddisfatta: (eventi) => {
            const presi = eventi.filter((e) => /screencap/i.test(e.command ?? ''))
            if (presi.length === 0) return true
            return eventi.some((e) => e.name === 'Read' && /\.png$/i.test(e.command ?? ''))
        },
        motivo: [
            '⛔ Hai preso uno screenshot e non l\'hai aperto.',
            '',
            'Uno screenshot mai guardato è peggio di nessuno screenshot: fa credere di aver guardato.',
            'Tre volte una vista dichiarata «eccellente» è stata bocciata a colpo d\'occhio dall\'owner —',
            'viewport sbagliata, chat nella lingua sbagliata — cose che si vedono solo guardando.',
            '',
            'Aprilo con Read prima di continuare.',
        ].join('\n'),
    },
    {
        nome: 'fuori-si-scrive-in-inglese',
        dove: 'qui',
        memoria: 'fuori-si-scrive-in-inglese',
        quando: (ctx) => STRUMENTI_CHE_SCRIVONO.has(ctx.strumento)
            && TESTI_PUBBLICI.some((forma) => forma.test(ctx.file))
            && ITALIANO.test(ctx.testo),
        soddisfatta: () => false,
        motivo: [
            '⛔ Questo file ESCE, e fuori si scrive in inglese.',
            '',
            'Il testo che stai per scrivere contiene italiano. CHANGELOG e README li legge chi non ti',
            'conosce: l\'italiano resta nei documenti interni e nella chat con l\'owner.',
        ].join('\n'),
    },
    /*
     * ⛔ Le tre qui sotto hanno già il loro hook, scritto prima di questa
     * tavola e funzionante. Non si riscrivono per uniformità: riscrivere una
     * guardia che funziona è il modo di romperla. Stanno qui perché la tavola
     * dev'essere l'ELENCO COMPLETO — chi legge deve vedere anche ciò che è
     * difeso altrove, se no cerca un buco che non c'è.
     */
    { nome: 'il-push-si-chiede', dove: 'altrove', hook: 'mai-push.mjs', memoria: 'commit-si-push-mai' },
    { nome: 'non-fermarti', dove: 'altrove', hook: 'non-fermarti.mjs', memoria: 'stop-hook-anti-fermata' },
    { nome: 'provato-o-non-e-finito', dove: 'altrove', hook: 'verifica-prima-di-chiudere.mjs', memoria: 'assert-outcome-not-the-call' },
    /*
     * ⛔ E queste NON sono osservabili. Dirlo è parte del lavoro: una tavola che
     * fingesse di coprirle farebbe credere di essere protetti dove non si è.
     */
    { nome: 'un-up-e-ambizione', dove: 'giudizio', memoria: 'vincoli-ingegneristici-talos' },
    { nome: 'se-la-tocchi-la-provi-tutta', dove: 'giudizio', memoria: 'se-la-tocchi-la-provi-tutta' },
    { nome: 'quattro-combinazioni-sul-dispositivo', dove: 'giudizio', memoria: 'quattro-combinazioni-su-dispositivo' },
]

/**
 * ⛔ LA VIA D'USCITA, e perché è dichiarata invece che silenziosa.
 *
 * La ricerca che ha fatto nascere questo file dice che il rimedio che regge
 * davvero è un «observable checkpoint»: il modello deve DICHIARARE che sta
 * omettendo, invece di ometterlo e basta. Una via d'uscita che si prende in
 * silenzio non sarebbe un cancello; una che costa una frase scritta all'owner
 * lo è, perché lui la legge.
 */
const SENZA_RICERCA = /⛔\s*SENZA RICERCA:/i

/**
 * La decisione, come funzione pura — così si prova senza lanciare un processo.
 *
 * @param {object} input   il payload dell'hook `PreToolUse`
 * @param {Array}  eventi  gli strumenti usati da quando l'owner ha parlato
 * @returns `null` per «lascia passare», o l'oggetto da stampare per fermare.
 */
export function decidiCancello(input, eventi) {
    const strumento = input?.tool_name ?? ''
    if (!STRUMENTI_CHE_SCRIVONO.has(strumento)) return null

    const ingresso = input?.tool_input ?? {}
    const ctx = {
        strumento,
        file: String(ingresso.file_path ?? ''),
        /*
         * ⛔ Si guarda ciò che si sta per SCRIVERE, non il file intero: un
         * CHANGELOG con dentro le versioni vecchie in italiano bloccherebbe
         * per sempre ogni modifica futura, anche quelle scritte bene.
         */
        testo: String(ingresso.new_string ?? ingresso.content ?? ''),
    }

    const detto = String(input?.last_assistant_message ?? '')
    for (const regola of TAVOLA) {
        if (regola.dove !== 'qui') continue
        if (!regola.quando(ctx)) continue
        if (regola.soddisfatta(eventi ?? [])) continue
        // ⛔ La via d'uscita vale SOLO per la ricerca: le altre due non hanno un
        // caso legittimo in cui saltarle, e una scappatoia generica sarebbe una
        // scappatoia e basta.
        if (regola.nome === 'ricerca-prima-di-implementare' && SENZA_RICERCA.test(detto)) continue
        return {
            hookSpecificOutput: {
                hookEventName: 'PreToolUse',
                permissionDecision: 'deny',
                permissionDecisionReason: regola.motivo,
            },
        }
    }
    return null
}

/**
 * Gli strumenti usati DA QUANDO l'owner ha parlato l'ultima volta.
 *
 * ⛔ Si legge il transcript perché è l'unica fonte di ciò che è successo
 * davvero: quello che ricordo io è esattamente la cosa che questo cancello non
 * deve credere.
 */
export function eventiDelTurno(testoTranscript) {
    const righe = String(testoTranscript ?? '').split('\n').filter(Boolean)
    const eventi = []
    for (const riga of righe) {
        let voce
        try { voce = JSON.parse(riga) } catch { continue }
        // Un turno nuovo dell'owner azzera il conto: una ricerca fatta per
        // un'altra domanda non vale per questa.
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
    let input
    try {
        input = JSON.parse(await leggiStdin())
    } catch {
        // ⛔ Al buio si LASCIA PASSARE, al contrario di `mai-push`. Lì l'errore
        // da evitare è pubblicare per sbaglio, e vale la pena fermarsi; qui
        // sarebbe bloccare ogni modifica per un payload illeggibile, cioè
        // rompere il lavoro per difendere una regola sul lavoro.
        process.exit(0)
    }
    let eventi = []
    try {
        const { readFileSync } = await import('node:fs')
        eventi = eventiDelTurno(readFileSync(input.transcript_path, 'utf8'))
    } catch {
        process.exit(0)
    }
    const esito = decidiCancello(input, eventi)
    if (esito) process.stdout.write(JSON.stringify(esito))
    process.exit(0)
}

if (process.argv[1] && process.argv[1].endsWith('cancelli.mjs')) void main()
