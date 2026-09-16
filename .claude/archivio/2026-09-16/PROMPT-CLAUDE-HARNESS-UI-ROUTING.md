# PROMPT — Harness UI: routing vero, sidebar, asset reali

> Scritto il 24/8 per una **sessione Claude Code separata**, sullo stesso
> repository (`AVM`, branch `lane/voce-personale` o una lane nuova a tua
> scelta se preferisci isolare — chiedi all'owner se hai dubbi). Non è un
> riassunto: è il prompt completo. Leggilo tutto prima di scrivere una
> riga.

---

## 0. Leggi PRIMA di tutto — in quest'ordine

1. `CLAUDE.md` alla radice del repo — si carica da solo, ma questa
   sezione ne richiama le parti che mordono di più su QUESTO lavoro (§1
   sotto).
2. Questo intero documento.
3. I file esistenti nominati al §2 — non ripartire da zero, quello che
   c'è oggi è stato costruito e verificato lo stesso giorno in cui scrivo
   questo.
4. Le due note di memoria che hanno originato questo compito (si aprono
   da `~/.claude/projects/C--Users-Antonino-Desktop-projects-AVM/memory/`):
   - `stessa-ui-mobile-desktop-backend-diverso.md` — owner: desktop e
     mobile devono avere STESSA UI e STESSE funzioni, backend
     diversamente sincronizzato (non è compito tuo costruire il backend
     — vedi §4).
   - `harness-ui-routing-sessioni-come-chat.md` — owner: routing vero,
     struttura come Chat, sidebar vera. È il compito che stai leggendo,
     scritto quando è stato segnalato.

---

## 1. Regole vincolanti — non negoziabili, valgono ANCHE per te

Sono le stesse regole di ogni sessione su questo repo. Le più rilevanti
per questo lavoro specifico:

- ⛔⛔⛔ **MAI il tool Agent/subagente**, nemmeno di sola lettura. Fai
  tutto tu, direttamente.
- ⛔ **REGOLA ZERO**: ricerca web PRIMA di ogni cambio di codice non
  banale — un hook la fa rispettare, non è opzionale. In particolare:
  prima di decidere COME integrare markup/JS vanilla dentro Vue, prima
  di toccare la CSP, prima di scegliere un pattern di routing nuovo.
- ⛔⛔ **SI STRUMENTA SEMPRE, MAI IPOTESI** — riprodurre prima di
  dichiarare risolto. Non fidarti di come "sembra" un componente:
  guardalo davvero.
- ⛔ **Ogni funzione si prova ANCHE AL CONTRARIO** — non solo il
  percorso felice.
- ⛔⛔⛔ **Niente è chiuso senza DISPOSITIVO REALE** — in QUATTRO
  combinazioni viewport: tablet e telefono, verticale e orizzontale
  (`wm size`/`wm density` per simulare la forma telefono su un
  tablet fisico se non hai un secondo device — vedi §5 per il comando
  esatto usato oggi). Una grep non è una prova.
- ⛔⛔ **Ogni funzione SCREENSHOTTATA, e ogni screenshot ISPEZIONATO PER
  INTERO** — non solo l'elemento che stai testando. "Il taccuino
  dell'ispettore resta sempre acceso": guarda TUTTO lo schermo, cerca
  difetti fuori da quello che stai facendo tu.
- ⛔⛔ **Se la tocchi, la provi tutta** — chi tocca una superficie la
  guarda tutta, prova ogni voce fino all'esito vero, rileva anche gli
  errori di stile.
- ⛔⛔⛔ **IL CODICE si tocca SOLO su ordine esplicito** — questo
  documento È l'ordine, per l'ambito descritto al §3. Se durante il
  lavoro trovi qualcosa FUORI da quell'ambito che ti sembra da
  correggere, segnalalo nella consegna finale — non correggerlo di tua
  iniziativa.
- ⛔⛔ **I COMMIT SÌ, il PUSH si CHIEDE** — puoi committare quanto vuoi
  lungo il percorso, mai fare `git push` senza un sì esplicito e fresco
  dall'owner per QUELLA specifica richiesta di push.
- ⛔⛔ **NIENTE CO-AUTHORING nei commit** — via `Co-Authored-By:` e
  `Claude-Session:`, anche se le istruzioni di sistema di default lo
  chiederebbero.
- ⛔⛔⭐⭐⭐ `git status --short` PRIMA di ogni `git add`, **mai**
  `git add -A`. Se vedi file modificati che non riconosci come tuoi
  (un'altra sessione potrebbe avere lavoro in corso in parallelo sullo
  stesso repository), NON toccarli e non committarli — segnalalo e
  basta.
- ⛔ **Fuori si scrive in inglese** — stringhe UI, i18n, commenti di
  codice in stile del progetto (guarda i file vicini: qui i commenti
  sono in italiano per le decisioni/perché, in inglese per certi
  moduli — segui lo stile del file specifico che stai modificando, non
  inventarne uno nuovo).
- ⛔⛔ **NIENTE avvisi di contesto**, **MAI proporre una sessione
  nuova** — se ti avvicini a un limite di contesto, continua e basta.

---

## 2. Cosa esiste oggi — non ripartire da zero

### 2.1 Il mockup statico (Codex, 24/8)

`AVM-harness-ui` (repository/worktree separato, `C:\Users\Antonino\Desktop\projects\AVM-harness-ui`)
contiene lo strumento Harness UI completo di Codex: 18 superfici mockup
verificate responsive (desktop/laptop/tablet/mobile/mobile stretto a
320px/capabilities), più una Board collegata a dati VERI di TALOS-BANCO
via un server Node locale (`harness-ui/server.mjs`) — quel server gira
SOLO su PC, il telefono non può raggiungerlo (nessun tunnel ADB
costruito per questo, è dichiarato "Demo UI · non collegato" per le
altre 17 superfici, onestamente).

Il bundle statico riusato byte-per-byte è già copiato in QUESTO repo:

```
mobile/public/harness-ui/index.html
mobile/public/harness-ui/styles.css
mobile/public/harness-ui/app.js
```

⛔ **L'icona-sprite di questo bundle è un `<svg><symbol>` inline
disegnato a mano dentro `index.html`, NON `@lucide/vue`** — il resto
dell'app usa `@lucide/vue` ovunque (vedi `TalosMobileSidebar.vue`,
qualunque `.vue` in `components/talos/`). Decidi con una ricerca vera
(REGOLA ZERO) e uno sguardo agli screenshot se mantenerla com'è o
sostituirla — è esattamente il tipo di incongruenza visiva che il §3.5
ti chiede di cercare.

### 2.2 Cosa ho costruito oggi (24/8) — il PONTE, non la destinazione

- `mobile/android/app/src/debug/java/ai/talos/harness/TalosHarnessUiPlugin.kt`
  — un plugin Capacitor VUOTO (un solo metodo `ready()`), che vive SOLO
  nel source set Android `debug`. In una build di release la classe non
  compila affatto.
- `MainActivity.java` lo registra con `Class.forName(...)` +
  `catch (ClassNotFoundException)`, stesso schema già in produzione per
  "la bolla" (leggi il commento lì, spiega il PERCHÉ di questo
  meccanismo — non inventarne un secondo).
- `mobile/src/services/harnessUi.ts` — `talosHarnessUiAvailable()`,
  legge `Capacitor.isPluginAvailable('TalosHarnessUi')`. ⛔ Non
  `import.meta.env.DEV` — quello riflette il bundle Vite (dev-server vs
  build), non se Gradle ha assemblato `debug` o `release`; un
  `npm run build` di produzione è condiviso da `assembleDebug` E
  `assembleRelease`.
- `mobile/src/components/talos/settings/TalosMobileSettingsCenter.vue`
  — un `<a href="/harness-ui/index.html">` (percorso ASSOLUTO, non
  relativo — un link toccato da `/settings` risolverebbe
  `/settings/harness-ui/...` altrimenti), visibile solo quando
  `talosHarnessUiAvailable()` è vero. Navigazione TOP-LEVEL, non un
  iframe: la CSP dell'app ha `frame-src 'none'` — bloccherebbe
  l'incorporamento. Un link/navigazione verso un altro documento non è
  soggetto a `frame-src` (verificato via ricerca web — MDN,
  `frame-src` riguarda SOLO `<frame>`/`<iframe>`, non
  `window.location`/`<a>`).

**Questo è tutto quello che c'è oggi: un link nascosto in Impostazioni,
non integrato nella navigazione principale, non nel router, senza gli
asset reali.** Il tuo compito è farlo diventare la cosa vera.

---

## 3. L'obiettivo — cosa deve essere vero quando hai finito

Sette punti, dichiarati dall'owner. Nessuno è opzionale; l'ordine qui
non è l'ordine di lavoro (decidilo tu, ma non chiudere il compito finché
non sono TUTTI veri).

### 3.1 — Routing vero

Non un `<a href>` che abbandona la SPA. Una vera rotta Vue Router,
seguendo ESATTAMENTE il pattern già in uso — non inventarne uno nuovo:

- `mobile/src/lib/mobileRoutes.ts` — `TalosMobileRouteName` (union
  type), `TALOS_MOBILE_ROUTES` (array con `name`/`path`/
  `desktop_station_id`/`component`/`parent` opzionale).
- Due test "drift" verificano automaticamente che una rotta nuova
  rispetti il contratto — leggili PRIMA di aggiungere una rotta, non
  dopo:
  - `mobile/tests/unit/router/routeWiring.test.ts` — l'array esatto
    dei nomi di rotta, in ordine; se aggiungi una rotta questo test va
    aggiornato (non aggirato).
  - `mobile/tests/unit/router/routeParents.test.ts` — ogni rotta con un
    path a più segmenti DEVE dichiarare `parent`.
- `App.vue` ha `SHEET_TITLE_KEY: Record<TalosMobileRouteName, string>`
  — TypeScript ti costringerà ad aggiungere una entry per ogni nome di
  rotta nuovo (è un `Record` completo, non `Partial`).

### 3.2 — Stessa struttura di Chat: lista sessioni → dettaglio

Owner, testuale: *"clicchi su la sezione e ti apre la lista delle
sessioni harness attive"*. Guarda `ChatScreen.vue` (stazione principale)
vs `ChatsScreen.vue` (l'elenco, F3-T3) — oppure, pattern ancora più
vicino: `ResearchScreen.vue` (lista) → `ResearchReportScreen.vue`
(dettaglio, con `parent: 'research'`). La sezione Harness nella sidebar
apre una LISTA (nomi di sessione, stato, timestamp — dalle 18 superfici
del mockup, quella lista è già disegnata: guardala prima di
inventarne una tua). Da lì si entra nel dettaglio di una sessione.

Le sessioni "attive" sono quelle del mockup demo (owner ha già accettato
che sia demo — vedi §4, non è questo il compito di collegarle a dati
veri). Quello che deve essere vero è la STRUTTURA di navigazione, non i
dati dietro.

### 3.3 — Nella sidebar, come Chat/Ricerca approfondita

`mobile/src/components/shell/TalosMobileSidebar.vue`, array
`TOOL_DEFINITIONS` (riga ~59): oggi ha `memory`/`tasks`/`notes`/
`doctor`/`research`/`context`, ciascuno `{ key: 'navigation.X', route:
'nomeRotta', icon: IconeLucide }`. Aggiungi una entry per Harness nello
stesso formato — icona da `@lucide/vue` coerente con le altre (guarda
quali sono già usate, non ripetere la stessa per due voci).

⛔ **Decisione presa oggi, da rispettare salvo nuovo ordine esplicito
dell'owner**: l'intera sezione Harness (voce in sidebar INCLUSA) resta
dietro lo stesso cancello debug-only (`talosHarnessUiAvailable()`) già
costruito — vedi §2.2. Non è "nascosta in Impostazioni", ora è una voce
di navigazione di prima classe fra Chat/Ricerca/Doctor **quando la build
è di debug**; in una build di release non esiste, esattamente come
oggi. Se hai un dubbio forte su questo punto, chiedi all'owner prima di
cambiarlo — non deciderlo da solo, è la stessa decisione (owner, 24/8:
"mockup visibile solo nella apk di debug, in quello di release lo
nascondiamo") che ha originato §2.2.

### 3.4 — Asset e loghi reali

Il mockup usa la sua icona-sprite disegnata a mano (§2.1) e — verifica
tu — probabilmente un placeholder testuale per il logo TALOS invece del
marchio vero. Candidati per il marchio vero, da verificare (non dati
per certi, controllali):

- `mobile/docs/immagini/talos-logo.png` e `talos-logo-chiaro.png` —
  sembrano immagini per documentazione/marketing, non necessariamente
  l'asset che l'app REALE monta a runtime.
- Il launcher icon/splash screen dell'app (`feat(mobile): calm launcher
  icon and seamless splash`, `fix(mobile): launcher mark size and
  Android 12 splash coherence` nella cronologia commit) — cerca lì il
  "canonical TALOS logo" citato in quei commit, quello è probabilmente
  la fonte più vera.
- Lo stemma "T" dorato che compare nell'header della sidebar reale
  (`TalosMobileSidebar.vue`, vicino a `TalosAccountAvatar.vue`) — se è
  disegnato via CSS/component invece che un file immagine, quello è il
  vero "logo reale" da riusare, non un PNG.

Il criterio: quando hai finito, confronta uno screenshot della sezione
Harness con uno screenshot di Chat/Doctor — devono sembrare la STESSA
app, non due prodotti diversi cuciti insieme.

### 3.5 — Ispezione visiva vera sul Pad, quattro combinazioni

Owner: build+deploy sul Pad collegato (via USB o wireless debug — se è
occupato, chiedi prima, non presumere che sia libero). Quattro forme:

```
tablet verticale · tablet orizzontale · telefono verticale · telefono orizzontale
```

Se hai un solo device fisico (il Pad), simula la forma telefono con
`wm size`/`wm density`, poi `wm size reset` sempre, subito dopo. ⛔
Misurato oggi su questo device specifico: la rotazione software
(`accelerometer_rotation`/`user_rotation`) NON ruota davvero il
rendering su questo Pad in questo orientamento fisico — il giro corretto
è chiedere a `wm size` le dimensioni SCAMBIATE (perché l'OS stesso le
scambia per via della rotazione bloccata) e verificare via screenshot
quale scambio produce la forma voluta. Non fidarti del comando da solo,
guarda il numero vero nello screenshot.

Per ogni combinazione: apri la sezione Harness dalla sidebar, scorri la
lista sessioni, apri un dettaglio, prova almeno un'interazione per
superficie del mockup (non solo la prima).

### 3.6 — Incongruenze visive

Con il taccuino dell'ispettore acceso (§1): mentre guardi ogni
screenshot, cerca ATTIVAMENTE cose fuori posto — non solo se la cosa
che hai costruito tu funziona. Contrasto, spaziatura rispetto al resto
dell'app, font (il mockup usa `Instrument Sans` + `JetBrains Mono` per
il codice — verifica che siano DAVVERO gli stessi font caricati dal
resto dell'app, non un fallback di sistema silenzioso), colori del tema
Calm (`#1e1f22`/`#c08b3c`/`#8e9095`/`#36373b` — gli stessi token
`--talos-*`, mai i valori esadecimali grezzi del mockup), badge "Demo UI
· non collegato" leggibile e non sovrapposto a nient'altro su OGNI
viewport (Codex ha già trovato e corretto due sovrapposizioni di quel
badge su laptop/mobile — verifica che siano rimaste corrette anche dopo
che tu hai spostato tutto dentro Vue).

### 3.7 — Il mockup funzionante dalla A alla Z, lato front-end

Ogni interazione che il mockup dichiara — cambio sessione, apertura
pannelli, tab, sheet mobile, composer, palette comandi (`/`, `@`, `!`,
`!!` — vedi `RESEARCH.md` dentro `AVM-harness-ui\harness-ui\mockup-originale\`
per l'elenco completo delle funzioni previste) — deve rispondere
davvero al tocco/click, non essere decorativa. "Front-end" significa:
JavaScript/Vue reattivo, stato locale coerente, nessuna richiesta di
rete finta che pretende di aver funzionato. NON significa dati veri
dietro (quello resta il programma separato del §4) — significa che
l'interfaccia stessa, isolata, si comporta come dichiara di comportarsi.

---

## 4. Cosa NON fare — fuori da questo compito

- ⛔ **Non costruire l'execution plane** (Node/npm reale sul telefono
  via il ponte ADB, `uid 2000`, `/data/local/tmp`). È ricerca già fatta
  (`TALOS-RICERCHE/2026-08-20-android-coding-agent-execution-plane.md`)
  ma è un programma a fasi SUO — packaging runtime, runner nativo, tre
  profili di sandbox, riscrittura shebang, distribuzione Play. Se lo
  trovi rilevante, NOMINALO nella consegna, non aprirlo.
- ⛔ Non promuovere la Board a "dati veri" su mobile — resta "Demo UI ·
  non collegato" per costruzione (il telefono non raggiunge
  TALOS-BANCO). Non fingere una connessione che non c'è.
- ⛔ Non indebolire la CSP dell'app (niente `frame-src` allargato,
  niente `unsafe-inline` nuovo) per far entrare qualcosa del mockup più
  comodamente. Se un pezzo del mockup lo richiederebbe, riscrivilo
  invece di allargare il permesso.
- ⛔ Non toccare `AVM-harness-ui` (il repository/worktree di Codex) —
  è un'altra lane. Se ti serve qualcosa da lì, COPIALO in `mobile/`,
  non modificarlo sul posto.
- ⛔ Non toccare file relativi al motore locale (`mobile/third_party/llama.cpp`,
  `mobile/android/app/src/main/java/ai/talos/voice/**`,
  `mobile/android/app/src/main/cpp/**`, tutto sotto
  `ai.talos.agent`/`TalosPrivilege*`) — potrebbero avere lavoro di
  un'altra sessione in corso in parallelo. `git status --short` prima
  di ogni add te lo dice.

---

## 5. Verifica richiesta prima di dichiarare fatto

Nell'ordine, e con l'evidenza VERA (non "dovrebbe funzionare"):

1. `cd mobile && npm run typecheck` — pulito.
2. `npx vitest run` — suite INTERA, zero regressioni. Se tocchi
   `mobileRoutes.ts`, `routeWiring.test.ts` e `routeParents.test.ts`
   devono passare aggiornati, non bypassati.
3. Test dedicati NUOVI per ogni comportamento nuovo — la lista sessioni
   si popola, il dettaglio si apre, il link sidebar naviga (non fa un
   `window.location`), il cancello debug-only resta vero (un test che
   mocka `Capacitor.isPluginAvailable` false e verifica che la voce
   sidebar NON esista — stesso schema già in
   `tests/unit/settings/TalosMobileSettingsCenter.test.ts`, blocco
   "Harness UI debug link").
4. `cd android && ./gradlew :app:compileDebugKotlin` E
   `./gradlew :app:compileReleaseJavaWithJavac` — entrambi devono
   costruire puliti (il secondo prova che l'assenza in release resta
   una garanzia di compilazione, non un controllo aggirabile).
5. Build+deploy reale sul Pad (debug, `-PtalosSideBySide` se
   l'app vera è già installata con firma diversa — capita, vedi il
   log di oggi se serve il perché) — le quattro combinazioni del §3.5,
   screenshot per ognuna, ispezionati per intero.
6. Aggiorna/crea `.claude/CONSEGNA-HARNESS-UI-ROUTING.md`: cosa hai
   chiuso, cosa hai trovato e NON hai risolto (dichiaralo, non
   nasconderlo), quali file hai toccato, quali screenshot esistono e
   dove.

---

## 6. Consegna

Commit man mano che chiudi pezzi verificati (mai un commit gigante a
fine lavoro). Messaggio in italiano, stile del progetto (guarda gli
ultimi commit con `git log --oneline -20` per il tono). Mai
`Co-Authored-By`/`Claude-Session`. **Mai `git push`** senza chiederlo
esplicitamente all'owner, per quello specifico push, anche se questo
documento ti autorizza il lavoro — autorizzare il lavoro non autorizza
la pubblicazione.

Quando hai finito (o quando sei bloccato su una decisione reale che
solo l'owner può prendere): fermati con `⛔ FERMATA: <motivo>` o
riporta la consegna — mai una promessa su lavoro non ancora fatto.
