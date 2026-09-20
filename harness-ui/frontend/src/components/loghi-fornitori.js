/*
 * ============================================================================
 * loghi-fornitori.js — IL MARCHIO VERO DI OGNI FORNITORE, BUNDLED (FASE 4-bis, 19/09/2026)
 * ============================================================================
 *
 * ⛔ PERCHÉ QUESTO FILE ESISTE. Owner, 19/09/2026: «tutti i provider devono avere il logo reale del
 *   provider stesso — segnalo e fallo dopo verifica screenshot». Prima di oggi il glifo della card
 *   era un simbolo GENERICO scelto da una famiglia (`simboloFornitore`: un robot per l'agente
 *   esterno, un cervello per il runtime locale, un globo per tutto il resto) — ventotto fornitori,
 *   tre disegni, nessuno dei quali diceva QUALE fornitore.
 *
 * ----------------------------------------------------------------------------
 * LA SORGENTE, E LA LICENZA IN MANO (ricerca del 19/09/2026, fonte + data)
 * ----------------------------------------------------------------------------
 * Sorgente scelta: **Simple Icons** (`simple-icons`, npm, v15.x al 19/09/2026).
 *   · La Raccolta è rilasciata **CC0-1.0** (public domain dedication)
 *     — <https://github.com/simple-icons/simple-icons/blob/develop/LICENSE.md>, letta il 19/09/2026.
 *   · ⛔ E CC0 NON CONCEDE DIRITTI DI MARCHIO: «No trademark or patent rights held by Affirmer are
 *     waived, abandoned, surrendered, licensed or otherwise affected by this document» (CC0 1.0,
 *     «Limitations and Disclaimers»). Lo dice anche il DISCLAIMER del progetto: Simple Icons «cannot
 *     be held responsible for any legal activity raised by a brand», e invita a «seek the correct
 *     permissions to use the icons relevant to your project».
 *   · ⇒ CC0 copre il DIRITTO D'AUTORE dell'icona, non il MARCHIO. Il marchio si verifica a parte,
 *     marchio per marchio — ed è quello che è stato fatto qui sotto.
 *
 * ⛔ CHE SEGNALE HO USATO PER «VERIFICATO PER MARCHIO», e perché è un segnale e non un'opinione.
 *   Simple Icons ha una **politica di rimozione su richiesta del marchio** (DISCLAIMER.md: un brand
 *   scrive a `removals@simpleicons.org` e l'icona esce dal pacchetto, «we can occasionally make
 *   exceptions for immediate removal»). ⇒ **La presenza dell'icona oggi è una misura**: significa
 *   che quel marchio, informato, non ha chiesto la rimozione. E la politica è viva, non teorica:
 *   · **OpenAI** ha chiesto e ottenuto la rimozione della sua icona **per ragioni di marchio**
 *     (confermato a valle: <https://github.com/gptme/gptme/pull/2283>, «SiOpenai was removed from
 *     @icons-pack/react-simple-icons (OpenAI requested its removal from Simple Icons for trademark
 *     reasons)», letto il 19/09/2026);
 *   · **Microsoft** (quindi **Azure**) è nella lista dei marchi che il progetto non accetta:
 *     <https://github.com/simple-icons/simple-icons/issues/13010>, «banned until Microsoft give us
 *     a clear steer», letto il 19/09/2026.
 *   ⇒ Il verso è chiaro: se una rimozione è stata chiesta, l'icona NON c'è — e infatti OpenAI,
 *     Azure e AWS non ci sono. Chi c'è, non l'ha chiesta.
 *
 * ⛔ E DOVE IL MARCHIO HA UNA POLITICA SUA, NON SI INDOVINA: si legge e si cita.
 *   · **Groq** — <https://groq.com/trademark-policy> (letta il 19/09/2026): «Except for limited
 *     "nominative fair use", you must not use Groq Marks without prior written permission», e la
 *     nominative fair use è ammessa **solo per le word mark, «no logos»**; usare il logo in «ads,
 *     packaging, UI, or signage» vuole una licenza. ⇒ **Groq NON ha il logo, e non è una
 *     dimenticanza: è la sua politica.**
 *   · **Kimi / Moonshot AI** — Branding Guide pubblica, linkata da Simple Icons stessa:
 *     <https://moonshotai.github.io/Branding-Guide> (letta il 19/09/2026).
 *   · **Hugging Face** — <https://huggingface.co/brand> (letto il 19/09/2026).
 *   · **Anthropic** — <https://www.anthropic.com/legal/trademark-guidelines> (letto il 19/09/2026):
 *     chiede approvazione preventiva per l'uso dei marchi.
 *   · **Mistral AI** — i suoi Commercial Terms hanno una «mutual prohibition on using the other
 *     party's name or marks without approval» (<https://conductatlas.com/platform/mistral-ai/
 *     mistral-ai-commercial-terms/provision/CA-P-060782/>, letto il 19/09/2026).
 *   ⛔ QUESTI DUE SONO STATI TOLTI dalla mappa, e la decisione è dell'OWNER (19/09/2026): «se non
 *     puoi usare loghi usare la lettera e basta». Erano le due righe che avevo segnalato come «da
 *     decidere» — l'approvazione che le loro condizioni chiedono non l'abbiamo, quindi il marchio
 *     non si usa e si passa al monogramma. ⇒ **I marchi nella mappa sono DIECI, i fornitori senza
 *     marchio SEDICI.** Il conto lo tiene `LOG-05`, che confronta le due liste.
 *
 * ⛔ BUNDLED, MAI DA CDN — è la premessa local-first del prodotto, e vale due volte qui: un'app che
 *   chiede un logo a un indirizzo esterno racconta a terzi quali fornitori stai configurando, e
 *   smette di funzionare senza rete. ⇒ Il `d` di ogni icona sta **in questo file**, e finisce nel
 *   bundle: **zero richieste di rete**, per costruzione e non per disciplina.
 *   Gli SVG integri e la provenienza stanno in `src/assets/loghi-fornitori/` (una cartella, non un
 *   CDN): la prova `LOG-04` rilegge quei file e li confronta col `d` di qui, così le due copie
 *   non possono divergere in silenzio.
 *
 * ⛔ MONOCROMI, COL COLORE DEL TEMA — e non è una preferenza, sono tre misure:
 *   1. è la forma NATIVA di Simple Icons (un solo `path`, nessun colore dentro il file);
 *   2. il marchio di alcuni è **nero** (#191919 Anthropic, #000000 Ollama/Kimi/LM Studio): a colori,
 *      in tema scuro, sarebbe invisibile — e la regola di casa è che una superficie si accende e si
 *      spegne COL TEMA (lezione di `banda-laboratorio.css`, 19/09/2026);
 *   3. ricolorare un marchio è esattamente ciò che alcune licenze di marchio vietano (le icone AWS
 *      Architecture sono CC BY-ND, «no derivatives»): con `currentColor` non si ricolora nulla, si
 *      usa il marchio nella forma in cui la libreria lo pubblica.
 *   ⇒ `fill: currentColor`, e il colore lo decide il tema come per ogni altro simbolo della card.
 *
 * ⛔ E IL GHIGLIO NON SI BUTTA: il fornitore senza un marchio verificabile **non resta vuoto**.
 *   L'elenco di chi non ha il marchio, con la ragione, è `SENZA_MARCHIO` qui sotto: è la parte
 *   che l'owner deve vedere.
 *
 * ----------------------------------------------------------------------------
 * IL RIPIEGO: IL MONOGRAMMA — la lettera, «come si fa di convenzione»
 * ----------------------------------------------------------------------------
 * ⛔ Owner, 19/09/2026, testuale: **«Per quelli che non hanno i loghi, usa la lettera come si fa
 *   di convenzione.»** Fino a quel momento il ripiego era un glifo di FAMIGLIA (robot / cervello /
 *   globo): diceva una cosa vera (dove il fornitore esegue) ma non diceva QUALE fornitore, e
 *   l'owner ha scelto la convenzione dell'avatar con le iniziali.
 *
 * ⛔ LA REGOLA, in tre righe — e ognuna serve:
 *   1. **Il monogramma è l'INIZIALE** della prima parola dell'etichetta che il server dichiara,
 *      segni tolti: «OpenAI» → `O`, «Groq» → `G`, «Z.AI» → `Z`, «Amazon Bedrock» → `A`.
 *   2. **Dove UNA lettera non basta, ne prende DUE** — una seconda lettera presa dall'etichetta,
 *      scelta per distinguere: «Amazon **B**edrock» → `AB`, «**N**ovita» → `NO` (le sue prime due
 *      lettere), «Z.AI (**p**orta Anthropic)» → `ZP`. La tabella `MONOGRAMMI` qui sotto le dichiara
 *      una per una, **con la collisione accanto**, che è il motivo per cui la riga esiste:
 *      `A` è di **quattro** fornitori (Anthropic, Azure AI Foundry, Amazon Bedrock, Agente
 *      esterno); `Z` è di Z.AI e della sua porta Anthropic; `N` è di Novita e di Nebius.
 *   3. ⛔ **LE LETTERE NON SI INVENTANO**: ognuna deve comparire nell'etichetta, nell'ordine in cui
 *      compare. `AF` è Azure + Foundry, `AB` è Amazon + Bedrock, `ZP` è Z.AI + la sua *porta*.
 *      Lo pretende la prova `LOG-05` leggendo le due cose — la lettera e il nome.
 *
 * ⛔ PERCHÉ UNA TABELLA E NON UN CALCOLO, e qui c'è un buco delle fonti che vale la pena dire.
 *   La convenzione dell'avatar con le iniziali è documentata ovunque — due lettere sono la forma
 *   dominante (Siemens Element: «if the record name contains two words … use the first capitalized
 *   letter of each»; Astryx/Meta: «one or two letters»; il *Web UI Component Specification*:
 *   «first letter of first name + first letter of last name») — e il problema delle iniziali
 *   UGUALI è documentato anche quello (retro-ai issue #37: «multiple team members with same first
 *   initial are indistinguishable»). ⛔ **Ma nessuna delle fonti dice cosa fare quando due
 *   monogrammi restano identici anche a due lettere**: suggeriscono due lettere, un colore
 *   calcolato dall'identità, e il nome intero nel tooltip — non una regola.
 *   (<https://github.com/siemens/element/blob/main/docs/components/status-notifications/avatar.md>
 *    · <https://astryx.atmeta.com/components/Avatar> · <https://github.com/davemjones/retro-ai/issues/37>,
 *    letti il 19/09/2026.)
 *   ⇒ Qui la collisione la risolve la TABELLA, ed è la scelta giusta per questo elenco: i
 *     fornitori sono 28 e cambiano raramente, la tabella si legge in un colpo d'occhio, e la
 *     prova `LOG-05` **conta le collisioni** — il giorno che qualcuno aggiunge un fornitore senza
 *     marchio e la sua iniziale è già presa, la prova diventa ROSSA invece di disegnare due volte
 *     la stessa lettera. Un calcolo che sbaglia in silenzio sarebbe peggio dell'assenza di calcolo.
 *
 * ⛔ E NON DEVE SEMBRARE UN MARCHIO: il monogramma è un **cerchio** col colore del tema e la
 *   lettera dentro — la forma dell'avatar, che nessuno scambia per un logo — mentre il marchio
 *   vero è la **forma disegnata** del fornitore. Stessa misura (22×22) perché la riga non balli,
 *   e `data-glifo` lo dichiara: «marchio» o «monogramma», mai l'uno per l'altro.
 *   ⛔ Il monogramma è `aria-hidden`: il nome del fornitore è già scritto sulla card, e farlo
 *     annunciare anche come due lettere staccate è il difetto che OctoAvatar documenta («so a
 *     screen reader announces the name once instead of the name followed by two stray letters»).
 */

/** La misura del disegno dentro il riquadro: 22×22 nel mockup (misurato dal DOM vivo, 19/09/2026). */
const LATO = '22px';

/*
 * LA MAPPA — fornitore dell'API → marchio.
 * `d` è il tracciato di Simple Icons, non modificato; `hex` è l'esadecimale dichiarato dalla
 * libreria (conservato per provenienza: NON si usa per dipingere, vedi la nota sui monocromi).
 * La chiave a sinistra è l'`id` che il server dichiara (`/api/v1/providers`), non un nome nostro.
 */
const MARCHI = Object.freeze({
 openrouter: { titolo: "OpenRouter", chiave: "Openrouter", hex: "94A3B8", guida: null,
  d: "M16.778 1.844v1.919q-.569-.026-1.138-.032-.708-.008-1.415.037c-1.93.126-4.023.728-6.149 2.237-2.911 2.066-2.731 1.95-4.14 2.75-.396.223-1.342.574-2.185.798-.841.225-1.753.333-1.751.333v4.229s.768.108 1.61.333c.842.224 1.789.575 2.185.799 1.41.798 1.228.683 4.14 2.75 2.126 1.509 4.22 2.11 6.148 2.236.88.058 1.716.041 2.555.005v1.918l7.222-4.168-7.222-4.17v2.176c-.86.038-1.611.065-2.278.021-1.364-.09-2.417-.357-3.979-1.465-2.244-1.593-2.866-2.027-3.68-2.508.889-.518 1.449-.906 3.822-2.59 1.56-1.109 2.614-1.377 3.978-1.466.667-.044 1.418-.017 2.278.02v2.176L24 6.014Z" },
 gemini: { titolo: "Google Gemini", chiave: "Googlegemini", hex: "8E75B2", guida: null,
  d: "M11.04 19.32Q12 21.51 12 24q0-2.49.93-4.68.96-2.19 2.58-3.81t3.81-2.55Q21.51 12 24 12q-2.49 0-4.68-.93a12.3 12.3 0 0 1-3.81-2.58 12.3 12.3 0 0 1-2.58-3.81Q12 2.49 12 0q0 2.49-.96 4.68-.93 2.19-2.55 3.81a12.3 12.3 0 0 1-3.81 2.58Q2.49 12 0 12q2.49 0 4.68.96 2.19.93 3.81 2.55t2.55 3.81" },
 deepseek: { titolo: "DeepSeek", chiave: "Deepseek", hex: "5786FE", guida: null,
  d: "M23.748 4.651c-.254-.124-.364.113-.512.233-.051.04-.094.09-.137.137-.372.397-.806.657-1.373.626-.829-.046-1.537.214-2.163.848-.133-.782-.575-1.248-1.247-1.548-.352-.155-.708-.311-.955-.65-.172-.24-.219-.509-.305-.774-.055-.16-.11-.323-.293-.35-.2-.031-.278.136-.356.276-.313.572-.434 1.202-.422 1.84.027 1.436.633 2.58 1.838 3.393.137.094.172.187.129.323-.082.28-.18.553-.266.833-.055.179-.137.218-.328.14a5.5 5.5 0 0 1-1.737-1.179c-.857-.828-1.631-1.743-2.597-2.46a12 12 0 0 0-.689-.47c-.985-.957.13-1.743.387-1.836.27-.098.094-.433-.778-.428-.872.003-1.67.295-2.687.685a3 3 0 0 1-.465.136 9.6 9.6 0 0 0-2.883-.101c-1.885.21-3.39 1.1-4.497 2.622C.082 8.776-.231 10.854.152 13.02c.403 2.284 1.568 4.175 3.36 5.653 1.857 1.533 3.997 2.284 6.438 2.14 1.482-.085 3.132-.284 4.994-1.86.47.234.962.328 1.78.398.629.058 1.235-.031 1.705-.129.735-.155.684-.836.418-.961-2.155-1.004-1.682-.595-2.112-.926 1.095-1.295 2.768-3.598 3.284-6.733.05-.346.115-.834.108-1.114-.004-.171.035-.238.23-.257a4.2 4.2 0 0 0 1.545-.475c1.397-.763 1.96-2.016 2.093-3.517.02-.23-.004-.467-.247-.588M11.58 18.168c-2.088-1.642-3.101-2.183-3.52-2.16-.39.024-.32.472-.234.763.09.288.207.487.371.74.114.167.192.416-.113.603-.673.416-1.842-.14-1.897-.168-1.361-.801-2.5-1.86-3.301-3.306-.775-1.393-1.225-2.888-1.299-4.482-.02-.385.094-.522.477-.592a4.7 4.7 0 0 1 1.53-.038c2.131.311 3.946 1.264 5.467 2.774.868.86 1.525 1.887 2.202 2.89.72 1.066 1.494 2.082 2.48 2.915.348.291.626.513.892.677-.802.09-2.14.109-3.055-.615zm1.001-6.44a.306.306 0 0 1 .415-.287.3.3 0 0 1 .113.074.3.3 0 0 1 .086.214c0 .17-.136.307-.308.307a.303.303 0 0 1-.306-.307m3.11 1.596c-.2.081-.4.151-.591.16a1.25 1.25 0 0 1-.798-.254c-.274-.23-.47-.358-.551-.758a1.7 1.7 0 0 1 .015-.588c.07-.327-.007-.537-.238-.727-.188-.156-.426-.199-.689-.199a.6.6 0 0 1-.254-.078.253.253 0 0 1-.114-.358 1 1 0 0 1 .192-.21c.356-.202.767-.136 1.146.016.352.144.618.408 1.001.782.392.451.462.576.685.915.176.264.336.536.446.848.066.194-.02.353-.25.45" },
 kimi: { titolo: "Kimi", chiave: "Kimi", hex: "000000", guida: "https://moonshotai.github.io/Branding-Guide",
  d: "M21.765.351C22.998.351 24 1.353 24 2.586S22.998 4.82 21.765 4.82h-1.974c-.15 0-.26-.12-.26-.26V2.586A2.237 2.237 0 0 1 21.765.35M9.41 13.388l8.447-8.377c.16-.16.07-.471-.14-.471h-4.55s-.1.02-.14.06l-9.099 9.029c-.14.14-.35.02-.35-.21V4.81c0-.15-.1-.27-.221-.27H.22c-.12 0-.22.12-.22.27v18.57c0 .15.1.27.22.27h3.137c.12 0 .22-.12.22-.27v-3.79c0-.08.03-.16.08-.21l2.826-2.796c.07-.07.16-.08.241-.03l7.546 5.551a8.9 8.9 0 0 0 4.018 1.493c.12.01.23-.11.23-.27V19.76c0-.14-.08-.25-.19-.26a5.8 5.8 0 0 1-2.355-.942l-6.533-4.73c-.14-.09-.15-.32-.03-.441" },
 minimax: { titolo: "MiniMax", chiave: "Minimax", hex: "E73562", guida: null,
  d: "M11.43 3.92a.86.86 0 1 0-1.718 0v14.236a1.999 1.999 0 0 1-3.997 0V9.022a.86.86 0 1 0-1.718 0v3.87a1.999 1.999 0 0 1-3.997 0V11.49a.57.57 0 0 1 1.139 0v1.404a.86.86 0 0 0 1.719 0V9.022a1.999 1.999 0 0 1 3.997 0v9.134a.86.86 0 0 0 1.719 0V3.92a1.998 1.998 0 1 1 3.996 0v11.788a.57.57 0 1 1-1.139 0zm10.572 3.105a2 2 0 0 0-1.999 1.997v7.63a.86.86 0 0 1-1.718 0V3.923a1.999 1.999 0 0 0-3.997 0v16.16a.86.86 0 0 1-1.719 0V18.08a.57.57 0 1 0-1.138 0v2a1.998 1.998 0 0 0 3.996 0V3.92a.86.86 0 0 1 1.719 0v12.73a1.999 1.999 0 0 0 3.996 0V9.023a.86.86 0 1 1 1.72 0v6.686a.57.57 0 0 0 1.138 0V9.022a2 2 0 0 0-1.998-1.997" },
 qwen: { titolo: "QWen", chiave: "Qwen", hex: "6950EF", guida: null,
  d: "M23.919 14.545 20.817 9.17l1.47-2.544a.56.56 0 0 0 0-.566l-1.633-2.83a.57.57 0 0 0-.49-.283h-6.207L12.487.402a.57.57 0 0 0-.49-.284H8.732a.56.56 0 0 0-.49.284L5.139 5.775h-2.94a.56.56 0 0 0-.49.284L.077 8.887a.56.56 0 0 0 0 .567L3.18 14.83l-1.47 2.545a.56.56 0 0 0 0 .566l1.634 2.83a.57.57 0 0 0 .49.283h6.205l1.47 2.545a.57.57 0 0 0 .49.284h3.266a.57.57 0 0 0 .49-.284l3.104-5.375h2.94a.57.57 0 0 0 .49-.283l1.634-2.828a.55.55 0 0 0-.004-.568M8.733.686l1.634 2.828-1.634 2.828H21.8L20.164 9.17H7.425L5.63 6.06Zm1.306 19.801-6.205-.002 1.634-2.83h3.265L2.201 6.344h3.267q3.182 5.517 6.367 11.032zm10.124-5.66L18.53 12l-6.532 11.315-1.634-2.83c2.129-3.673 4.25-7.351 6.373-11.028h3.592l3.102 5.374z" },
 ollama: { titolo: "Ollama", chiave: "Ollama", hex: "000000", guida: null,
  d: "M16.361 10.26a.894.894 0 0 0-.558.47l-.072.148.001.207c0 .193.004.217.059.353.076.193.152.312.291.448.24.238.51.3.872.205a.86.86 0 0 0 .517-.436.752.752 0 0 0 .08-.498c-.064-.453-.33-.782-.724-.897a1.06 1.06 0 0 0-.466 0zm-9.203.005c-.305.096-.533.32-.65.639a1.187 1.187 0 0 0-.06.52c.057.309.31.59.598.667.362.095.632.033.872-.205.14-.136.215-.255.291-.448.055-.136.059-.16.059-.353l.001-.207-.072-.148a.894.894 0 0 0-.565-.472 1.02 1.02 0 0 0-.474.007Zm4.184 2c-.131.071-.223.25-.195.383.031.143.157.288.353.407.105.063.112.072.117.136.004.038-.01.146-.029.243-.02.094-.036.194-.036.222.002.074.07.195.143.253.064.052.076.054.255.059.164.005.198.001.264-.03.169-.082.212-.234.15-.525-.052-.243-.042-.28.087-.355.137-.08.281-.219.324-.314a.365.365 0 0 0-.175-.48.394.394 0 0 0-.181-.033c-.126 0-.207.03-.355.124l-.085.053-.053-.032c-.219-.13-.259-.145-.391-.143a.396.396 0 0 0-.193.032zm.39-2.195c-.373.036-.475.05-.654.086-.291.06-.68.195-.951.328-.94.46-1.589 1.226-1.787 2.114-.04.176-.045.234-.045.53 0 .294.005.357.043.524.264 1.16 1.332 2.017 2.714 2.173.3.033 1.596.033 1.896 0 1.11-.125 2.064-.727 2.493-1.571.114-.226.169-.372.22-.602.039-.167.044-.23.044-.523 0-.297-.005-.355-.045-.531-.288-1.29-1.539-2.304-3.072-2.497a6.873 6.873 0 0 0-.855-.031zm.645.937a3.283 3.283 0 0 1 1.44.514c.223.148.537.458.671.662.166.251.26.508.303.82.02.143.01.251-.043.482-.08.345-.332.705-.672.957a3.115 3.115 0 0 1-.689.348c-.382.122-.632.144-1.525.138-.582-.006-.686-.01-.853-.042-.57-.107-1.022-.334-1.35-.68-.264-.28-.385-.535-.45-.946-.03-.192.025-.509.137-.776.136-.326.488-.73.836-.963.403-.269.934-.46 1.422-.512.187-.02.586-.02.773-.002zm-5.503-11a1.653 1.653 0 0 0-.683.298C5.617.74 5.173 1.666 4.985 2.819c-.07.436-.119 1.04-.119 1.503 0 .544.064 1.24.155 1.721.02.107.031.202.023.208a8.12 8.12 0 0 1-.187.152 5.324 5.324 0 0 0-.949 1.02 5.49 5.49 0 0 0-.94 2.339 6.625 6.625 0 0 0-.023 1.357c.091.78.325 1.438.727 2.04l.13.195-.037.064c-.269.452-.498 1.105-.605 1.732-.084.496-.095.629-.095 1.294 0 .67.009.803.088 1.266.095.555.288 1.143.503 1.534.071.128.243.393.264.407.007.003-.014.067-.046.141a7.405 7.405 0 0 0-.548 1.873c-.062.417-.071.552-.071.991 0 .56.031.832.148 1.279L3.42 24h1.478l-.05-.091c-.297-.552-.325-1.575-.068-2.597.117-.472.25-.819.498-1.296l.148-.29v-.177c0-.165-.003-.184-.057-.293a.915.915 0 0 0-.194-.25 1.74 1.74 0 0 1-.385-.543c-.424-.92-.506-2.286-.208-3.451.124-.486.329-.918.544-1.154a.787.787 0 0 0 .223-.531c0-.195-.07-.355-.224-.522a3.136 3.136 0 0 1-.817-1.729c-.14-.96.114-2.005.69-2.834.563-.814 1.353-1.336 2.237-1.475.199-.033.57-.028.776.01.226.04.367.028.512-.041.179-.085.268-.19.374-.431.093-.215.165-.333.36-.576.234-.29.46-.489.822-.729.413-.27.884-.467 1.352-.561.17-.035.25-.04.569-.04.319 0 .398.005.569.04a4.07 4.07 0 0 1 1.914.997c.117.109.398.457.488.602.034.057.095.177.132.267.105.241.195.346.374.43.14.068.286.082.503.045.343-.058.607-.053.943.016 1.144.23 2.14 1.173 2.581 2.437.385 1.108.276 2.267-.296 3.153-.097.15-.193.27-.333.419-.301.322-.301.722-.001 1.053.493.539.801 1.866.708 3.036-.062.772-.26 1.463-.533 1.854a2.096 2.096 0 0 1-.224.258.916.916 0 0 0-.194.25c-.054.109-.057.128-.057.293v.178l.148.29c.248.476.38.823.498 1.295.253 1.008.231 2.01-.059 2.581a.845.845 0 0 0-.044.098c0 .006.329.009.732.009h.73l.02-.074.036-.134c.019-.076.057-.3.088-.516.029-.217.029-1.016 0-1.258-.11-.875-.295-1.57-.597-2.226-.032-.074-.053-.138-.046-.141.008-.005.057-.074.108-.152.376-.569.607-1.284.724-2.228.031-.26.031-1.378 0-1.628-.083-.645-.182-1.082-.348-1.525a6.083 6.083 0 0 0-.329-.7l-.038-.064.131-.194c.402-.604.636-1.262.727-2.04a6.625 6.625 0 0 0-.024-1.358 5.512 5.512 0 0 0-.939-2.339 5.325 5.325 0 0 0-.95-1.02 8.097 8.097 0 0 1-.186-.152.692.692 0 0 1 .023-.208c.208-1.087.201-2.443-.017-3.503-.19-.924-.535-1.658-.98-2.082-.354-.338-.716-.482-1.15-.455-.996.059-1.8 1.205-2.116 3.01a6.805 6.805 0 0 0-.097.726c0 .036-.007.066-.015.066a.96.96 0 0 1-.149-.078A4.857 4.857 0 0 0 12 3.03c-.832 0-1.687.243-2.456.698a.958.958 0 0 1-.148.078c-.008 0-.015-.03-.015-.066a6.71 6.71 0 0 0-.097-.725C8.997 1.392 8.337.319 7.46.048a2.096 2.096 0 0 0-.585-.041Zm.293 1.402c.248.197.523.759.682 1.388.03.113.06.244.069.292.007.047.026.152.041.233.067.365.098.76.102 1.24l.002.475-.12.175-.118.178h-.278c-.324 0-.646.041-.954.124l-.238.06c-.033.007-.038-.003-.057-.144a8.438 8.438 0 0 1 .016-2.323c.124-.788.413-1.501.696-1.711.067-.05.079-.049.157.013zm9.825-.012c.17.126.358.46.498.888.28.854.36 2.028.212 3.145-.019.14-.024.151-.057.144l-.238-.06a3.693 3.693 0 0 0-.954-.124h-.278l-.119-.178-.119-.175.002-.474c.004-.669.066-1.19.214-1.772.157-.623.434-1.185.68-1.382.078-.062.09-.063.159-.012z" },
 lmstudio: { titolo: "LM Studio", chiave: "Lmstudio", hex: "000000", guida: null,
  d: "M14.025 0c3.492 0 5.237 0 6.571.68a6.24 6.24 0 0 1 2.725 2.724C24 4.738 24 6.484 24 9.975v4.05c0 3.492 0 5.237-.68 6.571a6.24 6.24 0 0 1-2.724 2.725c-1.334.679-3.08.679-6.571.679h-4.05c-3.492 0-5.237 0-6.571-.68A6.24 6.24 0 0 1 .68 20.597C0 19.262 0 17.516 0 14.025v-4.05c0-3.492 0-5.237.68-6.571A6.23 6.23 0 0 1 3.404.68C4.738 0 6.484 0 9.975 0zM7.688 16.313a1.313 1.313 0 0 0 0 2.625h11.625a1.313 1.313 0 0 0 0-2.625zm-3-3.75a1.313 1.313 0 0 0 0 2.624h11.625a1.313 1.313 0 0 0 0-2.624zm3-3.75a1.313 1.313 0 0 0 0 2.624h11.625a1.313 1.313 0 0 0 0-2.624zm-3-3.75a1.313 1.313 0 0 0 0 2.625h11.625a1.313 1.313 0 0 0 0-2.625z" },
 huggingface: { titolo: "Hugging Face", chiave: "Huggingface", hex: "FFD21E", guida: "https://huggingface.co/brand",
  d: "M12.025 1.13c-5.77 0-10.449 4.647-10.449 10.378 0 1.112.178 2.181.503 3.185.064-.222.203-.444.416-.577a.96.96 0 0 1 .524-.15c.293 0 .584.124.84.284.278.173.48.408.71.694.226.282.458.611.684.951v-.014c.017-.324.106-.622.264-.874s.403-.487.762-.543c.3-.047.596.06.787.203s.31.313.4.467c.15.257.212.468.233.542.01.026.653 1.552 1.657 2.54.616.605 1.01 1.223 1.082 1.912.055.537-.096 1.059-.38 1.572.637.121 1.294.187 1.967.187.657 0 1.298-.063 1.921-.178-.287-.517-.44-1.041-.384-1.581.07-.69.465-1.307 1.081-1.913 1.004-.987 1.647-2.513 1.657-2.539.021-.074.083-.285.233-.542.09-.154.208-.323.4-.467a1.08 1.08 0 0 1 .787-.203c.359.056.604.29.762.543s.247.55.265.874v.015c.225-.34.457-.67.683-.952.23-.286.432-.52.71-.694.257-.16.547-.284.84-.285a.97.97 0 0 1 .524.151c.228.143.373.388.43.625l.006.04a10.3 10.3 0 0 0 .534-3.273c0-5.731-4.678-10.378-10.449-10.378M8.327 6.583a1.5 1.5 0 0 1 .713.174 1.487 1.487 0 0 1 .617 2.013c-.183.343-.762-.214-1.102-.094-.38.134-.532.914-.917.71a1.487 1.487 0 0 1 .69-2.803m7.486 0a1.487 1.487 0 0 1 .689 2.803c-.385.204-.536-.576-.916-.71-.34-.12-.92.437-1.103.094a1.487 1.487 0 0 1 .617-2.013 1.5 1.5 0 0 1 .713-.174m-10.68 1.55a.96.96 0 1 1 0 1.921.96.96 0 0 1 0-1.92m13.838 0a.96.96 0 1 1 0 1.92.96.96 0 0 1 0-1.92M8.489 11.458c.588.01 1.965 1.157 3.572 1.164 1.607-.007 2.984-1.155 3.572-1.164.196-.003.305.12.305.454 0 .886-.424 2.328-1.563 3.202-.22-.756-1.396-1.366-1.63-1.32q-.011.001-.02.006l-.044.026-.01.008-.03.024q-.018.017-.035.036l-.032.04a1 1 0 0 0-.058.09l-.014.025q-.049.088-.11.19a1 1 0 0 1-.083.116 1.2 1.2 0 0 1-.173.18q-.035.029-.075.058a1.3 1.3 0 0 1-.251-.243 1 1 0 0 1-.076-.107c-.124-.193-.177-.363-.337-.444-.034-.016-.104-.008-.2.022q-.094.03-.216.087-.06.028-.125.063l-.13.074q-.067.04-.136.086a3 3 0 0 0-.135.096 3 3 0 0 0-.26.219 2 2 0 0 0-.12.121 2 2 0 0 0-.106.128l-.002.002a2 2 0 0 0-.09.132l-.001.001a1.2 1.2 0 0 0-.105.212q-.013.036-.024.073c-1.139-.875-1.563-2.317-1.563-3.203 0-.334.109-.457.305-.454m.836 10.354c.824-1.19.766-2.082-.365-3.194-1.13-1.112-1.789-2.738-1.789-2.738s-.246-.945-.806-.858-.97 1.499.202 2.362c1.173.864-.233 1.45-.685.64-.45-.812-1.683-2.896-2.322-3.295s-1.089-.175-.938.647 2.822 2.813 2.562 3.244-1.176-.506-1.176-.506-2.866-2.567-3.49-1.898.473 1.23 2.037 2.16c1.564.932 1.686 1.178 1.464 1.53s-3.675-2.511-4-1.297c-.323 1.214 3.524 1.567 3.287 2.405-.238.839-2.71-1.587-3.216-.642-.506.946 3.49 2.056 3.522 2.064 1.29.33 4.568 1.028 5.713-.624m5.349 0c-.824-1.19-.766-2.082.365-3.194 1.13-1.112 1.789-2.738 1.789-2.738s.246-.945.806-.858.97 1.499-.202 2.362c-1.173.864.233 1.45.685.64.451-.812 1.683-2.896 2.322-3.295s1.089-.175.938.647-2.822 2.813-2.562 3.244 1.176-.506 1.176-.506 2.866-2.567 3.49-1.898-.473 1.23-2.037 2.16c-1.564.932-1.686 1.178-1.464 1.53s3.675-2.511 4-1.297c.323 1.214-3.524 1.567-3.287 2.405.238.839 2.71-1.587 3.216-.642.506.946-3.49 2.056-3.522 2.064-1.29.33-4.568 1.028-5.713-.624" },
 vertex: { titolo: "Google Cloud", chiave: "Googlecloud", hex: "4285F4", guida: null,
  d: "M12.19 2.38a9.344 9.344 0 0 0-9.234 6.893c.053-.02-.055.013 0 0-3.875 2.551-3.922 8.11-.247 10.941l.006-.007-.007.03a6.717 6.717 0 0 0 4.077 1.356h5.173l.03.03h5.192c6.687.053 9.376-8.605 3.835-12.35a9.365 9.365 0 0 0-2.821-4.552l-.043.043.006-.05A9.344 9.344 0 0 0 12.19 2.38zm-.358 4.146c1.244-.04 2.518.368 3.486 1.15a5.186 5.186 0 0 1 1.862 4.078v.518c3.53-.07 3.53 5.262 0 5.193h-5.193l-.008.009v-.04H6.785a2.59 2.59 0 0 1-1.067-.23h.001a2.597 2.597 0 1 1 3.437-3.437l3.013-3.012A6.747 6.747 0 0 0 8.11 8.24c.018-.01.04-.026.054-.023a5.186 5.186 0 0 1 3.67-1.69z" },
});

/*
 * I DUE MARCHI CONDIVISI — due fornitori che sono lo STESSO prodotto su una porta diversa, o lo
 * stesso runtime in due forme. Scritto qui e non ripetuto nella mappa, così la ragione sta in un
 * posto solo. (`zai-anthropic` e `minimax-anthropic` sono le porte Anthropic-compatibili di Z.AI e
 * MiniMax; `ollama-cloud` è lo stesso marchio di Ollama.)
 */
const CONDIVISI = Object.freeze({ 'minimax-anthropic': 'minimax', 'ollama-cloud': 'ollama' });

/*
 * SENZA UN MARCHIO VERIFICABILE — l'elenco che l'owner deve vedere, con la RAGIONE.
 * ⛔ Nessuna di queste righe è «non l'ho trovato»: ognuna è un fatto verificato il 19/09/2026.
 *   Le prime tre sono i marchi che hanno chiesto di NON esserci.
 */
export const SENZA_MARCHIO = Object.freeze({
  /* ⛔ I DUE TOLTI SU ORDINE DELL'OWNER, 19/09/2026: «se non puoi usare loghi usare la lettera e
     basta». Le condizioni di questi due marchi chiedono un'approvazione che non abbiamo, quindi
     il marchio NON si può usare — e la regola è la lettera. Erano le due righe che avevo
     segnalato come «da decidere»: la decisione è questa. */
  anthropic: 'Le sue Trademark Guidelines chiedono un\'approvazione preventiva per l\'uso dei marchi: non l\'abbiamo, quindi il marchio non si può usare.',
  mistral: 'I suoi Commercial Terms hanno una «mutual prohibition on using the other party\'s name or marks without approval»: non l\'abbiamo, quindi il marchio non si può usare.',
  openai: 'Rimosso su richiesta di OpenAI: l\'icona non è più in Simple Icons per ragioni di marchio.',
  azure: 'Microsoft non è accettato da Simple Icons («banned until Microsoft give us a clear steer»), quindi Azure non ha un\'icona lì.',
  bedrock: 'Amazon Web Services non è coperto da Simple Icons; le icone AWS Architecture sono CC BY-ND (no derivatives) e non si possono ricolorare.',
  groq: 'La sua Trademark Policy ammette la nominative fair use SOLO per le word mark, «no logos»; il logo in UI vuole una licenza scritta.',
  zai: 'Z.AI / Zhipu non è coperto da Simple Icons.',
  'zai-anthropic': 'Stesso marchio di Z.AI, che non è coperto da Simple Icons.',
  xai: 'xAI non è coperto da Simple Icons; l\'icona `X` che c\'è è il marchio dell\'omonima rete sociale, un\'altra azienda — usarla sarebbe falso.',
  cerebras: 'Cerebras non è coperto da Simple Icons.',
  together: 'Together AI non è coperto da Simple Icons.',
  fireworks: 'Fireworks AI non è coperto da Simple Icons.',
  deepinfra: 'DeepInfra non è coperto da Simple Icons.',
  novita: 'Novita AI non è coperto da Simple Icons.',
  nebius: 'Nebius non è coperto da Simple Icons.',
  esterno: 'Non è un fornitore: è l\'agente che gira su questa macchina, e il suo ghilio lo dice (un robot).',
});

/** Il marchio di un fornitore, o `null` se non ne ha uno verificabile. */
export function marchioDiFornitore(row = {}) {
  const id = CONDIVISI[row.id] || row.id;
  return MARCHI[id] || null;
}

/*
 * ============================================================================
 * LA REGOLA DEL MONOGRAMMA — vedi la testata per il perché e per le fonti
 * ============================================================================
 */

/**
 * L'iniziale: la prima lettera della PRIMA parola dell'etichetta del server, segni tolti.
 * «Z.AI» → Z, «Amazon Bedrock» → A, «OpenAI» → O.
 * ⛔ Non si saltano le parole corte: salterebbe anche la «Z» di «Z.AI», e la porta Anthropic
 *   dello stesso fornitore finirebbe con l'iniziale di «porta» — cioè un'altra azienda. L'ho
 *   provato: con il filtro sulle parole di tre lettere, `zai` dava Z e `zai-anthropic` dava **P**,
 *   e le due schede dello stesso fornitore si presentavano come due fornitori diversi.
 */
export function inizialeFornitore(row = {}) {
  const etichetta = String(row.label || row.id || '?').toUpperCase();
  const prima = etichetta.replace(/[^A-Z0-9]+/gu, ' ').trim().split(/\s+/u)[0];
  return (prima || etichetta)[0] || '?';
}

/*
 * DOVE UNA LETTERA NON BASTA — la collisione accanto a ogni riga, perché è il motivo per cui la
 * riga esiste. Le lettere vengono dall'etichetta: la prova `LOG-05` lo verifica una per una.
 */
export const MONOGRAMMI = Object.freeze({
  /* ⛔ QUESTA RIGA È NATA DA UNA PROVA, non da una svista: togliendo il marchio di Anthropic
     (ordine dell'owner, 19/09/2026) la sua iniziale è diventata `A` — che era GIÀ di Azure, di
     Amazon Bedrock e di Agente esterno — e `LOG-05` l'ha detto subito: «anthropic collide a una
     lettera e non è nella tabella». Senza quella prova, due schede diverse avrebbero portato la
     stessa lettera e nessuno se ne sarebbe accorto. */
  anthropic: 'AN',        // «Anthropic» — A è di Azure, di Amazon Bedrock e di Agente esterno
  azure: 'AF',            // «Azure AI Foundry»
  bedrock: 'AB',          // «Amazon Bedrock»
  esterno: 'AE',          // «Agente esterno»
  zai: 'ZA',              // «Z.AI» — Z è anche della sua porta Anthropic
  'zai-anthropic': 'ZP',  // «Z.AI (porta Anthropic)»
  novita: 'NO',           // «Novita» — N è anche di Nebius
  nebius: 'NE',           // «Nebius»
});

/** Il monogramma di un fornitore: l'iniziale, o la coppia dichiarata dove l'iniziale non basta. */
export function monogrammaFornitore(row = {}) {
  return MONOGRAMMI[row.id] || inizialeFornitore(row);
}

/**
 * Le collisioni che la regola lascerebbe se ci si fermasse a UNA lettera: quante iniziali sono
 * condivise, e da chi. La prova la legge per asserire che la tabella le copre tutte — se un
 * fornitore nuovo porta un'iniziale già presa, questa lista lo nomina.
 */
export function collisioniDiIniziale(righe = []) {
  const perIniziale = new Map();
  for (const row of righe) {
    const i = inizialeFornitore(row);
    perIniziale.set(i, [...(perIniziale.get(i) || []), row.id]);
  }
  return [...perIniziale.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([iniziale, ids]) => ({ iniziale, ids }));
}

function svg(doc, contenuto) {
  const NS = 'http://www.w3.org/2000/svg';
  const nodo = doc.createElementNS(NS, 'svg');
  nodo.setAttribute('viewBox', '0 0 24 24');
  nodo.setAttribute('aria-hidden', 'true');
  nodo.setAttribute('focusable', 'false');
  Object.assign(nodo.style, { width: LATO, height: LATO, fill: 'currentColor', flex: 'none' });
  nodo.append(contenuto);
  return nodo;
}

/**
 * Il glifo di un fornitore, pronto da appendere: il MARCHIO se c'è, il disegno di famiglia se no.
 * @returns {{nodo: SVGElement, marchio: object|null}}
 */
export function glifoFornitore(row = {}, { document: doc = globalThis.document } = {}) {
  const marchio = marchioDiFornitore(row);
  if (marchio) {
    const traccia = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
    traccia.setAttribute('d', marchio.d);
    /* ⛔ Il nome del marchio NON va a schermo (a schermo c'è già il nome del fornitore, scritto dal
       server): resta sul nodo come dato, per chi legge il DOM e per la prova che conta i marchi. */
    const nodo = svg(doc, traccia);
    nodo.dataset.marchio = marchio.chiave;
    return { nodo, marchio };
  }
  /*
   * IL MONOGRAMMA — la lettera dentro un cerchio, la forma dell'avatar.
   * ⛔ Il CERCHIO è la differenza che si vede a colpo d'occhio: il marchio vero è una forma
   *   disegnata, il ripiego è un tondo con una lettera dentro. Uno non si scambia per l'altro.
   * ⛔ Stessa misura del marchio (`LATO`, 22×22) perché la riga delle card non balli.
   * ⛔ `aria-hidden`: il nome del fornitore è scritto sulla card; due lettere in più farebbero
   *   annunciare il nome e poi due lettere staccate.
   */
  const monogramma = monogrammaFornitore(row);
  const nodo = doc.createElement('span');
  nodo.className = 'talos-provider__monogramma';
  nodo.textContent = monogramma;
  nodo.setAttribute('aria-hidden', 'true');
  nodo.dataset.glifo = 'monogramma';
  nodo.dataset.monogramma = monogramma;
  Object.assign(nodo.style, {
    display: 'grid', placeItems: 'center', flex: 'none',
    width: LATO, height: LATO, borderRadius: '50%',
    background: 'var(--talos-card-hover)',
    /*
     * ⛔ LA LETTERA PRENDE IL COLORE DEL TESTO, non quello attenuato dei marchi — e non è una
     *   preferenza: **MISURATO**, col fondo VERO composto (`--talos-card-hover` è un velo al 5%,
     *   non un colore pieno). Col colore attenuato il contrasto era **3,2:1 in tema SCURO** e
     *   **5,4:1 in tema chiaro**: il tema scuro stava sotto il 4,5:1 che WCAG 1.4.3 chiede a un
     *   testo di 11 px. Con `--talos-text` è **7,8:1** e **13,9:1** — la lettera è leggibile
     *   quanto il NOME del fornitore che le sta accanto, in tutti e due i temi.
     *   La forma del ripiego la dichiara il CERCHIO, non la debolezza del colore.
     */
    color: 'var(--talos-text)',
    fontWeight: '600', lineHeight: '1', letterSpacing: '0', userSelect: 'none',
    /* Due lettere vanno più piccole, o sfondano il cerchio da 22. */
    fontSize: monogramma.length > 1 ? '9px' : '11px',
  });
  return { nodo, marchio: null, monogramma };
}

/** Quanti fornitori di questo elenco hanno il marchio vero. Serve alla prova, e al resoconto. */
export function contaMarchi(rows = []) {
  const con = rows.filter((r) => marchioDiFornitore(r));
  return { con: con.length, senza: rows.length - con.length, fornitoriConMarchio: con.map((r) => r.id) };
}
