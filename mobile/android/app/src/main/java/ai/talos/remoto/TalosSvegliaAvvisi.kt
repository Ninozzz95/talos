package ai.talos.remoto

import ai.talos.R
import org.json.JSONArray
import org.json.JSONObject
import java.net.URLEncoder
import java.security.MessageDigest
import java.time.Instant

/**
 * ⛔ R-M5a (ledger `LEDGER-CLIENT-REMOTO-MOBILE-2026-10-20.md`, 21/10/2026): COSA dire dopo una sveglia. Il PC non lo scrive nel Web
 * Push (carico `{v, w}`, Sygnal `event_id_only`): il telefono si collega, legge `sessions.list` e lo capisce dalle righe. Qui solo
 * parti pure (provate in JVM); testi e canali in `TalosSvegliaNotifiche`.
 *
 * Forme di r4 a16cb10e7 (Desktop 21/10/2026): `inAttesaApprovazione|Domanda|Piano|RichiestaMcp`; `inAttesaDiscendente` (C2-R7: la carta
 * della figlia sta nella madre, e il PC sveglia per la madre); una figlia (`padreId` o `profonditaDelega > 0`) non ha avvisi suoi; un
 * passo di Workflow (`passoWorkflow`, senza `padreId`) è una sessione come le altre e si apre sulla sua; `conclusa` + `ultimoEsito`
 * ('errore' = fallito) + `motivoChiusura` ('fermata' e 'in-pausa' li ha voluti la persona: niente avviso) + `ultimaRispostaAlle`.
 * Owner R-M5 Q5: «Richieste + giro finito, il finito più discreto».
 */
object TalosSvegliaAvvisi {
    enum class Tipo { PERMESSO, DOMANDA, PIANO, MCP, AIUTANTE, FINITO, FALLITO }

    /**
     * `chiedeDa`: per l'aiutante, la figlia che aspetta (il dettaglio si legge da LEI, `session.pending`). `requestId` e `dettaglio`
     * li mette il lavoro dopo `session.pending`; `alle`: quando è successo (fine del giro), per l'ora della notifica.
     */
    data class Avviso(
        val sessionId: String,
        val nome: String?,
        val tipo: Tipo,
        val chiedeDa: String? = null,
        val dettaglio: String? = null,
        val requestId: String? = null,
        val alle: Long? = null,
        /** D-RM5-4: la chiave della carta come la scrive l'app (`approvazione:<id>`, `domanda:<id>`), da `session.pending`. */
        val chiaveCarta: String? = null,
    )

    /** I giri chiusi detti in una sveglia: di più è rumore. Le richieste non hanno tetto qui (ognuna aspetta la persona). */
    const val CHIUSI_MASSIMI = 5
    /** Solo una difesa contro un elenco enorme: oltre, il gruppo di Android le riassume comunque. */
    private const val RICHIESTE_MASSIME = 24
    const val DETTAGLIO_MASSIMO = 120
    private const val NOME_MASSIMO = 80
    /** Come il PC (`sveglia.mjs` `GIRO_LUNGO_MS`): un giro riuscito avvisa solo se è durato almeno 2 minuti. */
    const val GIRO_LUNGO_MS = 2 * 60_000L
    private val NON_FALLIMENTI = setOf("fermata", "in-pausa")

    val Tipo.richiesta: Boolean get() = this != Tipo.FINITO && this != Tipo.FALLITO

    /**
     * Le righe di `sessions.list` diventano gli avvisi, e le firme dei giri chiusi da ricordare per la volta dopo. Le regole sono
     * quelle del PC (`sveglia.mjs`, cura del Desktop del 21/10), così il telefono dice ciò per cui il PC lo sveglia e niente altro:
     * - richieste della persona su una sessione principale (anche un passo di Workflow, che si apre sulla sua sessione);
     * - di una figlia solo MCP e piano, sulla SUA riga: permesso e domanda li porta la madre (`inAttesaDiscendente`, C2-R7);
     * - un giro chiuso (`fineGiroAlle`, scritto su RunFinished e RunError; `null` = nessun giro chiuso noto, mai «nuovo») se è
     *   fallito o durato almeno `GIRO_LUNGO_MS`; mai la fine di un passo di Workflow; mai 'fermata'/'in-pausa'.
     * `firmePrima == null` = prima sveglia dopo l'attivazione: i giri chiusi fanno da base, salvo quelli finiti dopo `attivataAlle`.
     * Un giro avvisa una volta sola (firma `esito|motivo|fineGiroAlle`). Uno oltre `CHIUSI_MASSIMI` non si ricorda: tocca alla dopo.
     */
    fun scegli(items: JSONArray, firmePrima: Map<String, String>?, attivataAlle: Long): Pair<List<Avviso>, Map<String, String>> {
        val righe = (0 until items.length()).mapNotNull { items.opt(it) as? JSONObject }
            .filter { (it.opt("sessionId") as? String)?.isNotBlank() == true }
        val perId = righe.associateBy { it.getString("sessionId") }
        val richieste = mutableListOf<Avviso>()
        val chiusi = mutableListOf<Pair<Avviso, String>>()
        val firme = mutableMapOf<String, String>()
        for (r in righe) {
            val id = r.getString("sessionId")
            val nome = (r.opt("nome") as? String)?.trim()?.takeIf { it.isNotEmpty() }?.take(NOME_MASSIMO)
            if (figlia(r)) {
                val suo = when {
                    vero(r, "inAttesaRichiestaMcp") -> Tipo.MCP
                    vero(r, "inAttesaPiano") -> Tipo.PIANO
                    else -> null
                }
                if (suo != null) richieste += Avviso(id, nome, suo)
                continue
            }
            val tipo = when {
                vero(r, "inAttesaApprovazione") -> Tipo.PERMESSO
                vero(r, "inAttesaDomanda") -> Tipo.DOMANDA
                vero(r, "inAttesaPiano") -> Tipo.PIANO
                vero(r, "inAttesaRichiestaMcp") -> Tipo.MCP
                vero(r, "inAttesaDiscendente") -> Tipo.AIUTANTE
                else -> null
            }
            if (tipo != null) {
                richieste += Avviso(id, nome, tipo, if (tipo == Tipo.AIUTANTE) figliaInAttesa(id, righe, perId) else null)
                continue
            }
            if (!vero(r, "conclusa")) continue
            val fineTesto = r.opt("fineGiroAlle") as? String
            val fine = istante(fineTesto) ?: continue
            val esito = r.opt("ultimoEsito") as? String
            val motivo = r.opt("motivoChiusura") as? String
            val firma = "${esito ?: ""}|${motivo ?: ""}|$fineTesto"
            val fallito = esito == "errore" && motivo !in NON_FALLIMENTI
            val inizio = istante(r.opt("inizioGiroAlle") as? String)
            val lungo = esito != "errore" && motivo !in NON_FALLIMENTI && inizio != null && fine - inizio >= GIRO_LUNGO_MS
            val daDire = (fallito || lungo) && !(r.opt("passoWorkflow") is JSONObject)
            val nuova = if (firmePrima == null) fine > attivataAlle else firmePrima[id] != firma
            if (daDire && nuova) chiusi += Avviso(id, nome, if (fallito) Tipo.FALLITO else Tipo.FINITO, alle = fine) to firma
            else firme[id] = firma
        }
        val detti = chiusi.take(CHIUSI_MASSIMI)
        for ((a, firma) in detti) firme[a.sessionId] = firma
        return (richieste.take(RICHIESTE_MASSIME) + detti.map { it.first }) to firme
    }

    /**
     * Il testo della notifica (risorsa): decisione owner 21/10/2026 «Sempre generiche col blocco» ⇒ col PIN di TALOS acceso né la
     * sessione né il dettaglio, anche a schermo sbloccato (OWASP MASWE-0037). Senza blocco: il testo del tipo, «_con» se c'è il dettaglio.
     */
    fun testoDa(tipo: Tipo, conDettaglio: Boolean, riservata: Boolean): Int = if (riservata) when (tipo) {
        Tipo.FINITO -> R.string.talos_sveglia_riservata_finito
        Tipo.FALLITO -> R.string.talos_sveglia_riservata_fallito
        else -> R.string.talos_sveglia_riservata_richiesta
    } else when (tipo) {
        Tipo.PERMESSO -> if (conDettaglio) R.string.talos_sveglia_permesso_con else R.string.talos_sveglia_permesso
        Tipo.DOMANDA -> if (conDettaglio) R.string.talos_sveglia_domanda_con else R.string.talos_sveglia_domanda
        Tipo.AIUTANTE -> if (conDettaglio) R.string.talos_sveglia_aiutante_con else R.string.talos_sveglia_aiutante
        Tipo.PIANO -> R.string.talos_sveglia_piano
        Tipo.MCP -> R.string.talos_sveglia_mcp
        Tipo.FINITO -> R.string.talos_sveglia_finito
        Tipo.FALLITO -> R.string.talos_sveglia_fallito
    }

    /**
     * Il carico della sveglia (`{v:1, w, p?}`): `true` se il PC dice che è «Prova la notifica» (`p:1`), `false` se è un carico che
     * conosce il campo e non è una prova (`p:0`), `null` se il PC non lo dice (PC di prima, o carico che non si legge).
     */
    fun eUnaProva(contenuto: ByteArray): Boolean? = try {
        val o = JSONObject(String(contenuto, Charsets.UTF_8))
        when (o.opt("p")) { 1 -> true; 0 -> false; else -> null }
    } catch (e: Exception) { null }

    /** La chiave della carta (`cartaVista.ts` `carteAperteR4`) dalla risposta di `session.pending`; `null` se non si legge. */
    fun chiaveCarta(pending: JSONObject?): String? {
        val tipo = when (pending?.opt("tipo")) { "approvazione" -> "approvazione"; "domanda" -> "domanda"; else -> return null }
        val id = (pending.opt("requestId") as? String)?.takeIf { it.isNotEmpty() } ?: return null
        return "$tipo:$id"
    }

    /**
     * ⛔ D-RM5-4: una carta che la persona ha già visto nell'app (`viste`: `sessionId|chiave`, scritte da `svegliaVista`) non diventa
     * notifica. Il piano non ha un id della richiesta: basta un piano visto in quella sessione. Senza chiave non si sa ⇒ si notifica.
     */
    fun giaVista(a: Avviso, viste: Set<String>): Boolean = when {
        a.tipo == Tipo.PIANO -> viste.any { it.startsWith("${a.sessionId}|piano:") }
        a.chiaveCarta == null -> false
        // revisione R-M5a bis (4): la carta della figlia può essere stata vista nella pagina della FIGLIA, non solo nella madre
        else -> "${a.sessionId}|${a.chiaveCarta}" in viste || (a.chiedeDa != null && "${a.chiedeDa}|${a.chiaveCarta}" in viste)
    }

    /**
     * Revisione R-M5a bis (2): un piano visto restava «visto» per sempre e zittiva i piani successivi. A ogni lettura dell'elenco
     * restano solo le viste delle sessioni che aspettano ancora la persona (una madre aspetta anche per la figlia).
     */
    fun potaViste(viste: List<String>, items: JSONArray): List<String> {
        val aspettano = (0 until items.length()).mapNotNull { items.opt(it) as? JSONObject }
            .filter { r -> listOf("inAttesaApprovazione", "inAttesaDomanda", "inAttesaPiano", "inAttesaRichiestaMcp", "inAttesaDiscendente").any { vero(r, it) } }
            .mapNotNull { it.opt("sessionId") as? String }.toSet()
        return viste.filter { it.substringBefore('|') in aspettano }
    }

    /** Revisione R-M5a bis (8): la più recente in fondo (una rivista torna in fondo), tetto togliendo le più vecchie. */
    fun aggiungiViste(prima: List<String>, nuove: List<String>, tetto: Int): List<String> =
        ((prima - nuove.toSet()) + nuove.distinct()).takeLast(tetto)

    fun inJsonViste(viste: List<String>): String = JSONArray(viste).toString()

    fun daJsonViste(testo: String?): List<String> = try {
        JSONArray(testo ?: "[]").let { a -> (0 until a.length()).mapNotNull { a.opt(it) as? String } }
    } catch (e: Exception) { emptyList() }

    /** Revisione R-M5a bis (10): come ripubblicare una richiesta rispetto alla firma di prima (`~` = tolta dal blocco, torna muta). */
    enum class Ripubblica { SALTA, SILENZIOSA, NUOVA }

    fun ripubblica(firmaPrima: String?, firma: String): Ripubblica = when (firmaPrima) {
        firma -> Ripubblica.SALTA
        "~$firma" -> Ripubblica.SILENZIOSA
        else -> Ripubblica.NUOVA
    }

    /** Revisione R-M5a bis (6): il riallineamento ha un id suo (7000-7499), così non si scontra mai con la sveglia. */
    fun idRiallinea(posto: Int): Int = 7000 + posto.coerceIn(0, POSTI - 1)

    /** Una richiesta già detta non suona di nuovo: cambia solo con la richiesta (il suo `requestId`, o tipo e dettaglio). */
    fun firmaRichiesta(a: Avviso): String = "${a.tipo}|${a.requestId ?: ""}|${if (a.requestId == null) a.dettaglio ?: "" else ""}"

    /** La riga leggibile da `session.pending` (`domandaInAttesa`, r4 `session-registry.mjs:12779`): su una riga, tagliata. */
    fun dettaglio(pending: JSONObject?): String? {
        if (pending == null) return null
        val testo = when (pending.opt("tipo")) {
            "approvazione" -> (pending.opt("azione") as? JSONObject)?.let { a ->
                listOf("percorso", "comando", "url", "question", "title", "compito").firstNotNullOfOrNull { (a.opt(it) as? String)?.takeIf(String::isNotBlank) }
            }
            "domanda" -> ((pending.opt("questions") as? JSONArray)?.opt(0) as? JSONObject)?.opt("question") as? String
            else -> null
        }
        return testo?.replace(Regex("\\s+"), " ")?.trim()?.takeIf { it.isNotEmpty() }?.take(DETTAGLIO_MASSIMO)
    }

    /** Una notifica di richiesta per sessione (passa da permesso a domanda al posto suo) e una per il giro chiuso. */
    fun idNotifica(pcId: String, sessionId: String, tipo: Tipo): Int {
        val h = sha256("$pcId\u0000$sessionId\u0000${if (tipo.richiesta) "richiesta" else "giro"}")
        // N0 (21/10/2026), D-N0-5: 30 bit sopra 2^30 (`TalosNotificationIds.SVEGLIA`), dove non c'è nessun'altra notifica del telefono
        return ai.talos.TalosNotificationIds.SVEGLIA_MIN or
            (((h[0].toInt() and 0x3f) shl 24) or ((h[1].toInt() and 0xff) shl 16) or ((h[2].toInt() and 0xff) shl 8) or (h[3].toInt() and 0xff))
    }

    /** La notifica provvisoria di un PC («<PC> ha bisogno di te»), finché il lavoro non legge l'elenco. */
    fun idProvvisoria(pcId: String): Int = idNotifica(pcId, "\u0000provvisoria", Tipo.PERMESSO)

    /**
     * Il job di un PC (`posto` da `postoLibero`): dispari quello della sveglia, pari quello che manda solo l'iscrizione. Fra 6000 e 6999, fuori da quelli delle
     * attività (`TalosTaskRunPlugin.jobId`, 4900-5899) e dei download (`TalosTransferJournal`, da 100000).
     */
    fun idLavoro(posto: Int, sveglia: Boolean): Int = 6000 + posto.coerceIn(0, POSTI - 1) * 2 + if (sveglia) 1 else 0

    /** Revisione R-M5a (16): il posto di un PC si assegna (il primo libero) e si ricorda; due PC non si fermano a vicenda i job. */
    fun postoLibero(usati: Set<Int>): Int = (0 until POSTI).firstOrNull { it !in usati } ?: 0

    const val POSTI = 500

    /** Il tocco apre la sessione sul PC (`/computer/:pcId/codice/:id`, `followNotificationRoute`). */
    fun rotta(pcId: String, sessionId: String): String = "/computer/${parte(pcId)}/codice/${parte(sessionId)}"

    /** L'istanza UnifiedPush di un PC: corta e senza l'id in chiaro (una registrazione per PC, con la SUA VAPID). */
    fun istanza(pcId: String): String = "pc:" + sha256(pcId).take(8).joinToString("") { "%02x".format(it) }

    // ——— Interni ———

    private fun vero(r: JSONObject, campo: String) = r.opt(campo) == true

    private fun figlia(r: JSONObject): Boolean =
        (r.opt("padreId") as? String)?.isNotBlank() == true || ((r.opt("profonditaDelega") as? Number)?.toInt() ?: 0) > 0

    /** La discendente che aspetta davvero (permesso o domanda), risalendo `padreId` fino alla madre; tetto di passi. */
    private fun figliaInAttesa(madre: String, righe: List<JSONObject>, perId: Map<String, JSONObject>): String? =
        righe.firstOrNull { r ->
            (vero(r, "inAttesaApprovazione") || vero(r, "inAttesaDomanda")) && run {
                var padre = r.opt("padreId") as? String
                var passi = 0
                while (padre != null && padre != madre && passi < 64) { padre = perId[padre]?.opt("padreId") as? String; passi += 1 }
                padre == madre
            }
        }?.getString("sessionId")

    private fun istante(testo: String?): Long? = try { testo?.let { Instant.parse(it).toEpochMilli() } } catch (e: Exception) { null }

    private fun parte(s: String) = URLEncoder.encode(s, "UTF-8").replace("+", "%20")

    private fun sha256(s: String) = MessageDigest.getInstance("SHA-256").digest(s.toByteArray(Charsets.UTF_8))
}
