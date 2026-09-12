# INVENTARIO PROVIDER — Hermes v0.21 contro TALOS Harness Desktop

> **Data:** 12/09/2026 · **Lane:** `lane/harness-desktop` · **Ordine owner:** «inventario di lista
> provider/api key di Hermes; valutiamo quanti nuovi provider inserire nella nostra app, ne abbiamo
> troppo pochi. Inventario COMPLETO con grammatica e mappa API completissima.»
>
> ⛔ **Questo è SOLO un documento.** Nessuna riga di codice di prodotto è stata toccata: l'owner
> valuta prima, si implementa dopo.
>
> ⛔ **Nessun segreto è stato copiato qui.** Dove serve nominare una credenziale si nomina la
> **variabile d'ambiente** o la voce del portachiavi, mai un valore.

---

## 0. Come è stato fatto, e che cosa vale

**Le fonti lette alla fonte (non dal dossier):**

| Cosa | Dove |
|---|---|
| Hermes Agent v0.21.0 «Pantheon», commit `365e2835` (2/9/2026) | `C:\Users\Antonino\AppData\Local\Temp\talos-competitor\hermes-agent-v21` |
| TALOS Harness Desktop, ramo `lane/harness-desktop`, HEAD `dda6a427` | `C:\Users\Antonino\Desktop\projects\AVM-harness-desktop\harness-ui` |
| Claude Code · Codex · opencode · cline · goose (una riga ciascuno) | `…\talos-competitor\{claude-code,codex,opencode,cline,goose}` |

**Ricerca web — dichiarazione onesta.** Il budget `WebSearch` della sessione era **esaurito (200 su
200)** prima che cominciassi: ogni fonte esterna qui sotto è stata presa con **WebFetch su
documentazione primaria**, con URL e data di lettura accanto. Dove non ho potuto verificare, lo dico
nel §7 invece di riempire la casella.

**Il numero in una riga.**

|  | Hermes v0.21 | TALOS oggi |
|---|---|---|
| Profili fornitore registrati | **48** (da **39** cartelle-plugin) | **7** id nel portachiavi |
| Voci nel selettore (hardcoded + auto-estese) | **39** scritte a mano + auto-estensione dal registro | 7 scritte a mano in **10 punti diversi** |
| Overlay di trasporto | **42** | — |
| Alias accettati (`provider:model`) | **89** | 7 prefissi (`local:`, `ollama:`, …) |
| Catalogo modelli sotto tutto | **models.dev** — «4000+ modelli su 109+ provider» | **OpenRouter `/models`** (417 modelli, misurati 27/8) |
| Aggiungere un fornitore nuovo | **due file, zero righe di codice core** | **codice in 10 file** |

---

## 1. La tabella di Hermes — un profilo per riga

**Come leggere le colonne.** In Hermes lo *streaming* e il *tool calling* **non sono per-fornitore**:
sono proprietà del **trasporto** (`api_mode`), e ogni trasporto le implementa una volta sola per tutti
i fornitori che lo dichiarano. Perciò la colonna «wire» è la risposta a entrambe le domande, e sotto
la tabella c'è la legenda dei quattro trasporti. Segnalarlo invece di ripetere «sì/sì» su 48 righe è
il dato vero: **è esattamente la leva che a noi manca.**

Tutti i percorsi sono relativi a `plugins/model-providers/<nome>/__init__.py` salvo dove indicato.

### 1a. I 48 profili registrati dai plugin

| # | slug (alias) | base URL | auth | env della chiave | wire (`api_mode`) | note di profilo | file:riga |
|---|---|---|---|---|---|---|---|
| 1 | `actual` (actual-computer, aci) | `https://api.actual.inc/v1` | api_key | `ACTUAL_API_KEY` · `ACTUAL_BASE_URL` | `codex_responses` | `fetch_models` proprio | `actual/__init__.py:77-88` |
| 2 | `ai-gateway` (vercel, vercel-ai-gateway) | `https://ai-gateway.vercel.sh/v1` | api_key | `AI_GATEWAY_API_KEY` | `chat_completions` | aux `google/gemini-3-flash`; aggregatore | `ai-gateway/__init__.py:32-40` |
| 3 | `alibaba` (dashscope, qwen-dashscope) | `https://dashscope-intl.aliyuncs.com/compatible-mode/v1` | api_key | `DASHSCOPE_API_KEY` | `chat_completions` | onora `cache_control` stile Anthropic sul wire OpenAI | `alibaba/__init__.py:23-26` |
| 4 | `alibaba-cn` | `https://dashscope.aliyuncs.com/compatible-mode/v1` | api_key | `DASHSCOPE_API_KEY` · `DASHSCOPE_CN_BASE_URL` | `chat_completions` | endpoint Cina | `alibaba/__init__.py:30-35` |
| 5 | `alibaba-token-plan` | `https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1` | api_key | `ALIBABA_TOKEN_PLAN_API_KEY` · `…_BASE_URL` | `chat_completions` | tier a token forfettari | `alibaba/__init__.py:42-49` |
| 6 | `alibaba-token-plan-cn` | `https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1` | api_key | `ALIBABA_TOKEN_PLAN_CN_API_KEY` · … | `chat_completions` | — | `alibaba/__init__.py:53-60` |
| 7 | `alibaba-coding-plan` | `https://coding-intl.dashscope.aliyuncs.com/v1` | api_key | `ALIBABA_CODING_PLAN_API_KEY` · `DASHSCOPE_API_KEY` | `chat_completions` | tier coding dedicato | `alibaba-coding-plan/__init__.py:22-29` |
| 8 | `alibaba-coding-plan-cn` | `https://coding.dashscope.aliyuncs.com/v1` | api_key | `ALIBABA_CODING_PLAN_CN_API_KEY` · … | `chat_completions` | — | `alibaba-coding-plan/__init__.py:33-40` |
| 9 | `anthropic` (claude, claude-oauth, claude-code) | `https://api.anthropic.com` | api_key **+ token Claude Code** | `ANTHROPIC_API_KEY` · `ANTHROPIC_TOKEN` · `CLAUDE_CODE_OAUTH_TOKEN` | `anthropic_messages` | `fetch_models` con auth OAuth; aux `claude-haiku-4-5-20251001` | `anthropic/__init__.py:45-51` |
| 10 | `arcee` (arcee-ai) | `https://api.arcee.ai/api/v1` | api_key | `ARCEEAI_API_KEY` | `chat_completions` | — | `arcee/__init__.py:7-10` |
| 11 | `azure-foundry` (azure, azure-ai) | **vuoto** — lo dà l'utente | api_key | `AZURE_FOUNDRY_API_KEY` · `AZURE_FOUNDRY_BASE_URL` | `chat_completions` **o** `anthropic_messages` (deciso da `model.api_mode` in config) | unico profilo a wire variabile | `azure-foundry/__init__.py:11-18` |
| 12 | `bedrock` (aws, amazon-bedrock) | `https://bedrock-runtime.us-east-1.amazonaws.com` | **`aws_sdk`** | *(nessuna: credenziali AWS)* | `bedrock_converse` | `fetch_models` = `None` (nessun REST catalog) | `bedrock/__init__.py:22-27` |
| 13 | `commandcode` | `_COMMANDCODE_BASE` + `models_url` esplicito | api_key | `_COMMANDCODE_ENV` | `chat_completions` | aux `deepseek/deepseek-v4-flash` | `commandcode/__init__.py:102-124` |
| 14 | `commandcode-anthropic` | stesso base | api_key | `_COMMANDCODE_ANTHROPIC_ENV` | `anthropic_messages` | **stesso host, due wire, due profili** | `commandcode/__init__.py:156-170` |
| 15 | `copilot` (github-copilot, github) | `https://api.githubcopilot.com` | **`copilot`** (token `gh`) | `COPILOT_GITHUB_TOKEN` · `GH_TOKEN` · `GITHUB_TOKEN` | `chat_completions` | risoluzione token dedicata | `copilot/__init__.py:73-77` |
| 16 | `copilot-acp` | `acp://copilot` | **`external_process`** | *(nessuna)* | `chat_completions` su stdio | `process_command="copilot"`, `process_args=("--acp","--stdio")`, override `HERMES_COPILOT_ACP_COMMAND`/`COPILOT_CLI_PATH`; **`create_client()` proprio** | `copilot-acp/__init__.py:39-50` |
| 17 | `custom` | **vuoto** — endpoint dell'utente | api_key | *(nessuna fissa)* | `chat_completions` | `default_max_tokens=65536` | `custom/__init__.py:131-146` |
| 18 | `deepinfra` | `https://api.deepinfra.com/v1/openai` | api_key | `DEEPINFRA_API_KEY` · `DEEPINFRA_BASE_URL` | `chat_completions` | aux `deepseek-ai/DeepSeek-V4-Flash` | `deepinfra/__init__.py:52-72` |
| 19 | `deepseek` | `https://api.deepseek.com/v1` | api_key | `DEEPSEEK_API_KEY` | `chat_completions` | `build_api_kwargs_extras`: `extra_body.thinking={"type":"enabled\|disabled"}` + `reasoning_effort` in cima | `deepseek/__init__.py:49-108` |
| 20 | `fireworks` (fw) | `https://api.fireworks.ai/inference/v1` | api_key | `FIREWORKS_API_KEY` | `chat_completions` | aux `accounts/fireworks/models/glm-5p2` | `fireworks/__init__.py:18-37` |
| 21 | `gemini` (google, google-ai-studio) | `https://generativelanguage.googleapis.com/v1beta` | api_key | `GOOGLE_API_KEY` · `GEMINI_API_KEY` | **dichiara** `chat_completions` **ma usa client nativo** (`agent/gemini_native_adapter.py`) | `build_extra_body` traduce in `thinking_config` | `gemini/__init__.py:52-58` |
| 22 | `gmi` (gmi-cloud) | `https://api.gmi-serving.com/v1` | api_key | `GMI_API_KEY` · `GMI_BASE_URL` | `chat_completions` | — | `gmi/__init__.py:8-20` |
| 23 | `huggingface` (hf) | `https://router.huggingface.co/v1` | api_key | `HF_TOKEN` | `chat_completions` | aggregatore | `huggingface/__init__.py:7-17` |
| 24 | `kilocode` (kilo) | `https://api.kilo.ai/api/gateway` | api_key | `KILOCODE_API_KEY` | `chat_completions` | aggregatore; aux `google/gemini-3.6-flash` | `kilocode/__init__.py:7-11` |
| 25 | `kimi-coding` (kimi, moonshot) | `https://api.moonshot.ai/v1` | api_key | `KIMI_API_KEY` · `KIMI_CODING_API_KEY` | `chat_completions` | **`fixed_temperature=OMIT_TEMPERATURE`** (il server la gestisce), `default_max_tokens=32000`, `reasoning_effort` in cima | `kimi-coding/__init__.py:114-125` |
| 26 | `kimi-coding-cn` | `https://api.moonshot.cn/v1` | api_key | `KIMI_CN_API_KEY` | `chat_completions` | idem | `kimi-coding/__init__.py:129-140` |
| 27 | `meta-ai` (meta, muse, msl) | `api.meta.ai` (da `_base_url()`) | api_key | `MODEL_API_KEY` · `META_API_KEY` · `META_MODEL_API_KEY` · `META_BASE_URL` | `codex_responses` | `supports_vision=True`, `default_max_tokens=16384`; **93-99% di cache solo su `/v1/responses`** | `meta-ai/__init__.py:105-129` |
| 28 | `minimax` | `https://api.minimax.io/anthropic` | api_key | `MINIMAX_API_KEY` | `anthropic_messages` | aux `MiniMax-M3` | `minimax/__init__.py:63-69` |
| 29 | `minimax-cn` | `https://api.minimaxi.com/anthropic` | api_key | `MINIMAX_CN_API_KEY` | `anthropic_messages` | — | `minimax/__init__.py:73-79` |
| 30 | `minimax-oauth` | `https://api.minimax.io/anthropic` | **`oauth_external`** | *(nessuna: token in `auth.json`)* | `anthropic_messages` | aux `MiniMax-M2.7` | `minimax/__init__.py:83-92` |
| 31 | `nebius-token-factory` | `https://api.tokenfactory.nebius.com/v1` | api_key | `NEBIUS_API_KEY` · `NEBIUS_TOKEN_FACTORY_API_KEY` | `chat_completions` | `models_url` con `?verbose=true` | `nebius-token-factory/__init__.py:71-90` |
| 32 | `nous` (nous-portal) | `https://inference-api.nousresearch.com/v1` | **`oauth_device_code`** | `NOUS_API_KEY` | `chat_completions` | `build_extra_body` con `session_id` sticky (proxy verso OpenRouter) | `nous/__init__.py:135-146` |
| 33 | `novita` | `https://api.novita.ai/openai/v1` | api_key | `NOVITA_API_KEY` · `NOVITA_BASE_URL` | `chat_completions` | aggregatore | `novita/__init__.py:8-16` |
| 34 | `nvidia` (nim, nemotron) | `https://integrate.api.nvidia.com/v1` | api_key | `NVIDIA_API_KEY` | `chat_completions` | `prepare_messages` proprio; `default_max_tokens=16384` | `nvidia/__init__.py:45-56` |
| 35 | `ollama-cloud` | `https://ollama.com/v1` | api_key | `OLLAMA_API_KEY` | `chat_completions` | aux `nemotron-3-nano:30b` | `ollama-cloud/__init__.py:88-92` |
| 36 | `openai-codex` (codex) | `https://chatgpt.com/backend-api/codex` | **`oauth_external`** | *(nessuna)* | `codex_responses` | auto-invia `prompt_cache_retention: 24h` | `openai-codex/__init__.py:7-12` |
| 37 | `opencode-free` (free) | `https://opencode.ai/zen/v1` | **KEYLESS** | *(nessuna)* | `chat_completions` | `keyless=True`: nessuna credenziale da configurare | `opencode-free/__init__.py:55-64` |
| 38 | `opencode-zen` (opencode, zen) | `https://opencode.ai/zen/v1` | api_key | `OPENCODE_ZEN_API_KEY` | `chat_completions` | UA `hermes-cli/<ver>` per superare il WAF sul catalogo | `opencode-zen/__init__.py:203-208` |
| 39 | `opencode-go` | `https://opencode.ai/zen/go/v1` | api_key | `OPENCODE_GO_API_KEY` | `chat_completions` | aux `glm-5`; onora `cache_control` su wire OpenAI | `opencode-zen/__init__.py:212-217` |
| 40 | `openrouter` (or) | `https://openrouter.ai/api/v1` · `models_url` pubblico | api_key | `OPENROUTER_API_KEY` | `chat_completions` | `build_extra_body`: `session_id` sticky, `provider` preferences, plugin `pareto-router`; `build_api_kwargs_extras`: `extra_body.reasoning` + header `x-grok-conv-id` per Grok | `openrouter/__init__.py:89-247` |
| 41 | `qwen-oauth` (qwen, qwen-cli) | `https://portal.qwen.ai/v1` | **`oauth_external`** (riusa il login del Qwen CLI) | `QWEN_API_KEY` | `chat_completions` | `prepare_messages`: normalizza a lista-di-parti e **inietta `cache_control`**; `default_max_tokens=65536` | `qwen-oauth/__init__.py:100-105` |
| 42 | `router` (ramp-router, router.com) | `api.router.com` (da `_base_url()`) | api_key | `RAMP_ROUTER_API_KEY` · `ROUTER_API_KEY` · `RAMP_ROUTER_BASE_URL` | `codex_responses` | `supports_vision=True`; **`supported_reasoning_efforts()` dal catalogo vivo** (il gateway fa 400 su livelli sconosciuti); aux `gpt-5.4-mini` | `router/__init__.py:366-388` |
| 43 | `stepfun` (step) | `https://api.stepfun.ai/step_plan/v1` | api_key | `STEPFUN_API_KEY` | `chat_completions` | aux `step-3.5-flash` | `stepfun/__init__.py:7-11` |
| 44 | `upstage` (solar) | `https://api.upstage.ai/v1` | api_key | `UPSTAGE_API_KEY` · `UPSTAGE_BASE_URL` | `chat_completions` | — | `upstage/__init__.py:103-110` |
| 45 | `vertex` (google-vertex, gcp-vertex) | `https://aiplatform.googleapis.com` (il vero è calcolato a runtime) | **`vertex`** (OAuth2 service account / ADC) | *(nessuna)* | `chat_completions` | `build_extra_body` proprio | `vertex/__init__.py:66-72` |
| 46 | `xai` (grok, x.ai) | `https://api.x.ai/v1` | api_key | `XAI_API_KEY` | `codex_responses` | — | `xai/__init__.py:8-13` |
| 47 | `xiaomi` (mimo) | `https://api.xiaomimimo.com/v1` | api_key | `XIAOMI_API_KEY` | `chat_completions` | `supports_health_check=False` (il `/models` fa 401 anche con chiave buona), `supports_vision=True`, **`supports_vision_tool_messages=False`** | `xiaomi/__init__.py:7-13` |
| 48 | `zai` (glm, z-ai, zhipu) | `https://api.z.ai/api/paas/v4` | api_key | `GLM_API_KEY` · `ZAI_API_KEY` · `Z_AI_API_KEY` | `chat_completions` | `build_api_kwargs_extras`: `extra_body.thinking` + `reasoning_effort` (solo `high`/`max`) per GLM-5.2/5.3; aux `glm-4.5-flash`; fallback `glm-5.2`, `glm-5`, `glm-4-9b` | `zai/__init__.py:149-161` |

### 1b. I cinque canonici SENZA profilo (vivono negli overlay)

`hermes_cli/provider_catalog.py:22-25` lo dichiara esplicitamente: «four canonical providers have no
profile at all — lmstudio, openai-api, tencent-tokenhub, xai-oauth — so the fallbacks are
load-bearing».

| slug | base URL | auth | env | wire | file:riga |
|---|---|---|---|---|---|
| `openai-api` | `https://api.openai.com/v1` | api_key | `OPENAI_API_KEY` · `OPENAI_BASE_URL` | **`codex_responses`** — cioè **Responses API, non chat/completions** | `hermes_cli/providers.py:69-73`, `hermes_cli/auth.py:265-272` |
| `xai-oauth` | `https://api.x.ai/v1` | `oauth_external` (SuperGrok / Premium+) | `XAI_BASE_URL` | `codex_responses` | `hermes_cli/providers.py:74-79` |
| `lmstudio` | `http://127.0.0.1:1234/v1` | api_key | `LM_API_KEY` · `LM_BASE_URL` | `chat_completions` | `hermes_cli/providers.py:85-91` |
| `tencent-tokenhub` | *(da `TOKENHUB_BASE_URL`)* | api_key | `TOKENHUB_API_KEY` | `chat_completions` | `hermes_cli/providers.py:195-198` |
| `tencent-tokenplan` | `https://api.lkeap.cloud.tencent.com/plan/anthropic` | api_key | `TOKENPLAN_API_KEY` · `TOKENPLAN_BASE_URL` | `anthropic_messages` | `hermes_cli/providers.py:199-203` |
| `moa` (virtuale) | `moa://local` | `virtual` | — | nessuno: instrada verso i veri slot del preset | `hermes_cli/providers.py:49-53` |

### 1c. I quattro wire, una volta per tutti

| `api_mode` | endpoint | streaming | tool calling | dove |
|---|---|---|---|---|
| `chat_completions` | `POST {base}/chat/completions` | SSE `data:` con `choices[].delta` | `tools[].function` + `tool_calls[].function.arguments` stringificati + `role:"tool"` con `tool_call_id` | `agent/transports/chat_completions.py` (52,5 KB) |
| `anthropic_messages` | `POST {base}/v1/messages` | SSE eventi tipizzati | blocchi `tool_use` / `tool_result` | `agent/transports/anthropic.py` |
| `codex_responses` | `POST {base}/responses` | SSE eventi `response.*` | `tools` piatti + `function_call` / `function_call_output` | `agent/transports/codex.py` (49,1 KB) |
| `bedrock_converse` | AWS SigV4 `Converse` / `ConverseStream` | stream SDK | `toolConfig` | `agent/transports/bedrock.py`, `agent/bedrock_adapter.py` |

⭐ La forma interna di Hermes è **sempre** quella di OpenAI chat-completions, e ogni altro trasporto
converte *da* lì (`website/docs/developer-guide/adding-providers.md`, sezione «Tool-call wire
format»). È la stessa scelta che abbiamo fatto noi — e vale la pena dirlo: su questo punto **siamo
già in parità architetturale**, il divario è solo nel numero di destinazioni.

### 1d. La cache, fornitore per fornitore — la colonna che conta

Hermes normalizza il consumo in `agent/usage_pricing.py:1296-1400` (`normalize_usage`) e ha **sei**
letture diverse per lo stesso concetto «token letti dalla cache», perché sei fornitori lo chiamano
in sei modi:

| Forma sul filo | Chi la usa | Riga |
|---|---|---|
| `usage.cache_read_input_tokens` / `cache_creation_input_tokens` | Anthropic e ogni wire `anthropic_messages` | `usage_pricing.py:1323-1326` |
| `input_tokens_details.cached_tokens` / `cache_write_tokens` (fallback `cache_creation_tokens`) | `codex_responses` (OpenAI, Meta, Router, xAI) | `usage_pricing.py:1329-1346` |
| `prompt_tokens_details.cached_tokens` | wire OpenAI standard | `usage_pricing.py:1361-1364` |
| `usage.cache_read_input_tokens` **al primo livello** | proxy che instradano Claude (OpenRouter, Vercel AI Gateway, Cline) | `usage_pricing.py:1365-1368` |
| **`usage.prompt_cache_hit_tokens`** | **DeepSeek nativo** (`api.deepseek.com`) — «#61871: senza questo le sessioni DeepSeek dirette mostravano sempre 0» | `usage_pricing.py:1378-1387` |
| **`usage.cached_tokens` al primo livello** | **Kimi / Moonshot nativo** — «#65722: i hit venivano fatturati a tariffa piena» | `usage_pricing.py:1388-1396` |
| `usageMetadata.cachedContentTokenCount` | Gemini nativo | `agent/gemini_native_adapter.py:804, 981` |

E la **politica** di cache è una funzione a parte, `anthropic_prompt_cache_policy`
(`agent/agent_runtime_helpers.py:2370-2660`), che ritorna `(should_cache, use_native_layout)`:

- marcatori sui **blocchi interni** per Anthropic nativo; sull'**inviluppo del messaggio** per
  OpenRouter e i proxy su wire OpenAI;
- famiglia Kimi via OpenRouter: senza la sua branca serviva **~1% di cache su prompt da 64K**;
  con la cura la progressione misurata dentro un turno è **1% → 67% → 84% → 97%** (issue #25970);
- il provider virtuale `moa` risolveva `(False, False)` e **perdeva la cache dell'aggregatore**:
  misurato **85% di cache da solo contro 2% sullo stesso modello via MoA**;
- Qwen/Alibaba su OpenCode, OpenCode Go e DashScope diretto onorano `cache_control` **sul wire
  OpenAI**: senza marcatori servono **zero** cache hit.

⛔ **Questa è la lezione del 22/8 (`la-cache-vale-sei-volte-e-non-la-contavamo`) portata alle sue
conseguenze**: là avevamo scoperto che *due lettori non conoscevano il nome*
`prompt_tokens_details.cached_tokens`. Hermes ne conosce **sette**.

### 1e. Rotazione, fallback e dove finisce la chiave

**Tre strati**, dichiarati in `website/docs/user-guide/features/fallback-providers.md:9-17`:

1. **Credential pool** — più chiavi per lo **stesso** fornitore (`agent/credential_pool.py`).
   Ogni voce è una `PooledCredential` con priorità, sorgente, impronta del segreto e stato.
   Le panchine sono **tarate sull'errore**: `EXHAUSTED_TTL_429_SECONDS = 60*60` (1 ora) per 429,
   TTL breve per 401, e se la chiave è **l'unica** del pool i throttle transitori (429, 403 di
   edge) prendono un raffreddamento **corto**, perché una panchina lunga bloccherebbe l'unica
   credenziale. Un `reset_at` dichiarato dal fornitore **vince** sulla stima
   (`credential_pool.py:132-190, 328-372`).
2. **Primary model fallback** — `fallback_providers:` in `config.yaml`, lista ordinata di coppie
   `{provider, model}`; a metà sessione si cambia fornitore **senza perdere la conversazione**.
   Comando interattivo `hermes fallback` (add/list/remove/clear).
3. **Auxiliary task fallback** — compressione, visione, titoli e slot MoA risolvono il fornitore
   **per conto proprio** (`agent/auxiliary_client.py`), con `default_aux_model` per profilo e
   l'hook `resolve_aux_model()` che lo **chiede al catalogo vivo** invece di fidarsi di una
   costante che marcisce (`providers/base.py:110-125`).

**Dove si salva la chiave.** `~/.hermes/auth.json`, con **lock di file fra processi**
(`hermes_cli/auth.py:6-10, 1138-1191, 1379`). In modalità profilo esiste un `auth.json` globale di
radice come fallback; `.anthropic_oauth.json` è un singleton a parte (`auth.py:1741`). Le chiavi da
ambiente arrivano da `.env` / variabili (`hermes_cli/config.py` inietta ogni `env_var` dei profili in
`OPTIONAL_ENV_VARS`). ⛔ **Nessun portachiavi di sistema**: è un file JSON. Su questo punto **noi
siamo avanti** (§3).

**Credenziali a comando (`key_cmd`).** Un fornitore può dichiarare un **comando che STAMPA un
token**, eseguito per richiesta e messo in cache fino a poco prima della scadenza
(`cli-config.yaml.example:173-181`). È la risposta ai gateway aziendali che emettono bearer di
breve durata — una cosa che una chiave incollata non può fare.

### 1f. La rotazione keyless dei motori di ricerca (chiesta nell'ordine)

Non sono provider di inferenza, ma è lo stesso schema applicato alla ricerca —
`website/docs/user-guide/features/web-search.md:10-39`. **Nove backend**:

| Backend | Chiave | Search | Extract | Tier gratuito |
|---|---|---|---|---|
| **Firecrawl** (default) | `FIRECRAWL_API_KEY` (facoltativa) | ✔ | ✔ | 500 crediti/mese · keyless quando selezionato |
| **SearXNG** | `SEARXNG_URL` | ✔ | — | gratis, self-hosted (aggrega 70+ motori) |
| **Brave Search** | `BRAVE_SEARCH_API_KEY` | ✔ | — | 2.000 query/mese |
| **DDGS (DuckDuckGo)** | *nessuna* | ✔ | — | gratis |
| **Exa** | `EXA_API_KEY` (facoltativa) | ✔ | ✔ | membro dell'anello keyless |
| **Parallel** | `PARALLEL_API_KEY` (facoltativa) | ✔ | ✔ | membro dell'anello keyless |
| **Tavily** | `TAVILY_API_KEY` (facoltativa) | ✔ | ✔ | keyless opt-in |
| **Keenable** | `KEENABLE_API_KEY` (facoltativa) | ✔ | ✔ | membro dell'anello keyless |
| **xAI (Grok)** | `XAI_API_KEY` o OAuth | ✔ | — | a pagamento |

⭐ **L'anello keyless**: con **zero credenziali** `web_search` e `web_extract` funzionano, ruotando
round-robin su **Exa, Parallel, Firecrawl, Keenable**; una richiesta limitata **ritenta sul vendor
successivo dell'anello**, multi-hop, finché uno serve o sono tutti a soglia. È **ultima spiaggia**:
qualunque backend configurato o chiave presente vince sempre. Le richieste non portano identificatori
(solo un id di sessione casuale per processo, ruotato al riavvio). Si spegne con
`web.keyless_fallback: false`. E in `hermes tools` Exa, Parallel e Keenable compaiono **due volte** —
«Free (keyless)» e «Paid (API key)» — così scegliere il gratuito **pinna** quello anche se domani
aggiungi una chiave (`web.provider_tier.<name>: free|paid`).

⛔ **Il difetto**: xAI non è un indice, è un LLM che sceglie le URL e ne scrive titolo e descrizione
— la documentazione stessa avverte che una query avvelenata può fargli emettere URL scelte
dall'attaccante (`web-search.md:359`). Un backend di ricerca che **genera** i risultati non è un
backend di ricerca, ed è proprio il tipo di differenza che la nostra grammatica dovrebbe **dichiarare**,
non nascondere in una riga di tabella.

---

## 2. La GRAMMATICA di Hermes

### 2a. Lo schema, verbatim

`providers/base.py:38-100` — questi sono i campi, nell'ordine del file:

```python
@dataclass
class ProviderProfile:
    # ── Identità ──
    name: str
    api_mode: str = "chat_completions"
    aliases: tuple = ()

    # ── Metadati leggibili ──
    display_name: str = ""       # "GMI Cloud" — mostrato nel picker
    description: str = ""        # sottotitolo del picker
    signup_url: str = ""         # mostrato durante il setup

    # ── Auth ed endpoint ──
    env_vars: tuple = ()
    base_url: str = ""
    models_url: str = ""         # se il catalogo sta altrove rispetto all'inferenza
    auth_type: str = "api_key"   # api_key|oauth_device_code|oauth_external|copilot|aws_sdk
    supports_health_check: bool = True   # False → doctor salta la sonda /models

    # ── Visione ──
    supports_vision: bool = False
    supports_vision_tool_messages: bool = True
    supports_prompt_cache_key: bool = False   # opt-in: molti endpoint 400 sui campi ignoti

    # ── Provider come processo esterno (auth_type="external_process") ──
    process_command: str = ""
    process_args: tuple = ()
    process_command_env_vars: tuple = ()
    process_args_env_var: str = ""

    # ── Catalogo modelli ──
    fallback_models: tuple = ()   # curato, solo modelli che sanno chiamare attrezzi
    hostname: str = ""            # per la mappa inversa URL→provider

    # ── Stranezze a livello di client ──
    default_headers: dict[str, str] = field(default_factory=dict)

    # ── Stranezze a livello di richiesta ──
    fixed_temperature: Any = None        # OMIT_TEMPERATURE = non mandarla affatto
    default_max_tokens: int | None = None
    default_aux_model: str = ""
```

E **nove hook** sovrascrivibili (stesso file, righe 110-332):

| Hook | A cosa serve |
|---|---|
| `resolve_aux_model(vision=)` | chiede al catalogo **vivo** un modello economico, invece della costante che marcisce |
| `get_hostname()` | rilevamento da URL; di default deriva da `base_url` |
| `prepare_messages(msgs)` | preprocessing dei messaggi (Qwen normalizza a lista-di-parti e inietta `cache_control`) |
| `build_extra_body(**ctx)` | `extra_body` proprio (preferenze provider OpenRouter, `thinking_config` Gemini) |
| `build_api_kwargs_extras(...)` | tupla `(aggiunte_a_extra_body, kwargs_di_primo_livello)` — esiste perché Kimi vuole `reasoning_effort` in cima e OpenRouter dentro `extra_body.reasoning` |
| `default_vision_model()` | modello di visione scoperto a runtime |
| `get_max_tokens(model)` | tetto d'uscita **per modello** (relay che frontano backend diversi) |
| `supported_reasoning_efforts(model)` | vocabolario dichiarato: `None` = non so, `()` = **nessun** parametro di reasoning, tupla = clamp. ⛔ «cache-only, chiamato sul percorso caldo» |
| `create_client(**kwargs)` | ritorna un client proprio (ACP su stdio) oppure `None` per quello condiviso |
| `fetch_models(api_key=, base_url=, timeout=)` | catalogo vivo; risoluzione URL in tre passi documentata nel docstring |

### 2b. Come si aggiunge un fornitore SENZA toccare il codice

**Tre modi, tutti dichiarativi.**

**(A) Un plugin — due file.** `plugins/model-providers/README.md:27-52`:

```
plugins/model-providers/<nome>/
├── __init__.py      # chiama providers.register_provider(profile)
└── plugin.yaml      # name, kind: model-provider, version, description
```

```yaml
name: your-provider-profile
kind: model-provider
version: 1.0.0
description: Short sentence about the provider
author: Your Name
```

⭐ **La riga che vale l'intera sezione**, da `website/docs/developer-guide/adding-providers.md:110-125`:
«That's it.» Aggiungendo quel plugin si cablano **da soli**: la voce in `PROVIDER_REGISTRY`
(credenziali), `api_mode` a `chat_completions`, `base_url` da config o dall'env dichiarata, le
`env_vars` controllate **in ordine di priorità**, i `fallback_models`, il flag `--provider` che
accetta il nuovo id, e la voce nel menu `hermes model`.

⭐ E lo stesso plugin può stare in **`$HERMES_HOME/plugins/model-providers/<nome>/`**: gli utenti
sovrascrivono un profilo **integrato** senza toccare il repo — *last-writer-wins* in
`register_provider()` (`providers/__init__.py:57-68`). Terzo canale: **entry point pip**
`hermes_agent.plugins`.

**(B) Un fornitore nominato in `config.yaml`** — nessun file, solo YAML
(`cli-config.yaml.example:147-171`):

```yaml
providers:
  my-proxy:
    base_url: "https://llm.internal.example.com/v1"
    key_env: "MY_PROXY_API_KEY"
    extra_headers:
      CF-Access-Client-Id: "xxxx.access"
      CF-Access-Client-Secret: "${CF_ACCESS_SECRET}"
```

Chiavi accettate da una voce nominata (lette in `hermes_cli/runtime_provider.py:741-930`):
`name` · `base_url` (alias `api`, `url`) · `api_key` · `key_env` (alias `api_key_env`) · **`key_cmd`**
· `api_mode` (alias `transport`) · `extra_body` · `extra_headers` · `capabilities` · `models` ·
`default_model` / `model` · `provider_key`.
⛔ I valori delle intestazioni sono **trattati come segreti e mai loggati**.

**(C) Niente** — `api_mode` si **auto-rileva dall'URL** (`_detect_api_mode_for_url`,
`runtime_provider.py:715`): `api.meta.ai` e `api.router.com` diventano `codex_responses` da soli.

### 2c. Come si sceglie il modello

- **Sintassi `provider:model`** — 89 alias in `hermes_cli/providers.py` (`ALIASES`) mappano nomi
  umani sugli id canonici: `glm`→`zai`, `grok`→`xai`, `nim`→`nvidia`, `kimi`→`kimi-for-coding`;
  e `openai`→**`openrouter`** (il nome nudo passa dall'aggregatore).
- **Picker `hermes model`** — l'universo è `CANONICAL_PROVIDERS` (39 voci scritte a mano,
  `hermes_cli/models.py:1311-1352`) **auto-esteso** con ogni profilo registrato che non c'è già
  e il cui `auth_type` non richiede un flusso bespoke (`models.py:1353-1371`).
- **Contratto di parità, presidiato dai test** (`hermes_cli/provider_catalog.py:35-37):
  «l'unione delle due schede della GUI (Accounts + API keys) **è uguale** all'universo
  `CANONICAL_PROVIDERS`, cioè esattamente ciò che `hermes model` mostra».
  ⭐ Il modulo esiste perché **prima non era così**: il picker CLI e le liste della GUI erano elenchi
  separati mantenuti a mano, e «ogni provider aggiunto dopo che quelle liste sono state scritte
  spariva in silenzio dalla GUI». **È il nostro difetto di oggi, già diagnosticato da loro.**
- **La scheda si deriva dall'auth, non si sceglie**: `tab_for_auth_type()` manda `oauth_*`,
  `external_process` e `copilot` in «Accounts», tutto il resto in «API keys».
- **Il catalogo sotto tutto: models.dev.** `agent/models_dev.py:1-56` — `https://models.dev/api.json`,
  «4000+ modelli su 109+ provider», TTL 4 ore, **ETag conditional GET** (un 304 riconferma la cache
  senza riscaricare ~2 MB), cache su disco `~/.hermes/models_dev_cache.json` servita **anche se
  stantia** invece di bloccare, invariante **«nessuna rete sui percorsi caldi»** (`allow_network=False`
  filato fino in fondo), rifiuto esplicito di una cache corrotta, e `models_dev.url` in config per
  puntare a un mirror.

---

## 3. I nostri, oggi — stessa tabella

### 3a. Chi esiste davvero

| # | id | base URL predefinito | auth | env della chiave | wire | streaming | tool calling | cache (campo letto) | dove si salva la chiave | file:riga |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `openrouter` | `https://openrouter.ai/api/v1` | Bearer | `OPENROUTER_API_KEY` | `POST {base}/chat/completions` | SSE | sì | `prompt_tokens_details.cached_tokens` → fallback `cache_read_input_tokens` | **portachiavi OS** (`talos-harness-provider`) **+ OAuth PKCE** | `provider-credential-store.mjs:22`, `model-destination.mjs:67,133`, `kernel/talosHarness.mjs:6417-6418` |
| 2 | `openai` | `https://api.openai.com/v1` | Bearer | `OPENAI_API_KEY` | **nativo**: `client.responses(model)` via `@ai-sdk/openai` | SSE tradotto in forma OpenAI | sì | `usage.inputTokenDetails.cacheReadTokens` → `prompt_tokens_details.cached_tokens` | portachiavi OS | `provider-credential-store.mjs:18`, `native-provider-adapter.mjs:71-77` |
| 3 | `anthropic` | `https://api.anthropic.com/v1` | `x-api-key` + `anthropic-version: 2023-06-01` | `ANTHROPIC_API_KEY` | **nativo**: `client.chat(model)` via `@ai-sdk/anthropic` → `/v1/messages` | SSE tradotto | sì | come sopra (via SDK) | portachiavi OS | `provider-credential-store.mjs:20`, `native-provider-adapter.mjs:71`, `provider-probe.mjs:110` |
| 4 | `gemini` | `https://generativelanguage.googleapis.com/v1beta` | `?key=` (sonda) / `x-goog-api-key` (catalogo) | `GEMINI_API_KEY` · `GOOGLE_API_KEY` | **nativo**: `@ai-sdk/google` → `:generateContent` | SSE tradotto | sì | come sopra (via SDK) | portachiavi OS | `provider-credential-store.mjs:21`, `provider-probe.mjs:111,159` |
| 5 | `deepseek` | `https://api.deepseek.com` | Bearer | `DEEPSEEK_API_KEY` | `POST {base}/chat/completions` | SSE | sì | ⛔ **`prompt_cache_hit_tokens` NON letto** ⇒ sempre 0 | portachiavi OS | `provider-credential-store.mjs:19`, `model-destination.mjs:67` |
| 6 | `ollama` | `http://127.0.0.1:11434` | nessuna | `OLLAMA_API_KEY` (facolt.) · `OLLAMA_BASE_URL` | `POST {base}/v1/chat/completions` | SSE | dipende dal modello | n/a | portachiavi OS (facoltativa) | `provider-credential-store.mjs:23`, `model-destination.mjs:133` |
| 7 | `huggingface` | *(nessuno)* | Bearer facoltativo | `HF_TOKEN` · `HUGGINGFACE_HUB_TOKEN` | ⛔ **non è una destinazione di chat**: solo catalogo e download | — | — | — | portachiavi OS | `provider-credential-store.mjs:24`, `provider-probe.mjs:51` |
| 8 | `local:` | supervisore `llama-server` | chiave **effimera** `randomBytes(32)` per avvio | *(mai esposta)* | `POST /v1/chat/completions` | SSE | sì | n/a | **mai su disco** — vive nel supervisore | `model-destination.mjs:92-113`, `llama-server-supervisor.mjs` |

**Fatto misurato, non dedotto** (`model-destination.mjs:10-16`): sulla macchina dell'owner erano
già salvate **cinque credenziali funzionanti** — OpenRouter 424 modelli, OpenAI 124, Gemini 50,
Anthropic 11, DeepSeek 3 — «cinque provider pagati e fermi, perché nessuno li chiamava».

### 3b. La nostra grammatica: **dieci elenchi paralleli**

Non c'è un record di fornitore. C'è lo stesso insieme di nomi **riscritto dieci volte**, in dieci
forme diverse, e nessun test tiene insieme le dieci:

| # | Elenco | Forma | Contiene | file:riga |
|---|---|---|---|---|
| 1 | `PROVIDER_IDS` + `PROVIDER_DEFINITIONS` | array + oggetto congelato | 7: openai, deepseek, anthropic, gemini, openrouter, ollama, huggingface | `src/provider-credential-store.mjs:13-25` |
| 2 | `SONDE_PROVIDER` | oggetto (percorso, auth, conta) | gli stessi 7 | `src/provider-probe.mjs:44-52` |
| 3 | allowlist di `elencaModelli` | array letterale in una riga | 3: openai, anthropic, gemini | `src/provider-probe.mjs:153` |
| 4 | `FONTI_MODELLO` | array congelato | 7: local, ollama, openai, deepseek, openrouter, anthropic, gemini | `src/model-destination.mjs:47` |
| 5 | `COMPATIBILI_OPENAI` | array congelato | 4 | `src/model-destination.mjs:67` |
| 6 | `NATIVI` | array congelato | 3 | `src/model-destination.mjs:74` |
| 7 | `FONTI_AMMESSE_MODELLO` | **stringa dentro una regex** | 7 | `src/config.mjs:186` |
| 8 | `PROVIDERS` dei runtime locali | oggetto congelato | 2: ollama, **lmstudio** | `src/openai-compatible-runtime.mjs:3-6` |
| 9 | mappa delle factory native | oggetto letterale in una riga | 3 | `src/native-provider-adapter.mjs:71` |
| 10 | `defaults` dei contatori di token | oggetto letterale | 3 | `src/context-token-counters.mjs:6` |
| +1 | regex di rotta HTTP `(openai\|anthropic\|gemini)` | **duplicata due volte** | 3 | `src/http-app.mjs:840` e `:2293` |
| +2 | `<select id="providerLab">` con 7 `<option>` scritte a mano | HTML | 7 | `frontend/index.template.html:1401` |

⛔ **È la stessa forma della lezione del 02/09** (`viewport-desktop-non-solo-tablet`: «c'erano **NOVE
copie sparse**, due le ha trovate il test»). Qui sono **dodici**, e due difetti già visibili lo
dimostrano:

1. **LM Studio è scoperto ma irraggiungibile.** `openai-compatible-runtime.mjs` lo sonda, elenca i
   suoi modelli con capacità **osservate** (`vision`, `trained_for_tool_use`, `reasoning`, contesto
   verificato — roba che Ollama non dà) e sa **caricarlo e scaricarlo**
   (`openai-compatible-runtime.mjs:74-96, 148-155`). Ma `lmstudio` **non è in `FONTI_MODELLO`**:
   non si può scegliere in chat. Il lavoro è fatto al 90% e non arriva all'utente.
2. **L'etichetta di DeepSeek mente.** `provider-credential-store.mjs:19` dichiara
   `execution: 'in preparazione'`, mentre `model-destination.mjs:67` lo instrada come
   OpenAI-compatibile **da sempre**. Due elenchi, due verità.

### 3c. Che cosa manca perché un fornitore sia UNA RIGA

| Manca | Conseguenza oggi |
|---|---|
| Un **record dichiarativo** di fornitore | il nome va scritto in 10-12 posti |
| `api_mode` / trasporto **dichiarato** | il wire si deduce da due array (`COMPATIBILI_OPENAI` / `NATIVI`) |
| **Lettori di cache per fornitore** | DeepSeek diretto riporta `cached_tokens: 0` per costruzione |
| `models_url` / catalogo per fornitore | il catalogo è **solo** OpenRouter (`model-catalog.mjs:17`); openai/anthropic/gemini hanno un percorso separato e gli altri niente |
| `fallback_models` | se il catalogo non risponde non c'è **nessun** modello proponibile |
| Rotazione chiavi / pool | una chiave sola per fornitore; un 429 è la fine del giro |
| **Fallback fra fornitori** | nessuno: se OpenRouter cade, la sessione cade |
| `default_aux_model` | nessun modello economico dichiarato per compressione/visione/titoli |
| `extra_headers` / `extra_body` per fornitore | nessun proxy aziendale, nessuna preferenza di routing |
| `key_cmd` (token a scadenza) | solo chiavi statiche |
| `signup_url` / `description` | la UI non sa dove mandare chi non ha una chiave |
| Prezzi per fornitore | i prezzi arrivano **solo** dal catalogo OpenRouter |

**Dove siamo AVANTI, e va detto:**

| Noi | Hermes |
|---|---|
| Chiavi nel **portachiavi del sistema operativo**, mai in chiaro su disco, mai in una risposta HTTP (`provider-credential-store.mjs:1-9, 27`) | `~/.hermes/auth.json`, file JSON |
| **`origineChiave`** (`custodia` / `ambiente`): la UI dice **da dove** viene la chiave in uso, così «Rimuovi chiave» non sembra rotto (`provider-credential-store.mjs:254-260`) | non c'è un equivalente esposto |
| **Sonda con tre stati veri**: `non-provabile` non è `non-autorizzato` (`provider-probe.mjs:90-98`) | `doctor` fa un check `/models` binario |
| **OAuth PKCE OpenRouter senza `client_secret`**, con `stato` **nel percorso** invece che in `?state=` — perché quel parametro è documentato **solo su X** (`openrouter-oauth.mjs:41-52`) | usa `?state=` senza quella cautela |
| Il segreto del motore locale **non esiste su disco**: `randomBytes(32)` per avvio, e `status()` non lo espone (`model-destination.mjs:93-108`) | — |

---

## 4. Il divario, e l'ordine che conviene

**48 contro 7.** Ma il numero non è la misura giusta: Hermes ha 8 profili solo per Alibaba e 3 per
MiniMax. La misura giusta è **quante famiglie di API sappiamo parlare** — e lì siamo a **2 su 4**
(wire OpenAI + i tre nativi via SDK; ci mancano `responses` come destinazione generica e
`anthropic_messages` verso terzi) — e **quante destinazioni la nostra grammatica regge senza
riscrivere codice**: **zero**.

**I criteri, applicati:** uso reale dell'owner (z-ai/GLM, DeepSeek, OpenRouter, locali) · costo ·
cache del prefisso disponibile **e leggibile** · tool calling affidabile · presenza in OpenRouter
(cioè: se c'è già lì, il guadagno del collegamento diretto è solo prezzo e latenza, non capacità).

### La proposta, in ordine

| # | Cosa | Perché ora | Costo stimato | Misura del guadagno |
|---|---|---|---|---|
| **P-A** | **Il record unico di fornitore** (§6) — prima di ogni nuovo provider | Senza, ogni aggiunta costa 10-12 modifiche e ne dimentica almeno una. Le due bugie del §3b sono già lì | il grosso del lavoro | i 10 elenchi diventano **1**; un test conta i fornitori in ogni superficie e **fallisce se divergono** (contratto di parità, copiato da `provider_catalog.py:35`) |
| **P-B** | **DeepSeek: leggere `prompt_cache_hit_tokens`** | DeepSeek è **già collegato** e la cache **c'è**: semplicemente non la contiamo. Prezzo cache-hit contro miss: **$0,003 vs $0,15 / M** (flash, off-peak) — **50×** | una riga di lettura + un test | `cached_tokens` smette di essere 0 su ogni giro DeepSeek; il pannello costi cambia numero |
| **P-C** | **LM Studio come destinazione di chat** | Il 90% esiste già; dichiara capacità **osservate** che Ollama non dà; local-first; costo **zero** per l'owner | aggiungere `lmstudio` alle fonti + il percorso | un modello LM Studio parte dalla chat; `toolUse` e `context` **verificati**, non indovinati |
| **P-D** | **Z.AI / GLM diretto — DUE profili** (`zai` su `/api/paas/v4` e `zai-anthropic` su `/api/anthropic`) | L'owner usa `glm-5.3-flash` **oggi**, ma via OpenRouter. Il diretto toglie un intermediario e apre il coding plan. Hermes tiene due profili per lo stesso vendor proprio per questo | un profilo (+ uno se si fa il wire Anthropic) | costo per task risolto sullo stesso corpus, diretto contro OpenRouter |
| **P-E** | **models.dev come catalogo** | Oggi il catalogo è **solo** OpenRouter: un fornitore diretto non ha né modelli né prezzi. `api.json` dà nome, contesto, costi (`cache_read`/`cache_write` compresi), `tool_call`, `reasoning`, modalità — per 109+ fornitori. Con ETag e cache su disco | un modulo tipo `model-catalog.mjs`, stessa forma | ogni fornitore nuovo arriva **già con i suoi modelli e i suoi prezzi**, senza una riga scritta a mano |
| **P-F** | **`fallback_models` + `default_aux_model` nel record** | Senza catalogo raggiungibile oggi non proponiamo **niente**; e compressione/titoli girano sul modello grosso | campi del record | il selettore non è mai vuoto; il costo degli ausiliari scende |
| **P-G** | **I «una riga ciascuno» su wire OpenAI**: Groq · Cerebras · Mistral · Together · Fireworks · DeepInfra · Novita · Nebius · xAI (`/v1/chat/completions`) · Ollama Cloud · HuggingFace router (il `HF_TOKEN` **ce l'abbiamo già**) | Con P-A ciascuno è **una riga di configurazione**. Sono tutti Bearer + `{base}/chat/completions` | ~1 riga l'uno | numero di fornitori nel pannello, senza nuovo codice |
| **P-H** | **Rotazione chiavi (pool) + fallback fra fornitori** | Il 429 ci ha già **contaminato una campagna intera** (`il-429-non-e-un-fallimento`, 20/8: 48 righe su 66 di codex e 18 su 66 di talos erano limiti di traffico scritti come `fallito`). Hermes lo risolve con panchine tarate sul codice HTTP e `reset_at` del fornitore | medio | «giri persi per 429» → 0 su una campagna; e il banco smette di scrivere `fallito` su un 429 |
| **P-I** | **Kimi/Moonshot · MiniMax · Qwen/DashScope** | Cache **da leggere in forme diverse** (`usage.cached_tokens` in cima per Kimi; `cache_control` sul wire OpenAI per Qwen): vanno fatti **dopo** che il record ha il campo «come si legge la cache» | 1 riga + 1 lettore l'uno | cache ≠ 0 su quei fornitori |
| **P-J** | **Wire `anthropic_messages` verso terzi** (MiniMax, Z.AI, Tencent TokenPlan, CommandCode) | Apre una famiglia intera con **un** trasporto. Ma è codice nuovo, non configurazione | alto | un fornitore non-Anthropic risponde sul wire Anthropic |
| **P-K** | **Azure Foundry · Bedrock · Vertex** | Enterprise: auth complessa (SigV4, ADC, service account), nessun uso dichiarato dall'owner | alto | — |
| **P-L** | **Provider come processo esterno (ACP)** | Ci renderebbe interoperabili con i CLI altrui. Già registrato come W4-07 | alto | — |

⛔ **Nessuna di queste è autorizzata.** L'owner le promuove una alla volta, come per le P-01…P-18 del
dossier concorrenti.

---

## 5. La mappa API dei fornitori proposti

> **Legenda delle fonti.** 🌐 = documentazione primaria letta con WebFetch il **12/09/2026**, URL
> accanto. 📄 = letto **nel codice** di Hermes v0.21 (file:riga), non verificato alla fonte del
> fornitore. ❓ = non verificato, vedi §7.

### 5a. Wire OpenAI chat/completions — il tronco comune

Vale per: OpenRouter, DeepSeek, Z.AI, Groq, Cerebras, Mistral, Together, Fireworks, DeepInfra,
Novita, Nebius, Ollama, LM Studio, llama.cpp, HuggingFace router, Ollama Cloud.

- **Endpoint**: `POST {base_url}/chat/completions` · **Auth**: `Authorization: Bearer <chiave>`
- **Corpo**: `{model, messages[], tools[], tool_choice, stream, temperature, top_p, max_tokens|max_completion_tokens, stop}`
- **Tool calling**: `tools[].type="function"` con `function.parameters` = JSON Schema;
  la risposta porta `choices[].message.tool_calls[]` con **`function.arguments` come stringa**;
  il risultato torna come messaggio `role:"tool"` con `tool_call_id`.
  🌐 riferimento canonico: `https://platform.openai.com/docs/api-reference/chat/create`
  (citato da Hermes stesso in `adding-providers.md` come «the canonical reference for the shape»).
- **Streaming**: SSE, righe `data: {…}` con `choices[].delta`, chiusura `data: [DONE]`.
- **Usage**: `usage.{prompt_tokens, completion_tokens, total_tokens}`,
  `prompt_tokens_details.cached_tokens`, `completion_tokens_details.reasoning_tokens`.
- **Errori**: 401 chiave, 402 credito, 403 throttle di edge **o** rifiuto, 429 rate limit
  (`Retry-After` quando c'è), 5xx. 📄 Hermes distingue 403-throttle da 403-rifiuto con panchine
  diverse (`credential_pool.py:184-190`).

### 5b. Z.AI / GLM — due porte per lo stesso modello

| | OpenAI-compatibile | Anthropic-compatibile |
|---|---|---|
| **Base URL** | `https://api.z.ai/api/paas/v4` 🌐 | `https://api.z.ai/api/anthropic` 🌐 |
| **Endpoint** | `POST …/v4/chat/completions` 🌐 | `POST …/anthropic/v1/messages` (wire Anthropic) |
| **Auth** | `Authorization: Bearer <chiave>` 🌐 | `ANTHROPIC_AUTH_TOKEN` 🌐 |
| **Modelli** | `glm-4.6`, `glm-5.2`, `glm-5`, `glm-4-9b` (🌐 `glm-4.6` · 📄 gli altri da `zai/__init__.py:155-159`) | mapping ufficiale: opus→`GLM-4.7`, sonnet→`GLM-4.7`, haiku→`GLM-4.5-Air` 🌐 |
| **Tool calling** | sì, dichiarato 🌐 | come Anthropic |
| **Streaming** | sì 🌐 | SSE Anthropic |
| **Reasoning** | 📄 `extra_body.thinking={"type":"enabled"\|"disabled"}`; per GLM-5.2/5.3 **`reasoning_effort` di primo livello con due soli livelli: `high` e `max`** (`zai/__init__.py:20-24, 140-144`; «verificato dal vivo 2026-08-14 sull'endpoint coding plan») | ❓ |
| **Cache** | ❓ la pagina 🌐 non nomina il prompt caching. 📄 Hermes classifica Zhipu GLM fra i gateway che **implementano il contratto `cache_control` di Anthropic** sul wire nativo (`agent_runtime_helpers.py:2388-2390`) | come Anthropic (`cache_control`) |
| **Env** | `GLM_API_KEY` · `ZAI_API_KEY` · `Z_AI_API_KEY` 📄 | idem |

🌐 `https://docs.z.ai/guides/llm/glm-4.6` e `https://docs.z.ai/scenario-example/develop-tools/claude`,
letti 12/09/2026.

### 5c. DeepSeek — la cache che già paghiamo e non contiamo

- **Base**: `https://api.deepseek.com/v1` (noi usiamo `https://api.deepseek.com`, e il percorso
  `/chat/completions` ci arriva senza `/v1` — 📄 Hermes usa `/v1`; ❓ **da verificare quale delle due
  forme risponde**, vedi §7).
- **Auth**: Bearer.
- **Cache — i due campi** 🌐 `https://api-docs.deepseek.com/guides/kv_cache` (letto 12/09/2026):
  - `prompt_cache_hit_tokens` — «the number of tokens in the input of this request that resulted in
    a cache hit»;
  - `prompt_cache_miss_tokens` — quelli che non hanno fatto hit.
  - ⛔ `prompt_tokens = hit + miss`: sommarli ai `prompt_tokens` li conterebbe **due volte**.
    📄 Hermes lo tratta come fonte **alternativa** di `cache_read_tokens`, non additiva
    (`usage_pricing.py:1378-1387`), e sottrae poi dal totale.
- **Prezzi** 🌐 `https://api-docs.deepseek.com/quick_start/pricing` (letto 12/09/2026), USD / 1M token,
  **off-peak / peak**:

  | modello | cache hit | cache miss | output |
  |---|---|---|---|
  | `deepseek-flash` | **$0,003 / $0,006** | $0,15 / $0,30 | $0,60 / $1,20 |
  | `deepseek-v4-pro` | **$0,022 / $0,044** | $0,66 / $1,32 | $1,98 / $3,96 |

  «Peak hours are 01:00 - 04:00 and 06:00 - 10:00 UTC, Monday through Friday», e l'off-peak è metà
  del peak. ⛔ **Il rapporto hit/miss è 50×**: non leggere quel campo non è un difetto cosmetico
  del pannello costi, è **non sapere quanto stiamo già risparmiando** (o non risparmiando).
  ⛔ Nota: i nomi `deepseek-chat` e `deepseek-reasoner` **non compaiono più** nella pagina prezzi
  del 12/09/2026; i modelli correnti sono `deepseek-flash` e `deepseek-v4-pro`.
- **Reasoning** 📄: `extra_body.thinking={"type":"enabled"|"disabled"}` + `reasoning_effort` di primo
  livello, vocabolario `low/medium/high/max` con `xhigh` che arrotonda a `max`
  (`deepseek/__init__.py:49-97`). ⛔ Il commento avverte di una **«reasoning_content echo trap»** nei
  turni successivi se non lo si dichiara esplicitamente.

### 5d. OpenRouter — la cache per fornitore a monte

🌐 `https://openrouter.ai/docs/features/prompt-caching`, letto 12/09/2026.

| Fornitore a monte | Come si chiede | Prezzo della lettura | Prezzo della scrittura |
|---|---|---|---|
| **OpenAI** | automatica; opzionale `prompt_cache_breakpoint` sui blocchi | **0,25× o 0,50×** dell'input | — |
| **Anthropic** | **`cache_control` esplicito** — alla radice della richiesta (avanzamento automatico) o sui singoli blocchi | 0,1× (vedi 5e) | **1,25×** (5 min) / **2×** (1 ora) |
| **DeepSeek** | automatica | **0,1×** | — |
| **Grok** | automatica | 0,25× | — |
| **Groq** | automatica | 0,5× | — |
| **Moonshot** | automatica | ❓ | — |
| **Gemini 2.5** | implicita automatica; `cache_control` esplicito per blocchi grandi | **0,25×**, nessuna penale di scrittura | — |
| **Alibaba Qwen** | **esplicito** `cache_control: {"type":"ephemeral"}` | 0,1× | **1,25×** |

**Campi di consumo** 🌐: dentro `prompt_tokens_details` → `cached_tokens` (letti) e
`cache_write_tokens` (scritti); in più **`cache_discount`** = il risparmio in denaro di quella
generazione. ⛔ **`cache_discount` non lo leggiamo**: è il numero che il pannello costi dovrebbe
mostrare, già calcolato dal fornitore.

📄 Altre cose che Hermes manda a OpenRouter e noi no (`openrouter/__init__.py:115-180`):
`extra_body.session_id` come **chiave di sticky routing** («è usata direttamente come routing key
invece di hashare i messaggi iniziali, e attiva la stickiness alla **prima** richiesta riuscita invece
che dopo il primo cache hit»); `extra_body.provider` con le preferenze di fornitore;
`extra_body.reasoning` con la config intera; e l'header **`x-grok-conv-id`** per tenere la cache di
Grok pinnata sullo stesso backend fra i turni.

⛔ **Questo spiega una nostra misura aperta**: `research/fetch-cache.mjs:7` registra
**484.171 token in ingresso con `cached_tokens: 0`**, e `session-registry.mjs:890` che **5 sessioni
hanno `cached_tokens` a ZERO**. La sticky key mancante è un candidato preciso, misurabile e non
ancora provato (§7).

### 5e. Anthropic Messages — il wire da aprire ai terzi

🌐 `https://platform.claude.com/docs/en/build-with-claude/prompt-caching`, letto 12/09/2026.

- **Usage**: `usage.cache_creation_input_tokens` (scritti), `usage.cache_read_input_tokens` (letti),
  e `usage.input_tokens` = **solo ciò che sta dopo l'ultimo breakpoint**.
  Formula dichiarata: `total_input = cache_read + cache_creation + input`.
  ⛔ È **l'opposto** del wire OpenAI, dove il totale **include** i cached: chi somma con la formula
  sbagliata sbaglia del doppio.
- **Dichiarazione**: `"cache_control": {"type": "ephemeral"}` (TTL 5 min) oppure
  `{"type":"ephemeral","ttl":"1h"}`.
- **Moltiplicatori**: scrittura **1,25×** (5 min) / **2×** (1 ora); lettura **0,1×**
  (eccezione dichiarata: Fable 5.1 e Mythos 5.1 a 0,025×).
- **Lunghezza minima del prefisso cacheabile**, per modello: **512** token (Fable 5.1, Mythos 5.1,
  Opus 5, Fable 5, Mythos 5) · **1.024** (Opus 4.8, Sonnet 5, Sonnet 4.6, 4.5) · **2.048** (Mythos
  Preview, Opus 4.7, Haiku 3.5) · **4.096** (Opus 4.6, 4.5, Haiku 4.5).
  ⛔ **Sotto la soglia non si cachea e NON arriva nessun errore**: si verifica solo guardando i due
  campi di usage. È esattamente la forma di guasto silenzioso contro cui abbiamo una regola.

### 5f. Gemini

- **Base** `https://generativelanguage.googleapis.com/v1beta`, endpoint `:generateContent` /
  `:streamGenerateContent`, auth `x-goog-api-key` (noi usiamo `?key=` per la sonda e
  `x-goog-api-key` per il catalogo — `provider-probe.mjs:111,159`).
- **Cache**: 🌐 `https://ai.google.dev/gemini-api/docs/caching` (letto 12/09/2026) documenta il campo
  come **`usage.total_cached_tokens`** («Python and JavaScript») per la cache implicita.
  📄 Hermes legge invece `usageMetadata.cachedContentTokenCount` sul wire REST
  (`gemini_native_adapter.py:804, 981`). ⛔ **Sono due nomi per lo stesso numero, a due livelli
  diversi (SDK vs REST)**: chi ne legge uno solo trova 0. Noi leggiamo quello che ci passa l'AI SDK
  (`inputTokenDetails.cacheReadTokens`, `native-provider-adapter.mjs:44`) — ❓ **non verificato** che
  l'adattatore fissato nel lock mappi `cachedContentTokenCount`.

### 5g. OpenAI Responses (`codex_responses`)

- **Endpoint** `POST {base}/responses`; noi ci arriviamo già via `client.responses(model)`
  (`native-provider-adapter.mjs:74`) con `providerOptions.openai = {store:false, include:['reasoning.encrypted_content']}`.
- **Usage**: `input_tokens`, `output_tokens`, `input_tokens_details.cached_tokens`,
  `input_tokens_details.cache_write_tokens` (📄 «il campo documentato da OpenAI per le scritture
  esplicite di GPT-5.6+ è `cache_write_tokens`, fatturate a 1,25×; `cache_creation_tokens` resta
  come fallback per endpoint Responses-compatibili più vecchi» — `usage_pricing.py:1338-1346`),
  `output_tokens_details.reasoning_tokens`.
- 📄 `prompt_cache_key` è **opt-in** nel profilo (`supports_prompt_cache_key`) perché «molti endpoint
  OpenAI-compatibili **rifiutano** i campi di primo livello sconosciuti invece di ignorarli»
  (`providers/base.py:62-66`). ⛔ È una trappola che vale anche per noi se un giorno lo mandiamo
  a tutti.
- 📄 Codex e Meta auto-inviano `prompt_cache_retention: 24h`; `api.meta.ai` arriva a
  **93-99% di cache hit solo su `/v1/responses`** (`adding-providers.md`).

### 5h. models.dev — il catalogo, non un fornitore

🌐 `https://github.com/sst/models.dev`, letto 12/09/2026.

- **Endpoint**: `https://models.dev/api.json` (completo) · `https://models.dev/models.json`
  (metadati modello indipendenti dal fornitore) · `https://models.dev/catalog.json` (endpoint +
  metadati) · `https://models.dev/logos/{provider}.svg`.
- **Schema fornitore**: `name`, `npm` (pacchetto AI SDK), `env` (array di variabili),
  `doc` (URL); facoltativo `api` (URL OpenAI-compatibile, obbligatorio solo con
  `@ai-sdk/openai-compatible`).
- **Schema modello**: `name` · `attachment`, `reasoning`, `tool_call` (booleani) ·
  `structured_output`, `temperature` · **`cost`** (input/output per milione, più `reasoning`,
  **`cache_read`**, **`cache_write`**, `audio`) · **`limit`** (context, input, output) ·
  `modalities` (input/output) · `release_date`, `last_updated`.
- **Contributi**: file **TOML** sotto `providers/`, PR con validazione automatica dello schema.
  Repo: 6,8k stelle, 1,6k fork, 9.650 commit.
- 📄 Hermes lo chiama «4000+ modelli su 109+ provider» e lo usa come **database primario**
  (`hermes_cli/providers.py:1-19`), con gli overlay Hermes sopra per ciò che models.dev non traccia
  (trasporto, pattern di auth, flag aggregatore, env extra).
- ⭐ **Anche cline lo usa**: `provider-ids.generated.ts` è generato da `scripts/generate-models.ts`
  e contiene **198 id di fornitore** derivati da models.dev.

⛔ **Attenzione, e va scritto prima di adottarlo**: `api.json` è ~2 MB, comunitario, e i prezzi sono
dichiarati da terzi. Le regole del banco dicono che **il costo lo dice il credito del fornitore,
non il CLI** (`mai-modelli-di-punta-sempre-flash`). ⇒ models.dev va bene per **popolare il selettore
e stimare**, mai per **dichiarare una spesa**.

### 5i. Errori e 429 — la tabella che serve al record

| Codice | Significato tipico | 📄 Cosa fa Hermes |
|---|---|---|
| 401 | credenziale rifiutata | panchina **corta** (una chiave revocata non torna, ma non serve bloccare un pool) |
| 402 | credito/quota | panchina **1 ora** |
| 403 | **ambiguo**: throttle di edge **o** rifiuto | 60 s se transitorio; lungo se è un rifiuto (`credential_pool.py:184-190`) |
| 429 | rate limit | `EXHAUSTED_TTL_429_SECONDS = 3600`; **ma se è l'unica chiave**, panchina corta; `reset_at` del fornitore **vince sempre**; `_extract_retry_delay_seconds()` legge il ritardo **dal messaggio d'errore** |
| 5xx | guasto a monte | transitorio |

⛔ **Questa riga chiude un aperto del banco**: `il-429-non-e-un-fallimento` (20/8) — il banco scriveva
`fallito` su un 429, e «letto bene, **talos fa 8/8**». La cura strutturale non è ritentare: è che il
record del fornitore dichiari **come si riconosce un 429** e il chiamante lo tratti come uno stato
**diverso da un fallimento**.

---

## 6. La grammatica UNICA proposta per noi

**Principio**: un record dichiarativo per fornitore, **compatibile con ciò che c'è** — i dieci
elenchi del §3b si **derivano** da lui, non lo affiancano. Nessun `if <nome>` fuori dal record.

### 6a. Lo schema

```js
/** Un fornitore, dichiarato UNA volta. Tutto il resto si deriva da qui. */
export const PROFILO = Object.freeze({
  // ── Identità ──
  id: 'deepseek',                 // il prefisso di `fonte:modello`
  etichetta: 'DeepSeek',          // ciò che si legge a schermo
  descrizione: 'API diretta DeepSeek',
  alias: ['deepseek-chat'],       // accettati in ingresso, mai mostrati
  paginaChiavi: 'https://platform.deepseek.com/',   // dove si prende una chiave

  // ── Come gli si parla ──
  wire: 'openai-chat',            // openai-chat | openai-responses | anthropic-messages | nativo-sdk | locale
  baseUrl: 'https://api.deepseek.com/v1',
  percorso: '/chat/completions',  // derivato dal wire; qui solo se il fornitore devia (Ollama: /v1/...)
  indirizzoModificabile: true,    // → oggi `supportsEndpoint`

  // ── Credenziale ──
  auth: 'bearer',                 // bearer | x-api-key | query | header | nessuna | oauth-pkce | processo
  envChiave: ['DEEPSEEK_API_KEY'],
  envIndirizzo: [],
  chiaveObbligatoria: true,
  oauth: null,                    // { tipo:'pkce', autorizza, scambio, etichetta } — oggi solo OpenRouter

  // ── Catalogo ──
  catalogo: { percorso: '/models', forma: 'openai-data', conta: (c) => c?.data?.length },
  modelliDiRipiego: ['deepseek-v4-pro', 'deepseek-flash'],
  modelloAusiliario: 'deepseek-flash',   // compressione, titoli, visione

  // ── ⛔ La colonna che oggi non esiste: COME SI LEGGE LA CACHE ──
  cache: {
    modo: 'automatica',                  // automatica | cache_control | prompt_cache_key | nessuna
    letti: ['prompt_cache_hit_tokens', 'prompt_tokens_details.cached_tokens'],
    scritti: [],
    // ⛔ true = `prompt_tokens` INCLUDE già i cached (wire OpenAI);
    //    false = vanno sommati (wire Anthropic). Sbagliare qui raddoppia il conto.
    inclusiNelTotale: true,
    scontoDichiarato: null,              // OpenRouter: 'cache_discount'
  },

  // ── Capacità dichiarate, con TRE stati (mai un booleano solo) ──
  capacita: {
    streaming: 'osservato',              // osservato | dichiarato | ignoto
    toolCalling: 'dichiarato',
    visione: 'ignoto',
    visioneNeiRisultatiAttrezzo: 'ignoto',   // ⛔ Xiaomi MiMo la rifiuta: 400 "text is not set"
  },

  // ── Stranezze di richiesta ──
  intestazioniExtra: {},          // proxy aziendali; ⛔ i valori sono segreti, mai loggati
  corpoExtra: {},                 // extra_body per fornitore
  temperaturaFissa: null,         // OMETTI = non mandarla (Kimi)
  tettoUscita: null,
  reasoning: { livelli: ['low','medium','high','max'], dove: 'primo-livello' },  // null = ignoto

  // ── Salute e diagnosi ──
  sondaSalute: true,              // ⛔ false dove /models fa 401 con chiave buona (Xiaomi)
  timeoutPredefinitoSecondi: 60,
});
```

### 6b. Che cosa si deriva, e che cosa si cancella

| Elenco di oggi | Diventa |
|---|---|
| `PROVIDER_IDS` / `PROVIDER_DEFINITIONS` | `Object.keys(PROFILI)` |
| `SONDE_PROVIDER` | `PROFILI[id].catalogo` + `.auth` |
| allowlist di `elencaModelli` | `PROFILI[id].catalogo.forma !== null` |
| `FONTI_MODELLO` / `COMPATIBILI_OPENAI` / `NATIVI` | `PROFILI[id].wire` |
| regex `FONTI_AMMESSE_MODELLO` | **costruita** da `Object.keys(PROFILI)` |
| `PROVIDERS` locali | i profili con `wire:'locale'` |
| factory native | `PROFILI[id].wire === 'nativo-sdk'` |
| `defaults` dei contatori | `PROFILI[id].baseUrl` |
| regex di rotta `(openai\|anthropic\|gemini)` (×2) | costruita dai profili con catalogo diretto |
| `<option>` del `<select>` scritti a mano | generati |

### 6c. Come si prova un fornitore — `provider-probe.mjs` c'è già

La sonda esistente è **già** la forma giusta: una **tabella e non un `if`**
(`provider-probe.mjs:38-42`, e il commento lo dice), tre schemi di auth riconosciuti, e — la parte
che conta — **tre stati veri**: `non-provabile` non è `non-autorizzato`, perché «confonderlo con un
rifiuto manderebbe la persona a cercare una chiave sbagliata invece di inserirne una»
(`provider-probe.mjs:90-98`).

⇒ La sonda **non si riscrive**: le si toglie la sua tabella e le si dà `PROFILI[id].catalogo` +
`.auth` + `.sondaSalute`. E `ESITI_SONDA` guadagna un valore in più: **`non-sondabile`** — il
fornitore che dichiara `sondaSalute: false` perché il suo `/models` fa 401 anche con una chiave
valida (il caso Xiaomi). ⛔ Senza quello stato, la sonda **accuserebbe una chiave buona**, che è
esattamente il difetto contro cui la sonda è nata.

### 6d. I tre cancelli che rendono la grammatica una cura, non una speranza

1. **Contratto di parità, come `provider_catalog.py:35`**: un test conta i fornitori in **ogni**
   superficie (portachiavi, sonda, destinazioni, regex del modello, selettore HTML, rotte HTTP) e
   **fallisce se i sei numeri divergono**. ⛔ Senza questo test la grammatica unica ridiventa dieci
   elenchi al primo fornitore aggiunto di fretta.
2. **Prova al verso contrario** (regola 5-bis): per ogni profilo, un caso che **deve** essere
   respinto — chiave assente ⇒ `non-provabile`; `sondaSalute:false` ⇒ **nessuna** chiamata;
   `wire` sconosciuto ⇒ errore, non ripiego silenzioso su OpenRouter.
3. **La cache si prova con un numero, non con un flag**: per ogni fornitore con `cache.letti`, un
   giro reale deve produrre `cached_tokens > 0` almeno una volta, e il test **registra il valore**.
   ⛔ È la lezione del 22/8 messa in un cancello: «non dichiarato» non è «nessuno»
   (`session-registry.mjs:930` lo dice già a parole — qui diventa eseguibile).

### 6e. Per confronto — come lo fanno gli altri (una riga ciascuno, dal codice clonato)

| Harness | Grammatica | Quanti |
|---|---|---|
| **Hermes v0.21** | `ProviderProfile` (dataclass, 20 campi + 10 hook) come plugin auto-scoperti in `plugins/model-providers/<nome>/` + overlay + models.dev | **48** profili da **39** plugin; 39 voci canoniche + auto-estensione; 42 overlay; 89 alias; models.dev sotto (109+) |
| **Codex** | `ModelProviderInfo` in TOML/serde: `base_url`, `env_key`, `auth`, `aws`, **`wire_api`**, `query_params`, `http_headers`, `env_http_headers`, `request_max_retries`, `stream_max_retries`, `stream_idle_timeout_ms`, `websocket_connect_timeout_ms`, `requires_openai_auth`, `supports_websockets`, `supports_standalone_web_search` (`codex-rs/model-provider-info/src/lib.rs:96-151`) | schema unico, i fornitori li dichiara l'utente in `config.toml` |
| **opencode** | un **plugin TypeScript per fornitore** in `packages/core/src/plugin/provider/` + `ModelsDev` come catalogo (`packages/core/src/models-dev.ts`) | **32** plugin di fornitore + models.dev |
| **cline** | registro a due strati: `builtins.ts` scritto a mano (prodotti e locali) + **`provider-ids.generated.ts` generato da models.dev**, e 11 «vendor» che implementano il wire (`sdk/packages/llms/src/providers/`) | **198** id generati + 11 vendor |
| **goose** | `ProviderMetadata` + `ConfigKey` in Rust, registrati uno a uno in `providers/init.rs` con `registry.register::<T>()` / `register_with_inventory` | **33** registrazioni |
| **Claude Code** | non è open source nel clone (solo `CHANGELOG`, `plugins`, `scripts`): i fornitori si configurano per **variabile d'ambiente** (`ANTHROPIC_BASE_URL`, Bedrock, Vertex) | ❓ non misurabile dal clone |
| **TALOS oggi** | **nessuna**: 7 nomi riscritti in 10-12 elenchi | **7** (6 remoti + locale) |

---

## 7. Cosa NON ho verificato

**Sul codice**

1. **Non ho eseguito nulla** — né Hermes né TALOS. Tutti i numeri sono letti dai sorgenti a
   `365e2835` (Hermes) e `dda6a427` (noi). Nessun giro col modello, nessuna porta 4174 toccata.
2. **Il conteggio «48 profili»** viene da `grep -c '^register_provider('` sui 39 plugin: conta le
   chiamate **di primo livello**. Una registrazione dentro una funzione o dietro un `if` non
   sarebbe contata. Non ho importato il registro per contarlo a runtime.
3. **`CANONICAL_PROVIDERS` auto-esteso**: 39 voci sono scritte a mano, il resto arriva
   dall'auto-estensione (`models.py:1353-1371`), che **esclude** gli `auth_type` bespoke. Il numero
   finale dipende dall'ambiente e **non l'ho calcolato**.
4. **models.dev «109+ provider, 4000+ modelli»** è ciò che il **docstring di Hermes** dichiara
   (`agent/models_dev.py:3`). Il sito, letto oggi, non ripete quei numeri e io **non ho scaricato
   `api.json`** per contarli.
5. **`_COMMANDCODE_BASE`, `_base_url()` di meta-ai e router** sono costanti calcolate che **non ho
   risolto**: nella tabella ho messo l'host che appare negli overlay o nei commenti.
6. **Claude Code**: il clone non contiene il sorgente. La sua riga nel §6e è basata su CHANGELOG e
   documentazione, non su codice.

**Sulle nostre cose**

7. **DeepSeek, il percorso**: noi salviamo `https://api.deepseek.com` (senza `/v1`) e concateniamo
   `/chat/completions`; Hermes usa `https://api.deepseek.com/v1`. **Non ho provato quale delle due
   risponde.** Se la nostra fosse sbagliata, DeepSeek non sarebbe mai partito — e nessuno se ne
   sarebbe accorto, perché non c'è un giro registrato.
8. **Gemini e la cache**: non ho verificato che l'adattatore `@ai-sdk/google` fissato nel nostro lock
   mappi `cachedContentTokenCount` (REST) o `total_cached_tokens` (SDK) in
   `inputTokenDetails.cacheReadTokens`. Se non lo facesse, anche Gemini riporterebbe 0.
9. **La sticky key di OpenRouter** come causa dei `cached_tokens: 0` misurati
   (`research/fetch-cache.mjs:7`, `session-registry.mjs:890`) è un **candidato**, non una diagnosi:
   servirebbe un A/B nello stesso momento con e senza `extra_body.session_id`.
10. **`cache_discount`**: verificato che OpenRouter lo dichiara; **non** verificato che arrivi nelle
    nostre risposte (non lo leggiamo, quindi non c'è traccia nei log).
11. **LM Studio**: ho verificato che `lmstudio` non è in `FONTI_MODELLO`; **non** ho provato che
    aggiungendolo funzionerebbe (il suo `/v1/chat/completions` non l'ho chiamato).

**Sulle fonti esterne**

12. **`WebSearch` era esaurito (200/200)** prima che cominciassi: tutto ciò che è marcato 🌐 viene da
    **WebFetch su documentazione primaria**, letto il **12/09/2026**; tutto il resto è marcato 📄
    (codice di Hermes) o ❓.
13. **Prezzi verificati alla fonte**: solo DeepSeek 🌐 e i moltiplicatori di Anthropic 🌐 e OpenRouter 🌐.
    Per **Z.AI, Groq, Cerebras, Mistral, Together, Fireworks, DeepInfra, Novita, Nebius, xAI, Kimi,
    MiniMax** non ho letto nessun listino: le loro righe nella proposta P-G/P-I sono giustificate dal
    **wire**, non dal prezzo.
14. **Z.AI e il prompt caching**: la pagina GLM-4.6 letta oggi **non lo nomina**. L'affermazione che
    Zhipu implementi il contratto `cache_control` di Anthropic viene **solo** dal codice di Hermes.
15. **Kimi/Moonshot `usage.cached_tokens` di primo livello**: la pagina di context caching letta oggi
    **non dichiara il nome del campo**. Il nome viene **solo** dal codice di Hermes
    (`usage_pricing.py:1388-1396`, issue #65722).
16. **Le issue numerate di Hermes** (#25970, #61871, #65722, #70820, #79017, #96811…) sono citate nei
    commenti del loro codice: **non le ho aperte**, non sono pubblicamente verificabili da qui.
17. **Il mapping modelli di Z.AI per Claude Code** (opus→GLM-4.7 ecc.) è quello della loro pagina di
    esempio: **non** è un contratto stabile, è una configurazione consigliata.

---

## Riepilogo veloce

**Cosa devi fare tu** — decidere, riga per riga, quali delle dodici proposte del §4 partono, e in
quale ordine. Il mio consiglio, se ne scegli solo tre: **P-A** (il record unico), **P-B** (la cache
DeepSeek, una riga) e **P-C** (LM Studio in chat, il 90% è già scritto).

**Cosa faccio io** — niente, finché non dici quale. Nessuna riga di codice è stata toccata.

**Cosa rimane** — le diciassette voci del §7, tre delle quali sono difetti veri già visibili e non
ancora aperti come righe: `prompt_cache_hit_tokens` mai letto su DeepSeek, `lmstudio` scoperto ma non
instradabile, e l'etichetta `execution: 'in preparazione'` di DeepSeek che contraddice il router.
Più il dubbio del punto 7: **non sappiamo se DeepSeek sia mai partito.**
