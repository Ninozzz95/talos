import { describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import {
    createTalosReadTools,
} from '@/lib/tools/readTools'
import { createTalosResearchTools } from '@/lib/tools/researchTools'
import { createTalosMemoryWriteTools } from '@/lib/tools/memoryWriteTools'
import { createTalosNotesWriteTools } from '@/lib/tools/notesWriteTools'
import { createTalosTasksWriteTools } from '@/lib/tools/tasksWriteTools'
import { createTalosWebTools } from '@/lib/search/webTools'
import { createTalosDocumentTools } from '@/lib/documents/documentTools'
import { createTalosImageTools } from '@/lib/images/imageTools'
import { createTalosLibraryExportTools } from '@/lib/tools/libraryExportTools'
import { createTalosLibraryWriteTools } from '@/lib/tools/libraryWriteTools'
import { createTalosLibraryContextPolicyTools } from '@/lib/tools/libraryContextPolicyTools'
import { createTalosLocalModelTools } from '@/lib/models/modelTools'
import { createTalosDeviceTools } from '@/lib/tools/deviceTools'
import { createTalosPrivilegedTools } from '@/lib/tools/privilegedTools'
import { createTalosNotificationTools } from '@/lib/tools/notificationTools'
import { createTalosSchermoTools } from '@/lib/tools/schermoTools'
import { talosIntentiTools } from '@/lib/tools/intentiTools'
import { createTalosCalendarTools } from '@/lib/tools/calendarioTools'
import {
    talosToolRequiredActions,
    talosToolsForAnthropic,
    talosToolsForGemini,
    talosToolsForOpenAi,
} from '@/lib/tools/registry'
import {
    TALOS_DEFAULT_AGENT_TOOL_ENABLED,
    isTalosAgentToolId,
    isTalosAgentToolEnabled,
    parseTalosAgentToolEnabled,
} from '@/lib/tools/toolControls'
import { TALOS_AGENT_TOOL_CONTROLS } from '@/lib/tools/toolControlCatalog'

function everyExecutableTool() {
    return [
        ...createTalosReadTools({
            listLibraryEntries: vi.fn(async () => []),
            listLibraryDocs: vi.fn(async () => []),
            readLibraryDoc: vi.fn(async () => null),
            listNotes: vi.fn(async () => []),
            listTasks: vi.fn(async () => []),
            searchMemories: vi.fn(async () => []),
            now: () => '2026-07-28T00:00:00.000Z',
        }),
        /*
         * `research_list` e `memory_write` mancavano da QUESTA lista, e per
         * questo il test non si era mai accorto che mancassero anche dal
         * catalogo — un controllo di copertura che non conosce due dei suoi
         * oggetti non copre niente, e nel frattempo quei due tool non
         * comparivano né fra gli interruttori né nella pagina dei permessi.
         *
         * Scovato il 2026-08-06 da un secondo test, che confronta il catalogo
         * con l'elenco VERO degli id invece che con una lista scritta a mano.
         *
         * L'ordine è quello di `toolset.ts`, che è la fonte: lettura, ricerca,
         * memoria, note, attività, documenti, immagini.
         */
        ...createTalosResearchTools({
            list: vi.fn(async () => []),
        } as never),
        ...createTalosMemoryWriteTools({
            create: vi.fn(async () => ({ id: 'm1', title: 'x' })),
        } as never),
        ...createTalosNotesWriteTools({
            create: vi.fn(async () => ({ id: 'n1', title: 'x' })),
            update: vi.fn(async () => ({ id: 'n1', title: 'x' })),
            remove: vi.fn(async () => {}),
        }),
        ...createTalosTasksWriteTools({
            create: vi.fn(async () => ({ id: 't1', title: 'x' })),
            setStatus: vi.fn(async () => ({ id: 't1', title: 'x' })),
            remove: vi.fn(async () => {}),
        }),
        ...createTalosWebTools({
            search: vi.fn(async () => []),
            read: vi.fn(async () => null),
            rememberSearch: vi.fn(async () => ({
                policy: 'stored' as const,
                saved: 0,
                skipped: 0,
                failed: 0,
            })),
            remember: vi.fn(async () => {}),
        }),
        ...createTalosDocumentTools({
            generate: vi.fn(),
            verify: vi.fn(),
            save: vi.fn(),
            diagnostics: () => false,
        } as never),
        ...createTalosImageTools({
            provider: vi.fn(() => 'gemini'),
            generate: vi.fn(),
            save: vi.fn(),
        }),
        ...createTalosLibraryExportTools({
            listCandidates: vi.fn(async () => []),
            exportById: vi.fn(),
        } as never),
        ...createTalosLibraryWriteTools({
            describe: vi.fn(async () => ({ id: 'f1', name: 'x' })),
        } as never),
        ...createTalosLibraryContextPolicyTools({
            read: vi.fn(),
            replace: vi.fn(),
        } as never),
        // The second door onto the on-device models. It takes no sources: it
        // drives the same store the Model Lab section drives, which is what
        // makes a download started from chat land in both places.
        ...createTalosLocalModelTools(),
        // Il telefono. Assente sul web — li' non c'e' niente da toccare — ma
        // qui l'elenco deve contenerlo, o il confronto col catalogo mentirebbe
        // proprio sul gruppo appena aggiunto.
        ...createTalosDeviceTools({
            vibrate: vi.fn(), torch: vi.fn(), volume: vi.fn(), alarm: vi.fn(),
            openApp: vi.fn(), openSettings: vi.fn(), compose: vi.fn(),
            status: vi.fn(), speak: vi.fn(),
        } as never),
        /*
         * T2 — le capacita' che passano dalla shell privilegiata. Vivono in una
         * fabbrica loro perche' hanno una FONTE loro: il ponte Shizuku, che
         * puo' non esserci. Questo elenco e' l'unico posto in cui il catalogo e
         * le fabbriche si guardano negli occhi, ed e' per questo che dimenticare
         * una riga qui produce un tool che nessuno puo' spegnere.
         */
        ...createTalosPrivilegedTools({
            wifi: vi.fn(), bluetooth: vi.fn(), doNotDisturb: vi.fn(),
            systemSetting: vi.fn(), appUsage: vi.fn(), listApps: vi.fn(),
            ready: vi.fn(), reasonOf: vi.fn(),
        } as never),
        /*
         * ⭐ Le notifiche — metà di ciò che fa Gemini.
         *
         * ⛔ Fabbrica SEPARATA da quella privilegiata, e non è pulizia: le
         * notifiche non passano da nessun ponte, si accendono dalla pagina di
         * sistema. Se stessero lì dentro, sparirebbero proprio sul telefono
         * dove il ponte non si accenderà mai — cioè dove sono la capacità più
         * grande che resta.
         */
        ...createTalosNotificationTools({
            status: vi.fn(), list: vi.fn(), reply: vi.fn(),
            dismiss: vi.fn(), reasonOf: vi.fn(),
        } as never),
        ...createTalosSchermoTools({ guida: vi.fn(), occhioAperto: vi.fn() } as never),
        // ⭐ Il motore degli intent: UN tool per 25 capacità, e questa guardia
        // è ciò che impedisce che resti scollegato dal pannello dei permessi.
        // ⛔ CON le fonti dei file: `invia_file` esiste solo quando ce le ha, e
        // senza questa riga la guardia non lo vedrebbe — cioè il tool nuovo
        // resterebbe fuori dal pannello dei permessi senza che nessuno se ne
        // accorga, che è esattamente il difetto che questo test esiste per
        // impedire.
        ...talosIntentiTools({ fileDellaLibreria: vi.fn(async () => []) }),
        /*
         * ⭐ Il CALENDARIO — 2026-08-14. Senza questa riga la guardia non lo
         * vedrebbe, cioè il tool nuovo resterebbe fuori dal pannello dei
         * permessi senza che nessuno se ne accorga: è il difetto che questo
         * test esiste per impedire, ed è già successo due volte.
         */
        ...createTalosCalendarTools(
            vi.fn(async () => ({ stato: 'letto' as const, eventi: [] })),
            vi.fn(async () => ({ stato: 'scritto' as const, calendario: 'x' })),
        ),
    ]
}

describe('Agent Tools control registry', () => {
    it('AGENT-TOOLS-01 exactly matches every executable factory and action set', () => {
        const executable = everyExecutableTool()
        const ids = TALOS_AGENT_TOOL_CONTROLS.map((control) => control.id)

        expect(new Set(ids).size).toBe(ids.length)
        expect(ids).toEqual(executable.map((tool) => tool.name))
        for (const tool of executable) {
            const control = TALOS_AGENT_TOOL_CONTROLS.find((entry) => entry.id === tool.name)
            expect(control?.actions, tool.name).toEqual(talosToolRequiredActions(tool))
            expect(isTalosAgentToolId(tool.name), tool.name).toBe(true)
            if (isTalosAgentToolId(tool.name)) {
                expect(typeof TALOS_DEFAULT_AGENT_TOOL_ENABLED[tool.name], tool.name).toBe('boolean')
            }
        }
    })

    it('AGENT-TOOLS-02 preserves current flows, sanitizes values, and fails unknown tools closed', () => {
        /*
         * ⛔ Gli strumenti nascono ACCESI, tranne un elenco DICHIARATO.
         *
         * La forma conta: non «quasi tutti sono accesi», ma «questi due sono
         * spenti e nessun altro». Uno strumento nuovo che nascesse spento senza
         * finire in questo elenco rompe qui — e con lui rompe la domanda che
         * gli va fatta, perche' spento di suo vuol dire che la persona non lo
         * trovera' mai se non lo cerca.
         *
         * `device_screen_drive` (2026-08-10): e' l'unico che prende in mano il
         * telefono e agisce dentro app di ALTRI — R4, trifecta completa.
         * Acceso senza che nessuno l'abbia deciso sarebbe una capacita' arrivata
         * di nascosto con un aggiornamento.
         */
        const SPENTI_DI_PROPOSITO = ['library_context_policy_update', 'device_screen_drive']
        for (const id of SPENTI_DI_PROPOSITO) {
            expect(TALOS_DEFAULT_AGENT_TOOL_ENABLED[id as never]).toBe(false)
        }
        expect(Object.entries(TALOS_DEFAULT_AGENT_TOOL_ENABLED)
            .filter(([id]) => !SPENTI_DI_PROPOSITO.includes(id))
            .every(([, value]) => value)).toBe(true)

        const parsed = parseTalosAgentToolEnabled({
            library_search: false,
            web_search: 'yes',
            future_shell: true,
        })

        expect(parsed.library_search).toBe(false)
        expect(parsed.web_search).toBe(true)
        expect(parsed).not.toHaveProperty('future_shell')
        expect(parsed.library_context_policy_update).toBe(false)
        // 34 → 38: `memory_update`, `memory_delete`, `library_rename`,
        // `library_delete` (owner 2026-08-07: la chat sapeva solo inserire e
        // leggere su Memoria e Libreria).
        expect(Object.keys(parsed)).toHaveLength(TALOS_AGENT_TOOL_CONTROLS.length)
        expect(isTalosAgentToolEnabled('library_search', parsed)).toBe(false)
        expect(isTalosAgentToolEnabled('future_shell', parsed)).toBe(false)
    })

    it('P1-CTX-COMPAT-09 keeps every pre-existing public tool contract byte-compatible', () => {
        const tools = everyExecutableTool()
            .filter((tool) => tool.name !== 'library_context_policy_update')
        /**
         * Pinned per surface rather than as one hash over all four.
         *
         * A single digest made every provider dialect share one number, so
         * repairing the schema for ONE provider forced an update to a value
         * that also stood for the other three — and the reviewer of that commit
         * could not tell from the diff whether Anthropic had moved too. Which
         * is precisely what happened on 2026-07-30: Gemini refused
         * `enum: [1]` (its enum is string-only), the fix changed the Gemini
         * dialect alone, and the combined hash could not say so.
         *
         * Split, the guard answers the question it exists to answer.
         */
        const digestOf = (value: unknown): string =>
            createHash('sha256').update(JSON.stringify(value)).digest('hex')

        const controlPlaneOf = (list: typeof tools) => list.map((tool) => ({
            name: tool.name,
            title: tool.title,
            actions: talosToolRequiredActions(tool),
        }))
        const controlPlane = controlPlaneOf(tools)

        /**
         * Re-pinned 2026-07-31, twice: first for `library_file_origin`, then
         * for the four `local_model*` tools — the second door onto the
         * on-device models.
         *
         * Proven both times, not assumed. Excluding the new tools reproduced
         * all four previous digests byte for byte, so nothing about the
         * pre-existing contracts moved — which is the only question this guard
         * exists to answer, and the reason the four are pinned separately.
         */
        /**
         * Ri-fissati 2026-08-05/06 per i SEI tool di scrittura di note e
         * attività — `notes_*` prima, `tasks_*` subito dopo, per la stessa
         * ragione: entrambe le funzioni si potevano solo elencare. Il blocco
         * «senza i nuovi» qui sotto li esclude tutti e sei insieme.
         *
         * Nota storica dei tre tool di SCRITTURA delle note —
         * `notes_create`, `notes_update`, `notes_delete` — la seconda porta che
         * mancava alla funzione (owner: «devono avere i propri tool di lettura e
         * scrittura da chat»).
         *
         * **Dimostrato, non assunto**, come le due volte precedenti: togliendo i
         * tre nuovi si riproducono TUTTI E SETTE i digest precedenti byte per
         * byte. Cioè nessun contratto preesistente si è mosso, che è l'unica
         * domanda a cui questa guardia serve a rispondere. La prova è qui sotto
         * e resta eseguibile: se un giorno un tool vecchio cambiasse insieme a
         * uno nuovo, sarebbe questo blocco a cadere, non quello in fondo.
         */
        const withoutNotesWrite = tools.filter((tool) => ![
            'notes_create', 'notes_update', 'notes_delete',
            'tasks_create', 'tasks_complete', 'tasks_delete',
            // 2026-08-06: `research_list` e `memory_write` non erano MAI stati
            // in questa lista, pur esistendo da settimane — quindi rispetto ai
            // digest storici sono «nuovi» esattamente come lo erano gli altri.
            'research_list', 'memory_write',
            // 2026-08-07: i quattro che completano il CRUD di Memoria e
            // Libreria. Se togliendoli il digest storico NON tornasse, vorrebbe
            // dire che ho mosso anche un contratto vecchio senza accorgermene.
            'memory_update', 'memory_delete', 'library_rename', 'library_delete',
            // 2026-08-08: i nove del TELEFONO. Se togliendoli il digest storico
            // non tornasse, vorrebbe dire che ho mosso un contratto vecchio
            // insieme ai nuovi — ed e' esattamente la domanda a cui questa
            // guardia serve a rispondere.
            'device_status', 'device_torch', 'device_vibrate', 'device_volume',
            'device_alarm', 'device_open_app', 'device_open_settings',
            'device_compose', 'device_speak',
            // 2026-08-08, seconda tornata: le due che completavano le dieci.
            'device_wallpaper', 'device_keep_awake',
            // 2026-08-08, T2: le sei che passano dalla shell privilegiata.
            'device_wifi', 'device_bluetooth', 'device_do_not_disturb',
            'device_system_setting', 'device_app_usage', 'device_list_apps',
            // ⭐ 2026-08-08, le NOTIFICHE: leggerle, rispondere, toglierle.
            // Metà di ciò che fa Gemini, e l'unica capacità grande che resta
            // raggiungibile su un telefono dove il ponte privilegiato non si
            // accenderà mai. Se togliendole il digest storico non tornasse,
            // vorrebbe dire che ho mosso un contratto vecchio insieme ai nuovi.
            'device_notifications_list', 'device_notification_reply',
            'device_notification_dismiss',
            // ⭐ 2026-08-09, il CONTROLLO MEDIA. Dal censimento dei concorrenti
            // (#34) era l'UNICA riga dove Gemini vinceva senza pretendere di
            // essere l'assistente predefinito del telefono — e si chiude a costo
            // zero, perche' `dispatchMediaKeyEvent` e' la porta dei telecomandi
            // Bluetooth e non chiede permessi.
            'device_media',
            // 2026-08-09, l'Ondata 1: aereo e risparmio energetico. Due righe
            // in cui Gemini pretende di essere l'assistente predefinito.
            'device_airplane', 'device_power_saving',
            /*
             * ⭐⭐ 2026-08-10, il PILOTA DELLO SCHERMO: `device_screen_drive`.
             * Se togliendolo l'impronta storica non tornasse, vorrebbe dire che
             * ho mosso un contratto vecchio insieme al nuovo — ed e' esattamente
             * la domanda a cui questa guardia serve a rispondere.
             */
            'device_screen_drive',
            /*
             * ⭐⭐⭐ 2026-08-13, il MOTORE DEGLI INTENT: `app_azione`.
             *
             * Un tool solo per 25 capacità, nato dal confronto sul Pad: stesso
             * compito, Gemini lo chiude in ~20 s senza aprire l'app, il nostro
             * pilota ci metteva 20 passi e 27,8 s per non concludere.
             *
             * ⛔ Se togliendolo l'impronta storica NON tornasse, vorrebbe dire
             * che collegandolo ho mosso il contratto di un tool che esisteva
             * già — cioè che i 61 strumenti di ieri oggi parlano diverso ai
             * provider. È l'unica domanda a cui questa guardia risponde, ed è
             * il motivo per cui vale la pena tenerla aggiornata a mano.
             */
            'app_azione',
            /*
             * ⭐⭐⭐ 2026-08-13, MANDARE UN FILE: `invia_file`.
             *
             * Owner, verbatim: «si possa dire alla chat di inviare un file
             * della libreria via social media o app di messaggistica».
             *
             * ⛔ Stessa domanda di sempre: se togliendolo l'impronta storica
             * NON tornasse, vorrebbe dire che aggiungendo un tool nuovo ho
             * mosso il contratto di uno che c'era già. Il fatto che torni
             * `369a6da1…` byte per byte dimostra che è cresciuta la LISTA, non
             * il contratto — che è l'unica cosa che questa guardia sa dire.
             */
            'invia_file',
            /*
             * ⭐⭐⭐ 2026-08-14, IL CALENDARIO: `calendar_read`.
             *
             * Nato da un difetto misurato: «che impegni ho domani?» e TALOS
             * rispondeva «non hai compiti registrati», avendo guardato le
             * PROPRIE note. Una risposta sicura e falsa sulla giornata di una
             * persona.
             *
             * ⛔ Stessa domanda di sempre: se togliendolo l'impronta storica
             * NON tornasse, vorrebbe dire che aggiungendolo ho mosso il
             * contratto di un tool che c'era già.
             */
            'calendar_read', 'calendar_write',
            /*
             * ⭐⭐ 2026-08-14, LO SCREENSHOT: `device_screenshot`.
             *
             * L'unica lacuna trovata dal censimento contro Gemini — «fai uno
             * screenshot» era la sola richiesta a cui nessun attrezzo
             * rispondeva.
             *
             * ⛔ Stessa domanda di sempre: se togliendolo l'impronta storica
             * NON tornasse, vorrebbe dire che aggiungendolo ho mosso il
             * contratto di un tool che c'era gia'. Il fatto che torni
             * `369a6da1…` byte per byte dimostra che e' cresciuta la LISTA,
             * non il contratto.
             */
            'device_screenshot',
            /*
             * ⭐⭐ 2026-08-14, LA POSTA NON LETTA: `device_unread_mail`.
             *
             * La seconda lacuna del censimento contro Gemini: «quante email non
             * lette ho» era una domanda a cui nessun attrezzo rispondeva.
             *
             * ⛔ Stessa domanda di sempre: se togliendolo l'impronta storica NON
             * tornasse, vorrebbe dire che aggiungendolo ho mosso il contratto di
             * un tool che c'era già. E qui la domanda conta più del solito,
             * perché nello stesso giro ho accorciato di proposito la descrizione
             * di sei `research_*` — quella riga vive sotto, nei tre dialetti,
             * mentre QUI (nome, titolo, azioni) non deve essersi mossa niente.
             */
            'device_unread_mail',
            /*
             * ⭐⭐ 2026-08-15, DOVE SEI: `device_location`.
             *
             * Owner: «ho chiesto che ristorante mi consigli per cenare stasera e
             * lui mi ha dato una posizione completamente diversa». MISURATO:
             * TALOS non leggeva la posizione da nessuna parte — nessun tool,
             * niente nel contesto, niente alla ricerca — e il permesso era
             * addirittura RIMOSSO dal manifest con `tools:node="remove"`. Quei
             * nomi di locali il modello se li era inventati.
             *
             * ⛔ Stessa domanda di sempre, e qui vale doppio: nello stesso giro
             * ho toccato `securityCatalog`, `toolControls` e le due lingue. Se
             * togliendolo l'impronta storica NON tornasse `369a6da1…` byte per
             * byte, vorrebbe dire che una di quelle modifiche ha mosso il
             * contratto di un tool che c'era gia'. Il fatto che torni lo esclude.
             */
            'device_location',
        ].includes(tool.name))
        expect(digestOf(controlPlaneOf(withoutNotesWrite)))
            .toBe('369a6da1a52e717bbe9e92b780151ac3da57352d21177064cf399a81356fff67')

        /*
         * Ri-fissato 2026-08-06 per `research_list` e `memory_write`, che
         * esistevano da settimane ma non erano MAI entrati in questa lista —
         * quindi la guardia non li ha mai guardati, e nel frattempo non
         * comparivano neppure fra gli interruttori né nell'elenco dei permessi.
         *
         * **Dimostrato, non assunto**, come le volte precedenti: il blocco qui
         * sopra li esclude e riproduce `294015f4…` byte per byte. Nessun
         * contratto preesistente si è mosso; è cresciuta la lista, non il
         * contratto.
         */
        /*
         * Ri-fissato 2026-08-07 per i QUATTRO che completano il CRUD di Memoria
         * e Libreria: `memory_update`, `memory_delete`, `library_rename`,
         * `library_delete`.
         *
         * Owner, quel giorno: «la libreria e la memoria non hanno un tool crud
         * completo, hanno solo inserimento e read». Vero — e la conseguenza era
         * che «no, ricordati invece che...» creava una SECONDA memoria accanto
         * alla prima, e da li' in poi il modello ne rileggeva due che si
         * contraddicevano.
         *
         * **Dimostrato, non assunto**, come tutte le volte precedenti: il
         * blocco qui sopra esclude i quattro e riproduce `369a6d…` byte per
         * byte. Nessun contratto preesistente si e' mosso.
         */
        /*
         * Ri-fissato 2026-08-08 per i NOVE tool del telefono. Il blocco qui
         * sopra li esclude e riproduce `369a6d…` byte per byte: nessuno dei 38
         * contratti preesistenti si e' mosso, che e' l'unica cosa che questa
         * impronta deve garantire. Questo secondo numero e' invece lo stato
         * corrente, e cambiare qui e' il gesto DELIBERATO con cui si dichiara
         * «ho aggiunto qualcosa». Se cadesse senza che io abbia aggiunto nulla,
         * vorrebbe dire che un contratto e' cambiato da solo.
         */
        /*
         * ⭐ Ri-fissato 2026-08-09 per il CONTROLLO MEDIA, `device_media`.
         *
         * Dal censimento dei concorrenti (#34) era l'UNICA riga in cui Gemini
         * vinceva **senza un cancello**: per il Wi-Fi o la torcia pretende di
         * essere l'assistente predefinito del telefono, per i media no. Era
         * l'unica casella persa a parita' di condizioni.
         *
         * **Dimostrato, non assunto**, come tutte le volte precedenti: il blocco
         * qui sopra lo esclude e riproduce `369a6d…` byte per byte — nessuno dei
         * contratti preesistenti si e' mosso. Questo secondo numero e' lo stato
         * corrente, e cambiarlo e' il gesto deliberato con cui si dichiara «ho
         * aggiunto qualcosa».
         */
        /*
         * ⭐⭐⭐ Ri-fissato 2026-08-13 per il MOTORE DEGLI INTENT, `app_azione`.
         *
         * Un tool solo che copre 25 capacità — WhatsApp, Telegram, Signal,
         * Messenger, SMS, email, chiamate, quattro modi di usare le mappe,
         * Uber, YouTube, Spotify, Netflix, calendario, traduzione, Drive,
         * Amazon, Play Store, Instagram, LinkedIn, web. Contro le 23 capacità
         * dei built-in intent di Google, che per giunta funzionano solo se lo
         * sviluppatore dell'app le implementa: i deep link pubblici no.
         *
         * **Dimostrato, non assunto**: il blocco qui sopra lo esclude e
         * riproduce `369a6d…` byte per byte ⇒ nessuno dei contratti
         * preesistenti si è mosso collegandolo. Questo secondo numero è lo
         * stato corrente, e cambiarlo è il gesto deliberato con cui si dichiara
         * «ho aggiunto qualcosa».
         */
        /*
         * ⭐⭐⭐ 2026-08-13, OTTAVO cambio: `invia_file`, mandare un file.
         *
         * Owner, verbatim: «si possa dire alla chat di inviare un file della
         * libreria via social media o app di messaggistica e poi anche
         * successivamente inviare un file che abbiamo nella memoria, salvato
         * nel dispositivo, e inviarlo dove voglio noi».
         *
         * ⛔ E l'impronta STORICA (`369a6da1…`) NON si è mossa — il blocco qui
         * sopra esclude `invia_file` e la riproduce byte per byte. È cresciuta
         * la lista, non il contratto: i tool di ieri parlano ai provider
         * esattamente come parlavano ieri.
         */
        /*
         * ⭐⭐⭐ 2026-08-13, NONO cambio: `device_alarm` impara a SPEGNERE.
         *
         * Non un attrezzo nuovo — una **sezione in più su quello che c'era**.
         * Sul Pad, «annulla la sveglia delle 7 e 30» lasciava la sveglia
         * armata, ne creava una seconda e apriva l'Orologio: il modello aveva
         * solo l'attrezzo che le mette, e l'ha richiamato.
         *
         * Un `device_alarm_dismiss` separato è stato scritto e poi **tolto**:
         * costava 309 byte di superficie e un attrezzo in più su 63, quando la
         * documentazione avverte che la scelta degrada oltre i 30-50. Il verso
         * mancante sta meglio dentro il suo verso, dichiarato da `off`.
         *
         * ⛔ Qui si muove il contratto di un tool **preesistente** — titolo e
         * descrizione di `device_alarm` — ed è deliberato. L'impronta storica
         * (`369a6da1…`) non se ne accorge perché il blocco sopra esclude tutto
         * il gruppo del telefono dal 2026-08-08: la garanzia che regge è quella
         * sui tre dialetti, che infatti si muovono insieme.
         */
        /*
         * ⭐⭐ 2026-08-14, DECIMO cambio: `device_screenshot`.
         *
         * L'unica lacuna trovata dal censimento contro Gemini: «fai uno
         * screenshot» era la sola richiesta a cui **nessun attrezzo**
         * rispondeva, e TALOS finiva per spiegare un limite con una causa
         * dedotta invece che con un «non lo so fare».
         *
         * ⛔ E l'impronta STORICA (`369a6da1…`) NON si è mossa: il blocco qui
         * sopra lo esclude e la riproduce byte per byte. È cresciuta la lista,
         * non il contratto.
         *
         * ⛔ Questo secondo numero invece si muove, ed è il gesto deliberato:
         * il piano di controllo adesso contiene un attrezzo che LEGGE lo
         * schermo, e chi rilegge questa riga deve vedere che qualcuno l'ha
         * dichiarato.
         */
        /*
         * ⭐⭐ 2026-08-14, UNDICESIMO cambio: `device_unread_mail`.
         *
         * La seconda lacuna del censimento contro Gemini — «quante email non
         * lette ho» — chiusa dal contatore pubblico di Gmail sul telefono, non
         * dall'API di Google (scope ristretto, assessment CASA, e un token che
         * in «Testing» scade ogni 7 giorni: TALOS smetterebbe di leggere la
         * posta una volta a settimana, per sempre).
         *
         * ⛔ L'impronta STORICA (`369a6da1…`) NON si è mossa: il blocco qui
         * sopra lo esclude e la riproduce byte per byte — e stavolta è la
         * conferma che serviva davvero, perché nello stesso giro sei
         * `research_*` hanno perso una riga di descrizione. Le descrizioni
         * vivono nei DIALETTI, qui vive il contratto: e il contratto è fermo.
         *
         * ⛔ Questo secondo numero invece si muove, ed è il gesto deliberato:
         * il piano di controllo adesso contiene un attrezzo che LEGGE quanta
         * posta non hai aperto, e chi rilegge questa riga deve vederlo
         * dichiarato.
         *
         * ⛔ 2026-08-15: si muove di nuovo, e stavolta per un attrezzo che legge
         * DOVE SEI. È il dato più personale che questo piano di controllo
         * contenga, ed è marcato `readsPrivateData: true` in `securityCatalog` —
         * l'unico `device_*` che lo sia. Chi rilegge questa riga deve vedere
         * anche questo dichiarato, non scoprirlo da un'impronta cambiata.
         */
        expect(digestOf(controlPlane))
            .toBe('625228fa20749020001a37577d8b09de504a137c31c0f878a12e5891bfcb64be')
        /*
         * ⭐ Ri-fissato 2026-08-08 per i TRE tool delle NOTIFICHE:
         * `device_notifications_list`, `device_notification_reply`,
         * `device_notification_dismiss`.
         *
         * Sono metà di ciò che fa Gemini, e l'unica capacità grande che resta
         * raggiungibile su un telefono dove il ponte privilegiato non si
         * accenderà mai — perché non passano da nessun ponte: si accendono
         * dalla pagina di sistema.
         *
         * **Dimostrato, non assunto**, come tutte le volte precedenti: il
         * blocco delle esclusioni qui sopra li toglie e riproduce `369a6d…`
         * byte per byte. Nessuno dei contratti preesistenti si è mosso, che è
         * l'unica domanda a cui questa impronta serve a rispondere.
         */
        /**
         * Re-pinned 2026-08-01 for the three DIALECT digests only — the control
         * plane above did not move, which is the proof that nothing structural
         * changed: only two descriptions did.
         *
         * Why they changed is worth keeping. `web_search` and `web_read` used to
         * end their description with "so this requires outbound and write
         * permission". A description is sent TO THE MODEL, and a model told that
         * a tool needs permissions it cannot inspect will explain the
         * permissions to the user instead of calling the tool. That is exactly
         * what it did: the tool was offered, the policy said `ask`, and the
         * answer was a polite lecture about Settings. The model is not the
         * permission gate — the gate is, and it asks the user at call time.
         */
        /**
         * Ripinnati 2026-08-04 per `generate_image`, che ha guadagnato
         * `from_image` — l'immagine da cui partire invece di disegnare da zero.
         *
         * **Tutti e tre i dialetti si sono mossi, il piano di controllo NO.** È
         * esattamente la lettura che questa separazione esiste per permettere:
         * il contratto pubblico (nome, titolo, azioni richieste) è identico, e
         * a cambiare è solo lo schema degli argomenti — cioè si è aggiunto un
         * parametro opzionale, non si è toccato cosa il tool può fare né quali
         * permessi pretende.
         *
         * Se il piano di controllo si fosse mosso insieme a loro, la domanda da
         * farsi sarebbe stata un'altra.
         */
        /*
         * Ri-fissate 2026-08-04: `generate_image` ha guadagnato `mask` — DOVE
         * modificare. Tutti e tre i dialetti si sono mossi, come dev'essere: e'
         * lo stesso contratto tradotto tre volte. Il piano di controllo NO: se
         * si fosse mosso anche lui, la domanda da farsi sarebbe stata un'altra.
         */
        /**
         * Ri-fissate 2026-08-05 per C45-RED-08K: il runtime ora ammette due
         * download attivi più coda, quindi la descrizione data al modello non
         * può continuare a dichiararne uno. Ricostruire la sola descrizione
         * precedente deve riprodurre tutti e tre i digest precedenti: è la
         * prova automatica che nomi e input schema non si sono mossi insieme.
         */
        const previousDownloadDescription = 'Start downloading one model file set onto this device. Call '
            + 'local_model_inspect first and tell the user what it will cost them in space and '
            + 'data before asking. Only one download runs at a time.'
        const beforeDescriptionUpdate = withoutNotesWrite.map((tool) => (
            tool.name === 'local_model_download'
                ? { ...tool, description: previousDownloadDescription }
                : tool
        ))
        /*
         * ⛔⛔ Ri-fissate 2026-08-14, e QUESTA volta non per un tool nuovo: sei
         * `research_*` hanno perso una riga di descrizione, di proposito.
         *
         * La riga era «Call research_list first to get the research id.», e
         * stava scritta DUE volte per attrezzo: nella descrizione e nel
         * `.describe()` del campo `id`, che è il posto più vicino al gesto — il
         * modello la legge mentre riempie proprio quel campo. Una delle due
         * copie era peso puro: **298 byte** su sei attrezzi.
         *
         * ⛔ Perché toglierla invece di alzare il tetto degli schemi: il tetto
         * serviva per `device_unread_mail` (414 byte), e la regola dell'owner
         * dice di sgrassare PRIMA e di alzare solo se non resta altro. Qui
         * restava: 44.354 + 414 − 298 = **44.470**, sotto il tetto di 44.500
         * che non si è mosso.
         *
         * ⛔ E si vede da DOVE si muove: qui, nei dialetti, che portano le
         * descrizioni. L'impronta del piano di controllo (`369a6da1…`) è ferma
         * byte per byte — nessun nome, titolo o permesso è cambiato.
         */
        expect(digestOf(talosToolsForAnthropic(beforeDescriptionUpdate as never)))
            .toBe('5674f0945c2f976d9051b59d9126c086aec06aa95a59a72b0d4ff0c40c972281')
        expect(digestOf(talosToolsForOpenAi(beforeDescriptionUpdate as never)))
            .toBe('f033acbae8e56319f0a00c9c963df5b59b1b6f41e2e06c11d9678ec6b9015d96')
        expect(digestOf(talosToolsForGemini(beforeDescriptionUpdate as never)))
            .toBe('b4f4768a16612cd4e0f6eefc4ac17f7d2b3de1f7b7c8bef1a23e1f525dbfb9fe')

        /*
         * Gli stessi tre dialetti SENZA i tool nuovi. ⛔ Fino al 2026-08-14
         * questa riga diceva «identici a ieri», ed era il senso del confronto:
         * oggi NON lo sono più, e non perché sia entrato un attrezzo — questa
         * lista lo esclude — ma perché sei descrizioni preesistenti sono state
         * accorciate apposta (vedi il blocco qui sopra). Lasciare la vecchia
         * frase avrebbe fatto leggere «niente si è mosso» a chi guardava tre
         * numeri diversi.
         */
        expect(digestOf(talosToolsForAnthropic(withoutNotesWrite as never)))
            .toBe('737c93a85b550d7c1ec9ada5ac2fb6168553549a49d92071bd1bc784baf1802c')
        expect(digestOf(talosToolsForOpenAi(withoutNotesWrite as never)))
            .toBe('f50b839bad2ae17111d1e3c78cfcdb1722a6efb0073c8a36c465de7f08cdf336')
        /*
         * ⛔ 2026-08-10: SOLO l'impronta Gemini si muove qui, e non e' una
         * deriva del contratto — e' il TRADUTTORE verso Gemini che e' cambiato.
         * Le impronte Anthropic e OpenAI sopra sono rimaste identiche byte per
         * byte, ed e' quella la prova che nessun tool preesistente si e' mosso.
         *
         * Causa, misurata sul telefono dell'owner: HTTP 400 «Unknown name
         * "additionalProperties"», e Gemini rifiutava l'INTERA conversazione.
         */
        expect(digestOf(talosToolsForGemini(withoutNotesWrite as never)))
            .toBe('6fc38f2c4a35ba8576f825da191b1abc4da6862bd90f935b6db3340aab243ed1')

        /*
         * ⭐ Ri-fissati 2026-08-08 anche per i TRE tool delle NOTIFICHE.
         *
         * I tre dialetti si muovono INSIEME, come dev'essere: è lo stesso
         * contratto tradotto tre volte, e se se ne muovesse uno solo sarebbe un
         * traduttore rotto, non un tool nuovo.
         *
         * **Dimostrato, non assunto**: il blocco «senza i nuovi» qui sopra
         * riproduce tutte e tre le impronte storiche byte per byte. Nessun
         * contratto preesistente si è mosso.
         */
        // E con i nuovi dentro: il contratto pubblico di oggi.
        // Ri-fissati 2026-08-08 per i NOVE del telefono. I tre dialetti si
        // muovono INSIEME, come dev'essere: e' lo stesso contratto tradotto tre
        // volte. Se se ne muovesse uno solo, sarebbe un traduttore rotto.
        /*
         * ⭐ Ri-fissati 2026-08-09 anche per il CONTROLLO MEDIA, `device_media`.
         *
         * I tre dialetti si muovono INSIEME, come dev'essere: e' lo stesso
         * contratto tradotto tre volte, e se se ne muovesse uno solo sarebbe un
         * traduttore rotto, non un tool nuovo.
         *
         * **Dimostrato, non assunto**: il blocco «senza i nuovi» qui sopra
         * riproduce tutte e tre le impronte storiche byte per byte.
         */
        /*
         * ⭐ Ri-fissati 2026-08-09 anche per l'Ondata 1: `device_airplane` e
         * `device_power_saving`. Due righe del censimento dove Gemini pretende
         * di essere l'assistente predefinito del telefono, e noi no.
         *
         * **Dimostrato, non assunto**: il blocco «senza i nuovi» qui sopra
         * riproduce tutte e tre le impronte storiche byte per byte.
         */
        /*
         * ⛔ Ri-fissati 2026-08-10 per la DESCRIZIONE di `device_list_apps`, e
         * la ragione è una misura, non un ritocco di stile.
         *
         * La descrizione prometteva già «the name the user sees», e la
         * sorgente restituiva **solo pacchetti**. Provato sul Pad con la stessa
         * domanda «Apri Telegram», Telegram X installato:
         *
         * ```
         *   anthropic/claude-sonnet-5   «Non ho trovato Telegram»          ⛔
         *   openai/gpt-5.6              «Non trovo Telegram»               ⛔
         *   google/gemini-3.6-flash     apre org.thunderdog.challegram     ✅
         * ```
         *
         * Adesso la riga dice il FORMATO («Nome<TAB>pacchetto»), dice di
         * passare il PACCHETTO, e avverte con l'esempio che i due non si
         * somigliano. È un cambio di contratto voluto: si muove l'impronta,
         * non si allenta la guardia.
         *
         * I tre dialetti si muovono INSIEME, come dev'essere.
         *
         * ⛔ 2026-08-10, SECONDO cambio: SOLO il dialetto Gemini si muove, e
         * questa volta la asimmetria e' giusta. Non e' cambiato il contratto —
         * nomi, descrizioni e schemi sono gli stessi per tutti — e' cambiato il
         * TRADUTTORE verso Gemini, che ora tiene solo il sottoinsieme di
         * OpenAPI che quel provider accetta.
         *
         * La causa, misurata sul telefono dell'owner: HTTP 400
         * «Unknown name "additionalProperties" at
         * 'tools[0].function_declarations[9].parameters'» — e Gemini rifiutava
         * l'INTERA conversazione, non un tool.
         */
        /*
         * ⛔ 2026-08-10, TERZO cambio: `device_open_settings` porta ADESSO
         * l'elenco delle schermate che sappiamo aprire, e i tre dialetti si
         * muovono INSIEME — che è il verso giusto, perché a cambiare è la
         * descrizione, uguale per tutti, non un traduttore.
         *
         * La causa, misurata sul telefono dell'owner:
         *
         * ```
         *   am start -a android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS → si apre
         *   am start -a android.settings.NOTIFICATION_LISTENER_SETTINGS        → unable to resolve
         * ```
         *
         * Il modello scriveva quella costante A MEMORIA, sbagliava di quattro
         * caratteri, e TALOS raccontava il rifiuto come «il telefono non offre
         * questa schermata» — una bugia sul telefono di chi legge. Adesso
         * l'elenco vero è nella descrizione e nel catalogo delle capacità.
         *
         * ⛔ E l'impronta del PIANO DI CONTROLLO qui sopra NON si è mossa: nomi,
         * titoli e azioni sono identici. È esattamente la domanda a cui questa
         * guardia divisa serve a rispondere — è cambiato cosa il modello legge,
         * non cosa lo strumento è.
         */
        /*
         * ⭐⭐ 2026-08-10, QUARTO cambio: entra `device_screen_drive`, il pilota
         * dello schermo. Tutte e quattro le impronte dello STATO CORRENTE si
         * muovono insieme — piano di controllo compreso, perche' stavolta e' un
         * tool NUOVO e non una descrizione riscritta.
         *
         * ⛔ E l'impronta STORICA qui sopra (`369a6d…`) NON si e' mossa: il
         * blocco che lo esclude la riproduce byte per byte. Cioe' nessuno dei
         * contratti preesistenti e' cambiato insieme al nuovo — che e' l'unica
         * domanda a cui questa guardia divisa serve a rispondere.
         */
        /*
         * ⛔ 2026-08-10, QUINTO cambio: la DESCRIZIONE di `device_status`.
         * Diceva «It reads nothing that identifies the device or the person», e
         * per quella riga TALOS ha rifiutato di dire che telefono fosse — «per
         * motivi di privacy», su dati che il telefono dà a chiunque. Adesso
         * promette marca, modello, nome e versione, e tiene la promessa vera:
         * sulla PERSONA non tocca niente.
         *
         * I tre dialetti si muovono insieme, come dev'essere per un testo; il
         * piano di controllo e l'impronta STORICA non si muovono affatto.
         */
        /*
         * ⭐⭐⭐ 2026-08-13, SESTO cambio: `app_azione` prende `invia`.
         *
         * TALOS adesso preme lui il pulsante «invia» — intent per arrivare,
         * occhio per l'ultimo centimetro — e il modello deve poter dire che
         * NON lo si vuole: «scrivi ad Antonino che arrivo» e «prepara un
         * messaggio per Antonino» sono due intenzioni diverse, e dedurle dal
         * verbo vorrebbe dire mandare per sbaglio a una persona vera.
         *
         * I tre dialetti si muovono INSIEME, come dev'essere per un parametro
         * nuovo su un tool solo. ⛔ E l'impronta STORICA (`369a6da1…`) NON si è
         * mossa: `app_azione` è escluso da quel blocco, quindi il fatto che sia
         * ancora verde dimostra che nessun contratto preesistente è cambiato
         * insieme a questo — che è l'unica domanda a cui la guardia risponde.
         */
        /*
         * ⭐⭐⭐ 2026-08-13, SETTIMO cambio: `app_azione` impara a chiedere al
         * TELEFONO chi sa fare una cosa.
         *
         * Owner, verbatim: «non puoi mettere delle righe predeterminate. La
         * chat ha già una lista delle applicazioni esistenti. Dobbiamo fare in
         * modo che chiami in quelle e non usi delle righe generiche».
         *
         * Entrano due capacità che non nominano nessuna app —
         * `manda_testo_a_app` e `cerca_dentro_app` — e un campo `app` che il
         * modello riempie col nome che ha detto la persona. Se non sa quali
         * app lo sanno fare, chiama senza `app` e **il dispositivo glielo
         * dice**: misurato sul Pad, `ACTION_SEND`+`text/plain` = 20 app,
         * `ACTION_SEARCH` = 20 app.
         *
         * ⛔ E l'impronta STORICA (`369a6da1…`) NON si è mossa: `app_azione` è
         * escluso da quel blocco, quindi il suo essere ancora verde dimostra
         * che nessuno dei contratti preesistenti è cambiato insieme a questo.
         */
        /*
         * ⭐⭐⭐ 2026-08-13, `invia_file`: i tre dialetti si muovono INSIEME,
         * come dev'essere per un tool nuovo — e l'impronta STORICA resta ferma.
         */
        /*
         * ⭐⭐⭐ 2026-08-13, `device_alarm_dismiss`: idem, i tre insieme. È il
         * verso mancante della sveglia, misurato sul Pad — vedi il blocco delle
         * esclusioni qui sopra.
         */
        /*
         * ⛔⛔⛔ 2026-08-14, `calendar_write`: il contratto è cambiato APPOSTA,
         * e queste tre righe si muovono insieme perché il campo è uno solo.
         *
         * MISURATO sul Pad alle 13:33, chat pulita: «metti in agenda **domani**
         * alle 21» — domani era sabato 15 — è finito su **lunedì 17**, mentre
         * TALOS diceva «domenica 16». Tre giorni diversi per una richiesta sola.
         * `time_now` sul telefono rispondeva giusto: il modello non l'ha
         * chiamato e ha dedotto «oggi».
         *
         * ⇒ La descrizione di `from` adesso lo ORDINA: «For a relative date
         * ("tomorrow") call time_now FIRST». Riprovato in chat nuova: chiesto
         * sabato 15 alle 17, `dtstart` letto dal provider = sabato 15 alle 17.
         *
         * ⛔ E l'impronta STORICA più sotto NON si muove: `calendar_write` è
         * escluso da quel blocco, quindi il suo restare verde dimostra che
         * nessun altro contratto è cambiato di nascosto insieme a questo.
         */
        /*
         * ⛔ Mossa il 2026-08-14 per `device_screenshot`: un attrezzo in più
         * cambia il dialetto Anthropic, ed è deliberato. L'impronta STORICA più
         * sotto non si muove, e il suo restare verde è la prova che nessun
         * contratto preesistente è cambiato di nascosto insieme a questo.
         */
        /*
         * ⛔⛔ 2026-08-15, `device_open_settings`: la DESCRIZIONE è cambiata per
         * il rilievo #10 dell'owner, «"controlla il mio telefono" non porta alla
         * schermata giusta».
         *
         * Due modifiche, e la seconda paga la prima:
         *
         * 1. L'elenco delle schermate note guadagna
         *    `android.settings.APPLICATION_DEVELOPMENT_SETTINGS` — misurata sul
         *    Pad, apre `DevelopmentSettingsDashboardActivity`, cioè le Opzioni
         *    sviluppatore dove sta il Debug wireless. Senza quella riga, col
         *    ponte spento TALOS offriva di aprire «la pagina dei privilegi» e
         *    apriva **«Informazioni app»**, perché nessuna azione gliela
         *    indicava.
         * 2. Spariscono i due esempi in testa alla descrizione
         *    (`WIFI_SETTINGS`, `SOUND_SETTINGS`): erano **già dentro** l'elenco
         *    completo due righe sotto. 64 byte per dire due volte la stessa
         *    cosa, in uno schema col tetto misurato — e servivano proprio per
         *    stare sotto quel tetto dopo la (1).
         *
         * ⛔ L'impronta STORICA (`369a6da1…`) NON si muove: `device_open_settings`
         * è nella lista delle esclusioni dall'8 agosto, quindi il suo restare
         * verde è la prova che nessun contratto più vecchio è cambiato di
         * nascosto insieme a questo.
         */
        /*
         * ⛔ IMPRONTE RIFATTE il 2026-08-15, e la ragione è UNA sola.
         *
         * L'owner ha chiesto di obliterare il pallino e il pulsante flottante.
         * Con loro se n'è andata la capacità `floating_button`, e quindi la sua
         * schermata `android.settings.action.MANAGE_OVERLAY_PERMISSION`, che
         * `TALOS_SCHERMATE_DI_SISTEMA` deriva dal catalogo e `device_open_settings`
         * elenca nella propria descrizione. Meno una schermata ⇒ descrizione più
         * corta ⇒ impronta diversa.
         *
         * ⛔ E non è un'affermazione: le due liste sono state confrontate prima
         * di toccare questi numeri, HEAD contro adesso —
         *
         *     SPARITE: android.settings.action.MANAGE_OVERLAY_PERMISSION
         *     NUOVE:   android.settings.APPLICATION_DEVELOPMENT_SETTINGS
         *
         * — e la seconda era già dentro l'impronta precedente (è la (1) qui
         * sopra). Cioè la differenza è esattamente una, ed è quella voluta.
         *
         * ⛔ Un'impronta che si aggiorna «perché è rossa» non protegge più
         * niente: si aggiorna dopo aver detto QUALE byte è cambiato e perché.
         *
         * ⛔ 2026-08-15, secondo movimento nello stesso giorno: entra
         * `device_location`. La prova che è SOLO un'aggiunta non è questa riga —
         * è l'impronta STORICA qui sopra, che dopo aver escluso il tool nuovo
         * torna `369a6da1…` byte per byte. Se avessi mosso il contratto di un
         * attrezzo già esistente, quella non tornerebbe.
         */
        expect(digestOf(talosToolsForAnthropic(tools as never)))
            .toBe('07262cbabc2034e85f8656fe56db779f3800befddc19a6dacdd6396e3cba89eb')
        expect(digestOf(talosToolsForOpenAi(tools as never)))
            .toBe('0cca3a0c40845600a680d47acd3c6e0532a68f7cbdf40aafa9b74102f7cf29ae')
        expect(digestOf(talosToolsForGemini(tools as never)))
            .toBe('6d70595ffcf799f49ed9be1ca2798885488cf97631df61744a2571376e2df848')
    })
})
