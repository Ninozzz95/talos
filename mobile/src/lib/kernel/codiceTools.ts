import { z } from 'zod'
import { defineTalosTool, type TalosPremessaEsito, type TalosToolDefinition } from '@/lib/tools/registry'
import { costruisciCatalogo, risolviSimbolo, type TalosCatalogo, type TalosElencoFile, type TalosSorgente } from '@/lib/kernel/catalogo'
import { sostituisciEsistente } from '@/lib/kernel/mutazione'
import type { TalosLibreriaStandard } from '@/lib/kernel/semantica'

/**
 * ⭐⭐⭐ GLI ATTREZZI DEL CODICE — dove il kernel diventa una cosa che il modello
 * può usare.
 *
 * ## ⛔ Perché si indirizza per NOME e non per stringa da sostituire
 *
 * Quasi tutti gli agenti di coding oggi espongono `edit_file(old, new)`: si dà
 * il testo vecchio e quello nuovo, e il runtime cerca il primo. È fragile in tre
 * modi che si vedono solo su un progetto vero:
 *
 * - **gli spazi**: un'indentazione diversa e la ricerca fallisce;
 * - **i duplicati**: due occorrenze identiche e si sostituisce la prima, che può
 *   non essere quella giusta — in silenzio;
 * - **non c'è premessa**: se il testo non si trova, non si sa se il bersaglio
 *   non esista o se sia solo scritto diversamente.
 *
 * ⇒ Qui il bersaglio è una **dichiarazione risolta dal compilatore**: `nome` in
 * `file`. Due dichiarazioni con lo stesso nome non diventano «la prima»: sono
 * un'ambiguità dichiarata, e la modifica si ferma.
 *
 * ## ⛔ E il percorso è parte dell'autorità
 *
 * Il percorso arriva dal modello, e il modello è una sorgente non fidata. Un
 * `../` che esce dallo spazio di lavoro non è un errore da segnalare: è una
 * richiesta che non deve nemmeno essere formulabile.
 */

/**
 * Da dove arrivano i file, e dove tornano.
 *
 * ⛔ Sta FUORI di proposito: su un telefono i sorgenti arrivano dallo Storage
 * Access Framework, su un desktop da un filesystem, nei test da una mappa.
 * Legare il kernel a uno dei tre lo renderebbe inutile negli altri due.
 */
/**
 * Che cosa si è riusciti a leggere dello spazio di lavoro.
 *
 * ⛔⛔ `elenco` non è un dettaglio di comodo: senza, una sorgente che tronca —
 * per un tetto, per una cartella illeggibile — produce cataloghi che dicono
 * ASSENTE su file che esistono. La coppia deve viaggiare **insieme**, o il
 * chiamante dimentica di chiedere.
 */
export interface TalosLetturaSpazio {
    sorgenti: readonly TalosSorgente[]
    elenco: TalosElencoFile
}

export interface TalosFontiCodice {
    /** Tutti i sorgenti dello spazio di lavoro, con percorsi relativi. */
    leggiSpazio(): Promise<TalosLetturaSpazio>
    /** Scrive l'albero promosso. Chiamata SOLO dopo che i cancelli hanno detto sì. */
    scrivi(sorgenti: readonly TalosSorgente[]): Promise<void>
    /** La libreria standard, se disponibile — senza, la garanzia si restringe. */
    libreria?(): Promise<TalosLibreriaStandard | null>
}

/**
 * ⛔⛔ IL CANCELLO SUL PERCORSO, e viene prima di tutto il resto.
 *
 * Un percorso assoluto, un `..` che risale, un separatore di Windows: nessuno di
 * questi è una richiesta legittima dentro uno spazio di lavoro. E non si
 * «normalizza per essere gentili»: si rifiuta, perché normalizzare un tentativo
 * di uscita significa eseguirlo in una forma più pulita.
 */
export function percorsoAmmesso(grezzo: string): string | null {
    const percorso = grezzo.trim()
    if (!percorso) return null
    if (percorso.includes('\\')) return null
    /*
     * ⛔ RIDONDANTE, e resta. Una mutazione l'ha dimostrato: togliendo questa
     * riga nessun test diventa rosso, perché `/etc/passwd` si spezza in
     * `['', 'etc', 'passwd']` e il segmento vuoto lo ferma comunque.
     *
     * ⇒ Su un cancello che confina non si toglie la seconda serratura perché la
     * prima tiene. Il giorno in cui qualcuno allentasse la regola dei segmenti —
     * per far passare un caso legittimo — questa continuerebbe a reggere.
     * Ridondanza in una guardia è difesa in profondità, non peso morto.
     */
    if (percorso.startsWith('/')) return null
    // Windows: `C:` all'inizio.
    if (/^[a-z]:/i.test(percorso)) return null
    const pezzi = percorso.split('/')
    if (pezzi.some((p) => p === '..' || p === '.' || p === '')) return null
    return pezzi.join('/')
}

/**
 * La premessa di `coding_edit_existing`: **il bersaglio esiste?**
 *
 * ⛔ Chiesta PRIMA della scheda di consenso: se la funzione non c'è, non ha senso
 * far autorizzare una modifica che non può riuscire.
 */
/**
 * Dove resta il catalogo fra una domanda e l'altra.
 *
 * ⛔ È una cache, non una fonte: il testo si riconfronta **sempre** con quello
 * appena letto dallo spazio di lavoro. Se un file cambia fuori da TALOS — un
 * altro editor, un `git checkout` — la voce vecchia non viene riusata, perché
 * il testo non coincide più. Non c'è un momento in cui il catalogo parli al
 * posto del disco.
 */
export interface TalosCacheCatalogo { ultimo?: TalosCatalogo }

export async function premessaBersaglio(
    fonti: TalosFontiCodice,
    file: string,
    nome: string,
    cache?: TalosCacheCatalogo,
): Promise<TalosPremessaEsito> {
    const percorso = percorsoAmmesso(file)
    if (!percorso) {
        return {
            stato: 'assente',
            perche: `"${file}" is not a valid path inside the workspace`,
            copertura: 'completa',
            fatto: { famiglia: 'symbol-declared', nome, ambito: file },
        }
    }
    let letto: TalosLetturaSpazio
    try {
        letto = await fonti.leggiSpazio()
    }
    catch {
        return {
            stato: 'ignoto',
            perche: 'the workspace could not be read',
            fatto: { famiglia: 'symbol-declared', nome, ambito: percorso },
        }
    }
    const catalogo = await costruisciCatalogo(letto.sorgenti, { precedente: cache?.ultimo, elenco: letto.elenco })
    if (cache) cache.ultimo = catalogo
    return risolviSimbolo(catalogo, nome, percorso)
}

export function talosCodiceTools(fonti: TalosFontiCodice): readonly TalosToolDefinition<never>[] {
    /*
     * ⭐ Uno per set di attrezzi, condiviso fra la premessa e la postcondizione.
     *
     * Misurato sul sorgente vero di TALOS: **508 ms** a costruzione fredda,
     * **2 ms** con un file cambiato. Senza questo, ogni domanda «esiste?» paga
     * mezzo secondo su un computer — e su un telefono ben di più, tutto speso
     * PRIMA che alla persona venga chiesto se autorizza.
     */
    const cache: TalosCacheCatalogo = {}
    return [
        defineTalosTool({
            name: 'coding_edit_existing',
            title: 'Edit existing code',
            /*
             * ⛔ La descrizione dice al modello ciò che NON può fare, perché è la
             * cosa che proverebbe a fare: se il simbolo non c'è, la tentazione è
             * crearlo «per aiutare». Qui non è possibile, e dirglielo gli
             * risparmia un giro sprecato.
             */
            description: [
                'Replace a declaration that ALREADY EXISTS in the workspace, addressed by its name.',
                'It NEVER creates the declaration when it is absent: use a create tool for that.',
                'The change is rejected if it would introduce references to things that do not exist.',
            ].join(' '),
            action: 'write',
            requiredActions: ['read', 'write'],
            /*
             * ⛔⛔ `reject` e non il difetto: su una capacità del telefono «non
             * riesco a provare che la torcia sia spenta» può ancora consentire un
             * comando idempotente. Su «questa funzione esiste ed è il bersaglio
             * che sto per sostituire?» un dubbio **non autorizza una mutazione
             * strutturale**.
             */
            premiseUnknownPolicy: 'reject',
            input: z.object({
                file: z.string().min(1).max(1024).describe('Workspace-relative path, e.g. src/prezzo.ts'),
                nome: z.string().min(1).max(256).describe('The declaration to replace.'),
                codice: z.string().min(1).max(100_000).describe('The complete new declaration.'),
            }),
            premesse: (input) => {
                const i = input as { file: string, nome: string }
                return premessaBersaglio(fonti, i.file, i.nome, cache)
            },
            async run(input) {
                const i = input as { file: string, nome: string, codice: string }
                const percorso = percorsoAmmesso(i.file)
                if (!percorso) {
                    return { ok: false, content: `"${i.file}" is not a valid workspace path.`, code: 'TALOS_CODE_PATH_REFUSED' }
                }

                const { sorgenti } = await fonti.leggiSpazio()
                const libreria = (await fonti.libreria?.()) ?? undefined
                const esito = await sostituisciEsistente(sorgenti, { percorso, nome: i.nome }, i.codice, libreria)

                if (esito.stato === 'rifiutata') {
                    return {
                        ok: false,
                        content: esito.messaggio,
                        code: `TALOS_CODE_${esito.perche.toUpperCase()}`,
                        /* ⛔ Niente è cambiato: il segno «✓ Fatto» non deve comparire. */
                        senzaEffetto: true,
                    }
                }

                /*
                 * ⛔ La scrittura avviene QUI e solo qui, dopo che tutti e due i
                 * cancelli hanno detto sì. Chi legge questa funzione deve poter
                 * vedere in una schermata che non esiste un'altra via.
                 */
                await fonti.scrivi(esito.sorgenti)
                return {
                    ok: true,
                    content: `Replaced "${i.nome}" in ${percorso}.`,
                    evidence: { percorso, prima: esito.diff.prima.length, dopo: esito.diff.dopo.length },
                }
            },
            /*
             * ⭐ La postcondizione: la dichiarazione nuova è DAVVERO nel file?
             *
             * ⛔ Rilegge dallo spazio di lavoro, non dal risultato di `run`: se la
             * scrittura si è persa a metà — processo ucciso, permesso revocato —
             * `run` avrebbe già detto «fatto».
             */
            async verify(input) {
                const i = input as { file: string, nome: string }
                const percorso = percorsoAmmesso(i.file)
                if (!percorso) return { held: false, reason: 'the path is not valid' }
                try {
                    const letto = await fonti.leggiSpazio()
                    const catalogo = await costruisciCatalogo(letto.sorgenti, { precedente: cache.ultimo, elenco: letto.elenco })
                    cache.ultimo = catalogo
                    const dopo = risolviSimbolo(catalogo, i.nome, percorso)
                    return dopo.stato === 'presente'
                        ? { held: true }
                        : { held: false, reason: `"${i.nome}" is not in ${percorso} after the change` }
                }
                catch {
                    /* ⛔ Non poter rileggere non è la prova che la scrittura non
                     * sia avvenuta: si dichiara il dubbio invece di negare. */
                    return { held: false, reason: 'the workspace could not be re-read to confirm the change' }
                }
            },
        }) as TalosToolDefinition<never>,
    ]
}
