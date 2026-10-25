package ai.talos.aggiornamenti

/**
 * Le versioni del mobile sono `x.y.z` (tag `vx.y.z` fino alla 0.1.45, `mobile-vx.y.z` dalla 0.1.46, come `desktop-vx.y.z`:
 * owner 23/10, «ponte alla 0.1.45»); la copia affiancata aggiunge `-dev`, la build senza tag è `0.0.0`
 * (`android/app/build.gradle`, «IL RIPIEGO E' 0.0.0»). Una versione che non si legge non è mai più nuova: nel dubbio si resta.
 */
object TalosVersioneAggiornamento {

    private val VERSIONE = Regex("""^(\d{1,6})\.(\d{1,6})\.(\d{1,6})$""")
    // ⛔ le due forme restano lette per sempre: la 0.1.44 vede solo `v…`, quindi il ponte è la 0.1.45 ancora `v0.1.45`
    private val TAG = Regex("""^(?:mobile-)?v(\d{1,6}\.\d{1,6}\.\d{1,6})$""")

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
