import { describe, expect, it } from 'vitest'
import { talosResearchBucketOneKey } from '@/components/talos/research/researchPresentation'
import type { TalosResearchBucket } from '@/lib/research/researchCard'
import { TALOS_IT_MESSAGES } from '@/i18n/locales/it'
import { TALOS_EN_MESSAGES } from '@/i18n/locales/en'

/**
 * Due blocchi di parole per due lavori diversi. (Pad, 12/09/2026, foto RC11)
 *
 * Il filtro CONTA un insieme — «Interrotte» sono tutte quelle interrotte — e la
 * pastiglia DESCRIVE l'oggetto che ha sotto, che è uno. La pastiglia prendeva la
 * parola dal filtro, e sopra un dossier solo si leggeva «Interrotte».
 *
 * Il plurale è il ripiego di quando il numero non si sa (Emplifi Soul Design
 * System, «Singular versus plural», letto 12/09/2026). Qui si sa.
 */

const SECCHI: readonly TalosResearchBucket[] = [
    'running', 'paused', 'unfinished', 'cancelled', 'done', 'failed',
    'senza-rapporto', 'bloccata-dal-permesso', 'giri-esauriti',
]

function blocco(messages: typeof TALOS_IT_MESSAGES, nome: 'buckets' | 'bucketOne'): Record<string, string> {
    const research = (messages as unknown as { research: Record<string, unknown> }).research
    return research[nome] as Record<string, string>
}

describe('la parola giusta per uno stato', () => {
    it('la chiave della pastiglia è quella del blocco al singolare', () => {
        expect(talosResearchBucketOneKey('unfinished')).toBe('research.bucketOne.unfinished')
    })

    it('ogni secchio ha la sua parola in tutte e due le lingue', () => {
        for (const secchio of SECCHI) {
            expect(blocco(TALOS_IT_MESSAGES, 'bucketOne')[secchio], `it ${secchio}`).toBeTruthy()
            expect(blocco(TALOS_EN_MESSAGES, 'bucketOne')[secchio], `en ${secchio}`).toBeTruthy()
        }
    })

    /*
     * ⛔ Il difetto vero, fissato dove si vede: in italiano le due parole DEVONO
     * essere diverse su tutto ciò che si declina. Se tornassero a coincidere,
     * vorrebbe dire che qualcuno ha rimesso il plurale sulla pastiglia.
     */
    it('⛔ in italiano il singolare NON è la parola del filtro', () => {
        const filtri = blocco(TALOS_IT_MESSAGES, 'buckets')
        const uno = blocco(TALOS_IT_MESSAGES, 'bucketOne')

        expect(uno.unfinished).toBe('Interrotta')
        expect(filtri.unfinished).toBe('Interrotte')
        expect(uno.done).toBe('Conclusa')
        expect(filtri.done).toBe('Concluse')
        expect(uno.cancelled).not.toBe(filtri.cancelled)
        expect(uno.failed).not.toBe(filtri.failed)
        expect(uno['bloccata-dal-permesso']).not.toBe(filtri['bloccata-dal-permesso'])
    })

    /*
     * AL CONTRARIO: dove l'italiano NON declina, le due parole restano uguali —
     * e va bene così. Inventare una differenza per simmetria sarebbe peggio del
     * difetto: due nomi per la stessa cosa.
     */
    it('dove non si declina, la parola resta la stessa', () => {
        const filtri = blocco(TALOS_IT_MESSAGES, 'buckets')
        const uno = blocco(TALOS_IT_MESSAGES, 'bucketOne')

        expect(uno.running).toBe(filtri.running)
        expect(uno.paused).toBe(filtri.paused)
    })

    /*
     * ⛔ «Tutte» è una voce del FILTRO: nessuna ricerca è mai in quello stato, e
     * una chiave `bucketOne.all` sarebbe un invito a scriverla su una pastiglia.
     */
    it('⛔ il blocco al singolare non ha «tutte»', () => {
        expect(blocco(TALOS_IT_MESSAGES, 'bucketOne').all).toBeUndefined()
        expect(blocco(TALOS_EN_MESSAGES, 'bucketOne').all).toBeUndefined()
        expect(blocco(TALOS_IT_MESSAGES, 'buckets').all).toBe('Tutte')
    })
})
