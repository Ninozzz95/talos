# I loghi dei fornitori — provenienza, licenza, e chi NON ce l'ha

> Raccolti il **19/09/2026** per la FASE 4-bis del laboratorio modelli (scheda «Provider»).
> La mappa che il prodotto usa sta in `src/components/loghi-fornitori.js`; **questi** file sono
> la copia integra da cui il tracciato è stato preso. Il `d` di ogni icona è finito nel bundle:
> il prodotto **non chiede nessun logo a un indirizzo esterno** (local-first).

## La sorgente

**[Simple Icons](https://simpleicons.org)** — pacchetto npm `simple-icons`, licenza del progetto
**CC0-1.0** (`https://github.com/simple-icons/simple-icons/blob/develop/LICENSE.md`).

⛔ **CC0 copre il diritto d'autore dell'icona, NON il marchio.** Lo dice la licenza stessa:
«No trademark or patent rights held by Affirmer are waived, abandoned, surrendered, licensed or
otherwise affected by this document». Lo ripete il `DISCLAIMER.md` della libreria: l'utente deve
«seek the correct permissions to use the icons relevant to your project».

## Il criterio con cui «verificato per marchio» è stato deciso

Simple Icons **rimuove un'icona su richiesta del marchio** (`removals@simpleicons.org`), e lo fa
davvero:

- **OpenAI** ha chiesto e ottenuto la rimozione della propria icona per ragioni di marchio
  (`https://github.com/gptme/gptme/pull/2283`, letto il 19/09/2026);
- **Microsoft** (quindi Azure) è fra i marchi che il progetto non accetta
  (`https://github.com/simple-icons/simple-icons/issues/13010`, letto il 19/09/2026).

⇒ **La presenza dell'icona oggi è una misura**, non un'opinione: quel marchio, informato, non ha
chiesto la rimozione. Dove il marchio ha una politica **sua**, si è letta e citata.

## Le icone presenti (10 file, 12 fornitori)

| file | marchio | `hex` | Simple Icons | guida del marchio |
|---|---|---|---|---|
| `Openrouter.svg` | OpenRouter | `#94A3B8` | `openrouter` | — |
| `Googlegemini.svg` | Google Gemini | `#8E75B2` | `googlegemini` | — |
| `Deepseek.svg` | DeepSeek | `#5786FE` | `deepseek` | — |
| `Kimi.svg` | Kimi (Moonshot AI) | `#000000` | `kimi` | <https://moonshotai.github.io/Branding-Guide> |
| `Minimax.svg` | MiniMax | `#E73562` | `minimax` | — |
| `Qwen.svg` | QWen | `#6950EF` | `qwen` | — |
| `Ollama.svg` | Ollama | `#000000` | `ollama` | — |
| `Lmstudio.svg` | LM Studio | `#000000` | `lmstudio` | — |
| `Huggingface.svg` | Hugging Face | `#FFD21E` | `huggingface` | <https://huggingface.co/brand> |
| `Googlecloud.svg` | Google Cloud (per Vertex AI) | `#4285F4` | `googlecloud` | — |

**Due marchi sono condivisi** fra più fornitori della stessa azienda:
`ollama-cloud` → Ollama · `minimax-anthropic` → MiniMax.

**Una mappatura dichiarata, non inventata:** `vertex` («Google Vertex AI») usa il marchio
**Google Cloud**, che è la famiglia di prodotto a cui Vertex AI appartiene — è ciò che Simple Icons
copre. Non è il marchio specifico di Vertex AI, che nella libreria non esiste.

## I due marchi TOLTI su ordine dell'owner (19/09/2026)

Owner, testuale: **«se non puoi usare loghi usare la lettera e basta»**. Erano le due righe che
avevo segnalato come «da decidere»; la decisione è che l'approvazione che le loro condizioni
chiedono **non l'abbiamo**, quindi il marchio **non si usa**.

| marchio | perché è stato tolto |
|---|---|
| **Anthropic** | Le sue Trademark Guidelines chiedono un'approvazione preventiva per l'uso dei marchi (`https://www.anthropic.com/legal/trademark-guidelines`, letto il 19/09/2026). |
| **Mistral AI** | I suoi Commercial Terms hanno una «mutual prohibition on using the other party's name or marks without approval» (`https://conductatlas.com/platform/mistral-ai/mistral-ai-commercial-terms/provision/CA-P-060782/`, letto il 19/09/2026). |

I due file `Anthropic.svg` e `Mistralai.svg` sono stati **rimossi** da questa cartella, e
`provenienza.json` non li nomina più.

## I fornitori SENZA un logo verificabile (16)

Nessuna di queste righe è «non l'ho trovato»: sono fatti verificati il 19/09/2026.

| fornitore | perché |
|---|---|
| **Anthropic** | Le sue Trademark Guidelines chiedono un'approvazione preventiva: non l'abbiamo. |
| **Mistral AI** | I suoi Commercial Terms vietano l'uso del marchio senza approvazione: non l'abbiamo. |
| **OpenAI** | Rimosso da Simple Icons **su richiesta di OpenAI**, per ragioni di marchio. |
| **Azure AI Foundry** | Microsoft non è accettato da Simple Icons: «banned until Microsoft give us a clear steer». |
| **Amazon Bedrock** | AWS non è coperto; le icone AWS Architecture sono **CC BY-ND** (no derivatives) e non si possono ricolorare. |
| **Groq** | La sua Trademark Policy ammette la nominative fair use **solo per le word mark, «no logos»**; il logo in UI vuole una licenza scritta (`https://groq.com/trademark-policy`). |
| **Z.AI** (+ la sua porta Anthropic) | Non coperto da Simple Icons. |
| **xAI** | Non coperto. L'icona `X` della libreria è il marchio dell'**omonima rete sociale**: usarla per xAI sarebbe falso. |
| **Cerebras** | Non coperto. |
| **Together AI** | Non coperto. |
| **Fireworks AI** | Non coperto. |
| **DeepInfra** | Non coperto. |
| **Novita AI** | Non coperto. |
| **Nebius** | Non coperto. |
| **Agente esterno** | Non è un fornitore: è l'agente che gira su questa macchina. |

Per tutti questi la card mostra il **monogramma**: una lettera in un cerchio, la convenzione
dell'avatar (owner, 19/09/2026: «usa la lettera come si fa di convenzione»). La regola con cui la
lettera si sceglie sta in `loghi-fornitori.js`, ed è la prova `LOG-05` a tenerla onesta.

## Come si dipingono

**Monocromi, con `fill: currentColor`.** Il colore lo decide il tema, non il marchio. Tre ragioni
misurate:
1. è la forma nativa di Simple Icons (un solo `path`, nessun colore nel file);
2. il marchio di alcuni è **nero** (`#000000` Kimi / Ollama / LM Studio): a colori, in tema scuro,
   sarebbe invisibile;
3. ricolorare un marchio è ciò che alcune licenze di marchio vietano (AWS Architecture, CC BY-ND):
   con `currentColor` non si ricolora niente, si usa il marchio come la libreria lo pubblica.

**Il monogramma** invece è un **cerchio** (`border-radius: 50%`, la forma dell'avatar) con la
lettera dentro, della stessa misura del marchio (22×22), col colore del **testo** — misurato:
7,8:1 in tema scuro e 13,9:1 in tema chiaro, contro i 3,2:1 che il colore attenuato dava in scuro.

## La prova che le due copie non divergono

`tests/browser/lab-provider-filtri.spec.mjs` (caso `LOG-03`) rilegge questi file dal disco e
confronta il `d` con quello scritto in `loghi-fornitori.js`: se qualcuno cambia una delle due copie
senza l'altra, la prova diventa **rossa**.
