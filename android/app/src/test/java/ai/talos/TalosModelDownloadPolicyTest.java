package ai.talos;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

/**
 * The Java half of one rule, proved against the SAME table as the TypeScript
 * half.
 *
 * The download loop runs natively because Android suspends a backgrounded
 * WebView. That forces a second implementation of the policy, and two
 * implementations of one rule diverge — it has happened three times in this
 * codebase, and the copy that diverges is never the one you are looking at.
 *
 * So neither owns the rules. `src/lib/models/downloadPolicy.cases.json` does,
 * and both suites execute it. If these two ever disagree, a test fails here or
 * in `downloadPolicy.test.ts` — rather than a user's 4 GB download failing at
 * 85% on mobile data and nobody knowing why.
 *
 * Runs on the JVM: no device, no emulator, part of the ordinary gate.
 */
public class TalosModelDownloadPolicyTest {

    /** Gradle runs unit tests with the module directory as the working directory. */
    private static final Path CASES =
            Paths.get("..", "..", "src", "lib", "models", "downloadPolicy.cases.json");

    private static JSONObject table() throws Exception {
        assertTrue(
                "the shared case table must exist at " + CASES.toAbsolutePath(),
                Files.exists(CASES));
        return new JSONObject(new String(Files.readAllBytes(CASES), StandardCharsets.UTF_8));
    }

    private static TalosModelDownloadPolicy.State stateOf(JSONObject json) throws Exception {
        TalosModelDownloadPolicy.State state = new TalosModelDownloadPolicy.State();
        state.totalBytes = json.getLong("totalBytes");
        state.haveBytes = json.getLong("haveBytes");
        state.url = json.isNull("url") ? null : json.getString("url");
        state.urlDeadlineMs = json.isNull("urlDeadlineMs")
                ? Long.MIN_VALUE
                : json.getLong("urlDeadlineMs");
        state.consecutiveFailures = json.getInt("consecutiveFailures");
        state.lastProgressAtMs = json.getLong("lastProgressAtMs");
        state.lastCheckpointAtMs = json.getLong("lastCheckpointAtMs");
        state.bytesSinceCheckpoint = json.getLong("bytesSinceCheckpoint");
        return state;
    }

    /** `give-up` here, GIVE_UP there: one spelling difference, stated once. */
    private static String nameOf(TalosModelDownloadPolicy.Kind kind) {
        return kind.name().toLowerCase().replace('_', '-');
    }

    /**
     * The numbers are part of the contract, not an implementation detail: a
     * checkpoint interval that differs between the two halves is a divergence
     * even when every case still passes.
     */
    @Test
    public void agreesWithTheTableAboutTheNumbersThemselves() throws Exception {
        JSONObject constants = table().getJSONObject("constants");

        assertEquals(constants.getLong("windowBytes"), TalosModelDownloadPolicy.WINDOW_BYTES);
        assertEquals(constants.getLong("checkpointMs"), TalosModelDownloadPolicy.CHECKPOINT_MS);
        assertEquals(constants.getLong("checkpointBytes"), TalosModelDownloadPolicy.CHECKPOINT_BYTES);
        assertEquals(constants.getLong("stallMs"), TalosModelDownloadPolicy.STALL_MS);
        assertEquals(constants.getLong("resolveMarginMs"), TalosModelDownloadPolicy.RESOLVE_MARGIN_MS);
        assertEquals(constants.getInt("maxFailures"), TalosModelDownloadPolicy.MAX_FAILURES);
    }

    @Test
    public void decidesEveryStepTheTableDescribes() throws Exception {
        JSONArray steps = table().getJSONArray("steps");
        assertTrue("the table must actually contain cases", steps.length() > 0);

        for (int index = 0; index < steps.length(); index += 1) {
            JSONObject testCase = steps.getJSONObject(index);
            String name = testCase.getString("name");
            TalosModelDownloadPolicy.Step step = TalosModelDownloadPolicy.nextStep(
                    stateOf(testCase.getJSONObject("state")), testCase.getLong("nowMs"));
            JSONObject expected = testCase.getJSONObject("expect");

            assertEquals(name, expected.getString("kind"), nameOf(step.kind));
            if (expected.has("rangeFrom")) {
                assertEquals(name + " — from", expected.getLong("rangeFrom"), step.rangeFrom);
            }
            if (expected.has("rangeTo")) {
                assertEquals(name + " — to", expected.getLong("rangeTo"), step.rangeTo);
            }
        }
    }

    @Test
    public void foldsEveryOutcomeTheTableDescribes() throws Exception {
        JSONArray outcomes = table().getJSONArray("outcomes");
        assertTrue("the table must actually contain cases", outcomes.length() > 0);

        for (int index = 0; index < outcomes.length(); index += 1) {
            JSONObject testCase = outcomes.getJSONObject(index);
            String name = testCase.getString("name");
            TalosModelDownloadPolicy.State state = stateOf(testCase.getJSONObject("state"));
            JSONObject outcome = testCase.getJSONObject("outcome");
            long nowMs = testCase.getLong("nowMs");

            TalosModelDownloadPolicy.Step step;
            String kind = outcome.getString("kind");
            if ("bytes".equals(kind)) {
                step = TalosModelDownloadPolicy.applyBytes(state, outcome.getLong("count"), nowMs);
            } else if ("status".equals(kind)) {
                Long retry = outcome.has("retryAfterSeconds") && !outcome.isNull("retryAfterSeconds")
                        ? outcome.getLong("retryAfterSeconds")
                        : null;
                step = TalosModelDownloadPolicy.applyStatus(state, outcome.getInt("status"), retry);
            } else {
                step = TalosModelDownloadPolicy.applyError(state);
            }

            if (testCase.has("expectStep")) {
                JSONObject expected = testCase.getJSONObject("expectStep");
                assertEquals(name, expected.getString("kind"), nameOf(step.kind));
                if (expected.has("seconds")) {
                    assertEquals(name + " — seconds", expected.getLong("seconds"), step.seconds);
                }
                if (expected.has("reason")) {
                    assertEquals(name + " — reason", expected.getString("reason"), step.reason);
                }
            }

            if (testCase.has("expectState")) {
                JSONObject expected = testCase.getJSONObject("expectState");
                if (expected.has("haveBytes")) {
                    assertEquals(name + " — haveBytes", expected.getLong("haveBytes"), state.haveBytes);
                }
                if (expected.has("consecutiveFailures")) {
                    assertEquals(name + " — failures",
                            expected.getInt("consecutiveFailures"), state.consecutiveFailures);
                }
                if (expected.has("bytesSinceCheckpoint")) {
                    assertEquals(name + " — since checkpoint",
                            expected.getLong("bytesSinceCheckpoint"), state.bytesSinceCheckpoint);
                }
                if (expected.has("url") && expected.isNull("url")) {
                    assertNull(name + " — url", state.url);
                }
            }
        }
    }
}
