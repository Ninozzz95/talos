package ai.talos.voice.pocket

import org.junit.Assert.assertFalse
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test


class TalosPocketOrtStateChainTest {
    @Test
    fun `state result remains open through the next synchronous run and closes immediately after`() {
        val initial = TrackedOwnedValue("initial")
        val firstOutput = TrackedValue("first")
        val secondOutput = TrackedValue("second")
        val firstResult = TrackedResult(firstOutput)
        val secondResult = TrackedResult(secondOutput)
        val session = ScriptedSession(
            listOf(
                { inputs ->
                    assertSame(initial, inputs.getValue("state_0"))
                    assertFalse(initial.closed)
                    firstResult
                },
                { inputs ->
                    assertSame(firstOutput, inputs.getValue("state_0"))
                    assertFalse(firstResult.closed)
                    secondResult
                },
            ),
        )
        val chain = TalosPocketOrtStateChain.initialized(listOf(stateSpec()), Factory(initial))

        chain.advance(session)
        assertTrue(initial.closed)
        assertFalse(firstResult.closed)

        chain.advance(session)
        assertTrue(firstResult.closed)
        assertFalse(secondResult.closed)

        chain.close()
        assertTrue(secondResult.closed)
    }

    @Test
    fun `a child borrows the immutable voice state without closing its owner`() {
        val initial = TrackedOwnedValue("initial")
        val baseOutput = TrackedValue("base")
        val baseResult = TrackedResult(baseOutput)
        val base = TalosPocketOrtStateChain.initialized(listOf(stateSpec()), Factory(initial))
        base.advance(ScriptedSession(listOf({ baseResult })))

        val childOutput = TrackedValue("child")
        val childResult = TrackedResult(childOutput)
        val child = TalosPocketOrtStateChain.borrowing(listOf(stateSpec()), base.borrowedState())
        child.advance(
            ScriptedSession(
                listOf({ inputs ->
                    assertSame(baseOutput, inputs.getValue("state_0"))
                    assertFalse(baseResult.closed)
                    childResult
                }),
            ),
        )

        child.close()
        assertTrue(childResult.closed)
        assertFalse(baseResult.closed)
        base.close()
        assertTrue(baseResult.closed)
    }

    private fun stateSpec() = TalosPocketStateSpec(
        index = 0,
        inputName = "state_0",
        outputName = "out_state_0",
        dtype = TalosPocketDType.FLOAT32,
        shape = longArrayOf(1),
        fill = TalosPocketFill.ZEROS,
    )

    private open class TrackedValue(val id: String) : TalosPocketOrtValue

    private class TrackedOwnedValue(id: String) : TrackedValue(id), TalosPocketOwnedOrtValue {
        var closed = false
        override fun close() {
            check(!closed)
            closed = true
        }
    }

    private class TrackedResult(private val output: TrackedValue) : TalosPocketOrtResult {
        var closed = false
        override fun value(name: String): TalosPocketOrtValue {
            check(!closed)
            check(name == "out_state_0")
            return output
        }

        override fun floatValues(name: String): TalosPocketFloatTensor = error("not used")
        override fun close() {
            check(!closed)
            closed = true
        }
    }

    private class Factory(private val initial: TrackedOwnedValue) : TalosPocketOrtTensorFactory {
        override fun state(spec: TalosPocketStateSpec): TalosPocketOwnedOrtValue = initial
        override fun float32(shape: LongArray, values: FloatArray): TalosPocketOwnedOrtValue = error("not used")
        override fun int64(shape: LongArray, values: LongArray): TalosPocketOwnedOrtValue = error("not used")
    }

    private class ScriptedSession(
        steps: List<(Map<String, TalosPocketOrtValue>) -> TrackedResult>,
    ) : TalosPocketOrtSession {
        private val remaining = ArrayDeque(steps)
        override fun run(inputs: Map<String, TalosPocketOrtValue>): TalosPocketOrtResult = remaining.removeFirst()(inputs)
        override fun close() = Unit
    }
}
