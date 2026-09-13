// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * Owner 2026-07-26: "dal pulsante più e il pulsante microfono venisse eliminato
 * il container, vorrei che ci fosse solo l'icona — però quando il pulsante
 * microfono diventa send viene mantenuto esattamente così con il container."
 *
 * So the boundary is the point of this file. Bare icon for the two RESTING
 * controls; the filled pill stays for send, and for stop and dictating, because
 * those are states where the button is the thing you are about to press or the
 * thing you must be able to find in a hurry.
 *
 * The touch target does NOT change. Removing a border is a visual choice;
 * shrinking a 44px target is an accessibility regression, and the project
 * enforces 44px elsewhere already.
 */
describe('composer icon buttons', () => {
    /** Every `<Button …>` opening tag that carries the given aria-label. */
    function buttonsLabelled(source: string, label: string): string[] {
        const found: string[] = []
        for (const match of source.matchAll(/<Button\b[\s\S]*?>/g)) {
            if (match[0].includes(`aria-label="${label}"`)) found.push(match[0])
        }
        return found
    }

    async function composerSource(): Promise<string> {
        const module = await import('@/components/chat/TalosMobileComposer.vue?raw')
        return module.default as unknown as string
    }

    function regolaCss(selettore: string): string {
        const css = readFileSync('src/style.css', 'utf8')
        const inizio = css.indexOf(selettore + ' {')
        if (inizio < 0) return ''
        const fine = css.indexOf('}', inizio)
        return css.slice(inizio, fine < 0 ? undefined : fine)
    }
    /**
     * ⛔ Owner 2026-09-13, dal Pad: «il tasto piu' SENZA bordo rotondo, alla
     * sinistra del campo di input». Il nome di questo caso prometteva «forma
     * tonda» e non verificava nessuna forma: guardava solo la variante. Un nome
     * piu' largo di cio' che la guardia controlla e' come non averla.
     */
    it('il + sta accanto al campo, senza cerchio e senza fondo pieno', async () => {
        const buttons = buttonsLabelled(await composerSource(), "$t('chat.addToChat')")
        expect(buttons.length).toBeGreaterThan(0)
        for (const button of buttons) {
            expect(button, button).not.toContain('variant="outline"')
            expect(button, button).toContain('variant="ghost"')
        }
        const regola = regolaCss('.talos-composer-field-row .talos-plus-btn')
        expect(regola).toContain('border-radius: var(--talos-radius-control);')
        expect(regola).toContain('background: transparent;')
        expect(regola).not.toContain('border-radius: 50%')
    })

    /**
     * ⛔ Aggiornato il 2026-09-13: l'owner ha chiesto un comando solo, accanto
     * al campo — microfono a vuoto, invio col testo. Il contenitore pieno resta
     * suo in ogni stato, perche' e' il pulsante che si cerca di fretta.
     */
    /**
     * ⛔ QUARTO giro, 2026-09-13, e la storia sta qui per intero perché altrimenti
     * sembrerebbe che qualcuno abbia rotto una regola invece di sostituirla:
     *   1. contenitore pieno, un comando solo accanto al campo;
     *   2. «microfono SENZA container, solo icona come il tasto +» — contenitore
     *      tolto di proposito dall'owner;
     *   3. → oggi: «rimetti i pulsanti microfono e send nel container accent con
     *      border radius del container chat composer».
     *
     * Resta vero ciò che non è stato revocato: UN comando solo a destra
     * (microfono a vuoto, invio col testo) e nessun pulsante microfono in più.
     * Cambia il vestito: fondo accento, e il raggio preso dal token del
     * CONTENITORE, misurato identico sul Pad (12px su entrambi).
     */
    it('owner 2026-09-13: un comando solo a destra, in un contenitore accento', async () => {
        const source = await composerSource()
        expect(buttonsLabelled(source, 'microphoneLabel')).toHaveLength(0)
        expect(source).not.toContain('talos-composer-append-mic')
        const send = buttonsLabelled(source, 'rightActionLabel')[0]
        expect(send).toContain('talos-send-btn')
        const regola = regolaCss('.talos-calm-composer .talos-send-btn')
        expect(regola).toContain('background: var(--talos-accent);')
        expect(regola).toContain('border-radius: var(--talos-radius-card);')
        expect(regola).toContain('justify-content: center;')
        // ⛔ Il verso contrario: il fondo trasparente del terzo giro non deve
        //    sopravvivere nella regola di base, o la cura sarebbe inerte.
        expect(regola).not.toContain('background: transparent;')
    })

    /**
     * ⛔⛔ LA GUARDIA CHE MANCAVA, ed è per questo che la regressione è passata.
     * «Forma della barra di scrittura» offre tre forme e il PREDEFINITO è
     * «Compatto», descritto alla persona come «una riga a riposo, si espande
     * quando scrivi». Il compositore Calm del 12/09 aveva smesso di guardare i
     * flag di forma — lo dichiarava lui stesso in testa a composerStyle.ts — e
     * nessun test se ne è accorto: tre voci nelle Impostazioni, nessun effetto.
     * ⇒ Qui si prova che lo stato compatto ESISTE nel componente e che il CSS
     * gli dà davvero UNA riga, invece dei 5rem di minimo che aveva prima.
     */
    /**
     * ⛔⛔ VISTO SUL PAD, NON NEI TEST — e il difetto l'avevo introdotto io lo
     * stesso giorno. Dopo aver toccato il «+», il suo fondo grigio RESTAVA
     * acceso: su uno schermo tattile il puntatore non se ne va mai davvero
     * dall'elemento toccato, quindi `:hover` rimane appiccicato finché non si
     * tocca altrove. Il microfono sembrava sano solo perché non l'avevo ancora
     * toccato — cioè il campione escludeva il caso che smentiva.
     *
     * ⇒ Le regole di sorvolo valgono solo dove un sorvolo esiste davvero. Questa
     * guardia pretende che stiano DENTRO la loro media query: se qualcuno le
     * sfila, il pulsante torna a restare acceso sul telefono e nessuno se ne
     * accorgerebbe da un test che guarda solo il DOM.
     */
    /**
     * ⛔⛔ L'OWNER L'HA CHIESTO GUARDANDO IL PAD: «è allineato in maniera
     * coerente?». La risposta era no: alla riga del campo avevo dato un rientro
     * proprio che alla riga degli strumenti sotto non avevo dato, così il «+»
     * partiva ~37 px reali più a destra dell'icona del modello. Due righe della
     * stessa scheda che non condividono il bordo sinistro si leggono come
     * storte, anche senza sapere perché.
     *
     * ⛔ RADDRIZZATA lo stesso giorno: fra le asserzioni ne avevo infilata una
     * sull'allineamento VERTICALE, che col bordo sinistro non c'entra niente. Un
     * paio d'ore dopo ho cambiato apposta quella proprietà — i comandi si
     * ancorano alla prima riga quando il campo è espanso — e la guardia è
     * diventata rossa difendendo una forma abbandonata. Una guardia che verifica
     * un asse diverso dal proprio nome è destinata a mentire prima o poi.
     * ⇒ Qui resta SOLO il bordo sinistro. Il verticale ha la sua guardia, sotto.
     */
    it('le due righe del compositore condividono il bordo sinistro', () => {
        const riga = regolaCss('.talos-composer-field-row')
        expect(riga).not.toContain('padding-inline: var(--talos-space-inline)')

        const campo = regolaCss('.talos-composer-field-row .talos-calm-prompt')
        expect(campo).toContain('padding: 0;')

        // la prima pastiglia della riga sotto non rientra a sua volta
        const chip = regolaCss('.talos-composer-tools > .talos-model-chip:first-child')
        expect(chip).toContain('padding-inline-start: 0;')
    })

    /**
     * ⛔ L'asse verticale, riscritto il 13/09 su ordine dell'owner: «i pulsanti e
     * il testo non sono centrati bene nel container composer» e poi «fai in modo
     * che i bottoni siano centrati anche in modalità non compatta quando ci sto
     * scrivendo dentro».
     *
     * ⇒ Centrato è la REGOLA. L'ancora alla prima riga resta l'eccezione per il
     * testo alto (oltre 2,5 righe, la soglia che il compositore misura già per
     * il pulsante «espandi»): lì centrare porterebbe «+» e microfono a metà di
     * un campo da dodici righe, lontani dalla riga che si sta scrivendo.
     *
     * Misure sul Pad in verticale, prima della cura: contenitore 828,8-902,3
     * (centro 865,5), comandi centrati a 848,7 — 16,8 px più in alto, e 4 px
     * FUORI dal riquadro. Dopo: scarto 0,0 e 0,0.
     */
    it('i comandi sono centrati, e si ancorano alla prima riga solo col testo alto', () => {
        const riga = regolaCss('.talos-composer-field-row')
        expect(riga).toContain('align-items: center;')
        // ⛔ Il verso contrario: la regola generale NON deve ancorare in cima,
        //    o la cura sarebbe scritta e inerte.
        expect(riga).not.toContain('align-items: flex-start;')

        const css = readFileSync('src/style.css', 'utf8')
        // ⛔ Il verso contrario, ed e' quello che morde: NESSUNA eccezione deve
        //    rimettere l'ancora in cima: e' proprio quella che l'owner ha visto
        //    sul Pad mentre scriveva, dopo la prima cura.
        expect(css).not.toContain('is-prompt-tall')
        // ⛔ E il margine che appendeva i comandi alla prima riga non deve
        //    sopravvivere da nessuna parte: se restasse, contraddirebbe la
        //    centratura dieci righe piu' giu'.
        expect(css).not.toContain('margin-block-start: calc((var(--talos-line-prompt')
    })

    /**
     * ⛔ Owner 2026-09-13: sul Pad l'ultima riga del testo si vedeva tagliata a
     * meta' (campo 192 px, riga 25,6 → 7,5 righe, resto 12,8). La scatola deve
     * valere un numero INTERO di righe: tetto arrotondato in giu', contenuto in
     * su. E il padding va tolto prima di contare le righe, perche' scrollHeight
     * lo include (css-tricks, «Auto-Growing Inputs & Textareas»).
     */
    it('il campo vale sempre un numero intero di righe, mai mezza', async () => {
        const source = await composerSource()
        expect(source).toContain('const tetto = aRighe(12 * rem, Math.floor)')
        expect(source).toContain('const contenuto = aRighe(field.scrollHeight, Math.ceil)')
        expect(source).toContain("Number.parseFloat(stile.paddingTop)")
        // ⛔ Il verso contrario: l'altezza NON si prende piu' grezza dal
        //    contenuto, o l'arrotondamento sarebbe scritto e scavalcato.
        expect(source).not.toContain('Math.min(field.scrollHeight, 12 * rem)')
    })

    /**
     * ⛔ E la scatola: a riposo vale UNA riga, altrimenti centrare non basterebbe
     * — resterebbe l'aria sotto il testo che l'owner ha visto. Il pavimento di
     * 3,5rem serve al campo che cresce, non a quello fermo.
     */
    it('a riposo il campo vale una riga, non il pavimento del campo che cresce', async () => {
        const source = await composerSource()
        // a riposo il pavimento E' la riga: una riga, non un blocco di 3,5rem
        expect(source).toContain('const floor = composerCompact.value ? riga :')
        expect(source).toContain("const riga = Number.parseFloat(stile.lineHeight)")
        // il pavimento alto resta per lo stato in cui si scrive davvero
        expect(source).toContain('(props.docked ? 3.5 : 5) * rem')
    })

    /**
     * ⛔ Owner 13/09: «rimetti i pulsanti microfono e send nel container accent
     * con border radius del container chat composer». Il raggio era gia' quello
     * giusto (stesso token del contenitore, 12px misurati su entrambi sul Pad):
     * qui si guarda il FONDO, che era trasparente.
     */
    it('il comando di destra vive in un contenitore accento, col raggio del compositore', () => {
        const regola = regolaCss('.talos-calm-composer .talos-send-btn')
        expect(regola).toContain('background: var(--talos-accent);')
        expect(regola).toContain('color: var(--talos-accent-text);')
        // il raggio viene dal token del CONTENITORE, non da un numero scritto a mano
        expect(regola).toContain('border-radius: var(--talos-radius-card);')
        expect(regola).not.toContain('background: transparent;')
        // ⛔ Il verso contrario: spento, NON deve sembrare acceso.
        const spento = regolaCss('.talos-calm-composer .talos-send-btn:disabled')
        expect(spento).toContain('background: transparent;')
        expect(spento).toContain('opacity: .5;')
    })

    it('le regole di sorvolo dei due comandi non valgono al tocco', () => {
        const css = readFileSync('src/style.css', 'utf8')
        expect(css).toContain('@media (hover: hover) and (pointer: fine) {\n    .talos-composer-field-row .talos-plus-btn:hover')
        expect(css).toContain('@media (hover: hover) and (pointer: fine) {\n    .talos-calm-composer .talos-send-btn:hover')
    })

    it('la forma COMPATTA esiste e vale una riga a riposo', async () => {
        const source = await composerSource()
        // lo stato dipende dal flag di forma, dal fuoco, dal testo e dagli allegati
        expect(source).toContain('props.immersiveComposer')
        expect(source).toContain('composerFocused')
        // a riposo la riga degli strumenti NON si disegna
        expect(source).toContain('v-if="!composerCompact"')
        const css = readFileSync('src/style.css', 'utf8')
        expect(css).toContain('.talos-calm-composer.is-compact .talos-calm-prompt')
        expect(css).toContain('min-height: 1.75rem;')
    })

    it('keeps the 44px touch target on both controls', async () => {
        const source = await composerSource()
        // Removing a border is a visual choice; shrinking a 44px target is an
        // accessibility regression, and this project enforces 44px elsewhere.
        for (const button of buttonsLabelled(source, "$t('chat.addToChat')")) {
            expect(button, button).toContain('min-h-touch')
        }
        expect(source).toMatch(/rightActionLabel[\s\S]{0,400}?min-h-touch/)
    })
})
