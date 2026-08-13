import { z } from 'zod'
import {
    TALOS_CAPACITA_INTENT,
    talosCapacita,
    talosComponiUri,
    talosParametriMancanti,
} from '@/lib/intenti/registro'
import { talosRisolviContatto } from '@/lib/intenti/rubrica'
import { TalosDeviceBridge } from '@/lib/device/devicePlugin'
import { defineTalosTool, type TalosToolDefinition } from '@/lib/tools/registry'

/**
 * ⭐⭐⭐ UN TOOL SOLO per OTTO app — e per quelle che verranno.
 *
 * ## Perché non otto tool
 *
 * Ogni tool costa al modello token in OGNI messaggio, e costa a noi cinque
 * posti da tenere allineati (catalogo, sicurezza, etichette, permessi,
 * toolset). Otto tool per otto app sarebbero quaranta punti di divergenza, e
 * la nona app ne aggiungerebbe altri cinque.
 *
 * ⇒ Il modello sceglie una `capacita` da un elenco chiuso, e i valori stanno
 * nei dati. Aggiungere Spotify o Booking è **una riga nel registro**.
 *
 * ## La misura che ha deciso tutto questo
 *
 * Sul Pad, 2026-08-13, stesso compito: Gemini manda il WhatsApp in ~20 s senza
 * aprire l'app; TALOS lo pilotava in **20 passi, 27,8 s, senza concludere**.
 * ⇒ L'intent non è un'ottimizzazione: è la differenza fra riuscire e no.
 */
/*
 * ⛔ NIENTE FONTI DA INIETTARE, e non è pigrizia: è un byte-count.
 *
 * MISURATO oggi, quattro forme in fila — gancio nel controller con cache
 * (602.009), con `import()` pigro (601.650), con `&&`/`||` (601.704), fonti
 * dentro il ponte del telefono (601.512). Ogni forma pagava il grafo d'AVVIO
 * per una funzione che serve solo a chi chiede «manda un messaggio».
 *
 * ⇒ Questo modulo vive dietro il toolset, che è già un chunk dinamico:
 * chiamare il ponte da qui costa zero a chi apre l'app. Il tetto è una regola
 * dell'owner — «togliendo peso e non alzando il tetto» — e vale anche quando
 * il peso è mio e la funzione mi piace.
 */

/** Gli id validi, presi dal registro: l'elenco non si scrive due volte. */
const ID_CAPACITA = TALOS_CAPACITA_INTENT.map((c) => c.id) as [string, ...string[]]

export function talosIntentiTools(): readonly TalosToolDefinition<never>[] {
    return [
        defineTalosTool({
            name: 'app_azione',
            action: 'write',
            requiredActions: ['write', 'outbound'],
            title: 'Do something in another app, directly',
            description: [
                'Perform an action in another app WITHOUT driving the screen: messaging,',
                'calling, navigating, searching. This is the FAST and reliable path and',
                'must be preferred over device_screen_drive whenever the capability exists.',
                /*
                 * ⛔⛔ I NOMI DEI PARAMETRI SI DICHIARANO, non si fanno indovinare.
                 *
                 * MISURATO sul Pad il 2026-08-13: il modello ha chiamato
                 * `whatsapp_messaggio` con `{"messaggio": "ciao"}` mentre la
                 * capacità dichiara `testo`. Con un nome sbagliato il valore
                 * non entra nell'URI e WhatsApp si apre col campo VUOTO — un
                 * fallimento che sembra un successo, perché l'app si apre.
                 *
                 * ⇒ L'elenco esatto viene generato dal registro, così non può
                 * divergere: la descrizione dice `whatsapp_messaggio(numero,
                 * testo)`, e non c'è più niente da indovinare.
                 */
                `Capabilities and their EXACT parameter names: ${
                    TALOS_CAPACITA_INTENT.map((c) => `${c.id}(${c.parametri.join(', ')})`).join('; ')
                }.`,
                'Use those parameter names verbatim inside "valori" — a different name is dropped silently.',
                'For messaging capabilities pass either "contatto" (a person name, resolved',
                'against the phone book) or the raw recipient parameter. Never invent a',
                'phone number: if the name cannot be resolved, say so and ask.',
            ].join(' '),
            input: z.object({
                capacita: z.enum(ID_CAPACITA),
                contatto: z.string().min(2).max(80).optional(),
                valori: z.record(z.string(), z.string().max(2000)).optional(),
            }),
            /*
             * ⛔ `always`: alcune di queste capacità mandano un messaggio a una
             * persona vera, e quello non si annulla. La scheda mostra COSA sta
             * per uscire e a CHI, com'è la scheda di Gemini — che in più lascia
             * modificare il testo, ed è il punto in cui lo superiamo.
             */
            confirmation: 'always',
            async run(input) {
                const capacita = talosCapacita(input.capacita)
                if (!capacita) {
                    return {
                        ok: false,
                        content: `Unknown capability. Valid: ${ID_CAPACITA.join(', ')}.`,
                        code: 'TALOS_INTENTO_SCONOSCIUTO',
                    }
                }
                const valori: Record<string, string> = { ...(input.valori ?? {}) }

                /*
                 * ⛔ Il nome diventa un numero QUI, non nel modello.
                 *
                 * Un modello che «ricorda» un recapito lo sta inventando: i
                 * numeri stanno in rubrica, e chiederli al telefono è l'unico
                 * modo per non spedire a uno sconosciuto.
                 */
                if (input.contatto) {
                    const esito = await talosRisolviContatto(input.contatto)
                    if (esito.stato === 'permesso-mancante') {
                        return {
                            ok: false,
                            content: 'TALOS cannot read the phone book yet: the contacts permission is off. Offer to enable it; do not invent a number.',
                            code: 'TALOS_RUBRICA_SENZA_PERMESSO',
                        }
                    }
                    if (esito.stato === 'ponte-chiuso') {
                        return {
                            ok: false,
                            content: 'The phone book could not be read on this device.',
                            code: 'TALOS_RUBRICA_PONTE_CHIUSO',
                        }
                    }
                    if (esito.stato === 'nessuno') {
                        return {
                            ok: false,
                            content: `No contact matches "${input.contatto}". Ask the user for the exact name; do not guess a number.`,
                            code: 'TALOS_RUBRICA_NESSUNO',
                        }
                    }
                    if (esito.stato === 'molti') {
                        // ⛔ Si riportano i NOMI, mai i numeri: la scelta la fa
                        // la persona, e un recapito in un prompt è un recapito
                        // che esce dal telefono.
                        const nomi = esito.trovati.map((c) => c.nome).join(', ')
                        return {
                            ok: false,
                            content: `More than one contact matches "${input.contatto}": ${nomi}. Ask which one.`,
                            code: 'TALOS_RUBRICA_AMBIGUO',
                        }
                    }
                    // Il primo parametro della capacità è il destinatario.
                    valori[capacita.parametri[0]] = esito.contatto.numeri[0]
                }

                const mancanti = talosParametriMancanti(capacita, valori)
                if (mancanti.length > 0) {
                    return {
                        ok: false,
                        content: `Missing: ${mancanti.join(', ')}. Ask the user instead of guessing.`,
                        code: 'TALOS_INTENTO_INCOMPLETO',
                    }
                }

                /*
                 * ⛔ Si prova via per via, NELL'ORDINE DICHIARATO, e la prima
                 * che il sistema accetta vince. L'`https` è per primo apposta:
                 * se l'app manca, apre il web invece di fallire.
                 */
                const provate: string[] = []
                for (const via of capacita.vie) {
                    const uri = talosComponiUri(via, valori)
                    provate.push(via.tipo)
                    if (await TalosDeviceBridge.apriUri({ uri }).then((r) => r.done, () => false)) {
                        /*
                         * ⛔⛔ L'ULTIMO CENTIMETRO NON È COMPRESO NEL PREZZO.
                         *
                         * Owner 2026-08-13, mentre stavo per premere «invia» io
                         * via adb e chiamarlo risultato: «TALOS NON HA INVIATO
                         * IL MESSAGGIO».
                         *
                         * MISURATO sul Pad: `https://wa.me/<n>?text=<t>` apre
                         * `com.whatsapp.Conversation` sulla chat giusta col
                         * testo GIÀ SCRITTO nel campo — e si ferma lì, perché
                         * WhatsApp compila e non spedisce, per progetto. Lo
                         * stesso vale per `smsto:` e `mailto:`.
                         *
                         * ⇒ Dire «fatto» qui sarebbe la bugia peggiore di
                         * tutte: la persona crede che il messaggio sia partito
                         * e non è partito. Il tool dice dove è arrivato, e
                         * QUALE passo manca — un passo solo, che il pilota
                         * dello schermo chiude in una mossa invece che in
                         * venti. Intent per arrivare, pilota per l'ultimo
                         * centimetro.
                         */
                        return {
                            ok: true,
                            content: capacita.esce
                                ? `${capacita.app} is open with the recipient and the text already filled in. It is NOT sent yet — a link cannot send by itself in these apps. If the user asked you to send it, CALL device_screen_drive now with the goal "press the send button": that is one single step and it is exactly what that tool is for. Do NOT say you are unable to press it. If the user only asked you to prepare it, say it is ready and stop. Never claim it was sent unless the send step actually reported success.`
                                : `Opened ${capacita.app} via ${via.tipo}.`,
                        }
                    }
                }
                const installata = await TalosDeviceBridge
                    .appInstallata({ package: capacita.pacchetto })
                    .then((r) => r.presente, () => false)
                return {
                    ok: false,
                    content: installata
                        ? `${capacita.app} is installed but refused every route (${provate.join(', ')}).`
                        : `${capacita.app} is not installed on this device.`,
                    code: installata ? 'TALOS_INTENTO_RIFIUTATO' : 'TALOS_INTENTO_APP_ASSENTE',
                }
            },
        }) as TalosToolDefinition<never>,
    ]
}
