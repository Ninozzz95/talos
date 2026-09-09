# Censimento delle 35 righe di Hermes — contro il codice PRIVATO

> Blocco 0 del piano SUPERSET. ⛔ **Non è codice**: è la riga di partenza, e
> serve a non costruire due volte cose che ci sono già.
>
> **Albero misurato:** `AVM` su `lane/voce-personale`, l'albero privato più
> avanzato — 644 file di sorgente e 681 di prova sotto `mobile/`, esclusi
> `node_modules`, `android/`, `ios/`, `third_party/`.
> **Data:** 2026-08-22.

---

## Perché questo censimento esiste

La ricerca dell'owner (`TALOS_HERMES_REPO_MINING_..._20260822.md`, sha256
`adccbbd9…`) estrae 35 primitive di Hermes e le mappa sullo stato di TALOS. Ma
la sua §1 dichiara la fonte: ha estratto il **repo pubblico**, alla baseline
`9f4140f8`.

⛔ **Il pubblico è indietro di 135 commit.** Ventidue righe su trentacinque sono
marcate *«new / incomplete **publicly**»*, e quella parola è tutta la differenza:
descrive cosa si vede da fuori, non cosa esiste.

⇒ Aprire venti PR contro quell'inventario significa riscrivere ciò che abbiamo e
non accorgersene.

---

## ⛔ Il metodo, e i quattro difetti che ha avuto

Uno strumento che dice «questo ce l'abbiamo» è il posto perfetto in cui un
errore non si vede: se dice che c'è, nessuno va a controllare. Questo censimento
ha sbagliato **quattro volte** prima di stabilizzarsi, e tutte e quattro nello
stesso modo — **un filtro che riconosce una forma della cosa e manca le altre**:

```
1  `stall`   combaciava con **install**            → H15 dava 101 file, ne ha 0
2  `learn`   combaciava con «imparare» nei commenti → H07 dava 35 file, ne ha 0
3  `surface` combaciava con il CSS                  → H01 dava 132 file, ne ha 1
4  `from '…'` non vede gli import DINAMICI          → catalogoCompatto dava
                                                      «zero chiamanti», ed è VIVO
```

⭐ Il quarto è il più istruttivo: `chatController.ts:3660` fa
`await import('@/lib/tools/catalogoCompatto')`. Una grep sugli import statici lo
dichiarava codice morto — e avrei scritto in questo documento che la nostra
misura migliore non è in produzione.

⇒ **Le tre regole del censimento**, nate da quei quattro:

1. Un conteggio **non è** un verdetto: lo stato `PRESENTE` richiede il
   **chiamante di produzione**, guardato a mano.
2. Si cercano gli import **statici e dinamici**, e i riferimenti per simbolo.
3. Le assenze si provano meglio delle presenze: **zero file che contengono la
   parola** è una prova; «un file esiste» non lo è.

---

## Il quadro, in tre numeri

```
ASSENTE   19 righe su 35    zero file, provato
PRESENTE   9 righe          file + chiamante di produzione + misura dove c'è
PARZIALE   7 righe          esiste, ma non chiamato o non misurato — si dice quale
```

⭐⭐ **Il documento aveva ragione sulle assenze e sbagliava sulle fondamenta.**
Le diciannove che mancano mancano davvero. Ma su nove righe che marca «new» o
«partial» abbiamo implementazioni **misurate**, e sono proprio quelle che
reggono tutto il resto.

⛔ E correggo il mio stesso piano: avevo scritto «almeno sei righe davvero
assenti». Sono **diciannove**. È il motivo per cui il censimento viene prima del
codice — un'ipotesi mia contro una misura, e vince la misura.

---

## Le 35 righe

### PRESENTE — file, chiamante di produzione, e la misura

| ID | capacità | dove | chiamante di produzione | misura |
|---|---|---|---|---|
| **H02** | registro attrezzi | `lib/tools/registry.ts`, `toolset.ts` | `executor.ts` | **61 attrezzi** |
| **H03** | apertura a gradi | `lib/tools/aperturaProgressiva.ts` | `chat/providers/anthropicAdapter.ts`, `improntaDelProfilo.ts` | 63 attrezzi = **11.500 token/messaggio** senza (13/8) |
| **H03b** | catalogo compatto | `lib/tools/catalogoCompatto.ts` | `stores/chatController.ts:3660` (import **dinamico**) | 61 schemi **10.375 → 1.375 token, −87%** (9/8) |

#### ⭐ Correzione del 2026-08-22, aggiunta poche ore dopo il censimento

La prima stesura lasciava aperta una domanda e stava per rispondere male.
`aperturaProgressiva` è importata **solo** da `anthropicAdapter.ts`; gli altri
quattro adattatori — `gemini`, `local`, `ollama`, `openAiCompatible` — non la
nominano. La lettura ovvia era: *«l'apertura a gradi non copre il modello
locale, che è dove il contesto è più scarso»*. ⛔ **Falsa.**

La riduzione non sta nell'adattatore: sta nel **controller**, una riga sopra.

```js
// stores/chatController.ts:3652
const catalogoAttivo = profile?.provider !== 'anthropic' && offeredTools.length > 0
```

⇒ **Due meccanismi, scelti per provider, e insieme coprono tutte e cinque le
famiglie:**

```
anthropic              aperturaProgressiva      (ricerca attrezzi nativa)
tutti gli altri        catalogoCompatto         (indice + `tool_details` a richiesta)
   di cui il locale    + localToolCalls.ts      (il protocollo testuale)
```

⭐ Quindi H03 è **più forte** di come l'avevo scritta: la copertura è completa,
non parziale. E il percorso locale ha in più la sua misura, in
`localAdapter.ts:399` — *«sono i trentotto schemi dei tool. Centocinquanta
secondi, l'88% dell'attesa»*.

⛔ È il **quinto** difetto del metodo nella stessa giornata, e la stessa forma
delle altre quattro: ho guardato lo strato in cui il meccanismo **non c'è** e ho
concluso che non ci fosse. ⇒ Quando una capacità sembra mancare in un modulo,
si risale al chiamante **prima** di scriverlo.
| **H04** | permessi e approvazione | `permissionTypes.ts`, `toolAuthorizations.ts`, `securityCatalog.ts`, `consentQueue.ts` | `executor.ts`, `toolset.ts` | 17 file |
| **H05** | postcondizioni | 10 file | `executor.ts` | ⛔ `precondizioni` e `effettoIgnoto`: **1 file** — vedi PARZIALE |
| **H20** | automazioni / promemoria | 58 file | sì | — |
| **H26** | continuità multi-superficie | 16 file (overlay, risposta da notifica, vocale) | sì | — |
| **H27** | isolamento profili | 14 file (`profileId`, profilo attivo) | sì | — |
| **H31** | osservabilità | `lib/tools/tracciaAzione.ts`, `chainStore.ts` | **6 chiamanti**: `TalosBarraRoot.vue`, `TalosMobileMessageList.vue`, `TalosMobileSchedaAzione.vue`, `storiaConLeChiamate.ts`… | catena in **40 file** |
| **H35** | azioni verificate Android | `deviceTools.ts`, `intentiTools.ts` | sì | 17 file |

⭐ `tracciaAzione.ts` merita una riga a parte: esiste per una misura sul Pad del
10/8 — l'azione riusciva (`dumpsys`: torcia spenta) e il modello la negava
(*«The tool_results do not contain what the user asked for»*). ⇒ Chi racconta
cosa è successo è TALOS, non il modello. **È la base su cui va costruito PR-01,
non un file da affiancare.**

### PARZIALE — c'è, ma manca il chiamante o la misura

| ID | capacità | cosa c'è | cosa manca |
|---|---|---|---|
| **H01** | kernel unico | `lib/tools/agentLoop.ts` — **1 file** | non è una facciata: le superfici non passano da un ingresso canonico |
| **H05b** | precondizioni / effetto ignoto | `effettoIgnoto` in **1 file** | le postcondizioni sono in 10, le precondizioni in **0**: la tri-stato del documento non è simmetrica |
| **H10** | memoria curata | `memoryWriteTools.ts` | nessun profilo utente separato, nessuna curation |
| **H11** | richiamo full-text | 1 file nei repository | nessuno strumento di ricerca fra sessioni esposto al modello |
| **H22** | hook estensioni | 12 file nominano «estensione» | nessun API di hook: è vocabolario, non meccanismo |
| **H23** | computer use | `schermoTools.ts` — 1 file | l'astrazione browser/accessibilità non è unificata |
| **H29** | risoluzione modello/provider | `chat/providers/`, `localAdapter.ts` | nessun ruolo di modello (ausiliari) |

⛔ **H03b è PARZIALE per una ragione diversa e va detta:** la stringa
`tool_details` vive in **due posti** — la costante `TALOS_DETTAGLI_STRUMENTO` in
`catalogoCompatto.ts` (con **zero** riferimenti) e una regex scritta a mano in
`lib/chat/localToolCalls.ts:62`. Due controlli che si leggono come uno: il
giorno che divergono, nessuno sa quale è quello che gira. ⭐ È anche uno dei sei
rilievi dell'owner del 22/8 («tool/ricerca web rotti»).

### ASSENTE — zero file, provato

```
H06  skill come memoria procedurale        H18  registro processi in background
H07  sintesi skill da sorgenti (/learn)    H19  board multi-agente durevole
H08  revisione automiglioramento           H21  integrazione MCP
H09  curator + ledger delle skill          H24  server API per client esterni
H12  file di contesto di progetto          H25  ACP / integrazione editor
H13  compattazione e recupero contesto     H28  batch e traiettorie
H14  delegazione a subagenti               H30  personalità / identità
H15  steering, stallo, durevoli            H32  scansione sicurezza artefatti
H16  execute_code / PlanVM                 H33  import da altri agenti
H17  astrazione backend terminale          H34  automazioni deterministiche
```

⛔ **H13 (compattazione) è l'assenza più pesante e nessuno l'aveva nominata.**
Il documento la marca «partial»; è a **zero file**. Su un motore locale il
contesto è la risorsa che finisce per prima — ed è già misurato altrove che
TALOS **esaurisce i giri**, non le capacità.

---

## Cosa cambia nel piano

1. ⛔ **`lane/harness-coding` è indietro di 173 commit** rispetto a
   `lane/voce-personale`. Il piano diceva di lavorare lì: prima va allineata, o
   PR-01 nascerebbe su un albero che non ha il codice che questo censimento
   descrive. **Questo documento sta su `lane/voce-personale`** per la stessa
   ragione.
2. **PR-01 si innesta su `tracciaAzione.ts`**, confermato: sei chiamanti di
   produzione, e la ragione per cui esiste è la stessa del `D9` del documento.
3. **PR-02 ha una preda in più**: le due sorgenti di `tool_details`. Il
   manifesto deve avere **un posto solo** dove quel nome è definito.
4. ⭐ **H13 sale.** Con 19 assenze, l'ordine non lo decide più «cosa manca» ma
   «cosa costa di più non avere» — e su un agente locale è il contesto.

---

## ⛔ Cosa questo documento NON dice

- Non dice che le nove `PRESENTE` siano **complete**: dice che hanno un file, un
  chiamante e, dove c'è, una misura. La parità col comportamento di Hermes non è
  stata provata per nessuna.
- Non dice che le sette `PARZIALE` siano vicine: `PARZIALE` copre sia «esiste e
  non è chiamato» sia «è chiamato e non è misurato», e la colonna dice quale.
- Non ha guardato `android/` — le capacità native sono state contate dal lato
  TypeScript che le espone.
- ⛔ Le righe `PRESENTE` non sono state provate **al contrario**: nessuno ha
  verificato che scollegandole qualcosa diventi rosso. È il lavoro di PR-01 e
  PR-02, ed è il motivo per cui esistono.
