package ai.talos.agent.ponte

/**
 * ⭐ Quale motivo dire quando il giro della notifica d'accoppiamento non arriva al collegamento (ASS-149, owner 29/10 con la foto dal Pad;
 * OK del Desktop). Parte pura, provata sulla JVM (`TalosAccoppiamentoEsitoRegolaTest`).
 *
 * Misurato sul Pad il 29/10: la chiave di TALOS dev era fra le autorizzate (accoppiamento RIUSCITO), adbd senza fili in ascolto su una
 * porta, ma senza annuncio mDNS: TALOS non trovava dove collegarsi e la notifica diceva «riaprila e scrivi il codice nuovo». Il codice
 * era giusto. Dopo un accoppiamento riuscito il motivo è «accoppiato, manca il collegamento», salvo la rete locale tolta (ASS-148).
 */
object TalosAccoppiamentoEsitoRegola {

    const val ACCOPPIATO_NON_COLLEGATO = "paired-not-connected"

    fun motivo(accoppiato: Boolean, collegato: Boolean, motivo: String?): String? = when {
        collegato -> null
        accoppiato -> if (motivo == "local-network-blocked") motivo else ACCOPPIATO_NON_COLLEGATO
        else -> motivo ?: "pair-refused"
    }
}
