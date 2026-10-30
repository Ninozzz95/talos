package ai.talos.artifact

/**
 * ⭐ La parte PURA della testata nativa del visual interattivo (UI-108, owner 28/10: «non c'è un header, una testata, si può bene tra con
 * la status bar del telefono»; mockup https://claude.ai/artifact/S3mAxFoTAkEAAjPdAJhyg6; scelte dell'owner del 29/10: sfondo del visual
 * BIANCO come oggi, filo da 1 px sotto la testata; OK del Desktop al piano). Niente `android.graphics.Color`: si prova sulla JVM.
 *
 * I colori arrivano da JS (i `--talos-*` vivi del tema attivo) come stringhe: qui si validano, e ciò che non è un `#rrggbb` diventa il
 * colore di serie del tema Calm nel suo schema, mai trasparente. Il titolo arriva dal modello: qui perde controlli, bidi e larghezza zero.
 */
object TalosArtifactChrome {

    data class Colori(val header: Int, val background: Int, val text: Int, val border: Int, val ring: Int)

    // Calm, risolti dal codice vero (`talosThemeModeVariantStyle` + `talosCanonicalOpaqueColor`, ricerca del 28/10)
    val CALM_SCURO = Colori(argb("#1b1c20"), argb("#1e1f22"), argb("#edf2f7"), argb("#2c2f36"), argb("#c08b3c"))
    val CALM_CHIARO = Colori(argb("#f3f4f5"), argb("#f1f2f4"), argb("#111827"), argb("#63666b"), argb("#000000"))

    const val TITOLO_MASSIMO = 80

    private val ESADECIMALE = Regex("^#[0-9a-fA-F]{6}$")

    fun coloreValido(colore: String?): Boolean = colore != null && ESADECIMALE.matches(colore)

    /** `#rrggbb` → ARGB opaco. Chi chiama ha già validato. */
    fun argb(colore: String): Int = (0xFF shl 24) or colore.substring(1).toInt(16)

    /**
     * ⛔ Mai colori MESCOLATI (difetto fotografato sul Pad il 29/10: testata di serie scura + testo del tema chiaro ⇒ titolo invisibile).
     * Testata e testo vanno insieme: se uno dei due manca, o se insieme non arrivano a 4,5:1, vale tutta la tavolozza di serie. E lo
     * schema lo dice la testata vera, non l'etichetta che arriva.
     */
    fun colori(schema: String?, valori: Map<String, String?>): Colori {
        fun valido(chiave: String): Int? = valori[chiave]?.takeIf(::coloreValido)?.let(::argb)
        val header = valido("header")
        val text = valido("text")
        if (header == null || text == null) return if (schema == "light") CALM_CHIARO else CALM_SCURO
        val base = if (iconeScure(header)) CALM_CHIARO else CALM_SCURO
        if (contrasto(text, header) < 4.5) return base
        return Colori(
            header = header,
            background = valido("background") ?: base.background,
            text = text,
            border = valido("border") ?: base.border,
            ring = valido("ring") ?: base.ring,
        )
    }

    /** Rapporto di contrasto WCAG fra due ARGB opachi. */
    fun contrasto(a: Int, b: Int): Double {
        val la = luminanza(a)
        val lb = luminanza(b)
        return (maxOf(la, lb) + 0.05) / (minOf(la, lb) + 0.05)
    }

    /** Luminanza relativa WCAG di un ARGB opaco. */
    fun luminanza(argb: Int): Double {
        fun canale(c: Int): Double {
            val v = c / 255.0
            return if (v <= 0.03928) v / 12.92 else Math.pow((v + 0.055) / 1.055, 2.4)
        }
        return 0.2126 * canale((argb shr 16) and 0xFF) + 0.7152 * canale((argb shr 8) and 0xFF) + 0.0722 * canale(argb and 0xFF)
    }

    /** Icone di sistema scure solo su una testata chiara: 0,179 è il punto in cui nero e bianco hanno lo stesso contrasto. */
    fun iconeScure(header: Int): Boolean = luminanza(header) > 0.179

    private val INVISIBILI = Regex("""[\p{Cc}\p{Cf}\u2028\u2029]""")

    /** Senza controlli (Cc), formati (Cf: bidi, larghezza zero, BOM), a capo; spazi stretti; troncato con «…». */
    fun titoloPulito(titolo: String?): String {
        val pulito = (titolo ?: "").replace(INVISIBILI, " ").replace(Regex("""\s+"""), " ").trim()
        return if (pulito.length <= TITOLO_MASSIMO) pulito else pulito.take(TITOLO_MASSIMO - 1).trimEnd() + "…"
    }
}
