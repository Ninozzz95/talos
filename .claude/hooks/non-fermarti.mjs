#!/usr/bin/env node
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
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

/**
 * Le PROMESSE, che sono la seconda forma della stessa fermata.
 *
 * Owner, 2026-08-06, poche ore dopo la prima: «e ti sei fermato di nuovo».
 * Avevo chiuso con «Restano da innestare i canali Android, il campanello e la
 * notifica di background. **Vado su quelli**» — e poi ho chiuso il turno.
 *
 * La prima versione dell'hook guardava solo le OFFERTE («vuoi che», «salvo che
 * tu voglia»), e questa passava indenne: non chiedevo permesso, dichiaravo
 * un'intenzione. Ma una promessa su un lavoro non fatto è una fermata identica —
 * anzi peggiore, perché sembra un proseguimento.
 *
 * È anche esattamente ciò che la guida di Anthropic per il lavoro autonomo dice
 * di controllare: se l'ultimo paragrafo è un piano, un elenco di prossimi passi o
 * una promessa («adesso faccio…», «vado su…»), quel lavoro va fatto ORA con
 * delle chiamate, non annunciato.
 */
const PROMESSE = [
    /\bvado (su|a|con|avanti con)\b/i,
    /\b(adesso|ora|poi) (faccio|vado|passo|procedo|implemento|continuo|inizio)\b/i,
    /\b(proseguo|procedo|continuo) (con|su|adesso|ora)\b/i,
    /\brest(a|ano) da (fare|innestare|implementare|collegare|scrivere)\b/i,
    /\bil prossimo (passo|blocco|pezzo)\b/i,
    /\bnel prossimo (turno|passo|blocco)\b/i,
    /\bmi metto (su|a)\b/i,
    /\b(next up|next step|i'?ll (do|start|move|go)|moving on to)\b/i,
]

/**
 * ⛔⛔ LA TERZA FORMA: IL RESOCONTO CHE SI FERMA.
 *
 * Owner, 2026-08-13: «ti sei fermato, hai violato la regola, fai in modo che non
 * si ripeta più, impara dai tuoi errori e continua».
 *
 * Il messaggio che l'ha causato non conteneva **niente** di ciò che l'hook
 * cercava: nessuna offerta («vuoi che»), nessuna promessa («adesso faccio»),
 * nessuna fermata dichiarata. Era un rapporto su un difetto appena trovato, che
 * finiva con «**Annotato, non mi ferma**» — e poi si fermava.
 *
 * ## Perché è la forma più insidiosa delle tre
 *
 * Le prime due si riconoscono perché parlano del FUTURO. Questa parla del
 * passato: descrive un lavoro fatto, e per questo sembra completa. Ma un difetto
 * trovato **dentro** una fase non chiude la fase — la regola lo dice da sempre:
 * «trovare un difetto durante una fase non ferma la fase, si registra e, se è
 * nel perimetro, si corregge». Raccontarlo e chiudere il turno è registrarlo e
 * basta.
 *
 * ⇒ Le spie sono le frasi con cui si archivia qualcosa **senza averlo chiuso**:
 * «annotato», «non mi ferma», «resta aperto», «la prossima misura», «conferma la
 * colonna X». Ognuna dichiara di sapere qual è il passo dopo — che è esattamente
 * la prova che si poteva farlo.
 */
const RESOCONTI_CHE_SI_FERMANO = [
    /\bannotat[oi]\b/i,
    /\bnon mi ferma\b/i,
    /\bnon lo conto\b/i,
    /\brest(a|ano) (aperto|aperte|da (fare|provare|vedere|misurare|chiudere))\b/i,
    /\bla prossima (misura|mossa|prova|cosa)\b/i,
    /\bconferma (la colonna|il compito|il rilievo|#\d)/i,
    /\bnon l.ho (ancora )?(fatto|provato|visto|chiuso)\b/i,
    /\bsu disco,? (con|e)\b/i,
]

/**
 * ⛔⛔ LO STATO, non le parole — ed è quello che dice la ricerca.
 *
 * Owner, 2026-08-13: «ti stai fermando in continuazione c'è qualcosa che non va,
 * ricerca web su come impedirti di farti fermare se non ne hai realmente
 * bisogno».
 *
 * ## Cosa dice la ricerca, e perché le tre forme precedenti non bastavano
 *
 * Il difetto ha un nome nella letteratura: **false-finish** / premature
 * termination. Gli agenti a lungo orizzonte **sovrastimano il completamento** e
 * **sotto-investono nella verifica finale** — giudicano su una confidenza
 * *locale* («questo pezzo è fatto») mentre la correttezza è *globale*
 * (arXiv 2605.23574, «Push Your Agent»; arXiv 2604.11978). Non è pigrizia: è un
 * errore di stima sistematico, e per questo una regola scritta non lo cura.
 *
 * E la cura che indicano NON è riconoscere le frasi: è **stato strutturato più
 * verificatore esterno** — ogni voce di lavoro porta cosa fa, il comando che
 * dice se è fatta, e uno stato fra `not_started / active / blocked / passing`.
 * Il punto è che **cosa conta come «fatto» non lo decide l'agente**
 * (walkinglabs, «Preventing Agents from Declaring Victory Too Early»).
 *
 * ⇒ Le tre forme precedenti (offerte, promesse, resoconti) sono rilevatori di
 * SINTOMI: inseguono il modo in cui il turno si chiude, e ogni volta se ne trova
 * uno nuovo — è successo tre volte in una notte. Questa guarda il FATTO: c'è un
 * compito che risulta ancora aperto sul disco?
 *
 * ⛔ Blocca al massimo UNA volta per turno (`stop_hook_active`), quindi il costo
 * di un blocco di troppo è un altro giro di lavoro. Il costo di una fermata di
 * troppo è l'owner che aspetta una risposta che non doveva servire. È la stessa
 * asimmetria su cui è costruito tutto questo file.
 */
function compitiAperti(sessione) {
    if (typeof sessione !== 'string' || sessione === '') return []
    try {
        const casa = process.env.USERPROFILE || process.env.HOME
        if (!casa) return []
        const cartella = join(casa, '.claude', 'tasks', sessione)
        return readdirSync(cartella)
            .filter((nome) => nome.endsWith('.json'))
            .map((nome) => {
                try { return JSON.parse(readFileSync(join(cartella, nome), 'utf8')) } catch { return null }
            })
            .filter((compito) => compito && compito.status === 'in_progress')
            .map((compito) => `#${compito.id} ${String(compito.subject ?? '').slice(0, 70)}`)
    } catch {
        // Nessuna cartella, nessuno stato: si torna a guardare le parole.
        return []
    }
}

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

/**
 * La dichiarazione, e il motivo che la segue — che ora viene LETTO.
 *
 * ⛔ `g` + ULTIMA occorrenza, non la prima. Scoperto al primo uso vero, il
 * 2026-08-12: avevo scritto un messaggio che **citava** `⛔ FERMATA:` mentre
 * spiegava questo stesso hook, e la citazione stava in cima. L'hook ha letto
 * come «motivo» i 400 caratteri dopo la citazione — cioè l'elenco dei pretesti
 * che stavo descrivendo — e ha bloccato una fermata legittima.
 *
 * Una fermata vera sta **in fondo**: è l'ultima cosa che si scrive prima di
 * chiudere. Una citazione può stare ovunque. Quindi si guarda l'ultima.
 */
const FERMATA_DICHIARATA = /⛔\s*(?:FERMATA|NON VERIFICATO)\s*:/gi

/**
 * ⛔ Si cerca SOLO il marcatore, e il motivo si legge dopo con `slice`.
 *
 * Il primo tentativo catturava anche i 400 caratteri nella stessa espressione,
 * e con `g` non funzionava: la prima occorrenza li **consuma**, quindi una
 * seconda dichiarazione che cade dentro quei 400 caratteri non viene mai
 * trovata — cioè proprio il caso da curare, un messaggio che cita la formula e
 * poi la usa davvero. Un'espressione che avanza `lastIndex` oltre il testo che
 * deve ancora esaminare non può trovare quello che ci sta dentro.
 */
function ultimaDichiarazione(messaggio) {
    FERMATA_DICHIARATA.lastIndex = 0
    let fine = -1
    for (let m = FERMATA_DICHIARATA.exec(messaggio); m; m = FERMATA_DICHIARATA.exec(messaggio)) {
        fine = m.index + m[0].length
    }
    return fine < 0 ? null : [null, messaggio.slice(fine, fine + 400)]
}

/**
 * ⛔⛔ LA DICHIARAZIONE NON BASTA PIÙ: SI GUARDA IL MOTIVO.
 *
 * Owner, 2026-08-12: «bisogna sistemare il fatto che stampi fermata per una cosa
 * su cui puoi procedere da solo tranquillamente, adatta il sistema di hook».
 *
 * ## Il difetto di questo stesso hook
 *
 * `⛔ FERMATA:` era l'**unica** uscita e passava sempre, qualunque cosa
 * seguisse i due punti. L'idea era giusta — costringere a nominare il motivo è
 * il punto in cui ci si accorge che il motivo non c'è — ma vale solo se qualcuno
 * quel nome lo **legge**. Nessuno lo leggeva, quindi scrivere le parole magiche
 * era diventato un lasciapassare a costo zero: la fermata che l'hook doveva
 * impedire usciva dalla porta che l'hook stesso aveva aperto.
 *
 * La fermata che l'ha fatto scoprire, mia, quella sera:
 *
 *   «⛔ FERMATA: la correzione tocca il ciclo di vita di due Activity, cioè non
 *    si tira via in coda a un turno lungo»
 *
 * Non è nessuna delle cinque. È un **rinvio che mi sono autorizzato da solo**,
 * scritto col vocabolario della prudenza: la causa era isolata, l'APK sul Pad
 * aveva già la sonda giusta, e non serviva niente dall'owner.
 *
 * ## Come si distingue una fermata vera da un rinvio
 *
 * Le cinque legittime hanno tutte la stessa forma: **qualcosa fuori da me
 * manca** — una decisione sua, i suoi soldi, un gesto irreversibile, il contesto
 * esaurito, un cancello rosso. Un rinvio ha la forma opposta: *io* preferisco
 * farlo dopo. Per questo i PRETESTI vincono sulle LEGITTIME quando compaiono
 * insieme: la scusa si traveste da prudenza, mai il contrario.
 *
 * ⛔ E chi non nomina nessuna delle cinque viene bloccato lo stesso. Non è
 * severità: è la stessa asimmetria di sempre — un blocco sbagliato costa qualche
 * altro passo di lavoro, una fermata inutile costa all'owner l'attesa di una
 * risposta che non doveva servire.
 */
const PRETESTI = [
    // Le scuse umane, già vietate a parte: qui diventano anche meccaniche.
    /\b(è|e') tardi|ora tarda|a mente fresca|testa lucida|stanc(o|hezza)/i,
    // Il rinvio puro, in tutte le sue forme cortesi.
    /\b(prossim[ao]|altro) (blocco|turno|giro|sessione|passaggio|volta)\b/i,
    /\b(domani|più tardi|piu' tardi|in un secondo momento|con calma)\b/i,
    /\bnon (si (tira|butta) via|a fine|in coda a)\b/i,
    /\bturno (lungo|già lungo|gia' lungo)\b/i,
    /\b(merita|vuole|richiede) (un|una) (blocco|sessione|fase|passaggio) (a parte|dedicat)/i,
    /\bva fatt[oa] (apposta|a parte|con calma)\b/i,
    /\bpreferisc(o|e) (farlo|rifarlo|riprender|affrontar)/i,
    // «È delicato» non è un blocco: è una descrizione del lavoro.
    /\b(troppo )?(delicat|rischios|invasiv|corposo|grosso)[oaie]\b/i,
    /*
     * ⛔⛔ IL CONTESTO CHE FINISCE NON È PIÙ UNA FERMATA — owner 2026-08-12:
     * «l'hook deve farti ripartire quando dici qualcosa riguardo al contesto che
     * sta finendo, perché è un non issue dato che il contesto si compatta
     * automaticamente e manualmente».
     *
     * Era la quarta delle cinque, e nasceva da un assetto in cui esaurire il
     * contesto significava troncare a metà frase. Non è più vero: la
     * compattazione avviene da sé, il lavoro riprende dall'altra parte, e
     * l'handoff che scrivevo «invece di fermarmi» era comunque una fermata —
     * anzi la più comoda di tutte, perché sembrava diligenza.
     *
     * ⇒ Restano QUATTRO fermate legittime. Se il contesto si sta esaurendo si
     * continua a lavorare: il riassunto lo fa il sistema, non io smettendo.
     */
    /\bcontesto (sta|è|e') (finendo|quasi|agli sgoccioli|esaurit)/i,
    /\bcontesto (quasi )?(finito|esaurito|pieno)\b/i,
    /\b(scrivo|faccio) l.handoff\b/i,
    /\bpassaggio di consegne\b/i,
]

/** Le cinque, riconosciute da ciò che manca FUORI da me. */
const LEGITTIME = [
    // 1 — una decisione che è sua.
    /\b(decid(e|ere|i)|scelta|scegli|il tuo via|solo tu|tocca a te|veto|autorizz|quale prefer|dimmi quale)\b/i,
    // 2 — costa soldi suoi.
    /\b(cost[ai]|a pagamento|soldi|credit|spesa|traffico|abbonament)\b/i,
    // 3 — distruttivo o esce fuori.
    /\b(push|pubblic|cancell|elimin|distrutt|irreversibil|manda(re)? (a|un messaggio)|invia(re)? a|persona vera|chiave)\b/i,
    // ⛔ La quarta NON C'È PIÙ: il contesto che finisce è passato fra i pretesti,
    // per decisione dell'owner del 2026-08-12. La compattazione è automatica.
    // 4 — un cancello rosso che non si può aprire onestamente.
    /\b(rosso|non passa|fallisc|smentis|non riproduc|non ho (il|accesso)|serve (la tua|il tuo|un tuo))\b/i,
]

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

    /*
     * Una fermata dichiarata passa **solo se il motivo regge**. Vedi `PRETESTI`:
     * fino al 12/8 qui bastava la formula, e la formula era diventata gratis.
     */
    const dichiarata = ultimaDichiarazione(messaggio)
    if (dichiarata) {
        const motivo = dichiarata[1] ?? ''
        // ⛔ Il pretesto vince: quando compare insieme a una parola legittima è
        // perché si sta travestendo da prudenza, che è il modo in cui i rinvii
        // si scrivono sempre.
        if (PRETESTI.some((forma) => forma.test(motivo))) {
            return { decision: 'block', reason: RAGIONE_PRETESTO }
        }
        if (LEGITTIME.some((forma) => forma.test(motivo))) return null
        return { decision: 'block', reason: RAGIONE_SENZA_NOME }
    }

    // Si guarda la CODA, non tutto il testo: citare una domanda a metà di un
    // messaggio lungo è normale, chiuderci sopra il turno no.
    const coda = messaggio.slice(-600)
    const offre = OFFERTE.some((forma) => forma.test(coda))
    const archivia = RESOCONTI_CHE_SI_FERMANO.some((forma) => forma.test(coda))
    const promette = PROMESSE.some((forma) => forma.test(coda))
    // ⛔ Lo STATO prima delle parole: se qualcosa risulta ancora aperto sul
    // disco, il turno non si chiude — qualunque cosa il messaggio dica.
    const aperti = compitiAperti(input?.session_id)
    if (!offre && !promette && !archivia && aperti.length === 0) return null
    if (aperti.length > 0 && !offre && !promette && !archivia) {
        return { decision: 'block', reason: RAGIONE_STATO(aperti) }
    }

    return {
        decision: 'block',
        reason: archivia && !offre && !promette ? RAGIONE_RESOCONTO
            : (promette && !offre ? RAGIONE_PROMESSA : RAGIONE),
    }
}

const CINQUE = [
    'Le uniche QUATTRO sono: (1) serve una DECISIONE che solo l\'owner può',
    'prendere; (2) COSTA SOLDI suoi; (3) è DISTRUTTIVO o esce fuori (push,',
    'pubblicazione, un messaggio a una persona vera, la sua chiave); (4) un',
    'CANCELLO è ROSSO e non lo si può aprire onestamente.',
    '',
    '⛔ «Il contesto sta finendo» NON è più una di queste (owner 2026-08-12): la',
    'compattazione è automatica, quindi è un non-problema. Se il contesto si',
    'sta esaurendo si CONTINUA A LAVORARE — il riassunto lo fa il sistema.',
].join(' ')

const RAGIONE_PRETESTO = [
    'Hai dichiarato una fermata, ma il motivo che hai scritto è un RINVIO che ti',
    'sei autorizzato da solo — «è tardi», «turno lungo», «prossimo blocco»,',
    '«troppo delicato», «merita una sessione a parte». Nessuna di queste è una',
    'delle cinque: hanno tutte la forma «io preferisco farlo dopo», mentre una',
    'fermata vera ha la forma «manca qualcosa fuori da me».',
    '',
    CINQUE,
    '',
    'Se la causa è isolata e gli strumenti ci sono, il lavoro va fatto ADESSO.',
    'Che sia grosso o delicato è una descrizione del lavoro, non un permesso di',
    'non farlo.',
].join(' ')

const RAGIONE_SENZA_NOME = [
    'Hai dichiarato una fermata senza dire QUALE delle cinque. La regola chiede',
    'di nominarla, e non per burocrazia: nominarla è il punto in cui ci si',
    'accorge che il motivo non c\'è.',
    '',
    CINQUE,
    '',
    'Se una di queste è davvero il tuo caso, riscrivi la fermata dicendolo con',
    'le sue parole. Se nessuna lo è, continua a lavorare.',
].join(' ')

function RAGIONE_STATO(aperti) {
    return [
        'Non hai finito: sul disco risultano ancora APERTI questi compiti —',
        aperti.slice(0, 4).join(' | ')
            + (aperti.length > 4 ? ` (e altri ${aperti.length - 4})` : '') + '.',
        '',
        'La ricerca sul false-finish dice che qui sbagli in modo sistematico:',
        'sopravvaluti il completamento e sottovaluti la verifica che resta. Per',
        'questo la decisione «ho finito» non è tua — è dello stato.',
        '',
        'Riprendi dal primo di quelli, con delle chiamate. Se uno è davvero',
        'chiuso, aggiorna il suo stato invece di lasciarlo aperto e raccontarlo.',
    ].join(' ')
}

const RAGIONE_RESOCONTO = [
    'Ti sei fermato per la TERZA forma: un RESOCONTO che si ferma. Non hai',
    'chiesto permesso e non hai promesso niente — hai raccontato un difetto',
    'appena trovato e hai chiuso il turno, con parole come «annotato», «resta',
    'aperto», «la prossima misura».',
    '',
    'Un difetto trovato DENTRO una fase non chiude la fase: si registra e si',
    'continua. Se sai già quale sia il passo dopo — e quelle frasi dimostrano che',
    'lo sai — quel passo va fatto ORA, con delle chiamate.',
].join(' ')

const RAGIONE_PROMESSA = [
    'Ti sei fermato di nuovo: il tuo ultimo messaggio finisce con una PROMESSA',
    'su un lavoro che non hai fatto — «vado su quelli», «adesso faccio», «restano',
    'da fare». Una promessa non è un proseguimento: è la stessa fermata scritta',
    'al futuro, e per chi legge è peggio, perché sembra che tu stia continuando.',
    '',
    'Fai ORA quel lavoro, con delle chiamate, invece di annunciarlo. Se una parte',
    'è davvero bloccata, fai tutto il resto e poi dichiara la fermata scrivendo',
    '«⛔ FERMATA: <motivo>».',
].join(' ')

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
