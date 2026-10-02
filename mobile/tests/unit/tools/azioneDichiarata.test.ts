import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { talosAzioneDichiarata } from '@/lib/tools/azioneDichiarata'

/*
 * ⭐⭐ P4-quinquies — l'azione dichiarata ma non eseguita (owner 02/10/2026: «Riprova, poi avviso», «Tutti i modelli»,
 * «Frasi di esito, deterministico»). Caso del Pad: Spark-X2.5-4B, «salvami una nota: comprare il pane domani» ⇒
 * «Salvato la nota ✅» senza nessuna chiamata. Il rilevatore guarda SOLO il testo; il ciclo lo interroga solo quando
 * nel turno non è partito nessuno strumento. Ledger: `.claude/ragionamento/LEDGER-P4QUINQUIES-AZIONE-DICHIARATA-2026-10-02.md`.
 */
const dichiarata = (testo: string) => talosAzioneDichiarata(testo).dichiarata

describe('P4-quinquies — il rilevatore delle frasi di esito', () => {
    it('AZD-01 «Salvato la nota ✅» (la frase vera del Pad)', () => {
        expect(dichiarata('Salvato la nota ✅ «comprare il pane domani» è stata inserita nel tuo archivio.')).toBe(true)
    })

    it('AZD-02 esiti italiani con un oggetto d\'azione', () => {
        for (const frase of [
            'Ho aggiunto "comprare il pane" ai tuoi promemoria.',
            'Fatto! Ho creato l\'attività «chiamare Marco» per domani alle 18.',
            'Ho messo in agenda la cena di venerdì alle 20.',
            'Nota salvata: comprare il pane domani.',
            'Ho impostato una sveglia alle 7:00.',
            'Messaggio inviato a Giulia.',
            'Ho eliminato il promemoria del dentista.',
        ]) expect(dichiarata(frase), frase).toBe(true)
    })

    it('AZD-02b le parole che Spark ha usato davvero sul Pad per dire «nota» (02/10/2026)', () => {
        for (const frase of [
            'Mi prendo nota con piacere. Ho salvato per te la scrittura: "Comprare il pane domani", da archiviare nel mio archivio.',
            'La nota è stata salvata su un file del privato archivio di libreria, con il titolo "Salvami una nota".',
            'Ho aggiunto un ricordo per domani.',
        ]) expect(dichiarata(frase), frase).toBe(true)
    })

    it('AZD-02c «libreria» in una risposta di programmazione NON è una nota salvata', () => {
        expect(dichiarata('Ho aggiunto la libreria csv-parse al progetto e ho installato i tipi.')).toBe(false)
        expect(dichiarata('Ho creato un archivio con i test del parser.')).toBe(false)
    })

    it('AZD-03 esiti inglesi con un oggetto d\'azione', () => {
        for (const frase of [
            'I\'ve saved the note "buy bread tomorrow".',
            'Done — I added the task to your list.',
            'Reminder set for 6 pm.',
            'The event has been scheduled for Friday.',
        ]) expect(dichiarata(frase), frase).toBe(true)
    })

    it('AZD-04 domande, offerte, futuri e condizionali NON sono esiti', () => {
        for (const frase of [
            'Vuoi che salvi questa nota?',
            'Posso aggiungere un promemoria per domani, se vuoi.',
            'Salverò la nota appena mi confermi il testo.',
            'Se vuoi, potrei creare un\'attività per questo.',
            'Should I add this to your reminders?',
            'I can save the note if you confirm.',
            // ⛔ Con il PARTICIPIO dentro: senza, il filtro non era mai messo alla prova (mutante Q3 sopravvissuto).
            'Hai salvato la nota?',
            'Vuoi che ti confermi che la nota è salvata?',
            'Ti dirò quando la nota sarà salvata.',
            'Should I confirm the note is saved?',
            'I can tell you the note was saved if you confirm.',
        ]) expect(dichiarata(frase), frase).toBe(false)
    })

    it('AZD-05 i negati NON sono esiti', () => {
        for (const frase of [
            'Non ho salvato la nota: dimmi il testo esatto.',
            'La nota non è stata salvata.',
            'I have not saved the note yet.',
        ]) expect(dichiarata(frase), frase).toBe(false)
    })

    it('AZD-06 il codice dentro un blocco non conta', () => {
        expect(dichiarata('Ecco il codice:\n```ts\nconst notaSalvata = true // nota salvata ✅\n```\nProvalo pure.')).toBe(false)
    })

    it('AZD-07 nessun falso positivo sulle risposte vere del Pad (parser CSV, guida, viaggio)', () => {
        const { risposte } = JSON.parse(readFileSync(resolve(process.cwd(), 'tests/unit/tools/fixtures/risposteVereSenzaAzioni.json'), 'utf8')) as { risposte: string[] }
        expect(risposte.length).toBeGreaterThanOrEqual(9)
        for (const risposta of risposte) expect(dichiarata(risposta), risposta.slice(0, 80)).toBe(false)
    })

    it("AZD-09 «Nota:» in testa è un'etichetta, non una nota toccata (falso positivo trovato sul viaggio a Lisbona)", () => {
        expect(dichiarata('Nota: Con pioggia, la gita a Sintra è eliminata, riducendo i costi.')).toBe(false)
        expect(dichiarata('Note: the Sintra trip is removed if it rains.')).toBe(false)
        // Ma una nota vera, anche dopo un'etichetta, resta un esito.
        expect(dichiarata('Nota: ho salvato la nota con la lista della spesa.')).toBe(true)
    })

    it('AZD-08 restituisce la frase che ha fatto scattare il rilevatore', () => {
        expect(talosAzioneDichiarata('Perfetto. Salvato la nota ✅ e basta.').frase).toMatch(/Salvato la nota/)
        expect(talosAzioneDichiarata('Ciao!').frase).toBeNull()
    })
})
