/**
 * ⛔ Un nome interno non compare MAI dove una persona decide se fidarsi.
 *
 * ## Il difetto, visto sul Pad il 2026-08-08 alle 06:22
 *
 * La richiesta di autorizzazione annunciava **`device_status`** nudo. La scheda
 * in chat era a posto — «Guarda com'è il telefono», con la spiegazione — ma
 * quell'altra superficie no. Cioè: il difetto era stato corretto **per una
 * schermata**, e la correzione non aveva impedito alla successiva di ripeterlo.
 *
 * La meccanica è semplice e vale per qualunque schermata futura:
 * `chatController` passa `title: pending.tool`, cioè l'identificativo, e
 * `talosToolConsentCopy` lo rimandava indietro tale e quale se non trovava
 * un'etichetta.
 *
 * ## Perché è un difetto di SICUREZZA, non di grafica
 *
 * Chi legge `device_status` non sa cosa sta autorizzando. Davanti a una parola
 * che non capisce fa una delle due cose sbagliate: nega tutto — e l'assistente
 * diventa inutile — oppure accetta tutto, e la richiesta di permesso ha smesso
 * di essere una richiesta. In entrambi i casi il consenso non è informato, che
 * è l'unica cosa che rende accettabile chiedere.
 *
 * ## Cosa afferma questo file, e perché così
 *
 * Non «device_status ha un'etichetta»: quella era la correzione di ieri, ed è
 * proprio il tipo di correzione che non ha impedito il difetto di oggi. Afferma
 * che **ogni** strumento del catalogo ne ha una, **in ogni lingua**, e che il
 * ripiego non può esibire un identificativo neanche volendo. Uno strumento
 * nuovo senza etichetta rompe qui, prima di arrivare sul telefono di qualcuno.
 */
import { describe, expect, it } from 'vitest'
import { TALOS_AGENT_TOOL_CONTROLS } from '@/lib/tools/toolControlCatalog'
import { talosToolConsentCopy } from '@/lib/tools/toolLabels'
/*
 * ⛔ DUE inciampi, tutti e due dentro questo import, tutti e due istruttivi.
 *
 * 1. `it` è anche il nome del caso di prova in vitest: importare la lingua
 *    italiana come `it` glielo schiacciava sotto — «default is not a function».
 * 2. Le lingue NON hanno un export predefinito. Con `import italiano from …` il
 *    dizionario arrivava `undefined`, il traduttore restituiva le chiavi, e la
 *    prova accusava tutti e 55 gli strumenti di non avere un nome umano. Un
 *    test che fallisce per il motivo sbagliato è peggio di uno che non c'è:
 *    avrei corretto un catalogo che stava benissimo.
 */
import { TALOS_IT_MESSAGES as italiano } from '@/i18n/locales/it'
import { TALOS_EN_MESSAGES as inglese } from '@/i18n/locales/en'

/** Un traduttore vero, che legge il dizionario di quella lingua. */
function traduttore(dizionario: Record<string, unknown>) {
    return (chiave: string, parametri?: Record<string, unknown>): string => {
        const valore = chiave.split('.').reduce<unknown>(
            (nodo, pezzo) => (nodo && typeof nodo === 'object'
                ? (nodo as Record<string, unknown>)[pezzo]
                : undefined),
            dizionario,
        )
        if (typeof valore !== 'string') return chiave
        return parametri
            ? valore.replace(/\{(\w+)\}/g, (_, nome: string) => String(parametri[nome] ?? ''))
            : valore
    }
}

const LINGUE = [
    { nome: 'italiano', dizionario: italiano as unknown as Record<string, unknown> },
    { nome: 'inglese', dizionario: inglese as unknown as Record<string, unknown> },
]

/** La forma di un identificativo interno: `device_status`, `library_list`… */
const SEMBRA_UN_ID = /^[a-z0-9]+(_[a-z0-9]+)+$/

describe('nessun nome interno arriva a una persona', () => {
    for (const lingua of LINGUE) {
        it(`NOME-UMANO-01 (${lingua.nome}) ogni strumento del catalogo ha un titolo e una spiegazione`, () => {
            const t = traduttore(lingua.dizionario)
            const senzaNome: string[] = []
            const senzaSpiegazione: string[] = []

            for (const controllo of TALOS_AGENT_TOOL_CONTROLS) {
                const copia = talosToolConsentCopy(
                    // ⛔ ESATTAMENTE come chiama `chatController`: l'id anche
                    // come titolo. È quel chiamante che ha prodotto il difetto,
                    // quindi è quel chiamante che va imitato.
                    { name: controllo.id, title: controllo.id, description: '' },
                    t,
                )
                // Né l'id nudo, né la chiave di traduzione non risolta.
                if (SEMBRA_UN_ID.test(copia.title) || copia.title.startsWith('toolConsent.')) {
                    senzaNome.push(controllo.id)
                }
                if (!copia.description || copia.description.startsWith('toolConsent.')) {
                    senzaSpiegazione.push(controllo.id)
                }
            }

            expect(senzaNome, `strumenti senza nome umano: ${senzaNome.join(', ')}`).toEqual([])
            expect(senzaSpiegazione, `strumenti senza spiegazione: ${senzaSpiegazione.join(', ')}`).toEqual([])
        })
    }

    it('NOME-UMANO-02 ⛔ e se un domani l’etichetta manca, il ripiego NON esibisce l’id', () => {
        /*
         * La difesa in profondità. La guardia sopra rende improbabile arrivarci,
         * ma «improbabile» non basta sulla schermata dove si decide se fidarsi:
         * uno strumento nato mentre il catalogo delle etichette resta indietro
         * deve degradare in qualcosa di onesto, non in un identificativo.
         */
        const copia = talosToolConsentCopy(
            { name: 'strumento_che_non_esiste', title: 'strumento_che_non_esiste', description: 'x' },
            traduttore(italiano as unknown as Record<string, unknown>),
        )
        expect(copia.title).toBe('Uno strumento di TALOS')
        expect(SEMBRA_UN_ID.test(copia.title)).toBe(false)
    })

    it('NOME-UMANO-03 un titolo GIÀ umano passa intatto', () => {
        /*
         * L'altra metà: il ripiego non deve appiattire su «Uno strumento di
         * TALOS» chi un nome buono ce l'aveva già. Si riconosce la FORMA di un
         * identificativo, non l'assenza di una chiave.
         */
        const copia = talosToolConsentCopy(
            { name: 'sconosciuto', title: 'Accendi la torcia', description: 'x' },
            traduttore(italiano as unknown as Record<string, unknown>),
        )
        expect(copia.title).toBe('Accendi la torcia')
    })

    it('NOME-UMANO-04 morde: col vecchio ripiego il titolo SAREBBE l’id', () => {
        // Lo stato in cui si trovava il codice quando l'owner ha letto
        // `device_status` sul suo telefono.
        const vecchioRipiego = (title: string) => title
        expect(SEMBRA_UN_ID.test(vecchioRipiego('device_status'))).toBe(true)
    })
})
