# La corsa di P-13 è partita — e la prima volta stava misurando il nulla

Owner: «via al banco». Il primo lancio ha bruciato **7 task (21 giri) tutti `fallito`** senza chiamare
mai il modello. L'ho fermato dopo 4 minuti e messo da parte il file come
`talos.AVVELENATO-401.jsonl`, perché quei numeri non sono misure.

## ⛔ La causa: le chiavi erano DUE, e il banco leggeva quella morta

| dove | impronta | risposta del fornitore |
|---|---|---|
| variabili d'ambiente di Windows (User, Machine, Process) | `8dba33c2…` | **401 «User not found»** |
| custodia di sistema (portachiavi), quella che usa il 4174 | `6b84730f…` | **200, funziona** |

Il 4174 dichiara `origineChiave: "custodia"`; il banco leggeva
`CHIAVI_DI_WINDOWS.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY`, cioè **solo l'ambiente**.
Stessa macchina, stesso momento, due chiavi diverse: una funziona e una no.

⛔ Il danno non è «il banco non parte»: è che **è partito lo stesso**, e ha scritto `fallito` con
`costoUsd: null` e `HTTP 401 dopo 4 tentativi` nel campo dell'errore. Un guasto dell'**ambiente**
registrato come fallimento del **modello** — la forma esatta di
[[il-429-non-e-un-fallimento]] (20/08: 48 righe su 66 di codex erano limiti di traffico, e la
campagna intera andò buttata).

## Tre anelli, e ognuno falliva in silenzio

Ho sbagliato due volte prima di arrivarci, e tutte e due le volte l'errore **non si vedeva**:

1. **Il nome del servizio l'ho indovinato** (`talos.harness-ui.providers`) invece di leggerlo. Il vero
   è `talos-harness-provider` — `provider-credential-store.mjs:27`. Con quello sbagliato la lettura
   torna `null` e il banco ripiega sull'ambiente: 401, senza una parola.
2. **`@napi-rs/keyring` non è installato nel banco**: vive in `harness-ui/node_modules`, perché è una
   dipendenza del prodotto. Un `import` nudo fallisce con «Cannot find package» e — di nuovo — si
   ripiega in silenzio.
3. E prima ancora avevo letto `getKey()` **senza** `loadFromKeyring()`, quindi confrontavo
   l'ambiente con sé stesso e concludevo «sono la stessa chiave». Lo erano, ma non erano quelle giuste.

⇒ Ogni `catch` che degrada in silenzio ha bisogno di dire **cosa** sta coprendo. Ora la lettura della
custodia stampa il motivo quando fallisce, invece di far finta di niente.

⭐ E la chiave **non viaggia in una variabile d'ambiente né sulla riga di comando**: `harness.mjs` la
legge dalla custodia in memoria. La lezione «il segreto passa da adbd, e adbd logga» vale anche qui.

## La prova prima di impegnare le ore

Un task solo, per vedere se la catena regge: **`storia-07f0799` riuscito, 296 s, $0,024**. Chiave
`6b84730f…` al kernel, modello `z-ai/glm-5.3-flash`, elenco spento (22.844 caratteri quando acceso).

## ⛔ Il preventivo era sbagliato, e in due modi

| | dicevo | misurato |
|---|---|---|
| costo per giro | $0,00794 | **$0,024** (3×) |
| totale prima+dopo | $1,67 | **~$5,00** |
| tempo per giro | 503 s | 296 s |
| tempo prima+dopo | «circa 10 ore» | **~17 ore** |

Il costo per giro veniva da una misura vecchia su un altro modello; quello vero lo dice il listino
dichiarato dalla corsa stessa (`$0.075/M dentro · $0.250/M fuori`).
