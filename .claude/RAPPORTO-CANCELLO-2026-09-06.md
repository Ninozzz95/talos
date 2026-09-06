# Rapporto del cancello — 2026-09-06

> Prodotto da `harness-ui/frontend/scripts/cancello/cancello.mjs`. Istanza propria sulla porta **49552** (mai la 4174), store vergine, prova di proprietà superata: **0 sessioni**. Kernel: `C:\Users\Antonino\Desktop\projects\AVM-harness\mobile\scripts\harness-talos\talosHarness.mjs`.
> **17 schermate** × **3 viewport desktop** × **2 temi** = 102 giri. Rotte del server trovate: **92**; chiamate del frontend trovate: **102**.

## ⛔ Come si legge questo rapporto — verificato a mano il 06/09

**Non tutti i 406 sono difetti.** Verificati a campione subito dopo la prima corsa:

| sezione | quanto è affidabile |
|---|---|
| **controlli morti (0)** e **testo grezzo (0)** | ✅ zero reperti, e zero falsi allarmi: le due classi più difficili non accusano nessuno |
| **contatore che non porta a nessun luogo** | ✅ **difetto VERO e nuovo**: la voce «Progetti» ha un contatore che dice 6 e **nessun `data-vaia`** (`index.template.html:857`) — il clic cade dove capita. È lo stesso difetto delle «Note», su un'altra voce, e il cancello l'ha trovato **da solo** |
| **superficie che promette e non chiama** (`modellab`) | 🔍 da guardare, plausibile |
| **rotte «che il server non espone»** | ❌ **INAFFIDABILI, da ignorare**: `search-source/key`, `search-source/test` e le altre **esistono** — sono dichiarate con espressioni regolari (gruppi opzionali, alternative) che nessun estrattore legge. È la stessa strada chiusa documentata in `CANCELLO-UNICO-METODI`, §«le rotte non si possono incrociare»: provata in due modi, entrambi falliti. L'agente ha scritto il suo estrattore prima che la lezione fosse registrata |
| **classi senza regola CSS** (382, di cui 176 «alta») | ⚠️ **sospetti, non difetti, e la gravità è sbagliata**: misurato sull'app viva, `.ft-node` e `.ft-tree` hanno `list-style-type:none` da una regola generica — nessun difetto visivo. Vanno riletti come «dove guardare», non come «cosa è rotto», e la loro gravità va abbassata |

⇒ Il valore di questa prima corsa non sta nel 406: sta nei **due difetti veri** che nessuno stava
guardando, e nei **due zeri** che dicono che le classi più delicate non producono rumore.

## Totali per classe

| classe | alta | media | bassa | totale |
|---|---:|---:|---:|---:|
| riferimenti morti | 176 | 15 | 191 | 382 |
| controlli morti | 0 | 0 | 0 | 0 |
| stati che mentono | 1 | 0 | 0 | 1 |
| testo grezzo | 0 | 0 | 0 | 0 |
| superfici scollegate | 13 | 10 | 0 | 23 |
| **totale** | **190** | **25** | **191** | **406** |

## 1 · Riferimenti morti

| dove | cosa manca | gravità | visto in |
|---|---|---|---|
| `public/app.js:10198 → .conversation-hero` | la classe «conversation-hero» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:10201 → .hero-logo` | la classe «hero-logo» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:10443 → .stream-settle` | la classe «stream-settle» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:10750 → .is-error` | la classe «is-error» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:10849 → .model-lab-fit` | la classe «model-lab-fit» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:11029 → .is-ready` | la classe «is-ready» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:11070, public/app.js:11077 → .model-lab-enhanced-controls` | la classe «model-lab-enhanced-controls» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:11078, public/app.js:21719, public/app.js:21725, public/app.js:21730 (+3) → .settings-status` | la classe «settings-status» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:11184 → .model-lab-model-card` | la classe «model-lab-model-card» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:11222 → .hf-file-list` | la classe «hf-file-list» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:11230 → .hf-file-row` | la classe «hf-file-row» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:11352 → .hf-repo-card` | la classe «hf-repo-card» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:11354 → .hf-repo-heading` | la classe «hf-repo-heading» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:11384 → .hf-repo-tags` | la classe «hf-repo-tags» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:11396 → .hf-variant-list` | la classe «hf-variant-list» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:11404 → .hf-variant-measure` | la classe «hf-variant-measure» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:11425 → .hf-variant-status` | la classe «hf-variant-status» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:11428 → .hf-variant-info` | la classe «hf-variant-info» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:11459 → .hf-detail-tabs` | la classe «hf-detail-tabs» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:11462 → .hf-detail-body` | la classe «hf-detail-body» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:11467 → .hf-detail-tab` | «hf-detail-tab» nel CSS esiste solo in regole condizionate (la più semplice è «.hf-detail-tab.active») e su questi elementi la condizione non c'è: manca la regola di base, il contenuto resta nudo. | **alta** | — |
| `public/app.js:11525 → .model-lab-stream-block` | la classe «model-lab-stream-block» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:11853 → .talos-testo--guasto` | la classe «talos-testo--guasto» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:13013 → .plugin-panel-item` | la classe «plugin-panel-item» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:13254 → .model-picker-group-name` | la classe «model-picker-group-name» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:13561 → .clipboard-fallback` | la classe «clipboard-fallback» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:14099 → .session-tree-sheet` | la classe «session-tree-sheet» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:14119, public/app.js:14153, public/app.js:14205 → .rename-form` | la classe «rename-form» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:14134 → .reference-option` | la classe «reference-option» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:14134, public/app.js:14147, public/app.js:14168, public/app.js:14186 (+6) → .board-empty` | la classe «board-empty» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:14685 → .is-stop` | la classe «is-stop» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:14717 → .is-stopped` | la classe «is-stopped» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:14730 → .keyboard-open` | la classe «keyboard-open» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:14762 → .tool-inline-detail` | la classe «tool-inline-detail» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:15167 → .real-artifact-card` | la classe «real-artifact-card» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:15365, public/app.js:15383, public/app.js:15389, public/app.js:17408 (+1) → .tool-result-block` | la classe «tool-result-block» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:15373 → .tool-arg-row` | la classe «tool-arg-row» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:15406 → .real-session-status` | la classe «real-session-status» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:15407 → .real-session-error` | la classe «real-session-error» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:15443 → .real-approval-card` | la classe «real-approval-card» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:16456 → .tool-note-diff` | la classe «tool-note-diff» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:16658 → .ft-outside-zone` | la classe «ft-outside-zone» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:16692 → .ft-outside-row-wrap` | la classe «ft-outside-row-wrap» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:16988, public/app.js:16989, public/app.js:21314, public/app.js:21315 → .background-motion-off` | la classe «background-motion-off» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:16990 → .off` | la classe «off» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:16990, public/app.js:21314 → .interface-motion-off` | la classe «interface-motion-off» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:17026, public/app.js:17028, public/app.js:17055, public/app.js:17057 (+2) → .background-motion-active` | la classe «background-motion-active» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:17027, public/app.js:17029, public/app.js:17056, public/app.js:17058 (+2) → .background-motion-paused` | la classe «background-motion-paused» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:17225 → .ft-node` | la classe «ft-node» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:17249, public/app.js:17624 → .ft-status-dot` | la classe «ft-status-dot» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:17546 → .ft-tree` | la classe «ft-tree» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:17651, public/app.js:17666 → .ft-match` | la classe «ft-match» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:17651, public/app.js:17667, public/app.js:17681 → .ft-dimmed` | la classe «ft-dimmed» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:17944 → .tool-arg-key` | la classe «tool-arg-key» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:18161, public/app.js:18513, public/app.js:18524, public/app.js:18570 → .is-restoring` | la classe «is-restoring» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:18643 → .is-pending` | la classe «is-pending» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:18643, public/app.js:18761 → .real-session-item` | la classe «real-session-item» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:18898 → .full` | «full» nel CSS esiste solo in regole condizionate (la più semplice è «.secondary-btn.full») e su questi elementi la condizione non c'è: manca la regola di base, il contenuto resta nudo. | **alta** | — |
| `public/app.js:19016 → .compact` | «compact» nel CSS esiste solo in regole condizionate (la più semplice è «.primary-btn.compact») e su questi elementi la condizione non c'è: manca la regola di base, il contenuto resta nudo. | **alta** | — |
| `public/app.js:20417, public/app.js:20426 → .composer-user-sized` | la classe «composer-user-sized» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:20617 → .speaking` | la classe «speaking» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:20831, public/app.js:20834 → .collapsed` | la classe «collapsed» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:21207, public/app.js:21326 → .talos-embedded-wide-short` | la classe «talos-embedded-wide-short» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:21314 → .motion-composer-off` | la classe «motion-composer-off» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:21314 → .motion-feedback-off` | la classe «motion-feedback-off» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:21314 → .motion-messages-off` | la classe «motion-messages-off» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:21314 → .motion-navigation-off` | la classe «motion-navigation-off» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:21314 → .motion-surfaces-off` | la classe «motion-surfaces-off» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:21314 → .motion-windows-off` | la classe «motion-windows-off» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:21405, public/app.js:21413 → .dragging` | la classe «dragging» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:21618 → .model-lab-installed-item` | la classe «model-lab-installed-item» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:21626 → .model-lab-installed-actions` | la classe «model-lab-installed-actions» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:21685, public/app.js:21749, public/app.js:21764, public/app.js:21777 (+1) → .legacy-pane` | la classe «legacy-pane» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:21686, public/app.js:21785 → .generic-shell` | la classe «generic-shell» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:21687, public/app.js:21751, public/app.js:21766, public/app.js:21786 → .view-heading` | la classe «view-heading» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:21688 → .settings-layout` | la classe «settings-layout» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:21699 → .settings-detail-panels` | la classe «settings-detail-panels» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:21700, public/app.js:21721, public/app.js:21736 → .settings-card-wide` | la classe «settings-card-wide» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:21701, public/app.js:21722, public/app.js:21736, public/app.js:21737 (+4) → .settings-card-heading` | la classe «settings-card-heading» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:21702, public/app.js:21714, public/app.js:21717 → .settings-control-grid` | la classe «settings-control-grid» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:21702, public/app.js:21714, public/app.js:21717, public/app.js:21718 (+1) → .settings-section` | la classe «settings-section» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:21714, public/app.js:21717 → .range-grid` | la classe «range-grid» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:21714, public/app.js:21717, public/app.js:21718, public/app.js:21736 → .settings-switch-grid` | la classe «settings-switch-grid» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:21715, public/app.js:21717 → .range-control` | la classe «range-control» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:21715, public/app.js:21717 → .range-value` | la classe «range-value» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:21717 → .categories` | la classe «categories» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:21721 → .model-lab-card` | la classe «model-lab-card» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:21722, public/app.js:21725 → .runtime-gate` | la classe «runtime-gate» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:21725 → .memoria-azioni` | la classe «memoria-azioni» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:21725 → .memoria-barra` | la classe «memoria-barra» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:21725 → .memoria-barra-usata` | la classe «memoria-barra-usata» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:21725 → .memoria-libera` | la classe «memoria-libera» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:21725 → .memoria-nota` | la classe «memoria-nota» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:21725 → .memoria-riga` | la classe «memoria-riga» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:21725 → .memoria-tenuta` | la classe «memoria-tenuta» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:21725 → .model-lab-active-model` | la classe «model-lab-active-model» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:21725 → .model-lab-layout` | la classe «model-lab-layout» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:21725 → .model-lab-metrics` | la classe «model-lab-metrics» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:21725 → .model-lab-runtime-list` | la classe «model-lab-runtime-list» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:21725 → .model-lab-stream` | la classe «model-lab-stream» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:21725 → .runtime-gate-large` | la classe «runtime-gate-large» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:21725, public/app.js:21730, public/app.js:21731, public/app.js:21732 (+1) → .model-lab-empty` | la classe «model-lab-empty» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:21727, public/app.js:21730, public/app.js:21731, public/app.js:21732 (+1) → .model-lab-panel-heading` | la classe «model-lab-panel-heading» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:21728 → .provider-list` | la classe «provider-list» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:21730, public/app.js:21732 → .model-lab-catalog-layout` | la classe «model-lab-catalog-layout» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:21730, public/app.js:21732 → .model-lab-list` | la classe «model-lab-list» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:21731, public/app.js:21733 → .model-lab-installed-list` | la classe «model-lab-installed-list» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:21736, public/app.js:21738, public/app.js:21742 → .settings-facts` | la classe «settings-facts» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:21737, public/app.js:21738, public/app.js:21740, public/app.js:21741 (+1) → .settings-info-card` | la classe «settings-info-card» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:21737, public/app.js:21741 → .settings-facts-list` | la classe «settings-facts-list» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:21738, public/app.js:21741, public/app.js:21742 → .provider-actions` | la classe «provider-actions» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:21743 → .control-grid` | la classe «control-grid» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:21743 → .control-plane-card` | la classe «control-plane-card» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:21750 → .review-shell` | la classe «review-shell» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:21752 → .review-summary` | la classe «review-summary» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:21755 → .file-review-list` | la classe «file-review-list» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:21755, public/app.js:21758 → .review-empty` | la classe «review-empty» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:21756 → .diff-panel` | la classe «diff-panel» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:21757 → .diff-toolbar` | la classe «diff-toolbar» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:21765 → .dashboard-shell` | la classe «dashboard-shell» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:21766 → .board-heading` | la classe «board-heading» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:21771 → .session-board-list` | la classe «session-board-list» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:21778 → .browser-shell` | la classe «browser-shell» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:21779 → .browser-bar` | la classe «browser-bar» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:21779 → .browser-nav` | la classe «browser-nav» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:21779 → .browser-tools` | la classe «browser-tools» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:21779 → .browser-url` | la classe «browser-url» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:21779 → .status-pulse` | la classe «status-pulse» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:21780 → .device-preview` | la classe «device-preview» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:21787, public/app.js:21790 → .automation-list` | la classe «automation-list» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:21797 → .run-state` | la classe «run-state» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:21800 → .panel-resize-handle` | la classe «panel-resize-handle» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:21801 → .inspector-head` | la classe «inspector-head» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:21803 → .nav-close` | la classe «nav-close» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:21810 → .inspector-body` | la classe «inspector-body» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:21812, public/app.js:21816, public/app.js:21821, public/app.js:21825 → .inspector-card` | la classe «inspector-card» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:21818 → .capability-row` | la classe «capability-row» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:21825 → .session-topology` | la classe «session-topology» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:21827 → .root` | la classe «root» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:21827 → .topology-node` | la classe «topology-node» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:21827 → .topology-row` | la classe «topology-row» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:21832, public/app.js:21856 → .inspector-section` | «inspector-section» nel CSS esiste solo in regole condizionate (la più semplice è «.inspector-section.active») e su questi elementi la condizione non c'è: manca la regola di base, il contenuto resta nudo. | **alta** | — |
| `public/app.js:21833 → .ft-search-row` | la classe «ft-search-row» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:21834 → .ft-search-icon` | la classe «ft-search-icon» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:21835 → .ft-search-input` | la classe «ft-search-input» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:21837 → .ft-commandbar` | la classe «ft-commandbar» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:21841 → .ft-commandbar-spacer` | la classe «ft-commandbar-spacer» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:21846 → .ft-legend` | la classe «ft-legend» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:21847 → .ft-legend-new` | la classe «ft-legend-new» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:21848 → .ft-legend-modified` | la classe «ft-legend-modified» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:21863 → .topbar-left` | la classe «topbar-left» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:21864 → .embedded-session-back-icon` | la classe «embedded-session-back-icon» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:21864 → .mobile-only` | la classe «mobile-only» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:21864 → .sessions-menu-icon` | la classe «sessions-menu-icon» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:21865 → .desktop-only` | la classe «desktop-only» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:21871 → .topbar-center` | la classe «topbar-center» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:21873, public/app.js:21874 → .mode-tab` | «mode-tab» nel CSS esiste solo in regole condizionate (la più semplice è «.mode-tab.active») e su questi elementi la condizione non c'è: manca la regola di base, il contenuto resta nudo. | **alta** | — |
| `public/app.js:21934 → .toast-region` | la classe «toast-region» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:243 → .talos-button--` | la classe «talos-button--» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:3833 → .toast` | la classe «toast» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:6497 → .talos-input` | la classe «talos-input» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:7728 → .artifact-card-frame` | la classe «artifact-card-frame» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:8203 → .talos-status-strip--senza-contatto` | la classe «talos-status-strip--senza-contatto» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:8255 → .vicino` | la classe «vicino» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:9578 → .stream-word` | la classe «stream-word» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:9626, public/app.js:17817, public/app.js:17831 → .is-streaming` | la classe «is-streaming» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:9804 → .is-scroll-hidden` | la classe «is-scroll-hidden» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:9950, public/app.js:21388 → .sessions-collapsed` | la classe «sessions-collapsed» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/app.js:9961, public/app.js:9962, public/app.js:9966, public/app.js:9967 (+2) → .open` | la classe «open» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/index.html:13 → .talos-sprite` | la classe «talos-sprite» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/index.html:278 → .stop-run` | la classe «stop-run» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/index.html:385 → .talos-review--schede` | la classe «talos-review--schede» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/index.html:391 → .talos-review__vuoto` | la classe «talos-review__vuoto» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/index.html:473 → .talos-browser__history` | la classe «talos-browser__history» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/index.html:764 → .talos-scope-note` | la classe «talos-scope-note» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/index.html:838, public/index.html:839, public/index.html:841, public/index.html:842 (+1) → .talos-callout--warn` | la classe «talos-callout--warn» è scritta nel markup e nessuna regola CSS la nomina, nemmeno insieme ad altre: quello che la porta non riceve niente. | **alta** | — |
| `public/index.html:148, public/index.html:772 → data-ridimensiona` | nessun sorgente nomina «data-ridimensiona», né come stringa né come «dataset.ridimensiona», e nessuna regola CSS lo usa come aggancio: l'attributo è scritto e nessuno lo legge. | **media** | — |
| `public/index.html:2 → data-talos-entrypoint` | nessun sorgente nomina «data-talos-entrypoint», né come stringa né come «dataset.talosEntrypoint», e nessuna regola CSS lo usa come aggancio: l'attributo è scritto e nessuno lo legge. | **media** | — |
| `public/index.html:283 → data-coda-togli` | nessun sorgente nomina «data-coda-togli», né come stringa né come «dataset.codaTogli», e nessuna regola CSS lo usa come aggancio: l'attributo è scritto e nessuno lo legge. | **media** | — |
| `public/index.html:483 → data-panel` | nessun sorgente nomina «data-panel», né come stringa né come «dataset.panel», e nessuna regola CSS lo usa come aggancio: l'attributo è scritto e nessuno lo legge. | **media** | — |
| `public/index.html:512 → data-runtime-demo` | nessun sorgente nomina «data-runtime-demo», né come stringa né come «dataset.runtimeDemo», e nessuna regola CSS lo usa come aggancio: l'attributo è scritto e nessuno lo legge. | **media** | — |
| `public/index.html:807 → data-file-menu` | nessun sorgente nomina «data-file-menu», né come stringa né come «dataset.fileMenu», e nessuna regola CSS lo usa come aggancio: l'attributo è scritto e nessuno lo legge. | **media** | — |
| `public/index.html:807 → data-path` | nessun sorgente nomina «data-path», né come stringa né come «dataset.path», e nessuna regola CSS lo usa come aggancio: l'attributo è scritto e nessuno lo legge. | **media** | — |
| `public/index.html:823 → data-file-action` | nessun sorgente nomina «data-file-action», né come stringa né come «dataset.fileAction», e nessuna regola CSS lo usa come aggancio: l'attributo è scritto e nessuno lo legge. | **media** | — |
| `public/index.html:827 → data-riferimento` | nessun sorgente nomina «data-riferimento», né come stringa né come «dataset.riferimento», e nessuna regola CSS lo usa come aggancio: l'attributo è scritto e nessuno lo legge. | **media** | — |
| `public/index.html:844 → data-fonte-modello` | nessun sorgente nomina «data-fonte-modello», né come stringa né come «dataset.fonteModello», e nessuna regola CSS lo usa come aggancio: l'attributo è scritto e nessuno lo legge. | **media** | — |
| `public/index.html:844 → data-modello-dialogo` | nessun sorgente nomina «data-modello-dialogo», né come stringa né come «dataset.modelloDialogo», e nessuna regola CSS lo usa come aggancio: l'attributo è scritto e nessuno lo legge. | **media** | — |
| `public/index.html:951 → data-command-alias` | nessun sorgente nomina «data-command-alias», né come stringa né come «dataset.commandAlias», e nessuna regola CSS lo usa come aggancio: l'attributo è scritto e nessuno lo legge. | **media** | — |
| `public/index.html:951 → data-gruppo-comandi` | nessun sorgente nomina «data-gruppo-comandi», né come stringa né come «dataset.gruppoComandi», e nessuna regola CSS lo usa come aggancio: l'attributo è scritto e nessuno lo legge. | **media** | — |
| `public/index.html:974 → data-intro-lab` | nessun sorgente nomina «data-intro-lab», né come stringa né come «dataset.introLab», e nessuna regola CSS lo usa come aggancio: l'attributo è scritto e nessuno lo legge. | **media** | — |
| `public/index.html:983 → data-lab-file` | nessun sorgente nomina «data-lab-file», né come stringa né come «dataset.labFile», e nessuna regola CSS lo usa come aggancio: l'attributo è scritto e nessuno lo legge. | **media** | — |
| `public/styles.css:1529 → .talos-turn-spine__tick--danger` | il selettore pretende «.talos-turn-spine__tick--danger», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:1955 → .talos-system-note__perche` | il selettore pretende «.talos-system-note__perche», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:1960 → .talos-system-note__rimedi` | il selettore pretende «.talos-system-note__rimedi», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:1990 → .talos-system-note__grezzo` | il selettore pretende «.talos-system-note__grezzo», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:2050 → .assistant-copy .code-block-lang` | il selettore pretende «.code-block-lang», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:2253 → .tool-rifiuto` | il selettore pretende «.tool-rifiuto», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:2879 → .talos-list-row--muted` | il selettore pretende «.talos-list-row--muted», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:305 → .i--xs` | il selettore pretende «.i--xs», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:3315 → .talos-terminal__body .ko` | il selettore pretende «.ko», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:3399 → .talos-terminal__body.terminal-window` | il selettore pretende «.terminal-window», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:3411 → .talos-terminal__mount .xterm` | il selettore pretende «.xterm», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:3414 → .talos-terminal__mount .xterm .xterm-viewport` | il selettore pretende «.xterm», «.xterm-viewport», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:3647 → .talos-hf-nessuno` | il selettore pretende «.talos-hf-nessuno», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:3681 → .talos-contesto-voce` | il selettore pretende «.talos-contesto-voce», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:3689 → .talos-contesto-voce:first-child` | il selettore pretende «.talos-contesto-voce», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:3692 → .talos-contesto-voce__punto` | il selettore pretende «.talos-contesto-voce__punto», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:3698 → .talos-contesto-voce__k` | il selettore pretende «.talos-contesto-voce__k», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:3702 → .talos-contesto-voce__v` | il selettore pretende «.talos-contesto-voce__v», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:3737 → .talos-inventory` | il selettore pretende «.talos-inventory», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:3742 → .talos-inventory__item` | il selettore pretende «.talos-inventory__item», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:3745 → .talos-inventory__name` | il selettore pretende «.talos-inventory__name», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:3751 → .talos-inventory__name b` | il selettore pretende «.talos-inventory__name», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:3755 → .talos-inventory__name span` | il selettore pretende «.talos-inventory__name», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:3759 → .talos-inventory__demo` | il selettore pretende «.talos-inventory__demo», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:3765 → .talos-inventory__demo--col` | il selettore pretende «.talos-inventory__demo--col», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:3769 → .talos-inventory__props` | il selettore pretende «.talos-inventory__props», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:3887 → .talos-codeblock__body .k` | il selettore pretende «.k», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:3890 → .talos-codeblock__body .s` | il selettore pretende «.s», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:3893 → .talos-codeblock__body .fn` | il selettore pretende «.fn», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:3896 → .talos-codeblock__body .n` | il selettore pretende «.n», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:3935 → .talos-automation__fix` | il selettore pretende «.talos-automation__fix», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:425 → .talos-button--lg` | il selettore pretende «.talos-button--lg», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:438 → .talos-icon-button.talos-button--round` | il selettore pretende «.talos-button--round», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:4508 → .talos-shell.details-open .talos-inspector` | il selettore pretende «.details-open», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:4516 → .talos-shell.details-open .talos-inspector-close` | il selettore pretende «.details-open», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:4519 → .talos-shell.details-open .talos-inspector__head` | il selettore pretende «.details-open», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:4524 → .talos-shell.details-open .talos-resizer--inspector` | il selettore pretende «.details-open», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:454 → .talos-badge--dot::before` | il selettore pretende «.talos-badge--dot», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:4912 → .talos-runtime-card__error` | il selettore pretende «.talos-runtime-card__error», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:498 → .talos-badge__kbd` | il selettore pretende «.talos-badge__kbd», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:5161 → dialog.sheet-dialog .badge-dot, dialog.command-dialog .badge-dot, .ft-actions-menu .badge-dot` | il selettore pretende «.badge-dot», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:5294 → dialog.sheet-dialog .session-selection-toolbar, dialog.command-dialog .session-selection-toolbar, .ft-actions-menu .session-selection-toolbar` | il selettore pretende «.session-selection-toolbar», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:5305 → dialog.sheet-dialog .session-selection-toolbar[hidden], dialog.command-dialog .session-selection-toolbar[hidden], .ft-actions-menu .session-selection-toolbar[hidden]` | il selettore pretende «.session-selection-toolbar», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:5310 → dialog.sheet-dialog .session-selection-toolbar-row, dialog.command-dialog .session-selection-toolbar-row, .ft-actions-menu .session-selection-toolbar-row` | il selettore pretende «.session-selection-toolbar-row», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:5319 → .session-selection-toolbar .text-btn` | il selettore pretende «.session-selection-toolbar», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:5324 → dialog.sheet-dialog .session-selection-count, dialog.command-dialog .session-selection-count, .ft-actions-menu .session-selection-count` | il selettore pretende «.session-selection-count», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:5345 → dialog.sheet-dialog .session-item.active, dialog.command-dialog .session-item.active, .ft-actions-menu .session-item.active` | il selettore pretende «.session-item», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:5356 → dialog.sheet-dialog .session-item.is-selection-mode, dialog.command-dialog .session-item.is-selection-mode, .ft-actions-menu .session-item.is-selection-mode` | il selettore pretende «.session-item», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:5361 → dialog.sheet-dialog .session-item.is-selected, dialog.command-dialog .session-item.is-selected, .ft-actions-menu .session-item.is-selected` | il selettore pretende «.session-item», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:5367 → dialog.sheet-dialog .session-selection-check, dialog.command-dialog .session-selection-check, .ft-actions-menu .session-selection-check` | il selettore pretende «.session-selection-check», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:5376 → dialog.sheet-dialog .session-selection-check input, dialog.command-dialog .session-selection-check input, .ft-actions-menu .session-selection-check input` | il selettore pretende «.session-selection-check», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:5385 → dialog.sheet-dialog .session-selection-check input:focus-visible, dialog.command-dialog .session-selection-check input:focus-visible, .ft-actions-menu .session-selection-check input:focus-visible` | il selettore pretende «.session-selection-check», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:5391 → dialog.sheet-dialog .session-meta svg, dialog.command-dialog .session-meta svg, .ft-actions-menu .session-meta svg` | il selettore pretende «.session-meta», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:5444 → dialog.sheet-dialog .view-pane.active, dialog.command-dialog .view-pane.active, .ft-actions-menu .view-pane.active` | il selettore pretende «.view-pane», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:5449 → dialog.sheet-dialog .chat-view.active, dialog.command-dialog .chat-view.active, .ft-actions-menu .chat-view.active` | il selettore pretende «.chat-view», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:5474 → dialog.sheet-dialog .plan-label svg, dialog.command-dialog .plan-label svg, .ft-actions-menu .plan-label svg` | il selettore pretende «.plan-label», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:5480 → dialog.sheet-dialog .mini-icon svg, dialog.command-dialog .mini-icon svg, .ft-actions-menu .mini-icon svg` | il selettore pretende «.mini-icon», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:5525 → dialog.sheet-dialog .token.selector, dialog.command-dialog .token.selector, .ft-actions-menu .token.selector` | il selettore pretende «.token», «.selector», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:5535 → dialog.sheet-dialog .message-actions svg, dialog.command-dialog .message-actions svg, .ft-actions-menu .message-actions svg` | il selettore pretende «.message-actions», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:5541 → dialog.sheet-dialog .compact-message, dialog.command-dialog .compact-message, .ft-actions-menu .compact-message` | il selettore pretende «.compact-message», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:5546 → dialog.sheet-dialog .tool-icon svg, dialog.command-dialog .tool-icon svg, .ft-actions-menu .tool-icon svg` | il selettore pretende «.tool-icon», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:5552 → dialog.sheet-dialog .bundle-status svg, dialog.command-dialog .bundle-status svg, .ft-actions-menu .bundle-status svg` | il selettore pretende «.bundle-status», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:5558 → dialog.sheet-dialog .tool-state svg, dialog.command-dialog .tool-state svg, .ft-actions-menu .tool-state svg` | il selettore pretende «.tool-state», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:5582 → dialog.sheet-dialog .composer-suggestion-hint, dialog.command-dialog .composer-suggestion-hint, .ft-actions-menu .composer-suggestion-hint` | il selettore pretende «.composer-suggestion-hint», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:5597 → dialog.sheet-dialog .composer textarea.composer-has-suggestion ~ .composer-suggestion-hint, dialog.command-dialog .composer textarea.composer-has-suggestion ~ .composer-suggestion-hint, .ft-actions-menu .composer textarea.composer-has-suggestion ~ .composer-suggestion-hint` | il selettore pretende «.composer», «.composer-suggestion-hint», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:5602 → dialog.sheet-dialog .composer-resize-handle svg, dialog.command-dialog .composer-resize-handle svg, .ft-actions-menu .composer-resize-handle svg` | il selettore pretende «.composer-resize-handle», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:5608 → dialog.sheet-dialog .composer-mic.recording svg, dialog.command-dialog .composer-mic.recording svg, .ft-actions-menu .composer-mic.recording svg` | il selettore pretende «.composer-mic», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:5619 → dialog.sheet-dialog .selector-pill, dialog.command-dialog .selector-pill, .ft-actions-menu .selector-pill` | il selettore pretende «.selector-pill», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:5635 → dialog.sheet-dialog .selector-pill span, dialog.command-dialog .selector-pill span, .ft-actions-menu .selector-pill span` | il selettore pretende «.selector-pill», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:5644 → dialog.sheet-dialog .selector-pill svg, dialog.command-dialog .selector-pill svg, .ft-actions-menu .selector-pill svg` | il selettore pretende «.selector-pill», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:5651 → dialog.sheet-dialog .queue-toggle, dialog.command-dialog .queue-toggle, .ft-actions-menu .queue-toggle` | il selettore pretende «.queue-toggle», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:5665 → dialog.sheet-dialog .queue-toggle.active, dialog.command-dialog .queue-toggle.active, .ft-actions-menu .queue-toggle.active` | il selettore pretende «.queue-toggle», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:5671 → dialog.sheet-dialog .queue-toggle[aria-busy=true], dialog.command-dialog .queue-toggle[aria-busy=true], .ft-actions-menu .queue-toggle[aria-busy=true]` | il selettore pretende «.queue-toggle», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:5677 → dialog.sheet-dialog .send-btn svg, dialog.command-dialog .send-btn svg, .ft-actions-menu .send-btn svg` | il selettore pretende «.send-btn», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:5683 → .queued-message > .demo-surface-badge` | il selettore pretende «.queued-message», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:5711 → dialog.sheet-dialog .memory-chip, dialog.command-dialog .memory-chip, .ft-actions-menu .memory-chip` | il selettore pretende «.memory-chip», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:5828 → dialog.sheet-dialog .ft-row.ft-selected .ft-name, dialog.command-dialog .ft-row.ft-selected .ft-name, .ft-actions-menu .ft-row.ft-selected .ft-name` | il selettore pretende «.ft-name», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:5856 → dialog.sheet-dialog .ft-icon-folder svg, dialog.command-dialog .ft-icon-folder svg, .ft-actions-menu .ft-icon-folder svg` | il selettore pretende «.ft-icon-folder», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:5861 → dialog.sheet-dialog .ft-icon-folder.ft-open svg, dialog.command-dialog .ft-icon-folder.ft-open svg, .ft-actions-menu .ft-icon-folder.ft-open svg` | il selettore pretende «.ft-icon-folder», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:5866 → dialog.sheet-dialog .ft-icon-file svg, dialog.command-dialog .ft-icon-file svg, .ft-actions-menu .ft-icon-file svg` | il selettore pretende «.ft-icon-file», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:5871 → dialog.sheet-dialog .ft-icon-code svg, dialog.command-dialog .ft-icon-code svg, .ft-actions-menu .ft-icon-code svg` | il selettore pretende «.ft-icon-code», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:5915 → .ft-actions-menu-item` | il selettore pretende «.ft-actions-menu-item», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:5929 → .ft-actions-menu-item:hover` | il selettore pretende «.ft-actions-menu-item», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:5933 → .ft-actions-menu-item svg` | il selettore pretende «.ft-actions-menu-item», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:5939 → .ft-actions-menu-item-danger` | il selettore pretende «.ft-actions-menu-item-danger», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:5942 → .ft-actions-menu-item-danger svg` | il selettore pretende «.ft-actions-menu-item-danger», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:5945 → .ft-actions-menu-item-danger:hover` | il selettore pretende «.ft-actions-menu-item-danger», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:5948 → .session-actions-menu .ft-actions-menu-item:focus-visible` | il selettore pretende «.ft-actions-menu-item», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:5952 → dialog.sheet-dialog .agent-card svg, dialog.command-dialog .agent-card svg, .ft-actions-menu .agent-card svg` | il selettore pretende «.agent-card», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:5959 → dialog.sheet-dialog .file-review.active, dialog.command-dialog .file-review.active, .ft-actions-menu .file-review.active` | il selettore pretende «.file-review», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:5965 → dialog.sheet-dialog .file-review svg, dialog.command-dialog .file-review svg, .ft-actions-menu .file-review svg` | il selettore pretende «.file-review», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:5984 → dialog.sheet-dialog .status-chip.success, dialog.command-dialog .status-chip.success, .ft-actions-menu .status-chip.success` | il selettore pretende «.success», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:5991 → dialog.sheet-dialog .status-chip.error, dialog.command-dialog .status-chip.error, .ft-actions-menu .status-chip.error` | il selettore pretende «.error», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:5998 → dialog.sheet-dialog .status-chip.avviso, dialog.command-dialog .status-chip.avviso, .ft-actions-menu .status-chip.avviso` | il selettore pretende «.avviso», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:6017 → dialog.sheet-dialog .widget-head svg, dialog.command-dialog .widget-head svg, .ft-actions-menu .widget-head svg` | il selettore pretende «.widget-head», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:6023 → dialog.sheet-dialog .agent-row svg, dialog.command-dialog .agent-row svg, .ft-actions-menu .agent-row svg` | il selettore pretende «.agent-row», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:6036 → dialog.sheet-dialog .session-board-row .status-chip, dialog.command-dialog .session-board-row .status-chip, .ft-actions-menu .session-board-row .status-chip` | il selettore pretende «.session-board-row», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:6167 → .dialog-resize-handle--width` | il selettore pretende «.dialog-resize-handle--width», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:6174 → .dialog-resize-handle--width::after` | il selettore pretende «.dialog-resize-handle--width», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:6181 → .dialog-resize-handle--height` | il selettore pretende «.dialog-resize-handle--height», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:6188 → .dialog-resize-handle--height::after` | il selettore pretende «.dialog-resize-handle--height», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:6195 → .dialog-resize-handle--both` | il selettore pretende «.dialog-resize-handle--both», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:6202 → .dialog-resize-handle--both::after` | il selettore pretende «.dialog-resize-handle--both», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:6212 → .dialog-resize-handle--both:hover::after, .dialog-resize-handle--both:focus-visible::after, .dialog-resizing .dialog-resize-handle--both::after` | il selettore pretende «.dialog-resize-handle--both», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:6336 → dialog.sheet-dialog .sheet-shortcut-chip, dialog.command-dialog .sheet-shortcut-chip, .ft-actions-menu .sheet-shortcut-chip` | il selettore pretende «.sheet-shortcut-chip», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:6348 → dialog.sheet-dialog .sheet-shortcut-chip:hover, dialog.command-dialog .sheet-shortcut-chip:hover, .ft-actions-menu .sheet-shortcut-chip:hover` | il selettore pretende «.sheet-shortcut-chip», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:6420 → dialog.sheet-dialog .desktop-context-toggle, dialog.command-dialog .desktop-context-toggle, .ft-actions-menu .desktop-context-toggle` | il selettore pretende «.desktop-context-toggle», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:6426 → .sessions-panel[data-demo-surface=sessions] > .demo-surface-badge` | il selettore pretende «.sessions-panel», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:6429 → .chat-view .conversation > .demo-surface-badge` | il selettore pretende «.chat-view», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:6432 → .inspector-panel > .demo-surface-badge` | il selettore pretende «.inspector-panel», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:6444 → dialog.sheet-dialog .bundle-status svg, dialog.command-dialog .bundle-status svg, .ft-actions-menu .bundle-status svg` | il selettore pretende «.bundle-status», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:6453 → .approval-actions .secondary-btn:first-child` | il selettore pretende «.approval-actions», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:6456 → .approval-actions .primary-btn` | il selettore pretende «.approval-actions», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:6459 → dialog.sheet-dialog .selector-pill, dialog.command-dialog .selector-pill, .ft-actions-menu .selector-pill` | il selettore pretende «.selector-pill», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:646 → .talos-checkbox--lg` | il selettore pretende «.talos-checkbox--lg», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:6464 → dialog.sheet-dialog .queue-toggle, dialog.command-dialog .queue-toggle, .ft-actions-menu .queue-toggle` | il selettore pretende «.queue-toggle», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:6469 → dialog.sheet-dialog .mobile-nav button.active, dialog.command-dialog .mobile-nav button.active, .ft-actions-menu .mobile-nav button.active` | il selettore pretende «.mobile-nav», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:6475 → dialog.sheet-dialog .mobile-nav svg, dialog.command-dialog .mobile-nav svg, .ft-actions-menu .mobile-nav svg` | il selettore pretende «.mobile-nav», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:6522 → dialog.sheet-dialog .selector-pill, dialog.command-dialog .selector-pill, .ft-actions-menu .selector-pill` | il selettore pretende «.selector-pill», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:6527 → .approval-actions .secondary-btn` | il selettore pretende «.approval-actions», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:6535 → dialog.sheet-dialog .selector-pill span, dialog.command-dialog .selector-pill span, .ft-actions-menu .selector-pill span` | il selettore pretende «.selector-pill», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:6605 → dialog.sheet-dialog .provider-card-toggle, dialog.command-dialog .provider-card-toggle, .ft-actions-menu .provider-card-toggle` | il selettore pretende «.provider-card-toggle», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:6621 → dialog.sheet-dialog .provider-card-toggle > span:first-child, dialog.command-dialog .provider-card-toggle > span:first-child, .ft-actions-menu .provider-card-toggle > span:first-child` | il selettore pretende «.provider-card-toggle», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:6626 → dialog.sheet-dialog .provider-card-toggle strong, dialog.command-dialog .provider-card-toggle strong, .ft-actions-menu .provider-card-toggle strong` | il selettore pretende «.provider-card-toggle», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:6631 → dialog.sheet-dialog .provider-card-toggle .provider-state, dialog.command-dialog .provider-card-toggle .provider-state, .ft-actions-menu .provider-card-toggle .provider-state` | il selettore pretende «.provider-card-toggle», «.provider-state», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:6636 → dialog.sheet-dialog .provider-card-toggle[aria-expanded=true] .provider-chevron, dialog.command-dialog .provider-card-toggle[aria-expanded=true] .provider-chevron, .ft-actions-menu .provider-card-toggle[aria-expanded=true] .provider-chevron` | il selettore pretende «.provider-card-toggle», «.provider-chevron», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:6641 → dialog.sheet-dialog .provider-card .provider-field[hidden], dialog.command-dialog .provider-card .provider-field[hidden], .ft-actions-menu .provider-card .provider-field[hidden]` | il selettore pretende «.provider-card», «.provider-field», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:6646 → dialog.sheet-dialog .provider-field, dialog.command-dialog .provider-field, .ft-actions-menu .provider-field` | il selettore pretende «.provider-field», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:6654 → dialog.sheet-dialog .provider-field input, dialog.command-dialog .provider-field input, .ft-actions-menu .provider-field input` | il selettore pretende «.provider-field», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:6680 → dialog.sheet-dialog .model-lab-filter-chips, dialog.command-dialog .model-lab-filter-chips, .ft-actions-menu .model-lab-filter-chips` | il selettore pretende «.model-lab-filter-chips», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:6688 → dialog.sheet-dialog .model-lab-filter-chips span, dialog.command-dialog .model-lab-filter-chips span, .ft-actions-menu .model-lab-filter-chips span` | il selettore pretende «.model-lab-filter-chips», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:6707 → dialog.sheet-dialog .model-lab-disabled-grid .search-field, dialog.command-dialog .model-lab-disabled-grid .search-field, .ft-actions-menu .model-lab-disabled-grid .search-field` | il selettore pretende «.model-lab-disabled-grid», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:6723 → dialog.sheet-dialog .bundle-header[aria-expanded=false] .bundle-status svg, dialog.command-dialog .bundle-header[aria-expanded=false] .bundle-status svg, .ft-actions-menu .bundle-header[aria-expanded=false] .bundle-status svg` | il selettore pretende «.bundle-header», «.bundle-status», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:6728 → dialog.sheet-dialog .bundle-status svg, dialog.command-dialog .bundle-status svg, .ft-actions-menu .bundle-status svg` | il selettore pretende «.bundle-status», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:6733 → dialog.sheet-dialog #compactSessionBtn.is-loading svg, dialog.command-dialog #compactSessionBtn.is-loading svg, .ft-actions-menu #compactSessionBtn.is-loading svg` | il selettore pretende «#compactSessionBtn», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:6738 → dialog.sheet-dialog body.reduce-motion #compactSessionBtn.is-loading svg, dialog.command-dialog body.reduce-motion #compactSessionBtn.is-loading svg, .ft-actions-menu body.reduce-motion #compactSessionBtn.is-loading svg` | il selettore pretende «#compactSessionBtn», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:6743 → dialog.sheet-dialog .queue-toggle:hover, dialog.command-dialog .queue-toggle:hover, .ft-actions-menu .queue-toggle:hover` | il selettore pretende «.queue-toggle», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:6749 → dialog.sheet-dialog .queue-toggle.active, dialog.command-dialog .queue-toggle.active, .ft-actions-menu .queue-toggle.active, dialog.sheet-dialog .queue-toggle[aria-pressed=true], dialog.command-dialog .queue-toggle[aria-pressed=true], .ft-actions-menu .queue-toggle[aria-pressed=true]` | il selettore pretende «.queue-toggle», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:6815 → dialog.sheet-dialog .selector-pill, dialog.command-dialog .selector-pill, .ft-actions-menu .selector-pill` | il selettore pretende «.selector-pill», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:6853 → dialog.sheet-dialog .selector-pill, dialog.command-dialog .selector-pill, .ft-actions-menu .selector-pill` | il selettore pretende «.selector-pill», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:6868 → dialog.sheet-dialog .selector-pill span, dialog.command-dialog .selector-pill span, .ft-actions-menu .selector-pill span` | il selettore pretende «.selector-pill», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:6889 → dialog.sheet-dialog .sheet-hint, dialog.command-dialog .sheet-hint, .ft-actions-menu .sheet-hint` | il selettore pretende «.sheet-hint», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:6897 → dialog.sheet-dialog .sheet-chip-row, dialog.command-dialog .sheet-chip-row, .ft-actions-menu .sheet-chip-row` | il selettore pretende «.sheet-chip-row», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:6905 → dialog.sheet-dialog .chip, dialog.command-dialog .chip, .ft-actions-menu .chip` | il selettore pretende «.chip», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:6917 → dialog.sheet-dialog .chip:hover, dialog.command-dialog .chip:hover, .ft-actions-menu .chip:hover` | il selettore pretende «.chip», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:7090 → .effort-picker-label` | il selettore pretende «.effort-picker-label», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:7096 → .effort-picker-selected` | il selettore pretende «.effort-picker-selected», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:7112 → .effort-picker-tick` | il selettore pretende «.effort-picker-tick», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:7121 → .effort-picker-tick:first-child` | il selettore pretende «.effort-picker-tick», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:7124 → .effort-picker-tick:last-child` | il selettore pretende «.effort-picker-tick», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:7156 → dialog.sheet-dialog :host(.talos-embedded-wide-short) .composer-toolbar .selector-pill, dialog.command-dialog :host(.talos-embedded-wide-short) .composer-toolbar .selector-pill, .ft-actions-menu :host(.talos-embedded-wide-short) .composer-toolbar .selector-pill, dialog.sheet-dialog :host(.talos-embedded-wide-short) .composer-toolbar .queue-toggle, dialog.command-dialog :host(.talos-embedded-wide-short) .composer-toolbar .queue-toggle, .ft-actions-menu :host(.talos-embedded-wide-short) .composer-toolbar .queue-toggle` | il selettore pretende «.composer-toolbar», «.selector-pill», «.queue-toggle», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:7164 → dialog.sheet-dialog :host(.talos-embedded-wide-short) .mobile-nav button.active, dialog.command-dialog :host(.talos-embedded-wide-short) .mobile-nav button.active, .ft-actions-menu :host(.talos-embedded-wide-short) .mobile-nav button.active` | il selettore pretende «.mobile-nav», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:7499 → .workspace-chooser-tree-spacer` | il selettore pretende «.workspace-chooser-tree-spacer», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:7573 → .workspace-chooser-help` | il selettore pretende «.workspace-chooser-help», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:766 → .talos-skeleton` | il selettore pretende «.talos-skeleton», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:7740 → dialog.sheet-dialog .badge-dot[hidden], dialog.command-dialog .badge-dot[hidden], .ft-actions-menu .badge-dot[hidden]` | il selettore pretende «.badge-dot», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:779 → .talos-skeleton--w40` | il selettore pretende «.talos-skeleton--w40», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:7800 → dialog.sheet-dialog .hf-detail-tab.active .hf-detail-tab-count, dialog.command-dialog .hf-detail-tab.active .hf-detail-tab-count, .ft-actions-menu .hf-detail-tab.active .hf-detail-tab-count` | il selettore pretende «.hf-detail-tab-count», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:782 → .talos-skeleton--w70` | il selettore pretende «.talos-skeleton--w70», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:7837 → .model-picker-source-count` | il selettore pretende «.model-picker-source-count», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:7845 → .model-picker-source-note` | il selettore pretende «.model-picker-source-note», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:785 → .talos-skeleton--w90` | il selettore pretende «.talos-skeleton--w90», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:7856 → .model-picker-local-row` | il selettore pretende «.model-picker-local-row», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:7865 → .model-picker-local-row:nth-child(even)` | il selettore pretende «.model-picker-local-row», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:7868 → .model-picker-local-row > small` | il selettore pretende «.model-picker-local-row», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:7872 → dialog.sheet-dialog .provider-row-chevron svg, dialog.command-dialog .provider-row-chevron svg, .ft-actions-menu .provider-row-chevron svg` | il selettore pretende «.provider-row-chevron», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:7878 → dialog.sheet-dialog .provider-field-label, dialog.command-dialog .provider-field-label, .ft-actions-menu .provider-field-label` | il selettore pretende «.provider-field-label», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:7886 → dialog.sheet-dialog .provider-field-narrow, dialog.command-dialog .provider-field-narrow, .ft-actions-menu .provider-field-narrow` | il selettore pretende «.provider-field-narrow», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:7891 → dialog.sheet-dialog .settings-card .provider-field, dialog.command-dialog .settings-card .provider-field, .ft-actions-menu .settings-card .provider-field, dialog.sheet-dialog .provider-field, dialog.command-dialog .provider-field, .ft-actions-menu .provider-field` | il selettore pretende «.provider-field», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:7903 → .provider-row-body .sheet-input` | il selettore pretende «.provider-row-body», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:7982 → .intro-rail-label` | il selettore pretende «.intro-rail-label», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:7993 → .intro-rail li[aria-current=step] .intro-rail-label` | il selettore pretende «.intro-rail-label», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:8073 → .intro-choice .intro-state` | il selettore pretende «.intro-state», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:8079 → .intro-choice[data-stato=ok] .intro-state` | il selettore pretende «.intro-state», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:8082 → .intro-choice[data-stato=rotto] .intro-state` | il selettore pretende «.intro-state», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:8115 → .intro-key-esito` | il selettore pretende «.intro-key-esito», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:8119 → .intro-key-esito[data-esito=ok]` | il selettore pretende «.intro-key-esito», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:8122 → .intro-key-esito[data-esito=rotto]` | il selettore pretende «.intro-key-esito», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:8125 → .intro-note` | il selettore pretende «.intro-note», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:8166 → .intro-rail-label` | il selettore pretende «.intro-rail-label», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:8170 → .search-source-choice .intro-mark svg` | il selettore pretende «.search-source-choice», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:8174 → dialog.sheet-dialog .search-source-details .provider-field input, dialog.command-dialog .search-source-details .provider-field input, .ft-actions-menu .search-source-details .provider-field input` | il selettore pretende «.search-source-details», «.provider-field», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:8179 → dialog.sheet-dialog .tool-chips, dialog.command-dialog .tool-chips, .ft-actions-menu .tool-chips` | il selettore pretende «.tool-chips», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:8188 → dialog.sheet-dialog .tool-chips .status-chip, dialog.command-dialog .tool-chips .status-chip, .ft-actions-menu .tool-chips .status-chip` | il selettore pretende «.tool-chips», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:8193 → .tool-chips .secondary-btn` | il selettore pretende «.tool-chips», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:8207 → .talos-tampone-fine` | il selettore pretende «.talos-tampone-fine», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:863 → .talos-regia` | il selettore pretende «.talos-regia», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:874 → .talos-regia__name` | il selettore pretende «.talos-regia__name», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:881 → .talos-regia__note` | il selettore pretende «.talos-regia__note», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:885 → .talos-regia__group` | il selettore pretende «.talos-regia__group», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |
| `public/styles.css:890 → .talos-regia__group .talos-eyebrow` | il selettore pretende «.talos-regia__group», che non compare in nessun markup né in nessun sorgente: la regola non può agganciare niente. | **bassa** | — |

## 2 · Controlli morti

_Nessun reperto._

## 3 · Stati che mentono

| dove | cosa manca | gravità | visto in |
|---|---|---|---|
| `S12-CONTATORE-PORTA-A-UN-LUOGO · contatore:(senza nome)` | il contatore dichiara 6 elementi e non porta a nessun luogo — 06/09, prova T14: «Note 1» era un contatore vivo — e la nota c’era davvero sul disco — con NESSUNA pagina dietro: il clic finiva nella chat. ⛔ Senza questa regola S11 tacerebbe proprio qui, perché un luogo che non esiste non ha un numero da confrontare: la precondizione di S11 sarebbe falsa e il difetto peggiore passerebbe per costruzione. | **alta** | 1 combinazioni |

## 4 · Testo grezzo

_Nessun reperto._

## 5 · Superfici scollegate

| dove | cosa manca | gravità | visto in |
|---|---|---|---|
| `* /api/v1/huggingface/downloads/:x/:x` | la chiamata punta a una rotta che il server non espone: la vista che la usa non riceverà mai dati | **alta** | — |
| `* /api/v1/huggingface/downloads/:x/cancel` | la chiamata punta a una rotta che il server non espone: la vista che la usa non riceverà mai dati | **alta** | — |
| `* /api/v1/huggingface/downloads/:x/pause` | la chiamata punta a una rotta che il server non espone: la vista che la usa non riceverà mai dati | **alta** | — |
| `* /api/v1/huggingface/downloads/:x/resume` | la chiamata punta a una rotta che il server non espone: la vista che la usa non riceverà mai dati | **alta** | — |
| `* /api/v1/local-models/:x/delete` | la chiamata punta a una rotta che il server non espone: la vista che la usa non riceverà mai dati | **alta** | — |
| `* /api/v1/local-models/:x/rename` | la chiamata punta a una rotta che il server non espone: la vista che la usa non riceverà mai dati | **alta** | — |
| `* /api/v1/providers/:x/key` | la chiamata punta a una rotta che il server non espone: la vista che la usa non riceverà mai dati | **alta** | — |
| `* /api/v1/search-source/key` | la chiamata punta a una rotta che il server non espone: la vista che la usa non riceverà mai dati | **alta** | — |
| `* /api/v1/search-source/key/remove` | la chiamata punta a una rotta che il server non espone: la vista che la usa non riceverà mai dati | **alta** | — |
| `* /api/v1/search-source/test` | la chiamata punta a una rotta che il server non espone: la vista che la usa non riceverà mai dati | **alta** | — |
| `* /api/v1/terminal/ws` | la chiamata punta a una rotta che il server non espone: la vista che la usa non riceverà mai dati | **alta** | — |
| `modellab` | promette «i modelli sul computer e il catalogo» e non chiama nessuna rotta: mostrerà sempre lo stato vuoto | **alta** | — |
| `Progetti` | «Progetti» mostra un numero e non porta da nessuna parte: il clic cade dove capita (era il difetto di «Note», che finiva nella chat) | **alta** | — |
| `* /api/v1/automations/:id/elimina` | il server la espone e nessuna schermata la chiede: o una superficie non la usa (come «Agenti» contro /children), o è codice da togliere | **media** | — |
| `* /api/v1/automations/:id/toggle` | il server la espone e nessuna schermata la chiede: o una superficie non la usa (come «Agenti» contro /children), o è codice da togliere | **media** | — |
| `* /api/v1/local-models/:id/qualify` | il server la espone e nessuna schermata la chiede: o una superficie non la usa (come «Agenti» contro /children), o è codice da togliere | **media** | — |
| `* /api/v1/providers/:id/runtime` | il server la espone e nessuna schermata la chiede: o una superficie non la usa (come «Agenti» contro /children), o è codice da togliere | **media** | — |
| `* /api/v1/runtime/bootstrap` | il server la espone e nessuna schermata la chiede: o una superficie non la usa (come «Agenti» contro /children), o è codice da togliere | **media** | — |
| `* /api/v1/sessions/:id/git/branch` | il server la espone e nessuna schermata la chiede: o una superficie non la usa (come «Agenti» contro /children), o è codice da togliere | **media** | — |
| `* /api/v1/sessions/:id/git/status` | il server la espone e nessuna schermata la chiede: o una superficie non la usa (come «Agenti» contro /children), o è codice da togliere | **media** | — |
| `* /api/v1/sessions/:id/tool-forge/:id/enable` | il server la espone e nessuna schermata la chiede: o una superficie non la usa (come «Agenti» contro /children), o è codice da togliere | **media** | — |
| `POST /api/v1/local-models/:id/qualify` | il server la espone e nessuna schermata la chiede: o una superficie non la usa (come «Agenti» contro /children), o è codice da togliere | **media** | — |
| `POST /api/v1/workspace-launches` | il server la espone e nessuna schermata la chiede: o una superficie non la usa (come «Agenti» contro /children), o è codice da togliere | **media** | — |

## Copertura — cosa è stato guardato davvero

| schermata | come è stata aperta | controlli esaminati | vivi | morti | non giudicabili |
|---|---|---:|---:|---:|---:|
| Chat | clic su [data-vaia="chat"] | 36 | 36 | 0 | 0 |
| Nessuna sessione | MOSTRATA per via DOM: nessun comando dell’interfaccia la apre | 30 | 23 | 0 | 7 |
| Terminale | MOSTRATA per via DOM: nessun comando dell’interfaccia la apre | 28 | 27 | 0 | 1 |
| Review | clic su [data-vaia="review"] | 36 | 28 | 0 | 8 |
| Browser | clic su [data-vaia="browser"] | 36 | 29 | 0 | 7 |
| Capability | clic su [data-vaia="capability"] | 72 | 70 | 0 | 2 |
| Board | clic su [data-vaia="board"] | 25 | 25 | 0 | 0 |
| Libreria | clic su [data-vaia="libreria"] | 21 | 21 | 0 | 0 |
| Memoria | clic su [data-vaia="memoria"] | 23 | 23 | 0 | 0 |
| Attività | clic su [data-vaia="attivita"] | 22 | 22 | 0 | 0 |
| Note | clic su [data-vaia="note"] | 17 | 17 | 0 | 0 |
| Ricerca approfondita | clic su [data-vaia="ricerca"] | 24 | 24 | 0 | 0 |
| Officina attrezzi | clic su [data-vaia="officina"] | 21 | 21 | 0 | 0 |
| Automazioni | clic su [data-vaia="automazioni"] | 22 | 22 | 0 | 0 |
| Impostazioni | clic su [data-vaia="impostazioni"] | 108 | 107 | 0 | 1 |
| Doctor | foglio «Controllo» → Doctor | 18 | 18 | 0 | 0 |
| Model Lab | MOSTRATA per via DOM: nessun comando dell’interfaccia la apre | 23 | 17 | 0 | 6 |

> «Non giudicabili» non è un dettaglio: un rapporto che non sa dire **chi non ha guardato** può scrivere «zero morti» avendo esaminato niente.

### Le regole della classe 3 che non hanno esaminato nessuna coppia

- `S01-INTERROTTA-MAI-IN-CORSO`
- `S02-INTERROTTA-MAI-PALLINO-VIVO`
- `S03-CONCLUSA-MAI-IN-CORSO`
- `S04-CONCLUSA-MAI-PALLINO-VIVO`
- `S05-VIVA-MAI-DICHIARATA-MORTA`
- `S06-ATTESA-SI-DICE`
- `S09-BARRA-DELLA-SESSIONE-APERTA`
- `S10-NUMERI-DELLA-BARRA-SONO-QUELLI-VERI`
- `S11-CONTATORE-PORTA-A-N`
- `S13-ESITO-NON-REGISTRATO-NON-E-SUCCESSO`

### Il traffico osservato, superficie per superficie

| superficie | rotte chiamate mentre era aperta |
|---|---|
| Chat | _nessuna_ |
| Nessuna sessione | _nessuna_ |
| Terminale | _nessuna_ |
| Review | _nessuna_ |
| Browser | _nessuna_ |
| Capability | `GET /api/v1/tools` |
| Board | `GET /api/v1/sessions` |
| Libreria | _nessuna_ |
| Memoria | _nessuna_ |
| Attività | _nessuna_ |
| Note | _nessuna_ |
| Ricerca approfondita | _nessuna_ |
| Officina attrezzi | _nessuna_ |
| Automazioni | `GET /api/v1/automations` |
| Impostazioni | `GET /api/v1/model-lab/capacity` · `GET /api/v1/runtime` · `GET /api/v1/local-models` · `GET /api/v1/providers` |
| Doctor | `GET /api/v1/doctor` · `GET /api/v1/sessions` |
| Model Lab | _nessuna_ |

## Cosa questo cancello NON copre

- Non giudica se una cosa è BELLA, se il testo è GIUSTO o se il flusso ha senso: quelle restano allo screenshot guardato da una persona. Il cancello toglie il lavoro meccanico, non l'occhio.
- Guarda solo ciò che è VISIBILE nel momento in cui guarda: un controllo che compare dopo una risposta del modello, una barra che mente per due secondi dopo un invio, un elenco che si popola più tardi, non entrano in nessuna misura. Non c'è nessuna nozione di tempo.
- Le rotte del server sono estratte a REGEX da `src/http-app.mjs` (`url.pathname === …` e i letterali `/^\/api…$/`): una rotta scritta in una forma nuova non comparirebbe, e la sua assenza somiglia in tutto a «non c'è». Il numero delle rotte trovate è scritto nel rapporto proprio per poterlo smentire.
- Le sessioni: lo store è VERGINE per costruzione (è la prova che il server è il proprio), quindi le regole della classe 3 che parlano di sessioni non esaminano nessuna coppia e risultano MUTE. Sono elencate: «nessuna bugia» con dieci regole mute non è una buona notizia.

- (classe 5) Un percorso costruito (`${…}`) è riconosciuto per SEGMENTI, non per valore: `/a/${x}/b` combacia con qualunque rotta `/a/:qualcosa/b`, ma quale id arrivi davvero non si sa.
- (classe 5) Un buco che si espande in più segmenti (`${repo}` = `org/nome`) è letto come UN segmento solo: quella chiamata può risultare senza rotta pur essendo giusta.
- (classe 5) Una rotta chiamata da un cliente che non è questo frontend (ponte mobile, supervisore, sonda) risulta mai chiamata finché non è dichiarata come eccezione, con il perché.
- (classe 5) Una superficie alimentata da eventi (SSE) non è scollegata: deve dichiarare `eventi`, perché nessuna lista di rotte può assolverla.
- (classe 5) «Rotta mai chiamata» è un sospetto statico: la prova definitiva è il traffico vero (wiz.io, API Discovery, letto il 06/09/2026).
- (classe 5) Il collegamento è misurato sull’esistenza della chiamata, non sul suo esito: una rotta chiamata che risponde sempre 500, o una risposta che il codice butta via, qui risulta collegata.

_Generato il 2026-09-06T21:26:25.482Z._
