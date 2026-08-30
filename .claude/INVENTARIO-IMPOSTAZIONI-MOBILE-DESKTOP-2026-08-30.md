# Inventario completo impostazioni mobile → desktop

Data: 2026-08-30  
Perimetro: `AVM-harness-desktop` soltanto. `mobile/` è stato letto come
riferimento; in questa fase non è stato modificato alcun codice prodotto.

## Esito in una frase

La Fase 7 precedente era incompleta: aveva portato soltanto scala tipografica,
scala del testo chat e riduzione del movimento. Il desktop deve ancora ricevere
l’intera superficie **Aspetto** e l’intero **Laboratorio modelli**, tradotti in
linguaggio desktop e collegati a comportamenti reali. Finché il runtime LLM
locale non è scelto, le parti che richiedono inferenza o accesso hardware devono
restare dichiaratamente preparatorie/gated.

## Fonti locali ispezionate

- `mobile/src/components/talos/settings/TalosMobileSettingsAppearancePanel.vue`
- `mobile/src/stores/settings.ts`
- `mobile/src/stores/theme.ts`
- `mobile/src/lib/talosThemes.ts`
- `mobile/src/lib/talosThemeOptions.ts`
- `mobile/src/lib/talosFontScale.ts`
- `mobile/src/lib/talosChatLayout.ts`
- `mobile/src/motion-v6/contracts.ts`
- `mobile/src/motion-v6/defaults.ts`
- `mobile/src/components/talos/models/TalosMobileModelLabHub.vue`
- `mobile/src/components/talos/models/TalosMobileProviderRuntimePanel.vue`
- `mobile/src/components/talos/models/TalosMobileModelCatalog.vue`
- `mobile/src/components/talos/models/TalosMobileLocalModels.vue`
- `mobile/src/components/talos/models/TalosMobileLocalRepoDetail.vue`
- `mobile/src/components/talos/models/TalosMobileCatalogProfileRow.vue`
- `mobile/src/components/talos/models/TalosMobileModelAdvancedOptions.vue`
- `mobile/src/components/talos/models/TalosMobileDeviceCapacityCard.vue`
- `mobile/src/components/talos/models/TalosMobileHuggingFaceAccessCard.vue`
- `mobile/src/lib/modelLabContracts.ts`
- `mobile/src/stores/localModels.ts`
- `mobile/src/services/localEngine.ts`
- `mobile/src/i18n/locales/it.ts` e `mobile/src/i18n/locales/en.ts`
- desktop: `mobile/public/harness-ui/index.html`, `app.js`, `styles.css`,
  `harness-ui/src/config.mjs`, `harness-ui/src/model-catalog.mjs`,
  `harness-ui/src/http-app.mjs`

## A. Inventario completo di «Aspetto» mobile

### A1 — Design e presentazione

| # | Mobile (campo/controllo reale) | Traduzione desktop proposta | Stato desktop oggi | Portabilità e dipendenza |
|---|---|---|---|---|
| A01 | `themePreset`: 14 preset (`forge`, `paper`, `terminal`, `aurora`, `glacier`, `ember`, `atlas`, `noir`, `signal`, `violet`, `claudius`, `basicus`, `telemetry`, `calm`) | **Tema TALOS** con nome, anteprima e descrizione; applica i token globali | Mancante: la card mostra solo una swatch statica “Tema TALOS” | Portabile subito se il desktop adotta lo stesso token engine; nessun esadecimale duplicato |
| A02 | `colorMode`: `system`, `dark`, `light` | **Modalità colore** | Mancante | Portabile via `prefers-color-scheme` + override locale |
| A03 | `scene_override`: 14 scene indipendenti dal tema | **Sfondo animato / scena**; “Segui il tema” oppure scena scelta | Mancante | Portabile soltanto se il renderer desktop riceve gli stessi token/scena; altrimenti UI gated |
| A04 | `ui_font_scale`: `xsmall`, `small`, `default`, `large`, `xlarge` | **Dimensione interfaccia** | Presente dalla Fase 7a | Portabile e già applicato con CSS custom property |
| A05 | `chat_layout.bubble_scale`: `xcompact`, `compact`, `balanced`, `expanded` | **Dimensione testo chat** | Presente dalla Fase 7a | Separata dalla UI, come mobile |
| A06 | `shell.composer_shape`: `classic`, `standard`, `compact` | **Forma del composer** | Solo comportamento statico del composer; nessun selettore | Portabile se il composer desktop usa gli stessi componenti |
| A07 | `shell.composer_plus`: `drawer`, `menu` | **Apertura del pulsante +** (cassetto/menu ancorato) | Mancante | Portabile; deve riusare il composer reale, non una copia |
| A08 | `chat_layout.message_style`: `sections`, `bubbles` | **Stile dei messaggi** | Mancante | Portabile nel renderer chat desktop |
| A09 | `shell.streaming_animation`: `typewriter`, `fade` | **Animazione risposta in streaming** | Mancante | Portabile nel renderer; non deve mostrare thinking/tool-call grezzi |
| A10 | `chat_layout.mobile_window_presentation`: `drawer`, `fullscreen` | **Presentazione pannelli strumenti** (desktop: pannello laterale/modalità finestra) | Mancante e il nome mobile non è adatto | Adattare il lessico; il comportamento dipende dal layout desktop |
| A11 | `shell.immersive_header` | **Intestazione immersiva** | Mancante | Portabile come chrome desktop, rispettando scroll e token |
| A12 | `shell.launcher_icon_follows_theme` | **Icona applicazione segue il tema** | Non applicabile al bundle web statico | Escludere dal pannello desktop oppure sostituire con “icona app/installer”; non mostrare un interruttore inerte |

### A2 — Movimento dello sfondo e motore Motion V6

| # | Mobile (campo/controllo reale) | Traduzione desktop proposta | Stato desktop oggi | Nota |
|---|---|---|---|---|
| A13 | `motion_v6.mode`: `off`, `static`, `simple`, `complex`, `adaptive` | **Renderer sfondo animato** | Mancante | Deve essere un renderer desktop reale o “non disponibile” |
| A14 | `motion_v6.quality`: `low`, `balanced`, `high`, `adaptive` | **Qualità animazione** | Mancante | Adattare a GPU/browser desktop |
| A15 | `background_enabled` | **Sfondo animato attivo** | Mancante | Switch reale, collegato alla scena |
| A16 | `interface_enabled` | **Animazioni interfaccia attive** | Parzialmente coperto dal toggle “Riduci movimento” | Distinguere attivazione generale da override ridotto |
| A17 | `speed` 25–200, default 100 | **Velocità sfondo** | Mancante | Range tokenizzato |
| A18 | `intensity` 0–100, default 20 | **Intensità sfondo** | Mancante | Non confondere con intensità UI |
| A19 | `glow_intensity` 0–100, default 10 | **Intensità bagliore** | Mancante | Effetto solo se renderer lo supporta |
| A20 | `density` 25–150, default 100 | **Densità scena** | Mancante | Desktop può usare cap differente ma deve dichiararlo |
| A21 | `depth` 0–100, default 92 | **Profondità scena** | Mancante | Collegata a layering/parallax |
| A22 | `trails` 0–100, default 50 | **Persistenza scie** | Mancante | Da disattivare con reduced motion |
| A23 | `contrast` 0–100, default 80 | **Contrasto scena** | Mancante | Deve passare dal contrast checker dei token |
| A24 | `parallax` 0–100, default 20 | **Parallasse** | Mancante | Desktop usa pointer/scroll; fallback statico |
| A25 | `fps_cap`: 20/24/30/45/60 | **Limite fotogrammi** | Non esposto nemmeno nel pannello mobile attuale | Campo di contratto: decidere se esporlo in “Prestazioni avanzate” |
| A26 | `dpr_cap`: 1/1.25/1.5/2 | **Limite risoluzione renderer** | Non esposto nel pannello mobile attuale | Va portato solo se il renderer desktop lo usa davvero |
| A27 | `pause_when_hidden` | **Sospendi quando la finestra non è visibile** | Mancante | Portabile con Page Visibility API |
| A28 | `respect_data_saver` | **Rispetta risparmio dati/energia** | Mancante | Desktop: Save-Data + policy energia; fallback esplicito |
| A29 | reset Motion V6 | **Ripristina movimento** | Mancante | Deve ripristinare i default V6, non solo CSS |

### A3 — Animazioni dell’interfaccia

| # | Mobile (campo/controllo reale) | Traduzione desktop proposta | Stato desktop oggi | Nota |
|---|---|---|---|---|
| A30 | `interface.profile`: `preset`, `minimal`, `expressive`, `custom`, `off` | **Profilo animazioni UI** | Mancante | `minimal` deve rispettare reduced motion |
| A31 | `interface.easing`: `precise`, `soft`, `elastic-light`, `linear`, `cinematic` | **Curva animazioni** | Mancante | Una sola sorgente token |
| A32 | `interface.duration_scale` 50–150, default 50 | **Durata transizioni** | Mancante | Scala percentuale |
| A33 | `interface.intensity` 0–100, default 65 | **Intensità movimento UI** | Mancante | Separata da sfondo |
| A34 | `interface.stagger` 0–120, default 40 | **Ritardo progressivo** | Mancante | Limitato per evitare UI lenta |
| A35 | categorie `windows`, `surfaces`, `navigation`, `composer`, `messages`, `feedback` | **Categorie animate** | Mancante | Sei switch; nessuna categoria inventata |

### A4 — Nota sui contratti tema più ampi

`talosThemes.ts` contiene inoltre contratti per font, densità, raggio, effetti,
token per area (`sidebar`, `chat`, `composer`, `window`, `header`, `button`,
`card`, `code`) e personalizzazioni colore. Questi contratti sono oggi definiti
ma non sono controlli visibili nel pannello mobile. Per il desktop non vanno
inventati come “impostazioni mobile”: vanno trattati come estensione del theme
engine, dopo aver deciso se TALOS vuole un editor tema o soltanto preset.

## B. Inventario completo di «Laboratorio modelli» mobile

### B1 — Hub e capacità macchina

| # | Mobile (controllo/dato) | Traduzione desktop proposta | Stato desktop oggi | Dipendenza |
|---|---|---|---|---|
| M01 | Hub con destinazioni Provider, Catalogo, Modelli locali | **Laboratorio modelli** con tre aree master/detail | Mancante; esiste solo il model picker della chat | UI portabile subito |
| M02 | Misura dispositivo: RAM usabile, spazio allocabile, riserva 1 GB, refresh | **Capacità di questa macchina** | Mancante | API desktop reale (`os`, filesystem); non inventare numeri |
| M03 | Stato motore locale e backend disponibili | **Runtime locale** | Mancante | Gated fino alla scelta del runtime |
| M04 | Stato “modello selezionato condiviso” | **Modello attivo condiviso con Chat** | Desktop ha selezione per sessione, non contratto condiviso | Richiede contratto desktop unico |

### B2 — Provider e accessi

Provider configurabili: `openai`, `deepseek`, `anthropic`, `gemini`,
`openrouter`, `ollama`; il provider `local` è presente nel contratto ma non è
una riga di credenziali.

| # | Mobile | Traduzione desktop proposta | Stato desktop oggi |
|---|---|---|---|
| M05 | Card espandibile per provider | **Provider e accessi** con card espandibili | Solo catalogo OpenRouter nel server |
| M06 | OAuth OpenRouter | **Accedi con OpenRouter** | Il server usa API key/env; nessun OAuth UI |
| M07 | API key per provider, salva/rimuovi | **Chiave API** | Desktop legge configurazione server; nessun form |
| M08 | Endpoint custom (OpenAI/DeepSeek/OpenRouter/Ollama) | **Endpoint personalizzato** | Mancante |
| M09 | Timeout 5–300 s, slider + numero | **Timeout provider** | Mancante |
| M10 | Salva runtime / aggiorna catalogo / reset endpoint | **Salva e aggiorna** | Mancante |
| M11 | Errori configurazione, catalogo, rete, provider | **Stato accesso e catalogo** | Parzialmente presente per OpenRouter, non per provider multipli |
| M12 | Token Hugging Face in secure store, presenza soltanto | **Accesso Hugging Face** | Mancante | Desktop secret store/env; mai localStorage |

### B3 — Catalogo provider

| # | Mobile | Traduzione desktop proposta | Stato desktop oggi |
|---|---|---|---|
| M13 | Ricerca catalogo | **Cerca modelli** | Picker sessione ha ricerca minima; non Model Lab |
| M14 | Filtro provider/publisher | **Filtra per provider** | Raggruppamento OpenRouter presente, filtro dedicato mancante |
| M15 | Conteggio risultati e paginazione “Carica altro” | **Risultati e carica altro** | Endpoint server catalogo senza paginazione UI |
| M16 | Profilo modello: provider, context length, modalità, input/output modalities | **Dettagli capacità osservate** | Picker mostra nome/id/prezzo, non capability complete |
| M17 | Stato probe: non testato/superato/fallito/non compatibile | **Verifica modello** | Mancante |
| M18 | Seleziona come default | **Usa come modello predefinito** | Selezione per sessione presente; default persistente mancante |
| M19 | Mostra/nascondi nel composer | **Visibile nel composer** | Mancante |
| M20 | Rinomina display name | **Nome visualizzato** | Mancante |
| M21 | Aggiunta manuale provider/model id/display name | **Aggiungi profilo manuale** | Mancante |
| M22 | Dichiarazione reasoning e image input per profilo manuale | **Capacità dichiarate** | Mancante |

### B4 — Modelli installati sul dispositivo

| # | Mobile | Traduzione desktop proposta | Stato desktop oggi |
|---|---|---|---|
| M23 | Tab “Questo dispositivo” | **Installati** | Mancante |
| M24 | Ricerca modelli installati | **Cerca nei modelli installati** | Mancante |
| M25 | Ordinamento `recent`, `name`, `size` | **Ordina per** | Mancante |
| M26 | Filtro “Ci sta in memoria” | **Compatibili con questa macchina** | Mancante |
| M27 | Vista lista/griglia | **Vista elenco/griglia** | Mancante |
| M28 | Riga file: alias, nome GGUF, dimensione, data, cartella | **Modello installato** | Mancante |
| M29 | Importa `.gguf` dal dispositivo | **Importa modello locale** | Mancante |
| M30 | Progress import, errori spazio/formato/permessi | **Copia e verifica importazione** | Mancante |
| M31 | Rinomina alias, copia percorso, elimina con conferma dimensione | **Azioni modello** | Mancante |

### B5 — Catalogo Hugging Face e filtri

| # | Mobile | Traduzione desktop proposta | Stato desktop oggi |
|---|---|---|---|
| M32 | Tab Hugging Face | **Catalogo Hugging Face** | Mancante |
| M33 | Filtri compositi `fits`, `chat`, `code`, `q4`, `open-licence` | **Filtri rapidi** | Mancante |
| M34 | Provider/publisher e fascia peso (`fino-1`, `1-4`, `4-8`, `8-16`, `oltre-16`) | **Publisher / dimensione modello** | Mancante |
| M35 | Ordinamento `downloads`, `likes`, `lastModified`, `createdAt` | **Ordina catalogo** | Server ordina OpenRouter con criterio diverso |
| M36 | Ricerca paginata, loading, retry e fine lista | **Ricerca e paginazione** | Mancante |
| M37 | Badge raccomandato/non compatibile con motivo | **Compatibilità stimata** | Mancante |

### B6 — Dettaglio repository, quantizzazioni e file

| # | Mobile | Traduzione desktop proposta | Stato desktop oggi |
|---|---|---|---|
| M38 | Scheda repository: tag, parametri, GGUF, download/like, lingue | **Scheda modello** | Mancante |
| M39 | README/model card completo con immagini esterne consentite | **Model card** | Mancante |
| M40 | Link originale e copia link | **Apri su Hugging Face / copia link** | Mancante |
| M41 | Tab `Quantizzazioni`, `Scheda modello`, `File` | **Sezioni repository** | Mancante |
| M42 | Elenco file reali e set GGUF incompleti | **File e varianti** | Mancante |
| M43 | Rail variante e selezione quantizzazione | **Varianti** | Mancante |
| M44 | Esame header GGUF, parameter count, tensor histogram, versione | **Verifica header** | Mancante |
| M45 | Context slider e KV cache `auto`, `f16`, `q8_0`, `other` | **Contesto e KV cache** | Mancante; runtime non scelto |
| M46 | Resource ledger (weights/KV/compute/runtime/safety/total/margin) | **Ledger risorse** | Mancante |
| M47 | Fit badge: memoria, spazio, velocità, temperatura, bandwidth | **Compatibilità e prestazioni stimate** | Mancante |

### B7 — Download e coda

| # | Mobile | Traduzione desktop proposta | Stato desktop oggi |
|---|---|---|---|
| M48 | Download per variante con bytes, percentuale e velocità | **Scarica variante** | Mancante |
| M49 | Pausa/riprendi/annulla, checkpoint nativo | **Coda download** | Mancante |
| M50 | Verifica file e hash, rifiuto set incompleto | **Verifica integrità** | Mancante |
| M51 | Centro download globale e stati waiting/queued/running/paused/verifying/failed | **Centro download** | Mancante |
| M52 | Residui abbandonati e “libera spazio” | **Download incompleti** | Mancante |

### B8 — Contratto persistente Model Lab

`TalosMobileModelLabPreferences` contiene esattamente:

- `manual_models[]` con provider, model id, display name, input/output modalities,
  supported parameters;
- `model_overrides` con display name e `show_in_composer`;
- `provider_runtime[provider].timeout_seconds` (5–300);
- `probe_results[profile]` con esito, timestamp, latenza e messaggio.

Sul desktop il contratto deve restare provider-neutral e versionato. Segreti,
token e chiavi non devono entrare in `localStorage`; vanno in env/secret store.
Le preferenze di presentazione possono essere locali, mentre cataloghi, hash,
file, stato download e risultati probe devono avere una fonte reale.

## C. Stato della controparte desktop

| Area | Presente oggi | Mancante |
|---|---|---|
| Settings | card Aspetto minima, scala UI, scala chat, reduced motion, Agentico, Control plane | tema reale, mode, background animato, motion engine, composer, streaming, profili, privacy/permissions, Model Lab |
| Modelli chat | catalogo OpenRouter reale via `/api/v1/models`, picker per sessione | Model Lab, provider multipli, default persistente, capability/probe, locale GGUF |
| Runtime locale | nessun runtime locale desktop scelto | scelta/adapter/runtime, rilevamento hardware, download e caricamento GGUF |
| Persistenza | `talos.harness.desktop.settings.v1` per appearance/tree UI | schema completo e scope user/workspace dichiarato |
| Sicurezza | config server/env e policy agent desktop | secret store esplicito per credenziali UI, fail-closed per runtime locale |

## D. Confronto competitivo per la decisione desktop

| Decisione | Hermes | VS Code / Cursor / Claude Code | Decisione TALOS |
|---|---|---|---|
| Tema e aspetto | Hermes Desktop con preset, font terminale e temi importabili | VS Code separa User/Workspace e supporta temi Marketplace | partire da preset TALOS tokenizzati; aggiungere import temi solo dopo un contratto tema sicuro |
| Scope delle impostazioni | Hermes condivide config tra Desktop/CLI; VS Code distingue User e Workspace | Cursor separa regole progetto e utente | per ora scope dichiarato **Desktop locale**; aggiungere Workspace solo con API/contratto reale |
| Motion/accessibilità | Hermes espone streaming e display; non sostituisce la preferenza OS | CSS `prefers-reduced-motion` è il fallback standard | `reduced motion` resta override locale sopra media query; nessuna animazione non tokenizzata |
| Modelli/provider | Hermes mostra provider/modelli reali e avverte sugli auxiliary model | VS Code non è un model lab; Cursor/Claude mostrano provider e policy nel contesto agente | un catalogo unico con capability osservate separate dalle dichiarazioni; niente model picker scollegato |
| Modelli locali | Hermes usa backend condiviso e supporta desktop multipiattaforma | llama.cpp/ggml documenta backend CPU/Metal/CUDA/ROCm/SYCL/Vulkan | scegliere un runtime e adattarlo dietro un adapter TALOS; esporre il backend reale e il motivo dei limiti |
| Sicurezza | Hermes separa config/keys e approvazioni | VS Code Workspace Trust e Claude Code hanno gate allow/ask/deny | chiavi fuori dal browser; probe/download/runtime fail-closed e auditabili |

Fonti ufficiali aggiornate consultate:

- [Hermes Desktop](https://hermes-agent.nousresearch.com/docs/user-guide/desktop)
- [Hermes Configuration](https://hermes-agent.nousresearch.com/docs/user-guide/configuration)
- [VS Code User and Workspace settings](https://code.visualstudio.com/docs/configure/settings)
- [VS Code Themes](https://code.visualstudio.com/docs/configure/themes)
- [VS Code Workspace Trust](https://code.visualstudio.com/docs/editing/workspaces/workspace-trust)
- [Hugging Face Model Cards](https://huggingface.co/docs/hub/main/model-cards)
- [Hugging Face download guide](https://huggingface.co/docs/huggingface_hub/main/guides/download)
- [llama.cpp/ggml feature matrix](https://github.com/ggml-org/llama.cpp/wiki/Feature-matrix)
- [MDN prefers-reduced-motion](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/prefers-reduced-motion)

## E. Ledger per la fase di implementazione successiva

Questa fase non modifica prodotto. Il ledger seguente è il perimetro esatto da
riaprire dopo l’approvazione del contratto runtime.

### E1 — File da modificare

1. `mobile/public/harness-ui/index.html` — markup desktop Settings completo,
   sezioni Appearance e Model Lab, stati `preparatory/gated` espliciti.
2. `mobile/public/harness-ui/app.js` — schema versionato desktop, parser
   fail-closed, wiring tema/mode/motion/composer/streaming e store Model Lab.
3. `mobile/public/harness-ui/styles.css` — token tema, renderer di sfondo,
   motion categories, layout responsive Model Lab, reduced-motion e stati gated.
4. `harness-ui/src/config.mjs` — configurazione provider/runtime desktop,
   senza segreti nel client.
5. `harness-ui/src/model-catalog.mjs` — catalogo provider-neutral e capability
   osservate, con version pin e gestione errori upstream.
6. `harness-ui/src/http-app.mjs` — endpoint reali per catalogo, capacità,
   repository, download e probe, solo dopo la scelta del runtime.
7. `harness-ui/src/local-runtime-adapter.mjs` — da creare solo quando il runtime
   locale sarà scelto; adapter TALOS provider-neutral, health/rollback inclusi.
8. `harness-ui/tests/settings-appearance.test.mjs` — RED/GREEN per ogni campo
   Appearance, persistenza, reset, reduced-motion e fail-closed.
9. `harness-ui/tests/model-lab.test.mjs` — RED/GREEN per catalogo, profili,
   filtri, probe, GGUF, fit, download/ripresa e segreti esclusi dal client.
10. `harness-ui/tests/http-routes-model-lab.test.mjs` — contratti HTTP, errori,
    paginazione, hash, path containment e runtime non disponibile.
11. `harness-ui/scripts/qa-visual-pipeline.mjs` — scenari completi Settings e
    Model Lab a 1440×900 e 1024×800, reload, errori, reduced-motion e overflow.
12. `.claude/QA-VISIVA-HARNESS-2026-08-30.md` — screenshot interi e confronto
    Hermes/VS Code/Cursor/Claude Code per ogni gruppo.

### E2 — RED obbligatori

- Ogni impostazione Appearance mobile ha una voce desktop o una motivazione
  “non applicabile/gated”; nessuna voce resta implicita.
- Tema, mode, scena, background e motion cambiano i token/renderer reali oppure
  dichiarano “renderer desktop non scelto”.
- `localStorage` contiene solo preferenze non sensibili e rifiuta chiavi ignote.
- Model Lab non mostra modelli locali come eseguibili prima del runtime scelto.
- Catalogo e model card distinguono dati osservati, dichiarazioni manuali e dati
  non disponibili; un errore upstream non diventa “zero modelli”.
- Download interrotti non perdono checkpoint; file/hash/path restano verificabili.

### E3 — GREEN e gate finali

- `npm test` in `harness-ui` e `git diff --check` puliti.
- Build desktop e smoke HTTP con backend reale; nessun mock come gate finale.
- QA browser su 1440×900 e 1024×800, apertura di ogni sezione, modifica e reload.
- Screenshot intero per ogni superficie e controllo manuale di padding, contrasto,
  font, overflow, z-index, scroll e reduced-motion.
- Runtime locale: gate reale su almeno un modello GGUF, verifica integrità,
  caricamento, generazione, stop, errore e rollback.

### E4 — Rollback

Rimuovere il solo ramo Model Lab/runtime e le rotte ad esso dedicate; lasciare
intatti chat, file tree, catalogo OpenRouter già esistente e persistenza delle
preferenze di presentazione. Non cancellare credenziali, file modello o
checkpoint senza una procedura esplicita e reversibile.

## Decisione proposta al main agent

1. Approvare prima la **parità completa della UI Appearance** usando il theme
   engine e i token esistenti, con ogni voce realmente attiva o chiaramente gated.
2. Portare subito la **shell visiva Model Lab** (hub, catalogo, installati,
   scheda, filtri, ledger) alimentata soltanto da dati reali disponibili; i
   comandi che richiedono il runtime devono restare disabilitati con motivo.
3. Scegliere poi il runtime locale desktop e soltanto allora collegare probe,
   fit, GGUF, download, caricamento e generazione.
4. Fare la verifica E2E e la verifica visuale atomica sul desktop alla fine di
   entrambe le fasi, non dichiarare “funzionante” una UI preparatoria.
