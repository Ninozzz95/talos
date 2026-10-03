/* Contratto dei controlli originali e delle preferenze di densità e lingua. ID e opzioni restano compatibili. */
/*
 * ⛔ 03/10/2026, corsia S2 della lingua (owner: «ogni singola parola nella app deve essere sia in inglese che in italiano»):
 *   le FRASI non stanno più qui. `titolo`, l'etichetta di ogni opzione (`opzione[1]`) e `unita` (quando è testo) sono
 *   getter sul dizionario (`impostazioni.field.<id>.*`, area `impostazioni`), letti nella lingua corrente: in italiano
 *   restituiscono la frase di prima, identica, e chi la cercava a schermo (le spec, la ricerca delle Impostazioni) la trova
 *   ancora. Gli id, le chiavi, i valori delle opzioni, i limiti e le unità che non sono testo (`%`, `ms`) restano dati.
 */
import { t } from './lingua.js';

const parteDellaChiave = (valore) => String(valore).replace(/[^A-Za-z0-9_]/gu, '_');

function conTesti(campi) {
  for (const campo of campi) {
    Object.defineProperty(campo, 'titolo', { enumerable: true, get: () => t(`impostazioni.field.${campo.id}.title`) });
    for (const opzione of campo.opzioni || []) {
      if (opzione.length > 1) continue;
      Object.defineProperty(opzione, 1, { enumerable: true, get: () => t(`impostazioni.field.${campo.id}.option.${parteDellaChiave(opzione[0])}`) });
    }
    if (UNITA_DA_TRADURRE.has(campo.id)) Object.defineProperty(campo, 'unita', { enumerable: true, get: () => t(`impostazioni.field.${campo.id}.unit`) });
  }
  return campi;
}

/** I campi la cui unità è una parola (non un simbolo come «%»): la loro `unita` viene dal dizionario. */
const UNITA_DA_TRADURRE = new Set(['motionStaggerRange']); // «ms»: uguale nelle due lingue, ma passa dal dizionario (strato 3)

export const CAMPI_IMPOSTAZIONI = conTesti([
  {
    "id": "themePresetSelect",
    "chiave": "themePreset",
    "tipo": "select",
    "sezione": "appearance",
    "gruppo": "design",
    "opzioni": [
      [
        "forge"
      ],
      [
        "paper"
      ],
      [
        "terminal"
      ],
      [
        "aurora"
      ],
      [
        "glacier"
      ],
      [
        "ember"
      ],
      [
        "atlas"
      ],
      [
        "noir"
      ],
      [
        "signal"
      ],
      [
        "violet"
      ],
      [
        "claudius"
      ],
      [
        "basicus"
      ],
      [
        "telemetry"
      ],
      [
        "calm"
      ]
    ]
  },
  {
    "id": "colorModeSelect",
    "chiave": "colorMode",
    "tipo": "select",
    "sezione": "appearance",
    "gruppo": "design",
    "opzioni": [
      [
        "system"
      ],
      [
        "dark"
      ],
      [
        "light"
      ]
    ]
  },
  {
    "id": "uiDensitySelect",
    "chiave": "uiDensity",
    "tipo": "select",
    "sezione": "appearance",
    "gruppo": "design",
    "opzioni": [
      [
        "comoda"
      ],
      [
        "compatta"
      ]
    ]
  },
  {
    "id": "uiLanguageSelect",
    "chiave": "uiLanguage",
    "tipo": "select",
    "sezione": "appearance",
    "gruppo": "design",
    "opzioni": [
      [
        "sistema"
      ],
      [
        "it"
      ],
      [
        "en"
      ]
    ]
  },
  {
    "id": "sceneOverrideSelect",
    "chiave": "sceneOverride",
    "tipo": "select",
    "sezione": "appearance",
    "gruppo": "design",
    "opzioni": [
      [
        "follow-theme"
      ],
      [
        "forge"
      ],
      [
        "paper"
      ],
      [
        "terminal"
      ],
      [
        "aurora"
      ],
      [
        "glacier"
      ],
      [
        "ember"
      ],
      [
        "atlas"
      ],
      [
        "noir"
      ],
      [
        "signal"
      ],
      [
        "violet"
      ],
      [
        "claudius"
      ],
      [
        "basicus"
      ],
      [
        "telemetry"
      ],
      [
        "calm"
      ]
    ]
  },
  {
    "id": "uiFontScaleSelect",
    "chiave": "uiFontScale",
    "tipo": "select",
    "sezione": "appearance",
    "gruppo": "design",
    "opzioni": [
      [
        "xsmall"
      ],
      [
        "small"
      ],
      [
        "default"
      ],
      [
        "large"
      ],
      [
        "xlarge"
      ]
    ]
  },
  {
    "id": "chatFontScaleSelect",
    "chiave": "chatFontScale",
    "tipo": "select",
    "sezione": "chat",
    "gruppo": "design",
    "opzioni": [
      [
        "xcompact"
      ],
      [
        "compact"
      ],
      [
        "balanced"
      ],
      [
        "expanded"
      ]
    ]
  },
  {
    "id": "composerPlusSelect",
    "chiave": "composerPlus",
    "tipo": "select",
    "sezione": "chat",
    "gruppo": "design",
    "opzioni": [
      [
        "drawer"
      ],
      [
        "menu"
      ]
    ]
  },
  {
    "id": "messageStyleSelect",
    "chiave": "messageStyle",
    "tipo": "select",
    "sezione": "chat",
    "gruppo": "design",
    "opzioni": [
      [
        "sections"
      ],
      [
        "bubbles"
      ]
    ]
  },
  {
    "id": "streamingAnimationSelect",
    "chiave": "streamingAnimation",
    "tipo": "select",
    "sezione": "chat",
    "gruppo": "design",
    "opzioni": [
      [
        "typewriter"
      ],
      [
        "fade"
      ]
    ]
  },
  {
    "id": "windowPresentationSelect",
    "chiave": "windowPresentation",
    "tipo": "select",
    "sezione": "appearance",
    "gruppo": "design",
    "opzioni": [
      [
        "drawer"
      ],
      [
        "fullscreen"
      ]
    ]
  },
  {
    "id": "backgroundMotionToggle",
    "chiave": "backgroundMotion",
    "tipo": "checkbox",
    "sezione": "appearance",
    "gruppo": "sfondo"
  },
  {
    "id": "interfaceMotionToggle",
    "chiave": "interfaceMotion",
    "tipo": "checkbox",
    "sezione": "appearance",
    "gruppo": "sfondo"
  },
  {
    "id": "pauseWhenHiddenToggle",
    "chiave": "pauseWhenHidden",
    "tipo": "checkbox",
    "sezione": "appearance",
    "gruppo": "sfondo"
  },
  {
    "id": "respectDataSaverToggle",
    "chiave": "respectDataSaver",
    "tipo": "checkbox",
    "sezione": "appearance",
    "gruppo": "sfondo"
  },
  {
    "id": "reducedMotionToggle",
    "chiave": "reducedMotion",
    "tipo": "checkbox",
    "sezione": "appearance",
    "gruppo": "sfondo"
  },
  {
    "id": "motionModeSelect",
    "chiave": "motionMode",
    "tipo": "select",
    "sezione": "appearance",
    "gruppo": "sfondo",
    "opzioni": [
      [
        "off"
      ],
      [
        "static"
      ],
      [
        "simple"
      ],
      [
        "complex"
      ],
      [
        "adaptive"
      ]
    ]
  },
  {
    "id": "motionQualitySelect",
    "chiave": "motionQuality",
    "tipo": "select",
    "sezione": "appearance",
    "gruppo": "sfondo",
    "opzioni": [
      [
        "low"
      ],
      [
        "balanced"
      ],
      [
        "high"
      ],
      [
        "adaptive"
      ]
    ]
  },
  {
    "id": "motionSpeedRange",
    "chiave": "motionSpeed",
    "tipo": "range",
    "sezione": "appearance",
    "gruppo": "sfondo",
    "min": 25,
    "max": 200,
    "unita": "%"
  },
  {
    "id": "motionIntensityRange",
    "chiave": "motionIntensity",
    "tipo": "range",
    "sezione": "appearance",
    "gruppo": "sfondo",
    "min": 0,
    "max": 100,
    "unita": "%"
  },
  {
    "id": "motionGlowRange",
    "chiave": "motionGlow",
    "tipo": "range",
    "sezione": "appearance",
    "gruppo": "sfondo",
    "min": 0,
    "max": 100,
    "unita": "%"
  },
  {
    "id": "motionDensityRange",
    "chiave": "motionDensity",
    "tipo": "range",
    "sezione": "appearance",
    "gruppo": "sfondo",
    "min": 25,
    "max": 150,
    "unita": "%"
  },
  {
    "id": "motionDepthRange",
    "chiave": "motionDepth",
    "tipo": "range",
    "sezione": "appearance",
    "gruppo": "sfondo",
    "min": 0,
    "max": 100,
    "unita": "%"
  },
  {
    "id": "motionTrailsRange",
    "chiave": "motionTrails",
    "tipo": "range",
    "sezione": "appearance",
    "gruppo": "sfondo",
    "min": 0,
    "max": 100,
    "unita": "%"
  },
  {
    "id": "motionContrastRange",
    "chiave": "motionContrast",
    "tipo": "range",
    "sezione": "appearance",
    "gruppo": "sfondo",
    "min": 0,
    "max": 100,
    "unita": "%"
  },
  {
    "id": "motionParallaxRange",
    "chiave": "motionParallax",
    "tipo": "range",
    "sezione": "appearance",
    "gruppo": "sfondo",
    "min": 0,
    "max": 100,
    "unita": "%"
  },
  {
    "id": "motionProfileSelect",
    "chiave": "motionProfile",
    "tipo": "select",
    "sezione": "appearance",
    "gruppo": "animazioni",
    "opzioni": [
      [
        "preset"
      ],
      [
        "minimal"
      ],
      [
        "expressive"
      ],
      [
        "custom"
      ],
      [
        "off"
      ]
    ]
  },
  {
    "id": "motionEasingSelect",
    "chiave": "motionEasing",
    "tipo": "select",
    "sezione": "appearance",
    "gruppo": "animazioni",
    "opzioni": [
      [
        "precise"
      ],
      [
        "soft"
      ],
      [
        "elastic-light"
      ],
      [
        "linear"
      ],
      [
        "cinematic"
      ]
    ]
  },
  {
    "id": "motionDurationRange",
    "chiave": "motionDuration",
    "tipo": "range",
    "sezione": "appearance",
    "gruppo": "animazioni",
    "min": 50,
    "max": 150,
    "unita": "%"
  },
  {
    "id": "motionUiIntensityRange",
    "chiave": "motionUiIntensity",
    "tipo": "range",
    "sezione": "appearance",
    "gruppo": "animazioni",
    "min": 0,
    "max": 100,
    "unita": "%"
  },
  {
    "id": "motionStaggerRange",
    "chiave": "motionStagger",
    "tipo": "range",
    "sezione": "appearance",
    "gruppo": "animazioni",
    "min": 0,
    "max": 120,
    "unita": "ms"
  },
  {
    "id": "motionWindowsToggle",
    "chiave": "motionWindows",
    "tipo": "checkbox",
    "sezione": "appearance",
    "gruppo": "animazioni"
  },
  {
    "id": "motionSurfacesToggle",
    "chiave": "motionSurfaces",
    "tipo": "checkbox",
    "sezione": "appearance",
    "gruppo": "animazioni"
  },
  {
    "id": "motionNavigationToggle",
    "chiave": "motionNavigation",
    "tipo": "checkbox",
    "sezione": "appearance",
    "gruppo": "animazioni"
  },
  {
    "id": "motionComposerToggle",
    "chiave": "motionComposer",
    "tipo": "checkbox",
    "sezione": "appearance",
    "gruppo": "animazioni"
  },
  {
    "id": "motionMessagesToggle",
    "chiave": "motionMessages",
    "tipo": "checkbox",
    "sezione": "appearance",
    "gruppo": "animazioni"
  },
  {
    "id": "motionFeedbackToggle",
    "chiave": "motionFeedback",
    "tipo": "checkbox",
    "sezione": "appearance",
    "gruppo": "animazioni"
  },
  {
    "id": "immersiveHeaderToggle",
    "chiave": "immersiveHeader",
    "tipo": "checkbox",
    "sezione": "appearance",
    "gruppo": "desktop"
  },
  {
    "id": "chatFullWidthToggle",
    "chiave": "chatFullWidth",
    "tipo": "checkbox",
    "sezione": "chat",
    "gruppo": "chat"
  },
  {
    "id": "askTimeoutSelect",
    "chiave": "askTimeout",
    "tipo": "select",
    "sezione": "chat",
    "gruppo": "domande",
    "opzioni": [
      [
        "none"
      ],
      [
        "60"
      ],
      [
        "300"
      ],
      [
        "600"
      ]
    ]
  }
]);
/*
 * ⛔ 23/09/2026 — NOVE, NON PIÙ DIECI. Decisione owner: «Provider e accessi» tolta del tutto
 *   («Toglierla del tutto»): i fornitori si gestiscono SOLO in «Laboratorio modelli» → scheda
 *   «Provider». Il vecchio id `providers` non è più una sezione: è un indirizzo ritirato che porta
 *   lì (`SEZIONI_RITIRATE`, `features/settings/schema.ts`).
 * D2 (06/09) — «Dieci sezioni in due gruppi: comportamento · infrastruttura».
 * ⛔ Questo elenco è l'UNICA fonte: `montaImpostazioni` ricostruisce da qui le
 * voci di navigazione, quindi aggiungere una sezione solo nel mockup non basta
 * (provato dal vivo il 06/09: il markup aveva le dieci voci giuste e il
 * componente le riscriveva con le vecchie otto).
 * ⛔ `privacy` tiene il suo id storico — la chiave salvata e i `data-settings-go`
 * puntano lì — ma a schermo è «Sicurezza e privacy», la sezione a sé di D13.
 */
export const SEZIONI_IMPOSTAZIONI = [
  { "id": "appearance", "gruppo": "comportamento" },
  { "id": "chat", "gruppo": "comportamento" },
  { "id": "tools", "gruppo": "comportamento" },
  { "id": "memoria", "gruppo": "comportamento" },
  { "id": "privacy", "gruppo": "comportamento" },
  { "id": "models", "gruppo": "infrastruttura" },
  { "id": "costi", "gruppo": "infrastruttura" },
  { "id": "workspace", "gruppo": "infrastruttura" },
  { "id": "account", "gruppo": "infrastruttura" }
].map((sezione) => Object.defineProperty(sezione, 'titolo', { enumerable: true, get: () => t(`impostazioni.sections.${sezione.id}.title`) }));
