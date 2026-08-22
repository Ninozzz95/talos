import { describe, expect, it } from 'vitest'
import {
    TALOS_CAPACITA_INTENT,
    talosCapacita,
    talosComponiExtra,
    talosComponiUri,
    talosConSchema,
    talosParametriMancanti,
} from '@/lib/intenti/registro'

/**
 * ⭐⭐ IL MOTORE DEGLI INTENT si prova SENZA telefono.
 *
 * È il vantaggio vero di aver fatto un registro invece di otto tool: la forma
 * di ogni URI è un dato, e un dato si controlla in un test che dura
 * millisecondi. Col pilota dello schermo la stessa garanzia costava 27,8 s di
 * corsa su un tablet vero — e falliva.
 */
describe('⭐ il registro degli intent', () => {
    it('preferisce HTTPS agli schemi custom, SALVO deroga misurata', () => {
        /*
         * ⛔ Non è estetica: `https://wa.me/…` apre il web se WhatsApp non è
         * installato, `whatsapp://` fallisce e basta. La prima via dichiarata è
         * quella che si prova per prima, quindi l'ordine È il comportamento.
         *
         * ⛔⛔ E LA DEROGA — 2026-08-13. La regola dice che l'HTTPS regge anche
         * senza l'app. Ma regge a fare COSA? Su `mappe_cerca`, misurato sul
         * Pad, `maps/search/?api=1&query=farmacia` apriva Maps e **non cercava
         * niente**: un fallimento che sembra un successo. `geo:0,0?q=` cerca.
         *
         * ⇒ Invertire si può, e costa una riga: `ordineMisurato`. Senza quel
         * campo l'inversione resta ROSSA, così un riordino per sbaglio si vede
         * e uno voluto lascia scritto perché — che è tutta la differenza.
         */
        for (const capacita of TALOS_CAPACITA_INTENT) {
            const https = capacita.vie.findIndex((v) => v.tipo === 'https')
            const schema = capacita.vie.findIndex((v) => v.tipo === 'schema')
            if (https < 0 || schema < 0) continue
            if (https < schema) {
                // ⛔ Chi rispetta la regola non deve poter tenere una deroga
                // scritta: sarebbe una spiegazione per qualcosa che non accade,
                // cioè il modo più sicuro di far invecchiare un commento.
                expect(capacita.ordineMisurato).toBeUndefined()
                continue
            }
            expect(
                capacita.ordineMisurato,
                `${capacita.id} inverte l'ordine senza dire quale misura lo giustifica`,
            ).toBeTruthy()
        }
    })

    /*
     * ⛔⛔ URI ed EXTRA hanno regole OPPOSTE sull'escape, e confonderle rompe in
     * silenzio: dentro un URI un `&` non codificato dirotta i parametri, dentro
     * un extra un `%20` arriva **a schermo** come `%20` e la persona legge il
     * proprio messaggio pieno di percentuali.
     */
    it('⛔ gli EXTRA non si codificano — al contrario degli URI', () => {
        const traduci = talosCapacita('traduci')!
        const via = traduci.vie[0]
        expect(via.tipo).toBe('azione')
        const extra = talosComponiExtra(via as never, { testo: 'vieni? sì & poi' })
        expect(extra['android.intent.extra.TEXT']).toBe('vieni? sì & poi')
        // E il verso opposto resta com'era: nell'URI si codifica eccome.
        const wa = talosCapacita('whatsapp_messaggio')!
        expect(talosComponiUri(wa.vie[0] as never, { numero: '39333', testo: 'a & b' }))
            .toContain('a%20%26%20b')
    })

    /*
     * ⛔⛔ IL CASO CHE FA DAVVERO MALE, e che un test «funziona» non vede.
     *
     * Un messaggio è testo di una persona, e può contenere `&`, `?`, `=`. Senza
     * codifica quei caratteri diventano SEPARATORI: il resto del messaggio
     * viene letto come altri parametri, e il destinatario o il testo cambiano.
     * ⇒ Il messaggio parte, sembra riuscito, ed è sbagliato. È il difetto
     * peggiore, perché non si presenta come errore.
     */
    it('⛔ un testo con & ? = NON può dirottare i parametri', () => {
        const capacita = talosCapacita('whatsapp_messaggio')
        expect(capacita).not.toBeNull()
        const uri = talosComponiUri(capacita!.vie[0], {
            numero: '393331112222',
            testo: 'vieni? sì & poi phone=666 fine',
        })
        // Un solo `?`: quello del modello. Se ne comparisse un secondo, il
        // testo avrebbe aperto una nuova sezione di query.
        expect(uri.split('?').length - 1).toBe(1)
        // E nessun `&` grezzo: sarebbe l'inizio di un parametro non nostro.
        expect(uri.split('?')[1]).not.toContain('&')
        expect(uri).toContain('phone%3D666')
        expect(uri.startsWith('https://wa.me/393331112222?text=')).toBe(true)
    })

    /*
     * ⛔⛔ LA REGOLA CHE PROTEGGE TUTTI DISTRUGGEVA L'UNICO CASO OPPOSTO.
     *
     * MISURATO sul Pad il 2026-08-13: «apri il sito example.org» → `app_azione`
     * chiamato, Chrome **mai aperto**, e TALOS che spiega alla persona che «il
     * browser non riesce a raggiungere il sito tramite HTTPS… verifica se c'è
     * un firewall o proxy» — tutto inventato, e la colpa data al suo telefono.
     *
     * La causa era qui: `web_apri` ha `modello: '{indirizzo}'`, e i segnaposto
     * si codificano SEMPRE. `https://example.org` diventava
     * `https%3A%2F%2Fexample.org`, che non è un URI ⇒ `resolveActivity` null.
     *
     * ⇒ La codifica è giusta per un VALORE dentro un URI e sbagliata per un
     * URI intero. Si dichiara quale dei due è, non si indovina.
     */
    it('⛔ un indirizzo che È l\'URI non si codifica', () => {
        const web = talosCapacita('web_apri')!
        const uri = talosComponiUri(web.vie[0] as never, { indirizzo: 'https://example.org/a?b=1&c=2' })
        expect(uri).toBe('https://example.org/a?b=1&c=2')
    })

    /*
     * ⛔ Chi dice «apri example.org» non scrive `https://`, e senza schema
     * `resolveActivity` torna `null` — la stessa risposta che dà quando l'app
     * non c'è. Due cause con una risposta sola: qui la prima si toglie.
     */
    it('⛔ un indirizzo senza schema ne riceve uno — ma SOLO sulle vie https', () => {
        const web = talosCapacita('web_apri')!.vie[0]
        expect(talosConSchema(web as never, 'example.org')).toBe('https://example.org')
        expect(talosConSchema(web as never, 'https://example.org')).toBe('https://example.org')
        // ⛔ E il verso che romperebbe tutto: uno schema custom non si tocca.
        const geo = talosCapacita('mappe_cerca')!.vie[0]
        expect(talosConSchema(geo as never, 'geo:0,0?q=farmacia')).toBe('geo:0,0?q=farmacia')
    })

    it('dice COSA manca, non solo che qualcosa manca', () => {
        const capacita = talosCapacita('whatsapp_messaggio')!
        expect(talosParametriMancanti(capacita, { numero: '393331112222' }))
            .toEqual(['testo'])
        // ⛔ Uno spazio non è un valore: chi manda «   » non ha scritto niente.
        expect(talosParametriMancanti(capacita, { numero: '39333', testo: '   ' }))
            .toEqual(['testo'])
        expect(talosParametriMancanti(capacita, { numero: '39333', testo: 'ciao' }))
            .toEqual([])
    })

    /*
     * ⛔ `esce` è DICHIARATO, non dedotto dal nome: decide se serve la conferma
     * con anteprima, e un'azione che spedisce senza chiedere è irreversibile.
     */
    it('ogni azione che ESCE dal dispositivo è marcata', () => {
        const escono = TALOS_CAPACITA_INTENT.filter((c) => c.esce).map((c) => c.id)
        expect(escono).toContain('whatsapp_messaggio')
        expect(escono).toContain('telegram_messaggio')
        expect(escono).toContain('sms_messaggio')
        expect(escono).toContain('email_scrivi')
        // Cercare o navigare non manda niente a nessuno.
        expect(escono).not.toContain('mappe_naviga')
        expect(escono).not.toContain('spotify_cerca')
    })

    /*
     * ⛔⛔ LA PORTA CHE HO APERTO RENDENDO `contenuto` OPZIONALE.
     *
     * Serviva per la chiamata WhatsApp, che un testo non ce l'ha. Ma dove un
     * testo c'è, quella guardia è **la** difesa: WhatsApp conserva la bozza,
     * quindi il pulsante «invia» esiste PRIMA che arrivi il nostro testo, e
     * senza `contenuto` partirebbe la bozza vecchia — alla persona giusta, con
     * le parole sbagliate.
     *
     * ⇒ Un campo opzionale senza una regola è un campo che un giorno qualcuno
     * dimentica. La regola è questa: se la capacità ha un parametro che somiglia
     * a un testo e sa premere «invia», deve dire quale.
     */
    it('⛔ una capacità che INVIA UN TESTO deve dichiarare quale', () => {
        for (const c of TALOS_CAPACITA_INTENT) {
            if (!c.invio) continue
            const testuali = c.parametri.filter((p) => p === 'testo' || p === 'messaggio' || p === 'body')
            if (testuali.length === 0) continue
            expect(
                c.invio.contenuto,
                `${c.id} sa premere «invia» e ha il parametro «${testuali[0]}», ma non dichiara `
                + 'quale testo riverificare: partirebbe la bozza vecchia',
            ).toBeTruthy()
            expect(c.parametri).toContain(c.invio.contenuto)
        }
    })

    it('ogni voce è coerente: id unici, parametri usati, vie non vuote', () => {
        const visti = new Set<string>()
        for (const c of TALOS_CAPACITA_INTENT) {
            expect(visti.has(c.id)).toBe(false)
            visti.add(c.id)
            expect(c.vie.length).toBeGreaterThan(0)
            for (const via of c.vie) {
                // ⛔ Un segnaposto che nessun parametro riempie diventa stringa
                // vuota a runtime: l'URI parte monco, o l'extra arriva vuoto, e
                // l'errore si vede solo sul telefono di qualcun altro.
                // ⛔ Vale per ENTRAMBE le forme: un'azione con `{lingua}` in un
                // extra e nessun parametro `lingua` è lo stesso difetto —
                // MISURATO, perché è esattamente com'era `traduci` prima.
                // ⛔ La via per RIGA DI RUBRICA non ha segnaposto: nomina
                // direttamente il parametro col numero. Deve esistere lo
                // stesso — un `numero: 'telefono'` su una capacità che non ha
                // «telefono» cercherebbe un contatto con la stringa vuota, e
                // `PhoneLookup` risponderebbe «non trovato» invece che
                // «richiesta sbagliata».
                if (via.tipo === 'riga-contatto') {
                    expect(c.parametri).toContain(via.numero)
                    expect(via.mime).toMatch(/^vnd\.android\.cursor\.item\//)
                    continue
                }
                const testo = via.tipo === 'azione'
                    ? Object.values(via.extra).join(' ')
                    : via.modello
                const segnaposti = [...testo.matchAll(/\{(\w+)\}/g)].map((m) => m[1])
                for (const s of segnaposti) expect(c.parametri).toContain(s)
            }
        }
    })
})
