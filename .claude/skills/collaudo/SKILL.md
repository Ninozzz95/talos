---
name: collaudo
description: Collaudo autonomo di TALOS Mobile dalla A alla Z — installazione da zero, giri esplorativi sul dispositivo vero con tocchi reali, strumenti a due colonne (chiave e locale), stress e regressioni. I capitoli si ricavano da git e dal codice a ogni corsa, quindi le modifiche di oggi ci sono senza che nessuno le aggiunga a mano. Da invocare quando l'owner scrive /collaudo.
---

# COLLAUDO — TALOS provato come lo proverebbe una persona

> Owner, 2026-08-09: «un workflow che va dal punto zero dall'impostazione
> iniziale dell'applicazione fino a tutte le ultime modifiche introdotte
> dinamicamente, in modo che tutte le modifiche ultime vengano accorpate a
> questo workflow».

## ⛔ LE SEI REGOLE. Se ne salti una, il verbale è carta straccia

Sono scritte per prime perché ognuna nasce da un difetto vero, misurato, che è
costato ore. Un collaudo che le ignora produce esattamente la cosa che stiamo
cercando di eliminare da TALOS: **un'affermazione senza fondamento**.

### 1. Ogni difetto ha un ORACOLO, o non è un difetto

Un oracolo è la ragione per cui una cosa **è** sbagliata, e non semplicemente
diversa da come te l'aspettavi. Senza oracolo non stai collaudando: stai dando
pareri. Le otto sorgenti di oracolo (HICCUPPS, di James Bach) sono:

| | L'incoerenza da cercare |
|---|---|
| **H**istory | con come si comportava prima |
| **I**mage | con l'immagine che TALOS vuole dare di sé |
| **C**omparable | con Gemini, Siri, ChatGPT sullo stesso compito |
| **C**laims | con quello che l'app **dice di fare** — testi, etichette, aiuto |
| **U**ser | con quello che una persona si aspetterebbe |
| **P**roduct | con sé stesso: due schermate che dicono cose diverse |
| **P**urpose | con lo scopo per cui esiste |
| **S**tandards | con le linee guida di Android e con la legge |

⇒ Nel verbale, ogni voce porta la sua lettera. Un difetto che non ne trova
nessuna **non si scrive**.

### 2. La prova è un FATTO DELLA MACCHINA, mai una frase

Uno screenshot, una riga di `dumpsys`, un codice di uscita, una riga di
`logcat`, un file sul disco. **Mai** «ho verificato che», **mai** «sembra
funzionare», **mai** una grep sul sorgente.

⛔ Misurato il 2026-08-08: `cancelNotification` prendeva la maniglia al posto
della chiave — non faceva niente e non falliva. La chat diceva «Fatto ✅». La
prova di uno strumento che agisce **non si legge nella chat, si legge nello
stato del sistema**.

### 3. Chi trova NON giudica

Ogni difetto trovato passa a un sub-agente **a contesto pulito** il cui compito
è **smentirlo**, non confermarlo. Non vede il ragionamento che l'ha prodotto:
vede solo l'affermazione e le prove.

⛔ Non è formalismo. Misurato oggi su SPAKE2: avevo una prova che sembrava
decisiva, ho iniettato di proposito la regressione peggiore che conoscevo, e
**nessuna prova è diventata rossa** — perché i due lati eseguivano lo stesso
codice e l'errore si cancellava. Chi controlla sé stesso approva sé stesso.

⛔ E il modo in cui questa regola fallisce ha un nome: **falso consenso** — gli
agenti convergono sull'accordo senza prove. Per questo il verificatore ha il
compito **esplicito** di refutare, e in caso di dubbio deve dire «non provato».

### 4. Due viewport, e tocchi REALI

Telefono **e** tablet. `adb shell input tap` su coordinate lette da uno
screenshot, mai una chiamata JavaScript che simula il gesto. Un pulsante che
risponde a `click()` e non al dito è un pulsante rotto.

⛔ Una fase provata su un solo viewport **non è chiusa**.

### 5. Due colonne: chiave e locale

Ogni strumento che **agisce** si prova due volte: con un modello a chiave e col
motore in casa. Owner, verbatim: «locali api devono essere allineati al 100%,
NON SONO AMMESSE ECCEZIONI».

Una colonna sola non dice se il difetto è nello strumento o nel motore.

### 6. Quello che non si è potuto fare SI DICE

Dispositivo scollegato, rete assente, chiave scaduta, tempo finito: si scrive
**quale capitolo è saltato e perché**. Un verbale che tace su un buco è peggio
di un verbale corto, perché chi legge conclude che sia stato coperto.

---

## FASE 0 — I capitoli si RICAVANO, non si scrivono

⛔ Questo è il punto per cui la skill esiste. Un elenco di prove scritto a mano
invecchia il giorno dopo, e allora il collaudo prova la app di due settimane fa.

Ogni corsa comincia costruendo l'elenco **dal codice di adesso**:

```bash
# 1. Cosa è cambiato dall'ultima corsa (o dall'ultimo tag, o dal ramo base)
git log --oneline ORIGIN..HEAD
git diff --stat ORIGIN..HEAD -- mobile/src mobile/android

# 2. Ogni schermata che esiste
grep -o "name: '[a-z-]*'" mobile/src/lib/mobileRoutes.ts

# 3. Ogni strumento che il modello può chiamare
grep -o "id: '[a-z_]*'" mobile/src/lib/tools/toolControlCatalog.ts

# 4. Ogni permesso dichiarato
grep "uses-permission" mobile/android/app/src/main/AndroidManifest.xml
```

Da questi quattro elenchi nascono i **capitoli**, e ognuno è una *missione*
di una o due frasi — non una sequenza di passi. Una sequenza si rompe quando
l'interfaccia cambia; una missione no.

Esempio di capitolo ben scritto:

> **C-07 · Il consenso davanti a due strumenti insieme.** Chiedi a TALOS
> qualcosa che ne richieda due, e guarda se ogni richiesta si può concedere E
> negare. Oracolo: **Product** — la chat non deve dire «in attesa» se non c'è
> niente da toccare.

⭐ **Le modifiche di oggi vanno in cima.** I file toccati dai commit non spinti
diventano i primi capitoli, perché è lì che il rischio è più alto e perché è
quello che l'owner ha appena finito di guardare.

---

## FASE 1 — Il cancello a secco (5 minuti, e ferma tutto se è rosso)

Costa poco e protegge il tempo sul dispositivo, che costa molto.

```bash
cd mobile && npm run typecheck && npx vitest run && npm run build
cd android && ./gradlew testDebugUnitTest -PtalosSideBySide
```

⛔ Se qualcosa è rosso: **si ferma qui** e si riferisce. Collaudare a mano una
build che non passa le sue stesse prove è tempo buttato due volte.

⛔ E si guarda il **numero** delle prove, non solo il verde: un banco che passa
perché non ha eseguito niente è il difetto peggiore di un banco.

---

## FASE 2 — Da ZERO, come chi installa oggi

L'owner ha chiesto «dal punto zero dall'impostazione iniziale». Si fa davvero:

```bash
adb shell pm clear ai.talos.dev      # ⛔ MAI su ai.talos, che è l'app vera dell'owner
adb install -r <apk>
```

E si guarda il **primo avvio** come lo vedrebbe uno sconosciuto:

- L'introduzione si capisce senza sapere niente?
- Il primo comando che una persona proverebbe funziona?
- Un pulsante `:disabled` all'avvio: **ognuno è un sospetto** finché non si
  dimostra che il motivo è detto a parole.
- Cosa succede se **non fai** quello che ti chiede? Salti l'introduzione, non
  dai il permesso, non metti la chiave: la app resta usabile o diventa un muro?

---

## FASE 3 — I giri, sul dispositivo vero

I *tour* di Whittaker, adattati a TALOS. Ognuno è una lente diversa: la stessa
schermata guardata in due modi diversi produce difetti diversi.

| Giro | Cosa si fa | Cosa trova |
|---|---|---|
| **La guida turistica** | i tre percorsi principali, dall'inizio alla fine | ciò che si rompe per tutti |
| **Il denaro** | le funzioni per cui uno sceglierebbe TALOS: modello locale, ponte, ricerca, memoria | ciò che si rompe dove fa più male |
| **Il vicolo** | le schermate che quasi nessuno apre | ciò che nessuno ha mai guardato |
| **L'ossessivo** | ripeti la stessa azione dieci volte, annulla, rifai, torna indietro | stati che si sporcano, `CLEAR_TOP` dimenticati |
| **Il sabotatore** | modalità aereo a metà risposta, uccidi l'app, ruota, cambia lingua, cambia tema, riempi la memoria | ciò che si rompe nella vita vera |
| **Il lento** | rete a 2G, modello locale su un prompt lungo | attese senza girello, timeout che non scattano |

⛔ Per ognuno: **screenshot prima e dopo**, e per gli strumenti che agiscono la
prova **fuori dall'app**.

Gli attrezzi già misurati, che non vanno ri-scoperti:

```bash
dumpsys media.camera | grep "torch for camera"   # torcia: ogni CAMBIO di stato
dumpsys audio | grep -A3 STREAM_MUSIC            # volume: streamVolume su Max
dumpsys wallpaper | grep "id:"                   # sfondo: il numero cambia
dumpsys window | grep -i keep_screen_on          # schermo sveglio
dumpsys notification --noredact                  # notifiche: android.messages
```

⛔ `settings get system volume_music` **NON** si aggiorna su questa ROM: è già
costato un falso allarme. `dumpsys audio` è l'unica fonte che dice la verità.

---

## FASE 4 — Gli strumenti, a due colonne

Per **ogni** strumento che agisce, due volte: modello a chiave, motore in casa.

Si registra una tabella con quattro colonne: strumento · chiave · locale ·
prova fuori dall'app. Una cella vuota è un buco dichiarato, non un successo.

⛔ E si guarda la **differenza fra le due colonne**, che è l'informazione più
preziosa: se il difetto c'è solo col locale, non è nello strumento — è nel
motore, o nella grammatica, o nel catalogo compatto.

---

## FASE 5 — La verifica avversariale

Ogni difetto trovato va a un sub-agente a contesto pulito con questo compito:

> Ecco un'affermazione e le sue prove. **Prova a smentirla.** Cerca la
> spiegazione alternativa: uno stato del telefono, una sonda sbagliata, una
> coordinata presa male, un tempo troppo corto. Se non riesci a smentirla,
> dillo. Se hai un dubbio ragionevole, l'esito è **NON PROVATO**, non
> «confermato».

⛔ Il verificatore **non vede** il ragionamento che ha prodotto il difetto:
vede l'affermazione e le prove, e basta. Un revisore che eredita le premesse
eredita anche i punti ciechi.

⭐ Per i difetti che possono fallire in più modi, tre verificatori con **lenti
diverse** — «è davvero un difetto?», «si riproduce?», «è nostro o della ROM?» —
battono tre verificatori identici.

---

## FASE 6 — Il verbale

Una tabella, ordinata per gravità, e **niente prosa** dove basta un fatto:

```
#   Capitolo   Cosa si vede            Oracolo   Prova                     Esito
1   C-07       «in attesa» e nessuna   Product   riapri:0 ripresa:0 (CDP)  CONFERMATO
               scheda da toccare
2   C-12       la torcia resta accesa  User      dumpsys: nessun cambio    NON PROVATO
               dopo «spegni»                     (stato iniziale ignoto)
```

E in fondo, sempre, tre righe:

- **Cosa NON è stato provato**, e perché.
- **Cosa è cambiato dall'ultima corsa** e non ha prodotto difetti — perché una
  regressione assente è un'informazione, non un silenzio.
- **Quanto è durato**, per capitolo. Se una fase è durata pochi secondi,
  probabilmente non è stata fatta.

---

## Come si esegue, in pratica

Il collaudo è lungo, quindi va **parallelizzato dove è indipendente** e tenuto
in serie dove non lo è:

- **In serie**: cancello a secco → installazione da zero → tutto il resto.
  Non ha senso collaudare a mano una build che non compila.
- **In parallelo**: i giri della Fase 3 su capitoli diversi, e le verifiche
  della Fase 5, che sono indipendenti per costruzione.
- ⛔ **Un solo dispositivo**: i giri che toccano lo stesso telefono vanno in
  serie fra loro, o si pestano i piedi. Due viewport = due passaggi, non due
  agenti contemporanei sullo stesso schermo.

Se l'owner ha dato una portata («solo le ultime modifiche», «tutto»), la si
rispetta; senza indicazioni si parte dai commit non spinti e si allarga.

⛔ **MAI `pm clear` su `ai.talos`.** L'app dell'owner è quella; `ai.talos.dev`
è la copia affiancata, ed è l'unica su cui si può essere distruttivi.
