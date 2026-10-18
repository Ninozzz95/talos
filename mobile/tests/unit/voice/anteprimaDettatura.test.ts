import { describe, expect, it } from 'vitest'
import { talosAnteprimaDettatura } from '@/lib/voice/anteprimaDettatura'

/*
 * ⛔ Owner 18/10/2026 notte, dal telefono: «il testo quando parlo si vede … ma si blocca a metà quando premi invio però si vede tutto
 * formattato bene». Le parole vive del sistema arrivano in ritardo (misurato il 13/10); owner: «Parakeet aggiorna l'anteprima alle
 * pause». Questa è la regola che unisce i due testi senza perdere né doppiare (ledger LEDGER-DETTATURA-ANTEPRIMA-FUORI-2026-10-18).
 */
describe('anteprima della dettatura: Parakeet alle pause, il sistema nel mezzo', () => {
    it('ANT-DET-01 senza rilettura l anteprima è il testo del sistema', () => {
        expect(talosAnteprimaDettatura({ riletto: null, sistemaAllaRilettura: '', sistema: 'ok grazie' })).toBe('ok grazie')
    })

    it('ANT-DET-02 la rilettura di Parakeet prende il posto del sistema, anche se il sistema era indietro', () => {
        expect(talosAnteprimaDettatura({
            riletto: 'Ok, grazie dell\'informazione, valuterò da me.', sistemaAllaRilettura: 'Ok grazie dell\'informazione', sistema: 'Ok grazie dell\'informazione',
        })).toBe('Ok, grazie dell\'informazione, valuterò da me.')
    })

    it('ANT-DET-03 le parole del sistema arrivate dopo la rilettura si accodano, senza doppiare quelle che Parakeet ha già scritto', () => {
        // il sistema arriva in ritardo: dopo la rilettura manda ancora la coda della frase che Parakeet ha già scritto
        const riletto = 'Ok, grazie dell\'informazione, valuterò da me.'
        const base = 'Ok grazie dell\'informazione'
        expect(talosAnteprimaDettatura({ riletto, sistemaAllaRilettura: base, sistema: `${base} valuterò da me` })).toBe(riletto)
        // e poi le parole davvero nuove, dopo la pausa
        expect(talosAnteprimaDettatura({ riletto, sistemaAllaRilettura: base, sistema: `${base} valuterò da me e poi ti dico` }))
            .toBe(`${riletto} e poi ti dico`)
    })

    /*
     * ⛔ ANT-DET-05 — visto sul Pad il 18/10/2026 (frase con pausa dall'altoparlante): dopo la rilettura il sistema, in ritardo, ha
     * mandato «mi hai dato», che sta DENTRO la coda di Parakeet («…che mi hai dato oggi.») e non alla fine: per 600 ms l'anteprima
     * diceva «…oggi. mi hai dato». Parole già scritte da Parakeet nella sua coda non si accodano, ovunque cadano.
     */
    it('ANT-DET-05 parole del sistema in ritardo che stanno DENTRO la coda di Parakeet (non alla fine) non si accodano', () => {
        const riletto = 'Va bene, grazie per tutte le informazioni che mi hai dato oggi.'
        const base = 'va bene grazie per tutte le informazioni che'
        expect(talosAnteprimaDettatura({ riletto, sistemaAllaRilettura: base, sistema: `${base} mi` })).toBe(riletto)
        expect(talosAnteprimaDettatura({ riletto, sistemaAllaRilettura: base, sistema: `${base} mi hai dato` })).toBe(riletto)
        // dentro la coda e poi parole nuove: si accodano solo le nuove
        expect(talosAnteprimaDettatura({ riletto, sistemaAllaRilettura: base, sistema: `${base} mi hai dato oggi adesso` }))
            .toBe(`${riletto} adesso`)
    })

    /*
     * ⛔ ANT-DET-06 — visto sul Pad il 18/10/2026, seconda corsa: dopo la pausa il sistema ha aperto il tratto nuovo SENZA annunciare
     * la chiusura del primo, quindi il suo testo («con calma e domani…») non cominciava più con quello di prima. Trattato come
     * «riscritto», l'anteprima è rimasta ferma per 7 secondi: il blocco segnalato dall'owner. Le parole valgono come nuove, tolte
     * quelle che Parakeet ha già scritto in qualunque punto.
     */
    it('ANT-DET-06 un tratto nuovo non annunciato si accoda; una riscrittura delle stesse parole no', () => {
        const riletto = 'Va bene, grazie per tutte le informazioni che mi hai dato oggi.'
        const base = 'va bene grazie per tutte le informazioni che mi'
        expect(talosAnteprimaDettatura({ riletto, sistemaAllaRilettura: base, sistema: 'con calma e domani' }))
            .toBe(`${riletto} con calma e domani`)
        expect(talosAnteprimaDettatura({ riletto, sistemaAllaRilettura: base, sistema: 'va bene grazie per tutte' })).toBe(riletto)
    })

    it('ANT-DET-04 maiuscole, accenti uguali e punteggiatura non contano nel confronto; un sistema che riscrive da capo non si accoda', () => {
        expect(talosAnteprimaDettatura({ riletto: 'Domani, a Messina.', sistemaAllaRilettura: 'domani', sistema: 'domani a messina piove' }))
            .toBe('Domani, a Messina. piove')
        // il testo del sistema non comincia più con quello di prima: le parole che Parakeet non ha scritto si vedono (ANT-DET-06,
        // Pad 18/10: ignorarle teneva ferma l'anteprima); quelle già scritte no
        expect(talosAnteprimaDettatura({ riletto: 'Domani, a Messina.', sistemaAllaRilettura: 'domani a messina', sistema: 'dunque' }))
            .toBe('Domani, a Messina. dunque')
        expect(talosAnteprimaDettatura({ riletto: 'Domani, a Messina.', sistemaAllaRilettura: 'domani a messina', sistema: 'domani a' }))
            .toBe('Domani, a Messina.')
    })
})
