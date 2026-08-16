/**
 * ⭐ I due casi che l'owner ha nominato, e che GUI-Owl dichiara APERTI.
 *
 * > *«The document does not address ordinal references ("first contact") or
 * > icon-button grounding strategies.»* — `arXiv 2508.15144`
 *
 * ⛔ E la regola che vale più di tutte: quando due elementi combaciano allo
 * stesso modo **non si sceglie**. Un agente che indovina fra due pulsanti è un
 * agente che un giorno preme quello sbagliato.
 */
import { describe, expect, it } from 'vitest'
import {
    talosLeggiOrdinale,
    talosNesimoInLista,
    talosNormalizza,
    talosTrovaElemento,
} from '@/lib/agent/trovaElemento'
import type { TalosElementoSchermo } from '@/lib/agent/passoDelloSchermo'

const el = (
    indice: number,
    etichetta: string,
    extra: Partial<TalosElementoSchermo> = {},
): TalosElementoSchermo => ({ indice, tipo: 'tocca', etichetta, ...extra })

describe('la normalizzazione', () => {
    it('riduce i modi di scrivere la stessa parola', () => {
        for (const forma of ['sticker', 'Sticker', 'STICKER', 'sticker_btn', 'stickerPicker']) {
            expect(talosNormalizza(forma).startsWith('sticker')).toBe(true)
        }
    })

    it('⛔ toglie gli accenti: «però» e «pero» sono la stessa parola qui', () => {
        expect(talosNormalizza('Però')).toBe('pero')
        expect(talosNormalizza('Città')).toBe('citta')
    })

    it('spezza le maiuscole interne, che è come si scrivono gli id', () => {
        expect(talosNormalizza('emojiPickerBtn')).toBe('emoji picker btn')
    })
})

describe('⭐ il pulsante SENZA testo — il caso «sticker»', () => {
    it('trova `sticker_btn` da «sticker»', () => {
        const esito = talosTrovaElemento([el(0, 'Invia'), el(1, 'sticker_btn')], 'sticker')
        expect(esito.esito).toBe('trovato')
        if (esito.esito === 'trovato') expect(esito.elemento.indice).toBe(1)
    })

    it('⭐ trova «Adesivi» da «sticker»: la sinonimia it↔en', () => {
        const esito = talosTrovaElemento([el(0, 'Emoji'), el(1, 'Adesivi')], 'sticker')
        expect(esito.esito).toBe('trovato')
        if (esito.esito === 'trovato') expect(esito.elemento.etichetta).toBe('Adesivi')
    })

    it('trova «Invia» da «send», e viceversa', () => {
        const schermo = [el(0, 'Invia'), el(1, 'Allega')]
        expect(talosTrovaElemento(schermo, 'send').esito).toBe('trovato')
        expect(talosTrovaElemento(schermo, 'graffetta').esito).toBe('trovato')
    })

    it('⛔ AL CONTRARIO: quello che a schermo NON c\'è si dice assente', () => {
        const esito = talosTrovaElemento([el(0, 'Invia'), el(1, 'Allega')], 'sticker')
        expect(esito.esito).toBe('assente')
    })

    it('⛔ un\'etichetta vuota non combacia con niente', () => {
        expect(talosTrovaElemento([el(0, '')], 'sticker').esito).toBe('assente')
        expect(talosTrovaElemento([el(0, '')], '').esito).toBe('assente')
    })
})

/**
 * ⛔⛔ IL CASO CHE HA TROVATO IL TELEFONO, e che i miei test non vedevano.
 *
 * MISURATO sulle Impostazioni del Pad il 2026-08-16: la prima voce è **«Wi-Fi»**
 * e cercando **«wifi»** il risultato era **«assente»**. Il trattino diventa uno
 * spazio — giustamente — e `wi fi` non contiene `wifi`.
 *
 * I test di prima usavano tutte parole singole: «sticker», «Adesivi», «Invia».
 * Il caso più comune che esista non era coperto da nessuno.
 */
describe('⛔ le parole spezzate: «Wi-Fi» e «wifi» sono la stessa cosa', () => {
    it('⭐ il caso vero del Pad: «wifi» trova «Wi-Fi»', () => {
        const esito = talosTrovaElemento([el(0, 'Bluetooth'), el(1, 'Wi-Fi')], 'wifi')
        expect(esito.esito).toBe('trovato')
        if (esito.esito === 'trovato') expect(esito.elemento.etichetta).toBe('Wi-Fi')
    })

    it('e nell\'altro verso: «wi-fi» trova un\'etichetta attaccata', () => {
        expect(talosTrovaElemento([el(0, 'WiFi')], 'wi-fi').esito).toBe('trovato')
    })

    it('vale per le altre forme spezzate che si incontrano ovunque', () => {
        expect(talosTrovaElemento([el(0, 'E-mail')], 'email').esito).toBe('trovato')
        expect(talosTrovaElemento([el(0, 'Non disturbare')], 'nondisturbare').esito).toBe('trovato')
        expect(talosTrovaElemento([el(0, 'Play Store')], 'playstore').esito).toBe('trovato')
    })

    it('⛔ AL CONTRARIO: togliere gli spazi non fa combaciare tutto', () => {
        // «cane» e «can e» sì; «cane» e «bottone» no, anche senza spazi.
        expect(talosTrovaElemento([el(0, 'Bluetooth')], 'wifi').esito).toBe('assente')
        expect(talosTrovaElemento([el(0, 'Impostazioni')], 'sticker').esito).toBe('assente')
    })
})

describe('⛔⛔ quando due combaciano UGUALE non si sceglie', () => {
    it('due etichette identiche danno `ambiguo`, non la prima', () => {
        const esito = talosTrovaElemento([el(0, 'Salva'), el(1, 'Salva')], 'salva')
        expect(esito.esito).toBe('ambiguo')
        if (esito.esito === 'ambiguo') expect(esito.candidati).toHaveLength(2)
    })

    it('⭐ ma una corrispondenza MIGLIORE vince, e non è ambiguità', () => {
        // «Adesivi» esatto batte «Pannello adesivi e emoji» che lo contiene.
        const esito = talosTrovaElemento(
            [el(0, 'Pannello adesivi e emoji'), el(1, 'Adesivi')],
            'adesivi',
        )
        expect(esito.esito).toBe('trovato')
        if (esito.esito === 'trovato') expect(esito.elemento.indice).toBe(1)
    })

    it('⛔ i gradini sono NETTI, se no l\'ambiguità sparisce dove serve', () => {
        // Due contenimenti diversi ma dello stesso grado: si chiede.
        const esito = talosTrovaElemento(
            [el(0, 'Impostazioni audio'), el(1, 'Impostazioni schermo')],
            'impostazioni',
        )
        expect(esito.esito).toBe('ambiguo')
    })
})

describe('⭐ gli ordinali — «il primo contatto»', () => {
    const chat = [
        el(0, 'Cerca', { inLista: false }),
        el(1, 'Mario', { inLista: true }),
        el(2, 'Giulia', { inLista: true }),
        el(3, 'Paolo', { inLista: true }),
    ]

    it('legge l\'ordinale dalla frase', () => {
        expect(talosLeggiOrdinale('apri il primo contatto')).toBe('primo')
        expect(talosLeggiOrdinale('tocca la seconda chat')).toBe('secondo')
        expect(talosLeggiOrdinale("scrivi all'ultimo")).toBe('ultimo')
        expect(talosLeggiOrdinale('apri WhatsApp')).toBe(null)
    })

    it('⭐ «il primo» è il primo IN LISTA, non il primo dello schermo', () => {
        // `Cerca` è l'indice 0 ma non è in lista: non è «il primo contatto».
        const primo = talosNesimoInLista(chat, 'primo')
        expect(primo?.etichetta).toBe('Mario')
    })

    it('«l\'ultimo» è l\'ultimo VISIBILE, non l\'ultimo del dataset', () => {
        expect(talosNesimoInLista(chat, 'ultimo')?.etichetta).toBe('Paolo')
    })

    it('⛔ «il terzo» quando ce ne sono due NON è «il secondo»: è null', () => {
        const corti = [el(0, 'Mario', { inLista: true }), el(1, 'Giulia', { inLista: true })]
        expect(talosNesimoInLista(corti, 'terzo')).toBe(null)
        expect(talosNesimoInLista(corti, 'secondo')?.etichetta).toBe('Giulia')
    })

    it('⛔ senza niente in lista non si ripiega sugli sparsi', () => {
        const barra = [el(0, 'Invia'), el(1, 'Allega')]
        expect(talosNesimoInLista(barra, 'primo')).toBe(null)
    })

    it('⛔ un elemento muto non è «il primo»: non si può nominare', () => {
        const conMuto = [
            el(0, '', { inLista: true }),
            el(1, 'Mario', { inLista: true }),
        ]
        expect(talosNesimoInLista(conMuto, 'primo')?.etichetta).toBe('Mario')
    })
})
