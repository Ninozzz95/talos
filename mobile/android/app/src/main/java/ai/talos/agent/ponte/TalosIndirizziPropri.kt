package ai.talos.agent.ponte

import java.net.NetworkInterface

/**
 * ⛔⛔ ASS-149 D1 (29/10/2026, difetto di sicurezza trovato dalla ricerca; OK del Desktop): la scoperta mDNS del ponte accettava
 * l'annuncio `_adb-tls-*` di QUALUNQUE dispositivo della rete, quindi un altro telefono col Debug wireless acceso poteva diventare la
 * meta del riaggancio. Si accetta solo l'annuncio il cui indirizzo è di una delle interfacce del dispositivo stesso, tutte (più reti,
 * IPv6 col suo ambito): è la regola di Shizuku (`manager/.../adb/AdbMdns.kt:59-72`, RikkaApps/Shizuku b844bc4).
 *
 * Senza indirizzi propri noti non si accetta niente: si chiude, non si indovina.
 */
object TalosIndirizziPropri {

    /** «fe80::1%wlan0» e «FE80::1» sono lo stesso indirizzo. */
    fun normalizza(indirizzo: String): String = indirizzo.substringBefore('%').trim().lowercase()

    fun eProprio(ospite: String, propri: Set<String>): Boolean {
        val chiave = normalizza(ospite)
        return propri.any { normalizza(it) == chiave }
    }

    /** Gli annunci risolti (ospite, porta) che sono davvero di questo dispositivo, come «ip:porta», nell'ordine di arrivo. */
    fun soloPropri(risolti: List<Pair<String, Int>>, propri: Set<String>): List<String> =
        risolti.filter { (ospite, _) -> eProprio(ospite, propri) }.map { (ospite, porta) -> "$ospite:$porta" }

    /** Gli indirizzi di TUTTE le interfacce del dispositivo; vuoto se il sistema non li dà (e allora non si accetta niente). */
    fun delDispositivo(): Set<String> = runCatching {
        NetworkInterface.getNetworkInterfaces()?.toList().orEmpty()
            .flatMap { it.inetAddresses.toList() }
            .mapNotNull { it.hostAddress?.let(::normalizza) }
            .toSet()
    }.getOrDefault(emptySet())
}
