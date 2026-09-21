package ai.talos;

/** Exact arithmetic shared by the Java preflight and its JVM regression test. */
final class TalosLocalContextBudget {

    private TalosLocalContextBudget() {}

    /** Prompt, requested reply, and one final slot must all share the context. */
    static int requiredTokens(int promptTokens, int completionTokens) {
        long prompt = Math.max(0L, (long) promptTokens);
        long completion = Math.max(0L, (long) completionTokens);
        long required = prompt + completion + 1L;
        return required >= Integer.MAX_VALUE ? Integer.MAX_VALUE : (int) required;
    }

    static boolean requiresLargerContext(int promptTokens, int completionTokens, int contextTokens) {
        return contextTokens <= 0 || requiredTokens(promptTokens, completionTokens) > contextTokens;
    }
}
