/**
 * ⭐ J3 (24/10/2026, owner; decisioni confermate dal Desktop) — lo stato della PILLOLA DEL RAGIONAMENTO del compositore. La regola è
 * quella del desktop, PORTATA e fissata (`pillolaRagionamento.ts` @ c6d1cbff2): qui c'è solo il lessico del telefono.
 *   · Il telefono dice `off` dove il desktop dice `none`: si traduce all'ingresso e all'uscita, mai dentro la regola.
 *   · I livelli sono quelli che il profilo DICHIARA (`effort_levels`), più lo spegnimento come sul desktop; con `reasoning_mandatory`
 *     (RAG-OBB, 24/09) lo spegnimento non c'è.
 *   · Nessun livello dichiarato ⇒ la regola riceve una lista VUOTA, non `livelliAmmessi: []`: lì la porta offre la scala intera
 *     («senza catalogo la lista intera», PILLOLA-RAG-01), cioè sette livelli finti. ⛔ REV5-P5 (revisione del Desktop): un modello
 *     `local:` del PC senza voce nel catalogo arriva con `effort_levels: []` (`modelliDelPc.ts`) e la pillola sta nascosta.
 *   · Il motore del TELEFONO un livello non lo riceve: `localAdapter` legge solo `thinking`, il motore ospite del Codice solo `none`
 *     (`TalosMotoreOspiteHttp.java:168-172`). I low/medium/high di un modello `local` sono dedotti (`mobileModelCatalog.ts`,
 *     `effortLevelsFor`), non dichiarati: la pillola sta nascosta e «Ragionamento esteso» resta nel foglio del modello.
 * `nessuno` della porta ⇒ `nascosta` (owner 24/10: «la pillola è nascosta quando il modello non riceve un livello»).
 */
import { SCALA_RAGIONAMENTO, livelliDaMostrare, statoDelLivello, type FiloRagionamento, type NotaRagionamento } from './pillolaRagionamento'

export interface ProfiloDellaPillola {
    readonly provider: string
    readonly effort_levels?: readonly string[] | null
    readonly reasoning_mandatory?: boolean
}

export interface VoceDellaPillola {
    /** Nel lessico del telefono (`off`, `low`, …, `max`). */
    readonly valore: string
    /** Il ✓: il livello che PARTE, solo se è una scelta della persona. */
    readonly scelta: boolean
}

export interface StatoPillolaRagionamento {
    readonly nascosta: boolean
    readonly voci: readonly VoceDellaPillola[]
    /** Il livello che la pillola dice; `null` = nessuna scelta, «Auto». */
    readonly mostrato: string | null
    readonly toccato: boolean
    /** La riga A9, coi valori nel lessico del telefono; `null` = niente da dire. */
    readonly nota: NotaRagionamento | null
}

/** I fornitori il cui motore il livello non lo riceve: soltanto acceso o spento. */
const SENZA_LIVELLO: ReadonlySet<string> = new Set(['local'])

const daTelefono = (valore: string) => (valore === 'off' ? 'none' : valore)
const versoTelefono = (valore: string) => (valore === 'none' ? 'off' : valore)

function notaVersoTelefono(nota: NotaRagionamento | null): NotaRagionamento | null {
    if (!nota) return null
    if (nota.chiave === 'effortSentAs') return { ...nota, scelto: versoTelefono(nota.scelto), inviato: versoTelefono(nota.inviato) }
    if (nota.chiave === 'effortNotTaken') return { ...nota, scelto: versoTelefono(nota.scelto) }
    if (nota.chiave === 'effortAutoSent') return { ...nota, inviato: versoTelefono(nota.inviato) }
    return nota
}

export function statoPillolaRagionamento({ profilo, scelto, filo = null }: {
    profilo: ProfiloDellaPillola | null | undefined
    /** Il livello scelto, nel lessico del telefono; `null` = nessuna scelta. */
    scelto: string | null | undefined
    /** La mappa del filo (A9) nel lessico del desktop (`none`), come la dà r4; `null` = nessuna mappa. */
    filo?: FiloRagionamento | null
}): StatoPillolaRagionamento {
    const dichiarati = profilo && !SENZA_LIVELLO.has(profilo.provider)
        ? [...new Set((profilo.effort_levels ?? []).map(daTelefono))].filter((v) => v !== 'none' && SCALA_RAGIONAMENTO.includes(v))
        : []
    const tutti = SCALA_RAGIONAMENTO.map((valore) => ({ valore }))
    const delModello = dichiarati.length ? livelliDaMostrare({ tutti, livelliAmmessi: dichiarati, filo }) : []
    const livelli = profilo?.reasoning_mandatory === true ? delModello.filter((l) => l.valore !== 'none') : delModello
    const stato = statoDelLivello({ livelli, valoreIniziale: scelto == null ? null : daTelefono(scelto), filo })
    // ⛔ D3 (Pad 28/10/2026, OK Desktop): il motore del telefono non ha un fornitore che «decide» — la nota A9 lì sarebbe falsa, e il
    // piede dice già «funziona senza un'impostazione di ragionamento». La nota resta per i modelli in rete (PILL-STATO-07, PIEDE-09).
    const nota = profilo && SENZA_LIVELLO.has(profilo.provider) ? null : notaVersoTelefono(stato.nota)
    if (!profilo || stato.nessuno) return { nascosta: true, voci: [], mostrato: null, toccato: false, nota }
    return {
        nascosta: false,
        voci: livelli.map((l, i) => ({ valore: versoTelefono(l.valore), scelta: stato.toccato && !stato.senzaTacca && i === stato.indice })),
        mostrato: stato.toccato ? versoTelefono(livelli[stato.indice]!.valore) : null,
        toccato: stato.toccato,
        nota,
    }
}
