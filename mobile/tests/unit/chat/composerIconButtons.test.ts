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
        // owner 27/10/2026 (mockup approvato): il microfono, ora un comando suo, veste come il «+»
        const regola = regolaCss('.talos-composer-field-row .talos-plus-btn, .talos-composer-field-row .talos-mic-btn')
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
    /*
     * ⛔ QUINTO giro, owner 27/10/2026 («Approvato», mockup del compositore v6/v7): il microfono torna un comando SUO, sola
     * icona come il «+», sempre accanto all'invio; l'invio (o Ferma) resta l'unico pieno accento, ora TONDO. Resta vero:
     * un microfono solo (niente «append-mic») e un invio solo.
     */
    it('owner 27/10/2026: microfono suo, sola icona; a destra un comando solo, tondo e accento', async () => {
        const source = await composerSource()
        expect(buttonsLabelled(source, 'microphoneLabel')).toHaveLength(0)
        expect(source).not.toContain('talos-composer-append-mic')
        const microfoni = buttonsLabelled(source, "$t('chat.dictate')")
        expect(microfoni).toHaveLength(1)
        expect(microfoni[0]).toContain('talos-mic-btn')
        expect(microfoni[0]).not.toContain('talos-send-btn')
        const send = buttonsLabelled(source, 'rightActionLabel')
        expect(send).toHaveLength(1)
        expect(send[0]).toContain('talos-send-btn')
        const regola = regolaCss('.talos-calm-composer .talos-send-btn')
        expect(regola).toContain('background: var(--talos-accent);')
        expect(regola).toContain('border-radius: 50%;')
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
        // ⛔ Il contenuto sale di riga solo OLTRE l'errore di misura del browser:
        //    scrollHeight e' un intero, quindi una riga da 25,6 px viene
        //    dichiarata 26 e senza tolleranza diventa due righe (misurato sul Pad).
        expect(source).toContain('const contenuto = aRighe(field.scrollHeight, Math.ceil, TOLLERANZA_RIGA)')
        // ⛔ E il verso contrario: il TETTO non deve avere tolleranza, o si
        //    abbasserebbe di una riga quando e' gia' un multiplo esatto.
        expect(source).not.toContain('aRighe(12 * rem, Math.floor, TOLLERANZA_RIGA)')
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
        // ⛔ Il pavimento della barra agganciata e' UNA riga, sempre: a riposo e
        //    mentre si scrive. Non dipende piu' dallo stato compatto — owner
        //    13/09, «il composer espanso e' troppo alto».
        expect(source).toContain('const floor = props.docked ? riga : 3 * riga')
        expect(source).toContain("const riga = Number.parseFloat(stile.lineHeight)")
        // ⛔ Il pavimento si conta in RIGHE, non in rem: a riposo una, a fuoco
        //    due. In rem non era un multiplo della riga, e il campo vuoto finiva
        //    a tre righe (76,8 px misurati sul Pad) — «troppo alto», owner 13/09.
        expect(source).toContain('const floor = props.docked ? riga : 3 * riga')
        expect(source).not.toContain('(props.docked ? 3.5 : 5) * rem')
        expect(source).not.toContain('(props.docked ? 2 : 3) * riga')
        // ⛔ E il pavimento CSS va tolto PRIMA di misurare: scrollHeight lo
        //    include, quindi un campo vuoto dichiarava 56 px di contenuto che non
        //    c'e', e arrotondati in su diventavano tre righe. Senza questa riga
        //    la cura dell'altezza si annulla da sola.
        expect(source).toContain("field.style.minHeight = '0px'")
        expect(source).toContain('field.style.minHeight = minimoScritto')
    })

    /**
     * ⛔ Owner 13/09: «rimetti i pulsanti microfono e send nel container accent
     * con border radius del container chat composer». Il raggio era gia' quello
     * giusto (stesso token del contenitore, 12px misurati su entrambi sul Pad):
     * qui si guarda il FONDO, che era trasparente.
     */
    it('il comando di destra vive in un contenitore accento, tondo (owner 27/10/2026, mockup approvato)', () => {
        const regola = regolaCss('.talos-calm-composer .talos-send-btn')
        expect(regola).toContain('background: var(--talos-accent);')
        expect(regola).toContain('color: var(--talos-accent-text);')
        expect(regola).toContain('border-radius: 50%;')
        // e il compositore ha un raggio suo, fisso: su due righe resta uno «stadio»
        expect(regolaCss('.talos-calm-composer')).toContain('border-radius: 1.5rem;')
        expect(regola).not.toContain('background: transparent;')
        // ⛔ Il verso contrario: spento, NON deve sembrare acceso — accento sbiadito, come nel mockup approvato (owner 27/10/2026)
        const spento = regolaCss('.talos-calm-composer .talos-send-btn:disabled')
        expect(spento).toContain('opacity: .4;')
    })

    it('le regole di sorvolo dei due comandi non valgono al tocco', () => {
        const css = readFileSync('src/style.css', 'utf8')
        expect(css).toContain('@media (hover: hover) and (pointer: fine) {\n    .talos-composer-field-row .talos-plus-btn:hover')
        expect(css).toContain('@media (hover: hover) and (pointer: fine) {\n    .talos-calm-composer .talos-send-btn:hover')
    })

    // owner 27/10/2026, «Unico, tolgo le forme»: la forma compatta è l'unica; non c'è più un flag di forma (FORMA-01..04)
    it('la forma COMPATTA è l\'unica e vale una riga a riposo', async () => {
        const source = await composerSource()
        // lo stato dipende solo dal fuoco e dagli allegati
        expect(source).not.toContain('props.immersiveComposer')
        expect(source).toContain('composerFocused')
        // a riposo la riga degli strumenti NON si disegna
        expect(source).toContain('v-if="!composerCompact"')
        const css = readFileSync('src/style.css', 'utf8')
        expect(css).toContain('.talos-calm-composer.is-compact .talos-calm-prompt')
        expect(css).toContain('min-height: 1.75rem;')
    })

    /**
     * ⛔ COD-COMP-03 — owner 13/10/2026, dal Pad, guardando il Codice: «la riga testo non è allineata nel compositore come
     * nella chat, bisogna allinearla al millimetro, anzi deve essere lo stesso componente».
     *
     * MISURATO sul Pad, stesso testo, campo a fuoco: nella chat il campo è alto 28 px e il centro del testo coincide col
     * centro di «+» e Invia (384 px); nel Codice il campo è alto 80 px, il testo sta in cima (762) e i pulsanti al centro
     * (790): 28 px di scarto. Il componente È lo stesso; ma il «pavimento a una riga» stava nel CSS sotto
     * `.talos-docked-composer`, un contenitore che esiste solo nella schermata della chat. Il Codice passava
     * `docked` al componente e il CSS non lo sapeva. ⇒ Il pavimento segue il componente (`is-docked`), non chi lo ospita.
     */
    it('COD-COMP-03: il pavimento a una riga del campo dipende dal componente (is-docked), non dal contenitore della chat', async () => {
        const source = await composerSource()
        expect(source).toContain("'is-docked': docked")
        const css = readFileSync('src/style.css', 'utf8')
        expect(css).toContain('.talos-calm-composer.is-docked .talos-calm-prompt { min-height: 1.75rem; }')
        // nessuna regola del campo può più dipendere dal contenitore che ha solo la chat
        expect(css).not.toMatch(/\.talos-docked-composer\s+[^{]*\.talos-calm-prompt/)
    })

    /**
     * COD-COMP-04 — owner 13/10/2026: «vorrei che il compositore in modalità tablet landscape sia meno largo» → scelta: 672
     * punti, uguale in chat e Codice. MISURATO sul Pad prima: chat 768, Codice 894 (aveva un suo limite, 920). Un valore
     * solo (`--talos-composer-max-width`), letto dal componente e dal contenitore del Codice.
     */
    it('COD-COMP-04: sul tablet in orizzontale il compositore è largo al più 42rem (672 px), con lo stesso valore in chat e nel Codice', () => {
        const css = readFileSync('src/style.css', 'utf8')
        expect(css).toMatch(/@media \(orientation: landscape\) and \(min-width: 1000px\) \{\s*:root \{ --talos-composer-max-width: 42rem; \}/)
        expect(css).toContain('.talos-calm-composer.is-docked { max-width: var(--talos-composer-max-width, none); margin-inline: auto; }')
        const codice = readFileSync('src/screens/HarnessSessionScreen.vue', 'utf8')
        expect(codice).toContain('max-width: var(--talos-composer-max-width, 920px);')
        expect(codice.split('max-width: 920px').length - 1).toBe(0)
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
