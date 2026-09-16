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

## Cosa BLOCCA la release — aggiornato la sera del 07/09

### 1. Il kernel nel repo · ✅ **CHIUSO** (owner: «confermo, può stare sul repo pubblico»)
`harness-ui/src/kernel/talosHarness.mjs` + il suo `dist/`. `config.mjs` lo risolve come **default**:
la variabile `TALOS_OWNER_RUNTIME_MODULE` resta solo per puntare altrove. Sta sotto `src/` per una
ragione misurata: il cancello semantico legge `lib.*.d.ts` da `../../node_modules/typescript/lib`, e
da lì quel percorso è `harness-ui/node_modules` (altrove **due test falliscono**: 536/538).
`typescript` è una devDependency dichiarata; i **538 test del kernel** sono nei cancelli e in CI;
`npm run kernel:controlla` segnala la divergenza con la copia sorgente.
**Prova**: giro vero, GLM 5.3 Flash, su un server avviato **senza** la variabile → concluso,
`fine-lavoro`, 1 giro, 7.746 token.

### 2. Il merge con `main` · ✅ **FATTO nella lane**, l'avanzamento di `main` è deciso: si fa dopo
Owner 07/09: «facciamo avanzare `main` solo poco prima della release, quando siamo certi al 100% che
sia effettivamente funzionante». Il merge è già dentro `lane/harness-desktop`: **0 commit** di
`main` e di `origin/main` restano fuori (e `origin/main` ne aveva **6 più recenti** del main locale,
arrivati dall'altra lane: contratti desktop-mobile e capability policy — dentro anche quelli).
Conflitti risolti: `.gitattributes` da solo, `.gitignore` tenendo entrambe le aggiunte, `AGENTS.md`
tenendo la versione di `main` (poi tolto dal repo per l'ordine sugli agenti).
⇒ Resta un solo gesto, alla fine: `main` che avanza alla lane.

### 3. CI e artefatto · ✅ **CHIUSO**
`ci.yml`: job `desktop` — server 1657, kernel 538, impronta del kernel, unit 356, componenti 111,
lab 195. Gira solo dove `harness-ui/` esiste.
`release.yml`: job `desktop` sui tag `desktop-v*` (l'APK ora parte solo su `v*`), pacchetto per
**inclusione** — la prima versione, per esclusioni, pesava **311 MB**; ora è **5,2 MB** — e un passo
che lo **scompatta, installa e avvia** prima di firmarlo.
**Prova in locale**: 5,2 MB, `npm ci` (79 pacchetti, 3 s), avvio senza variabili, `/health` 200,
**un giro vero concluso** e la UI che risponde «42».

### 4. La prova da MACCHINA PULITA · 🔶 **parziale**
Il pacchetto scompattato si installa, si avvia e fa un giro vero — ma su **questa** macchina, dove
Node e `OPENROUTER_API_KEY` c'erano già. Manca il giro su una macchina che non ha mai visto TALOS.
È il primo punto della tabella di marcia di pre-release (`PIANO-PRE-RELEASE-2026-09-07.md`).

## Repo, documentazione, pacchetto

- `harness-ui/README.md`: screenshot ancora del TABLET mobile; mancano `TALOS_OWNER_RUNTIME_MODULE`,
  `TALOS_HARNESS_UI_PUBLIC_DIR`, `TALOS_HARNESS_UI_SESSIONS_DIR`, `TALOS_INTRO` nella tabella
  «Configuration»; «Local API» non elenca le rotte nate dopo (schede terminale, git,
  `browser/incorniciabile`, `browser/proxy`).
- `VERSION` dice `v1.0.0` (è del mobile); `CHANGELOG.md` è del mobile. Serve un tag desktop
  (es. `desktop-v0.1.0`) o `release.yml` tenterà un APK.
- Pacchetto: `public/vendor/floating-ui` e `public/vendor/tanstack` non sono caricati da nessuno
  (resti del frontend parallelo). `prism` e `xterm` servono.
- `.claude/` (1.298 file) è **uscito dal repo** il 07/09 su ordine dell'owner, insieme a `CLAUDE.md`
  e `AGENTS.md`. Il mockup, che stava lì ed è la fonte del disegno, è ora in
  `harness-ui/frontend/mockup/talos-mockup.html`: lo leggono la build e i cancelli di parità.

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

Dei quattro blocchi ne restano **uno e mezzo**: la prova su una macchina che non ha mai visto TALOS,
e il gesto finale di far avanzare `main` — che l'owner ha deciso di fare solo a ridosso del rilascio,
quando la certezza è piena. Kernel, CI e pacchetto sono chiusi e provati dal vivo.
Resta il debito funzionale qui sopra, e la questione delle tracce di agenti AI nella storia dei
commit, che un commit non può risolvere.

---

## ⛔ Nessuna traccia di agenti AI nel repo — owner 07/09, e non basta un `git rm`

Ordine: «nella repo non ci deve essere assolutamente traccia di alcun agente AI».
Censito il 07/09 sul repo tracciato. Le tracce stanno in **quattro** posti, e solo i primi due si
tolgono con un commit.

| dove | quanto (misurato) | stato |
|---|---|---|
| **File di istruzioni** — `CLAUDE.md`, `AGENTS.md` | 2 file | ✅ **fuori** il 07/9 (restano sul disco) |
| **Commenti nel codice di `harness-ui/`** | ~35 file citano Claude · 31 Codex · 13 Astra · 8 Fable | 🔄 in corso, delegato a un agente insieme ai competitor |
| **Aree di ALTRE lane** — `control-plane/`, `core/`, `docs/`, `mobile/` | `control-plane/README.md`, `core/KADMOS.md`, `docs/agent-bus/*`, `docs/alignment/*` e altri | ⛔ **non mie**: stessa disciplina di `mobile/` — si segnala, non si tocca. Serve un via dell'owner o il coordinamento con chi possiede quelle cartelle |
| **La STORIA dei commit** | **122 righe** `Co-Authored-By: Claude…` / `Claude-Session:` negli ultimi 400 commit (vengono dai commit dell'altra lane), e **50 titoli su 300** che nominano un agente | ⛔ **irraggiungibile da un commit** |

### La storia: le tre strade, e quale conviene

1. **Lasciarla.** Chi apre la pagina dei commit vede le firme. Costo zero, ordine non rispettato.
2. **Riscriverla** (`git filter-repo`: via i trailer, riscritti i titoli). Cambia **tutti** gli SHA
   di 1.674 commit, impone un force-push e rompe ogni clone e ogni link esistente. Fattibile
   finché il repo non è pubblico, e si fa **una volta sola**.
3. **Repo pubblico nuovo, storia appiattita.** Il codice esce con un commit solo — «TALOS Harness
   Desktop v0.1.0» — e la storia di sviluppo resta nel repo privato. È la pratica normale per
   aprire un progetto nato in privato, e risolve in un colpo firme, titoli, autori **e** qualunque
   file sensibile finito in un commit vecchio che nessuno ha mai riletto.

⇒ **Consiglio la 3.** La 2 fa lo stesso lavoro con più rischio e lascia comunque in giro nomi di
persone e percorsi locali nei messaggi vecchi; la 3 taglia il problema alla radice e non tocca
niente di ciò che esiste oggi.

### Deciso il 07/09 — come si pubblica

Owner: **repo nuovo, solo il desktop**. `talos-harness-desktop`, con `harness-ui/` come radice e un
primo commit «TALOS Harness Desktop v0.1.0».

Perché non riscrivere la storia di questo repo: `.claude/` è passata per **540 commit** e **1.299
file distinti**, e lo *squash* nel repo esistente non nasconde niente — i vecchi oggetti restano
raggiungibili per SHA e i fork li conservano (Truffle Security, «Securely Open-Sourcing on GitHub»;
ROllerozxa, «Cleaning up a Git repository for public consumption», letti 07/09/2026). Solo un repo
creato da zero non ha oggetti vecchi da esporre.
E c'è la ragione più semplice: questo repo contiene **cinque prodotti** (harness-ui 544 file,
control-plane 1.688, core, mobile 2.016, validator). Pubblicarlo intero per rilasciare il desktop
darebbe in pubblico quattro cose che non c'entrano.

⭐ Una buona notizia dal censimento: **nessuna chiave vera nella storia** — le sole occorrenze di
`sk-or-v1` sono segnaposto nei test (`sk-or-v1-vera`).

⛔ Cosa si perde, e va detto: la storia di sviluppo del desktop (1.674 commit di decisioni motivate)
resta privata. `filter-repo` potrebbe estrarre il solo `harness-ui/` riscrivendo i messaggi, ma
vorrebbe dire ripulire a mano centinaia di titoli che citano ledger interni: una pulizia che
*sembra* completa senza esserlo è l'errore peggiore dei due.

⛔ Il workflow di CI che ho scritto il 07/9 **già regge** la disposizione nuova: il primo passo del
job chiede *dove sta l'app* invece di dare per scontato il percorso.
