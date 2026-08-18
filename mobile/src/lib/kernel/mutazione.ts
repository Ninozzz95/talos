import type * as TS from 'typescript'
import { caricaCompilatore, ESTENSIONI_SORGENTE, estensioneDi, genereDi } from '@/lib/kernel/simboli'
import { cancelloSemantico, type TalosLibreriaStandard } from '@/lib/kernel/semantica'
import type { TalosSorgente } from '@/lib/kernel/catalogo'

/**
 * ⭐⭐⭐ LA MUTAZIONE — dove le due garanzie diventano un effetto, o niente.
 *
 * È la fetta verticale che attraversa tutto: catalogo, span esatto, cancello
 * semantico, esito. Prima di questo file esistevano i pezzi e non li usava
 * nessuno — che è il modo più comodo di credere di aver costruito una cosa.
 *
 * ```
 * G1  il bersaglio esiste?        → se no, NIENTE si tocca
 * ␣   si costruisce il candidato IN MEMORIA
 * G2  introduce riferimenti rotti? → se sì, NIENTE si tocca
 * ␣   solo allora l'albero nuovo esce
 * ```
 *
 * ## ⛔ Perché i BYTE e non un AST printer
 *
 * `ts.createPrinter()` rigenera il file dall'albero, e nel farlo **converte le
 * virgolette, cancella le righe vuote e sposta gli spazi**. Su un progetto di
 * una persona vera quella non è una modifica: è un rifacimento che sotterra la
 * modifica vera dentro un diff illeggibile.
 *
 * ⇒ Si prende lo span esatto della dichiarazione e si sostituiscono **solo quei
 * caratteri**. Tutto il resto del file resta byte per byte com'era.
 *
 * ⛔ E lo span parte da `getStart()`, che salta i commenti che precedono: la
 * documentazione sopra una funzione **sopravvive** alla sostituzione del corpo.
 * Se un giorno si volesse sostituire anche quella, è una scelta diversa e va
 * dichiarata — non un effetto collaterale di un offset.
 */

export type TalosEsitoMutazione =
    | {
        stato: 'fatta'
        sorgenti: readonly TalosSorgente[]
        /** Che cosa è cambiato, per mostrarlo a chi approva. */
        diff: { percorso: string, prima: string, dopo: string }
    }
    | {
        stato: 'rifiutata'
        /** `premessa` = G1, `riferimenti` = G2, `ambiguo` = più di un bersaglio. */
        perche: 'premessa' | 'riferimenti' | 'ambiguo' | 'ignoto'
        messaggio: string
    }

export interface TalosBersaglio {
    percorso: string
    nome: string
}

/**
 * Le dichiarazioni di primo livello di un file, col loro span esatto.
 *
 * ⛔ Solo il PRIMO livello: una funzione annidata dentro un'altra non è un
 * bersaglio sostituibile — si sostituirebbe un pezzo di corpo altrui. Se
 * servirà, sarà un'altra operazione con un altro nome.
 */
export function dichiarazioniConSpan(
    ts: typeof TS,
    testo: string,
    nomeFile: string,
): Array<{ nome: string, inizio: number, fine: number }> {
    const sorgente = ts.createSourceFile(nomeFile, testo, ts.ScriptTarget.Latest, true, genereDi(ts, nomeFile))
    const fuori: Array<{ nome: string, inizio: number, fine: number }> = []

    for (const statement of sorgente.statements) {
        const span = { inizio: statement.getStart(sorgente), fine: statement.end }
        if ((ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) && statement.name) {
            fuori.push({ nome: statement.name.text, ...span })
        }
        else if (
            ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement)
            || ts.isEnumDeclaration(statement)
        ) {
            fuori.push({ nome: statement.name.text, ...span })
        }
        else if (ts.isVariableStatement(statement)) {
            /*
             * ⛔ Lo span è quello dell'INTERA istruzione, non della singola
             * dichiarazione: in `const a = 1, b = 2` sostituire solo `a = 1`
             * lascerebbe una virgola orfana e un file rotto.
             */
            for (const d of statement.declarationList.declarations) {
                if (ts.isIdentifier(d.name)) fuori.push({ nome: d.name.text, ...span })
            }
        }
    }
    return fuori
}

/**
 * ⭐ Sostituisce una dichiarazione esistente, **se** esiste e **se** il risultato
 * non introduce riferimenti rotti.
 *
 * ⛔ Non crea niente. Se il bersaglio non c'è, l'esito è `rifiutata` con
 * `perche: 'premessa'` — e non c'è nessuna via per cui questa funzione porti
 * all'esistenza un simbolo che non c'era. È la differenza fra i due task
 * gemelli, e sta nel tipo prima che nella logica.
 */
export async function sostituisciEsistente(
    sorgenti: readonly TalosSorgente[],
    bersaglio: TalosBersaglio,
    nuovoTesto: string,
    libreria?: TalosLibreriaStandard,
): Promise<TalosEsitoMutazione> {
    const ts = await caricaCompilatore()

    const file = sorgenti.find((s) => s.percorso === bersaglio.percorso)
    if (!file) {
        return {
            stato: 'rifiutata',
            perche: 'premessa',
            messaggio: `${bersaglio.percorso} is not in the workspace. Nothing was changed.`,
        }
    }
    if (file.testo === null) {
        return {
            stato: 'rifiutata',
            perche: 'ignoto',
            messaggio: `${bersaglio.percorso} could not be read, so the target cannot be resolved.`,
        }
    }
    if (!ESTENSIONI_SORGENTE.includes(estensioneDi(bersaglio.percorso))) {
        return {
            stato: 'rifiutata',
            perche: 'ignoto',
            messaggio: `${bersaglio.percorso} is not a source file we can read.`,
        }
    }

    /* ── G1: il bersaglio esiste, ed è UNO solo ────────────────────────────── */
    const candidati = dichiarazioniConSpan(ts, file.testo, bersaglio.percorso)
        .filter((d) => d.nome === bersaglio.nome)

    if (candidati.length === 0) {
        return {
            stato: 'rifiutata',
            perche: 'premessa',
            messaggio: `"${bersaglio.nome}" is not declared in ${bersaglio.percorso}. Nothing was created.`,
        }
    }
    /*
     * ⛔⛔ AMBIGUO NON È PRESENTE. Due dichiarazioni con lo stesso nome — un
     * overload, una ridefinizione — e non si sa quale la persona intendesse.
     * Sceglierne una in silenzio è l'errore irreversibile: si riscrive la cosa
     * sbagliata, e il diff sembra a posto.
     */
    if (candidati.length > 1) {
        return {
            stato: 'rifiutata',
            perche: 'ambiguo',
            messaggio: `"${bersaglio.nome}" is declared ${candidati.length} times in ${bersaglio.percorso}. The target is ambiguous and nothing was changed.`,
        }
    }

    /* ── il candidato, IN MEMORIA ──────────────────────────────────────────── */
    const { inizio, fine } = candidati[0]!
    const dopo = file.testo.slice(0, inizio) + nuovoTesto + file.testo.slice(fine)
    const albereNuovo = sorgenti.map((s) => (
        s.percorso === bersaglio.percorso ? { ...s, testo: dopo } : s
    ))

    /* ── G2: il candidato introduce riferimenti che non esistono? ──────────── */
    const semantico = await cancelloSemantico(sorgenti, albereNuovo, libreria)
    if (semantico.stato === 'assente') {
        return { stato: 'rifiutata', perche: 'riferimenti', messaggio: semantico.perche }
    }
    if (semantico.stato === 'ignoto') {
        /*
         * ⛔ Su una MUTAZIONE STRUTTURALE «non lo so» non autorizza. È la stessa
         * regola di `premiseUnknownPolicy: 'reject'`: su una capacità del
         * telefono un dubbio può ancora passare, su un cambiamento di codice no.
         */
        return { stato: 'rifiutata', perche: 'ignoto', messaggio: semantico.perche }
    }

    return {
        stato: 'fatta',
        sorgenti: albereNuovo,
        diff: { percorso: bersaglio.percorso, prima: file.testo, dopo },
    }
}
