package ai.talos.agent

import android.Manifest
import android.content.pm.PackageManager
import android.provider.ContactsContract
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission

/**
 * ⭐⭐ LA RUBRICA — e perché è il fondamento di TUTTI gli intent.
 *
 * ## Il confronto che l'ha resa urgente
 *
 * MISURATO sul Pad il 2026-08-13, stesso compito su TALOS e su Gemini:
 * «manda un messaggio WhatsApp ad Antonino Rizzo che dice ciao».
 *
 * | | TALOS | Gemini |
 * |---|---|---|
 * | come | pilota dello schermo | intent |
 * | WhatsApp aperto | sì, visibilmente | **mai** |
 * | passi | **20** in 27,8 s | zero |
 * | esito | ⛔ `troppi-passi` | ✅ «Lo sto inviando» |
 *
 * E la frase che ha svelato il meccanismo, quando il nome era sbagliato:
 * «Non ho trovato il contatto "Io Tu" **nella tua rubrica**». ⇒ Gemini non
 * cerca sullo schermo: risolve il nome in rubrica e apre l'app col
 * destinatario già dentro.
 *
 * ⇒ Senza rubrica, ogni intent «manda a <persona>» resta impossibile, e resta
 * solo la strada lunga. Con la rubrica diventa una riga.
 *
 * ## ⛔ Cosa NON fa, di proposito
 *
 * Non elenca la rubrica e non la esporta: **cerca per nome e torna il minimo
 * che serve a un intent**. Un tool che sa dire «dammi tutti i contatti» è un
 * tool che, il giorno che il modello sbaglia, ne spedisce mille — e la difesa
 * migliore contro un dato che esce è non averlo mai raccolto.
 *
 * ⛔ Il numero NON viene mai messo in un log: `Log.i` con dentro un recapito
 * finisce in `logcat`, che su Android è leggibile da chi fa il debug e resta
 * nei bug report.
 */
@CapacitorPlugin(
    name = "TalosRubrica",
    permissions = [Permission(strings = [Manifest.permission.READ_CONTACTS], alias = "contatti")],
)
class TalosRubricaPlugin : Plugin() {

    /**
     * Cerca un contatto per nome e torna i suoi recapiti telefonici.
     *
     * Risposta: `{ permesso: Boolean, trovati: [{ nome, numeri: [...] }] }`
     *
     * ⛔ `permesso` viaggia SEMPRE, anche quando `trovati` è vuoto: «non ho il
     * permesso di guardare» e «ho guardato e non c'è» sono due fatti diversi,
     * e confonderli è il difetto che questo progetto ha inseguito tutto il
     * giorno in quattro strati diversi.
     */
    @PluginMethod
    fun cerca(call: PluginCall) {
        val nome = call.getString("nome")?.trim().orEmpty()
        if (nome.length < 2) {
            call.reject("Serve almeno due lettere del nome.")
            return
        }
        val concesso = context.checkSelfPermission(Manifest.permission.READ_CONTACTS) ==
            PackageManager.PERMISSION_GRANTED
        if (!concesso) {
            call.resolve(JSObject().put("permesso", false).put("trovati", JSArray()))
            return
        }
        call.resolve(
            JSObject()
                .put("permesso", true)
                .put("trovati", cercaInRubrica(nome)),
        )
    }

    /** Chiede il permesso alla persona. Separato da `cerca`: chiedere è un gesto. */
    @PluginMethod
    fun chiediPermesso(call: PluginCall) {
        requestPermissionForAlias("contatti", call, "esitoPermesso")
    }

    @com.getcapacitor.annotation.PermissionCallback
    private fun esitoPermesso(call: PluginCall) {
        val concesso = context.checkSelfPermission(Manifest.permission.READ_CONTACTS) ==
            PackageManager.PERMISSION_GRANTED
        call.resolve(JSObject().put("permesso", concesso))
    }

    private fun cercaInRubrica(nome: String): JSArray {
        val fuori = JSArray()
        /*
         * ⛔ Si interroga la vista `PHONE` e non `Contacts`: un contatto senza
         * numero non serve a nessun intent di messaggio, e includerlo
         * significherebbe far scegliere al modello fra righe che non può usare.
         */
        val proiezione = arrayOf(
            ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME,
            ContactsContract.CommonDataKinds.Phone.NUMBER,
        )
        val cursore = context.contentResolver.query(
            ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
            proiezione,
            "${ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME} LIKE ?",
            arrayOf("%$nome%"),
            "${ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME} ASC",
        ) ?: return fuori
        // Un contatto con tre numeri sono tre righe: si raggruppano per nome,
        // perché chi chiede «manda a Mario» pensa a UNA persona, non a tre voci.
        val perNome = LinkedHashMap<String, MutableList<String>>()
        cursore.use { c ->
            val iNome = c.getColumnIndexOrThrow(proiezione[0])
            val iNumero = c.getColumnIndexOrThrow(proiezione[1])
            // ⛔ Un tetto c'è, e basso: chi cerca «a» non deve poter tirare fuori
            // mezza rubrica passando dal modello.
            while (c.moveToNext() && perNome.size <= MAX_CONTATTI) {
                val etichetta = c.getString(iNome) ?: continue
                val numero = c.getString(iNumero) ?: continue
                perNome.getOrPut(etichetta) { mutableListOf() }.add(numero)
            }
        }
        for ((etichetta, numeri) in perNome) {
            fuori.put(
                JSObject()
                    .put("nome", etichetta)
                    .put("numeri", JSArray(numeri.distinct().toTypedArray())),
            )
        }
        return fuori
    }

    private companion object {
        /**
         * ⛔ Dieci, non cento. Se una ricerca ne trova di più, il nome era
         * troppo generico e la risposta giusta è chiedere di precisare — non
         * riversare la rubrica in un prompt.
         */
        const val MAX_CONTATTI = 10
    }
}
