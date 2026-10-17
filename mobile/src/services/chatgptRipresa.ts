/**
 * N15 — riprendere ALL'AVVIO un accesso a ChatGPT rimasto a metà.
 *
 * Se Android ricrea l'attività mentre la scheda di ChatGPT è davanti, l'app riparte dalla chat. La ripresa
 * (`creaSessioneChatgpt().riprendi`) partiva solo dal riquadro di OpenAI: l'accesso restava a metà finché la persona non
 * tornava là. Qui un SEGNO nelle preferenze dice all'avvio che c'è qualcosa da riprendere.
 *
 * ⛔ Il segno non è un segreto e non contiene niente: solo «c'è un accesso aperto». Ciò che serve a finire l'accesso sta nel
 * Keystore (voce `attesa`). Senza segno, all'avvio non si carica nessun modulo dell'accesso e non si tocca il Keystore.
 */
import type { TalosDepositoSemplice } from '@/services/chatgptConsumi'

export const CHIAVE_ACCESSO_APERTO = 'talos.chatgpt.accesso-aperto.v1'

type Esito = { ok: true, email: string | null, pianoAbilitato: boolean } | { ok: false, codice: string }
interface ServizioDelSegno {
    stato(): Promise<{ accessoInCorso: boolean }>
    quandoCambia(ascoltatore: () => void): () => void
}

/** Tiene il segno allineato al servizio: acceso mentre un accesso è aperto, tolto quando finisce (in qualunque modo). */
export function tieniIlSegnoDellAccesso(servizio: ServizioDelSegno, deposito: TalosDepositoSemplice): () => void {
    return servizio.quandoCambia(() => {
        void servizio.stato().then((s) => {
            try {
                if (s.accessoInCorso) deposito.setItem(CHIAVE_ACCESSO_APERTO, '1')
                else deposito.removeItem(CHIAVE_ACCESSO_APERTO)
            } catch { /* senza segno si perde solo la ripresa all'avvio: resta quella dal riquadro */ }
        }).catch(() => {})
    })
}

export async function riprendiAccessoRimasto({ servizio, deposito, quandoCollegato, avvisa }: {
    servizio: { riprendi(): Promise<unknown> }
    deposito: TalosDepositoSemplice
    /** L'accesso è riuscito: la chat rilegge le «chiavi» e l'elenco dei modelli del piano. */
    quandoCollegato: () => Promise<void>
    /** Dirlo alla persona: `collegato`, oppure `fallito` col codice del guasto. */
    avvisa: (che: 'collegato' | 'fallito', codice: string | null) => void
}): Promise<Esito | null> {
    let segnato = false
    try { segnato = deposito.getItem(CHIAVE_ACCESSO_APERTO) !== null } catch { segnato = false }
    if (!segnato) return null
    const esito = await servizio.riprendi().catch(() => null) as Esito | null
    // Il deposito sicuro non ha risposto: niente è stato toccato, il segno resta e si riprova al prossimo avvio.
    if (esito && !esito.ok && esito.codice === 'CHATGPT_CUSTODIA_ILLEGGIBILE') return esito
    try { deposito.removeItem(CHIAVE_ACCESSO_APERTO) } catch { /* si ritenterà: `riprendi` torna null se non c'è più niente */ }
    if (!esito) return null
    if (esito.ok) {
        await quandoCollegato().catch(() => {})
        avvisa('collegato', null)
    } else if (esito.codice !== 'CHATGPT_ACCESSO_ANNULLATO') {
        avvisa('fallito', esito.codice)
    }
    return esito
}
