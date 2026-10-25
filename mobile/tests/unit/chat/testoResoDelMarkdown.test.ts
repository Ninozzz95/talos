// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { parserDelTestoReso, testoResoDelMarkdown } from '@/lib/chat/testoReso'
import { renderTalosMarkdown } from '@/lib/talosMessageMarkdown'

/*
 * Revisione del blocco 3 (Desktop (3), S4) e owner 24/10/2026 «Testo reso, pulito»: il foglio «Seleziona testo» mostra il testo
 * come appare nel messaggio, senza i simboli del Markdown. Lo ricava dagli STESSI token di markdown-it che disegnano il messaggio,
 * non da espressioni regolari: così ciò che si copia combacia con ciò che si vede.
 */
describe('testoResoDelMarkdown', () => {
    it('TRM-01 grassetto, corsivo, codice in riga e titoli perdono i simboli e tengono le parole', () => {
        expect(testoResoDelMarkdown('## Esito\n\nLa nota dice **ciao** e *basta*, apri `NOTA.md`.'))
            .toBe('Esito\n\nLa nota dice ciao e basta, apri NOTA.md.')
    })

    it('TRM-02 un blocco di codice resta intero, senza recinto né lingua', () => {
        expect(testoResoDelMarkdown('Prova:\n\n```ts\nconst x_y = 1\n**non grassetto**\n```\n\nFine.'))
            .toBe('Prova:\n\nconst x_y = 1\n**non grassetto**\n\nFine.')
    })

    it('TRM-03 gli elenchi tengono un segno per voce e la numerazione', () => {
        expect(testoResoDelMarkdown('Passi:\n\n1. apri\n2. **salva**\n\n- uno\n- due'))
            .toBe('Passi:\n\n1. apri\n2. salva\n\n• uno\n• due')
    })

    it('TRM-04 una tabella diventa righe con le celle separate da tabulazioni', () => {
        expect(testoResoDelMarkdown('| A | B |\n|---|---|\n| **1** | 2 |'))
            .toBe('A\tB\n1\t2')
    })

    // revisione del blocco 4, S4: l'indirizzo di un collegamento scritto non si perde più nella selezione
    it('TRM-05 i collegamenti diventano «testo (indirizzo)»; a capo singoli del modello restano a capo', () => {
        expect(testoResoDelMarkdown('Vedi [la guida](https://example.com/g)\nseconda riga'))
            .toBe('Vedi la guida (https://example.com/g)\nseconda riga')
    })

    it('TRM-06 un testo senza Markdown resta identico', () => {
        expect(testoResoDelMarkdown('Leggi NOTA.md e dimmi cosa dice')).toBe('Leggi NOTA.md e dimmi cosa dice')
    })

    /*
     * Revisione del blocco 4 (Desktop), riserve S4: «gli stessi token» valeva quasi. Il renderer (`talosMessageMarkdown.ts`) riconosce
     * `<br>` come a capo e non fa collegamenti dei nomi di file; il testo reso non lo faceva.
     */
    it('TRM-07 `<br>` è un a capo come a schermo; in una cella diventa uno spazio, così la riga resta una riga del foglio', () => {
        expect(testoResoDelMarkdown('uno<br>due<BR/>tre')).toBe('uno\ndue\ntre')
        expect(testoResoDelMarkdown('| A | B |\n|---|---|\n| Autonomous<br>· Large-repo | 2 |')).toBe('A\tB\nAutonomous · Large-repo\t2')
        // ⛔ verso contrario: nessun altro tag si riconosce, resta testo
        expect(testoResoDelMarkdown('x <b>y</b> <script>z</script>')).toBe('x <b>y</b> <script>z</script>')
    })

    it('TRM-08 i nomi di file non diventano collegamenti, come nel renderer; ⛔ un dominio vero sì', () => {
        const trovati = (parserDelTestoReso.linkify.match('apri NOTA.md, poi script.py e vedi example.com') ?? []).map((m) => m.text)
        expect(trovati).toEqual(['example.com'])
        // lo stesso giudizio del renderer che disegna il messaggio
        expect(renderTalosMarkdown('apri NOTA.md, poi script.py').html).not.toContain('<a ')
        expect(renderTalosMarkdown('vedi example.com').html).toContain('<a ')
    })

    it('TRM-09 un indirizzo scritto per intero, tra <> o riconosciuto da solo resta una volta; un collegamento non ammesso resta com\'è scritto', () => {
        expect(testoResoDelMarkdown('vai su https://example.com/a e <https://a.example/c> o example.com'))
            .toBe('vai su https://example.com/a e https://a.example/c o example.com')
        expect(testoResoDelMarkdown('[https://example.com/a](https://example.com/a)')).toBe('https://example.com/a')
        // come `isAllowedLink` del renderer: niente ftp:, quindi niente collegamento e il testo resta quello scritto
        expect(testoResoDelMarkdown('[file](ftp://example.com/x)')).toBe('[file](ftp://example.com/x)')
    })

    it('TRM-10 un recinto primo figlio di una voce d\'elenco porta il segno; ⛔ il segno non resta appeso alla riga dopo', () => {
        expect(testoResoDelMarkdown('- ```js\n  const a = 1\n  ```\n  dopo\n- due'))
            .toBe('• const a = 1\ndopo\n• due')
    })
})
