package ai.talos.aggiornamenti

/**
 * Le versioni del mobile sono `x.y.z` (tag `vx.y.z`); la copia affiancata aggiunge `-dev`, la build senza tag è `0.0.0`
 * (`android/app/build.gradle`, «IL RIPIEGO E' 0.0.0»). Una versione che non si legge non è mai più nuova: nel dubbio si resta.
 */
object TalosVersioneAggiornamento {

    private val VERSIONE = Regex("""^(\d{1,6})\.(\d{1,6})\.(\d{1,6})$""")
    private val TAG = Regex("""^v(\d{1,6}\.\d{1,6}\.\d{1,6})$""")

    fun piuNuova(candidata: String, installata: String): Boolean {
        val nuova = numeri(candidata) ?: return false
        val vecchia = numeri(installata.removeSuffix("-dev")) ?: return false
        for (i in 0..2) if (nuova[i] != vecchia[i]) return nuova[i] > vecchia[i]
        return false
    }

    fun dalTag(tag: String): String? = TAG.matchEntire(tag)?.groupValues?.get(1)

    internal fun valida(versione: String): Boolean = VERSIONE.matches(versione)

    private fun numeri(versione: String): IntArray? =
        VERSIONE.matchEntire(versione)?.groupValues?.drop(1)?.map { it.toInt() }?.toIntArray()
}
