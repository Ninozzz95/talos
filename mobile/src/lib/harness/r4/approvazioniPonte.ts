/**
 * ⛔ K3-AP1: ciò che la schermata del Codice dà alla carta d'approvazione (`provide`): la politica della sessione e la risposta a r4.
 * File a parte da `approvazioneChiave.ts`: quello lo importa la lista della chat, che parte all'avvio (tetto del pacchetto d'avvio).
 */
import type { InjectionKey } from 'vue'
import type { PoliticaSessioneR4, SceltaApprovazioneR4 } from './approvazioniR4'
import type { EsitoDomandaR4 } from './domandaChiave'
import type { DecisionePianoR4 } from './pianoChiave'

export interface PonteApprovazioniR4 {
    politica: () => PoliticaSessioneR4
    leggiPolitica: () => Promise<void>
    /** K3-AP3: con `figlia` la risposta va alla sotto-sessione che chiede, con `rispostoDa`. */
    rispondi: (requestId: string, scelta: SceltaApprovazioneR4, tipo: string | null, figlia?: { sessionId: string }) => Promise<{ ok: boolean; sempreNonSalvato: boolean }>
    /** K3-AP2: la risposta alla carta delle domande (`POST /question`, con la rilettura del registro), la sessione e il giro in corso. */
    rispondiDomanda: (corpo: { requestId: string; status: string; answers?: Record<string, string | string[]> }, figlia?: { sessionId: string }) => Promise<
        { ok: true; riconciliata?: EsitoDomandaR4 } | { ok: false; stato: number | null; codice: string | null; messaggio: string }>
    /** K3 piano: la scelta sulla carta del piano (`POST /plan-decision`); un rifiuto torna con la sua busta, `null` se r4 non ha risposto. */
    decidiPiano: (corpo: { requestId: string; decisione: DecisionePianoR4; hash: string; feedback?: string }) => Promise<
        { ok: true } | { ok: false; errore: { code: string; message: string; reason?: string; params?: Record<string, unknown> } | null }>
    sessioneId: () => string | null
    /** Vero mentre un giro è in corso; falso a storia finita senza giro: una domanda ancora aperta è sopravvissuta a un riavvio. */
    giroInCorso: () => boolean | null
    /** K3-AP3 (owner 16/10 «link discreto»): il nome dell'agente sulla carta apre la sotto-sessione, come dalla scheda Agenti. */
    apriFiglia: (sessionId: string) => void
}
export const TALOS_APPROVAZIONI_R4: InjectionKey<PonteApprovazioniR4> = Symbol('talos-approvazioni-r4')
