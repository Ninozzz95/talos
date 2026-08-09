package ai.talos.agent.ponte

import java.math.BigInteger

/**
 * ⭐⭐⭐ ED25519 — il gruppo, scritto in chiaro, perché ci serve LENTO.
 *
 * ## La scorciatoia che possiamo prendere noi e nessun altro
 *
 * Ogni implementazione seria di questa curva usa aritmetica a *limb*: il numero
 * spezzato in dieci pezzi da 25-26 bit, moltiplicazioni srotolate a mano,
 * riduzioni scritte con la carta e la penna. Sono migliaia di righe illeggibili,
 * e ci sono per una ragione sola: **la velocità**. Una libreria di firma fa
 * migliaia di operazioni al secondo.
 *
 * TALOS ne fa **quattro in tutta la vita di un accoppiamento**, e quello
 * accoppiamento succede una volta. A quel ritmo `BigInteger` va benissimo: la
 * differenza fra un millesimo di secondo e un centesimo, una volta sola, non la
 * misura nessuno.
 *
 * ⇒ In cambio il codice si può **leggere** e si può **provare**. Le formule qui
 * sotto sono quelle di RFC 8032 riga per riga, non una loro trasposizione.
 *
 * ## ⛔ Le trappole che restano, anche con i numeri grandi
 *
 * 1. **`mod` e non `rem`.** In Java `%` su un numero negativo dà un risultato
 *    negativo. `BigInteger.mod` no. Un solo `rem` al posto giusto e tutte le
 *    prove passano tranne quelle sui punti con la coordinata «alta».
 * 2. **Il bit del segno sta in cima.** Un punto si scrive come la sola `y` in 32
 *    byte little-endian, e il bit più alto dell'ultimo byte porta la parità di
 *    `x`. Chi lo dimentica ottiene un punto che si decodifica benissimo — ed è
 *    lo specchio di quello giusto.
 * 3. **La radice quadrata può non esistere.** Non tutti i 32 byte sono un punto.
 *    Decodificare senza controllare significa proseguire con un valore che non
 *    sta sulla curva, e da lì ogni conto è spazzatura silenziosa.
 */
internal object TalosEd25519 {

    /** Il campo: `2^255 - 19`. */
    val P: BigInteger = BigInteger.TWO.pow(255).subtract(BigInteger.valueOf(19))

    /** L'ordine del sottogruppo primo. */
    val L: BigInteger = BigInteger.TWO.pow(252)
        .add(BigInteger("27742317777372353535851937790883648493"))

    /** `d = -121665 / 121666`, la costante della curva di Edwards ritorta. */
    val D: BigInteger = BigInteger.valueOf(-121665)
        .multiply(BigInteger.valueOf(121666).modInverse(P)).mod(P)

    /** `sqrt(-1)`, serve a recuperare `x` da `y`. */
    val I: BigInteger = BigInteger.TWO.modPow(P.subtract(BigInteger.ONE).divide(BigInteger.valueOf(4)), P)

    /** Un punto in coordinate affini. L'elemento neutro è `(0, 1)`. */
    data class Punto(val x: BigInteger, val y: BigInteger) {
        fun neutro(): Boolean = x.signum() == 0 && y == BigInteger.ONE
    }

    val NEUTRO = Punto(BigInteger.ZERO, BigInteger.ONE)

    /** Il punto base: `y = 4/5`, con la `x` positiva che ne discende. */
    val BASE: Punto by lazy {
        val y = BigInteger.valueOf(4).multiply(BigInteger.valueOf(5).modInverse(P)).mod(P)
        Punto(recuperaX(y, dispari = false)!!, y)
    }

    /**
     * La somma di due punti, con le formule di RFC 8032 per `a = -1`.
     *
     * Sono complete: valgono anche quando i due punti coincidono o uno è il
     * neutro, e questo è il motivo per cui questa curva si sceglie — niente casi
     * particolari da ricordare, quindi niente casi particolari da sbagliare.
     */
    fun somma(a: Punto, b: Punto): Punto {
        val prodotto = D.multiply(a.x).multiply(b.x).multiply(a.y).multiply(b.y).mod(P)
        val sopra = BigInteger.ONE.add(prodotto).mod(P)
        val sotto = BigInteger.ONE.subtract(prodotto).mod(P)
        val x = a.x.multiply(b.y).add(b.x.multiply(a.y)).mod(P)
            .multiply(sopra.modInverse(P)).mod(P)
        val y = a.y.multiply(b.y).add(a.x.multiply(b.x)).mod(P)
            .multiply(sotto.modInverse(P)).mod(P)
        return Punto(x, y)
    }

    /**
     * `n` volte il punto, col metodo raddoppia-e-somma.
     *
     * ⛔ Non è a tempo costante, e va detto: il segreto qui è la password
     * dell'accoppiamento, e un avversario che misurasse i tempi... non può.
     * Questo codice gira **dentro il telefono della persona**, sul suo stesso
     * processore, per un accoppiamento che dura un istante e succede una volta.
     * Non c'è nessuno a cronometrare. Se un giorno questa aritmetica servisse
     * altrove, questa riga va riletta prima di riusarla.
     */
    fun per(n: BigInteger, punto: Punto): Punto = perGrezzo(n.mod(L), punto)

    /**
     * ⛔⛔ Come `per`, ma **senza ridurre lo scalare**. Non è una comodità: è
     * l'unica forma giusta quando il punto non sta nel sottogruppo primo.
     *
     * ## Perché, con la trappola per intero
     *
     * `per` riduce mod `L` perché su un punto di ordine `L` due scalari
     * congruenti danno lo stesso risultato. Vero — **ma solo lì**.
     *
     * I punti `M` e `N` di SPAKE2 nascono da un hash, quindi hanno anche una
     * componente di ordine piccolo. Su quella, aggiungere `L` **cambia** il
     * risultato: è esattamente il meccanismo con cui BoringSSL rende lo scalare
     * della password un multiplo di otto, così che il cofattore si cancelli.
     *
     * ⇒ Chiamare `per` al posto di questa funzione **annullerebbe quella
     * correzione**, e l'accoppiamento fallirebbe senza un solo errore: due
     * chiavi diverse, e nient'altro da guardare.
     */
    fun perGrezzo(n: BigInteger, punto: Punto): Punto {
        var risultato = NEUTRO
        var somma = punto
        var resto = n
        require(resto.signum() >= 0) { "lo scalare non e' negativo" }
        while (resto.signum() > 0) {
            if (resto.testBit(0)) risultato = somma(risultato, somma)
            somma = somma(somma, somma)
            resto = resto.shiftRight(1)
        }
        return risultato
    }

    /** L'opposto di un punto: stessa `y`, `x` specchiata. */
    fun opposto(punto: Punto): Punto = Punto(P.subtract(punto.x).mod(P), punto.y)

    /**
     * I 32 byte di un punto: `y` little-endian, e in cima il bit del segno di `x`.
     *
     * ⛔ Quel bit non è un dettaglio di impacchettamento: senza, il punto che si
     * rilegge è lo SPECCHIO di quello scritto, e ogni conto successivo dà un
     * risultato pulito e sbagliato.
     */
    fun scrivi(punto: Punto): ByteArray {
        val byte = ByteArray(32)
        val y = punto.y.toByteArray()
        // toByteArray è big-endian e può avere lo zero del segno davanti.
        for (i in y.indices) {
            val posizione = y.size - 1 - i
            if (posizione < 32) byte[posizione] = y[i]
        }
        if (punto.x.testBit(0)) byte[31] = (byte[31].toInt() or 0x80).toByte()
        return byte
    }

    /**
     * Il punto scritto in 32 byte, o `null` se quei byte non sono un punto.
     *
     * ⛔ `null` è un esito vero e frequente: la maggior parte delle sequenze di
     * 32 byte NON sta sulla curva. Proseguire lo stesso significa fare conti su
     * un valore che non appartiene al gruppo, e nessuno se ne accorge.
     */
    fun leggi(byte: ByteArray): Punto? {
        if (byte.size != 32) return null
        val dispari = (byte[31].toInt() and 0x80) != 0
        val soloY = byte.copyOf()
        soloY[31] = (soloY[31].toInt() and 0x7F).toByte()
        // Da little-endian a BigInteger, che è big-endian.
        val y = BigInteger(1, ByteArray(32) { soloY[31 - it] })
        if (y >= P) return null
        val x = recuperaX(y, dispari) ?: return null
        return Punto(x, y)
    }

    /** Se un punto sta davvero sulla curva: `-x² + y² = 1 + d·x²·y²`. */
    fun sullaCurva(punto: Punto): Boolean {
        val xx = punto.x.multiply(punto.x).mod(P)
        val yy = punto.y.multiply(punto.y).mod(P)
        val sinistra = yy.subtract(xx).mod(P)
        val destra = BigInteger.ONE.add(D.multiply(xx).multiply(yy)).mod(P)
        return sinistra == destra
    }

    /**
     * Ricava `x` da `y`, scegliendo la parità richiesta.
     *
     * `x² = (y² - 1) / (d·y² + 1)`. La radice si prova con l'esponente
     * `(p+3)/8`; se non torna si moltiplica per `sqrt(-1)`; se non torna
     * nemmeno allora, quel `y` non appartiene a nessun punto.
     */
    fun recuperaX(y: BigInteger, dispari: Boolean): BigInteger? {
        val yy = y.multiply(y).mod(P)
        val sopra = yy.subtract(BigInteger.ONE).mod(P)
        val sotto = D.multiply(yy).add(BigInteger.ONE).mod(P)
        if (sotto.signum() == 0) return null
        val quadrato = sopra.multiply(sotto.modInverse(P)).mod(P)

        var x = quadrato.modPow(P.add(BigInteger.valueOf(3)).divide(BigInteger.valueOf(8)), P)
        if (x.multiply(x).subtract(quadrato).mod(P).signum() != 0) {
            x = x.multiply(I).mod(P)
        }
        if (x.multiply(x).subtract(quadrato).mod(P).signum() != 0) return null

        if (x.testBit(0) != dispari) x = P.subtract(x).mod(P)
        return x
    }
}
