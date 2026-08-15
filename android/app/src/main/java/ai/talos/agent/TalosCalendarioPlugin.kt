package ai.talos.agent

import android.Manifest
import android.content.ContentUris
import android.content.pm.PackageManager
import android.provider.CalendarContract
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission

/**
 * ⭐⭐⭐ IL CALENDARIO — e perché leggerlo dal PROVIDER ci fa superare Gemini.
 *
 * ## Il difetto che l'ha reso urgente
 *
 * MISURATO sul Pad il 2026-08-14. «Che impegni ho domani?» → TALOS: «Non hai
 * compiti registrati per domani». Aveva guardato le PROPRIE note e attività e
 * risposto **come se avesse controllato l'agenda**, non avendo nessuna capacità
 * di calendario. Non è «non lo so»: è una risposta sicura e falsa sulla
 * giornata di una persona.
 *
 * ## ⭐ Dove Gemini non arriva
 *
 * Gemini legge attraverso l'**account Google**. Sul Pad i calendari sono
 * quattro, e il **numero 1 è LOCALE** — non appartiene a nessun account, quindi
 * lui non lo vede. Verificato: un evento scritto nel provider è rimasto
 * invisibile a Gemini, che continuava a dire «non hai nessun impegno».
 *
 * ⇒ Leggendo il provider si vede **tutto**: locali, Google, OEM, qualunque
 * account sincronizzato.
 *
 * ## ⛔ `Instances`, non `Events`
 *
 * `Events` tiene UNA riga per un evento ricorrente: «ogni lunedì» è una riga
 * sola, e «cosa ho lunedì» su quella tabella non trova niente. `Instances` è la
 * vista che espande le ricorrenze in occorrenze reali — ed è l'unica che
 * risponde alla domanda che fa una persona.
 *
 * ⛔ I limiti di tempo nell'URI **non sono opzionali**: senza, il provider
 * dovrebbe espandere ricorrenze infinite.
 */
@CapacitorPlugin(
    name = "TalosCalendario",
    permissions = [
        Permission(strings = [Manifest.permission.READ_CALENDAR], alias = "calendario"),
        /*
         * ⛔ La SCRITTURA è un alias a parte, e si chiede in un altro momento:
         * leggere l'agenda è privato ma reversibile, scriverci dentro cambia la
         * giornata di una persona. Due permessi, due decisioni.
         */
        Permission(strings = [Manifest.permission.WRITE_CALENDAR], alias = "calendarioScrittura"),
    ],
)
class TalosCalendarioPlugin : Plugin() {

    /**
     * Gli impegni fra due istanti.
     *
     * Risposta: `{ permesso: Boolean, eventi: [{ titolo, inizio, fine,
     * tuttoIlGiorno, luogo, calendario, occupa }] }`
     *
     * ⛔ `permesso` viaggia SEMPRE, anche con `eventi` vuoto: «non ho il
     * permesso di guardare» e «ho guardato e non c'è niente» sono due fatti
     * diversi, e confonderli è il difetto che questo progetto ha già inseguito
     * in quattro strati.
     */
    @PluginMethod
    fun leggi(call: PluginCall) {
        val da = call.getString("da")?.toLongOrNull()
        val a = call.getString("a")?.toLongOrNull()
        if (da == null || a == null || a <= da) {
            call.reject("Servono `da` e `a` in millisecondi, con `a` dopo `da`.")
            return
        }
        val concesso = context.checkSelfPermission(Manifest.permission.READ_CALENDAR) ==
            PackageManager.PERMISSION_GRANTED
        if (!concesso) {
            call.resolve(JSObject().put("permesso", false).put("eventi", JSArray()))
            return
        }
        val consultati = calendariVisibili()
        call.resolve(
            JSObject()
                .put("permesso", true)
                .put("eventi", leggiIstanze(da, a, call.getBoolean("conFestivita") == true))
                // ⛔ Viaggia SEMPRE, non solo quando l'elenco è vuoto: se lo
                // mandassimo solo nel caso «niente trovato», la risposta piena
                // resterebbe l'unica non verificabile — ed è quella su cui la
                // persona fa i suoi piani.
                .put("calendari", JSArray(consultati.toTypedArray())),
        )
    }

    /** Chiede il permesso alla persona. Separato dalla lettura: chiedere è un gesto. */
    @PluginMethod
    fun chiediPermesso(call: PluginCall) {
        requestPermissionForAlias("calendario", call, "esitoPermesso")
    }

    @com.getcapacitor.annotation.PermissionCallback
    private fun esitoPermesso(call: PluginCall) {
        call.resolve(
            JSObject().put(
                "permesso",
                context.checkSelfPermission(Manifest.permission.READ_CALENDAR) ==
                    PackageManager.PERMISSION_GRANTED,
            ),
        )
    }

    /**
     * ⭐⭐⭐ SCRIVERE UN APPUNTAMENTO — e i due punti in cui superiamo Gemini.
     *
     * 1. **Senza aprire niente.** La documentazione offre `ACTION_INSERT`, che
     *    non chiede permessi ma **apre l'app Calendario** con un modulo da
     *    confermare. È esattamente l'errore che la sveglia ci ha mostrato
     *    ieri — `EXTRA_SKIP_UI` ignorato, Orologio in faccia alla persona. Si
     *    scrive sul provider: costa un permesso e non sposta nessuno.
     * 2. **Luogo e descrizione.** Google dichiara che Gemini **non sa
     *    modificarli**. Qui sono due campi come gli altri.
     *
     * ⛔ NON si indovina su quale calendario scrivere. `calendar_access_level`
     * dice chi può: 700 è proprietario, 200 sola lettura — misurato sul Pad,
     * dove «Festività in Italia» è a 200 e scriverci fallirebbe. Se i
     * calendari scrivibili sono più d'uno **si rende l'elenco** e decide chi ha
     * chiesto: scegliere per la persona su quale agenda finisce un appuntamento
     * è la stessa famiglia del contatto con tre numeri.
     */
    @PluginMethod
    fun scrivi(call: PluginCall) {
        val titolo = call.getString("titolo")?.trim().orEmpty()
        val inizio = call.getString("inizio")?.toLongOrNull()
        val fine = call.getString("fine")?.toLongOrNull()
        if (titolo.isEmpty() || inizio == null || fine == null || fine <= inizio) {
            call.reject("Servono `titolo`, `inizio` e `fine` in millisecondi, con `fine` dopo `inizio`.")
            return
        }
        val concesso = context.checkSelfPermission(Manifest.permission.WRITE_CALENDAR) ==
            PackageManager.PERMISSION_GRANTED
        if (!concesso) {
            call.resolve(JSObject().put("permesso", false).put("scritto", false))
            return
        }
        val scrivibili = calendariScrivibili()
        if (scrivibili.isEmpty()) {
            call.resolve(
                JSObject().put("permesso", true).put("scritto", false)
                    .put("motivo", "nessun-calendario-scrivibile"),
            )
            return
        }
        val chiesto = call.getString("calendario")?.trim().orEmpty()
        val scelto = when {
            chiesto.isNotEmpty() -> scrivibili.entries
                .firstOrNull { it.value.equals(chiesto, ignoreCase = true) }
                ?: scrivibili.entries.firstOrNull { it.value.contains(chiesto, ignoreCase = true) }
            scrivibili.size == 1 -> scrivibili.entries.first()
            else -> null
        }
        if (scelto == null) {
            // ⛔ Più di un'agenda e nessuna indicazione: si RENDE l'elenco, non
            // si sceglie. Un appuntamento sull'agenda sbagliata lo vede la
            // persona sbagliata.
            val nomi = JSArray()
            scrivibili.values.forEach { nomi.put(it) }
            call.resolve(
                JSObject().put("permesso", true).put("scritto", false)
                    .put("motivo", "quale-calendario").put("calendari", nomi),
            )
            return
        }
        val valori = android.content.ContentValues().apply {
            put(CalendarContract.Events.CALENDAR_ID, scelto.key)
            put(CalendarContract.Events.TITLE, titolo)
            put(CalendarContract.Events.DTSTART, inizio)
            put(CalendarContract.Events.DTEND, fine)
            // ⛔ Obbligatorio: senza, il provider rifiuta l'inserimento.
            put(CalendarContract.Events.EVENT_TIMEZONE, java.util.TimeZone.getDefault().id)
            call.getString("luogo")?.takeIf { it.isNotBlank() }
                ?.let { put(CalendarContract.Events.EVENT_LOCATION, it) }
            call.getString("note")?.takeIf { it.isNotBlank() }
                ?.let { put(CalendarContract.Events.DESCRIPTION, it) }
        }
        val creato = runCatching {
            context.contentResolver.insert(CalendarContract.Events.CONTENT_URI, valori)
        }.getOrNull()
        if (creato == null) {
            call.resolve(
                JSObject().put("permesso", true).put("scritto", false)
                    .put("motivo", "insert-rifiutato"),
            )
            return
        }
        /*
         * ⛔⛔⛔ SI RILEGGE. «Scritto» non è «l'insert ha risposto».
         *
         * Owner 2026-08-14, dal suo telefono, con lo schermo: chiesto di mettere
         * un impegno, TALOS chiede su quale calendario, lui sceglie
         * `persona@example.com`, TALOS risponde «Perfetto, salvo l'impegno sul
         * calendario persona@example.com! 📅» — e nel calendario **non c'è
         * niente**. Owner: «per nessun motivo impegno non inserito».
         *
         * Il giro dell'attrezzo c'era ed è durato 1 s, e il lato TypeScript un
         * `scritto = false` lo mappa già su un errore. ⇒ L'insert aveva
         * risposto di sì, e noi ci siamo fidati della RISPOSTA invece che del
         * FATTO.
         *
         * È la stessa regola che in questa casa vale già per l'ultimo
         * centimetro di WhatsApp: «inviato» si dice perché il pulsante
         * sparisce, non perché il click è riuscito. Il provider del calendario
         * può accettare una riga e poi non tenerla — un id sbagliato, una
         * politica dell'account, un sync adapter che la scarta.
         *
         * ⇒ Si rilegge la riga appena scritta e si riporta il suo `dtstart`
         * VERO. Se non c'è, si dice che non c'è: una scrittura fallita
         * dichiarata è un problema; una scrittura fallita che si dichiara
         * riuscita fa perdere un appuntamento a una persona.
         */
        val id = creato.lastPathSegment?.toLongOrNull()
        val riletto = if (id == null) null else runCatching {
            context.contentResolver.query(
                android.content.ContentUris.withAppendedId(CalendarContract.Events.CONTENT_URI, id),
                arrayOf(CalendarContract.Events.DTSTART, CalendarContract.Events.TITLE),
                null,
                null,
                null,
            )?.use { c -> if (c.moveToFirst()) c.getLong(0) else null }
        }.getOrNull()

        call.resolve(
            JSObject().put("permesso", true)
                // ⛔ `scritto` adesso vuol dire RILETTO. Non c'è nessun altro
                // significato utile per chi legge questa risposta.
                .put("scritto", riletto != null)
                .put("calendario", scelto.value)
                .apply {
                    if (riletto != null) put("inizioVero", riletto.toString())
                    else put("motivo", "scritto-ma-non-rileggibile")
                },
        )
    }

    /** Chiede il permesso di SCRITTURA. Separato: è un'altra decisione. */
    /**
     * ⭐⭐⭐ IL VERSO CHE MANCAVA: cambiare e cancellare un impegno.
     *
     * Censimento contro Gemini, 2026-08-14: lui dichiara «aggiungere,
     * visualizzare **o modificare** eventi su Google Calendar»; TALOS sapeva
     * creare e leggere. E la conseguenza è la stessa già misurata sulla sveglia:
     * il modello, avendo solo l'attrezzo che METTE, davanti a «sposta la cena
     * alle 21» ne crea **un secondo** accanto al primo — e da lì in poi la
     * persona ha due impegni che si contraddicono.
     *
     * ## ⛔ Sta nello stesso plugin e non in uno nuovo
     *
     * È la lezione di `device_alarm`, che ha imparato a spegnere dentro sé
     * stesso: un attrezzo separato costa superficie a ogni turno per una cosa
     * che è **il verso opposto** di quella accanto.
     *
     * ## ⛔ E si rilegge, come la scrittura
     *
     * `update` e `delete` rendono un CONTEGGIO di righe toccate, che è la
     * risposta del provider — non il fatto. Vale parola per parola il commento
     * di `scrivi`: il provider può accettare e non tenere. Dopo la modifica si
     * rilegge la riga; dopo la cancellazione si controlla che **non ci sia più**.
     */
    @PluginMethod
    fun modifica(call: PluginCall) {
        val id = call.getString("id")?.toLongOrNull()
        if (id == null) {
            call.resolve(JSObject().put("permesso", true).put("fatto", false).put("motivo", "id-mancante"))
            return
        }
        // ⛔ Lo stesso controllo di `scrivi`, scritto uguale: cambiare un impegno
        // è una scrittura come metterlo, e deve fermarsi allo stesso cancello.
        if (context.checkSelfPermission(Manifest.permission.WRITE_CALENDAR) !=
            PackageManager.PERMISSION_GRANTED
        ) {
            call.resolve(JSObject().put("permesso", false).put("fatto", false))
            return
        }
        val riga = android.content.ContentUris
            .withAppendedId(CalendarContract.Events.CONTENT_URI, id)
        val elimina = call.getBoolean("elimina", false) == true

        if (elimina) {
            runCatching { context.contentResolver.delete(riga, null, null) }
            /*
             * ⛔ La prova è che NON C'È PIÙ, non che `delete` ha risposto un
             * numero. Un evento cancellato resta nella tabella con `deleted=1`
             * finché il sync adapter non passa: si guarda quella colonna, se no
             * si direbbe «cancellato» di una riga ancora viva.
             */
            val sparito = runCatching {
                context.contentResolver.query(
                    riga,
                    arrayOf(CalendarContract.Events.DELETED),
                    null,
                    null,
                    null,
                )?.use { c -> !c.moveToFirst() || c.getInt(0) == 1 }
            }.getOrNull() ?: false
            call.resolve(
                JSObject().put("permesso", true).put("fatto", sparito)
                    .apply { if (!sparito) put("motivo", "cancellato-ma-ancora-li") },
            )
            return
        }

        val valori = android.content.ContentValues().apply {
            call.getString("titolo")?.takeIf { it.isNotBlank() }
                ?.let { put(CalendarContract.Events.TITLE, it) }
            call.getString("inizio")?.toLongOrNull()
                ?.let { put(CalendarContract.Events.DTSTART, it) }
            call.getString("fine")?.toLongOrNull()
                ?.let { put(CalendarContract.Events.DTEND, it) }
            call.getString("luogo")?.takeIf { it.isNotBlank() }
                ?.let { put(CalendarContract.Events.EVENT_LOCATION, it) }
            call.getString("note")?.takeIf { it.isNotBlank() }
                ?.let { put(CalendarContract.Events.DESCRIPTION, it) }
        }
        if (valori.size() == 0) {
            call.resolve(JSObject().put("permesso", true).put("fatto", false).put("motivo", "niente-da-cambiare"))
            return
        }
        runCatching { context.contentResolver.update(riga, valori, null, null) }
        val riletto = runCatching {
            context.contentResolver.query(
                riga,
                arrayOf(CalendarContract.Events.DTSTART, CalendarContract.Events.TITLE),
                null,
                null,
                null,
            )?.use { c -> if (c.moveToFirst()) c.getLong(0) to (c.getString(1) ?: "") else null }
        }.getOrNull()
        call.resolve(
            JSObject().put("permesso", true)
                .put("fatto", riletto != null)
                .apply {
                    if (riletto != null) {
                        put("inizioVero", riletto.first.toString())
                        put("titoloVero", riletto.second)
                    } else {
                        put("motivo", "cambiato-ma-non-rileggibile")
                    }
                },
        )
    }

    @PluginMethod
    fun chiediPermessoScrittura(call: PluginCall) {
        requestPermissionForAlias("calendarioScrittura", call, "esitoPermessoScrittura")
    }

    @com.getcapacitor.annotation.PermissionCallback
    private fun esitoPermessoScrittura(call: PluginCall) {
        call.resolve(
            JSObject().put(
                "permesso",
                context.checkSelfPermission(Manifest.permission.WRITE_CALENDAR) ==
                    PackageManager.PERMISSION_GRANTED,
            ),
        )
    }

    /**
     * Gli id e i nomi dei calendari su cui si PUÒ scrivere.
     *
     * ⛔ `CAL_ACCESS_CONTRIBUTOR` (500) è la soglia dichiarata da Android:
     * sotto, l'inserimento fallisce in silenzio. Misurato sul Pad: 700 per i
     * tre calendari propri, **200** per «Festività in Italia».
     */
    private fun calendariScrivibili(): LinkedHashMap<Long, String> {
        val fuori = LinkedHashMap<Long, String>()
        val cursore = context.contentResolver.query(
            CalendarContract.Calendars.CONTENT_URI,
            arrayOf(
                CalendarContract.Calendars._ID,
                CalendarContract.Calendars.CALENDAR_DISPLAY_NAME,
            ),
            "${CalendarContract.Calendars.CALENDAR_ACCESS_LEVEL} >= " +
                "${CalendarContract.Calendars.CAL_ACCESS_CONTRIBUTOR}" +
                " AND ${CalendarContract.Calendars.VISIBLE} = 1",
            null,
            null,
        ) ?: return fuori
        cursore.use { c ->
            while (c.moveToNext()) {
                fuori[c.getLong(0)] = c.getString(1) ?: continue
            }
        }
        return fuori
    }

    /**
     * ⭐⭐⭐ SU QUALI CALENDARI ABBIAMO GUARDATO — e senza questo «non hai
     * impegni» è una frase che non si può verificare.
     *
     * ## Il difetto, dal telefono dell'owner il 2026-08-14
     *
     * «che impegni ho domani?» → «Domani, sabato 15 agosto, **non hai impegni in
     * calendario**», con la scheda che mostrava solo Assunzione e Ferragosto.
     * Ma il Dentista e la Cena da Mario **c'erano**, sincronizzati.
     *
     * Sul Pad, interrogando il provider a mano, i quattro eventi ci sono tutti e
     * coi valori giusti — festività `availability=1` (FREE), impegni `0` (BUSY).
     * ⇒ Sul suo telefono la risposta è nata da un insieme di calendari
     * **diverso**, e nessuno poteva accorgersene: la frase era identica.
     *
     * ## ⇒ Una risposta che non elenca le sue fonti non è verificabile
     *
     * «Non hai impegni» e «ho guardato questi tre calendari e non c'è niente»
     * sono la stessa notizia per chi ha ragione, e due notizie diverse per chi
     * ha torto: la seconda mostra subito che «Famiglia» non era nell'elenco.
     *
     * È la stessa regola già pagata due volte in questa casa: un esito che
     * nasconde i propri dati fa **inventare** — a chi legge e al modello.
     *
     * ⛔ Qui la soglia di accesso NON si applica: si legge anche da un
     * calendario di sola lettura (le festività lo sono, con accesso 200).
     * `calendariScrivibili` risponde a un'altra domanda, e confonderle
     * escluderebbe dall'elenco proprio le fonti che hanno risposto.
     */
    private fun calendariVisibili(): List<String> {
        val fuori = ArrayList<String>()
        val cursore = context.contentResolver.query(
            CalendarContract.Calendars.CONTENT_URI,
            arrayOf(CalendarContract.Calendars.CALENDAR_DISPLAY_NAME),
            "${CalendarContract.Calendars.VISIBLE} = 1",
            null,
            "${CalendarContract.Calendars.CALENDAR_DISPLAY_NAME} ASC",
        ) ?: return fuori
        cursore.use { c ->
            while (c.moveToNext()) {
                val nome = c.getString(0)
                if (!nome.isNullOrBlank() && !fuori.contains(nome)) fuori.add(nome)
            }
        }
        return fuori
    }

    private fun leggiIstanze(da: Long, a: Long, conFestivita: Boolean): JSArray {
        val fuori = JSArray()
        val proiezione = arrayOf(
            /*
             * ⭐⭐⭐ L'ID DELL'EVENTO — senza, si può solo GUARDARE.
             *
             * Censimento del 2026-08-14: Gemini dichiara «aggiungere,
             * visualizzare **o modificare** eventi», TALOS sapeva solo creare e
             * leggere. La causa non era una capacità mancante: era che la
             * lettura non diceva **quale** evento aveva letto, quindi non c'era
             * niente da indirizzare.
             *
             * ⛔ `Instances.EVENT_ID` e non `Instances._ID`: il secondo è l'id
             * dell'ISTANZA — una singola ricorrenza — e non si può passare a
             * `Events.CONTENT_URI`. Sono due numeri diversi che sembrano lo
             * stesso, ed è il modo esatto in cui si cancella l'evento sbagliato.
             */
            CalendarContract.Instances.EVENT_ID,
            CalendarContract.Instances.TITLE,
            CalendarContract.Instances.BEGIN,
            CalendarContract.Instances.END,
            CalendarContract.Instances.ALL_DAY,
            CalendarContract.Instances.EVENT_LOCATION,
            CalendarContract.Instances.CALENDAR_DISPLAY_NAME,
            CalendarContract.Instances.AVAILABILITY,
            CalendarContract.Instances.STATUS,
            CalendarContract.Instances.SELF_ATTENDEE_STATUS,
        )
        /*
         * ⛔⛔ LE TRE CONDIZIONI, ognuna nata da una MISURA sul Pad.
         *
         * 1. `deleted = 0` — un evento cancellato resta nella tabella fino alla
         *    sincronizzazione dopo. Senza, si leggono eventi **fantasma** che la
         *    persona ha già tolto.
         *
         * 2. ⛔ `eventStatus` si esclude **solo se vale 2** (annullato), NON si
         *    pretende che valga 1. Misurato: un evento creato in locale ha
         *    `eventStatus = NULL`, mentre le festività sincronizzate hanno 1.
         *    Il filtro che verrebbe naturale — «tieni solo i confermati» —
         *    **cancellerebbe tutti gli eventi locali**.
         *
         * 3. `visible = 1` sul calendario: se la persona ne ha nascosto uno
         *    nella sua app, la sua scelta vale anche per noi.
         */
        val dove = StringBuilder(
            // ⛔ La costante vive su `Events`, non su `Instances`: è la stessa
            // colonna — `Instances` è una vista sugli eventi — ma il compilatore
            // non la trova sull'altra faccia.
            "${CalendarContract.Events.DELETED} = 0" +
                " AND (${CalendarContract.Instances.STATUS} IS NULL" +
                " OR ${CalendarContract.Instances.STATUS} != ${CalendarContract.Events.STATUS_CANCELED})" +
                " AND ${CalendarContract.Instances.VISIBLE} = 1" +
                // ⛔ Un invito RIFIUTATO non è un impegno: la giornata è libera.
                " AND (${CalendarContract.Instances.SELF_ATTENDEE_STATUS} IS NULL" +
                " OR ${CalendarContract.Instances.SELF_ATTENDEE_STATUS} != " +
                "${CalendarContract.Attendees.ATTENDEE_STATUS_DECLINED})",
        )
        /*
         * ⛔⛔ FESTIVITÀ E IMPEGNI NON SI DISTINGUONO PER NOME.
         *
         * Misurato: «Assunzione» e «Ferragosto» hanno `availability = FREE`, il
         * «Dentista» ha `BUSY`. La differenza sta nella **disponibilità**, non
         * nel titolo né nel calendario — quindi niente tabella di calendari da
         * escludere, che sarebbe scritta a mano e invecchierebbe.
         *
         * ⇒ Chi chiede «che impegni ho» vuole ciò che lo occupa; chi chiede
         * «cosa c'è domani» vuole anche le feste. La distinzione è nella
         * domanda, e arriva come parametro dichiarato.
         */
        if (!conFestivita) {
            dove.append(
                " AND ${CalendarContract.Instances.AVAILABILITY} != " +
                    "${CalendarContract.Events.AVAILABILITY_FREE}",
            )
        }
        val uri = CalendarContract.Instances.CONTENT_URI.buildUpon()
        ContentUris.appendId(uri, da)
        ContentUris.appendId(uri, a)
        val cursore = context.contentResolver.query(
            uri.build(),
            proiezione,
            dove.toString(),
            null,
            "${CalendarContract.Instances.BEGIN} ASC",
        ) ?: return fuori
        cursore.use { c ->
            var quanti = 0
            while (c.moveToNext() && quanti < MAX_EVENTI) {
                quanti += 1
                fuori.put(
                    JSObject()
                        .put("id", c.getLong(0))
                        .put("titolo", c.getString(1) ?: "(senza titolo)")
                        .put("inizio", c.getLong(2))
                        .put("fine", c.getLong(3))
                        /*
                         * ⛔ Un evento «tutto il giorno» è memorizzato a
                         * mezzanotte **UTC**, non locale. Convertirlo col fuso
                         * del telefono lo fa comparire a cavallo di due giorni.
                         * Il flag viaggia, e chi formatta legge in UTC.
                         */
                        .put("tuttoIlGiorno", c.getInt(4) == 1)
                        .put("luogo", c.getString(5) ?: "")
                        .put("calendario", c.getString(6) ?: "")
                        .put("occupa", c.getInt(7) != CalendarContract.Events.AVAILABILITY_FREE),
                )
            }
        }
        return fuori
    }

    private companion object {
        /**
         * ⛔ Un tetto c'è, e non è arbitrario: una settimana fitta sta sotto le
         * cinquanta righe, e chi chiede «cosa ho quest'anno» non deve poter
         * tirare fuori l'agenda intera passando dal modello.
         */
        const val MAX_EVENTI = 50
    }
}
