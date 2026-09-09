# T09-colonna-destra — La colonna di destra: Contesto, File, Agenti, Processi — quattro schede, dati veri

> Prova d'uso sull'istanza 4188 (worktree AVM-harness-prove, base c1984d79), guidata come farebbe una persona. 2026-09-06 14:04

## Passi

- **sessione avviata** ✅
  - atteso: una sessione vera che esegue un comando E delega un sotto-agente
  - visto: 667b9d42
- **«Processi» MENTRE lavora** ✅
  - atteso: i processi lanciati dal giro, con durata ed esito (G20-G21)
  - visto: {"testo":"ProcessiNessun comando eseguito in questa sessione. Quando l'agente o tu lanciate un comando, qui compaiono comando, durata e uscita.","righe":[]}
- **esito del giro** ✅
  - atteso: conclusa
  - visto: conclusa=true · esito=successo
- **le quattro schede della colonna** ✅
  - atteso: Contesto · File · Agenti · Processi (G11-G13)
  - visto: [{"nome":"Contesto","scelta":false},{"nome":"File","scelta":false},{"nome":"Agenti","scelta":false},{"nome":"Processi","scelta":true}]
- **scheda «Contesto»** ✅
  - atteso: Ambiente (ramo, worktree, repo annidati) + finestra del contesto + indice dei giri (G14-G16, B23)
  - visto: ambiente=true · finestra=true · indice=true · []
- **scheda «File»** ✅
  - atteso: i file toccati dal giro, con l albero dietro un interruttore (G13)
  - visto: [".git","public","src","test","bench-lista.mjs","package.json","README.md"]
- **scheda «Agenti»** ✅
  - atteso: i sotto-agenti nati dal giro, o uno stato vuoto onesto (O-10)
  - visto: [] · API figli: {"figli":[{"sessionId":"b65610cd-e4a0-426f-80a0-4549017fc628","task":"Conta quante righe ha il file /mnt/c/Users/Antonino/Desktop/projects/AVM-harness-prove/scr
- **nota sui sotto-agenti** ✅
  - atteso: il giro non ne ha creati: la scheda non si può giudicare piena
  - visto: API figli = 0
- **scheda «Processi»** ✅
  - atteso: il comando lanciato dal giro, con durata ed esito (G20-G21)
  - visto: []

## Verdetto

**PASSA** — difetti trovati: 0.

## ⚠️ Rettifica: il verdetto automatico «PASSA · 0 difetti» era falso

Due letture della mia sonda erano sbagliate e vanno ritirate:

- **«Processi»**: la mia regola cercava le parole `node|shell|comando` e le trovava **dentro il testo
  dello stato vuoto** («Quando l'agente o tu lanciate un **comando**, qui compaiono comando, durata e
  uscita»). Un controllo che passa sullo stato vuoto non controlla niente.
- **«Agenti»**: leggevo `figli.items`, mentre l'API risponde `{ data: { figli: [...] } }`, quindi
  contavo **zero** figli e saltavo il confronto.

Il verdetto vero l'hanno dato le **foto**, ed è tutt'altro.

## Ispezione delle foto — quello che la colonna dice davvero

### ✅ «Processi» funziona, ed è ben fatta (G20-G21)

`foto/T09-colonna-destra/13-processi.png`: quattro carte, ognuna col **comando in monospazio**, chi
l'ha lanciato e quando (`agente · giro 1`), la **durata** (2,4 s · 2,3 s · 2,1 s · 3,4 s) e
l'**uscita** (`uscita 0`), col pallino verde. È esattamente ciò che G20-G21 chiedono.

### ⛔ «Agenti» dice che non ce ne sono, mentre ce ne sono tre

> ⛔ **T09-colonna-destra-D1** (grave): la scheda **Agenti** scrive **«Nessun sotto-agente in questa
> sessione»** mentre nella stessa sessione ci sono **tre sotto-agenti veri**. Misurato tre volte, in
> tre modi indipendenti, nello stesso minuto:
> 1. l'API `/api/v1/sessions/667b9d42-…/children` risponde `ok:true` con **`figli: 3`**
>    (`b65610cd`, `0617c753`, `95ddb70b`);
> 2. la **barra laterale** elenca quattro sessioni `delega:667b9d42-…` (tre figlie più una nipote);
> 3. il modello stesso, in chat, racconta di aver **tentato la delega tre volte**.
>
> È la segnalazione **O-10** dell'owner («spawno un sottoagente e non si vede in tab Agenti»), che il
> registro dà per **✅ chiusa**: alla base `c1984d79` **non lo è** — prova:
> `foto/T09-colonna-destra/12-agenti.png` accanto a `13-processi.png`

### ⛔ I sotto-agenti girano con un ALTRO modello, e nessuno lo dice

> ⛔ **T09-colonna-destra-D2** (grave): la sessione è stata creata scegliendo **`z-ai/glm-5.3-flash`**,
> e tutte e quattro le sessioni delegate girano con **`z-ai/glm-4.7-flash`**. Un modello che la persona
> non ha scelto, pagato sul suo credito, **senza una riga che lo dichiari** da nessuna parte
> — prova: `/api/v1/sessions`, colonna modello:
> `delega:667b9d42-… → z-ai/glm-4.7-flash` (×3) mentre `libero:full-access 667b9d42 → z-ai/glm-5.3-flash`

### ⛔ Le sessioni delegate invadono l'elenco col loro identificatore grezzo

> ⛔ **T09-colonna-destra-D3** (grave): le sessioni figlie compaiono nella barra laterale **allo stesso
> livello** di quelle create dalla persona, e si chiamano **`delega:667b9d42-4b10-4e…`**: un
> identificatore tecnico troncato, esattamente ciò che H22 vieta a schermo. Dopo un solo giro con una
> delega l'elenco è passato da **5 a 10 sessioni**, e sei di quelle dieci non le ha create nessuno
> — prova: `foto/T09-colonna-destra/12-agenti.png`, barra laterale, «SESSIONI 10»

### ⛔ La delega non funziona, e il perché è nel kernel

> ⛔ **T09-colonna-destra-D4** (grave, **kernel — fuori dalla mia lane, da segnalare**): tutte e tre le
> deleghe sono fallite. Il modello lo scrive in chat: «la delega al sotto-agente l'ho tentata tre
> volte, ma è fallita ogni volta per un problema dell'ambiente del sotto-agente (**la sua shell tenta
> di cambiare directory in una cartella errata e non esegue nulla**)».
>
> La causa si legge nei dati: il compito passato ai figli nomina la cartella
> **`/mnt/c/Users/Antonino/Desktop/projects/AVM-harness-prove/…`**, cioè il **percorso WSL** invece di
> quello Windows. E si capisce perché: `talosHarness.mjs:5915` **rifiuta** una delega la cui cartella
> sia uguale a quella del padre (`REFUSED. The child folder must be different from your own`), così il
> modello, per farla passare, riscrive lo stesso percorso in un'altra forma — quella WSL che
> `convertiPercorsoWsl` (`talosHarness.mjs:1928`, usata a `:2085`) produce per la shell. Il figlio poi
> parte con una `cwd` che su Windows non esiste.
>
> ⇒ Una guardia pensata per evitare la ricorsione **insegna al modello a mentire sul percorso**.
> Il giro è costato **8 giri, 76,8k token** e quattro sessioni figlie per un conteggio di righe che
> alla fine il padre ha fatto da solo — prova: `13-processi.png` (barra di stato: `76,8k token · 8
> giri`) e la lista sessioni

### Cosa invece funziona, e va detto

- Le **quattro schede** ci sono e si chiamano come vuole G11-G13: Contesto · File · Agenti · Processi.
- **Contesto** porta Ambiente (ramo, worktree, non salvate, repo annidati), Finestra del contesto con
  la ripartizione (D26) e l'**Indice dei giri** (B23) — vedi `foto/T07-review/10-review-aperta.png`.
- **File** mostra i file toccati e l'albero dietro l'interruttore «Nascondi l'albero della cartella».
- Lo **stato vuoto di Agenti è scritto bene** («Quando ce ne sarà uno, qui compaiono i suoi giri, le
  sue richieste di permesso e il pulsante per fermarlo»): il guaio è che si vede quando **non** deve.
- La barra di stato in fondo alla chat porta **token · giri · tasso di cache · tempo al primo token**:
  sono le tre misure nuove decise in G3-G4, e ci sono davvero (`cache 72% · primo token 6,8 s`).

## Verdetto (rivisto dopo l'ispezione delle foto)

**FALLISCE** — 4 difetti, tutti gravi. Due delle quattro schede (Contesto, File, Processi) sono buone;
la quarta **nega un fatto che l'API dichiara nello stesso momento**, i sotto-agenti girano con un
modello che la persona non ha scelto, e la delega non funziona affatto.

> Base del codice: `c1984d79` (worktree `AVM-harness-prove`, istanza sulla porta **4188**).
