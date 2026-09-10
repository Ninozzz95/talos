/**
 * ⭐⭐⭐ GLI ATTACCHI — come si dà un task a un harness vero.
 *
 * `corriUnTask` chiede una funzione `lavora({cartella, task})`: riceve una
 * copia usa-e-getta del progetto, ci lavora dentro, e torna **ciò che ha detto
 * a parole**. Quel testo non è decorativo: è l'unica cosa che permette di
 * giudicare i task impossibili, dove la risposta giusta è «non si può».
 *
 * Qui vive un attacco per ognuno degli harness installati su questa macchina.
 * Il banco non li conosce: conosce solo la forma.
 *
 * ## ⛔⛔ IL PROMPT È NUDO, E DEVE RESTARLO
 *
 * La tentazione è aggiungere «⛔ non modificare i file di test». Sarebbe un
 * banco truccato: la manomissione è **esattamente la cosa che questo banco
 * esiste per misurare** — l'esito `manomesso` di `corsaDiCoding.mjs`. Chi
 * avverte l'agente non misura più se l'agente è onesto: misura se sa leggere.
 *
 * ⇒ Al modello arriva la consegna e nient'altro, come la direbbe una persona.
 *
 * ## ⛔ E l'italiano resta italiano
 *
 * Le consegne del corpus sono in italiano. Tradurle per gli harness anglofoni
 * sembrerebbe un favore, e invece cambierebbe il compito: `verdetto()` accetta
 * già il «non esiste» in tutte e due le lingue, apposta. Tutti ricevono la
 * stessa identica stringa, o il confronto non è un confronto.
 *
 * ## Perché si può bypassare le autorizzazioni senza pensarci troppo
 *
 * Perché la cartella è una copia in `tmpdir()` creata da `preparaCopia()` e
 * buttata alla fine: l'harness non può toccare niente di vero. È il caso d'uso
 * per cui quei flag esistono — «recommended only for sandboxes».
 */
import { pathToFileURL } from 'node:url'
import { execFile, spawnSync } from 'node:child_process'
import { existsSync, readdirSync, mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ammazzaLAlbero, scriptDelPacchetto } from './corsa.mjs'
import { buttaLaCopia } from './corsaDiCoding.mjs'

/** Quanto si concede a un harness per un task, prima di considerarlo piantato. */
export const SCADENZA_HARNESS_MS = 600_000

/**
 * ⭐⭐⭐ UN MODELLO SOLO, PER TUTTI — e scioglie il difetto più grave del banco.
 *
 * ## Perché, e non è per risparmiare
 *
 * La checklist ABC (arXiv 2507.02825) chiama «confounded scaffold-model
 * effects» il difetto per cui non si sa se un risultato viene dall'harness o
 * dal modello sotto, e lo cita come limite di SWE-bench. Era il nostro difetto
 * più grave: hermes faceva lo stesso lavoro di claude in **276 s contro 390**,
 * ma girava su Sonnet 5 mentre claude girava su Opus.
 *
 * ⇒ Quanto di quel −29% era l'harness? **Non si poteva sapere**, e quella
 * differenza non era pubblicabile.
 *
 * Con lo stesso modello sotto tutti, ciò che resta è **dell'harness**.
 *
 * ## E costa DIECI volte meno — misurato, non stimato
 *
 * Stesso task (`sconto-a-scaglioni`), stesso harness, sola variabile il modello:
 *
 *     Opus ....... $0,351   37 s    8 giri
 *     Haiku 4.5 .. $0,0358  19 s    4 giri
 *     ⇒ rapporto  9,8×      il doppio più veloce, metà dei giri
 *
 * ⛔ La stima da listino diceva **15×** ed era ottimistica del 50%. È il motivo
 * per cui la prima corsa dopo ogni cambio di modello è una CALIBRAZIONE su un
 * task solo: un numero stimato lasciato in un commento diventa un dato falso
 * che qualcuno citerà.
 *
 * ⇒ Costo atteso di una corsa completa: ~$0,25 per harness (7 task), **~$1 per
 * quattro harness**, ~$3 con tre ripetizioni.
 *
 * ⭐ E c'è un dato che non cercavo: Haiku fa **metà dei giri** (4 contro 8) sullo
 * stesso task riuscito. Meno giri non è solo più veloce — è un ciclo
 * osserva-decidi-agisci diverso, e va guardato quando si progetta il nostro.
 *
 * ⛔ Cosa questo NON dice: che Haiku sia il modello giusto per lavorare. Dice
 * che è il modello giusto per **confrontare gli harness fra loro**, che è la
 * domanda di questo banco. Un giorno servirà anche la corsa sul modello di
 * punta, per sapere quanto in alto arriva ciascuno — ma è un'altra domanda.
 */
/**
 * ⛔⛔⛔ LE TRE QUOTE SI ALTERNANO PER CORSA, NON PER HARNESS.
 *
 * Owner, 2026-08-17: «dividi le varie key in modo equo e usando modelli che
 * hanno il miglior rapporto prestazioni e prezzo».
 *
 * La divisione va fatta — le quote sono tre (Anthropic, DeepSeek, OpenRouter) e
 * bruciarne una sola è già successo. Ma **non si può dividere per harness**:
 * dare Haiku a claude e DeepSeek a hermes rimetterebbe esattamente il difetto
 * che abbiamo appena curato — «confounded scaffold-model effects» — e il
 * confronto tornerebbe impubblicabile.
 *
 * ⇒ Si divide per CORSA. Dentro una corsa il modello è uno per tutti; fra una
 * corsa e l'altra cambia il provider:
 *
 *     node corsaCoding.mjs claude,hermes,aider,pi 5        → anthropic
 *     BANCO_PROVIDER=deepseek   node corsaCoding.mjs …     → deepseek
 *     BANCO_PROVIDER=openrouter node corsaCoding.mjs …     → openrouter
 *
 * ⭐ E si ottiene gratis l'esperimento che mancava: **stesso scaffold, tre
 * modelli** dice quanto del risultato è dell'harness e quanto del motore.
 */
/*
 * ⛔⛔⛔ `BANCO_MODELLO` IMPLICA LA QUOTA — e senza questa riga la provenienza
 * MENTE.
 *
 * ## Misurato il 2026-08-21, con due chiamate e nessuna spesa
 *
 * ```
 * BANCO_MODELLO=z-ai/glm-4.7-flash   (e BANCO_PROVIDER non impostato)
 *
 *   provenienza dichiara quota           : openrouter
 *   il lancio passa davvero da OpenRouter: false        ⛔
 * ```
 *
 * `MODELLO_DEL_BANCO.quota` diventa `'openrouter'` appena c'e' uno
 * scavalcamento, ma `VERSO_OPENROUTER` si costruisce su `PROVIDER` — che
 * restava `anthropic`. ⇒ Ogni riga della campagna avrebbe portato scritto
 * `quota: openrouter` mentre claude-code parlava con **Anthropic**, con la
 * chiave della persona e a carico del suo credito.
 *
 * Due danni, e il secondo non si vede nei numeri:
 *   1. la PROVENIENZA e' il campo che dice con che cervello e' nata una riga:
 *      se mente, mente su ogni riga e non c'e' modo di accorgersene dopo;
 *   2. ⛔ la spesa finisce sul conto sbagliato **in silenzio**.
 *
 * ⇒ `BANCO_MODELLO` nomina un modello di OpenRouter — `SCELTO.litellm` diventa
 * `openrouter/<nome>` sei righe piu' sotto. Non e' una scelta separata: e' la
 * stessa scelta. Chi vuole davvero un'altra quota lo dice esplicitamente con
 * `BANCO_PROVIDER`, e allora vince lui.
 *
 * ⛔ Si guarda la stringa VUOTA, non solo `undefined`: `BANCO_PROVIDER=` in uno
 * script e' «non impostato» per chi lo scrive, e `??` lo lascerebbe passare
 * come una scelta. E' lo stesso inciampo di `NODE_TEST_CONTEXT=`.
 */
const PROVIDER = String(
    String(process.env.BANCO_PROVIDER ?? '').trim()
    || (String(process.env.BANCO_MODELLO ?? '').trim() ? 'openrouter' : 'anthropic'),
).toLowerCase()

/**
 * I modelli scelti per rapporto prestazioni/prezzo, uno per quota.
 *
 * ⛔ «Miglior rapporto» è una frase, e qui serve un numero. Finché non c'è una
 * corsa che li confronta, questi sono **scelti dal listino e dalla fascia
 * dichiarata**, non misurati — e ognuno va verificato con una calibrazione su
 * un task, come è stato fatto per Haiku (dove la stima da listino sbagliava
 * del 50%: 15× invece di 9,8×).
 */
const CATALOGO = Object.freeze({
    anthropic: {
        // Misurato: $0,0358/task, 19 s, 4 giri — contro Opus $0,351, 37 s, 8 giri.
        nome: 'claude-haiku-4-5-20251001',
        litellm: 'anthropic/claude-haiku-4-5-20251001',
        provider: 'anthropic',
    },
    deepseek: {
        // ⛔ Da calibrare: fascia «flash», quota separata da Anthropic.
        nome: 'deepseek-v4-flash',
        litellm: 'deepseek/deepseek-v4-flash',
        provider: 'deepseek',
    },
    openrouter: {
        /*
         * ⭐⭐⭐ CALIBRATO il 2026-08-20 su un TASK VERO del corpus, non sul
         * listino - e le due cose danno risposte diverse di 41 volte.
         *
         * ⛔⛔ Regola dell'owner: «modelli flash piu economici, non troppo -
         * MAI MODELLI DI PUNTA». Le due meta contano entrambe, e la prova su
         * `sconto-a-scaglioni` (progetto vero, `npm test` come giudice) le
         * separa meglio di qualunque prezzo per milione:
         *
         *   qwen/qwen3.7-flash    scrive SI  test VERDI   3 giri   15 s
         *   z-ai/glm-4.7-flash    scrive SI  test rossi   3 giri   39 s
         *   openai/gpt-5-nano     scrive NO  -            1 giro   24 s
         *   google/gemini-2.5-flash  risolve, ma 134 s e $0,135/task
         *   deepseek/v4-flash     scrive NO, risposta VUOTA, $0
         *
         * ⛔ DeepSeek non e escluso perche sia debole: e un difetto NOTO del
         * ponte. `claude-code#68995` e `openclaw#82150` documentano che via
         * OpenRouter la catena si rompe al primo tool call, perche il
         * `reasoning_content` non torna indietro. ⇒ Ci azzopperebbe un
         * harness solo, e allora il banco misurerebbe IL PONTE.
         *
         * ⛔ E gemini-2.5-flash, che stava qui prima, e fra i PIU CARI della
         * fascia: $0,300/$2,500 per milione contro $0,030/$0,130. Il costo lo
         * fa l'INGRESSO - claude-code manda 42.272 token di sistema a ogni
         * giro, e su OpenRouter non c'e lo sconto di cache.
         */
        nome: 'qwen/qwen3.7-flash',
        litellm: 'openrouter/qwen/qwen3.7-flash',
        provider: 'openrouter',
    },
})

/**
 * ⭐⭐ IL MODELLO SI PUO' SCAVALCARE PER UNA CORSA SOLA — e serve a CALIBRARE.
 *
 *     BANCO_MODELLO=openai/gpt-oss-20b  node corsaCoding.mjs talos 1
 *
 * ⛔ Non e una scorciatoia per «provare un modello piu bravo»: la dottrina del
 * banco dice che il modello si sceglie **su un task vero**, non sul listino —
 * il 2026-08-20 le due cose hanno dato risposte diverse di 41 volte. Senza
 * questa leva la calibrazione andrebbe fatta modificando il catalogo, cioe
 * cambiando il banco per misurarlo.
 *
 * ⛔ E la scelta finisce nella PROVENIENZA di ogni riga, quindi una corsa
 * calibrata non puo essere confusa con una corsa vera: il nome del modello e
 * scritto accanto a ogni numero.
 */
const SCAVALCA = String(process.env.BANCO_MODELLO ?? '').trim()

/*
 * ⛔⛔ E LA QUOTA SI LEGGE DA `PROVIDER`, sempre — non si riscrive qui.
 *
 * Prima era `provider: 'openrouter'` e `quota: SCAVALCA ? 'openrouter' : …`,
 * cioe' la stessa risposta scritta in tre posti. Misurato lo stesso giorno:
 * `BANCO_PROVIDER=deepseek BANCO_MODELLO=x` dichiarava **`openrouter`**, e
 * `litellm` diceva `openrouter/x` su una corsa che l'utente aveva chiesto
 * altrove. ⇒ La bugia della provenienza aveva due versi, e la cura per uno solo
 * lasciava intatto l'altro.
 *
 * `PROVIDER` sa gia' tutto: e' `BANCO_PROVIDER` se c'e', altrimenti
 * `openrouter` quando un modello e' stato scavalcato, altrimenti `anthropic`.
 */
const SCELTO = SCAVALCA
    ? { nome: SCAVALCA, litellm: `${PROVIDER}/${SCAVALCA}`, provider: PROVIDER }
    : (CATALOGO[PROVIDER] ?? CATALOGO.anthropic)

export const MODELLO_DEL_BANCO = Object.freeze({
    /** Quale quota sta pagando questa corsa. ⛔ Una sola fonte: `PROVIDER`. */
    quota: PROVIDER,
    /** Il nome del modello per chi vuole `--provider X --model Y`. */
    anthropic: SCELTO.nome,
    /** Il nome per LiteLLM, che aider usa sotto. */
    litellm: SCELTO.litellm,
    /** Il provider da nominare sulla riga di comando. */
    provider: SCELTO.provider,
    /** Per le corse su DeepSeek, che ha una quota a parte. */
    deepseek: CATALOGO.deepseek.nome,
})

/**
 * ⭐⭐⭐ LA PROVENIENZA — con che cervello è nata questa riga, e quando.
 *
 * ## Perché è una funzione e non due campi copiati
 *
 * Il 2026-08-20 ho letto le righe delle due corse e ho scoperto che **non sono
 * le stesse**. `corsaCoding.mjs` scrive `modello` e `quota`; `corsaAblazioni.mjs`
 * — nata tre ore prima — non li scrive, e nessuno se n'era accorto perché i
 * numeri uscivano lo stesso.
 *
 * ⛔ La conseguenza non è estetica. `M01` — **6/10 → 10/10 di onestà a costo
 * zero**, il risultato migliore che abbiamo — viene da quei file, e in nessuna
 * delle 270 righe c'è scritto quale modello l'ha prodotto. `REGOLE.md` pretende
 * «la versione del competitor e il **modello** usato — senza, la voce invecchia
 * in silenzio e diventa falsa», e `D10` dice che il banco è pubblicabile dal
 * primo giorno. ⇒ Oggi quel numero **non passa la nostra stessa regola**.
 *
 * E l'aperto che l'`INDICE` chiamava «il più grave» — *claude su Opus, hermes su
 * Sonnet 5* — non è nemmeno verificabile: è un **ricordo**, non una misura.
 *
 * ## ⛔ La lezione che questa funzione porta con sé
 *
 * `corsaCoding.mjs` la sapeva già e la scriveva a mano:
 *
 * > «IL MODELLO SI SCRIVE QUI, non si deduce dopo. Il rapporto lo leggeva dalla
 * > configurazione di CHI LO GENERA: generarlo con `BANCO_PROVIDER=openrouter`
 * > su dati Anthropic scriveva il modello sbagliato accanto a numeri giusti.»
 *
 * Una lezione scritta in un file solo vale per quel file. Qui vale per chiunque
 * scriva una riga di esito — ed è il motivo per cui questa è una funzione
 * esportata invece di due righe da ricordarsi.
 *
 * ## `quando`, che non c'era in nessuna delle due
 *
 * Senza l'ora, due corse dello stesso harness non si distinguono, e «i numeri di
 * baseline oscilleranno» (`M01`, nota 2) diventa impossibile da verificare: non
 * si sa quale corsa è quale. ISO 8601 in UTC, perché un banco pubblicabile non
 * può portare il fuso di chi l'ha lanciato.
 *
 * ⛔ Quello che questa funzione **non** fa: inventare il costo e i giri. Quelli
 * li dichiara l'harness, e su quattro dei sei non arrivano — vedi
 * `quantoECostato` in `corsaCoding.mjs`. Un buco dichiarato è informazione; uno
 * zero inventato è una bugia con un numero davanti.
 */
export function provenienzaDelBanco(quando = new Date()) {
    return {
        modello: MODELLO_DEL_BANCO.anthropic,
        quota: MODELLO_DEL_BANCO.quota,
        quando: quando.toISOString(),
    }
}

/** I campi che `provenienzaDelBanco` promette. Chi controlla legge di qui. */
export const CAMPI_DI_PROVENIENZA = Object.freeze(['modello', 'quota', 'quando'])

/**
 * ⛔⛔⛔ LE CHIAVI STANNO IN WINDOWS, NON IN `process.env`.
 *
 * Il 2026-08-17 stavo per scrivere nel rapporto che su questa macchina «non
 * c'è nessuna chiave API», e quindi che pi, aider, hermes e dsh non potevano
 * correre. `process.env` era davvero vuoto. Ma le chiavi ci sono, e sono
 * **quattro**: questo processo non le eredita — è stato avviato prima, o la
 * shell non le passa — mentre Windows le tiene nelle variabili utente.
 *
 * ⇒ Un harness escluso per questo motivo sarebbe stato escluso da un difetto
 * mio, e il confronto sarebbe uscito a due invece che a sei. È la stessa
 * lezione di sempre: si chiede alla macchina, non alla tabella che si ha in
 * mano — e `process.env` qui era la tabella.
 *
 * ⛔ I VALORI NON SI STAMPANO MAI. Si leggono, si passano ai figli, e basta.
 */
/*
 * ⭐⭐⭐ LA CUSTODIA PRIMA DELL'AMBIENTE — 10/09/2026, e non è un dettaglio di configurazione.
 *
 * ⛔ IL FATTO, misurato: la chiave `OPENROUTER_API_KEY` nelle variabili d'ambiente di Windows è
 *   **revocata** (impronta 8dba33c2… → «HTTP 401, User not found»), mentre quella nel portachiavi
 *   di sistema — la «custodia», la stessa che usa il 4174 — **funziona** (impronta 6b84730f… → 200).
 *   Sono due chiavi DIVERSE, e il banco leggeva solo la prima.
 *
 * ⛔ IL DANNO, che è peggiore di «non parte»: il banco ha girato lo stesso e ha scritto **21 giri
 *   su 7 task come `fallito`** — con `costoUsd: null` e `HTTP 401 dopo 4 tentativi` nel campo
 *   dell'errore. Un fallimento dell'AMBIENTE registrato come fallimento del MODELLO. È la stessa
 *   forma esatta di «IL 429 NON È UN FALLIMENTO» (20/08): 48 righe su 66 di codex erano limiti di
 *   traffico, e la campagna intera andò buttata.
 *
 * ⛔ Perché la custodia va letta QUI dentro e non passata da fuori: una chiave che viaggia in una
 *   variabile d'ambiente o su una riga di comando finisce nei log di chiunque stia in mezzo —
 *   lezione già pagata («il segreto passa da adbd, e adbd logga»). Qui resta in memoria del
 *   processo che la usa.
 *
 * ⛔ E se il portachiavi non c'è (Linux senza servizio, pacchetto assente) si torna all'ambiente,
 *   come prima: nessuna corsa si ferma per questo.
 */
/* ⛔ Il nome NON si indovina: è `KEYRING_SERVICE` in `harness-ui/src/provider-credential-store.mjs`
   (riga 27). L'avevo tirato a indovinare come `talos.harness-ui.providers` e la lettura tornava
   vuota in silenzio — il banco ripiegava sull'ambiente e riprendeva 401 senza dire perché. */
const SERVIZIO_CUSTODIA = 'talos-harness-provider'

/*
 * ⛔ `@napi-rs/keyring` non è installato QUI: vive in `harness-ui/node_modules`, perché è una
 *   dipendenza del prodotto, non del banco. Un `import` nudo fallisce con «Cannot find package»
 *   e la lettura torna vuota **in silenzio** — il banco ripiega sull'ambiente e riprende 401
 *   senza dire perché. Si risolve dal posto dove vive, e se non c'è si dichiara.
 */
const DOVE_VIVE_IL_PORTACHIAVI = process.env.TALOS_PORTACHIAVI
    ?? 'C:/Users/Antonino/Desktop/projects/AVM-harness-desktop/harness-ui/node_modules/@napi-rs/keyring/index.js'

const CHIAVE_DALLA_CUSTODIA = await (async () => {
    try {
        const { pathToFileURL } = await import('node:url')
        const { Entry } = await import(pathToFileURL(DOVE_VIVE_IL_PORTACHIAVI).href)
        const valore = new Entry(SERVIZIO_CUSTODIA, 'openrouter').getPassword()
        return typeof valore === 'string' && valore.trim() ? valore : null
    } catch (errore) {
        // Si dichiara e si continua: senza custodia vale l'ambiente, come prima del 10/09.
        console.error('[banco] custodia non leggibile, uso quella ambientale:', errore?.message ?? errore)
        return null
    }
})()

const CHIAVI_DI_WINDOWS = (() => {
    if (process.platform !== 'win32') return {}
    try {
        const uscita = spawnSync('powershell.exe', [
            '-NoProfile', '-NonInteractive', '-Command',
            '[Environment]::GetEnvironmentVariables("User") | ConvertTo-Json -Compress',
        ], { encoding: 'utf8', timeout: 30_000, windowsHide: true })
        const tutte = JSON.parse(String(uscita.stdout || '{}'))
        const serve = /API_KEY$|_TOKEN$/
        const prese = {}
        for (const [k, v] of Object.entries(tutte)) {
            // ⛔ Non si sovrascrive ciò che il processo ha già: se qualcuno ha
            // impostato una chiave apposta per questa corsa, vince la sua.
            if (serve.test(k) && typeof v === 'string' && v && !process.env[k]) prese[k] = v
        }
        return prese
    } catch {
        return {}
    }
})()

/** Quali chiavi sono state recuperate — **solo i nomi**, mai i valori. */
export function chiaviRecuperate() {
    return Object.keys(CHIAVI_DI_WINDOWS).sort()
}

/**
 * Come si riconosce un harness che NON HA MAI CORSO per via delle credenziali.
 *
 * ⛔ Le forme sono quelle viste sul campo, non inventate: `codex` risponde
 * «401 Unauthorized … Your session has ended», gli altri usano il gergo dei
 * loro SDK. Un elenco scritto a mano invecchia — quando ne compare una nuova
 * si aggiunge QUI, con la corsa che l'ha prodotta.
 */
export const CREDENZIALI_ESAURITE = new RegExp([
    // ── non ha le chiavi, o non valgono più
    '401 unauthorized',
    'session has ended',
    'invalid[_ ]?api[_ ]?key',
    'authentication[_ ]?error',
    'please (log ?in|sign in) again',
    'credentials[_ ]not[_ ]configured',
    /*
     * ── ⛔⛔ E IL CREDITO FINITO, che è la stessa cosa vista da un'altra parte.
     *
     * Misurato il 2026-08-17, dopo cinque corse in un pomeriggio:
     *
     *     «Billing or credits exhausted: HTTP 400: Your credit balance is too
     *      low to access the Anthropic API … your Claude subscription usage is
     *      exhausted for claude-sonnet-5»
     *
     * Tutti e quattro gli harness sono crollati a 2-3 secondi per task, e il
     * banco ha scritto `fallito` per tutti — **una tabella intera di dati
     * falsi**, con `claude 2/5` che sembrava un tracollo e invece era la quota
     * finita a metà corsa (due task veri a 35 s, poi 3 s a vuoto).
     *
     * ⛔ La firma che l'ha smascherato è la stessa di sempre: tempi troppo
     * regolari e troppo bassi per il compito. È la riga che avevo scritto nel
     * registro delle debolezze poche ore prima, e ha funzionato.
     */
    'credit balance is too low',
    'credits? exhausted',
    'usage is exhausted',
    'quota exceeded',
    'insufficient[_ ]?(quota|credit|balance)',
    /*
     * ⛔⛔⛔ QUI C'ERA `'billing'` NUDO, e ha buttato pi fuori dal banco DUE
     * VOLTE IN UN GIORNO — 2026-08-22.
     *
     * La seconda volta pi stava facendo **5 task su 5 RIUSCITI**, meglio di
     * chiunque altro su quel corpus, ed e' stato dichiarato «CREDENZIALI
     * ESAURITE» mentre le sue chiavi erano `ready` su tutti e quattro i
     * provider — verificato interrogandolo mentre succedeva.
     *
     * La parola da sola scatta su qualunque cosa la contenga. Provato:
     *
     *     "See https://openrouter.ai/settings/billing for details"   scatta
     *     "You can check your usage in the billing dashboard."       scatta
     *     "Created src/billing.mjs with the invoice logic"           scatta
     *     "implementa il calcolo billing per riga"                   scatta
     *
     * ⇒ L'ultimo e' il peggiore: un harness che **svolge il task** creando un
     * file di fatturazione si auto-squalifica. E il nostro corpus e' fatto di
     * gestionali — sconti, scorte, listini: `billing` ci vive dentro.
     *
     * ⛔ E' la stessa famiglia del cancello sulla privacy che bloccava su
     * `...@gmail.com` prendendo le fixture, e del cancello semantico che
     * rifiutava sei scritture sane su sei: **si cerca la cosa, non la forma
     * della cosa**. Una parola dentro un URL di documentazione non e' un
     * errore di fatturazione.
     *
     * ⛔⛔ E costa a un CONCORRENTE, non a noi: un avversario buttato fuori e'
     * un banco truccato a nostro favore, esattamente come aider azzoppato.
     */
    'billing (error|issue|problem|failure)',
    'check your billing',
    'billing (details|information) (are|is) (required|invalid|missing)',
].join('|'), 'i')

/**
 * ⭐⭐⭐ IL LIMITE DI TRAFFICO — che NON e «credenziali esaurite», e confonderli
 * costa una campagna intera.
 *
 * ## ⛔⛔ Cosa e successo davvero, e non lo sapevamo
 *
 * Misurato il 2026-08-21 rileggendo la campagna del 20/8, `qwen/qwen3.7-flash`:
 *
 *     codex   48 righe su 66   «exceeded retry limit, last status: 429»
 *     talos   18 righe su 66   «HTTP 429 … temporarily rate-limited upstream»
 *
 * ⇒ Tutte segnate `fallito`. Il `codex 1/11` che avevamo in classifica non era
 * codex: era un limite di traffico. E **tutti e diciotto** i fallimenti di
 * talos erano 429 — nemmeno uno era uno sbaglio.
 *
 * La causa sta a monte: `qwen/qwen3.7-flash` ha **un solo fornitore** (Alibaba)
 * e la quota e un pool CONDIVISO (`limit_source: upstream_provider_shared_pool`).
 * OpenRouter ricade su un altro fornitore da solo — ma solo se ce n'e uno.
 *
 * ## ⛔ Perche una regex separata, e non due righe in piu nell'altra
 *
 * `rate[_ ]?limit` **stava gia** dentro `CREDENZIALI_ESAURITE`, e non e bastato:
 * codex scrive «exceeded **retry** limit», che non la fa scattare. Ma il punto
 * non e la parola mancante: sono due EVENTI DIVERSI con due cure diverse.
 *
 *     credenziali esaurite  →  rifai il login / ricarica  →  la corsa e persa
 *     limite di traffico    →  aspetta, o cambia modello  →  la riga si RIFA
 *
 * Chiamare «credenziali esaurite» un 429 manda a rifare un login che sta
 * benissimo, e lascia in piedi la vera causa.
 *
 * ⇒ E soprattutto: un 429 **non e un esito**. Non e ne un successo ne un
 * fallimento: e una riga che non e mai stata misurata — `IGNOTO`, non zero.
 */
export const LIMITE_DI_TRAFFICO = new RegExp([
    '\\b429\\b',
    'too many requests',
    'rate[- _]?limit(ed|ing)?',
    'temporarily rate',
    'upstream_provider_shared_pool',
    'overloaded',
    'server[_ ]?(is[_ ]?)?busy',
    'try again (later|shortly)',
    'retry (shortly|later)',
].join('|'), 'i')

/**
 * ⛔ La stessa domanda, per chi NON passa da `lancia()`.
 *
 * `talos` e un adattatore in-processo: non genera un figlio, quindi non ha ne
 * `fuori` ne `errori` e la bandiera non gli veniva **mai calcolata**. Sono i
 * suoi diciotto 429 finiti in classifica come fallimenti nostri.
 *
 * ⇒ Il riconoscimento non puo vivere dentro il lanciatore: vive qui, e lo
 * chiama chiunque abbia del testo da guardare — l'uscita di un processo o il
 * messaggio di un'eccezione, non fa differenza.
 */
export function eUnLimiteDiTraffico(testo) {
    return LIMITE_DI_TRAFFICO.test(String(testo ?? ''))
}

/**
 * Lancia un comando e raccoglie tutto, senza mai far esplodere il banco.
 *
 * ⛔ Un'uscita non-zero NON è un errore da propagare: molti harness escono
 * male quando si arrendono, e «si è arreso» è un esito che il giudice deve
 * poter pesare. Qui si torna sempre, e si dice cosa è successo.
 */
/**
 * ⛔ Dove instradare il traffico dei figli, quando c'è un proxy di mezzo.
 *
 * Variabile di modulo e non `process.env` perché `lancia()` la legge nel
 * momento esatto in cui costruisce l'ambiente del figlio, e fra le due cose
 * non c'è nessun `await`. Vedi `conHeadroom`, che spiega perché la prima
 * versione — che toccava `process.env` attorno alla chiamata — era rotta.
 */
let INSTRADA_VERSO = null

/** Instrada i prossimi lanci verso `url`, o `null` per tornare diretti. */
export function instradaVerso(url) { INSTRADA_VERSO = url }

/**
 * ⭐⭐⭐ LA QUOTA DI OPENROUTER, per gli harness che parlano Anthropic.
 *
 * OpenRouter espone l'endpoint nativo del protocollo Anthropic Messages (la
 * loro «Anthropic Skin»), quindi Claude Code ci parla DIRETTAMENTE, senza un
 * proxy locale. Servono tre variabili, e la terza e la meno ovvia:
 *
 *   ANTHROPIC_BASE_URL     dove mandare
 *   ANTHROPIC_AUTH_TOKEN   la chiave di OpenRouter
 *   ANTHROPIC_API_KEY=''   ⛔ SVUOTATA, o vince lei
 *
 * ⛔⛔ La terza e quella che ci ha fermati il 2026-08-20: una
 * `ANTHROPIC_API_KEY` a credito zero prendeva la precedenza sul login e ogni
 * task tornava «Credit balance is too low» in 5 secondi identici. Il CLI lo
 * dice da se: «ANTHROPIC_API_KEY or another auth source is set and takes
 * precedence over your claude.ai login».
 *
 * ⛔ Vale solo con `BANCO_PROVIDER=openrouter`. Impostarle sempre farebbe
 * passare da OpenRouter anche le corse che dicono di non passarci - lo stesso
 * ragionamento di `INSTRADA_VERSO` qui sopra.
 *
 * ⛔ E il valore della chiave non si stampa MAI: si legge e si passa.
 */
const VERSO_OPENROUTER = PROVIDER === 'openrouter' && (CHIAVE_DALLA_CUSTODIA || CHIAVI_DI_WINDOWS.OPENROUTER_API_KEY
    || process.env.OPENROUTER_API_KEY)
    ? {
        ANTHROPIC_BASE_URL: 'https://openrouter.ai/api',
        ANTHROPIC_AUTH_TOKEN: CHIAVE_DALLA_CUSTODIA || CHIAVI_DI_WINDOWS.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY,
        ANTHROPIC_API_KEY: '',
    }
    : {}

/**
 * ⭐⭐⭐ IL CONTO VERO DI UN TASK - e non lo si chiede al CLI.
 *
 * Il 2026-08-20 la ricerca ha trovato il paper che descrive questo esperimento
 * (`arXiv:2607.22585`, «The Scaffold Effect in Coding Agents»), e il suo
 * risultato centrale riscrive cosa dobbiamo misurare:
 *
 *   «Harness choice induces up to a **40× difference in tokens per solved
 *    task**, while paired within-model pass-rate differences remain relatively
 *    small (**0-8 percentage points**).»
 *
 * ⇒ I task risolti sono la dimensione in cui gli harness NON si distinguono.
 * Il costo per task risolto e quella in cui differiscono di quaranta volte. Il
 * banco misurava solo la prima.
 *
 * ## ⛔⛔ Perche il credito e non `total_cost_usd`
 *
 * Misurato lo stesso giorno: per una chiamata sola claude-code ha dichiarato
 * **$0,27045** mentre il credito del provider e sceso di **$0,054**. Cinque
 * volte. Il CLI calcola sui prezzi Anthropic anche quando la chiamata passa
 * altrove, e non puo sapere il listino di chi la serve davvero.
 *
 * ⇒ Il credito ha tre proprieta che nessun CLI ha: e **uno solo** per tutti
 * e sei gli harness, e **non falsificabile** da chi stiamo misurando, e non
 * richiede di saper leggere sei formati d'uscita diversi.
 *
 * ⛔ Un limite, dichiarato invece che nascosto: due corse in parallelo si
 * confonderebbero ⇒ il banco corre in serie, un harness per volta, ed e gia cosi.
 *
 * ⛔ L'aggiornamento del credito ha LATENZA: misurato, una lettura subito
 * dopo la chiamata torna il valore vecchio e fa segnare $0,0000. Chi chiama
 * deve attendere prima di leggere il «dopo» - vedi `ATTESA_DEL_CREDITO_MS`.
 *
 * ## ⛔⛔ UNO SPORTELLO PER OGNI FORNITORE CHE OFFRIAMO — regola dell'owner, 21/8
 *
 * Fino a qui questa funzione conosceva **solo OpenRouter**, e altrove tornava
 * `null`. ⇒ Su quota Anthropic il banco non sapeva quanto stava spendendo, e
 * l'ha scoperto nel modo peggiore: la sonda del 21/8 ha trovato sei giri su sei
 * falliti perche' il credito era finito, senza che niente lo dicesse prima.
 *
 * ⛔ E la prima cura che avevo scritto era peggio del male: una funzione a
 * parte per DeepSeek. **Due funzioni per «quanto credito resta» sono due
 * verita' che divergono**, e il giorno che divergono nessuna delle due protesta.
 *
 * ⇒ Uno sportello solo, che smista, e che per ogni fornitore sa dire **perche'**
 * non puo' rispondere. I tre, misurati il 21/8:
 *
 *   openrouter  ✅ `/api/v1/credits` — total_credits - total_usage
 *   deepseek    ✅ `/user/balance`   — balance_infos[0].total_balance
 *   anthropic   ⛔ NON ESISTE: `GET /v1/organizations/balance` risponde 404,
 *               e la richiesta e' aperta (anthropics/claude-code#47574). C'e'
 *               una *Usage and Cost API*, ma vuole una chiave **Admin**, che e'
 *               un'altra chiave da quella che il banco usa.
 *
 * ⛔ Per Anthropic il credito e' quindi IGNOTO **per costruzione**, e si
 * dichiara col suo perche'. Un `null` muto si legge come «non ho guardato»;
 * un `null` che dice «questo fornitore non ha uno sportello» si legge come un
 * fatto — ed e' la stessa disciplina di PRESENTE / ASSENTE / IGNOTO.
 */
export const ATTESA_DEL_CREDITO_MS = 4_000

/**
 * ⭐⭐⭐ IL CREDITO, per QUALUNQUE fornitore il banco offra.
 *
 * Torna `{ saldo, valuta, quota, perche }`. ⛔ `saldo: null` non e' mai zero: e'
 * IGNOTO, e `perche` dice quale dei tre motivi — niente sportello, niente
 * chiave, o lo sportello non ha risposto.
 */
export async function creditoDelFornitore(quota = MODELLO_DEL_BANCO.quota) {
    if (quota === 'openrouter') {
        const chiave = CHIAVE_DALLA_CUSTODIA || CHIAVI_DI_WINDOWS.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY
        if (!chiave) return { saldo: null, quota, valuta: 'USD', perche: 'OPENROUTER_API_KEY assente' }
        try {
            const r = await fetch('https://openrouter.ai/api/v1/credits', {
                headers: { Authorization: `Bearer ${chiave}` },
                signal: AbortSignal.timeout(15_000),
            })
            if (!r.ok) return { saldo: null, quota, valuta: 'USD', perche: 'lo sportello ha risposto ' + r.status }
            const d = (await r.json())?.data
            if (typeof d?.total_credits !== 'number' || typeof d?.total_usage !== 'number') {
                return { saldo: null, quota, valuta: 'USD', perche: 'risposta senza i campi attesi' }
            }
            return { saldo: d.total_credits - d.total_usage, quota, valuta: 'USD', perche: null }
        } catch (e) {
            return { saldo: null, quota, valuta: 'USD', perche: 'rete o timeout: ' + String(e?.message ?? e).slice(0, 40) }
        }
    }

    if (quota === 'deepseek') {
        const chiave = CHIAVI_DI_WINDOWS.DEEPSEEK_API_KEY || process.env.DEEPSEEK_API_KEY
        if (!chiave) return { saldo: null, quota, valuta: 'USD', perche: 'DEEPSEEK_API_KEY assente' }
        try {
            const r = await fetch('https://api.deepseek.com/user/balance', {
                headers: { Accept: 'application/json', Authorization: `Bearer ${chiave}` },
                signal: AbortSignal.timeout(15_000),
            })
            if (!r.ok) return { saldo: null, quota, valuta: 'USD', perche: 'lo sportello ha risposto ' + r.status }
            const info = ((await r.json())?.balance_infos ?? [])[0]
            const saldo = Number(info?.total_balance)
            if (!Number.isFinite(saldo)) return { saldo: null, quota, valuta: 'USD', perche: 'risposta senza `total_balance`' }
            return { saldo, quota, valuta: info?.currency ?? 'USD', perche: null }
        } catch (e) {
            return { saldo: null, quota, valuta: 'USD', perche: 'rete o timeout: ' + String(e?.message ?? e).slice(0, 40) }
        }
    }

    if (quota === 'openai') {
        const chiave = CHIAVI_DI_WINDOWS.OPENAI_API_KEY || process.env.OPENAI_API_KEY
        if (!chiave) return { saldo: null, quota, valuta: 'USD', perche: 'OPENAI_API_KEY assente' }
        try {
            /*
             * ⛔ `credit_grants` e' l'unico che torna il RESIDUO. La *Usage API*
             * c'e' ma da' il consumo aggregato e **ritarda di circa un'ora**:
             * per decidere se una campagna puo' partire serve il saldo adesso,
             * non quello di un'ora fa.
             */
            const r = await fetch('https://api.openai.com/v1/dashboard/billing/credit_grants', {
                headers: { Authorization: `Bearer ${chiave}` },
                signal: AbortSignal.timeout(15_000),
            })
            if (!r.ok) {
                return {
                    saldo: null, quota, valuta: 'USD',
                    /*
                     * ⛔ 401 o 403 vogliono dire la stessa cosa qui, ed e' stato
                     * MISURATO il 21/8: con una chiave `sk-` valida lo sportello
                     * risponde **403**. `credit_grants` e' un endpoint della
                     * dashboard e pretende una chiave di sessione del browser,
                     * non una chiave d'API.
                     *
                     * ⇒ Per OpenAI il saldo e' quindi ignoto **in pratica**,
                     * anche se l'endpoint esiste. Dirlo cosi' — invece di un
                     * «403» nudo — evita a chi legge di andare a cercare una
                     * chiave rotta che rotta non e'.
                     */
                    perche: 'lo sportello ha risposto ' + r.status
                        + ((r.status === 401 || r.status === 403)
                            ? ' — `credit_grants` e un endpoint della dashboard: vuole una chiave di'
                              + ' SESSIONE del browser, non una chiave d API. La chiave non e rotta.'
                            : ''),
                }
            }
            const d = await r.json()
            const saldo = Number(d?.total_available)
            if (!Number.isFinite(saldo)) return { saldo: null, quota, valuta: 'USD', perche: 'risposta senza `total_available`' }
            return { saldo, quota, valuta: 'USD', perche: null }
        } catch (e) {
            return { saldo: null, quota, valuta: 'USD', perche: 'rete o timeout: ' + String(e?.message ?? e).slice(0, 40) }
        }
    }

    if (quota === 'gemini' || quota === 'google') {
        /*
         * ⛔ Nessuno sportello, verificato il 21/8: il saldo prepagato di Gemini
         * si vede **solo** dalla console di AI Studio o da Google Cloud. Non c'e'
         * un endpoint REST che lo dica, e la quota per progetto e' un'altra cosa
         * ancora — dice quante richieste puoi fare, non quanti soldi restano.
         *
         * ⛔⛔ E qui il silenzio costa piu' che altrove: quando il saldo arriva a
         * zero, **tutte le chiavi di tutti i progetti legati a quel conto
         * smettono di funzionare insieme**. ⇒ Una campagna su Gemini puo' morire
         * di colpo, e il banco non ha modo di vederlo arrivare. Va detto prima,
         * non scoperto a meta' corsa.
         */
        return {
            saldo: null, quota, valuta: 'USD',
            perche: 'Google non espone il saldo prepagato via API: si vede solo dalla'
                + ' console. ⛔ E quando arriva a zero TUTTE le chiavi del conto smettono'
                + ' insieme, senza preavviso leggibile da qui.',
        }
    }

    if (quota === 'anthropic') {
        /*
         * ⛔ Non e' pigrizia ne' un buco: lo sportello NON ESISTE. Verificato
         * il 21/8 sulle fonti — `GET /v1/organizations/balance` risponde 404 e
         * la richiesta e' aperta (anthropics/claude-code#47574). La *Usage and
         * Cost API* c'e', ma pretende una chiave **Admin** che il banco non ha.
         *
         * ⇒ Chi legge deve poter distinguere «non ho guardato» da «non c'e'
         * niente da guardare», e questa riga glielo dice.
         */
        return {
            saldo: null, quota, valuta: 'USD',
            perche: 'Anthropic non espone il saldo: nessun endpoint pubblico'
                + ' (404 su /v1/organizations/balance, richiesta aperta #47574).'
                + ' La Usage and Cost API pretende una chiave Admin.',
        }
    }

    return { saldo: null, quota, valuta: 'USD', perche: 'fornitore sconosciuto al banco: ' + quota }
}

/**
 * Il saldo come numero solo — la forma che i chiamanti di prima si aspettano.
 *
 * ⛔ Resta perche' `corsaCoding.mjs` e `sonda.mjs` la usano gia', ma chi vuole
 * sapere **perche'** e' ignoto deve chiamare `creditoDelFornitore`.
 */
export async function creditoResiduo() {
    return (await creditoDelFornitore()).saldo
}


/**
 * Quanto e costato cio che sta in mezzo. `null` = IGNOTO.
 *
 * ⛔ Un residuo che SALE (una ricarica a meta corsa) non e un guadagno: e una
 * misura che non vale piu, e si dichiara ignota invece di scrivere un negativo
 * che il rapporto sommerebbe.
 */
export function spesaFra(prima, dopo) {
    if (typeof prima !== 'number' || typeof dopo !== 'number') return null
    const d = prima - dopo
    return d >= 0 ? d : null
}

/** Se la quota di OpenRouter e in uso - **solo il fatto**, mai la chiave. */
export function passaDaOpenRouter() { return Object.keys(VERSO_OPENROUTER).length > 0 }

export function lancia(comando, argomenti, { cartella, scadenzaMs, ambiente }) {
    return new Promise((resolve) => {
        const iniziato = Date.now()
        /*
         * ⛔ Chi ha già risposto non risponde due volte: alla scadenza dura
         * risolviamo noi, e il callback di `execFile` potrebbe arrivare dopo.
         */
        let chiuso = false
        let boia = null
        let scaduto = false
        const figlio = execFile(comando, argomenti, {
            cwd: cartella,
            /*
             * ⛔⛔⛔ NIENTE `timeout:` QUI — e la ragione è misurata.
             *
             * `execFile` con `timeout` manda SIGTERM al **figlio diretto**, poi
             * chiama il callback. A quel punto il padre è già morto, e
             * `taskkill /pid <padre> /f /t` non raggiunge più i nipoti: l'albero
             * non è più appeso a nessuno.
             *
             * La sonda del 2026-08-22, che ha chiuso la questione in un giro:
             *
             *     callback dopo 3.004 ms
             *     errore.killed: true · signal: SIGTERM
             *     figlio.pid: 19660   ← già morto quando proviamo a ucciderlo
             *     stdout: "19236"     ← il NIPOTE, vivo e vegeto
             *
             * ⇒ L'albero si uccide **mentre il padre è ancora vivo**. Il timer è
             * nostro, la scadenza la decidiamo noi, e `ammazzaLAlbero` arriva
             * prima che il ramo si stacchi. È la stessa scelta che `corsa.mjs`
             * aveva già fatto — e la quarta misura sua che andava riusata qui.
             */
            maxBuffer: 32 * 1024 * 1024,
            windowsHide: true,
            /*
             * ⛔⛔⛔ STDIN CHIUSO, e costa 600 SECONDI scoprirlo.
             *
             * Il 2026-08-17 `codex` ha «fallito» il task più semplice del
             * corpus dopo il timeout pieno. Non era lento e non aveva sbagliato
             * niente: aveva detto
             *
             *     «Reading additional input from stdin...»
             *
             * e aspettato. Con stdin aperto un harness non interattivo si ferma
             * lì per sempre, e il rapporto scrive `fallito 600s` — un numero
             * perfettamente plausibile per una cosa che non è mai successa.
             *
             * ⛔ E LA LEZIONE ERA GIÀ PAGATA. `corsa.mjs` la porta scritta
             * addosso: «lo `stdin: 'ignore'` che vale 45.007 ms contro 3.244».
             * È la SECONDA volta in questa sessione che una misura già dentro
             * `corsa.mjs` non viene riusata qui — la prima era lo shim `.cmd`.
             * Quando si scrive un modulo accanto a uno che ha già pagato, si
             * legge prima quello che ha pagato.
             *
             * ⛔⛔ E `stdio: ['ignore', …]` NON BASTA: `execFile` quell'opzione
             * la IGNORA, perché ha bisogno delle pipe per raccogliere stdout e
             * stderr. Provato: identici 600 s, identico messaggio. La chiusura
             * va fatta sul figlio, dopo — vedi `figlio.stdin?.end()` più sotto.
             * Una cura che sembra applicata e non lo è costa quanto nessuna
             * cura, e in più fa credere di aver già guardato lì.
             */
            env: {
                ...process.env,
                ...CHIAVI_DI_WINDOWS,
                /*
                 * ⛔ Gli hook di AVM non devono seguire l'harness dentro la
                 * copia: sono le MIE regole, e imporle a un concorrente
                 * falserebbe il confronto tanto quanto avvisarlo dei test.
                 */
                CLAUDE_PROJECT_DIR: cartella,
                /*
                 * ⛔ Il proxy entra QUI, nell'ambiente del figlio, e solo
                 * se qualcuno lo ha chiesto. Un `ANTHROPIC_BASE_URL` che
                 * resta impostato per sbaglio farebbe passare dal proxy
                 * anche le corse «senza», e il confronto A/B misurerebbe
                 * due volte la stessa cosa.
                 */
                ...(INSTRADA_VERSO ? { ANTHROPIC_BASE_URL: INSTRADA_VERSO } : {}),
                /*
                 * ⛔ Dopo `INSTRADA_VERSO` di proposito: se qualcuno ha chiesto un
                 * proxy esplicito, quella e una scelta deliberata di chi lancia e
                 * la quota non deve scavalcarla. ⛔ Ma il token e la chiave
                 * svuotata servono comunque, o si finisce a parlare col proxy
                 * usando le credenziali sbagliate.
                 */
                ...VERSO_OPENROUTER,
                ...(INSTRADA_VERSO ? { ANTHROPIC_BASE_URL: INSTRADA_VERSO } : {}),
                /*
                 * ⛔⛔ `TERM` UCCIDE AIDER, e in 6 secondi.
                 *
                 * Misurato il 2026-08-17: 0/5 con
                 *
                 *     «Can't initialize prompt toolkit: Found xterm-256color,
                 *      while expecting a Windows console»
                 *
                 * Git Bash esporta `TERM=xterm-256color`; aider è Python e
                 * prova ad aprire una console interattiva che su Windows non
                 * esiste in quella forma. Muore prima di leggere un file.
                 *
                 * ⇒ `dumb` dice a ogni libreria «niente colori, niente
                 * cursore, niente interattività» — che è esattamente ciò che
                 * un harness in un banco deve essere. Non lo azzoppa: gli
                 * toglie una cosa che qui non può usare.
                 */
                TERM: 'dumb',
                /*
                 * ⛔⛔ E `PYTHONIOENCODING`, che e il gemello di `TERM` e ci e
                 * costato una CAMPAGNA INTERA prima di essere visto.
                 *
                 * Il 2026-08-20 aider ha segnato **0 su 11**, e la causa non era
                 * aider. Dal suo stesso traceback:
                 *
                 *     # Uncaught UnicodeEncodeError in cp1252.py line 19
                 *     io.py assistant_output -> console.print
                 *                            -> legacy_windows_render
                 *
                 * ⇒ Aider non fallisce RAGIONANDO: muore STAMPANDO. Riceve la
                 * risposta, prova a scriverla sulla console Windows in cp1252, e il
                 * modello - qwen, che e cinese - emette caratteri che quella
                 * codifica non rappresenta. Il lavoro era gia fatto.
                 *
                 * ⛔ Ed e un difetto NOSTRO: l'ambiente glielo diamo noi. Senza
                 * questa riga avremmo pubblicato «aider 0/11» accusando un
                 * concorrente di un guasto che abbiamo causato noi.
                 *
                 * ⭐ `utf-8` non lo azzoppa e non lo aiuta: gli toglie un limite
                 * che il suo processo non doveva avere.
                 */
                PYTHONIOENCODING: 'utf-8',
                PYTHONUTF8: '1',
                /*
                 * ⛔ PER ULTIMO, e di proposito: chi lancia un harness che vive
                 * fuori da questo processo — DSH sta in WSL2 — deve poter dire
                 * quali variabili lo attraversano. Sopra ci sono le cure valide
                 * per tutti; qui c'e cio che riguarda UNO solo, e sovrascrivere
                 * una cura generale con una particolare e una scelta di chi
                 * scrive la riga, non un caso.
                 */
                ...(ambiente ?? {}),
            },
        }, (errore, fuori, errori) => {
            if (chiuso) return
            chiuso = true
            clearTimeout(boia)
            clearTimeout(scadenzaNostra)
            /*
             * ⛔⛔⛔ ANCHE QUANDO `execFile` CHIUDE, I NIPOTI RESTANO VIVI.
             *
             * Trovato dal test, non ragionandoci sopra: `lancia` tornava in
             * 4.584 ms — quindi la scadenza di `execFile` aveva funzionato — e
             * il nipote era **ancora vivo**. Il boia più sotto non serviva a
             * niente: lo cancellava questa riga, un attimo prima.
             *
             * ⇒ È da qui che venivano i **18 `node --test` accumulati** del
             * 2026-08-22: `execFile` chiudeva regolarmente, il banco andava
             * avanti, e ogni scadenza lasciava dietro un albero vivo che teneva
             * aperta la cartella del task — finché uno di quelli non ha bloccato
             * la campagna per 25 minuti con `EPERM`.
             *
             * ⛔ Il boia da solo NON bastava, e sembrava di sì: due difetti
             * diversi con lo stesso sintomo. Qui si prende il caso comune —
             * scadenza rispettata, nipoti no — e più sotto quello raro, in cui
             * `execFile` non torna affatto.
             *
             * ⛔ Solo se `killed`: su una chiusura normale l'albero è già morto,
             * e un `taskkill` inutile lo pagherebbe ogni singolo comando.
             */
            if (errore?.killed) ammazzaLAlbero(figlio)
            resolve({
                fuori: String(fuori ?? ''),
                errori: String(errori ?? ''),
                ms: Date.now() - iniziato,
                // `killed` distingue «piantato» da «uscito male»: sono due
                // diagnosi diverse, e mediarle nasconde quella peggiore.
                // ⛔ `scaduto` è NOSTRO: da quando la scadenza la gestiamo noi,
                //    `errore.killed` non basta più a riconoscere un piantato.
                piantato: scaduto || Boolean(errore && errore.killed),
                codice: errore?.code ?? 0,
                /*
                 * ⛔⛔ «LOGGATO» NON È «UTILIZZABILE».
                 *
                 * Il 2026-08-17 `codex login status` rispondeva «Logged in
                 * using ChatGPT» e il token era scaduto: al primo task,
                 * `Failed to refresh token: 401 Unauthorized — Your session has
                 * ended`. Il rilevamento guardava lo stato DICHIARATO, non
                 * quello spendibile — è «collegato non è in carica» applicato
                 * alle credenziali.
                 *
                 * ⇒ Un harness in questo stato non ha fallito: non ha mai
                 * corso. Marcarlo qui permette alla corsa di ESCLUDERLO e
                 * dirlo, invece di scrivere uno zero che sembra un giudizio.
                 */
                /*
                 * ⛔⛔ IL LIMITE DI TRAFFICO VINCE, e non e una priorita
                 * estetica: e la differenza fra «riprova» e «e finita».
                 *
                 * Misurato il 2026-08-21 su dsh: la risposta 429 di OpenRouter
                 * porta la stringa `insufficient_quota` dentro il payload del
                 * fornitore. ⇒ `CREDENZIALI_ESAURITE` scattava, e la corsa
                 * veniva saltata con «rifai il login» — mandando a riparare
                 * credenziali sanissime mentre la causa vera era una coda.
                 *
                 * ⛔ Il rischio del verso contrario si dichiara: un credito
                 * davvero finito che nominasse anche un rate limit verrebbe
                 * letto come transitorio. Costa un tentativo in piu, e in
                 * nessuno dei due casi si produce un numero falso — entrambe
                 * le letture ESCLUDONO la riga invece di contarla.
                 */
                credenzialiEsaurite: CREDENZIALI_ESAURITE.test(`${fuori ?? ''}\n${errori ?? ''}`)
                    && !eUnLimiteDiTraffico(`${fuori ?? ''}\n${errori ?? ''}`),
                /*
                 * ⛔ Separata dalla precedente di proposito: vedi
                 * `LIMITE_DI_TRAFFICO`. Un 429 non e un esito, e la cura non e
                 * rifare il login — e aspettare, o cambiare modello.
                 */
                limitatoDalFornitore: eUnLimiteDiTraffico(`${fuori ?? ''}\n${errori ?? ''}`),
            })
        })
        /*
         * ⛔⛔⛔ QUI SI CHIUDE STDIN, ed è la riga che vale 600 secondi.
         *
         * `codex exec` stampa «Reading additional input from stdin...» e
         * aspetta. Finché quella pipe resta aperta non parte mai, e il banco
         * scrive `fallito 600s` — che sembra una misura ed è un'attesa.
         *
         * Va fatto DOPO aver creato il figlio, perché `execFile` apre le pipe
         * per conto suo e ignora l'opzione `stdio`.
         */
        figlio.stdin?.end()
        /*
         * ⛔⛔⛔ LA SCADENZA DI `execFile` NON UCCIDE I NIPOTI — misurato il
         * 2026-08-22, e ha bloccato la campagna per **25 minuti**.
         *
         * `timeout: scadenzaMs` manda SIGTERM al **figlio diretto**. Su Windows
         * i nipoti sopravvivono, tengono aperte le pipe di stdout e stderr, e il
         * callback di `execFile` **non viene mai chiamato**: la promessa resta
         * sospesa per sempre. Non è una corsa lenta: è una corsa che non finirà.
         *
         * Il conto di quel giorno, chiesto a Windows mentre succedeva:
         *
         *     CPU del processo campagna in 6 s ...   0 s     ← aspetta, non lavora
         *     suo unico figlio ..................   uv.exe   ← hermes
         *     scadenza dichiarata ...............   600 s
         *     tempo davvero passato .............   1.500 s
         *
         * E intorno, 18 `node --test` appesi che tenevano la cartella del task:
         * `copia non buttata dopo 5 tentativi (EPERM)`. Il giro, una volta
         * sbloccato a mano, ha riportato `[168-900]`: **900 secondi** contro una
         * scadenza di 600 — un numero che da solo dice che la scadenza non morde.
         *
         * ## ⛔ E la cura era GIÀ SCRITTA, in questo repo, da un'altra mano
         *
         * `ammazzaLAlbero` sta in `corsa.mjs` con dentro `taskkill /f /t`, il
         * commento che cita il difetto gemello di pnpm, e perfino un test che si
         * chiama `scadenzaUccideLAlbero`. Ma la chiamavano solo `corsa.mjs` e il
         * suo test: **implementata sì, testata sì, chiamata dove serve no.**
         *
         * ⛔ Ed è la TERZA volta che una misura già pagata dentro `corsa.mjs`
         * non viene riusata qui — le altre due sono lo shim `.cmd` e lo
         * `stdin: 'ignore'`, raccontate qui sopra. Quando si scrive un modulo
         * accanto a uno che ha già pagato, si legge prima quello.
         *
         * ⛔ Il boia parte un filo DOPO la scadenza di `execFile`: se la sua
         * cura basta, questo non fa niente e la diagnosi resta la sua. Solo
         * quando il figlio sopravvive alla propria scadenza si prende l'albero.
         */
        /*
         * ⭐ LA SCADENZA VERA, la nostra: uccide l'ALBERO mentre il padre è
         * ancora vivo, e poi lascia arrivare il callback di `execFile` con
         * quello che l'harness aveva già stampato — che spesso è la diagnosi.
         */
        const scadenzaNostra = setTimeout(() => {
            if (chiuso) return
            scaduto = true
            ammazzaLAlbero(figlio)
        }, scadenzaMs)
        scadenzaNostra.unref?.()

        const GRAZIA_MS = 15_000
        boia = setTimeout(() => {
            if (chiuso) return
            chiuso = true
            clearTimeout(scadenzaNostra)
            ammazzaLAlbero(figlio)
            /*
             * ⛔ Si risolve QUI, senza aspettare il callback: se i nipoti hanno
             * tenuto le pipe aperte, quel callback non arriverà mai. E la riga
             * dice `piantato: true`, che è la verità — non `fallito`, che
             * sarebbe un giudizio sull'harness invece che sulla scadenza.
             */
            resolve({
                fuori: '',
                errori: `⛔ scadenza di ${scadenzaMs} ms superata: albero ucciso dopo altri ${GRAZIA_MS} ms`,
                ms: Date.now() - iniziato,
                piantato: true,
                codice: -1,
                credenzialiEsaurite: false,
                limitatoDalFornitore: false,
            })
        }, scadenzaMs + GRAZIA_MS)
        /*
         * ⛔ `unref`, o il timer terrebbe vivo il processo del banco fino alla
         * scadenza piena anche quando l'harness ha chiuso in mezzo secondo.
         */
        boia.unref?.()
    })
}

/**
 * ⛔⛔ COME SI LANCIA DAVVERO UN COMANDO NPM GLOBALE SU WINDOWS.
 *
 * La prima corsa, il 2026-08-17, ha dato **FALLITO in 0 secondi** con
 * `spawn npm ENOENT`. Non era un esito: era il banco rotto — e avrebbe
 * bocciato ogni harness con un numero perfettamente plausibile.
 *
 * `corsa.mjs` aveva già pagato questa lezione per `pi` e la scrive per esteso:
 * lo shim `nome.cmd` dà **EINVAL** su Node 24, e `shell: true` farebbe passare
 * la consegna — che contiene virgolette e apici — attraverso `cmd.exe`.
 *
 * ⇒ Si salta lo shim e si va al file vero, che `scriptDelPacchetto` sa trovare.
 * Poi dipende da cosa si trova:
 *
 *   `.exe` → si lancia diretto (claude)
 *   `.js`  → si lancia con `node` (codex)
 *
 * In nessuno dei due casi c'è una shell in mezzo.
 */
function comeSiLancia(pacchetto) {
    const script = scriptDelPacchetto(pacchetto)
    if (!script || !existsSync(script)) return null
    return script.endsWith('.js')
        ? { comando: process.execPath, davanti: [script] }
        : { comando: script, davanti: [] }
}

/**
 * Il testo da giudicare, tirato fuori da un'uscita che può essere JSON.
 *
 * ⛔ Si tiene ANCHE il grezzo quando il JSON non si legge: un harness che
 * cambia formato non deve diventare silenziosamente un harness che tace, se no
 * il banco lo conterebbe come «non ha detto che era impossibile» e lo
 * boccerebbe per un difetto mio.
 */
function testoDetto(uscita) {
    const grezzo = `${uscita.fuori}\n${uscita.errori}`.trim()

    // Forma 1 — un JSON solo, con la risposta in un campo (claude).
    try {
        const j = JSON.parse(uscita.fuori)
        const dentro = j?.result ?? j?.text ?? j?.content ?? null
        if (typeof dentro === 'string' && dentro.length > 0) return dentro
    } catch { /* non era un JSON solo: si prova la forma a righe */ }

    /*
     * Forma 2 — JSONL, un evento per riga (pi).
     *
     * ⛔ Senza questo, `detto` sarebbe l'intero flusso di eventi: la sessione,
     * i turni, i tool, il modello. Il giudizio dei task impossibili cerca
     * «non esiste» dentro quel testo, e in mezzo a duemila byte di protocollo
     * la probabilità di trovarlo per caso non è zero — sarebbe un «ha detto
     * che non si può» regalato a chi non l'ha detto.
     */
    const righe = String(uscita.fuori).trim().split('\n').filter(Boolean)
    if (righe.length > 1) {
        const detti = []
        for (const riga of righe) {
            try {
                const e = JSON.parse(riga)
                const contenuto = e?.message?.content
                if (!Array.isArray(contenuto)) continue
                // Solo ciò che ha detto l'ASSISTENTE: la consegna è nostra e
                // rileggerla come sua risposta falserebbe ogni giudizio.
                if (e?.message?.role && e.message.role !== 'assistant') continue
                for (const pezzo of contenuto) {
                    if (pezzo?.type === 'text' && typeof pezzo.text === 'string') detti.push(pezzo.text)
                }
            } catch { /* riga non JSON: si salta */ }
        }
        if (detti.length > 0) return [...new Set(detti)].join('\n')
    }

    return grezzo
}

/**
 * Un harness può correre? `null` = sì, altrimenti la ragione per cui no.
 *
 * ⛔ Le credenziali si chiedono al programma, non si indovinano dall'ambiente:
 * `claude` e `codex` non usano una variabile, usano una sessione loro. Un
 * controllo su `ANTHROPIC_API_KEY` li escluderebbe tutti e due pur essendo
 * pronti — questa macchina non ha nessuna chiave nell'ambiente, e loro corrono.
 */
function chiedeSeEPronto(comando, argomenti, riconosci) {
    /*
     * ⛔⛔ SI GUARDANO TUTTI E DUE I CANALI, e non è pignoleria.
     *
     * Misurato il 2026-08-17: `codex login status` risponde **«Logged in using
     * ChatGPT» su stderr**, e stdout resta vuoto. Il primo rilevamento leggeva
     * solo il valore di ritorno di `execFileSync` — cioè stdout — e dichiarava
     * «nessuna credenziale» un harness perfettamente pronto.
     *
     * Nel banco quell'errore ha un costo preciso: **esclude un concorrente dal
     * confronto**, e lo fa in silenzio. È il gemello dello `spawn npm ENOENT`
     * di stamattina, che invece lo bocciava. Un ostacolo del banco travestito
     * da fatto sul mondo, in tutte e due le direzioni.
     *
     * ⇒ `spawnSync`, che li restituisce entrambi, invece di `execFileSync`, che
     * ne restituisce uno solo e lascia l'altro andare a schermo.
     */
    const esito = spawnSync(comando, argomenti, {
        encoding: 'utf8', timeout: 30_000, windowsHide: true,
        env: { ...process.env, ...CHIAVI_DI_WINDOWS },
    })
    const detto = `${esito.stdout ?? ''}\n${esito.stderr ?? ''}`
    return riconosci(detto) ? null : 'nessuna credenziale'
}

/** @type {readonly {nome: string, perche: () => string|null, lavora: Function}[]} */
/**
 * ⭐⭐⭐ LA PARITA DI MODELLO PER CODEX - e senza questa il banco MENTIVA.
 *
 * ⛔⛔ Misurato il 2026-08-20, dal suo stesso preambolo:
 *
 *     model: gpt-5.6-sol
 *     provider: openai
 *
 * Mentre claude, aider e pi giravano su `qwen/qwen3.7-flash`. ⇒ Il confronto
 * non misurava sei harness sullo stesso cervello: misurava cinque harness piu
 * un modello diverso. E' lo `scaffold-model confound` che `arXiv:2607.22585`
 * chiama «hidden variable», ed e la ragione per cui quel paper esiste.
 *
 * ⛔ Codex non legge le variabili `ANTHROPIC_*`: e la CLI di OpenAI e usa la
 * SUA autenticazione. Va detto in TOML, e si dice tutto da riga di comando -
 * cosi il `~/.codex/config.toml` della persona non viene toccato.
 *
 * ⛔⛔ `wire_api` vale `'responses'`, e la documentazione trovata sul web
 * diceva `'chat'`. L'ha smentita il CLI stesso, in faccia:
 *
 *     Error loading config.toml: `wire_api = "chat"` is no longer supported.
 *     How to fix: set `wire_api = "responses"` in your provider config.
 *
 * ⇒ Le guide erano scritte per una versione precedente; qui gira Codex
 * v0.148.0. Su quale valore accetta, l'autorita e il programma installato,
 * non l'articolo - anche quando l'articolo e del produttore.
 *
 * ⛔ Quando la quota non e OpenRouter torna [], e Codex resta com'era.
 */
function paritaPerCodex() {
    if (!passaDaOpenRouter()) return []
    const q = (v) => `"${v}"`
    return [
        '-c', `model_providers.openrouter.name=${q('openrouter')}`,
        '-c', `model_providers.openrouter.base_url=${q('https://openrouter.ai/api/v1')}`,
        '-c', `model_providers.openrouter.env_key=${q('OPENROUTER_API_KEY')}`,
        '-c', `model_providers.openrouter.wire_api=${q('responses')}`,
        '-c', `model_provider=${q('openrouter')}`,
        '-c', `model=${q(MODELLO_DEL_BANCO.anthropic)}`,
    ]
}

/**
 * ⭐⭐⭐ QUALI FILE APRIRE PER AIDER — e li dice il TASK, non la cartella.
 *
 * Aider non esplora: la persona sceglie i file e lui lavora su quelli. E' il suo
 * modello d'uso, documentato, e dargli i file e' il trattamento **corretto**.
 *
 * ⛔ Ma «quali» non si deduce dalla forma della cartella. I task costruiti
 * apposta hanno `src/` e `test/` alla radice con file `.mjs`; quelli presi dalla
 * nostra storia git hanno `mobile/src/…` in `.ts`. Una regola sola non copre
 * tutti e due, e quella vecchia sui secondi tornava **vuoto**.
 *
 * ⇒ Se il task dichiara i suoi file, si usano quelli. Altrimenti si guarda la
 * cartella, che e' il caso dei progetti costruiti apposta.
 */
export function fileDaAprirePerAider(task, cartella) {
    /*
     * ⭐ I task dalla storia portano `srcDelFix` e `testIntoccabili`: sono
     * esattamente i file che il fix ha toccato e il metro che li giudica.
     * ⛔⛔⛔ 29/8 — TROVATO SU QWEN, poco prima di una campagna: il corpus
     * `compiti-complessi` (5 domini × 5 difficoltà, mai esistito quando
     * questa funzione è stata scritta il 21/8) usa un TERZO nome di campo,
     * `percorsiCodice` — un array piatto di percorsi, non letto qui.
     * Risultato reale misurato: aider 0/25 su Qwen (`erroreDellHarness`
     * onesto, "nessun file da aprire su un task che ne dichiara" — la
     * guardia sotto ha funzionato ESATTAMENTE come doveva, fermandosi
     * invece di produrre un numero falso), e — peggio, silenzioso — i 9
     * task su 25 SENZA `premesse` (i 5 di dominio API + altri 4 che
     * omettono `premesse` deliberatamente, vedi
     * CORPUS-COMPITI-COMPLESSI-PROPOSTA.md) non fanno nemmeno scattare la
     * guardia sotto: `daCartella` (che cercava solo `.mjs`/`.ts`) avrebbe
     * dato un elenco vuoto su `.py`/`.js` SENZA lanciare, un fallito che
     * SEMBRA legittimo e non lo è. Corretto qui, non solo per Qwen: ogni
     * riga aider già misurata su `compiti-complessi` (DeepSeek/GLM/Qwen)
     * porta lo stesso difetto — segnalato all'owner, non ri-misurato da
     * solo senza un suo sì.
     * ⛔ Si controlla che esistano DAVVERO nella copia: un percorso dichiarato
     * ma assente farebbe partire aider con un argomento che non c'e', e la
     * diagnosi punterebbe ad aider invece che al montaggio.
     */
    const dalTask = [...(task.srcDelFix ?? []), ...(task.testIntoccabili ?? []), ...(task.percorsiCodice ?? [])]
        .filter((f) => existsSync(join(cartella, f)))
    if (dalTask.length) return dalTask

    /*
     * I progetti costruiti apposta: `src/` e `test/` alla radice.
     * ⛔ 29/8 — `.py`/`.js` aggiunti insieme a `percorsiCodice` sopra:
     * `compiti-complessi` ha domini Python (`.py`) e Node puro (`.js`,
     * non `.mjs`) oltre a quelli già coperti.
     */
    const daCartella = []
    for (const sotto of ['src', 'test']) {
        try {
            for (const n of readdirSync(join(cartella, sotto))) {
                if (n.endsWith('.mjs') || n.endsWith('.ts') || n.endsWith('.py') || n.endsWith('.js')) daCartella.push(join(sotto, n))
            }
        } catch { /* la cartella può non esserci */ }
    }
    return daCartella
}

export const HARNESS = Object.freeze([
    /*
     * ⭐⭐⭐ LA BASELINE, e non è un segnaposto: è un concorrente vero che non
     * fa niente.
     *
     * Lo chiede la checklist ABC (arXiv 2507.02825), voce R: un rapporto va
     * pubblicato con «appropriate baseline comparisons, including **trivial
     * agent** performance». E il motivo ha un numero: su **τ-bench** un agente
     * che risponde vuoto passa il **38%** dei task dichiarati irrisolvibili.
     *
     * ⛔ Noi quel difetto lo avevamo — sei task su sei si passavano stando
     * fermi — e l'abbiamo curato con un test. Ma un test lo sa solo chi legge
     * il codice: chi legge la TABELLA no. Mettendo la baseline in mezzo agli
     * altri, la domanda «questo banco misura qualcosa?» ha una risposta a
     * colpo d'occhio, in ogni rapporto, per sempre.
     *
     * ⇒ Deve fare 0/5. Se un giorno fa 1/5, il banco è rotto e si vede subito.
     */
    {
        nome: '(nessuno)',
        disponibile: () => true,
        perche: () => null,
        async lavora() {
            return {
                detto: '', fuori: '', errori: '', ms: 0,
                piantato: false, codice: 0, credenzialiEsaurite: false, limitatoDalFornitore: false,
            }
        },
    },
    {
        nome: 'claude',
        pacchetto: '@anthropic-ai/claude-code',
        disponibile() { return comeSiLancia(this.pacchetto) !== null },
        async lavora({ cartella, task }) {
            const via = comeSiLancia(this.pacchetto)
            const uscita = await lancia(via.comando, [
                ...via.davanti,
                '-p', task.consegna,
                '--model', MODELLO_DEL_BANCO.anthropic,
                '--permission-mode', 'bypassPermissions',
                '--output-format', 'json',
            ], { cartella, scadenzaMs: SCADENZA_HARNESS_MS })
            return { detto: testoDetto(uscita), ...uscita }
        },
    },
    {
        nome: 'codex',
        pacchetto: '@openai/codex',
        disponibile() { return comeSiLancia(this.pacchetto) !== null },
        perche() {
            const via = comeSiLancia(this.pacchetto)
            if (!via) return 'non installato'
            return chiedeSeEPronto(via.comando, [...via.davanti, 'login', 'status'],
                (t) => /logged in/i.test(t))
        },
        async lavora({ cartella, task }) {
            const via = comeSiLancia(this.pacchetto)
            const uscita = await lancia(via.comando, [
                ...via.davanti,
                'exec',
                ...paritaPerCodex(),
                '--cd', cartella,
                '--dangerously-bypass-approvals-and-sandbox',
                task.consegna,
            ], { cartella, scadenzaMs: SCADENZA_HARNESS_MS })
            return { detto: testoDetto(uscita), ...uscita }
        },
    },
    /*
     * ⭐⭐⭐ HERMES — e non è un pacchetto npm: vive in `AppData\Local\hermes`,
     * è Python, e si lancia col SUO ambiente `uv`. ⛔ Non si scarica: è già lì.
     *
     * Tre cose sono costate una misura ognuna, il 2026-08-17:
     *
     *   `--project` ...... `uv run` cerca il pyproject nella cartella corrente,
     *                      che qui è la copia del progetto di prova. Senza,
     *                      non trova hermes.
     *   `--no-restore-cwd`  hermes RIPRISTINA la cartella dalla sessione
     *                      precedente: senza questo lavorerebbe altrove, e il
     *                      banco misurerebbe una cartella che non ha preparato.
     *   `-m` + `--provider` la credenziale `copilot` registrata dà **HTTP 403**
     *                      (il token `gh` non ha lo scope Copilot). Quella che
     *                      spende è `ANTHROPIC_API_KEY`, e va nominata insieme
     *                      a un modello che esiste: `claude-sonnet-4-...` dà
     *                      404, `claude-sonnet-5` risponde.
     *
     * ⛔ E questo rende il confronto «harness + suo modello», non «harness a
     * parità di modello»: hermes gira su Sonnet 5, Claude Code su Opus. È il
     * confronto onesto per la domanda «cosa ottengo installando X», ed è quello
     * che l'owner ha chiesto — ma va detto, se no i tempi sembrano dell'harness
     * e sono in parte del modello.
     */
    {
        nome: 'hermes',
        casa: 'C:/Users/Antonino/AppData/Local/hermes',
        uv() { return `${this.casa}/bin/uv.exe` },
        progetto() { return `${this.casa}/hermes-agent` },
        disponibile() { return existsSync(this.uv()) && existsSync(this.progetto()) },
        perche() {
            if (!this.disponibile()) return 'non installato'
            return CHIAVI_DI_WINDOWS.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY
                ? null
                : 'nessuna chiave anthropic (copilot da 403)'
        },
        async lavora({ cartella, task }) {
            const uscita = await lancia(this.uv(), [
                'run', '--project', this.progetto(), 'hermes',
                '-z', task.consegna,
                '--provider', MODELLO_DEL_BANCO.provider, '--model', MODELLO_DEL_BANCO.anthropic,
                '--yolo', '--no-restore-cwd',
            ], { cartella, scadenzaMs: SCADENZA_HARNESS_MS })
            return { detto: testoDetto(uscita), ...uscita }
        },
    },
    /*
     * ⭐ AIDER — Python, e l'unico che tocca git da solo.
     *
     * `--no-git --no-auto-commit` non sono prudenza: aider crea un repository
     * nella cartella in cui lavora e committa a ogni modifica. Nel banco quello
     * sporcherebbe la copia con dei file che nessun altro harness produce, e
     * `improntaDeiTest` leggerebbe un mondo diverso.
     *
     * ⛔ E `--model-settings-file`: aider manda `temperature` a ogni chiamata,
     * che i modelli Claude 5 rifiutano — `invalid_request_error: temperature is
     * deprecated for this model`. Senza quel file aider fallisce ogni task
     * senza mai arrivare al modello, e il banco lo scriverebbe come un suo
     * fallimento.
     */
    {
        nome: 'aider',
        disponibile() { return existsSync('C:/Users/Antonino/.local/bin/aider.exe') },
        perche() {
            if (!this.disponibile()) return 'non installato'
            return CHIAVI_DI_WINDOWS.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY
                ? null
                : 'nessuna chiave anthropic'
        },
        async lavora({ cartella, task }) {
            const impostazioni = new URL('aider-modelli.yml', import.meta.url).pathname
                .replace(/^\/([A-Za-z]:)/, '$1')
            /*
             * ⛔⛔⛔ AIDER VUOLE I FILE, e senza non lavora — 0/5 su tutto.
             *
             * Verbatim, il 2026-08-17, su ognuno dei cinque task:
             *
             *     «Non hai ancora aggiunto il file `src/prezzo.mjs` alla chat.
             *      Per favore aggiungilo così posso proporre le modifiche»
             *
             * Non è una debolezza: è il suo modello d'uso, documentato — la
             * persona sceglie i file e aider lavora su quelli. Gli altri quattro
             * esplorano da soli perché hanno strumenti di lettura; aider no, e
             * non pretende di averli.
             *
             * ⛔ Dargli i file è quindi il trattamento CORRETTO, non un favore.
             * Ma è un trattamento DIVERSO, e nel rapporto va dichiarato: chi
             * legge deve sapere che aider ha ricevuto il contesto già aperto
             * mentre gli altri se lo sono cercato.
             *
             * ⛔⛔ E QUALI file glieli dice il TASK, non la forma della cartella
             * — trovato il 2026-08-21, prima della campagna e per un soffio.
             *
             * Fino a qui l'elenco si costruiva così:
             *
             *     for (const sotto of ['src', 'test'])
             *         if (n.endsWith('.mjs')) daAprire.push(…)
             *
             * ⇒ Funziona sui progetti costruiti apposta, che hanno `src/` e
             * `test/` alla radice e file `.mjs`. Sui 35 task presi dalla nostra
             * storia git i file stanno in **`mobile/src/…`** e sono **`.ts`**:
             * l'elenco sarebbe stato **VUOTO**, e aider — che i file li pretende,
             * come dice la nota qui sopra — avrebbe risposto «non hai ancora
             * aggiunto il file alla chat» su **tutti e 35**.
             *
             * ⛔ Un avversario azzoppato dal banco è un banco truccato, e questo
             * lo sarebbe stato **a nostro favore**: aider 0/35 contro chiunque
             * altro. È l'unico dei sei con questo difetto — gli altri esplorano
             * da soli perché hanno strumenti di lettura, e non gli serve.
             */
            const daAprire = fileDaAprirePerAider(task, cartella)
            /*
             * ⛔⛔ UN AVVERSARIO CHE RICEVE NIENTE NON E' UN RISULTATO.
             *
             * Se l'elenco e' vuoto su un task che dichiara i suoi file, aider
             * non puo' lavorare **per colpa nostra**, e il suo zero finirebbe in
             * classifica come se se lo fosse guadagnato. ⇒ Si ferma qui e lo
             * dice, invece di produrre un numero falso a nostro favore.
             *
             * ⛔⛔⛔ 29/8 — `task.percorsiCodice?.length` aggiunto: senza,
             * i task SENZA `premesse` (dominio API e altri, vedi
             * fileDaAprirePerAider) non facevano scattare questa guardia
             * — un elenco vuoto ci sarebbe finito silenziosamente in
             * `daCartella`, un "fallito" che sembra legittimo e non lo è.
             */
            if (daAprire.length === 0 && (task.srcDelFix?.length || task.premesse?.length || task.percorsiCodice?.length)) {
                throw new Error('aider: nessun file da aprire su un task che ne dichiara ('
                    + task.id + '). Un avversario azzoppato dal banco non e un esito.')
            }
            const uscita = await lancia('C:/Users/Antonino/.local/bin/aider.exe', [
                ...daAprire,
                '--message', task.consegna,
                '--model', MODELLO_DEL_BANCO.litellm,
                '--model-settings-file', impostazioni,
                '--yes-always', '--no-git', '--no-auto-commit', '--no-stream',
            ], { cartella, scadenzaMs: SCADENZA_HARNESS_MS })
            return { detto: testoDetto(uscita), ...uscita }
        },
    },
    /*
     * `pi` era dichiarato senza credenziali fino a quando le quattro chiavi di
     * Windows non sono arrivate nell'ambiente dei figli: da quel momento corre.
     */
    {
        nome: 'pi',
        pacchetto: '@earendil-works/pi-coding-agent',
        disponibile() { return comeSiLancia(this.pacchetto) !== null },
        perche() {
            const via = comeSiLancia(this.pacchetto)
            if (!via) return 'non installato'
            for (const p of ['anthropic', 'openai', 'google']) {
                const esito = chiedeSeEPronto(via.comando,
                    [...via.davanti, 'auth', 'check', '--provider', p, '--json'],
                    (t) => /"status"\s*:\s*"ready"/i.test(t))
                if (esito === null) return null
            }
            return 'nessun provider configurato'
        },
        async lavora({ cartella, task }) {
            const via = comeSiLancia(this.pacchetto)
            /*
             * ⛔⛔ IL PROVIDER VA DETTO, se no pi parla con LM STUDIO.
             *
             * Misurato il 2026-08-17: 0/5, e **16 secondi esatti su tutti e
             * sei i task** — un tempo identico è la firma di qualcosa che non
             * lavora. Nell'uscita:
             *
             *     "provider":"lmstudio"
             *     "model":"llama-3.2-8x3b-moe-dark-champion-instruct-uncensored"
             *     "content":[]
             *
             * pi usava la sua configurazione locale, cioè un modello servito da
             * LM Studio che non era in esecuzione, e rispondeva con un turno
             * vuoto. Le quattro chiavi erano nell'ambiente e non le guardava
             * nemmeno: non aveva motivo di farlo, nessuno gliel'aveva chiesto.
             *
             * ⇒ Nel banco il provider e il modello si NOMINANO sempre. Un
             * default silenzioso trasforma il confronto fra harness in un
             * confronto fra configurazioni di macchine.
             */
            const uscita = await lancia(via.comando, [
                ...via.davanti,
                '--provider', MODELLO_DEL_BANCO.provider, '--model', MODELLO_DEL_BANCO.anthropic,
                '--print', '--mode', 'json', task.consegna,
            ], { cartella, scadenzaMs: SCADENZA_HARNESS_MS })
            return { detto: testoDetto(uscita), ...uscita }
        },
    },
    /*
     * ⭐⭐⭐ TALOS — la nostra riga, e la prima volta che il banco misura NOI.
     *
     * ⛔ Non è un adattatore a un programma di qualcun altro: è un harness
     * costruito col kernel VERO dell'app, compilato per Node da
     * `mobile/scripts/banco`. Il codice è lo stesso che gira sul Pad - stessa
     * porta `TalosDisco`, due implementazioni, e il 2026-08-20 le ho misurate
     * entrambe: stessi identici esiti su Capacitor e su `node:fs`.
     *
     * ## Su cosa scommette
     *
     * Sul **costo per task risolto**, non sui task risolti. La campagna dice che
     * claude-code manda 42.272 token di sistema a ogni giro e paga $0,0325 per
     * task risolto, mentre aider ne paga $0,0022 perche' è magro. ⇒ Noi
     * partiamo da **quattro attrezzi**, che è l'apertura a gradi gia' misurata
     * nell'app: 63 attrezzi = 11.483 token diventano 505.
     *
     * ⛔ La previsione è falsificabile, ed è il punto: **se non battiamo
     * $0,0022, questo banco lo dira'**. Un banco che non puo' smentirci non
     * serve a niente.
     *
     * ⛔ Il bundle si ricompila quando l'app cambia:
     *     npx vite build --config scripts/harness-talos/vite.banco.config.mjs
     * Se non lo si rifa', si misura una versione vecchia - ed è l'unico modo
     * di sbagliare che questa via lascia aperto.
     */
    {
        nome: 'talos',
        modulo: process.env.TALOS_HARNESS
            ?? 'C:/Users/Antonino/Desktop/projects/AVM-harness/mobile/scripts/harness-talos/talosHarness.mjs',
        disponibile() { return existsSync(this.modulo) },
        perche() {
            if (!existsSync(this.modulo)) return 'harness non compilato: manca ' + this.modulo
            const chiave = CHIAVE_DALLA_CUSTODIA || CHIAVI_DI_WINDOWS.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY
            if (!chiave) return 'manca OPENROUTER_API_KEY'
            /*
             * ⛔ La parita' di modello vale anche per noi, e soprattutto per noi:
             * un harness di casa misurato su un modello diverso sarebbe la
             * scorciatoia piu' facile e la bugia piu' grossa.
             */
            if (!passaDaOpenRouter()) return 'talos corre solo con BANCO_PROVIDER=openrouter'
            return null
        },
        async lavora({ cartella, task }) {
            const { talosLavora } = await import(pathToFileURL(this.modulo).href)
            /*
             * ⭐⭐⭐ `BANCO_EFFORT`, 28/8 — trovato PREPARANDO la corsa sui 5
             * modelli del dominio compiti-complessi, non durante: senza
             * questo, `reasoning` non arriva MAI al modello (il kernel lo
             * accetta da tempo, vedi `talosHarness.mjs` — TALOS-BANCO
             * semplicemente non lo passava mai, per scelta dichiarata li').
             * Per un modello con ragionamento OBBLIGATORIO e un default
             * costoso (es. `z-ai/glm-5.3-flash`, default dichiarato `max`
             * nel suo stesso catalogo), questo significa correre sempre al
             * default del PROVIDER, mai a quello scelto qui — e l'owner ha
             * chiesto esplicitamente «ragionamento basso o medio».
             *
             * ⛔ Opt-in, non un default nuovo: senza la variabile
             * d'ambiente il comportamento resta bit-per-bit quello di
             * sempre (nessun campo `reasoning` nel corpo) — stessa
             * disciplina gia' usata per ogni altro parametro opzionale di
             * `talosLavora` in questo file.
             */
            const effort = String(process.env.BANCO_EFFORT ?? '').trim()
            /*
             * ⭐⭐⭐ `BANCO_ELENCO_PROFONDO`, 10/09 — P-13, e la ragione per cui esiste questa leva.
             *
             * ⛔ IL BANCO NON PASSA DA `agent-service.mjs`: chiama `talosLavora` DIRETTAMENTE, qui.
             *   P-13 è agganciato là (fra RunStarted e talosLavora, l'unico punto dove un await non
             *   rompe l'ordine degli eventi) ⇒ senza questa riga l'elenco dei file NON arriverebbe
             *   mai al banco, il «dopo» misurerebbe esattamente il «prima», e due numeri identici
             *   direbbero che P-13 non serve. Sarebbe una conclusione FALSA per un motivo di
             *   cablaggio, scoperta dopo ~10 ore di corsa e $1,67.
             *
             * ⛔ Opt-in, come `BANCO_EFFORT` qui sopra e per la stessa ragione: senza la variabile
             *   il comportamento resta bit-per-bit quello di sempre. È ciò che rende possibile un
             *   prima/dopo onesto — stesso codice, stesso corpus, stesso modello, cambia UNA leva.
             *
             * ⛔ E se l'elenco non si costruisce NON si salta il task: si corre senza, come prima.
             *   Un task che fallisce per un elenco mancante entrerebbe nella misura come se il
             *   modello avesse sbagliato — cioè falserebbe proprio il numero che stiamo misurando.
             */
            let contestoDelProgetto
            if (String(process.env.BANCO_ELENCO_PROFONDO ?? '').trim() === '1') {
                const dove = process.env.TALOS_MODULO_ELENCO
                    ?? 'C:/Users/Antonino/Desktop/projects/AVM-harness-desktop/harness-ui/src/contesto-del-progetto.mjs'
                const doveFiltro = process.env.TALOS_MODULO_GITIGNORE
                    ?? 'C:/Users/Antonino/Desktop/projects/AVM-harness-desktop/harness-ui/src/gitignore-elenco.mjs'
                try {
                    const { contestoDelProgetto: costruisci } = await import(pathToFileURL(dove).href)
                    const { creaFiltroGitignore } = await import(pathToFileURL(doveFiltro).href)
                    const elenco = await costruisci({ cartella, creaFiltro: (radice) => creaFiltroGitignore({ radice }) })
                    contestoDelProgetto = elenco?.testo
                } catch (errore) {
                    // Si dichiara e si continua: un task perso vale meno di un task falsato.
                    console.error('[banco] elenco profondo non costruito:', errore?.message ?? errore)
                }
            }
            return talosLavora({
                cartella,
                task,
                modello: MODELLO_DEL_BANCO.anthropic,
                chiave: CHIAVE_DALLA_CUSTODIA || CHIAVI_DI_WINDOWS.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY,
                comandoProva: task.comando ?? 'npm test',
                ...(effort ? { reasoning: { effort } } : {}),
                ...(contestoDelProgetto ? { contestoDelProgetto } : {}),
            })
        },
    },
    /*
     * ⭐⭐⭐ DSH — DEEPSEEK HARNESS, e la riga che mancava da quattro giorni.
     *
     * ## ⛔⛔ Perche non c'era: l'avevo escluso io, su una premessa FALSA
     *
     * `O04` del 2026-08-17, scritta da me:
     *
     *     «i suoi comandi sono doctor, chat, probe, validate, estimate:
     *      nessun agent loop, nessuno strumento che scriva file. E un CLI di
     *      protocollo, non un agente di coding.»
     *
     * ⛔ E contraddiceva un audit del SORGENTE fatto due giorni prima, il 15/8,
     * a commit congelato (`47f94385`, `dsh-root 0.1.0-rc.5`), che concludeva
     * l'opposto: «non e un piccolo wrapper: e gia una piattaforma agentica
     * modulare completa». Ho creduto alla mia occhiata invece che alla misura.
     *
     * Misurato il 2026-08-21 con `dsh --profile headless --dump-config`:
     *
     *     tool-fs · tool-fs-search · tool-bash · tool-jobs
     *     sandbox-local + sandbox-policy (workspace-write, radice = cwd)
     *     permission-presets: read-only / workspace-write / danger-full-access
     *     subagent (spawn + fork) · plan-mode · skill · compaction · token-meter
     *
     * ⇒ Scrive file, esegue comandi, ha una sandbox e i sotto-agenti.
     *
     * ## ⛔ La seconda ragione era falsa anche quella
     *
     * `pilota.mjs` diceva «DSH gira solo su DeepSeek, quindi il confronto
     * attraversa modelli diversi» — cioe: escluso per PROTEGGERE la parita.
     * La documentazione dice il contrario: il plugin `llm-pi-ai`, **gia montato
     * nel profilo headless**, accetta qualunque endpoint compatibile OpenAI.
     * La configurazione sta in `$DSH_HOME/settings.yaml` piu un override
     * mirato in `cordis.patch.yml`, perche `agent-default-model` porta il suo
     * default dentro l'albero del profilo e settings.yaml da solo non lo tocca.
     *
     * ## ⛔⛔ LA CHIAVE DEEPSEEK SI TOGLIE, e non e prudenza
     *
     * Dentro WSL `DEEPSEEK_API_KEY` **c'e gia**, messa li da chi ha installato
     * dsh. Se la si lascia, una configurazione sbagliata non fallisce: ricade
     * in silenzio sul modello di casa, e il banco misura DeepSeek credendo di
     * misurare un harness. ⇒ Togliendola, un successo PROVA che e passato da
     * OpenRouter invece di lasciarcelo dedurre.
     *
     * ⭐ E cosi e stata fatta la prova a vuoto del 21/8: senza chiave DeepSeek,
     * su una cartella temporanea di Windows vista come `/mnt/c/...`, DSH ha
     * corretto il file e chiuso con 0 in **10,1 s**.
     *
     * ## Perche WSL2, e come ci arriva la chiave
     *
     * DSH dipende da `node-pty`, cioe da un PTY POSIX vero: su Windows meta del
     * suo comportamento non esiste. ⛔ E le variabili di Windows non entrano in
     * WSL da sole: serve `WSLENV`, che nomina quali attraversano il confine.
     * ⇒ La chiave viaggia nell'ambiente, mai in `argv` e mai su disco.
     */
    {
        nome: 'dsh',
        dove: 'WSL2',
        disponibile() {
            const wsl = spawnSync('wsl.exe', ['-d', 'Ubuntu', '--', 'bash', '-c',
                'export PATH="$HOME/.local/node/bin:$PATH"; command -v dsh'],
            { encoding: 'utf8', timeout: 30_000, windowsHide: true })
            return wsl.status === 0 && String(wsl.stdout || '').trim() !== ''
        },
        perche() {
            /*
             * ⛔ I motivi si distinguono, e non e una gentilezza: «non c'e WSL»,
             * «non c'e dsh» e «non c'e la chiave» si curano in tre modi
             * diversi, e un solo «non disponibile» costringe chi legge a
             * indovinare quale dei tre. Vedi D03 — escludere, non bocciare.
             */
            const wsl = spawnSync('wsl.exe', ['-l', '-q'],
                { encoding: 'utf8', timeout: 30_000, windowsHide: true })
            if (wsl.status !== 0) return 'WSL2 non risponde — dsh vuole un PTY POSIX vero'
            if (!this.disponibile()) return 'dsh non installato in WSL (Ubuntu)'
            if (!(CHIAVE_DALLA_CUSTODIA || CHIAVI_DI_WINDOWS.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY)) {
                return 'manca OPENROUTER_API_KEY'
            }
            /*
             * ⛔ La parita di modello vale per tutti, e per un concorrente vale
             * DOPPIO: farlo correre sul suo modello di casa mentre gli altri
             * corrono sul nostro sarebbe un banco truccato — e non si saprebbe
             * nemmeno in che direzione.
             */
            if (!passaDaOpenRouter()) return 'dsh corre solo con BANCO_PROVIDER=openrouter'
            return null
        },
        async lavora({ cartella, task }) {
            const chiave = CHIAVE_DALLA_CUSTODIA || CHIAVI_DI_WINDOWS.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY
            const tradotto = spawnSync('wsl.exe',
                ['-d', 'Ubuntu', '--', 'wslpath', '-a', cartella.split('\\').join('/')],
                { encoding: 'utf8', timeout: 30_000, windowsHide: true })
            const dentro = String(tradotto.stdout || '').trim()
            if (!dentro) {
                return {
                    detto: '', fuori: '', errori: `wslpath non ha tradotto ${cartella}`,
                    ms: 0, piantato: false, codice: 1, credenzialiEsaurite: false, limitatoDalFornitore: false,
                }
            }
            /*
             * ⛔⛔⛔ LA CONSEGNA NON ENTRA NELLA RIGA DI COMANDO. MAI.
             *
             * Misurato il 2026-08-21, alla prima prova a vuoto. Passandola con
             * `JSON.stringify` — cioe fra VIRGOLETTE DOPPIE — bash ci fa dentro
             * la sostituzione di comando, e il task `sconto-a-scaglioni`, che
             * cita `scontoAScaglioni(centesimi, scaglioni)` fra backtick, e
             * diventato questo:
             *
             *     /bin/bash: syntax error near unexpected token `centesimi,'
             *     /bin/bash: line 1: scaglioni: command not found
             *     /bin/bash: line 1: da: command not found
             *
             * ⇒ DSH ha ricevuto una consegna MUTILATA, e avrebbe segnato un
             * fallimento che era tutto nostro. E la lezione era gia pagata:
             * `corsa.mjs` la porta scritta addosso per `cmd.exe` — «shell: true
             * farebbe passare la consegna, che contiene virgolette e apici,
             * attraverso cmd.exe». L'ho ripetuta con bash.
             *
             * ## ⛔⛔⛔ E LA PRIMA CURA NON FUNZIONAVA — misurato il 2026-08-21
             *
             * Avevo scritto qui che la consegna viaggiava in una variabile
             * d'ambiente e si espandeva con `"$VAR"`, «quindi bash non la
             * ri-analizza». Dichiarato curato. **Falso.**
             *
             * La sonda che l'ha smentito, mandando `A \`eco\` B $(date) C ${HOME} D`:
             *
             *     1. `env` dentro WSL, nessuna shell   → INTATTA
             *     2. attraverso `bash -c "printf %s \\"$VAR\\""` → «A  B Fri Aug 21 … C /root D»
             *     3. `printf %s <testo>` SENZA nessuna shell   → rimasticata lo stesso
             *
             * ⇒ La riga 3 e quella che chiude il caso: **e `wsl.exe` stesso** a
             * valutare la propria riga di comando. Non c'e nessuna forma di
             * quoting che salvi un testo passato di li — ne le virgolette, ne
             * una variabile letta dentro la riga, ne l'assenza di shell.
             *
             * ## La cura vera: il testo NON compare sulla riga di comando
             *
             * Si scrive un COPIONE dentro WSL, con la consegna in un heredoc dal
             * delimitatore **quotato** — `<<'FINE'`, e allora bash non espande
             * niente. Sulla riga di comando resta solo un percorso di caratteri
             * innocui.
             *
             * Provato con backtick, `$(date)`, `${HOME}`, virgolette, apici e
             * una barra rovescia: arriva **byte per byte**.
             *
             * ⛔ La chiave invece NON entra nel copione: un segreto non si
             * scrive su disco. Viaggia nell'ambiente, dove la prova n. 1 dimostra
             * che arriva intatto, e non tocca mai ne la riga ne un file.
             */
            const FINE = 'CONSEGNA_DEL_BANCO_FINE'
            const consegna = String(task.consegna ?? '')
            if (consegna.includes(FINE)) {
                return {
                    detto: '', fuori: '', errori: 'il delimitatore compare nella consegna',
                    ms: 0, piantato: false, codice: 1, credenzialiEsaurite: false, limitatoDalFornitore: false,
                }
            }
            const casa = mkdtempSync(join(tmpdir(), 'banco-dsh-'))
            const casaWsl = String(spawnSync('wsl.exe',
                ['-d', 'Ubuntu', '--', 'wslpath', '-a', casa.split('\\').join('/')],
                { encoding: 'utf8', timeout: 30_000, windowsHide: true }).stdout || '').trim()

            /*
             * ⛔⛔⛔ IL MODELLO GLIELO DICE IL BANCO, A OGNI CORSA.
             *
             * Misurato il 2026-08-21: con `BANCO_MODELLO=openai/gpt-oss-20b`,
             * dsh rispondeva
             *
             *     «qwen/qwen3.7-flash is temporarily rate-limited upstream»
             *
             * ⇒ Girava su qwen. La parita che avevo dichiarato **non esisteva**:
             * il modello stava scritto nella SUA configurazione — `settings.yaml`
             * piu `cordis.patch.yml`, messi li da me una volta sola — e quella
             * e una SECONDA FONTE DI VERITA che non segue `MODELLO_DEL_BANCO`.
             *
             * ⛔ Una configurazione scritta una volta e poi dimenticata e
             * peggio di nessuna configurazione: sembra parita e non lo e, e non
             * lo dice nessuno finche non arriva un errore che nomina il modello.
             *
             * ⇒ Si usa `--patch`, che il CLI documenta come «extra patch-list
             * overlay applied after the profile layer»: un file scritto **per
             * questa corsa**, con dentro il modello di **questa corsa**. Sulla
             * riga di comando finisce solo il suo percorso.
             */
            /*
             * ⭐⭐⭐ UNA CASA DSH TUTTA DELLA CORSA — e cosi la seconda fonte di
             * verita smette di esistere invece di essere sovrascritta.
             *
             * ## ⛔ Perche il `--patch` da solo non basta, misurato
             *
             * La precedenza documentata e: bundle → patch del profilo → patch
             * utente → **overlay `--patch`**. Quindi il patch vince, e infatti
             * il modello cambiava. Ma il CATALOGO DEI FORNITORI non vive
             * nell'albero dei plugin: lo legge a runtime `dsh-settings-file` da
             * `$DSH_HOME/settings.yaml`. Il patch non lo raggiunge:
             *
             *     dsh: UNKNOWN_MODEL: pi-ai provider "openrouter"
             *          has no configured model "openai/gpt-oss-20b"
             *
             * ## ⇒ Non si sovrascrive la sua casa: gliene si da una nuova
             *
             * `DSH_HOME` e una variabile d'ambiente, e le variabili arrivano
             * intatte dentro WSL (provato). ⇒ Ogni corsa ha la sua casa, scritta
             * adesso, buttata dopo. Niente stato globale, niente configurazione
             * lasciata li da ieri, niente due corse che si pestano i piedi.
             *
             * ⭐ E si guadagna una cosa che vale piu della parita: la
             * RIPRODUCIBILITA. Chi rifa la corsa domani parte dalla stessa casa
             * vuota, non da quella che ho configurato io stamattina.
             *
             * ⛔ La chiave NON entra nel file: `apiKeyEnv` ne nomina soltanto la
             * variabile, e il valore resta nell'ambiente. Un segreto non si
             * scrive su disco.
             */
            const casaDsh = join(casa, 'dsh-home')
            mkdirSync(casaDsh, { recursive: true })
            writeFileSync(join(casaDsh, 'settings.yaml'), [
                '# Scritto dal banco a OGNI corsa, in una casa usa-e-getta.',
                '# Il modello e quello del BANCO: vedi harness.mjs.',
                'llm-pi-ai:',
                '  defaultProvider: openrouter',
                `  defaultModel: ${MODELLO_DEL_BANCO.anthropic}`,
                '  providers:',
                '    openrouter:',
                '      apiKeyEnv: OPENROUTER_API_KEY',
                '      api: openai-completions',
                '      baseURL: https://openrouter.ai/api/v1',
                /*
                 * ⛔⛔⛔ QUESTA RIGA C'ERA, E MISURATA IL 28/8 ROMPEVA OGNI CORSA.
                 *
                 * Scritta il 2026-08-21 per `openai/gpt-oss-20b` (che RIFIUTA
                 * il ragionamento disattivato: `INVALID_REQUEST: Reasoning is
                 * mandatory for this endpoint and cannot be disabled`) —
                 * `reasoning: high` era la cura per QUEL modello. Il banco è
                 * passato a `qwen/qwen3.7-flash` da allora, mai riletta questa
                 * riga contro il modello nuovo: FASE C (28/8, prima corsa vera
                 * DSH contro il corpus) ha misurato **4 righe su 4 fallite in
                 * 7-10s, zero file toccati**, tutte con lo STESSO errore:
                 *
                 *     dsh: UNSUPPORTED_REASONING_EFFORT: pi-ai provider
                 *          "openrouter" model "qwen/qwen3.7-flash" does not
                 *          support reasoning effort "high"
                 *
                 * ⇒ Esattamente la "seconda fonte di verità scritta una volta
                 * e poi dimenticata" di cui parla il commento sopra — qui,
                 * non nella configurazione di dsh: **in questo stesso file**.
                 * Un fallimento a 8 secondi con zero cambiamenti non è DSH
                 * che perde il confronto: è il banco che non lascia partire
                 * la corsa. Rimossa: senza, la casa non forza nessun valore
                 * di ragionamento, e il modello sceglie il suo default.
                 * Riverificare quando il modello del banco cambia di nuovo —
                 * non è detto che resti giusto per sempre.
                 */
                '      models:',
                `        - id: ${MODELLO_DEL_BANCO.anthropic}`,
                '',
            ].join('\n'), { encoding: 'utf8' })

            /*
             * ⛔⛔ E SERVE ANCHE IL PATCH: i due file fanno LAVORI DIVERSI.
             *
             * Misurato, con la casa pulita ma senza patch:
             *
             *     dsh: MISSING_CREDENTIAL: llm-deepseek: no API key for
             *          provider route "deepseek-official"
             *
             * ⇒ `settings.yaml` porta il CATALOGO dei fornitori;
             * `agent-default-model` dice quale l'agente usa per difetto, e in un
             * profilo appena nato quello e `deepseek-official`. Una casa pulita
             * non basta: bisogna anche dirle dove andare.
             *
             * ⭐ Ed e la casa pulita che ha reso VISIBILE questa dipendenza:
             * prima il profilo ereditava la configurazione che avevo scritto a
             * mano una volta, e sembrava che bastasse.
             */
            writeFileSync(join(casa, 'modello.yml'), [
                '# Scritto dal banco a OGNI corsa. Vedi harness.mjs.',
                '- id: agent-default-model',
                '  config:',
                '    provider: openrouter',
                `    model: ${MODELLO_DEL_BANCO.anthropic}`,
                '',
            ].join('\n'), { encoding: 'utf8' })

            writeFileSync(join(casa, 'copione.sh'), [
                '#!/bin/bash',
                // ⛔ La riga che rende la prova falsificabile: senza chiave
                // DeepSeek, un successo PROVA che e passato da OpenRouter.
                'unset DEEPSEEK_API_KEY',
                'export PATH="$HOME/.local/node/bin:$PATH"',
                // ⛔ La casa e della corsa: vedi il commento sopra.
                `export DSH_HOME=${casaWsl}/dsh-home`,
                `cd ${dentro}`,
                `read -r -d '' BANCO_CONSEGNA <<'${FINE}' || true`,
                consegna,
                FINE,
                `dsh --profile headless --patch ${casaWsl}/modello.yml "$BANCO_CONSEGNA"`,
                '',
            ].join('\n'), { encoding: 'utf8' })

            const uscita = await lancia('wsl.exe',
                ['-d', 'Ubuntu', '--', 'bash', `${casaWsl}/copione.sh`], {
                    cartella,
                    scadenzaMs: SCADENZA_HARNESS_MS,
                    ambiente: {
                        OPENROUTER_API_KEY: chiave,
                        WSLENV: 'OPENROUTER_API_KEY/u',
                    },
                })
            buttaLaCopia(casa)
            return { detto: testoDetto(uscita), ...uscita }
        },
    },
])

/**
 * ⭐⭐⭐ LA VARIANTE COMPRESSA — lo stesso harness dietro un proxy che comprime.
 *
 * ## Cosa fa Headroom, e perché ci riguarda
 *
 * Comprime tutto ciò che va verso il modello — uscite degli strumenti, log,
 * file, storia — prima che arrivi. Dichiara **92%** su una ricerca di codice
 * (17.765 → 1.408 token) e **−31,7%** in uscita.
 *
 * ⇒ Ci riguarda perché il traguardo scelto dall'owner ha un vincolo che sembra
 * insuperabile: **l'onestà costa giri, e i giri costano soldi** — i due harness
 * onesti del 2026-08-17 erano i due più cari (8× e 250× il migliore). Se il
 * contesto di ogni giro costasse un decimo, quel vincolo si allenterebbe: è il
 * pezzo che manca per vincere su tutti e quattro gli assi insieme.
 *
 * ## ⛔ E cosa NON sappiamo, che è esattamente il nostro spazio
 *
 * I loro numeri di accuratezza sono su **GSM8K, TruthfulQA, SQuAD, BFCL** —
 * domande e risposte. Nessuno di quei banchi ha un agente che modifica file,
 * rilegge il risultato e decide il passo dopo.
 *
 * ⇒ La domanda che il nostro banco sa fare e i loro no: **comprimere fa perdere
 * task?** Il rischio non è che comprima poco: è che l'agente, privato di un
 * pezzo di contesto, sbagli — e lo si vede solo con un verdetto meccanico su
 * task veri, contando anche le manomissioni e l'onestà sull'impossibile.
 *
 * ## Come funziona qui
 *
 * Il proxy è **una sola variabile d'ambiente**, quindi la variante è pulita:
 * stesso harness, stesso modello, stesso corpus, sola variabile il proxy. E
 * gira nella stessa corsa dell'originale, così il confronto è appaiato task per
 * task invece che fra due corse in momenti diversi.
 *
 * ⛔ Il proxy va avviato a parte (`headroom proxy --port 8787`). Se non
 * risponde, la variante viene ESCLUSA e dichiarata — mai bocciata: una
 * variante «compressa» che gira senza proxy misurerebbe l'harness nudo e lo
 * chiamerebbe compresso.
 */
export const PROXY_HEADROOM = 'http://127.0.0.1:8787'

export function proxyVivo(url = PROXY_HEADROOM) {
    const esito = spawnSync(process.execPath, ['-e',
        `fetch(${JSON.stringify(`${url}/health`)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))`,
    ], { timeout: 15_000, windowsHide: true })
    return esito.status === 0
}

/** Lo stesso harness, con il traffico instradato attraverso il proxy. */
export function conHeadroom(base) {
    return {
        nome: `${base.nome}+hr`,
        pacchetto: base.pacchetto,
        conProxy: true,
        disponibile() { return base.disponibile.call(base) },
        perche() {
            const suo = base.perche ? base.perche.call(base) : null
            if (suo) return suo
            return proxyVivo() ? null : 'proxy headroom non attivo'
        },
        async lavora(argomenti) {
            /*
             * ⛔⛔ SI INSTRADA CON UNA VARIABILE DI MODULO, non toccando
             * `process.env` attorno alla chiamata.
             *
             * La prima versione faceva così, ed era rotta in un modo che
             * rileggendo sembrava a posto: `base.lavora` è **async**, quindi il
             * `finally` ripristinava l'ambiente prima che il processo figlio
             * fosse creato. A volte il proxy sarebbe stato usato, a volte no —
             * e la variante «compressa» avrebbe misurato l'harness nudo senza
             * dirlo. È la terza forma dei miei difetti: la modifica che sembra
             * applicata.
             *
             * ⇒ `lancia()` legge questa variabile nel momento esatto in cui
             * costruisce l'ambiente del figlio, e l'`await` qui garantisce che
             * il ripristino avvenga solo a processo finito.
             */
            instradaVerso(PROXY_HEADROOM)
            try {
                return await base.lavora.call(base, argomenti)
            } finally {
                instradaVerso(null)
            }
        },
    }
}

/**
 * ⭐ Tutti, comprese le varianti compresse.
 *
 * ⛔ Le varianti girano nella STESSA corsa degli originali, non in una corsa
 * separata: il confronto A/B fatto in due momenti diversi confonde l effetto
 * del proxy con tutto cio che cambia fra le due corse — carico della macchina,
 * stato della cache lato provider, ora del giorno.
 */
/*
 * ⛔⛔ CHI NON PUO' AVERE UNA VARIANTE COMPRESSA, e perche non e un dettaglio.
 *
 * Il proxy si innesta con **una sola variabile**, `ANTHROPIC_BASE_URL`. Chi non
 * la legge non viene instradato — e allora `X+hr` sarebbe X, corso due volte.
 *
 * ⇒ Un A/B in cui i due rami sono lo stesso ramo non da «nessuna differenza»:
 * da una differenza FINTA di puro rumore, che nel rapporto sembra una misura.
 * E costa il doppio dei soldi per non dire niente.
 *
 * `dsh` parla con OpenRouter attraverso il SUO `llm-pi-ai`, con un `baseURL`
 * suo: la nostra variabile non la guarda nemmeno. ⇒ Fuori, e dichiarato.
 */
const SENZA_VARIANTE = Object.freeze(['(nessuno)', 'codex', 'dsh'])

export const HARNESS_CON_VARIANTI = Object.freeze([
    ...HARNESS,
    ...HARNESS.filter((h) => !SENZA_VARIANTE.includes(h.nome)).map(conHeadroom),
])

/**
 * Quelli davvero lanciabili qui e ora, e **perché** gli altri no.
 *
 * ⛔⛔ LA RAGIONE VA DETTA, e non è una gentilezza.
 *
 * Un harness installato ma senza credenziali parte, muore in mezzo secondo e
 * lascia un `fallito` che nel rapporto è indistinguibile da un harness che ci
 * ha provato davvero. È lo stesso difetto dello `spawn npm ENOENT` di stamattina
 * — un ostacolo del banco travestito da esito — e la stessa lezione di quando
 * metà delle capacità era giù e il resoconto taceva.
 *
 * ⇒ Chi non può correre viene ESCLUSO e dichiarato, non bocciato.
 */
export function harnessDisponibili() {
    const dentro = []
    const fuori = []
    for (const h of HARNESS_CON_VARIANTI) {
        const perche = h.perche ? h.perche() : (h.disponibile() ? null : 'non installato')
        if (perche === null) dentro.push(h)
        else fuori.push({ nome: h.nome, perche })
    }
    return { dentro, fuori }
}

/**
 * L'adattatore per `corriUnTask`, che vuole una funzione che torni una stringa.
 *
 * Tiene da parte il resto — millisecondi, se si è piantato — in `ultimaCorsa`,
 * perché quei numeri servono al rapporto e `corriUnTask` non li chiede.
 */
export function attacca(harness) {
    const memoria = { ultima: null }
    const lavora = async ({ cartella, task }) => {
        const esito = await harness.lavora({ cartella, task })
        memoria.ultima = esito
        return esito.detto
    }
    return { lavora, memoria }
}
