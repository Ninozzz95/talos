package ai.talos.agent.ponte

/**
 * ⭐ La parte PURA della rete locale tolta (ASS-148, LEDGER-ASS-148-RETE-LOCALE-NEGATA-2026-10-28.md, OK del Desktop 28/10): niente Android
 * qui dentro, così si prova sulla JVM (`TalosReteLocaleRegolaTest`).
 *
 * Misura sul OnePlus 13 (Android 17, 28/10): sotto targetSdk 37 il permesso è implicito con INTERNET, ma la persona può toglierlo da
 * «Rete locale». Allora `checkSelfPermission` dice ancora «concesso» (`REVOKED_COMPAT`) e il blocco si vede SOLO nell'appop (`ignore`):
 * NsdManager tace e il ponte diceva «non sento l'annuncio», mandando la persona a ripetere un gesto che non poteva riuscire.
 */
object TalosReteLocaleRegola {

    const val PERMESSO = "android.permission.ACCESS_LOCAL_NETWORK"

    /**
     * IGNORED (1) ed ERRORED (2) bloccano. DEFAULT (3) lascia decidere al permesso, che sotto targetSdk 37 c'è; FOREGROUND (4) fa passare
     * l'app in primo piano, cioè la schermata del ponte. `null` = «non lo so»: nel dubbio non si accusa la persona.
     */
    // 1 = AppOpsManager.MODE_IGNORED, 2 = MODE_ERRORED: scritti a mano perché il file resta puro; RETE-NEGATA-04 li confronta con le costanti vere
    fun bloccataDalModo(mode: Int?): Boolean = mode == 1 || mode == 2

    /** Senza annunci, se la rete è bloccata la causa vera è quella; se no il motivo di sempre. */
    fun motivoSenzaAnnunci(motivo: String, bloccata: Boolean): String = if (bloccata) "local-network-blocked" else motivo
}
