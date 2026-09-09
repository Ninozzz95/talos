#!/usr/bin/env node
/**
 * Ciò che va rimesso in testa DOPO che il contesto è stato compattato.
 *
 * ## Il difetto che lo fa nascere
 *
 * Questa sessione ha superato la compattazione una volta, e il riassunto ha
 * fatto il suo lavoro. Ma un riassunto conserva la NARRAZIONE e perde due cose
 * che non sono narrazione:
 *
 * 1. **I contratti d'uscita.** Dopo la compattazione non sapevo più che esiste
 *    `⛔ FERMATA:`. Una via d'uscita che si dimentica è una via d'uscita che
 *    non c'è.
 * 2. ⛔ **I numeri misurati sul dispositivo.** Il 2026-08-08 ho ri-dedotto per
 *    plausibilità tre volte cose che avevo già misurato — e ogni deduzione è
 *    costata un giro di build e installazione. Un riassunto scrive «la
 *    grammatica non compilava»; quello che serve è `55.871 byte, 46 tool,
 *    "number of rules ... exceeds sane defaults"`.
 *
 * La ricerca su questo è concorde e recente: Anthropic elenca fra le tecniche
 * per gli agenti a lungo orizzonte la **presa di appunti strutturata** — un
 * file fuori dal contesto che l'agente tiene aggiornato — e la **reiniezione**
 * dopo la compattazione, proprio con l'evento `SessionStart` e matcher
 * `compact`. È l'unico hook la cui uscita standard diventa contesto.
 *
 * ## Cosa rimette, e cosa NON rimette
 *
 * Rimette poco, di proposito: il contesto è una risorsa finita, e un hook che
 * ci riversa dentro mezza memoria fa il danno che dovrebbe evitare. Quindi
 * soltanto:
 *
 * - le tre vie d'uscita dichiarabili, che sono un contratto e non un consiglio;
 * - il **taccuino**, se esiste: i fatti MISURATI in questa sessione, che sono
 *   la cosa più cara da ricomprare e l'unica che nessun riassunto ricostruisce.
 *
 * Non rimette le regole di ingegneria: quelle stanno in `MEMORY.md` e arrivano
 * comunque a ogni sessione. Ripeterle qui sarebbe pagare due volte.
 *
 * ## Il taccuino
 *
 * `.claude/TACCUINO.md`, che tengo io. Non è un diario: è l'elenco dei fatti
 * che ho **misurato** e che costerebbero un altro giro sul dispositivo per
 * riaverli. Se è vuoto, questo hook non stampa niente — un promemoria vuoto è
 * solo rumore.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Le tre uscite dichiarabili. Valgono sempre, e un riassunto non le conserva.
 */
const USCITE = [
    '  ⛔ FERMATA: <motivo>          per chiudere il turno quando servi davvero all\'owner',
    '  ⛔ NON VERIFICATO: <cosa>     per chiudere un turno in cui hai toccato codice senza provarlo',
    '  git push                      si CHIEDE ogni volta, e parte solo dopo il suo si\' — mai di tua',
    '                                iniziativa, e sempre nella forma git -C <percorso> push',
].join('\n')

/**
 * ⛔⛔⛔ LE REGOLE VINCOLANTI, per una sessione che NASCE ADESSO.
 *
 * Owner 2026-08-16, preparando il passaggio a una sessione nuova: «SOPRATTUTTO
 * FAI IN MODO ASSOLUTO CHE LA NUOVA SESSIONE MEMORIZZI LE REGOLE VINCOLANTI».
 *
 * Stanno gia' in cima a `MEMORY.md`, che si carica da solo. Ma «si carica» non
 * e' «e' stato letto»: un indice da 21 KB si scorre, e le righe in cima sono
 * quelle che si danno per lette. ⇒ Qui arrivano per un canale diverso, prima di
 * qualunque cosa, e costano dieci righe.
 *
 * ⛔ Non e' un riassunto delle memorie: e' il minimo che, se manca, fa partire
 * la sessione zoppa.
 */
const REGOLE = [
    '⛔⛔ LE REGOLE VINCOLANTI — prima di scrivere una riga di codice:',
    '',
    '  1. RICERCA WEB PRIMA. Se stai per scrivere qualcosa che esiste in migliaia di',
    '     repository (un workflow CI, una firma di APK, un Dockerfile), la tua memoria',
    '     e\' la fonte sbagliata. Il 2026-08-16 saltarla e\' costato CINQUE corse fallite',
    '     su difetti che stavano tutti nel primo risultato di una query sola.',
    '',
    '  2. SI STRUMENTA PRIMA DI IPOTIZZARE. Tre ipotesi plausibili rilette a mente',
    '     sono costate un\'ora; una sonda nel codice ha chiuso la questione in un giro.',
    '',
    '  3. PROVA ANCHE AL CONTRARIO. Ogni funzione si prova nei due versi: accendere E',
    '     spegnere, presente E assente. Meta\' dei difetti di oggi stavano nel verso',
    '     che non avevo provato.',
    '',
    '  4. NIENTE E\' CHIUSO SENZA DISPOSITIVO REALE, con tocchi adb veri e uno',
    '     SCREENSHOT ISPEZIONATO. Una grep non e\' una prova. «BUILD SUCCESSFUL» non e\'',
    '     una prova: il 16/8 usciva un APK NON FIRMATO con esito verde.',
    '',
    '  5. UNA CORSA PULITA NON PROVA L\'ASSENZA DI UN GUASTO INTERMITTENTE.',
    '',
    '  6. SE LA TOCCHI, LA PROVI TUTTA: chi tocca una superficie la guarda tutta, la',
    '     confronta con la sorella, e rileva anche gli errori di stile. Da solo.',
    '',
    '  7. CORSA CONTINUA: sugli step approvati si va da soli. Le uniche fermate sono',
    '     quelle dichiarate qui sotto, dicendo QUALE.',
].join('\n')

export function componiPromemoria(taccuino, origine = 'compact') {
    const nuova = origine !== 'compact'
    const testa = nuova
        ? [REGOLE, '', 'E le tre uscite dichiarabili:', '', USCITE, '',
           '⇒ Lo stato del lavoro, e da dove si riparte: .claude/CONSEGNA.md']
        : ['PROMEMORIA DOPO LA COMPATTAZIONE — le tre uscite dichiarabili, che il riassunto non conserva:', '', USCITE]

    const appunti = String(taccuino ?? '').trim()
    if (!appunti) return testa.join('\n')
    return [
        ...testa,
        '',
        'E i fatti MISURATI in questa sessione — non ri-dedurli, sono gia\' costati:',
        '',
        appunti,
    ].join('\n')
}

/**
 * ⛔ L'origine arriva su stdin (`{"source":"startup"|"resume"|"compact"}`), e
 * decide COSA si stampa: a una sessione appena nata servono le regole, a una
 * compattata serve sapere cosa il riassunto ha perso.
 *
 * Se stdin non arriva entro un attimo si assume `startup`: fra stampare le
 * regole a chi le aveva gia' e non stamparle a chi non le ha, il secondo errore
 * costa infinitamente di piu'.
 */
function leggiOrigine() {
    return new Promise((resolve) => {
        let dati = ''
        process.stdin.setEncoding('utf8')
        process.stdin.on('data', (p) => { dati += p })
        process.stdin.on('end', () => {
            try { resolve(JSON.parse(dati).source ?? 'startup') } catch { resolve('startup') }
        })
        setTimeout(() => {
            try { resolve(JSON.parse(dati).source ?? 'startup') } catch { resolve('startup') }
        }, 1500)
    })
}

async function main() {
    const radice = process.env.CLAUDE_PROJECT_DIR ?? process.cwd()
    const origine = await leggiOrigine()
    let taccuino = ''
    try {
        taccuino = readFileSync(join(radice, '.claude', 'TACCUINO.md'), 'utf8')
    } catch {
        // Nessun taccuino: si stampano i soli contratti.
    }
    process.stdout.write(componiPromemoria(taccuino, origine))
    process.exit(0)
}

if (process.argv[1] && process.argv[1].endsWith("dopo-la-compattazione.mjs")) void main()
