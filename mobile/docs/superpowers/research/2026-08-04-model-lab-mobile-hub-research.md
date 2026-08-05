# Model Lab mobile hub — dossier di ricerca upstream e locale

Data della ricerca: 2026-08-04
Ambito: TALOS mobile; nessuna conclusione autorizza modifiche desktop
Specifica: `../specs/2026-08-04-model-lab-mobile-hub-design.md`

## 1. Domande che la ricerca doveva chiudere

1. Tre aree autonome devono essere tab o pagine?
2. Qual è l'autorità corretta per peso GGUF, download, chat, licenza e capienza?
3. Come si rende il Model Lab realmente governato dal Theme Engine?
4. Quale OAuth provider è implementabile onestamente in un'app Android senza
   backend?
5. Quali pattern dei concorrenti vanno adottati, superati o rifiutati?
6. Quale prova rende una fase veramente implementata?

La ricerca è stata preceduta da ispezione del codice, dei test e del WIP locale.
Le decisioni sotto sono quindi adattamenti al confine TALOS, non un collage di
pattern esterni.

## 2. Stato locale misurato

### 2.1 Revisione e WIP

Alla ricognizione:

- branch: `lane/talos-mobile`;
- HEAD: `f7a88a599e48`;
- modificati dall'utente/sessione precedente:
  `browseFilters.ts`, `catalogue.ts`, `fit.ts`, `fitBadge.ts`,
  `sizeFromName.ts`;
- `.codex/` non tracciato e fuori ambito;
- nessuna modifica è stata scartata o riscritta.

Il WIP introduce il disco nel verdetto ma è incompleto. La baseline fresca è:

- `npm run typecheck`: rosso per import di `talosEstimatedBand` rimosso,
  storage nullable non gestito e firma incoerente in `browseFilters.ts`;
- test focalizzati: 61 passati, 3 falliti;
- fallimenti permanenti da trasformare in regression contract:
  30B passa erroneamente **Gira qui**, la combinazione Code+Fits include lo
  stesso 30B e un test chiama il simbolo rimosso.

Il precedente valore 597.055/600.000 byte del pacco d'avvio appartiene a una
revisione precedente e non è una misura valida del WIP corrente.

### 2.2 Dispositivo fisico

Interrogato con l'ADB dell'SDK locale:

| Campo | Valore |
|---|---|
| seriale | `3B1F6DE8WTX78PET` |
| prodotto/modello | OnePlus `PJZ110` |
| stato ADB | `device` |
| Android / API | 16 / 36 |
| pixel fisici | 1080×2376 |
| densità fisica / override | 640 / 480 dpi |
| viewport atteso | 360×792 CSS px, DPR 3 |

Questo è un baseline, non un lasciapassare futuro: ogni ledger deve rileggere i
dati al momento della cattura.

### 2.3 Contratto dispositivo già presente

Il plugin Android usa `StorageManager.getAllocatableBytes()` e il trasporto
nativo mantiene una riserva. `deviceCapacity.ts` conserva però `0` come misura
valida, mentre il resto del contratto usa `null` per un dato non disponibile.
La decisione è adattare il boundary TypeScript: ogni storage non finito o
non-positivo diventa `null`; il nativo resta l'autorità di allocazione al
download.

### 2.4 Theme Engine esistente

`applyDesignTokens.ts` applica 16 ruoli palette, font, `--radius` e
`--talos-density-scale`. `theme.ts` applica il vocabolario `--talos-*` della
variante. Le superfici Model Lab contengono ancora raggi, padding, colori di
fallback e durate locali: la richiesta “100% token” non è soddisfatta.

Decisione: estendere il boundary centrale con token semantici di layout derivati
da `density` e `radius`, non creare costanti private nei componenti.

## 3. Navigazione e accessibilità

Il [WAI-ARIA Authoring Practices Guide per i link](https://www.w3.org/WAI/ARIA/apg/patterns/link/)
definisce il link come widget che naviga verso una risorsa. Il
[pattern Tabs APG](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/) descrive invece
una serie di pannelli stratificati in un'unica vista. Provider, Catalogo e Locale
hanno URL, cronologia e contenuto autonomi: sono link verso pagine, non tab.

[Vue Router](https://router.vuejs.org/guide/essentials/named-routes.html) supporta
rotte nominate e parametri; il progetto ha già `parent` e
`talosMobileParentRoute()` come contratto proprietario. Decisione: adottare
`RouterLink` e rotte nominate, adattandole alla tavola TALOS. Il deep link storico
si canonicalizza con `replace` secondo la
[navigation API di Vue Router](https://router.vuejs.org/guide/essentials/navigation.html#replace-current-location).

Android raccomanda bersagli touch di almeno
[48dp](https://support.google.com/accessibility/android/answer/7101858). Il token
`--talos-touch-target` resta 3rem in ogni densità: la densità può comprimere lo
spazio visivo ma non il pavimento accessibile.

## 4. Hugging Face: contratto API misurato

### 4.1 Pin del contratto

OpenAPI ufficiale acquisita da
[`/.well-known/openapi.json`](https://huggingface.co/.well-known/openapi.json).
Il documento grezzo non ha un hash stabile: tre fetch consecutivi hanno
restituito 975.609 byte ma ETag e SHA diversi. Un confronto strutturale ha
trovato quattro soli default generati a ogni richiesta:

1. `/paths/~1api~1agentic~1provisioning~1resources/post/requestBody/content/application~1json/schema/anyOf/1/properties/configuration/properties/name/default`;
2. `/paths/~1api~1organizations~1{name}~1billing~1usage-by-inference-session/get/parameters/2/schema/default`;
3. `/paths/~1api~1organizations~1{name}~1billing~1usage-by-resource-group/get/parameters/2/schema/default`;
4. `/paths/~1api~1settings~1billing~1usage-by-inference-session/get/parameters/1/schema/default`.

Il primo è un nome repository casuale; gli altri sono timestamp correnti. Un
raw ETag/SHA è quindi un falso pin. Il pin utile sostituisce quei quattro valori
con sentinelle, ordina ricorsivamente le chiavi degli oggetti, preserva l'ordine
degli array e serializza JSON senza whitespace:

| Campo | Pin stabile |
|---|---|
| data | 2026-08-04 |
| OpenAPI / info.version | `3.1.0` / `0.0.1` |
| byte grezzi osservati | 975.609 |
| byte canonici | 975.620 |
| SHA-256 canonico, 3/3 fetch | `92e1d8823c21541a993b28d0453b868bd0e42099d1090746a97ac3b84a8489f1` |

La [documentazione ufficiale `HfApi`](https://huggingface.co/docs/huggingface_hub/en/package_reference/hf_api)
conferma che `expand` può richiedere campi come siblings e metadati, che
`downloads` copre gli ultimi 30 giorni e che `downloadsAllTime` è distinto.
Decisione: adottare i campi upstream, normalizzarli nel contratto AVM e
rinominare la UI “ultimi 30 giorni”.

### 4.2 Probe rappresentativo Q4

Repository: `unsloth/Qwen3.5-4B-GGUF`
Revision: `e87f176479d0855a907a41277aca2f8ee7a09523`

| Dato | Valore misurato |
|---|---|
| `gguf.total` | 4.205.751.296 parametri |
| `gguf.totalFileSize` | 8.424.393.632 byte |
| sibling totali / Q4 | 28 / 7 |
| `Q4_K_M` | 2.740.937.888 byte |
| SHA-256 `Q4_K_M` | `00fe7986ff5f6b463e62455821146049db6f9313603938a70800d1fb69ef11a4` |
| pipeline | `image-text-to-text` |
| tag conversational | presente |
| chat template GGUF | presente |

`gguf.totalFileSize` è oltre tre volte la variante Q4_K_M. Usarlo come
`fileBytes` della variante produce un giudizio materialmente falso. Decisione:
`siblings` seleziona la variante mobile rappresentativa; `paths-info` resta
l'autorità esatta nel dettaglio e al download.

Ordine iniziale della selezione rappresentativa, da convalidare con fixture:

```text
Q4_K_M → Q4_K_S → Q4_1 → Q4_0 → IQ4_XS → IQ4_NL → UD-Q4_K_XL
```

La lista mostra **Q4 stimato** quando non possiede byte LFS esatti. Non chiama
mai “esatto” un peso derivato dai parametri.

### 4.3 Fixture per distinguere i vincoli

Disco prima della RAM:

- `bartowski/Meta-Llama-3.1-70B-Instruct-GGUF`;
- revision `83fb6e83d0a8aada42d499259bc929d922e9a558`;
- `Meta-Llama-3.1-70B-Instruct-Q4_K_M.gguf`;
- 42.520.398.400 byte;
- SHA-256 `f775c87029be95fb41df9e2882e6e938b73121c30ffc235ac6b6b880add49aa5`.

Con circa 38 GiB liberi sul dispositivo e 1 GiB di riserva, questa fixture deve
mostrare spazio insufficiente.

RAM dopo disco:

- `bartowski/Qwen2.5-32B-Instruct-GGUF`;
- revision `2116cbb385b8ce3a4d28cf3bf1cd2039a55821a6`;
- `Qwen2.5-32B-Instruct-Q4_K_M.gguf`;
- 19.851.336.576 byte;
- SHA-256 `2e5f6daea180dbc59f65a40641e94d3973b5dbaa32b3c0acf54647fa874e519e`.

Il file entra sul disco osservato ma supera la RAM utilizzabile: il messaggio
deve parlare di memoria, non di spazio.

### 4.4 Chat, code, Q4 e licenze

La [documentazione delle model card](https://huggingface.co/docs/hub/en/model-cards)
e dei [metadata YAML](https://huggingface.co/docs/hub/en/model-cards#model-card-metadata)
fornisce tag, pipeline e license identifier, ma non una facet canonica “code”.
Decisioni:

- Chat = `conversational` oppure chat template GGUF dichiarato;
- Q4 = file/sibling, non stringa nell'ID repository;
- Code = euristica AVM dichiarata “Orientato al codice”;
- licenza = metadata dichiarato e allowlist conservativa.

Allowlist proposta e testata come contratto esatto:

```text
apache-2.0, mit, bsd, bsd-2-clause, bsd-3-clause,
isc, bsl-1.0, cc0-1.0, unlicense, zlib
```

Assente, `other`, custom, OpenRAIL e licenze Llama non passano il filtro
positivo. Il filtro non formula consulenza legale: dice solo “permissiva
dichiarata” secondo la policy TALOS versionata.

## 5. OAuth e deep link

### 5.1 Hugging Face

Metadata OIDC ufficiale acquisito da
[`/.well-known/openid-configuration`](https://huggingface.co/.well-known/openid-configuration):

| Campo | Pin |
|---|---|
| ETag | `W/"37a-dttZVZA3HSuAYFH2OCoyqXSlr3k"` |
| SHA-256 | `fc57107dcf0d8a09890016ea57bdde0ccda12227d49d014fbb48dbf270bae435` |
| authorize | `https://huggingface.co/oauth/authorize` |
| token | `https://huggingface.co/oauth/token` |
| device | `https://huggingface.co/oauth/device` |
| userinfo | `https://huggingface.co/oauth/userinfo` |
| PKCE | `S256` |

La [guida OAuth ufficiale Hugging Face](https://huggingface.co/docs/hub/en/oauth)
documenta client pubblici, Authorization Code con PKCE, Device Authorization e
scope. Si adotta direttamente il protocollo ufficiale dietro un adapter TALOS.

Per Model Lab il minimo privilegio è il solo scope `gated-repos`: serve a
leggere i gated repo pubblici già concessi all'utente. `openid`, `profile` ed
`email` acquisirebbero identità/PII che questa funzione non usa. La stessa fonte
documenta esplicitamente i public client senza secret; il metadata OIDC corrente
elenca però soltanto `client_secret_basic` e `client_secret_post` in
`token_endpoint_auth_methods_supported`. Questa incoerenza upstream rende il
token exchange con public client un gate reale, non una conclusione da mock.

[RFC 8252](https://datatracker.ietf.org/doc/html/rfc8252) richiede agli app
nativi un user-agent esterno e PKCE; [RFC 7636](https://datatracker.ietf.org/doc/html/rfc7636)
definisce il code challenge S256. [RFC 8628](https://datatracker.ietf.org/doc/html/rfc8628)
definisce il device flow ma chiarisce che non sostituisce il browser OAuth sui
dispositivi capaci. Decisione: Authorization Code + PKCE nel browser di sistema
come percorso primario; device flow solo fallback.

Capacitor documenta la ricezione dei deep link con
[`App.addListener('appUrlOpen')`](https://capacitorjs.com/docs/apis/app#addlistenerappurlopen)
e il browser di sistema con
[`@capacitor/inappbrowser`](https://capacitorjs.com/docs/apis/inappbrowser).
L'app possiede già lo scheme `ai.talos`, ma il manifest non ha ancora un intent
filter VIEW/BROWSABLE. Callback candidata:
`ai.talos://oauth/huggingface`, ristretta per scheme, host e path. La guida HF
parla di app native ma non garantisce testualmente l'accettazione dei private-use
URI nella schermata di registrazione: l'owner deve registrare e provare l'URI
prima dell'implementazione. Se HF lo rifiuta, non si allarga il manifest e non
si inventa un redirect; il ledger viene emendato verso un HTTPS App Link su un
dominio verificato oppure resta bloccato.

### 5.2 Matrice provider

| Provider | Fonte ufficiale | Decisione per fase 5 |
|---|---|---|
| Hugging Face | [OAuth](https://huggingface.co/docs/hub/en/oauth) | ADOPT: PKCE pubblico reale |
| OpenRouter | [OAuth PKCE](https://openrouter.ai/docs/use-cases/oauth-pkce) | REJECT in questa tranche: callback documentata HTTPS o localhost, non custom scheme Android |
| Gemini | [OAuth guide](https://ai.google.dev/gemini-api/docs/oauth) | DEFER: setup Google Cloud/Android e identità prodotto separati |
| OpenAI | [API authentication](https://platform.openai.com/docs/api-reference/authentication) | REJECT: API key, nessun OAuth end-user provider documentato per questo caso |
| Anthropic | [API overview](https://docs.anthropic.com/en/api/overview) | REJECT: API key/WIF non equivalgono a sign-in consumer diretto |
| DeepSeek | [API docs](https://api-docs.deepseek.com/) | REJECT: bearer API key |
| Ollama | [API authentication](https://docs.ollama.com/api/authentication) | N/A locale; cloud usa credenziali proprie, nessun flusso scelto |

Nessun provider viene “OAuthizzato” per analogia. OpenRouter potrà essere
riaperto solo con HTTPS App Link verificato o bridge backend esplicitamente
progettato.

## 6. Dipendenze locali pin

Il piano non aggiunge pacchetti. Usa le dipendenze già bloccate:

| Pacchetto | Pin |
|---|---|
| Vue | 3.5.40 |
| vue-router | 5.2.0 |
| reka-ui | 2.10.1 |
| Capacitor core / Android | 8.4.2 |
| `@capacitor/app` | 8.1.1 |
| `@capacitor/inappbrowser` | 4.0.1 |
| secure storage | 8.0.0 |
| Vite | 7.3.6 |
| Vitest | 4.1.10 |
| Playwright | 1.61.1 |
| TypeScript | 5.9.3 |

Decisione: adattare gli upstream già presenti; nessuna libreria OAuth, lista
virtuale o design-system parallelo.

## 7. Ricognizione concorrenti, con pin

La ricognizione segue `../COMPETITIVE-ONE-UP-DOCTRINE.md`. I repository sono
stati letti come riferimento; nessun codice è copiato.

### 7.1 PocketPal AI

Pin: [`a-ghorbani/pocketpal-ai@4f1ba9b`](https://github.com/a-ghorbani/pocketpal-ai/tree/4f1ba9bdb32b0b4fbb2c0b6bb8f9cbb0b21da1bc)

File ispezionati:

- [SearchView](https://github.com/a-ghorbani/pocketpal-ai/blob/4f1ba9bdb32b0b4fbb2c0b6bb8f9cbb0b21da1bc/src/screens/ModelsScreen/HFModelSearch/SearchView/SearchView.tsx);
- [ModelFileCard](https://github.com/a-ghorbani/pocketpal-ai/blob/4f1ba9bdb32b0b4fbb2c0b6bb8f9cbb0b21da1bc/src/screens/ModelsScreen/HFModelSearch/DetailsView/ModelFileCard/ModelFileCard.tsx);
- [HFTokenSheet](https://github.com/a-ghorbani/pocketpal-ai/blob/4f1ba9bdb32b0b4fbb2c0b6bb8f9cbb0b21da1bc/src/components/HFTokenSheet/HFTokenSheet.tsx);
- [HFStore](https://github.com/a-ghorbani/pocketpal-ai/blob/4f1ba9bdb32b0b4fbb2c0b6bb8f9cbb0b21da1bc/src/store/HFStore.ts).

Da adottare: split browse/detail, paginazione, stati vuoti/errore, warning file
esatti e separazione RAM/spazio. Da superare: token soltanto manuale, nessun
filtro di fit nella browse list, colore HF letterale e semantica non governata
interamente dal tema.

### 7.2 Jan

Pin: [`menloresearch/jan@ac663e6`](https://github.com/menloresearch/jan/tree/ac663e6675a81684b5509c1888bd5c1fd5d940f1)

File ispezionati:

- [remoteModelCatalog.ts](https://github.com/menloresearch/jan/blob/ac663e6675a81684b5509c1888bd5c1fd5d940f1/web-app/src/lib/remoteModelCatalog.ts);
- [ModelSetting.tsx](https://github.com/menloresearch/jan/blob/ac663e6675a81684b5509c1888bd5c1fd5d940f1/web-app/src/containers/ModelSetting.tsx).

Da adottare: normalizzazione cataloghi remoti e capacità dichiarate. Da
superare: impostazioni dense in side sheet desktop e capability inferite da ID
senza un contratto device-aware mobile.

### 7.3 Chatbox

Pin: [`Bin-Huang/chatbox@f90fc31`](https://github.com/Bin-Huang/chatbox/tree/f90fc31afd634494bdf8f074eca3e38fcf8da740)

File ispezionati:

- [GenericProviderRows.tsx](https://github.com/Bin-Huang/chatbox/blob/f90fc31afd634494bdf8f074eca3e38fcf8da740/src/renderer/components/ModelSelectorV2/GenericProviderRows.tsx);
- [providerSettings.ts](https://github.com/Bin-Huang/chatbox/blob/f90fc31afd634494bdf8f074eca3e38fcf8da740/src/renderer/stores/providerSettings.ts).

Da adottare: provider raggruppati e BYOK leggibile. Da superare: architettura
Electron desktop e assenza di un verdetto locale telefonico nella stessa
superficie.

### 7.4 Classificazione one-up

| Livello | Risultato richiesto |
|---|---|
| L1 | browse/detail, provider raggruppati, warning file esatti |
| L2 | un solo verdetto device-aware già nella lista, RAM e disco distinti, filtri veri, UI 100% Theme Engine |
| L3 | nello stesso prodotto mobile senza backend: BYOK cloud, modelli rivali on-device, fit preventivo e agent tools reali |

Il redesign visuale da solo è L2. L3 appartiene all'intersezione prodotto già
esistente di TALOS e non autorizza claim prestazionali senza benchmark.

## 8. Decisioni upstream finali

| Tema | Decisione | Confine AVM |
|---|---|---|
| navigazione | ADOPT RouterLink/route semantics | route table e parent TALOS |
| accessibilità | ADOPT APG + 48dp | token e test TALOS |
| metadati HF | ADAPT API ufficiale | normalizzatore e fixture pin AVM |
| peso variante | REJECT `totalFileSize` come variante | selector Q4 + paths-info |
| OAuth HF | ADAPT protocollo standard | adapter, secure store, policy scopes |
| OAuth altri provider | REJECT/DEFER motivato | chiavi esistenti restano |
| lista catalogo | ADAPT progressive rendering | nessuna nuova dipendenza |
| tema | ADAPT motore esistente | nessun CSS system locale |
| prova di fase | CUSTOM necessario | manifest screenshot fisico tracciato |

## 9. Gate di aggiornamento

Prima di modificare comportamento, l'implementatore deve riconfermare:

1. SHA canonico del contratto OpenAPI e SHA raw del metadata OIDC oppure
   registrare l'eventuale drift nel ledger; non usare l'ETag OpenAPI volatile;
2. revision e byte delle tre fixture HF;
3. versione installata delle dipendenze pin;
4. presenza del dispositivo e misure ADB;
5. assenza di una nuova API provider che cambi la matrice OAuth.

Un drift non autorizza un aggiustamento silenzioso: il ledger viene emendato con
decisione adopt/adapt/reject prima del codice.

## 10. Emendamento: allegati nel contratto OpenAI Responses

Durante il corpus regressivo della fase 2, il payload E2E ha dimostrato che il
ramo `/v1/responses` perdeva `turn.parts`. Verifica primaria del 2026-08-04:

- la [quickstart ufficiale OpenAI](https://platform.openai.com/docs/quickstart/make-your-first-api-request)
  mostra un input multimodale come messaggio `role: "user"` con `content`
  composto da `{ type: "input_text", text }` e
  `{ type: "input_image", image_url }`;
- il [riferimento ufficiale Responses](https://platform.openai.com/docs/api-reference/responses-streaming/response/output_item?lang=node.js)
  specifica `input_image`, `image_url` come stringa URL/data-URL e il livello
  `detail` facoltativo.

Decisione upstream: **ADAPT** il wire ufficiale dietro
`openAiCompatibleAdapter.ts`. I documenti già estratti localmente restano testo
non fidato in un blocco `input_text`; le immagini autorizzate diventano
`input_image` con data URL. I metadati privati AVM (`attachmentId`, grant,
`sha256`, URI Vault) non attraversano il boundary. Nessun nuovo pacchetto e
nessun upload OpenAI Files: la politica locale e il consenso già esistenti
restano l'autorità.

## 11. Emendamento: stacking dei menu teletrasportati

Il viaggio E2E File ha mostrato un menu `Teleport` presente nel DOM e
focalizzabile, ma non toccabile dentro il dialogo Media. La
[CSS Positioned Layout Level 3](https://www.w3.org/TR/css-position-3/#stacking)
stabilisce che i box fixed formano stacking context e rimanda allo stack level
di `z-index` per il painting order. Il
[WAI-ARIA Menu Button Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/menu-button/)
richiede che attivare il bottone mostri il menu e vi sposti il focus: una
superficie dipinta dietro il dialogo non soddisfa l'operabilità touch, anche se
la semantica ARIA è corretta.

Decisione upstream: **ADAPT** queste regole alla scala mobile osservata, senza
nuova libreria. `TalosRowActions` usa layer 110: superiore ai dialoghi/viewer
95 e ai select 100, inferiore al lock screen 120. Il test unitario pinna questo
ordine e l'E2E verifica l'attivazione reale della voce dentro Media.

## 12. Emendamento: contrasto della status bar Android 16

La prova fisica Paper/chiaro sul tablet OPD2415, Android 16/API 36, ha mostrato
icone bianche quasi invisibili sullo sfondo chiaro dell'app. Verifica primaria
del 2026-08-04:

- la [Status Bar API ufficiale di Capacitor 8](https://capacitorjs.com/docs/apis/status-bar)
  definisce `Style.Dark` come testo chiaro per sfondi scuri e `Style.Light`
  come testo scuro per sfondi chiari; la mappatura già presente è quindi
  corretta;
- la stessa pagina stabilisce che, per app Android 16/API 36 con Capacitor 8,
  `backgroundColor` e `overlaysWebView` non hanno più effetto, mentre
  `setStyle()` resta l'API disponibile per il foreground;
- la guida Android ufficiale
  [Display content edge-to-edge in views](https://developer.android.com/develop/ui/views/layout/edge-to-edge)
  richiede di aggiornare manualmente il colore delle icone di sistema quando
  necessario affinché contrasti con il contenuto sottostante.

Pin locale verificato: `@capacitor/status-bar` **8.0.3** e
`@capacitor/core`/`@capacitor/android` **8.4.2**. Decisione upstream:
**ADAPT** il plugin ufficiale già pin dentro il Theme Store TALOS. Ogni
applicazione del tema deve inviare schema risolto e background appena applicato
al framing nativo. I setter non più operativi su API 36 restano per la
compatibilità con Android precedenti; non si aggiunge codice nativo parallelo.

## 13. Emendamento: gerarchia unica tra drawer e Impostazioni

Il 2026-08-05 la prova umana ha trovato lo stesso hub Model Lab in due punti
della navigazione primaria: voce autonoma nel drawer e link figlio nel Centro
impostazioni. Fonti primarie correnti consultate:

- [Android — Settings](https://developer.android.com/design/ui/mobile/guides/patterns/settings):
  raccomanda di collocare le preferenze frequenti vicino alla funzione cui si
  riferiscono; se il drawer esiste, `Settings` è la destinazione laterale
  ordinata dopo le altre, mentre le impostazioni non essenziali restano nella
  gerarchia secondaria;
- [Android — Layouts and navigation patterns](https://developer.android.com/design/ui/mobile/guides/layout-and-content/layout-and-nav-patterns):
  definisce drawer, bar e rail come navigazione primaria tra parent view e
  destinazioni primarie allo stesso livello;
- [Android NavigationUI](https://developer.android.com/guide/navigation/integrations/ui):
  definisce una destinazione top-level come radice o livello più alto di un
  insieme gerarchicamente collegato e usa `Up` per le destinazioni non
  top-level.

Decisione upstream: **ADAPT**, senza dipendenze. TALOS mantiene un solo ingresso
primario `Impostazioni` nel drawer e un solo link figlio
`settings-model-lab-link` nel Centro impostazioni. Il parent route resta
`settings`, quindi header e System Back continuano a riflettere la gerarchia.
Picker modello, composer, checklist e comando `/model` restano scorciatoie
contestuali, coerenti con la raccomandazione Android di porre le preferenze
frequenti vicino al compito che le richiede. Il simbolo
`TalosMobileSidebar.openModelLab` viene ritirato; nessuna route, API o package
viene aggiunto.
