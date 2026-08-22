package ai.talos;

import static org.junit.Assert.assertEquals;

import org.junit.Test;

public class TalosLlamaOpenFailureTest {

    @Test
    public void mapsEveryStableNativeOpenStage() {
        assertEquals(TalosLlamaEngine.FailureStage.PATH,
                TalosLlamaEngine.FailureStage.fromWire("path"));
        assertEquals(TalosLlamaEngine.FailureStage.MODEL_LOAD,
                TalosLlamaEngine.FailureStage.fromWire("model-load"));
        assertEquals(TalosLlamaEngine.FailureStage.CONTEXT,
                TalosLlamaEngine.FailureStage.fromWire("context"));
        assertEquals(TalosLlamaEngine.FailureStage.SAMPLER,
                TalosLlamaEngine.FailureStage.fromWire("sampler"));
        assertEquals(TalosLlamaEngine.FailureStage.TEMPLATE,
                TalosLlamaEngine.FailureStage.fromWire("template"));
        assertEquals(TalosLlamaEngine.FailureStage.GENERATION,
                TalosLlamaEngine.FailureStage.fromWire("generation"));
        assertEquals(TalosLlamaEngine.FailureStage.UNKNOWN,
                TalosLlamaEngine.FailureStage.fromWire("future-stage"));
        assertEquals(TalosLlamaEngine.FailureStage.UNKNOWN,
                TalosLlamaEngine.FailureStage.fromWire(null));
    }
}
