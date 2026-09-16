# `document_create` scriveva in `C:\` — diagnosi, causa, cura, consegna

**11/09/2026 · sessione dell'owner `91ae0634-d8a6-4744-a7a6-44c28200e55a` · lane `lane/harness-desktop`**

> Owner: «il punto A è quello che conta davvero. Il sintomo (`C:\`) suggerisce che lo strumento
> risolva il workspace in modo fallito e ricada sulla radice — se il workspace non è determinabile
> dal processo che scrive, la stessa cosa colpirà ogni futuro tentativo di generare documenti».

**La risposta al sospetto, secca: no.** Il workspace era determinabile, e nessuna risoluzione è
fallita. `C:\` non è un ripiego: è il valore che il prodotto **calcola apposta**, per una funzione
voluta. Il difetto sta altrove, ed è più semplice e più profondo di un fallback.

---

## A · Diagnosi — dove nasce `C:\`, con file e righe

### A.1 Il percorso del file esce da qui

| passo | file:riga | cosa fa |
|---|---|---|
| 1 | `harness-ui/src/agent-service.mjs:1045` | `creaFileWorkspaceFn({ cartella, nome: documento.fileName, bytes })` |
| 2 | `harness-ui/src/workspace-files.mjs:190-206` | `const radiceReale = realpathSync(cartella); const destinazione = join(radiceReale, nome)` |
| 3 | `harness-ui/src/agent-service.mjs:1049` | l'errore viene avvolto in `"…" was created and checked, but it could not be saved to the workspace: …` — **è esattamente la frase vista dall'owner** |

⇒ il file finisce **alla radice del workspace**, sempre. Nessun default scritto a mano, nessuna
variabile d'ambiente, nessun `catch` che ripiega: `cartella` arriva intatta dalla sessione.

### A.2 E `cartella` diventa `C:\` per una decisione, non per un errore

| passo | file:riga | cosa fa |
|---|---|---|
| 4 | `harness-ui/src/session-registry.mjs:2166-2169` | `cartellaEffettivaPerPermessi(base, permessi, giaScelta)` → `permessi === 'Full access' ? parsePath(base).root : base` |
| 5 | `harness-ui/src/session-registry.mjs:3499` e `:3532` | al cambio di permesso a giro concluso: `voce.cartella = cartellaEffettivaPerPermessi(voce.cartellaBase, prossimo.permessi, voce.cartellaGiaScelta)` |

La doc sopra quella funzione lo dichiara apertamente: *«"Full access" non è una regola nuova da
insegnare al kernel: è QUALE cartella gli viene consegnata. Larga quanto l'intero disco»*.

### A.3 La prova sul `.jsonl` della sessione dell'owner, riga per riga

| riga | record | cosa dice |
|---|---|---|
| 1 | `intestazione` | `cartella: C:\Users\Antonino\Desktop\projects\AVM-harness-desktop`, `permessi: "Read only"`, `cartellaGiaScelta: false` |
| 2242 | `impostazioni-sessione` | `permessi: "Full access"` ← **il momento esatto** |
| 2411 | `RunStarted` | `contesto.cartella: "C:\\"` — e lo stesso a 5250, 5421, 7326, 11784, 20728 (**sei giri**) |

Conteggio dei valori distinti nel file: `"cartella":"C:\\"` **6 volte**, la cartella del progetto
**5 volte**. Il salto avviene tutto e solo dopo la riga 2242.

⛔ Il primo `RunStarted` con `C:\` porta anche `reindirizzato: true`: il reindirizzo **non** è la
causa (è solo il primo giro dopo il cambio di permesso), ma è lì che si vede per la prima volta.

---

## B · Perché EPERM — misurato, non dedotto

Sonda di scrittura vera, tre bersagli, stesso processo Node del prodotto:

```
FALLITA radice del disco    C:\talos-sonda-scrittura-19120.txt
        errno=-4048 code=EPERM syscall=open
        messaggio: EPERM: operation not permitted, open 'C:\talos-sonda-scrittura-19120.txt'
OK      workspace del progetto   C:\Users\Antonino\Desktop\projects\AVM-harness-desktop\…
OK      Desktop owner            C:\Users\Antonino\Desktop\…
parse(workspace).root = "C:/"
```

⛔ **E non è un caso sfortunato né un problema di nome.** La radice del volume di sistema è protetta
da ACL che lasciano al gruppo `Users` creare **cartelle** ma non **file** — WinTips.org, «FIX: Write
Access Denied on Drive C:\», e Microsoft Learn, «Access Control: Understanding Windows File And
Registry Permissions» (letti l'11/09/2026). ⇒ **nessun titolo diverso poteva riuscire**, e il
consiglio che il prodotto dava al modello («offer a different title») era **falso**: lo ha mandato a
sbattere tre volte, una anche con `C:\C Users Antonino Desktop Qwen 3.8….pdf` (il percorso passato
nel `title` con le barre azzerate).

---

## C · `shell` era in sola lettura? — **No, e questo è un secondo difetto**

Nel `.jsonl` la frase «sola lettura: nessuna scrittura, comando o documento è permesso» compare
**una sola volta come esito vero** (riga 1542, un `ToolCallResult`) — **prima** del cambio di
permesso. Tutte le altre occorrenze (2407, 5245, 7321, 11779, 20723, 22092) sono dentro record
`messaggi-finali`/`checkpoint-ripresa`, cioè **la stessa frase riserializzata dentro la storia**.

⇒ Dalla riga 2242 in poi `shell` **poteva scrivere**. Il modello ha continuato a dire il contrario
per sei giri perché il rifiuto di prima è **congelato nel suo trascritto** e nessuno gli ha detto
che il permesso era cambiato. ⛔ **Filo separato, registrato, non curato qui**: un cambio di
permesso a sessione viva non raggiunge la conversazione.

---

## D · La cura — minima, e provata nei due versi

**La cura NON è restringere «Full access»**: allargare il workspace *è* la funzione, e il modello
deve poter leggere tutto il disco. È **separare due domande che erano una sola**:

- **da dove si LEGGE** → il workspace effettivo, largo quanto il permesso dice (invariato);
- **dove si DEPOSITA un file appena generato** → `cartellaBase`, la cartella che la persona ha
  scelto, immutabile e ricostruita anche dopo un riavvio.

| file | modifica |
|---|---|
| `harness-ui/src/agent-service.mjs` | parametro nuovo `cartellaCreazioni` (assente ⇒ `cartella`, cioè comportamento identico a prima); `cartellaPerCreare` usata dai **tre** chiamanti di `creaFileWorkspaceFn` (documento, immagine, `library_export`); `percorsoNellAlbero()` ricalcola il percorso mostrato nel pannello File **relativo al workspace**, altrimenti punterebbe a un file che lì non c'è |
| `harness-ui/src/session-registry.mjs` | `cartellaCreazioni: voce.cartellaBase ?? voce.cartella` in `cloudOptions` |

Il minimo privilegio, applicato nel verso giusto: *«un agente che deve solo leggere una cartella non
ha bisogno di scrivere nella radice del filesystem»* — Firecrawl, «AI Agent Sandbox: How to Safely
Run Autonomous Agents in 2026» (11/09/2026).

### Il cancello — `harness-ui/tests/documento-non-finisce-nella-radice.test.mjs`, 5 prove

1. il documento si deposita in `cartellaCreazioni`, non nella radice;
2. il percorso mostrato nell'albero resta relativo al workspace;
3. **senza** il parametro non cambia niente (nessun chiamante esistente si muove);
4. il registro consegna `cartellaBase` **dopo** che «Full access» ha allargato il workspace — e
   contemporaneamente il workspace di lettura **si allarga davvero**, perché quella è la funzione;
5. **al contrario, con la funzione VERA e il disco VERO**: scrivere nella radice **fallisce**, con
   `code === 'EPERM'`. Senza questa, tutto il resto misurerebbe solo che un argomento viaggia da A a B.

**Provato nei due versi**, togliendo la cura una metà alla volta:

| stato del codice | esito |
|---|---|
| cura intera | **5/5 verdi** |
| tolta la metà in `agent-service.mjs` | **2 rossi** |
| tolta la metà in `session-registry.mjs` | **1 rosso** |

**Suite backend completa: 2189/2189 verdi.**

---

## E · La verifica dal vivo sul 4174, col modello vero

4174 riavviato col codice nuovo (20 sessioni ripristinate). Sessione nuova, **`z-ai/glm-5.3-flash`**,
`cartellaId: default`, `permessi: "Full access"` — cioè **la condizione esatta del guasto**:

```
intestazione   cartella : C:\Users\Antonino\Desktop\projects\AVM-harness-desktop
               permessi : Full access     giaScelta: False
RunStarted     contesto.cartella : "C:\\"      ← il workspace È la radice, come per l'owner
```

Esito: `Created "Prova deposito 11 settembre.pdf"`, evento file
`/file/Users/Antonino/Desktop/projects/AVM-harness-desktop/Prova deposito 11 settembre.pdf`,
file sul disco **18,2 KB nella cartella del progetto**, e **niente in `C:\`**.

Foto in **tema chiaro e scuro** (`scratchpad/deposito-light.png`, `deposito-dark.png`): la carta del
documento con «Scarica», la risposta del modello, e in basso a sinistra `C:\` come workspace —
cioè la prova che la condizione del guasto c'era e il file è finito comunque al posto giusto.
**Zero errori JavaScript a runtime** in entrambi i temi.

---

## F · Il PDF dell'owner, consegnato

Argomenti estratti dalle 11 chiamate `document_create` della sua sessione (quella col corpo più
ricco: `format: pdf`, `title: "Qwen 3.8 - Metodi ingegneristici d'avanguardia"`, `report` da 11.536
caratteri), passati al generatore **vero**:

```
nome file : Qwen 3.8 - Metodi ingegneristici d'avanguardia.pdf
byte      : 64689
verifica  : true — riaperto: 5 pagine
scritto   : C:\Users\Antonino\Desktop\Qwen 3.8 - Metodi ingegneristici d'avanguardia.pdf
ls -la    : 644  …pdf  63.2K
header    : %   P   D   F   -   1   .   3
```

---

## Cosa resta — dichiarato, non nascosto

- ⛔ **Il permesso cambiato non raggiunge la conversazione** (§C): il modello ha creduto per sei giri
  di essere in sola lettura. Filo separato, da decidere.
- ⛔ **Una sessione «Full access» ha per workspace l'intero disco**, con tutto quel che comporta
  (l'albero File mostra `C:\`; il 02/09 una sessione così ha accumulato 490 `WorkspaceChanged` e un
  log da 1,9 MB rigiocato a ogni apertura). La cura di oggi toglie il sintomo peggiore — i file
  generati — non questa scelta di fondo.
- Il **testo sotto il composer** («49,9k token · 2 giri») si vede ancora nelle foto: il 4174 serve
  ancora il frontend costruito **prima** della rimozione, non ancora consegnato. Non è una
  regressione.
