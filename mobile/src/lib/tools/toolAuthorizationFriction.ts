/**
 * ⭐⭐⭐ 6.4 — Piano procedi-col-generare-un-snoopy-neumann.md, §6.4/§8 Fase
 * A-bis (28/8). Conta quante decisioni vere di autorizzazione sono "quasi
 * sempre sì" — candidate a essere RIVISTE per una regola automatica — contro
 * quante sono decisioni genuine.
 *
 * ⛔⛔⛔ SOLO DIAGNOSTICA, MAI AUTO-PROMOZIONE — ricerca 28/8. "Approval
 * fatigue" è un vettore d'attacco documentato: chi progetta un prompt
 * ostile può scrivere raffiche di richieste innocue apposta per abituare
 * la persona a dire sì (`ATR-2026-00118-approval-fatigue`), e la persona
 * finisce per acconsentire prima ancora di leggere. Una striscia di sì
 * consecutivi NON è quindi prova di sicurezza: è solo un numero da
 * mostrare a una persona, mai un segnale che promuove da solo un
 * attrezzo a "sempre sì". Anche Claude Code, che il piano cita come
 * riferimento, non lavora così: la sua modalità automatica classifica il
 * RISCHIO dell'azione (quanto danno può fare), non conta quante volte è
 * stata approvata prima. Questo modulo produce il numero; la decisione
 * di automatizzare qualcosa resta sempre di una persona, con quel numero
 * SOLO come uno dei dati, mai come l'unico.
 *
 * ⛔ Granularità: PER ATTREZZO (`tool`), non per `input_digest` — la stessa
 * chiave che "Always allow" usa già (`TalosToolAuthorizationGrantV1.tool`
 * in `toolAuthorizations.ts`). Per `input_digest` sarebbe troppo stretto:
 * ogni comando leggermente diverso non accumulerebbe mai una storia.
 *
 * ⛔ Non un mining dei log esistenti (owner, 28/8): si conta da zero, in
 * avanti, da quando questo modulo esiste — vedi la Fonte dati decisa in
 * §6.4 del piano.
 *
 * ⛔ Ogni chiamata che questo modulo riceve viene, per costruzione, da
 * `TalosToolAuthorizationCoordinator.decide()` — che esiste solo per
 * richieste `pending`. Una richiesta risolta da un grant `baseline` o
 * `persistent` non diventa mai `pending` (vedi `resolveTalosToolAuthorization`
 * altrove): non raggiunge mai `decide()`, quindi non raggiunge mai questo
 * modulo. Non serve distinguere "vera domanda" da "già automatica" qui
 * dentro: lo è già, per come il resto della catena è costruito.
 */
import { Preferences } from '@capacitor/preferences'
import type { TalosToolAuthorizationDecision } from '@/lib/tools/toolAuthorizations'

const CHIAVE_PREFERENZA = 'talos.decisionFriction.v1'

export interface TalosFrictionPerAttrezzo {
    readonly tool: string
    readonly decisioniTotali: number
    /** Quante di fila, dall'ultimo "no" (o dall'inizio), sono state un sì. */
    readonly siConsecutivi: number
    readonly maiUnNo: boolean
    readonly ultimaDecisione: Exclude<TalosToolAuthorizationDecision, 'pending'>
    readonly ultimaVolta: string
}

export interface TalosFrictionStatoV1 {
    readonly schema_version: 1
    readonly perAttrezzo: Readonly<Record<string, TalosFrictionPerAttrezzo>>
}

export const TALOS_FRICTION_VUOTO: TalosFrictionStatoV1 = Object.freeze({
    schema_version: 1,
    perAttrezzo: Object.freeze({}),
})

/** Un sì che non allarga i permessi (allow_once/allow_turn) conta come sì; always_allow pure. Solo `deny` interrompe la striscia. */
function eUnSi(decisione: Exclude<TalosToolAuthorizationDecision, 'pending'>): boolean {
    return decisione === 'allow_once' || decisione === 'allow_turn' || decisione === 'always_allow'
}

/**
 * ⭐⭐⭐ Pura: applica UNA decisione allo stato precedente, torna il NUOVO
 * stato — mai muta `stato`. La persistenza (leggere/scrivere Preferences)
 * vive fuori, in `contaDecisioneReale`: qui dentro non c'è I/O, quindi si
 * prova senza Capacitor e senza async.
 *
 * ⛔ AL CONTRARIO — un `deny` azzera `siConsecutivi` a 0 e spegne
 * `maiUnNo` per sempre su quell'attrezzo: un solo rifiuto, anche dopo
 * cento sì, toglie quell'attrezzo dai candidati alla revisione finché
 * non viene tolto e rimesso a mano (non c'è "dimenticare un no" qui).
 */
export function registraDecisione(
    stato: TalosFrictionStatoV1,
    tool: string,
    decisione: Exclude<TalosToolAuthorizationDecision, 'pending'>,
    quando: string,
): TalosFrictionStatoV1 {
    const precedente = stato.perAttrezzo[tool]
    const voce: TalosFrictionPerAttrezzo = {
        tool,
        decisioniTotali: (precedente?.decisioniTotali ?? 0) + 1,
        siConsecutivi: eUnSi(decisione) ? (precedente?.siConsecutivi ?? 0) + 1 : 0,
        maiUnNo: (precedente?.maiUnNo ?? true) && decisione !== 'deny',
        ultimaDecisione: decisione,
        ultimaVolta: quando,
    }
    return {
        schema_version: 1,
        perAttrezzo: { ...stato.perAttrezzo, [tool]: voce },
    }
}

/**
 * ⭐⭐ "Quasi sempre sì" — candidato a essere RIVISTO da una persona, mai a
 * essere promosso da solo. Soglia dichiarata, NON misurata — un punto di
 * partenza esplicito da ricalibrare sui dati veri, stesso spirito di
 * `SOGLIA_SCRITTURE_SENZA_PROVA` in `talosHarness.mjs`. Vedi l'avviso in
 * testa al file: questo è un numero, non un giudizio di sicurezza.
 */
export const SOGLIA_QUASI_SEMPRE_SI = 5

export function eQuasiSempreSi(voce: TalosFrictionPerAttrezzo): boolean {
    return voce.maiUnNo && voce.decisioniTotali >= SOGLIA_QUASI_SEMPRE_SI
}

export interface TalosFrictionRiepilogo {
    readonly attrezziVisti: number
    readonly decisioniVereTotali: number
    /** ⛔ Da RIVEDERE con una persona — mai da promuovere da soli. Vedi l'avviso in testa al file. */
    readonly candidatiDaRivedere: readonly string[]
}

/** ⭐ Il riepilogo leggibile: quanti attrezzi, quante decisioni vere in tutto, quali meritano uno sguardo. */
export function riepilogoFrizione(stato: TalosFrictionStatoV1): TalosFrictionRiepilogo {
    const voci = Object.values(stato.perAttrezzo)
    return {
        attrezziVisti: voci.length,
        decisioniVereTotali: voci.reduce((somma, v) => somma + (v?.decisioniTotali ?? 0), 0),
        candidatiDaRivedere: voci
            .filter((v): v is TalosFrictionPerAttrezzo => v !== undefined && eQuasiSempreSi(v))
            .map((v) => v.tool)
            .sort(),
    }
}

/**
 * Lettura vera, isolata dalla logica pura sopra. Uno stato corrotto o
 * assente torna VUOTO, mai un crash: la stessa onestà di
 * `parseTalosToolAuthorizationGrants` nel file accanto.
 */
export async function leggiStatoFrizione(): Promise<TalosFrictionStatoV1> {
    const { value } = await Preferences.get({ key: CHIAVE_PREFERENZA })
    if (!value) return TALOS_FRICTION_VUOTO
    try {
        const parsed: unknown = JSON.parse(value)
        if (
            parsed !== null && typeof parsed === 'object'
            && (parsed as { schema_version?: unknown }).schema_version === 1
            && typeof (parsed as { perAttrezzo?: unknown }).perAttrezzo === 'object'
        ) {
            return parsed as TalosFrictionStatoV1
        }
    }
    catch { /* corrotto: si riparte da vuoto */ }
    return TALOS_FRICTION_VUOTO
}

export async function salvaStatoFrizione(stato: TalosFrictionStatoV1): Promise<void> {
    await Preferences.set({ key: CHIAVE_PREFERENZA, value: JSON.stringify(stato) })
}

/**
 * ⭐⭐⭐ Il punto d'ingresso vero per il chiamante (`decide()` in
 * `toolAuthorizationCheckpoint.ts`): legge, applica, salva.
 *
 * ⛔ Deliberatamente ISOLATA dal fallimento: un contatore che si rompe non
 * deve MAI impedire una decisione di autorizzazione vera di arrivare al
 * modello. Il chiamante la invoca senza `await` e ne inghiotte l'errore —
 * vedi il commento su `deps.registraDecisioneReale` in
 * `toolAuthorizationCheckpoint.ts`.
 */
export async function contaDecisioneReale(
    tool: string,
    decisione: Exclude<TalosToolAuthorizationDecision, 'pending'>,
    quando: string,
): Promise<void> {
    const attuale = await leggiStatoFrizione()
    await salvaStatoFrizione(registraDecisione(attuale, tool, decisione, quando))
}
