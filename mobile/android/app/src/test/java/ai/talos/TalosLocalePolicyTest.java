package ai.talos;

import static org.junit.Assert.assertEquals;

import org.junit.Test;

public class TalosLocalePolicyTest {

    @Test
    public void acceptsOnlySystemEnglishAndItalianModes() {
        assertEquals("system", TalosLocalePolicy.requireMode("system"));
        assertEquals("en", TalosLocalePolicy.requireMode("en"));
        assertEquals("it", TalosLocalePolicy.requireMode("it"));
    }

    @Test(expected = IllegalArgumentException.class)
    public void rejectsUnsupportedLanguageModes() {
        TalosLocalePolicy.requireMode("fr");
    }

    @Test(expected = IllegalArgumentException.class)
    public void rejectsMissingLanguageModes() {
        TalosLocalePolicy.requireMode(null);
    }

    @Test
    public void mapsSystemToAnEmptyApplicationLocaleList() {
        assertEquals("", TalosLocalePolicy.applicationLanguageTag("system"));
        assertEquals("en", TalosLocalePolicy.applicationLanguageTag("en"));
        assertEquals("it", TalosLocalePolicy.applicationLanguageTag("it"));
    }
}
