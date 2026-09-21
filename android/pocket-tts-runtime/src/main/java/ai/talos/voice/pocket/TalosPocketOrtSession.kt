package ai.talos.voice.pocket

import ai.onnxruntime.OnnxJavaType
import ai.onnxruntime.OnnxTensor
import ai.onnxruntime.OrtEnvironment
import ai.onnxruntime.OrtSession
import ai.onnxruntime.TensorInfo
import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder


internal interface TalosPocketOrtValue

internal interface TalosPocketOwnedOrtValue : TalosPocketOrtValue, AutoCloseable

internal interface TalosPocketOrtResult : AutoCloseable {
    fun value(name: String): TalosPocketOrtValue
    fun floatValues(name: String): TalosPocketFloatTensor
}

internal data class TalosPocketTensorContract(
    val dtype: TalosPocketDType,
    val shape: LongArray,
)

internal interface TalosPocketOrtSession : AutoCloseable {
    val inputContracts: Map<String, TalosPocketTensorContract> get() = emptyMap()
    val outputContracts: Map<String, TalosPocketTensorContract> get() = emptyMap()
    fun run(inputs: Map<String, TalosPocketOrtValue>): TalosPocketOrtResult
}

internal interface TalosPocketOrtTensorFactory {
    fun state(spec: TalosPocketStateSpec): TalosPocketOwnedOrtValue
    fun float32(shape: LongArray, values: FloatArray): TalosPocketOwnedOrtValue
    fun int64(shape: LongArray, values: LongArray): TalosPocketOwnedOrtValue
}

internal interface TalosPocketOrtGraphs : AutoCloseable {
    val tensors: TalosPocketOrtTensorFactory
    val mimiEncoder: TalosPocketOrtSession
    val textConditioner: TalosPocketOrtSession
    val flowMain: TalosPocketOrtSession
    val flow: TalosPocketOrtSession
    val mimiDecoder: TalosPocketOrtSession
}

internal class TalosPocketOrtStateChain private constructor(
    private val specs: List<TalosPocketStateSpec>,
    initialState: Map<String, TalosPocketOrtValue>,
    initialOwner: AutoCloseable?,
) : AutoCloseable {
    private var state = LinkedHashMap(initialState)
    private var owner = initialOwner
    private var closed = false

    fun advance(
        session: TalosPocketOrtSession,
        transientInputs: Map<String, TalosPocketOrtValue> = emptyMap(),
        onRunDuration: (Long) -> Unit = {},
    ) {
        advance(session, transientInputs, onRunDuration) { Unit }
    }

    fun <T> advance(
        session: TalosPocketOrtSession,
        transientInputs: Map<String, TalosPocketOrtValue> = emptyMap(),
        onRunDuration: (Long) -> Unit = {},
        inspect: (TalosPocketOrtResult) -> T,
    ): T {
        check(!closed) { "Pocket state chain is closed" }
        require(transientInputs.keys.none(state::containsKey)) { "transient input shadows Pocket state" }
        val feeds = LinkedHashMap<String, TalosPocketOrtValue>(transientInputs.size + state.size)
        feeds.putAll(transientInputs)
        feeds.putAll(state)
        val startedAtNs = System.nanoTime()
        val result = session.run(feeds)
        onRunDuration(System.nanoTime() - startedAtNs)
        val nextState: LinkedHashMap<String, TalosPocketOrtValue>
        val inspected: T
        try {
            nextState = LinkedHashMap(specs.size)
            specs.forEach { spec -> nextState[spec.inputName] = result.value(spec.outputName) }
            inspected = inspect(result)
        } catch (error: Throwable) {
            result.close()
            throw error
        }
        val previousOwner = owner
        state = nextState
        owner = result
        previousOwner?.close()
        return inspected
    }

    fun borrowedState(): Map<String, TalosPocketOrtValue> {
        check(!closed) { "Pocket state chain is closed" }
        return state.toMap()
    }

    override fun close() {
        if (closed) return
        closed = true
        owner?.close()
        owner = null
        state.clear()
    }

    companion object {
        fun initialized(
            specs: List<TalosPocketStateSpec>,
            factory: TalosPocketOrtTensorFactory,
        ): TalosPocketOrtStateChain {
            val owned = ArrayList<TalosPocketOwnedOrtValue>(specs.size)
            try {
                val state = LinkedHashMap<String, TalosPocketOrtValue>(specs.size)
                specs.forEach { spec ->
                    val value = factory.state(spec)
                    owned += value
                    state[spec.inputName] = value
                }
                return TalosPocketOrtStateChain(specs, state, CloseGroup(owned))
            } catch (error: Throwable) {
                owned.asReversed().forEach { runCatching(it::close) }
                throw error
            }
        }

        fun borrowing(
            specs: List<TalosPocketStateSpec>,
            borrowedState: Map<String, TalosPocketOrtValue>,
        ): TalosPocketOrtStateChain {
            require(borrowedState.keys == specs.mapTo(linkedSetOf(), TalosPocketStateSpec::inputName)) {
                "borrowed Pocket state does not match the manifest"
            }
            return TalosPocketOrtStateChain(specs, borrowedState, null)
        }
    }

    private class CloseGroup(private val values: List<AutoCloseable>) : AutoCloseable {
        override fun close() {
            var failure: Throwable? = null
            values.asReversed().forEach { value ->
                try {
                    value.close()
                } catch (error: Throwable) {
                    if (failure == null) failure = error else failure.addSuppressed(error)
                }
            }
            failure?.let { throw it }
        }
    }
}

private open class JavaOrtValue(val tensor: OnnxTensor) : TalosPocketOrtValue

private class JavaOwnedOrtValue(tensor: OnnxTensor) : JavaOrtValue(tensor), TalosPocketOwnedOrtValue {
    override fun close() = tensor.close()
}

private class JavaOrtResult(private val result: OrtSession.Result) : TalosPocketOrtResult {
    override fun value(name: String): TalosPocketOrtValue {
        val tensor = result.get(name).orElseThrow { IllegalArgumentException("Pocket graph output is missing: $name") }
        require(tensor is OnnxTensor) { "Pocket graph output is not a tensor: $name" }
        return JavaOrtValue(tensor)
    }

    override fun floatValues(name: String): TalosPocketFloatTensor {
        val value = value(name) as JavaOrtValue
        val info = value.tensor.info
        require(info.type == OnnxJavaType.FLOAT) { "Pocket graph output $name is not float32" }
        val source = value.tensor.floatBuffer
        val values = FloatArray(source.remaining())
        source.get(values)
        return TalosPocketFloatTensor(info.shape.copyOf(), values)
    }

    override fun close() = result.close()
}

private class JavaOrtSession(private val session: OrtSession) : TalosPocketOrtSession {
    override val inputContracts = session.inputInfo.mapValues { (_, node) -> tensorContract(node.info) }
    override val outputContracts = session.outputInfo.mapValues { (_, node) -> tensorContract(node.info) }

    override fun run(inputs: Map<String, TalosPocketOrtValue>): TalosPocketOrtResult {
        val tensors = inputs.mapValues { (name, value) ->
            require(value is JavaOrtValue) { "Pocket input $name was not created by the ORT tensor factory" }
            value.tensor
        }
        return JavaOrtResult(session.run(tensors))
    }

    override fun close() = session.close()

    private fun tensorContract(info: Any): TalosPocketTensorContract {
        require(info is TensorInfo) { "Pocket graph contains a non-tensor contract" }
        return TalosPocketTensorContract(info.type.toPocketDType(), info.shape.copyOf())
    }
}

private class JavaOrtTensorFactory(private val environment: OrtEnvironment) : TalosPocketOrtTensorFactory {
    override fun state(spec: TalosPocketStateSpec): TalosPocketOwnedOrtValue {
        val count = elementCount(spec.shape)
        val tensor = when (spec.dtype) {
            TalosPocketDType.FLOAT32 -> {
                val buffer = directBytes(Math.multiplyExact(count, Float.SIZE_BYTES)).asFloatBuffer()
                val fill = when (spec.fill) {
                    TalosPocketFill.NAN -> Float.NaN
                    TalosPocketFill.ONES -> 1f
                    else -> 0f
                }
                repeat(count) { buffer.put(fill) }
                buffer.flip()
                OnnxTensor.createTensor(environment, buffer, spec.shape)
            }
            TalosPocketDType.FLOAT16 -> {
                val buffer = directBytes(Math.multiplyExact(count, Short.SIZE_BYTES)).asShortBuffer()
                val fill = when (spec.fill) {
                    TalosPocketFill.NAN -> 0x7e00.toShort()
                    TalosPocketFill.ONES -> 0x3c00.toShort()
                    else -> 0
                }
                repeat(count) { buffer.put(fill) }
                buffer.flip()
                OnnxTensor.createTensor(environment, buffer, spec.shape, OnnxJavaType.FLOAT16)
            }
            TalosPocketDType.INT64 -> {
                val buffer = directBytes(Math.multiplyExact(count, Long.SIZE_BYTES)).asLongBuffer()
                repeat(count) { buffer.put(if (spec.fill == TalosPocketFill.ONES) 1L else 0L) }
                buffer.flip()
                OnnxTensor.createTensor(environment, buffer, spec.shape)
            }
            TalosPocketDType.BOOL -> {
                val buffer = directBytes(count)
                repeat(count) { buffer.put(if (spec.fill == TalosPocketFill.ONES) 1 else 0) }
                buffer.flip()
                OnnxTensor.createTensor(environment, buffer, spec.shape, OnnxJavaType.BOOL)
            }
        }
        return JavaOwnedOrtValue(tensor)
    }

    override fun float32(shape: LongArray, values: FloatArray): TalosPocketOwnedOrtValue {
        require(elementCount(shape) == values.size) { "float32 values do not match shape" }
        val buffer = directBytes(Math.multiplyExact(values.size, Float.SIZE_BYTES)).asFloatBuffer()
        buffer.put(values).flip()
        return JavaOwnedOrtValue(OnnxTensor.createTensor(environment, buffer, shape))
    }

    override fun int64(shape: LongArray, values: LongArray): TalosPocketOwnedOrtValue {
        require(elementCount(shape) == values.size) { "int64 values do not match shape" }
        val buffer = directBytes(Math.multiplyExact(values.size, Long.SIZE_BYTES)).asLongBuffer()
        buffer.put(values).flip()
        return JavaOwnedOrtValue(OnnxTensor.createTensor(environment, buffer, shape))
    }

    private fun directBytes(size: Int): ByteBuffer = ByteBuffer.allocateDirect(size).order(ByteOrder.nativeOrder())
}

internal class TalosPocketJavaOrtGraphs private constructor(
    override val tensors: TalosPocketOrtTensorFactory,
    override val mimiEncoder: TalosPocketOrtSession,
    override val textConditioner: TalosPocketOrtSession,
    override val flowMain: TalosPocketOrtSession,
    override val flow: TalosPocketOrtSession,
    override val mimiDecoder: TalosPocketOrtSession,
    private val options: OrtSession.SessionOptions,
) : TalosPocketOrtGraphs {
    override fun close() {
        var failure: Throwable? = null
        listOf(mimiDecoder, flow, flowMain, textConditioner, mimiEncoder, options).forEach { value ->
            try {
                value.close()
            } catch (error: Throwable) {
                if (failure == null) failure = error else failure.addSuppressed(error)
            }
        }
        failure?.let { throw it }
    }

    companion object {
        fun open(root: File, cpuThreads: Int): TalosPocketJavaOrtGraphs {
            require(cpuThreads in 1..32) { "Pocket cpuThreads must be in [1, 32]" }
            val canonicalRoot = root.canonicalFile
            require(canonicalRoot.isDirectory) { "Pocket bundle root is missing: ${canonicalRoot.absolutePath}" }
            val environment = OrtEnvironment.getEnvironment("talos-pocket")
            val options = OrtSession.SessionOptions().apply {
                setOptimizationLevel(OrtSession.SessionOptions.OptLevel.ALL_OPT)
                setIntraOpNumThreads(cpuThreads)
                setInterOpNumThreads(1)
            }
            val sessions = ArrayList<TalosPocketOrtSession>(5)
            try {
                fun open(name: String): TalosPocketOrtSession {
                    val model = File(canonicalRoot, name).canonicalFile
                    require(model.parentFile == canonicalRoot && model.isFile) { "Pocket graph is missing or escapes root: $name" }
                    return JavaOrtSession(environment.createSession(model.absolutePath, options)).also(sessions::add)
                }
                val factory = JavaOrtTensorFactory(environment)
                return TalosPocketJavaOrtGraphs(
                    tensors = factory,
                    mimiEncoder = open("mimi_encoder.onnx"),
                    textConditioner = open("text_conditioner.onnx"),
                    flowMain = open("flow_lm_main_int8.onnx"),
                    flow = open("flow_lm_flow_int8.onnx"),
                    mimiDecoder = open("mimi_decoder_int8.onnx"),
                    options = options,
                )
            } catch (error: Throwable) {
                sessions.asReversed().forEach { runCatching(it::close) }
                runCatching(options::close)
                throw error
            }
        }
    }
}

private fun OnnxJavaType.toPocketDType(): TalosPocketDType = when (this) {
    OnnxJavaType.FLOAT -> TalosPocketDType.FLOAT32
    OnnxJavaType.FLOAT16 -> TalosPocketDType.FLOAT16
    OnnxJavaType.INT64 -> TalosPocketDType.INT64
    OnnxJavaType.BOOL -> TalosPocketDType.BOOL
    else -> throw IllegalArgumentException("unsupported Pocket ORT dtype: $this")
}
