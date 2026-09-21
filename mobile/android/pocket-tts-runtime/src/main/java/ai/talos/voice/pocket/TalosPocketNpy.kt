package ai.talos.voice.pocket

import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder


data class TalosPocketFloatTensor(
    val shape: LongArray,
    val values: FloatArray,
)

object TalosPocketNpy {
    private val magic = byteArrayOf(0x93.toByte(), 'N'.code.toByte(), 'U'.code.toByte(), 'M'.code.toByte(), 'P'.code.toByte(), 'Y'.code.toByte())
    private const val MAX_FILE_BYTES = 1024 * 1024

    fun readFloat32(file: File): TalosPocketFloatTensor {
        require(file.isFile) { "Pocket NPY is missing: ${file.absolutePath}" }
        require(file.length() in 1..MAX_FILE_BYTES.toLong()) { "Pocket NPY size is invalid" }
        return parseFloat32(file.readBytes())
    }

    fun parseFloat32(bytes: ByteArray): TalosPocketFloatTensor {
        require(bytes.size in 11..MAX_FILE_BYTES) { "Pocket NPY size is invalid" }
        require(bytes.copyOfRange(0, magic.size).contentEquals(magic)) { "Pocket NPY magic is invalid" }
        require(bytes[6].toInt() == 1 && bytes[7].toInt() == 0) { "Pocket NPY version must be 1.0" }
        val headerLength = (bytes[8].toInt() and 0xff) or ((bytes[9].toInt() and 0xff) shl 8)
        val payloadOffset = 10 + headerLength
        require(headerLength > 0 && payloadOffset <= bytes.size) { "Pocket NPY header length is invalid" }
        val header = bytes.copyOfRange(10, payloadOffset).toString(Charsets.US_ASCII)
        require(header.endsWith('\n')) { "Pocket NPY header is not newline terminated" }
        require((payloadOffset and 0x0f) == 0) { "Pocket NPY header alignment is invalid" }

        val descr = singleField(header, Regex("['\"]descr['\"]\\s*:\\s*['\"]([^'\"]+)['\"]"), "descr")
        require(descr == "<f4") { "Pocket NPY dtype must be little-endian float32" }
        val fortran = singleField(header, Regex("['\"]fortran_order['\"]\\s*:\\s*(True|False)"), "fortran_order")
        require(fortran == "False") { "Pocket NPY must be C-contiguous" }
        val shapeSource = singleField(header, Regex("['\"]shape['\"]\\s*:\\s*\\(([^)]*)\\)"), "shape")
        val dimensions = shapeSource.split(',')
            .map(String::trim)
            .filter(String::isNotEmpty)
            .map { dimension ->
                require(dimension.all(Char::isDigit)) { "Pocket NPY shape contains a non-decimal dimension" }
                dimension.toLong()
            }
            .toLongArray()
        require(dimensions.isNotEmpty()) { "Pocket NPY shape must not be scalar" }
        val count = elementCount(dimensions)
        require(bytes.size - payloadOffset == count * Float.SIZE_BYTES) { "Pocket NPY payload length does not match shape" }
        val payload = ByteBuffer.wrap(bytes, payloadOffset, count * Float.SIZE_BYTES).order(ByteOrder.LITTLE_ENDIAN)
        val values = FloatArray(count) { payload.float }
        require(values.all(Float::isFinite)) { "Pocket NPY contains non-finite values" }
        return TalosPocketFloatTensor(dimensions, values)
    }

    private fun singleField(header: String, expression: Regex, name: String): String {
        val matches = expression.findAll(header).toList()
        require(matches.size == 1) { "Pocket NPY header must contain one $name field" }
        return matches.single().groupValues[1]
    }
}
