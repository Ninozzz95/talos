# TICKET DI CONSEGNA — da leggere per intero prima di toccare qualsiasi cosa

**Data:** 08/09/2026 · **Destinatario:** ChatGPT-6 Astra · **Progetto:** TALOS Harness Desktop
**Radice:** `C:\Users\Antonino\Desktop\projects\AVM-harness-desktop`
**Lane:** `lane/harness-desktop` · **Ultimo commit pushato:** `044b52aa` (08/09, 12:52 — `581f1575` era quello di quando questo ticket è nato)
**Motivo della consegna:** crediti in esaurimento sulla sessione precedente.

> ## ⛔ LEGGI QUESTO PRIMA DI TUTTO IL RESTO
> **Il lavoro descritto qui sotto potrebbe NON essere committato.** La sessione precedente stava
> lavorando col contatore dei crediti quasi a zero: può essersi fermata **in mezzo a una modifica**,
> fra un `Edit` e il suo commit.
>
> **Quindi, prima di toccare qualsiasi cosa:**
> 1. `git status --short` — se ci sono file modificati, **sono lavoro non salvato**: leggili prima
>    di decidere se tenerli o buttarli.
> 2. `git log --oneline -5` — confronta con l'ultimo commit citato qui sopra: se ce ne sono di più
>    recenti, **questo ticket è più vecchio del codice**, e vince il codice.
> 3. `node --check` sui file modificati, poi le quattro suite (§1): una modifica interrotta a metà
>    può lasciare un file **che non compila**.
> 4. Il **registro di avanzamento** in fondo (§8) dice a che punto era il lavoro: è l'ultima cosa
>    che la sessione ha scritto prima di fermarsi.

---

## ⛔ 0 · LA REGOLA CHE VIENE PRIMA DI TUTTE — NON ASSUMERE NULLA

**Ordine esplicito dell'owner, 08/09/2026:** *«passagli la regola di non assumere nulla, ad ogni
incertezza Astra deve chiedere all'owner (me)»*.

Concretamente, e non è una formula di cortesia:

- Se non sai **quale** delle due letture di una richiesta è quella giusta → **chiedi**, non scegliere.
- Se un documento dice una cosa e il codice ne dice un'altra → **vince il codice**, e lo dici.
- Se stai per dichiarare chiusa una riga che non hai **visto** funzionare → non dichiararla: scrivi
  «⛔ NON VERIFICATO: <cosa manca e perché>».
- Se un numero ti sembra troppo bello o troppo uguale a un altro → è un allarme, non una conferma.
  In questo progetto tre misure identiche di fila si sono rivelate una sonda rotta.
- Se stai per toccare qualcosa fuori dalla tua lane (`mobile/`, `control-plane/`, `core/`, `docs/`)
  → **fermati e segnala**: si legge ovunque, si scrive solo in `harness-ui/`.

⚠️ **Il difetto che questa sessione ha fatto due volte, e che devi evitare:** ho dichiarato aperte
due righe (T03 sicurezza, CB-10 icone) cercando con `grep` **le parole che mi aspettavo** invece
del comportamento. Erano già chiuse. Un'ispezione fatta con `grep` su stringhe attese trova solo
ciò che è stato chiamato come te lo aspettavi. **Guarda il comportamento, non le parole.**

---

## 1 · DOVE SI TROVA TUTTO

### Le regole di lavoro (leggile PRIMA di scrivere codice)
| cosa | percorso |
|---|---|
| Istruzioni di progetto | `CLAUDE.md` (radice) |
| Indice memoria, regole vincolanti | `.claude/MEMORIA-REGOLE.md` |
| Lezioni chiuse | `.claude/MEMORIA-LEZIONI.md` |
| ⛔ Ripresa sessione | `.claude/RIPRESA-SESSIONE.md` |

### I documenti di stato (⚠️ tutti più vecchi del codice: verifica sempre)
| cosa | percorso |
|---|---|
| **Coda dei bug critici di oggi** | `.claude/CODA-BUG-CRITICI-2026-09-08.md` ← **parti da qui** |
| Ispezione pre-release, riverificata nel codice | `.claude/ISPEZIONE-PRIMA-DELLA-RELEASE-2026-09-08.md` |
| Coda unica dei debiti (121 righe, del 06/09) | `.claude/CODA-UNICA-DEBITI-2026-09-06.md` |
| Difetti segnalati dall'owner (O-01…O-50) | `.claude/DIFETTI-SEGNALATI-OWNER-2026-09-06.md` |
| Cacce ai bug | `.claude/BUG-HUNT-2026-09-06.md`, `.claude/BUG-HUNT-2-2026-09-06.md` |
| Stato release, cinque blocchi | `.claude/STATO-RELEASE-DESKTOP-2026-09-07.md` |
| Piano pre-release | `.claude/PIANO-PRE-RELEASE-2026-09-07.md` |
| Fatti MISURATI (non ri-dedurli) | `.claude/TACCUINO.md` |
| Confronto coi concorrenti | `.claude/PIANO-CONFRONTO-HERMES-2026-09-05.md`, `.claude/DOSSIER-COMPETITOR-FUNZIONI-DISTINTIVE-2026-09-03.md` |

### Il codice
| cosa | percorso |
|---|---|
| Server HTTP e rotte | `harness-ui/src/http-app.mjs` |
| **Kernel dell'agente** (giri, attrezzi, stop) | `harness-ui/src/kernel/talosHarness.mjs` |
| Registro sessioni | `harness-ui/src/session-registry.mjs` |
| Browser pilotato (CDP) | `harness-ui/src/browser-vivo.mjs`, `browser-sessione-viva.mjs`, `browser-stream.mjs` |
| **Il monolite del frontend** | `harness-ui/frontend/src/legacy/app.js` (~17.000 righe) |
| Componenti estratti | `harness-ui/frontend/src/components/*.js` |
| ⛔ **La FONTE del disegno** | `harness-ui/frontend/mockup/talos-mockup.html` |
| Generati (**non modificare a mano**) | `harness-ui/frontend/index.template.html`, `src/styles/index.css`, `harness-ui/public/**` |
| Sessioni su disco (per ispezionare le run) | `harness-ui/.sessions-store/*.jsonl` |

### La pipeline del frontend — è l'unica strada
```
si modifica  harness-ui/frontend/mockup/talos-mockup.html
             cd harness-ui/frontend
             node scripts/mockup-to-template.mjs     # rigenera template + CSS
             npm run build                            # costruisce in dist/
             cp -r dist/. ../public/                  # consegna
             powershell -NoProfile -ExecutionPolicy Bypass -File ../scripts/aggiorna-4174.ps1
```

### Le suite, coi numeri di oggi (non devono scendere)
```
cd harness-ui           && node --test tests/*.test.mjs                 → 1755/1755
cd harness-ui           && node --test src/kernel/talosHarness.test.mjs →  551/551
cd harness-ui/frontend  && npm run test:unit                            →  453/453
cd harness-ui/frontend  && npm run test:componenti                      →  117 su 120
```
Le 3 rosse dei componenti sono note: una differenza di **ordine** dei pulsanti fra mockup e
componente in `COMP Browser`. Registrata, non curata.
⛔ La suite ASTRA (`playwright.lab.config.mjs`) è stata **rimossa oggi** su ordine dell'owner:
era rossa da prima (69 su 195) e l'aveva scritta un agente che non ha più crediti. Non rimetterla.

---

## 2 · LE REGOLE VINCOLANTI DELL'OWNER — violarle costa

1. ⛔ **Ricerca web PRIMA di scrivere codice**, sempre, anche quando sei sicuro. È la regola violata
   più spesso. Cita **fonte + data** nel commit e nei commenti: senza citazione, la ricerca non c'è
   stata. Un cancello pre-commit lo verifica e blocca.
2. ⛔ **Verifica visiva sul 4174** (`http://127.0.0.1:4174`, il server vivo dell'owner) prima di
   dichiarare chiusa qualsiasi cosa che si veda. Consegnato ≠ visto ≠ provato.
3. ⛔ **Ogni immagine scattata va APERTA e ispezionata**, una per una, e registrata in
   `<scratchpad>/prove/ispezioni.md`. È un **cancello vero**: il commit viene bloccato se una foto
   non è nominata in un'ispezione con almeno quattro parole di giudizio. Non aggirarlo — è nato
   perché avevo scattato otto foto e ne avevo guardate tre, e nelle altre cinque c'erano quattro
   difetti veri.
4. ⛔ **Le sonde non toccano il 4174 con scritture**: niente sessioni nuove, niente giri. Per le
   prove che devono scrivere c'è l'istanza sulla **4314**. Leggere il 4174 è consentito.
5. ⛔ **Riavviare il 4174 è autonomo e obbligatorio** dopo ogni build: dev'essere sempre acceso e
   sempre con l'ultimo codice.
6. ⛔ **NIENTE co-authoring nei commit** (`Co-Authored-By`, `Claude-Session`): un cancello li rifiuta.
7. ⛔ **I COMMIT sì, il PUSH si CHIEDE** ogni volta, e a blocchi. Forma: `git -C <percorso> push`.
8. ⛔ **Ownership solo su `harness-ui/`**. `mobile/`, `control-plane/`, `core/`, `docs/` sono di
   altre lane: si leggono, non si scrivono.
9. ⛔ **Ogni funzione si prova ANCHE AL CONTRARIO**: una guardia che non fallisce sul codice
   sbagliato non è una guardia. Verificalo per mutazione.
10. ⛔ **Rispondere sempre in italiano**, all'owner e nei commenti.
11. ⛔ **Niente nomi di agenti AI nel codice** (Claude, Codex, Astra, Fable, GPT, Opus…): il repo
    si pubblica. Restano solo gli id modello e i percorsi che sono contratto.
12. ⛔ **I lavori grandi si delegano**: massimo **5 subagenti**, modello **Opus 5**, effort **high**,
    con **aree di file disgiunte** (due agenti sullo stesso file = riconciliazione a mano).
13. ⛔ **Ogni fase chiude con tre domande**: *Cosa devi fare tu · Cosa faccio io · Cosa rimane*.
    Prove e numeri nel commit e nel ledger, non nel messaggio.
14. ⛔ **Corsa continua**: sugli step approvati non si chiede permesso, si va.
15. ⛔ Il modello per le prove a pagamento è **fascia flash** (`glm-5.3-flash`, `gemini-3.8-flash`),
    mai i modelli di punta.

---

## 3 · COSA HO FATTO OGGI (già pushato, `581f1575`)

| tema | esito misurato |
|---|---|
| Browser: finestra a tutto riquadro | riquadro **571 → 962 px**, scoperto **0** |
| Browser: fotogrammi | tetto **15 → 60 fps come pavimento**; misurati **32,3 fps** con la pagina in movimento |
| Browser: niente finestre di Chrome | headless; finestre visibili **1 → 1** (misurato 599 fotogrammi identici in headful/coperta/headless) |
| Browser: la tela non resta incollata cambiando scheda | `dueInsieme: false` in 5 passaggi su 5 |
| Browser: la scelta «Pagina» si ricorda per scheda | verificata uscendo e tornando |
| **Loop del modello locale** | causa trovata: **398 chiamate, 398 id, 795 frammenti** → il nostro assemblaggio era innocente; causa a monte llama.cpp #1613. Cura: stessa firma 3 volte → flusso chiuso |
| **Stop immediato** | da **180 s** a **< 250 ms** (`AbortSignal.any` + gara con la lettura) |
| CSP del terminale | **12 errori → 1** (l'ultimo è dentro xterm) |
| Icone inesistenti | `icon()` valida contro lo sprite, ripiego visibile |
| Model picker locali | lista **683 → 410 px**, nessuno scorrimento, nome **102 → 50** caratteri |
| Nomi di agenti nel server | Codex 9→0, Opus 1→0, ChatGPT 1→0, Claude 12→3 (contratto) |

---

## 4 · ⛔ DUE LAVORI ERANO IN CORSO QUANDO I CREDITI SONO FINITI

**Non sono nel repo**: due subagenti stavano lavorando e il loro risultato **è andato perso**.
Vanno **rifatti da capo**. Ecco esattamente cosa avevano in mano.

### 4.1 · LA DELEGA AI SOTTO-AGENTI — il più grave della coda
Owner: *«non hai provato un cazzo di sta cosa quindi è molto flaky»*. **Ha ragione: non è mai stata
provata.** Quattro difetti, tutti sulla stessa run, tutti visti negli screenshot dell'owner:

1. ⛔⛔⛔ **La sessione delegata gira in `C:\`, la RADICE DEL DISCO.** Tre conferme indipendenti sulla
   stessa schermata: il badge del Terminale dice `C:\`, il piede dice «Aperta da te · `C:\` ·
   connessa», e il progetto in basso a sinistra è `C:\` invece di `progetto-5`. Un sotto-agente con
   «Accesso pieno» che lavora nella radice del disco può toccare qualunque cosa sulla macchina.
2. **Il figlio riceve un percorso di un altro sistema operativo**: `cartella: /home/user/app` →
   `REFUSED: la cartella non esiste su questo computer`. Il rifiuto è giusto, il difetto è a monte:
   nessuno dice al figlio dove lavora la madre, e il modello inventa. ⚠️ Un commit del 07/09
   dichiarava questo curato: o non copre il caso, o è regredito. **Verificalo.**
3. **La scheda «Agenti» resta vuota** mentre due sotto-attività sono in corso. È **O-10**, che il
   registro dell'owner vuole chiusa «con una **foto della scheda piena**, non con una riga di codice».
4. Le deleghe compaiono come **sessioni separate** nella barra a sinistra, non come figlie.

**Cosa l'owner chiede di provare, esplicitamente:** due deleghe **in parallelo**; due **una dopo
l'altra**; entrambe **nello stesso workspace e nella stessa cartella della madre**.

### ⭐ LA CAUSA DEL `C:\` È STATA TROVATA — ecco la catena esatta, verificata sulla run vera

Ispezione fatta l'08/09 su `harness-ui/.sessions-store/*.jsonl`. **Nessun codice è stato scritto**:
la cura va ancora fatta, ma non serve più cercarla.

| sessione | ruolo | `padreId` | `cartella` nell'intestazione | `contesto.cartella` in `RunStarted` |
|---|---|---|---|---|
| `e02f5d85-…` | **madre** | `null` | `…\banco-umano\progetto-5` | `…\banco-umano\progetto-5` |
| `95739a76-…` | figlia (Parte 1) | `e02f5d85-…` | `…\banco-umano\progetto-5` | **`C:\`** |
| `10202042-…` | figlia (Parte 2) | `e02f5d85-…` | `…\banco-umano\progetto-5` | **`C:\`** |

⭐ **L'intestazione è giusta, il contesto d'esecuzione no**: la cartella corretta viene passata e
persino scritta su disco, e poi viene **allargata a `C:\` un istante dopo**.

**La catena, file per file:**
1. `harness-ui/src/subagent-orchestrator.mjs:~250` — `delegaSottoTask` chiama `avviaESeguiFn({…,
   cartella: dove, …})`. `dove` **è corretto**. Ma **non passa `cartellaGiaScelta`**.
2. `harness-ui/src/session-registry.mjs:1881` — nella firma di `avviaESegui`,
   `cartellaGiaScelta = false` è il **default**: la delega ricade nel ramo «parto stretto, mi allargo».
3. `harness-ui/src/session-registry.mjs:1971` — la voce nasce con
   `cartella: cartellaEffettivaPerPermessi(cartella, permessiEffettivi, cartellaGiaScelta)`.
4. `harness-ui/src/session-registry.mjs:1840-1843` — **qui muore il valore**:
   ```js
   function cartellaEffettivaPerPermessi(cartellaBase, permessi, cartellaGiaScelta = false) {
     if (cartellaGiaScelta) return cartellaBase;
     return permessi === 'Full access' ? parsePath(cartellaBase).root : cartellaBase;
   }
   ```
   La figlia **eredita `Full access`** dalla madre (ed è giusto che lo erediti) → `.root` → **`C:\`**.

⛔ **È la QUARTA occorrenza della stessa famiglia di difetto.** Il commento sopra quella funzione
(righe 1809-1839) elenca già i casi (a) allowlist — l'unico che *deve* allargare —, (b) `avviaLibero`
(curato 03/9), (c) `avvia()` dei task di catalogo (curato 04/9). **La delega è il caso (d), mai
considerato**: una figlia non ha *niente da cui allargarsi*, la sua cartella è per definizione
esattamente quella della madre.

⚠️ **Il commit del 07/09 non è regredito: era INCOMPLETO.** La cura c'è ed è viva
(`harness-ui/src/kernel/talosHarness.mjs:6141-6170`, cartella facoltativa col default della madre):
copriva *quale percorso viene passato*, non *cosa il registro ne fa dopo*.

### ⛔ E SOTTO C'È UN SECONDO DIFETTO, indipendente
`harness-ui/src/kernel/dist/kernelPerIlBanco.js:3-5`:
```js
const radice = o.radice.replace(/[\\/]+$/, "");   // "C:\"  ->  "C:"
```
Su Windows `"C:"` **non è la radice del disco**: è il percorso relativo al drive, cioè la *current
directory* del processo. Chiamato da `talosHarness.mjs:4590` (`discoNode({ radice: cartella })`).
**Prova sul campo:** nella run vera `cerca {nome:"."}` ha risposto con **13 file** che sono
esattamente quelli nella radice di `harness-ui/` — la cartella del server, non `C:\`.
⇒ Anche curato il punto (4), **questa riga va difesa comunque**: una sessione legittimamente a `C:\`
(l'allowlist con Full access) oggi non legge `C:\`, legge la cartella del server.

### Il danno misurato: la delega non ha funzionato, e nessuno ha protestato
Figlia 1 (16 tool call) e figlia 2 (21): `scrivi` → `EPERM … mkdir 'C:\'`; `document_create` →
**6 tentativi** tutti `EPERM`, poi il modello gira attorno all'ostacolo provando `Temp/`,
`Users/Public/`; `leggi package.json` → `ENOENT 'C:\package.json'`; `shell` → `[sandbox: wsl2] /mnt/c`.
**Zero file scritti nel workspace.** La figlia ha ripiegato su un `artifact_create` e nel riassunto
alla madre ha scritto «*a causa delle policy di permessi in scrittura EPERM sulla root…*».
⇒ **La delega ha prodotto un artefatto invece del PDF chiesto, e il sistema non se n'è accorto.**

### ✅ IL PUNTO 1 È CHIUSO — commit `da8df6f1` (08/09, 11:45)
`cartellaGiaScelta: true` aggiunto alla chiamata in `subagent-orchestrator.mjs:259`, col commento
che spiega la famiglia di difetti (caso «d») e la misura. Due prove nuove in
`tests/subagent-orchestrator.test.mjs`, e **la verifica che conta**: togliendo la riga della cura
**1 prova diventa rossa**, rimessa **25/25**. Server **1757/1757**.
Ricerca citata nel commit: dev.to «Giving an AI agent permission to spawn sub-agents (without losing
control)» (08/09/2026) — il workspace di una delega «resolves against the parent's root», l'eredità
va «downgraded by default», e «if every subagent inherits the parent token, it recreates sudo with
better branding».

### ⛔ COSA RESTA DELLA DELEGA — in ordine
1. ✅ **CHIUSO — commit `23eb8fdb`** (08/09, 12:05). `kernelPerIlBanco.js` riduceva `"C:\"` a `"C:"`,
   che su Windows è la **directory corrente**, non la radice.
   **Misurato**: `readdir("C:")` → 34 voci (`.automations`, `.hooks-trust`, … cioè `harness-ui/`),
   `readdir("C:\")` → 47 voci (`$RECYCLE.BIN`, `AMD`, … la radice vera).
   ⛔ E l'ipotesi ereditata era **sbagliata**: accusava `path.join`, che invece normalizza
   (`join("C:", x)` → `C:\x`). Il difetto era nel ramo di `dentro()` col percorso **vuoto**, che
   restituisce la radice grezza senza passare da `join`. **La misura ha scagionato `join`** — è la
   ragione per cui in questo progetto si misura invece di leggere.
   Tre prove in `tests/radice-disco-windows.test.mjs`; togliendo la guardia 1 diventa rossa.
2. ✅ **CHIUSE — commit `ab2b5e1b`** (08/09, 12:33). `tests/delega-parallelo-sequenza-cartella.test.mjs`,
   **sul registro VERO** (`avviaESegui`, eredità dei permessi e `cartellaEffettivaPerPermessi` veri,
   `existsSync` vero su cartelle vere del disco): finto è solo il modello, quindi **costo zero**,
   nessun giro pagato. ⛔ Le prove che c'erano non potevano vedere il difetto: fermavano la finzione
   a `avviaESeguiFn`, cioè **sopra** il piano in cui il difetto viveva.
   **1/3 parallelo**: due `onDelega` senza await in mezzo → 3 avvii, due figlie vive **insieme**,
   entrambe nella cartella della madre, con «Full access» e `glm-5.3-flash` ereditati; concluse al
   contrario, le due promesse non si scambiano. **2/3 sequenza**: prima conclusa (zero figlie vive),
   poi la seconda — stessa cartella, compiti distinti e in ordine. **3/3 stesso workspace**: cartella
   con uno spazio nel nome, arriva alla figlia intatta.
   ⭐ **AL CONTRARIO, misurato**: tolta `cartellaGiaScelta: true`, tutte e tre diventano rosse con
   `actual: 'C:\'` — **riproducono esattamente la run dell'owner**. Rimessa: verdi.
   ⛔ Un rosso trovato per strada era **mio**, non del prodotto: il modello finto risolveva la
   promessa senza emettere `RunFinished`, e solo quell'evento porta `voce.conclusa = true`
   (`session-registry.mjs:1540`, sempre emesso da `agent-service.mjs:149`). Un fake che non imita il
   vero misura il fake.
   🔎 **Debito NUOVO, dalla ricerca** (Nous Research, 08/09/2026, «Subagent Delegation» e
   «Delegation & Parallel Work»): Hermes v0.11.0 (aprile 2026) ha un «file coordination layer» contro
   due figlie concorrenti che si sovrascrivono i file, e `delegation.worktree_isolation` per dare a
   ogni figlia un git worktree. **Noi non abbiamo né l'uno né l'altro**: la delega in parallelo è
   sicura solo su compiti che LEGGONO o che scrivono file **diversi**. Il loro tetto di concorrenza
   è inoltre un default di 3 senza soffitto duro; il nostro 10 è duro.
   ⛔ **Resta fuori, dichiarato**: che il MODELLO scelga di delegare, e che il giro vero scriva file
   sul disco. Quella è una prova **dal vivo**, e non è stata fatta.
3. **La scheda «Agenti» che resta vuota** (O-10) — il dato c'è (`padreId` e `taskId: 'delega:…'`
   persistiti nel JSONL, `elencaFigli()` li espone): il sospetto **non verificato** è che la scheda
   legga solo la mappa in memoria. Si chiude **con la foto della scheda piena**.
4. **Le figlie compaiono come sessioni separate** nella barra a sinistra: la sidebar probabilmente
   non filtra su `padreId !== null`. **Non verificato.**
5. ✅ **LETTI TUTTI E CINQUE — uno era rotto davvero. Commit `044b52aa`** (08/09, 12:43).
   · **2316** (reindirizzamento) e **2935** (`resume`): passano `voceEsistente`, quindi NON
     ricostruiscono la voce e non ripassano da `cartellaEffettivaPerPermessi` — al sicuro. Il ramo
     che lo decide è `voceEsistente ?? {...}` a `session-registry.mjs:1964`: l'allargamento vive
     solo dentro la costruzione di una voce NUOVA.
   · **2700** (`avvia`, catalogo) e **2760** (`avviaLibero`): passano già la bandiera — al sicuro.
   · **2808** (`forka`): crea una VOCE NUOVA e **non passava `cartellaGiaScelta`**. ⛔ Difetto vero:
     si forka una sessione avviata su una cartella scelta a mano (che passa obbligatoriamente da
     «Full access») e il fork lavora in `C:\`. Misurato dalla prova prima della cura:
     `actual: 'C:'` — lo stesso `EPERM mkdir 'C:'` della delega.
   ⭐ **È la terza volta che `forka` dimentica qualcosa per lo stesso motivo**, e la sua doc lo
   racconta già due volte: i permessi (28/8, trovati da un test) e `permessiPerAttrezzo` (28/8,
   proattivo). Un fork crea una voce nuova ⇒ **tutto ciò che la voce deriva va ripassato per nome**.
   La cura ripassa i due pezzi da cui la cartella si DERIVA — `cartellaBase` e la bandiera — non il
   risultato: così il fork riproduce l'originale anche più tardi, se il permesso viene alzato a metà
   conversazione (`aggiornaImpostazioni` rifà lo stesso calcolo sugli stessi due campi).
   ⛔ Due prove, non una: quella che morde, e quella **AL CONTRARIO** che difende il caso legittimo
   (una sessione dell'allowlist con «Full access» lavora nella radice per scelta dell'owner, e il
   suo fork deve **restare** allargato). Senza la seconda la cura sarebbe stata una regressione
   invisibile.

### Cosa NON è stato verificato (dichiarato dall'agente)
- **Tutto il frontend**: scheda «Agenti» vuota e deleghe come sessioni separate — nessuna riga di UI
  letta, nessuna foto. ⭐ Ma il dato c'è già: le figlie hanno `padreId` e `taskId: 'delega:<madre>'`
  persistiti nel JSONL, ed `elencaFigli()` in `subagent-orchestrator.mjs` li espone.
  Sospetto **non verificato**: la scheda legge solo la mappa in memoria, e la sidebar non filtra le
  sessioni con `padreId !== null`.
- Il comportamento di `join('C:', x)` non è stato confermato con uno script (la deduzione regge sui
  13 file contati nella run vera). ⛔ Confermalo con uno **script su file**, mai con `node -e`.
- ✅ ~~Altri quattro chiamanti di `avviaESegui`~~ — letti tutti, `forka` era rotto, curato in
  `044b52aa` (vedi §4.1 punto 5).

### 4.2 · LA BARRA LATERALE DESTRA, MIGLIORE DI TUTTI
### ⭐ LA RICERCA È GIÀ FATTA — non rifarla, verificala e usala

Tutte le fonti consultate l'**08/09/2026**. ⛔ Sono citazioni di un altro agente: **riverificale**
prima di appoggiarci una decisione, non darle per buone (regola §0).

| riga | **Hermes Agent** | **Claude Code** | **Codex** |
|---|---|---|---|
| Dove sta il pannello | Web dashboard su `localhost:9119`, tre colonne | **Nessun pannello**: statusline + `/usage`, `/context`, `/cost` a richiesta | Tab nella sidebar di ChatGPT desktop |
| Attrezzo in corso | Blocchi collassabili **dentro la chat**, streaming ANSI | Nel transcript | Nel thread |
| Consumi | Analytics: barre per giorno, tabella per modello, **cache hit %** | `/usage` (sessione), `/context` (ripartizione della finestra) | Il consumo dei figli **si somma al goal radice** |
| Sotto-agenti | **Nessuna vista** nel dashboard; overlay `/agents` da aprire a mano | Citati in `/context`, nessuna vista viva | Thread figli, costo sommato al padre |
| Cadenza | **Polling 5 s** (Status, Logs); chat via WebSocket | A ogni turno; il resto a richiesta | non documentato |

⭐ **Il buco che dichiarano loro stessi:** issue **#40294** su `NousResearch/hermes-agent` —
*«Persistent right-side dashboard panel for Hermes TUI: there's no way to glance at token spend,
git branch, todo items, or subagent activity **without opening overlay panels**»*.
⇒ **Noi quel pannello persistente ce l'abbiamo già.** Il +1 non è averlo: è cosa ci mettiamo dentro.

**Fonti, con data (08/09/2026):**
- `hermes-agent.nousresearch.com/docs/user-guide/features/web-dashboard` — pannelli, Analytics, auto-refresh 5 s
- `github.com/NousResearch/hermes-agent/issues/40294` — il pannello persistente che chiedono
- `deepwiki.com/nousresearch/hermes-agent/3.4-web-ui-dashboard` — `AnalyticsPage`, `TokenBarChart`
- `fast.io/resources/claude-code-usage-guide/` — `/usage`, Account & Usage in VS Code ≥ 2.1.174
- `getunblocked.com/blog/claude-code-context-window/` — `/context`, statusline, `claude-hud`
- `pas7.com.ua/blog/en/codex-subagents-explained-2026` — sotto-agenti Codex, budget del goal radice
- `vercel.com/design/guidelines` — **show-delay 150-300 ms**, **min visible 300-500 ms** contro lo sfarfallio
- `developer.mozilla.org/.../aria-live` + `a11y-collective.com/blog/aria-live/` — `aria-live="polite"`, throttling degli annunci
- `braintrust.dev/articles/agent-observability-complete-guide-2026` — cosa contiene una traccia

### Il nostro +1, riga per riga (una FUNZIONE, non un aggettivo)

| riga | il +1 | perché nessuno dei tre ce l'ha |
|---|---|---|
| Attrezzo in corso | Card «Adesso» col **cronometro** e **gli argomenti che si scrivono da soli** (i delta `ToolCallArgs` arrivano davvero a pezzi) | Hermes mostra gli argomenti solo a chiamata **conclusa** |
| Output | Ultime N righe dell'esito **nel pannello**, col conteggio dei caratteri | Tutti e tre lo lasciano scorrere via nella chat |
| Consumi | **«Chi li sta bruciando»**: classifica degli attrezzi per caratteri riportati nel contesto | `/context` ripartisce per **categoria statica**, Hermes per **modello e giorno**: nessuno dice *quale chiamata* ha gonfiato la finestra |
| Uso strumenti | Conteggio per attrezzo con esito **e chiamate identiche ripetute** | Nessuno segnala la ripetizione — è il segnale precoce che l'agente gira a vuoto (ed è esattamente il loop del modello locale di oggi) |
| Sotto-agenti | Riga viva con `evidenzaDelega`, ricaricata **a evento** | Hermes non ha vista sotto-agenti; Codex somma solo il costo |
| Cadenza | Evento **con coalescing**, non polling | Con polling a 5 s un attrezzo che dura 2 s **può non comparire mai** |

### ⛔ I TRE BUCHI NEL NOSTRO CODICE — trovati, non curati

**`harness-ui/frontend/src/legacy/app.js:12208-12210`** — il registro `eventiAttrezzi` si riempie
qui, e **scarta `content` del `ToolCallResult`** (commento: «il content può essere enorme»). Quindi:
1. **l'output dell'attrezzo non è disponibile** al pannello benché arrivi dal server;
2. **il codice d'uscita non arriva mai**: `inspector.js:271` legge `e.uscita`, nessuno lo scrive →
   mostra sempre il ripiego `errore ? 1 : 0`, cioè **un numero finto**;
3. **la dimensione dell'esito** non è registrata → «chi brucia il contesto» non è calcolabile.
⇒ La cura è **una riga**: aggiungere `caratteri: String(evento.content).length` (e `uscita` quando
estraibile) al record. È l'unica modifica fuori dall'area del pannello.

**Dati che ci sono già e non vengono mostrati nella colonna:**
- `riassuntoAttrezziDaEventi` (`app.js:2348-2380`) calcola **già `ripetute`** — usato solo dalla
  pagina Capability, mai dall'inspector;
- `usageSessione` vs `usage` (turno) — `app.js:335-345`, nel piede della chat, non nella colonna;
- `HookInvoked` — nessun consumatore;
- `nomeUmanoAttrezzo` / `descrizioneAttrezzo` (`components/nomi-attrezzi.js:85,181`) — pronti, inusati.

**Eventi che il server manda già** — `harness-ui/src/agui-events.mjs`: `RunStarted` (22, porta
`contesto`), `ToolCallStart` (108), `ToolCallArgs` (114, `delta` a pezzi), `ToolCallResult` (118,
`content` intero), `StateDelta` (122, con `eventoPerUsage` cumulativo), `ArtifactCreated` (135),
`ApprovalRequested` (176), `HookInvoked` (222).

**Dove si disegna oggi:** `harness-ui/frontend/src/components/inspector.js` (275 righe) —
`disegnaAgenti` (160-186) legge già le deleghe vere da `GET /api/v1/sessions/:id/children` con
`evidenzaDelega`; `aggiornaInspector` (208) **riscrive TUTTA la colonna a ogni chiamata**
(`replaceChildren`), ed è invocata da **27 punti** via `syncRunComposerState()`. Nessun coalescing.
**Markup:** mockup righe **2670-2711** (`#inspectorSessione`, `#railTabs`, `#railContesto` 2680,
`#railFile` 2700, `#railAgenti` 2708, `#railProcessi` 2711). CSS `.talos-inspector*` 949-959.
⚠️ **La colonna sparisce sotto i 1240 px** (mockup riga 1277): a 1024×800 non si vede — è una scelta
di progetto, non un difetto, ma va saputo prima di scattare le foto.

### Il passo successivo esatto
1. La riga in `app.js:12210` (`caratteri`, `uscita`).
2. Nuovo componente `components/adesso.js` con funzioni **pure** (da `eventiAttrezzi` + `usage` +
   `usageSessione` alle righe) e un quinto pannello `#railAdesso` **primo**, nel mockup a riga 2673.
3. Sostituire la riscrittura totale con **coalescing su `requestAnimationFrame` + intervallo minimo
   dichiarato**, misurando prima il costo di un render con `performance.now()`:
   ⛔ **la cadenza si misura, non si sceglie a naso**.

### Tre difetti visti in una foto della 4314, non curati e non miei
1. La modale «Primo avvio · 2 di 4» si riapre a ogni caricamento e copre metà schermo.
2. «Finestra del contesto» mostra `1310,7k` e `1295,1k · 98,9%`: i separatori italiani a quattro
   cifre rendono il numero illeggibile — **e va verificato se la finestra dichiarata sia vera**.
3. Tutte e quattro le righe di «Ambiente» sono `—` su una sessione viva con workspace reale:
   sospetto (**non verificato**) che `RunStarted.contesto` non sia rigiocato al **replay** di una
   cronologia, solo dal vivo.

### Cosa NON è stato verificato
- Nessuna misura del **costo del render** né della **frequenza degli eventi** in un giro vero.
- Le foto a **1280×800** e **1024×800** sono state scattate e **mai aperte**.
- Se `/api/v1/sessions/:id/children` restituisca il **consumo** del figlio (serve per sommare i
  token dei sotto-agenti come fa Codex).
- Se qualche cancello (`cancello-superfici`, `cancello-funzioni-morte`, `cancello-testo`) respinga
  un quinto pannello o un componente nuovo.

---

### Il contesto originale del compito (per riferimento)
Owner: *«nella barra laterale che si deve aggiornare automaticamente… voglio che si visualizzino
comandi, tool o output correnti degli agenti, consumi, usi degli strumenti — dobbiamo fare meglio di
tutti sia a livello UI e UX che funzionalità (delega a sub agente)»*.

Serve **prima** una ricerca competitor su **Hermes Agent** (il riferimento dichiarato), **Claude
Code** e **Codex**, più le best practice di UX per i pannelli in tempo reale; poi una tabella
«cosa fa ognuno → qual è il nostro **+1**», dove il +1 è **una funzione, non un aggettivo**.
Priorità nominate dall'owner: (a) comando/attrezzo in corso col suo output · (b) consumi: token,
costo, cosa li brucia · (c) uso degli strumenti: quali, quante volte, con che esito · (d) i
sotto-agenti: cosa fanno, dove, e come si fermano.
File: `harness-ui/frontend/src/components/inspector.js` disegna la colonna destra. **Verifica prima
quali eventi il server già manda** (`ToolCallStart`, `ToolCallArgs` in `harness-ui/src/`): molto del
dato potrebbe già arrivare senza essere mostrato.
⚠️ Un pannello che cambia venti volte al secondo è rumore: scegli una cadenza e **misura perché**.

---

## 5 · LA CODA, IN ORDINE DI GRAVITÀ

1. **La delega in `C:\`** (§4.1 punto 1) — sicurezza, viene prima di tutto.
2. ✅ ~~Le tre prove della delega~~ — chiuse, commit `ab2b5e1b` (vedi §4.1 punto 2). Resta la prova
   **dal vivo** col modello, tenuta insieme al punto 5 qui sotto perché costa un giro pagato.
3. **La scheda Agenti** che si popola davvero, con la foto che lo dimostra (O-10).
4. **La barra laterale** (§4.2).
5. **Il giro vero col modello** che chiude le **19 righe «curate ma mai viste funzionare»**
   (O-10, O-26, O-31, O-34, O-35, O-36, O-37, T09-D4, T02-D1, T20-D4 e sei `NV-*`): una sessione
   vera con un modello flash e le foto. È anche il blocco 2 della release.
6. **La prova da macchina pulita**: il pacchetto si installa e gira, ma solo su questa macchina dove
   Node e la chiave c'erano già. È l'unico dei cinque blocchi di release non chiuso.
7. **Le tracce di agenti nel FRONTEND** (la metà server è fatta): `harness-ui/frontend/**`, ~35 file.
   ⛔ E la **storia dei commit**: 122 righe `Co-Authored-By` negli ultimi 400 e 50 titoli su 300 che
   nominano un agente. Non si toglie con un commit: **decisione dell'owner** — riscrivere il ramo o
   accettare.
8. **BH-04** — «English» traduce i menu ma non i titoli (25 `data-t` contro 45 `<h2>`): o si traduce
   davvero, o si dichiara parziale.
9. **T15-D1/D2** — due sezioni dicono ancora «non è ancora disponibile qui».
10. **I 193 punti dell'audit decisioni** — ⛔ l'owner ha deciso: **si rifanno poco prima della
    release, per consolidare**. Non ora.
11. Debito minore: 7 funzioni morte in `app.js`, 2 veli irraggiungibili, 1 errore CSP dentro xterm,
    14 codici d'errore senza stato dichiarato, la differenza d'ordine in `COMP Browser`.

---

## 6 · TRAPPOLE DI QUESTO REPO — ognuna è già costata

- ⛔ **Gli escape non sopravvivono alla shell.** Scrivendo file con heredoc, `\b` è diventato un
  byte 0x08 e `[\\/]` è diventato `[\/]` (che su Windows non spezza i percorsi). **Scrivi gli
  script su file**, mai con heredoc, e mai backtick dentro `node -e`.
- ⛔ **`String.raw` non può finire con un backslash**: sfugge il backtick di chiusura e il file non
  compila.
- ⛔ **Node su Windows risolve `/tmp/...` come `C:\tmp\...`**: le foto finiscono altrove e il
  cancello non le vede. Usa percorsi assoluti in stile Windows.
- ⛔ **Il cancello delle foto cerca in `<scratchpad>/prove/foto/`**, non in `<scratchpad>/foto/`.
- ⛔ **Non fidarti di un conteggio di test preso mentre il server si riavvia**: una suite ha dato
  «1 riga» invece di «2 righe» perché la pagina era senza CSS. Guarda l'immagine.
- ⛔ **`git add -A` raccoglie lavoro non tuo**: la cartella è condivisa con altre sessioni vive.
  Aggiungi i file per nome, e controlla `git status --short` prima.
- ⛔ **Due regole CSS per lo stesso selettore**: la seconda vince e la prima sparisce in silenzio.
  È successo due volte in un giorno.
- ⛔ **`min-width:0` da solo non basta** per l'ellissi in un flex: se `flex-shrink` è 0 non c'è
  larghezza contro cui calcolarla.
- ⛔ **Un ResizeObserver su un nodo che viene ricreato** smette di funzionare in silenzio: osserva
  un contenitore stabile.

---

## 7 · COME PARLARE ALL'OWNER

- Italiano, sempre. Niente scuse, niente preamboli, niente «vuoi che proceda?».
- I numeri prima delle parole: «da 12 errori a 1», non «migliorato molto».
- Se una cosa non è stata verificata, **dillo con la formula**: `⛔ NON VERIFICATO: <cosa e perché>`.
- Chiudi ogni fase con **Cosa devi fare tu · Cosa faccio io · Cosa rimane**.
- ⛔ E la regola con cui questo ticket si apre: **davanti a un'incertezza, chiedi. Non assumere.**

---

## 8 · REGISTRO DI AVANZAMENTO — l'ultima cosa scritta prima di fermarsi

> Aggiornato a ogni passo. Se l'ultima riga dice «in corso», quel lavoro **non è finito** e va
> ripreso da lì: il `git status` ti dice se è rimasto qualcosa sul disco.

| ora | passo | stato |
|---|---|---|
| 11:20 | Ticket consegnato, tutto pushato fino a `581f1575` | ✅ albero pulito |
| 11:25 | Avvertenza «il lavoro potrebbe non essere committato» + questo registro | ✅ |
| 11:45 | **La delega non gira più in `C:\`** — cura + 2 prove che mordono, commit `da8df6f1` | ✅ server 1757/1757 |
| 12:05 | **`"C:"` non è più letto come la radice** — cura + 3 prove, commit `23eb8fdb` | ✅ server 1760/1760 |
| 12:20 | Scheda «Agenti» vuota: **campo ristretto**, causa non ancora trovata (§8.1) | 🔎 diagnosi, nessun codice toccato |
| 12:25 | **O-10 CHIUSO con la foto della scheda piena** (§8.1): non era rotta | ✅ nessun codice da cambiare |
| 12:33 | **Le TRE PROVE della delega chiuse** — parallelo, sequenza, stessa cartella, sul registro VERO, commit `ab2b5e1b` | ✅ server 1763/1763 |
| 12:43 | **`forka` finiva in `C:\`** — terzo caso della famiglia, cura + 2 prove (una al contrario), commit `044b52aa` | ✅ server 1765/1765 |
| 12:44 | 4174 **riavviato col codice nuovo** (`npm run aggiorna`) e risponde 200 | ✅ processo 27092 nato alle 12:44:11 |
| 12:52 | **PUSHATO** su `lane/harness-desktop`: `23eb8fdb..044b52aa` | ✅ albero pulito, niente in sospeso |
| 13:20 | **`npm run verify` era rotto da me** dal `d706c8fe` (config cancellato, riferimento rimasto): riparato, e ha trovato **due difetti veri del browser** — mockup in contraddizione con sé stesso, e nome delle schede che ignorava il contenuto. Commit `2501833d` | ✅ unit 453/453, parità 120/120 |
| 13:45 | **La barra mostra l'ALBERO delle deleghe**: figlie annidate sotto la madre, compatte, con la linea tree (richiesta owner a metà lavoro). Tre difetti trovati nelle FOTO e curati. Commit `dff4d2ef` | ✅ server 1766/1766, foto C44-C50 ispezionate |
| 09/09 ~16:10 | **Astra finisce i crediti a metà di F5c** (Context Manager). Lavoro sul disco non committato: 14 file, sei foto mai annotate. Consegna v004: `.claude/CONSEGNA-ASTRA-A-CLAUDE-2026-09-09-v004-134857Z.md` | ⚠ |
| 09/09 19:08 | **Lavoro di Astra messo al sicuro**: foto aperte e registrate, commit `25cf2602` su `codex/talos-context-engine` (worktree AVM-context-engine). Unit 475/475, browser context 2/2 | ✅ |
| 09/09 19:03 | **Repo privato senza ignorati** (`.claude/`, `CLAUDE.md`, `AGENTS.md`: 1.345 file, 453 MB), commit `8173622c`, **pushato** `dff4d2ef..8173622c` con i 13 commit di Astra dell'08/09 | ✅ |
| 09/09 19:10 | **Consegna v005 scritta**: `.claude/CONSEGNA-CLAUDE-2026-09-09-v005.md` (puntatore in `CONSEGNA-ASTRA-A-CLAUDE-LATEST.md`) | ✅ |
| 09/09 19:23 | **F5c punti 1-3 chiusi** (click solo apre · misura nella modale con ora e freschezza · fine compattazione), commit `175cc2ef` pushato. Package 75/75, backend 25/25, unit 477/477, browser 2/2, tre foto ispezionate | ✅ |
| 09/09 20:20 | **D1 fatto — quattro giri veri con glm-5.3-flash, quattro difetti curati** (byte≠token, ragionamento, citazioni elise, budget di uscita); il quarto giro chiude il ciclo con compattazione committata. Commit `a08f9cef` pushato. Package 83/83, backend 117/117, 204 foto ispezionate | ✅ |

### 8.1 · Scheda «Agenti» vuota — quello che è già ESCLUSO, per non rifarlo

Diagnosi fatta l'08/09 alle 12:20, **senza toccare codice**. Tre ipotesi cadute, una resta.

**✅ Il server risponde, ed è giusto.** Verificato dal vivo con una lettura sul 4174 (consentita):
```
GET /api/v1/sessions/e02f5d85-b610-4e3b-8a91-a7589e5863c6/children
→ {"ok":true,"data":{"figli":[{"sessionId":"95739a76-…","task":"Scrivi la PARTE 1 …
```
Le figlie ci sono, col task completo. **Il buco non è nel server.**

**✅ Il frontend ha la funzione, e la chiama.** `app.js:7964` `caricaFigliSessione()` legge la rotta
e riempie `state.realSession.figli`; `app.js:7954` lo passa all'inspector come `agenti`.
È invocata da **quattro** punti: `12395` (quando parte `delega_sottotask`), `12445` (quando finisce),
`12615` (a giro concluso), `13513` (all'apertura della sessione).

**✅ Il nome dell'attrezzo combacia.** Il frontend aggancia su `delega_sottotask`, e nel kernel
l'attrezzo si chiama esattamente così (7 occorrenze).

### ✅ RISOLTO IL 08/09 alle 12:35 — LA SCHEDA NON È ROTTA

**Provata dal vivo sul 4174, e si popola.** Aprendo la sessione madre **cliccandola nella barra**
(non via `location.hash`, che non naviga), la scheda «Agenti» mostra due righe piene:

    Scrivi la PARTE 1 di un paper tecnico…   [Conclusa]      Avviata 11:00   16 chiamate · 0 scritture
    Scrivi la PARTE 2 di un paper tecnico…   [Non riuscita]  Avviata 11:04   22 chiamate · 0 scritture

Foto: `<scratchpad>/prove/foto/C43/scheda-agenti.png` — **è la foto che il registro dell'owner
chiedeva** («si chiude con una foto della scheda piena, non con una riga di codice»).

⛔ **Perché nello screenshot dell'owner era vuota:** la scheda dipende dalla **sessione attiva**.
Se attiva non è la madre — e nel suo screenshot la barra mostrava due sessioni «Delega» separate —
la scheda dice il vero: *quella* sessione non ha sotto-agenti. Non è un difetto della scheda: è il
difetto **4** qui sotto (le figlie compaiono come sessioni a sé), che rende facilissimo trovarsi
sulla sessione sbagliata senza accorgersene.

⭐ E la scheda dice anche un'altra cosa che vale: **«0 scritture» su entrambe le figlie** — la firma
del difetto della cartella `C:\`, curato alle 11:45 con `da8df6f1`. La riga era già uno strumento
diagnostico: nessuno l'aveva letta.

⚠️ Difetto minore visto nella stessa foto, **non curato**: il fumetto «Sotto-agenti» si apre sopra e
copre il titolo della sessione in alto a destra.

**Ipotesi cadute lungo la strada** (non rifarle): il server risponde ed è giusto; `caricaFigliSessione`
(`app.js:7964`) esiste ed è chiamata da 4 punti; il nome `delega_sottotask` combacia; e `figli` **non**
viene azzerato da `nuovaGenerazioneSessione` — l'unico `figli: []` è la definizione iniziale a
`app.js:235`.

**🔎 PISTA CADUTA — tenuta qui perché non venga riaperta.** Se server, funzione, chiamanti e nome sono giusti, il
difetto è nella **sequenza** o in un **azzeramento**. Il sospetto più forte, **non verificato**:
`nuovaGenerazioneSessione` (`app.js:11315-11371`) azzera ~30 campi di `state.realSession` — se
azzera anche `figli` DOPO che `caricaFigliSessione` li ha scritti, la scheda torna vuota senza che
nessun errore lo dica. È lo stesso schema di **CB-07**, dove un campo non azzerato sopravviveva alla
sessione: qui sarebbe il contrario, un campo azzerato di troppo.

**Come chiuderla in tre mosse:**
1. Cerca `figli` dentro `nuovaGenerazioneSessione` e nei punti che riassegnano `state.realSession`:
   se c'è, è quello; se non c'è, è una corsa fra la fetch e il render.
2. Metti una prova che morde sulla funzione pura (`disegnaAgenti` in `inspector.js:155` prende
   `agenti` come argomento: è già testabile senza DOM completo).
3. ⛔ **Si chiude con la FOTO della scheda piena**, non con una riga di codice — è la parola
   testuale del registro dell'owner su O-10.
