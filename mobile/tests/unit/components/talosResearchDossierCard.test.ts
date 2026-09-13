// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import TalosResearchDossierCard from '@/components/talos/research/TalosResearchDossierCard.vue'
import TalosResearchDossierRow from '@/components/talos/research/TalosResearchDossierRow.vue'
import { useTalosLocalization } from '@/i18n'
import type { TalosResearchCard } from '@/lib/research/researchCard'

/**
 * ⛔ La prova sul singolare si fa IN ITALIANO, e non è un dettaglio.
 *
 * In inglese «Interrupted» vale per una e per molte: una prova scritta lì
 * passerebbe anche col difetto addosso. L'italiano declina, ed è la lingua in
 * cui il difetto si è visto sul Pad — quindi è lì che si guarda.
 */
async function cambiaLingua(mode: 'it' | 'en'): Promise<void> {
    await useTalosLocalization().setMode(mode)
    await nextTick()
}

/**
 * §3.4 — la scheda e la riga coi tre stati nuovi, e con una ricerca SENZA rapporto.
 *
 * ⛔ L'i18n e' quello VERO, non un finto: meta' del valore di questa prova e'
 * che le chiavi esistano davvero in `it.ts` e in `en.ts`. Un finto che rende la
 * chiave farebbe passare una scheda con dentro `research.completion…`.
 */

function scheda(over: Partial<TalosResearchCard> = {}): TalosResearchCard {
    return {
        id: 'run-1',
        question: 'Quanto costa una pagina?',
        originalQuestion: 'Quanto costa una pagina?',
        renamed: false,
        startedAt: '2026-09-12T08:00:00.000Z',
        updatedAt: '2026-09-12T08:10:00.000Z',
        bucket: 'done',
        status: 'done',
        done: 2,
        total: 2,
        failedSteps: 0,
        standing: null,
        completion: 'con-rapporto',
        branches: 2,
        sourcesGathered: false,
        firstBranch: 'prezzi per pagina',
        report: null,
        ...over,
    }
}

const AZIONI_TERMINALE = [
    { id: 'open', label: 'Apri' },
    { id: 'rename', label: 'Rinomina' },
    { id: 'delete', label: 'Elimina', danger: true },
]

const AZIONI_RIPRENDIBILE = [...AZIONI_TERMINALE, { id: 'resume', label: 'Riprendi' }]

function monta(card: TalosResearchCard, actions = AZIONI_TERMINALE) {
    return mount(TalosResearchDossierCard, {
        props: {
            card,
            dateLabel: '12/09/2026',
            actions,
            selectionMode: false,
            selected: false,
            selectable: true,
            busy: false,
        },
    })
}

describe('la scheda coi tre stati nuovi', () => {
    for (const bucket of ['senza-rapporto', 'bloccata-dal-permesso', 'giri-esauriti'] as const) {
        it(`«${bucket}» dice che cosa è successo, e lo nomina nel marcatore`, () => {
            const wrapper = monta(scheda({ bucket, completion: bucket }))
            const blocco = wrapper.get('[data-testid="talos-research-card-incomplete"]')

            expect(blocco.attributes('data-completion')).toBe(bucket)
            expect(blocco.text().length).toBeGreaterThan(10)
            // Nessun nome tecnico a schermo: se una chiave mancasse, il testo
            // sarebbe la chiave stessa.
            expect(blocco.text()).not.toContain('research.')
            // E la pastiglia dello stato porta lo stesso secchio.
            expect(wrapper.get('[data-testid="talos-research-card-status-run-1"]').attributes('data-bucket')).toBe(bucket)
            wrapper.unmount()
        })
    }

    it('dice COSA FARE solo quando la ricerca si può davvero riprendere', () => {
        const bloccata = scheda({ bucket: 'bloccata-dal-permesso', completion: 'bloccata-dal-permesso', status: 'collecting' })

        const riprendibile = monta(bloccata, AZIONI_RIPRENDIBILE)
        expect(riprendibile.find('[data-testid="talos-research-card-todo"]').exists()).toBe(true)
        riprendibile.unmount()

        // ⛔ Al contrario: su una che il motore non riapre l'invito sparisce.
        // Un «Riprendi» accanto a una ricerca terminale sarebbe un pulsante
        // che mente.
        const terminale = monta(scheda({ bucket: 'bloccata-dal-permesso', completion: 'bloccata-dal-permesso' }))
        expect(terminale.find('[data-testid="talos-research-card-todo"]').exists()).toBe(false)
        terminale.unmount()
    })

    it('AL CONTRARIO: una conclusa vera mostra l’estratto, non una diagnosi', () => {
        const wrapper = monta(scheda({
            bucket: 'done',
            completion: 'con-rapporto',
            standing: { total: 2, supported: 2, partial: 0, unsupported: 0, unchecked: 0, contested: 0 },
            report: {
                firstClaim: 'Il tetto per pagina è di 15.000 caratteri.',
                claims: 2,
                sources: [{ title: 'La pagina', web: true }, { title: 'Un materiale interno', web: false }],
            },
        }))

        expect(wrapper.find('[data-testid="talos-research-card-incomplete"]').exists()).toBe(false)
        expect(wrapper.get('[data-testid="talos-research-card-excerpt"]').text())
            .toContain('Il tetto per pagina è di 15.000 caratteri.')
        expect(wrapper.get('[data-testid="talos-research-card-standing"]').text()).toContain('100%')
        // Le due fonti, con le loro scorciatoie.
        expect(wrapper.find('[data-testid="talos-research-card-source-0"]').exists()).toBe(true)
        expect(wrapper.find('[data-testid="talos-research-card-source-1"]').exists()).toBe(true)
        wrapper.unmount()
    })

    it('una ricerca SENZA rapporto lo dice, invece di tacere sulle fonti', () => {
        const wrapper = monta(scheda({ bucket: 'giri-esauriti', completion: 'giri-esauriti' }))
        expect(wrapper.find('[data-testid="talos-research-card-sources-pending"]').exists()).toBe(true)
        // E il piede conta le LINEE, non riscontri che non esistono: stampare
        // «0 riscontri» direbbe «cercato e non trovato».
        expect(wrapper.text()).toContain('2')
        wrapper.unmount()
    })

    it('una in corso mostra l’avanzamento e nessuna diagnosi', () => {
        const wrapper = monta(scheda({ bucket: 'running', status: 'collecting', done: 1, total: 3, completion: null }))
        expect(wrapper.find('[data-testid="talos-research-card-progress"]').exists()).toBe(true)
        expect(wrapper.find('[data-testid="talos-research-card-incomplete"]').exists()).toBe(false)
        wrapper.unmount()
    })
})

describe('la riga dell’elenco racconta le stesse cose', () => {
    function montaRiga(card: TalosResearchCard, actions = AZIONI_TERMINALE) {
        return mount(TalosResearchDossierRow, {
            props: {
                card,
                dateLabel: '12/09/2026',
                actions,
                selectionMode: false,
                selected: false,
                selectable: true,
                busy: false,
            },
        })
    }

    it('porta lo stesso marcatore della scheda quando manca il rapporto', () => {
        const wrapper = montaRiga(scheda({ bucket: 'senza-rapporto', completion: 'senza-rapporto' }))
        const riga = wrapper.get('[data-testid="talos-research-card-incomplete"]')
        expect(riga.attributes('data-completion')).toBe('senza-rapporto')
        expect(riga.text()).not.toContain('research.')
        wrapper.unmount()
    })

    it('e su una conclusa vera torna ai conti', () => {
        const wrapper = montaRiga(scheda({
            report: { firstClaim: 'x', claims: 3, sources: [{ title: 'a', web: true }] },
        }))
        expect(wrapper.find('[data-testid="talos-research-card-incomplete"]').exists()).toBe(false)
        expect(wrapper.get('[data-testid="talos-research-row-detail"]').text()).toContain('3')
        wrapper.unmount()
    })
})

/**
 * ⛔ LE FONTI: due situazioni, non una. (Pad, 12/09/2026, foto RC12)
 *
 * «Fonti ancora da raccogliere» è vero solo se nessuna linea di ricerca ha
 * prodotto. Su una corsa che aveva finito di raccogliere e si era fermata sulla
 * sintesi, la scheda lo diceva lo stesso — perché guardava l'elenco del
 * rapporto, che non c'era — mentre la pagina del rapporto, nello stesso minuto,
 * diceva «Fonti raccolte» sulle stesse linee.
 */
describe('che cosa dice la scheda quando non c’è un elenco di fonti', () => {
    it('⛔ raccolte e senza rapporto: lo dice, invece di negare il lavoro fatto', () => {
        const wrapper = monta(scheda({
            bucket: 'failed',
            status: 'failed',
            completion: null,
            sourcesGathered: true,
        }))

        const nota = wrapper.get('[data-testid="talos-research-card-sources-gathered"]')
        expect(nota.text()).not.toContain('research.')
        expect(nota.text().length).toBeGreaterThan(5)
        expect(wrapper.find('[data-testid="talos-research-card-sources-pending"]').exists()).toBe(false)
        wrapper.unmount()
    })

    it('⛔ AL CONTRARIO: senza nemmeno una ricerca conclusa restano da raccogliere', () => {
        const wrapper = monta(scheda({ bucket: 'unfinished', status: 'collecting', sourcesGathered: false }))

        expect(wrapper.find('[data-testid="talos-research-card-sources-pending"]').exists()).toBe(true)
        expect(wrapper.find('[data-testid="talos-research-card-sources-gathered"]').exists()).toBe(false)
        wrapper.unmount()
    })

    it('con un elenco vero non compare nessuna delle due note', () => {
        const wrapper = monta(scheda({
            sourcesGathered: true,
            report: { firstClaim: 'x', claims: 1, sources: [{ title: 'La pagina', web: true }] },
        }))

        expect(wrapper.find('[data-testid="talos-research-card-sources-gathered"]').exists()).toBe(false)
        expect(wrapper.find('[data-testid="talos-research-card-sources-pending"]').exists()).toBe(false)
        wrapper.unmount()
    })
})

/**
 * ⛔ LA PASTIGLIA PARLA DI UNA RICERCA SOLA. (Pad, 12/09/2026, foto RC11)
 *
 * Diceva «Interrotte» sopra un dossier solo: prendeva la parola dal filtro,
 * dove quel plurale è giusto perché lì conta un insieme. Il plurale è il
 * ripiego di quando il numero non si sa; qui si sa, ed è uno.
 */
describe('la pastiglia di stato parla al singolare', () => {
    const SINGOLARI: ReadonlyArray<[TalosResearchCard['bucket'], string, string]> = [
        ['unfinished', 'Interrotta', 'Interrotte'],
        ['done', 'Conclusa', 'Concluse'],
        ['cancelled', 'Annullata', 'Annullate'],
        ['failed', 'Fallita', 'Fallite'],
        ['bloccata-dal-permesso', 'Bloccata da un permesso', 'Bloccate da un permesso'],
    ]

    for (const [bucket, singolare, plurale] of SINGOLARI) {
        it(`«${bucket}» si legge «${singolare}», non «${plurale}»`, async () => {
            const wrapper = monta(scheda({ bucket, completion: null }))
            const pastiglia = wrapper.get('[data-testid="talos-research-card-status-run-1"]')
            await cambiaLingua('it')

            expect(pastiglia.text()).toBe(singolare)
            expect(pastiglia.text()).not.toBe(plurale)
            await cambiaLingua('en')
            wrapper.unmount()
        })
    }

    it('⛔ e la riga dell’elenco dice esattamente la stessa parola', async () => {
        const scheda_ = scheda({ bucket: 'unfinished', completion: null })
        const card = monta(scheda_)
        const riga = mount(TalosResearchDossierRow, {
            props: {
                card: scheda_,
                dateLabel: '12/09/2026',
                actions: AZIONI_TERMINALE,
                selectionMode: false,
                selected: false,
                selectable: true,
                busy: false,
            },
        })
        await cambiaLingua('it')

        expect(riga.get('[data-testid="talos-research-card-status-run-1"]').text())
            .toBe(card.get('[data-testid="talos-research-card-status-run-1"]').text())
        await cambiaLingua('en')
        card.unmount()
        riga.unmount()
    })
})
