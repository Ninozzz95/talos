package ai.talos.voice.pocket

import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test


class TalosPocketNpyTest {
    @Test
    fun `reads the exact little endian float32 BOS contract`() {
        val parsed = TalosPocketNpy.parseFloat32(
            npy("<f4", false, intArrayOf(1, 2, 2), floatArrayOf(-0.5f, 0f, 0.25f, 1f)),
        )

        assertArrayEquals(longArrayOf(1, 2, 2), parsed.shape)
        assertArrayEquals(floatArrayOf(-0.5f, 0f, 0.25f, 1f), parsed.values, 0f)
    }

    @Test
    fun `rejects dtype endian fortran shape and payload mutation`() {
        assertThrows(IllegalArgumentException::class.java) {
            TalosPocketNpy.parseFloat32(npy(">f4", false, intArrayOf(1), floatArrayOf(1f)))
        }
        assertThrows(IllegalArgumentException::class.java) {
            TalosPocketNpy.parseFloat32(npy("<f4", true, intArrayOf(1), floatArrayOf(1f)))
        }
        assertThrows(IllegalArgumentException::class.java) {
            TalosPocketNpy.parseFloat32(npy("<f4", false, intArrayOf(2), floatArrayOf(1f)))
        }
        val truncated = npy("<f4", false, intArrayOf(1), floatArrayOf(1f)).copyOfRange(0, 12)
        assertThrows(IllegalArgumentException::class.java) {
            TalosPocketNpy.parseFloat32(truncated)
        }
    }

    @Test
    fun `rejects non finite conditioning constants`() {
        val error = assertThrows(IllegalArgumentException::class.java) {
            TalosPocketNpy.parseFloat32(npy("<f4", false, intArrayOf(1), floatArrayOf(Float.NaN)))
        }
        assertEquals("Pocket NPY contains non-finite values", error.message)
    }

    private fun npy(descr: String, fortran: Boolean, shape: IntArray, values: FloatArray): ByteArray {
        val shapeLiteral = when (shape.size) {
            0 -> ""
            1 -> "${shape[0]},"
            else -> shape.joinToString(", ")
        }
        val prefix = "{'descr': '$descr', 'fortran_order': ${if (fortran) "True" else "False"}, 'shape': ($shapeLiteral), }"
        val preambleSize = 10
        val padding = (16 - (preambleSize + prefix.length + 1) % 16) % 16
        val header = (prefix + " ".repeat(padding) + "\n").toByteArray(Charsets.US_ASCII)
        val output = ByteArrayOutputStream()
        output.write(byteArrayOf(0x93.toByte(), 'N'.code.toByte(), 'U'.code.toByte(), 'M'.code.toByte(), 'P'.code.toByte(), 'Y'.code.toByte()))
        output.write(byteArrayOf(1, 0))
        output.write(byteArrayOf((header.size and 0xff).toByte(), ((header.size ushr 8) and 0xff).toByte()))
        output.write(header)
        val payload = ByteBuffer.allocate(values.size * Float.SIZE_BYTES).order(ByteOrder.LITTLE_ENDIAN)
        values.forEach(payload::putFloat)
        output.write(payload.array())
        return output.toByteArray()
    }
}
