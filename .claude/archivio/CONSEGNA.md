# CONSEGNA — leggi questo per primo, poi comincia

> **Override di stato 2026-08-19:** questa consegna conserva vincoli e storia,
> ma la fotografia del §3 è datata. Per lo stato corrente leggere prima
> `mobile/docs/ROADMAP-TALOS-MOBILE-CURRENT-2026-08-19.md` e
> `mobile/docs/HANDOFF-CODEX-2026-08-19.md`. La correzione voce/permessi,
> barge-in e lock-screen è chiusa e rilasciata in `v0.1.13`; Model Lab 4.C-D/E,
> OAuth, reviewer batch e stress test restano distinti e non vanno dichiarati
> chiusi per effetto di quel rilascio.

Sei una sessione nuova su TALOS. Questo file esiste perché l'owner ha chiesto di
travasare una sessione lunghissima in una a mente fresca **senza perdere niente**
— e la sua frase era: «se tralasci qualcosa la sessione parte zoppa».

⛔ **Non è un riassunto della conversazione.** Copiare la conversazione avrebbe
ricreato il problema: il degrado veniva dal contesto lungo. Qui c'è solo ciò che
**non si carica da solo**.

---

## 0. Cosa NON devi leggere, perché ce l'hai già

Su questa macchina, in questo progetto, arriva tutto automaticamente:

| cosa | dove | come arriva |
|---|---|---|
| Le regole vincolanti | `MEMORY.md` (blocco in cima) | caricato a ogni avvio, **e ristampato dall'hook** |
| ~110 memorie | `~/.claude/projects/C--Users-Antonino-Desktop-projects-AVM/memory/` | l'indice si carica, i file si aprono su richiesta |
| Istruzioni globali | `~/.claude/CLAUDE.md` → `RTK.md` | caricato |
| Le 4 guardie | `.claude/settings.json` + `.claude/hooks/` | girano da sole |
| Skill, plugin | registrati globalmente | disponibili |
| Codice, test, ricerche | il repo | sul disco |

⇒ **Non rileggerle in blocco.** Aprile quando servono, per nome.

---

## 1. ⛔ LE QUATTRO GUARDIE — cosa fanno, perché esistono

Sono hook, non consigli. Ti bloccano davvero.

### `mai-push.mjs` (PreToolUse su Bash/PowerShell)
- `git -C <percorso> push` → **chiede all'owner**, e parte solo col suo sì
- `git push` nudo → **negato**. Il 16/8 un `cd` fallito in bash ha quasi spinto
  il repo di sviluppo, coi 392 documenti interni, sul remoto pubblico
- `--force`, `--delete`, `--mirror`, refspec con `+` o `:` → **negato**, è
  riscrittura e la lancia l'owner
- Il corpo di un heredoc è un DATO: un messaggio di commit che *parla* di push
  passa. 32 prove in `prova-mai-push.mjs`

### `non-fermarti.mjs` (Stop)
Blocca il turno se ti fermi senza motivo — promesse al futuro comprese («adesso
faccio», «restano da fare»). Uscita: `⛔ FERMATA: <quale>`.

### `verifica-prima-di-chiudere.mjs` (Stop)
Blocca se hai toccato codice senza provarlo. Uscita:
`⛔ NON VERIFICATO: <cosa manca e perché>`.

### `dopo-la-compattazione.mjs` (SessionStart, `startup|resume|compact`)
Ti ha appena stampato le regole vincolanti. Su `startup` stampa le regole; su
`compact` ricorda cosa il riassunto perde. Legge anche `.claude/TACCUINO.md`.

---

## 2. Dove sono i repository, e la regola che li separa

    C:\Users\Antonino\Desktop\projects\AVM              sviluppo, privato, 776+ commit
      └─ mobile/                                        l'app
      └─ docs/superpowers/research/                     98 ricerche — NON si pubblicano
    C:\Users\Antonino\Desktop\projects\AVM-PUBBLICA     la copia pubblicabile
    C:\Users\Antonino\Desktop\projects\TALOS-RICERCHE   fuori da git: il blueprint da 112 KB

⛔ **La copia pubblicata NON si tocca a mano.** Si rigenera:

    .\scripts\pubblica.ps1 -Prepara     rigenera + cancelli di sicurezza
    .\scripts\pubblica.ps1              guarda e basta

Lo script: toglie i documenti interni, controlla che il README non citi immagini
assenti, **pretende che ogni screenshot sia firmato** in
`mobile/docs/immagini/APPROVATE.txt`, riporta il bit di esecuzione e **ricrea il
sottomodulo** con il percorso appiattito.

⛔ **La disposizione è DIVERSA nei due repo**: nello sviluppo l'app sta in
`mobile/`, nel pubblicato **quella cartella è la radice**. Ogni percorso scritto
a mano è giusto in uno e falso nell'altro. Il 16/8 questo ha ucciso la CI in 16
secondi. ⇒ Si chiede al checkout dove sta l'app, non si scrive.

---

## 3. STATO AL 16 AGOSTO 2026, ORE 15:40

### ✅ Fatto e verificato

- **`v0.1.0` è PUBBLICATA.** APK firmato, scaricato e verificato:
  firma `CN=TALOS` impronta cert `8abab255…`, pacchetto `ai.talos`, versione
  `0.1.0`, sha256 `b044453f…` identico alle note, `gh attestation verify` → 0,
  legata al commit `0ed47bb` e al workflow.
- **La CI è verde** (con un'intermittenza, vedi §5).
- **Il ponte non ha più bisogno del Debug wireless**: `tcpip` apre la porta 5555
  fissa. Misurato col toggle a **0**.
- **Il repo pubblico è compilabile**: provato clonandolo da zero.
- Schede, README (marchio + modelli locali + disclaimer), suite portatile.

### ⏸️ IN PAUSA — non toccare finché l'owner non dice

**La levetta «Mantieni acceso» non richiude la porta.** Accendere è provato;
spegnere no. La cura c'è (`-s <indirizzo>` invece di `usb` nudo) e compila.

⛔ Owner: «**ignora il primo punto finché io non ti do notizia**».

### 🔧 Lo stato del dispositivo, adesso

    Pad OnePlus (OPD2415)   collegato
    Debug wireless          SPENTO — ed è voluto: dimostra la porta fissa
    porta adbd              5555, viva
    «hey TALOS»             ACCESO, in attesa della voce italiana
    app di prova            ai.talos.dev (side-by-side, non tocca la release)

⛔ Non «ripulire» quello stato: è la dimostrazione di una funzione.

---

## 4. ⛔ LE STRADE GIÀ BRUCIATE — non ripercorrerle

### Il teardown intermittente
`vitest` esce con **1 a zero test falliti**, a intermittenza. Due cure provate e
**misurate**, entrambe peggiorative:

1. `preloadTalosMobileRoutes()` nel setup → **250 test rossi**, setup da 12,6 s a
   122,8 s. Tirare dentro 25 schermi non è un precarico: è eseguire mezza app.
2. Allungare l'elenco dei precarichi di un modulo → **10 test rossi**.

⭐ La lezione: **precaricare un modulo lo ESEGUE.** Funziona solo per moduli
inerti. ⇒ Cercare in *come vitest smonta l'ambiente*, non in cosa si precarica.
Dettagli: `[[teardown-intermittente-due-cure-fallite]]`.

### Il debug wireless
Il toggle di sistema **non si accende senza root** — tre leve misurate e chiuse.
Ma non serve: `tcpip` apre una porta fissa.
`[[il-debug-wireless-non-si-riaccende-da-solo]]`.

### I cinque inciampi della release
NDK assente sul runner · APK fuori dal workspace · `storeFile` relativo → **APK
non firmato con BUILD SUCCESSFUL** · `gradlew` a `100644` → exit 126 ·
**sottomodulo llama.cpp assente nel repo pubblico**.
`[[quattro-inciampi-della-prima-release]]`, `[[la-ricerca-saltata-costa-cinque-muri]]`.

---

## 5. IL LAVORO CHE TI ASPETTA — l'owner lo ha voluto QUI, a mente fresca

Owner: «per la fase piattaforma harness agentica di coding, Zethos, il banco di
prova con le otto personalità e la navigazione dinamica siamo pronti… la testa
fresca ha il compito dei lavori più pesanti».

⇒ **Il primo turno non è implementare. È analizzare e fare domande.**

### 5.1 Leggi questi documenti, in quest'ordine

| # | documento | dove | cosa contiene |
|---|---|---|---|
| 1 | `2026-08-16-harness-engineering-next-gen-v2.md` | `TALOS-RICERCHE/` (112 KB, 6.811 righe) | **Compiled Harness, not Fixed Harness**: compiler puro + selector che impara, 10 invarianti, audit del nostro codice, **5 code review su difetti che TALOS ha ADESSO** |
| 2 | `2026-08-16-zethos-in-casa-o-upstream.md` | `mobile/docs/superpowers/research/` | La decisione: **tutto in casa**, con la tesi del motore co-progettato con i suoi attrezzi |
| 3 | `2026-08-16-motore-locale-al-massimo.md` | idem | Speculative decoding, backend, tool call locali, la matrice di prova |
| 4 | `2026-08-15-navigazione-dinamica-universale.md` | idem | Piano a 3 livelli, e la misura **95%** già fatta |
| 5 | I documenti caricati dall'owner | `~/.claude/uploads/3920e788-…/` | scommesse parte 2, agent OS, source audit DeepSeek Harness |

### 5.2 Il censimento dei competitor

Nominati dall'owner: **pi agent**, **DeepSeek Harness** («everything is a
plugin»), **Codex**. Dalla ricerca: **GUI-Owl / Mobile-Agent-v3** (navigazione),
**MLC-LLM, ExecuTorch, MNN, PowerInfer-2, llama.cpp** (motori).

⇒ Per ognuno: cosa fa, cosa **non** fa, cosa possiamo prendere, dove possiamo
batterlo. Testa a testa con TALOS, **appaiato per compito con intervallo di
confidenza** — non sottraendo due numeri aggregati.

### 5.3 Le domande decisionali

L'owner le vuole «tantissime e super specifiche, con spiegazione e scelte
consigliate». I nodi già noti:

- L'infrastruttura di harness va **condivisa con la chat**, o restano separate?
  (l'owner l'ha messa come «da valutare»)
- Cosa si misura in un confronto fra harness, e cosa si dichiara non misurabile
- Quanto dell'infrastruttura è comune fra **mobile e desktop**
- La sincronizzazione cloud: quali dati, con quale autorità, restando local-first
- Quali componenti diventano «lo standard» e quali restano nostri

### 5.4 Il piano d'attacco

Con **mockup FE** e infrastruttura, predisposto per **desktop** e per una
**possibile sincronizzazione cloud**, restando **local-first**.

⛔ Vincoli che l'owner ha già dato e che NON si rinegoziano:
- **niente mockup se non li chiede lui** — questo li chiede, quindi si fanno
- **tutto legato al theme engine**
- il desktop **esiste già ed è datato**, e finirà nello stesso repo: la radice
  non potrà più essere l'app mobile → `[[esiste-un-desktop-datato]]`

### 5.5 ⭐ E una funzione nuova, aggiunta oggi al piano

**Il barge-in**: «hey TALOS» deve funzionare **anche mentre l'assistente parla**,
interrompendo la voce e riaprendo l'ascolto. Tre ostacoli veri — l'eco, il
microfono che è **uno solo**, l'auto-risveglio quando legge le proprie parole.
Brief completo: `[[barge-in-interrompere-mentre-parla]]`.

### 5.6 Cosa NON va ridiscusso

Owner: «per la navigazione dinamica delle app non penso ci sia altro da
stabilire, stessa cosa per il banco di prova con le otto personalità».
⇒ Quei due piani sono **chiusi**. Si eseguono, non si riprogettano.

---

## 6. Le cose che si fanno spesso, coi comandi esatti

    # provare
    cd mobile && npm run typecheck && npx vitest run
    cd mobile/android && .\gradlew.bat assembleDebug -PtalosSideBySide

    # il dispositivo
    C:\Users\Antonino\AppData\Local\Android\Sdk\platform-tools\adb.exe devices -l
    # ⛔ `adb` NON è nel PATH: serve il percorso intero

    # pubblicare
    .\scripts\pubblica.ps1 -Prepara
    # poi CHIEDI, e solo dopo il sì:
    git -C /c/Users/Antonino/Desktop/projects/AVM-PUBBLICA push

    # consegnare un APK all'owner
    cd mobile && .\scripts\consegna-apk.ps1

⛔ **Trappole della shell, misurate**:
- In bash i backslash dei percorsi Windows **vengono mangiati**: usa `/c/Users/…`
- PowerShell spezza `-Pfoo=0.1.0` sui punti: **quota** l'argomento
- Node su Windows **non capisce** `/c/Users/…`: usa `C:/Users/…`
- `uiautomator dump /sdcard/x.xml` → Git Bash converte il percorso
- Guidare l'app **a coordinate fisse non funziona** dopo una reinstallazione:
  è un debito aperto, serve un modo che non dipenda dai pixel

---

## 7. Chi è l'owner, in dieci righe

Italiano, unico ai commit, GitHub `Ninozzz95`. **Nuovo su GitHub**: si guida un
passo alla volta, dicendo cosa clicca e cosa vede.

- Vuole **corsa continua**: sugli step approvati si va da soli
- **Niente avvisi di contesto**, mai
- **Mai proporre una sessione nuova** (questa volta l'ha chiesta lui)
- I commit sempre; **il push si chiede ogni volta**
- ⛔ Non accetta soluzioni non ambiziose: «qui dobbiamo cambiare il mondo, non
  copiare»
- Se una cosa è provata male, lo vede a colpo d'occhio. È successo tre volte.

---

## 8. ⇒ IL TUO PRIMO TURNO

1. Leggi i documenti di §5.1 nell'ordine
2. Fai il censimento di §5.2
3. Porta all'owner le domande di §5.3 — **specifiche, con la scelta consigliata**
4. Poi, e solo poi, il piano d'attacco di §5.4

⛔ Non implementare niente prima di aver fatto le domande. È il punto critico che
l'owner ha voluto affrontare a mente fresca, e le decisioni sono sue.
