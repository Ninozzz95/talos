# Quanto manca alla prima release desktop di TALOS — stato al 07/09/2026, sera

> Chiesto dall'owner il 06/09 e ri-chiesto il 07/09 («dimmi tutto quello che manca prima di avere
> una prima release stabile, ricorda bene»). Ogni riga è un fatto **misurato oggi**, non una stima:
> dove c'è un numero, sotto c'è un comando che l'ha prodotto. Le ore non si danno senza misura.

## Cosa c'è, e regge (misurato il 07/09, sera)

- App nuova servita da `public/` (build modulare). Tutte le schermate del mockup sono vive.
- Cancelli: **unit 356/356 · server 1657/1657 · componenti 111/111 · lab 195/195 · statico: 0
  simboli morti, 0 graffe orfane**.
- **Giri veri col modello fatti oggi** (GLM 5.3 Flash, istanza di prova 4211 col kernel dell'owner):
  avvio da cartella libera, streaming, attrezzi, **stop in 4 ms**, ripresa di una sessione
  interrotta dopo la morte del server, fork, permessi per attrezzo scritti e riletti dal server.
- I controlli marcati «fase 3» (non implementati) sono **40 nel template e 0 visibili** su chat,
  review, terminale e browser: nessuna promessa vuota a schermo (misurato con il browser).

## Cosa BLOCCA la release — quattro cose, in quest'ordine

### 1. Il kernel non è nel repo · **decisione tua**
I giri reali passano da `TALOS_OWNER_RUNTIME_MODULE`, che punta a
`AVM-harness/mobile/scripts/harness-talos/talosHarness.mjs`: un file di un ALTRO repo. Chi clona
questo repo ottiene un server in **sola lettura**. Il README non nomina nemmeno la variabile
(verificato: **0 occorrenze** in `harness-ui/README.md` e in `README.md`).
Le vie: portare il kernel qui, oppure pubblicarlo a parte e documentare la variabile.

### 2. Il merge su `main` · **misurato oggi, e non è il mostro che sembrava**
`lane/harness-desktop` è **1.674 commit avanti**, `main` ne ha **50** che la lane non ha (ultimo il
30/07). Il merge a secco (`git merge-tree --write-tree main HEAD`) dà **3 file in conflitto**:
`.gitattributes`, `.gitignore`, `AGENTS.md`. Sono file di configurazione, non codice.

### 3. CI e artefatto: il desktop non esiste per la pipeline
`ci.yml` e `release.yml` hanno **0 occorrenze** di `harness-ui`: la CI prova la app mobile, la
release firma l'APK sui tag `v*`. Servono un job che lanci `node --test harness-ui/tests` più i tre
cancelli del frontend, e un artefatto (zip di `harness-ui/` senza `node_modules`, o il lanciatore).

### 4. Nessuna prova su MACCHINA PULITA
I giri di oggi girano sulla macchina dove tutto è già configurato. Manca il giro da clone:
`git clone` → `npm ci` → avvio → prima sessione, senza le variabili già in memoria. È lì che si
vede se il kernel mancante, un percorso assoluto o una dipendenza non dichiarata fermano tutto.

## Repo, documentazione, pacchetto

- `harness-ui/README.md`: screenshot ancora del TABLET mobile; mancano `TALOS_OWNER_RUNTIME_MODULE`,
  `TALOS_HARNESS_UI_PUBLIC_DIR`, `TALOS_HARNESS_UI_SESSIONS_DIR`, `TALOS_INTRO` nella tabella
  «Configuration»; «Local API» non elenca le rotte nate dopo (schede terminale, git,
  `browser/incorniciabile`, `browser/proxy`).
- `VERSION` dice `v1.0.0` (è del mobile); `CHANGELOG.md` è del mobile. Serve un tag desktop
  (es. `desktop-v0.1.0`) o `release.yml` tenterà un APK.
- Pacchetto: `public/vendor/floating-ui` e `public/vendor/tanstack` non sono caricati da nessuno
  (resti del frontend parallelo). `prism` e `xterm` servono.
- `.claude/` (1.261 file) è nel repo per decisione del 20/08: per una release pubblica è materiale
  interno con percorsi locali. Decidi tu.

## Debito funzionale ancora aperto — verificato riga per riga oggi

**Fogli legacy** (finestre `<dialog>` del monolite invece dei veli del tema): ne restano **tre** con
chiamanti veri — `capabilities` (3), `control` (2), `model` (1). Gli altri quattro (`board`,
`environment`, `modelLab`, `realSession`) non li apre più nessuno: si cancellano.
Chiusi oggi: `permissions` e `sessionTree`.

**Difetti dell'owner ancora aperti**: O-42 (Browser: riquadro rotto quando il sito vieta la
cornice) · O-44 (loghi veri dal mobile) · O-45 (i tre pallini: CSS corretto, **mai misurato durante
un giro vivo**) · O-46 (chat vuota senza logo e senza «TALOS» in Orbitron).

**Dalla coda unica** (121 righe distinte aperte al 06/09; queste riverificate oggi nel codice):
- **CB-10** — `icon()` scrive `<use href="#id">` senza validare: **11 nomi non esistono** nello
  sprite. APERTO (`app.js:1133`).
- **CB-11** — la palette italiana completa (`#veloComandi`) non ha **nessun** riferimento in JS:
  si apre ancora quella del monolite, con tre voci in inglese. APERTO.
- **BH-06** — `style-src 'self'` senza hash per lo `<style>` che xterm inietta: errori CSP a ogni
  apertura del terminale. APERTO (`http-app.mjs:331`).
- **T15-D1/D2** — «La consultazione del rapporto… non è ancora disponibile qui» ×2 ancora nel
  template: sono la ragione d'essere delle due sezioni. APERTO.
- **BH-04** — «English» traduce i menu, non i titoli né gli stati vuoti. APERTO.
- **7 funzioni dichiarate e mai chiamate** (`apriIntroPrimoAvvio`, `costruisciConversationHero`,
  `creaRigaSessioneBoard`, `filtraCatalogoModelLab`, `monogrammaProvider`,
  `renderizzaDettaglioModelLab`, `segmentoProvider`).
- Chiuso oggi rispetto alla coda: **CB-18-bis** (l'esito di un'approvazione ora ha il suo colore:
  3 regole `approval__esito--`), **BH-13** (sei cappelli in inglese), **BH-14** (politiche in
  inglese), **CB-14** (l'interruttore non stilato), **T03-D2** (avviso porte laterali nel velo).

## In una frase

L'applicazione funziona e i suoi cancelli sono verdi; la RELEASE è ferma su quattro cose: il
**kernel fuori dal repo** (decisione tua), il **merge su `main`** (ora misurato: 3 conflitti di
configurazione), una **CI e un artefatto** che sappiano del desktop, e una **prova da clone su
macchina pulita**. Il resto è debito visibile ma non bloccante, e la lista qui sopra lo nomina tutto.
