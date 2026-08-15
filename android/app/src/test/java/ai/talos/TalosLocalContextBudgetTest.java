package ai.talos;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class TalosLocalContextBudgetTest {

    @Test
    public void qwenToolPromptReservesTheWholeRequestedReply() {
        assertEquals(6804, TalosLocalContextBudget.requiredTokens(5779, 1024));
        assertTrue(TalosLocalContextBudget.requiresLargerContext(5779, 1024, 4096));
        assertFalse(TalosLocalContextBudget.requiresLargerContext(5779, 1024, 8192));
    }

    @Test
    public void arithmeticSaturatesInsteadOfWrapping() {
        assertEquals(Integer.MAX_VALUE,
                TalosLocalContextBudget.requiredTokens(Integer.MAX_VALUE, Integer.MAX_VALUE));
    }
}
