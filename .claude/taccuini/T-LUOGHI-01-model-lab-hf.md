# T-LUOGHI-01 — Model Lab › Hugging Face, il ridisegno

> Prova d'uso sul **4178** (worktree `AVM-harness-luoghi`, build modulare di `frontend/dist`),
> guidata come farebbe una persona: Chrome vero via Playwright, viewport **1440×900** e
> **1024×800**, tema **scuro** e **chiaro**, screenshot scattati **durante** l'attesa e non solo
> alla fine. 06/09/2026.
>
> ⛔ Il 4174 dell'owner e le porte 4175/4176/4177 di altre sessioni non sono mai stati toccati.
> La 4177 chiesta nel brief era già occupata da un'altra sessione (processo delle 15:05): l'ho
> lasciata in pace e sono andato sulla 4178.

## Perché

Owner: «questa schermata ux di huggingface è orrenda, bisogna ridisegnarla, ricerca web visiva
competitor e best practices». È la riga più urgente del mio blocco.

## Cosa ho misurato PRIMA di toccare

| Misura | Prima |
|---|---|
| Altezza del pannello | **3.589 px** |
| Colonna del dettaglio | 320 px larga, **3.330 px alta** |
| Barra dei filtri | **3 righe**, quattro larghezze diverse: 280 · 818 · 215 · 110 px |
| Ordine delle varianti | alfabetico dall'API → **`BF16 · 56,9 GB` prima e preselezionata** |
| Varianti con la memoria misurata | **0 su 15** — tutte «non ancora misurato» |
| Dove stava il pulsante che misura | **in fondo alla colonna**, sotto quindici voci, fuori schermo |
| Scaricamenti e preferiti sulle righe | calcolati dal server e **buttati via** dal disegno |

Foto: `scratchpad/luoghi/foto/00-prima/modellab-hf-*.png` e
`scratchpad/luoghi/foto/02-hf/hf-dettaglio-intero.png` (la colonna alta 3.330 px, con ~2.800 px
di nero sotto la lista).

## La ricerca, prima di scrivere una riga (06/09/2026)

- **HuggingFace, «GGUF · Quantization Types»** (`huggingface.co/docs/hub/en/gguf`): la tabella
  dichiara i **bit per peso** di ogni tipo (Q6_K 6,5625 · Q5_K 5,5 · Q4_K 4,5 · IQ4_XS 4,25 ·
  Q3_K 3,4375 · Q2_K 2,625 · IQ1_S 1,56) e marca Q8_0/Q5_0/Q4_0 come «legacy». È l'unica scala
  di qualità **dichiarata alla fonte**.
- **Hermes Agent, «Local Models»** (`hermes-agent.nousresearch.com/docs/user-guide/local-models`)
  — l'avversario dichiarato, ed è avanti su due cose: ogni riga porta un verdetto di memoria a
  tre stati («Fits your GPU» · «Uses system RAM» · «Too big for this machine»), e **non offre mai
  build sotto i 4 bit** («below 4-bit the quality loss is too severe»).
  ⛔ Ma **sceglie al posto tuo e non mostra il conto** («handles the fitting work for you»).
- **LM Studio** (guide 2026): la prima esecuzione propone «la quantizzazione consigliata per il
  tuo hardware», di norma Q4, dimensionata sulla RAM.
- **Jan.ai** (mljourney · aimadetools, 2026): l'hub etichetta «fast · balanced · high-quality» e
  propone Q4_K_M come equilibrio.
- **La banda**: «Q5_K_M se hai margine, Q6_K/Q8_0 se ne hai da vendere, Q4_K_M se non ci sta»
  (dev.to/pat9000 · mustafa.net · willitrunai.com, tutti 2026).

## Cosa ho cambiato

1. **Le varianti scendono per qualità, non per nome** (`ordinaVarianti`), sulla scala dei bit per
   peso di HuggingFace. Una sigla illeggibile vale `null` e va in **fondo**, mai in cima.
2. **Una variante è consigliata e preselezionata** (`varianteConsigliata`): la più fedele che
   **entra davvero**, col **pavimento di Hermes** (mai sotto i 4 bit) e un **soffitto** nostro
   (mai F16/BF16/F32, che sono i pesi pieni: servono a chi converte).
3. **La memoria si misura all'apertura del repository**, non dietro un pulsante che nessuno vede.
   La regola «si misura su richiesta, non a ogni ridisegno» resta intatta: aprire un repository
   *è* una richiesta. Il pulsante resta e diventa «Rimisura».
4. **Ogni sigla ha la sua glossa in italiano** (`IQ4_XS` → «4 bit compressi · più piccolo di Q4,
   un filo più lento»). Regola H22: il nome tecnico resta perché è il nome del file che si
   scarica, ma non viaggia mai da solo.
5. **Le righe portano scaricamenti e preferiti**, che il server mandava e il disegno buttava.
6. **La barra dei filtri su una riga sola** a 1440 (due a 1024, per scelta: ricerca sopra, gli
   altri tre sotto), e le voci dell'ordinamento dicono che sono un **ordine** («Più scaricati»),
   non un filtro («Download»).
7. **La lista delle varianti scorre dentro di sé** e la voce scelta viene portata sotto gli occhi.
8. **La ricerca parte scrivendo** (ritardo 450 ms, minimo 2 caratteri).

## Cosa ho trovato DAL VIVO, che i test unitari non vedevano

| # | Cosa | Come è finita |
|---|---|---|
| 1 | `/api/v1/local-models/fit-estimate` risponde **503 `RUNTIME_NOT_AVAILABLE`** su una macchina senza servizio locale: tutte e 27 le varianti tornavano `{state:'unknown'}`. Contandole come «misurate», il consiglio spariva e **tornava preselezionato `BF16 · 56,9 GB`** — esattamente il difetto che stavo curando | Curato: `unknown` non è una misura, si ripiega sulla convenzione. Regressione in `HF-SENZA-RUNTIME` |
| 2 | Il pannello **non aveva più un pulsante «Cerca»**: `montaHf()` gira prima degli ascoltatori e sostituisce i figli con quelli del mockup, che non ce l'ha. `#modelLabHfSearchButton` non esiste, la riga che lo lega non lega niente, e **l'unico modo di cercare era premere Invio** — mai scritto da nessuna parte. Chi scriveva e aspettava vedeva la lista di prima e la credeva il proprio risultato | Curato: la ricerca parte mentre si scrive |
| 3 | `Qwen3-Coder-30B-A3B-Instruct-**UD-**TQ1_0.gguf`: la sigla non veniva riconosciuta e il titolo diventava **il nome del file intero**, senza glossa e fuori dall'ordinamento | Curato: si salta il prefisso `UD-` di Unsloth. Regressione in `HF-NOMI-VERI` |
| 4 | Guardando la foto: **«Misura su questo PC» non sembrava un pulsante** (fantasma, senza bordo) e si leggeva come un sottotitolo sotto «Scegli il file» | Curato: `--secondary` |
| 5 | Guardando la foto: l'avviso «memoria non misurabile» era **la cosa più importante disegnata come la più debole** (grigio in coda a una riga) | Curato: è un callout |
| 6 | La voce **preselezionata era fuori dalla finestra** della lista: si vedeva `BF16` in cima e nulla diceva che il selezionato fosse un altro | Curato, scorrendo **solo il contenitore** — `scrollIntoView` faceva scorrere la pagina intera delle impostazioni (misurato: il pulsante finiva a y=286 con la lista a y=153) |
| 7 | Guardando la foto: **27 righe ripetevano «non misurabile su questa macchina»**, cioè proprio il rumore che il callout doveva togliere | Curato: la riga dice quanto pesa il file |
| 8 | A 1024 px la scheda «Hugging Face» veniva **tagliata a metà parola** («Hugging» senza «Face») | Curato: le schede scorrono, come già fa la Review |

⛔ **Due erano difetti della mia sonda, non del prodotto**, e li scrivo perché mi avevano dato un
falso verde e un falso rosso:
- la sonda cercava «non ancora misurato» ma **non** «non misurabile»: dichiarava *0 varianti non
  misurate* mentre erano **27 su 27**. Un controllo che non conosce tutte le forme del fallimento
  è un controllo che passa sempre;
- contava le «righe» della barra come numero di `top` distinti: la `select` è alta 36 px e gli
  input 40, quindi **una riga sola risultava due**.

## Stato finale, misurato

| Misura | Prima | Dopo |
|---|---|---|
| Altezza del pannello di dettaglio | 3.330 px | **900-986 px** |
| Barra dei filtri a 1440 | 3 righe | **1 riga** (242 · 200 · 180 · 172 px) |
| Varianti con un esito leggibile | 0 su 15 | **27 su 27** |
| Variante preselezionata | `BF16 · 56,9 GB` | **`Q5_K_XL · 20,2 GB`, con badge «Consigliato di norma»** |
| Glosse in italiano | nessuna | **27 su 27** |
| Scaricamenti/preferiti sulle righe | assenti | **presenti** (`↓ 12,6 M · ♥ 962`) |
| Ricerca senza risultati | la lista restava muta | **stato vuoto visibile** |
| Errori JavaScript | 0 | **0** |

## Passi, clic per clic (giro finale, entrambe le scene)

- **apro Impostazioni → Laboratorio modelli → Hugging Face** ✅
  - atteso: la barra su una riga a 1440 · visto: 1 riga, 242 · 200 · 180 · 172 px
- **scrivo «qwen3 gguf» e non premo niente** ✅
  - atteso: la ricerca parte da sola · visto: 4 righe, con `↓ 12,6 M ♥ 962` sulla prima
- **apro il primo repository** ✅
  - atteso: la memoria si misura senza che io chieda · visto: 27 varianti, l'esito su tutte
  - atteso: se non si può misurare, il pannello lo dice · visto: «La memoria di questo PC non è
    misurabile — Manca un servizio locale che risponda…»
  - atteso: preselezionata la consigliata, non i pesi pieni · visto: `Q5_K_XL · 20,2 GB`
  - atteso: il pulsante che misura sopra la lista · visto: y=755 contro la lista a y=921
  - atteso: «Scarica» nomina la variante scelta · visto: «Scarica sul computer · 20,2 GB»
- **⛔ verso contrario — cerco «zzz-non-esiste-questo-modello»** ✅
  - atteso: zero righe e lo stato vuoto che lo dice · visto: 0 righe, «Nessun repository trovato»

Foto in `scratchpad/luoghi/foto/T-LUOGHI-01-model-lab-hf/`: `1440-scuro-0[1-7]-*.png` e
`1024-chiaro-0[1-7]-*.png` (compresi gli scatti **durante** ricerca e misura),
`zoom-dettaglio-scuro.png`, `zoom-dettaglio-chiaro.png`, `zoom-lista-*.png`.

## Verdetto

**PASSA** — 0 difetti aperti sulle due viewport e i due temi, dopo otto correzioni.

⛔ **NON VERIFICATO, per nome:**
- **il download vero**: non ho premuto «Scarica sul computer». Scaricherebbe decine di GB e
  toccherebbe il disco dell'owner.
- **la misura con un esito VERO** (`compatible` / `tight` / `blocked`): questa macchina non ha un
  servizio locale, quindi `/fit-estimate` risponde sempre 503. Il ramo «misura» di
  `varianteConsigliata` è provato **solo nei test unitari**, mai dal vivo.
- **i repository con accesso richiesto** (`gated`): il callout esiste nel codice, non l'ho visto
  a schermo su un repository vero.
- **il contesto**: la stima copre i **soli pesi**, e la nota lo dichiara. Hermes dimensiona anche
  il contesto (garantisce almeno 64K). È un debito del runtime, non di questa scheda.
