# CODA UNICA DEI DEBITI — TALOS Harness Desktop

## ⛔ 08/09/2026 — LA SUITE DI PARITÀ SUL MOCKUP È ROSSA DA PRIMA, e nessuno la guardava

`npx playwright test -c playwright.lab.config.mjs` (le prove ASTRA sul file del mockup, non sul
4174): **69 fallite su 195** in una corsa, e i fallimenti NON sono di oggi.

Verificato con un A/B, non per impressione: worktree su `558e2e97` (prima di tutte le modifiche
al browser dell'08/09), stessi tre test, stesso comando —
  prima  9 falliti  ·  dopo  9 falliti  ·  stessi nomi
(`ASTRA Browser navigazione, letture e permessi`, `ASTRA Dialogo Ambiente`, `ASTRA Dialogo File`).
Gli insiemi coincidono: la suite era già rossa, e non l'ha rotta il lavoro di oggi.

⛔ Perché conta lo stesso: una suite rossa da tempo smette di essere una guardia. Nessuno può più
distinguere una regressione nuova dal rumore di fondo — che è esattamente il dubbio in cui mi sono
trovato oggi, e che è costato due corse da 25 minuti per essere sciolto.

Il primo fallimento, per dare la forma degli altri: il test clicca `[data-browser-demo="back"]` e
si aspetta in `#browserTesto` la stringa `<button id="astra-untrusted">` (la prova che il testo di
una lettura non venga interpretato come HTML); trova invece il testo di esempio del mockup
(«Registro dei processi»). Cioè la regia demo del mockup non cambia più lettura al clic su
«indietro» — un difetto del MOCKUP, non del prodotto, ma la prova non lo dice e sembra un bug di
sicurezza.

**DECISO dall owner, 08/09/2026: «leva astra».** E il motivo per cui nessuno la riparava e che la
suite l aveva scritta un ALTRO agente — ChatGPT-6 Astra — che ha finito i crediti giorni fa (detto
dall owner). Tolti  e , e lo script
 sparisce da : restano gli unitari (440) e la parita dei componenti (114), che
sono verdi. I file restano nella storia di git; la guardia sul package.json e stata GIRATA e adesso
pretende che  NON esista, cosi la suite non puo rientrare di soppiatto in un comando.



> Chiesto dall'owner: «fai in modo di non avere lasciato nessun bug, debito, implementazione per
> strada». Questo file incrocia **sette fonti** (registro dell'owner, report delle 20 prove, 27
> taccuini, due cacce ai bug, audit delle 193 decisioni, stato release) e **verifica ogni riga nel
> codice di oggi**, con `file:riga`.
>
> ⛔ **Base della verifica**: `HEAD = acea72a8`, ramo `lane/harness-desktop`, albero pulito.
> ⛔ **Il bersaglio si è mosso**: i documenti sorgente descrivono lo stato a `a460c6bd`/`c1984d79`.
> Da allora sono entrati **58 commit**, e molte righe date per aperte sono curate. Ogni riga qui
> sotto è riletta nel codice, non copiata dal documento che l'ha generata.
> ⛔ **Nessuna prova dal vivo è stata fatta in questo giro** (sola lettura, 4174 mai toccata,
> nessuna build lanciata): dove serviva un browser scrivo `CHIUSO-NON-PROVATO` o «non confermato»,
> mai ✅.

---

## 1 · Il totale, per fonte

| Fonte | Righe | APERTO | PARZIALE | CHIUSO-NON-PROVATO | CHIUSO | Ritirate / non giudicabili |
|---|---:|---:|---:|---:|---:|---:|
| `DIFETTI-SEGNALATI-OWNER` (O-01…O-40) | 40 | **2** | **2** | **8** | 28 | 0 |
| `REPORT-VERIFICA-20-TASK` (T05…T20) | 85 | **31** | **5** | **6** | 32 | 11 (6 ritirate + 5 non confermabili senza browser) |
| Taccuini **T01–T04** (mai in nessuna tabella) | 11 | **6** | **1** | **1** | 3 | 0 |
| Taccuini **T-LUOGHI-01…05** (riserve «per nome») | 22 | **18** | **2** | **2** | — | 0 |
| `BUG-HUNT` (BH-01…BH-24) | 24 | **12** | **3** | 0 | 9 | 0 |
| `BUG-HUNT-2` (CB-01…CB-25 + 4 bis/ter) | 29 | **17** | **3** | **2** | 7 | 0 |
| `AUDIT-DECISIONI` (193 righe) | 193 | **28 ❌ ancora veri** | **41 ⚠️** | — | 18 ❌ curati dopo l'audit | 26 🔜 mai verificabili senza un giro |
| `STATO-RELEASE-DESKTOP` (blocchi) | 5 + 7 doc | **4** | **1** | 0 | 0 | 0 |

**Al netto dei duplicati (24 coppie/terne, §3): 121 righe distinte ancora aperte o parziali.**

⛔ Le tre cifre che contano: **77 APERTO** · **17 PARZIALE** · **19 CHIUSO-NON-PROVATO**.
⛔ E **41 righe non erano in nessuna tabella di stato** (§5): il 34% della coda vera era invisibile.

---

## 2 · La coda vera — dalla più grave alla più leggera

### 2.1 · Bloccanti per l'utente (lo vede, o gli mente in faccia)

| id | frase originale | stato REALE | verifica (`file:riga`) | cosa manca esattamente |
|---|---|---|---|---|
| **T03-permessi-D2** | «chiudere il cancello sulla sola *scrittura di un file* NON basta: il modello scrive lo stesso con *comando nel terminale*» | **APERTO** — ⛔ e **mai risalito in nessuna tabella** | `harness-ui/src/config.mjs:273` (`ATTREZZI_CON_PERMESSO_PER_ATTREZZO` = 5 attrezzi); `frontend/src/legacy/app.js:5949-5956` (le 5 righe del foglio); nessuna stringa che avvisi (cercate «anche shell», «due cancelli») | Chi mette «scrivi» su *chiedi* crede di aver chiuso la porta. Serve che il foglio dichiari che `shell` scrive lo stesso, o che chiudere `scrivi` proponga di chiudere anche `shell`. È un difetto di **sicurezza**, non di stile |
| **O-40** | «tutti i tooltip custom e stilizzati secondo il tema» | **APERTO** — zero lavoro | `frontend/index.template.html`: **156** `title="`, **0** `role="tooltip"`; **52** assegnazioni `title` da JS (`app.js` + `components/*.js`) ⇒ **208 tooltip**, tutti quelli di Windows; nessun `components/tooltip.js` | Componente con Popover API + `position-anchor`, `aria-describedby`, migrazione dei 208 in **un passaggio solo**, `title` nativo tolto dove subentra il nostro |
| **O-39** | «tutte le scrollbar custom e più compatte» | **APERTO** — zero lavoro | Le sole 7 dichiarazioni sono: `styles/index.css:313-314` e `foglio-monolite.css:333-334` (`scrollbar-width:none` + `::-webkit-scrollbar{display:none}`, servono a **nascondere**) e `index.css:797`, `:1160`, `:1162` (`scrollbar-width:thin`, cioè quella **di sistema** stretta). **Zero** `::-webkit-scrollbar` che dipinga | Blocco unico su `*` coi token del tema (pollice `--talos-border` → `--talos-muted`, 8 px, raggio pieno, niente frecce), le due standard sotto `@supports`, e una prova che conti gli scroller senza barra nostra |
| **CB-10** | «nove riferimenti a icone che non esistono» | **APERTO — e peggiore del dichiarato: sono 11 nomi, non 5** | `frontend/src/legacy/app.js:1128` — `icon(id)` scrive `<use href="#${id}">` **senza validare**. Lo sprite di `index.template.html` ha 35 simboli; usati e **mancanti**: `i-arrow-left`, `i-chevron`, `i-chevron-right`, `i-edit`, `i-file`, `i-folder-open`, `i-git`, `i-link`, `i-robot`, `i-trash`, `i-web`. La tabella ALIAS esiste (`app.js:9837`) ma la usa **solo** `iconaSvgAlbero` (`:9830`); `icon()` a `:12802` passa `i-chevron`/`i-folder-open` grezzi | Far validare `icon()` contro lo sprite (o disegnare gli 11 simboli), e una prova che fallisca su un nome inesistente |
| **BH-05** = T10-D5 = T10-D9 | «Albero dei rami apre **due UI diverse** che si contraddicono» | **APERTO** | `frontend/src/bridge/legacy-dom.js:187-189` toglie `data-apre-velo` al pulsante della testata e lo battezza `open-sheet=sessionTree` (grafo vero); `index.template.html:771` (colonna) resta `data-apre-velo="veloAlbero"`, e `legacy-dom.js:240-246` **svuota** quel velo scrivendo «Nessun ramo ancora» | Una porta sola. Oggi la stessa app dichiara sia «tre deleghe» sia «nessun ramo» a dieci centimetri di distanza |
| **CB-18-bis** | «Approvato e Negato sono resi identici: il tono promesso non esiste» | **APERTO** | `frontend/src/components/conversazione.js:447` scrive `talos-approval__esito--si\|--no`; in tutto il CSS servito esiste **solo** la base `styles/index.css:545` — zero regole `approval__esito--` | Due regole di colore. L'esito di una decisione di sicurezza oggi non ha nessun segnale visivo |
| **CB-16** | «un errore vero perde per strada il suo motivo e la sua azione» | **APERTO** | `frontend/src/legacy/app.js:11422` e `:13646` — `appendStatusNote('Avvio non riuscito: ' + error.message)`; il server ha già pronti `title`/`explanation`/`action`/`doctorReference` in `src/public-problem.mjs:5-11` | Leggere la busta invece del solo `message`. Davanti al guasto più comune (chiave assente) la persona non ha né motivo né passo successivo |
| **CB-20-bis** | «il server cade: la barra di stato lo dice, la chat dice il contrario per un minuto» | **APERTO** | `frontend/src/legacy/app.js:11300-11311` — l'avviso scatta solo se `source.readyState === EventSource.CLOSED`; con il server sparito Chrome resta in `CONNECTING` e quel ramo non parte mai. È stata aggiunta `sorveglianza?.segnalaSse(source.readyState)` (`:11307`) ma **non tocca la striscia, il pulsante «Ferma», la riga della sidebar né la colonna** | Quando la sorveglianza dice «il server non risponde», la chat deve smettere di dire «sta scrivendo» |
| **CB-07** | «il suggerimento del composer sopravvive alla sessione che l'ha generato» | **APERTO** | `frontend/src/legacy/app.js:11315-11371` — `nuovaGenerazioneSessione` azzera ~30 campi di `state.realSession`, **`ultimoBersaglioAttrezzo` non c'è** (definito `:258`, scritto `:10985`, letto `:7725`) | Una riga. Oggi la sessione B propone di rivedere un file toccato dalla sessione A, e col Tab quel testo entra nel campo |
| **BH-04** | «English traduce solo la barra laterale» | **PARZIALE, ancora quasi tutto aperto** | `frontend/src/components/lingua.js:117-137` traduce `[data-t]` e `[data-ph]`: nel template ci sono **26** `data-t` e **1** `data-ph` su 963 righe, e **0 dei 46 `<h2>`** ha `data-t`. `src/i18n/en.js` ha 70 chiavi | Portare sotto `data-t` i titoli, le spiegazioni e gli stati vuoti delle 13 schermate, o dichiarare che «English» copre solo i menu |
| **T15-D1 / T15-D2** | «La consultazione del rapporto e delle fonti **non è ancora disponibile qui**» · «La lettura della **definizione completa** non è ancora disponibile qui» | **APERTO** | `frontend/index.template.html:696` e `:723` — le due frasi sono ancora lì, sotto l'elenco stesso | C26 (rapporti riapribili) e C27 (codice dell'attrezzo in sola lettura): sono la ragione d'essere delle due sezioni |
| **CB-11** | «la palette viva è in parte in inglese — e ne esiste una seconda, in italiano, che nessuno apre» | **APERTO** | Quella che si apre è del monolite: `frontend/src/legacy/frammenti.html:222-225` → «**Session board**», «**Skills, MCP, plugin e gateway**», «**Agents, hooks e doctor**». Quella italiana completa (15 comandi, ricerca, piede con le scorciatoie) è `index.template.html:923` `#veloComandi`: l'unico riferimento in tutto il JS è la mappa di ridimensionamento `components/dialoghi.js:23` | Aprire `#veloComandi` da `openCommandPalette` (`app.js:14443`) e togliere la palette del monolite, oppure tradurre le 3 voci. La traduzione **è già stata fatta** e la persona non la vede |

### 2.2 · Gravi (rompono una decisione, o mostrano un dato falso)

| id | frase originale | stato REALE | verifica (`file:riga`) | cosa manca |
|---|---|---|---|---|
| **BH-13** = T10-D6 | «cappelli dei fogli in inglese» | **APERTO** | `frontend/src/legacy/app.js:6143` `eyebrow:'Conversation graph'`, `:5917` `'Runtime'`, `:5932` `'Safety lens'`, `:5970` `'Environment proof'`, `:5999` `'Capability hub'`, `:6092` `'Control plane'` | Sei stringhe. Il report ne citava tre: sono sei |
| **BH-14** | «Read only / Workspace write in inglese» | **APERTO** | `frontend/src/legacy/app.js:5938-5939` (le carte del foglio permessi); i valori restano inglesi anche a `:7053`, `:9508`, `:11743`, e il chip li stampa a `:6366` | Separare il **valore** (contratto col server) dall'**etichetta** a schermo |
| **T17-D7** | «sei pulsanti, cinque inglesi: Agents · Hooks · Skills · Plugins · MCP · Doctor» | **APERTO** | `frontend/index.template.html`: `>Agents<` ×1, `>Hooks<` ×1, `>Skills<` ×1, `>Plugins<` ×1, `>MCP<` ×1 (`>Doctor<` ×2 è accettabile come nome proprio) | Cinque etichette |
| **CB-14** | «un solo interruttore in tutta la app non è stilato» | **APERTO** | `frontend/src/legacy/app.js:12576-12582` — `reasoningInput` creato senza `class="talos-switch"` né `role="switch"`; la regola che toglie l'aspetto nativo è ambito a una schermata (`styles/index.css:633`, `#schermoImpostazioni input.talos-switch`) | Una classe e un `role`. È l'unico caso in tutta la app: una svista, non una scelta |
| **BH-06** = CB-19 | «12 errori CSP per ogni apertura del Terminale» | **APERTO** | `harness-ui/src/http-app.mjs:313` — `style-src 'self'` senza `'unsafe-inline'`, hash o nonce per lo `<style>` che xterm inietta a runtime | Un hash o un nonce per quello stile. 15 errori rossi a ogni sessione sono il rumore in cui un errore vero non si vede |
| **BH-19** | «`GET /api/v1/huggingface/repo` senza `repo` → 503 invece di 400» | **APERTO** | `harness-ui/src/http-app.mjs:2442-2443` — `if (!repo || !hfHubClient?.describeModel || …) code='RUNTIME_NOT_AVAILABLE'`: «manca il parametro» e «l'hub non è configurato» nello stesso ramo | Separare le due guardie (confronta `:2464-2466`, che lo fa giusto) |
| **BH-07** | «`POST /api/v1/huggingface/download` con `{}` → 500 `INTERNAL_ERROR`» | **APERTO** (non riprovato dal vivo in questo giro) | `harness-ui/src/http-app.mjs:1528-1533` — `localModelTransfer.start(body)` chiamata **senza alcuna validazione del corpo** | Validare `body` e rispondere 400/422 come le altre 9 POST |
| **BH-16** | «ricerca senza risultati: lista vuota e contatore fermo» | **APERTO** | `frontend/src/legacy/app.js:14733-14738` — nasconde le righe con `item.hidden` e basta: nessuno stato vuoto, nessun aggiornamento del contatore «SESSIONI 74» | Stato vuoto + contatore dei risultati |
| **T12-D1 / T12-D3** | «Testata *0 file · Token non disponibili*, scritto **sempre**» | **APERTO** | `frontend/src/components/libreria.js:47` — la stringa `'Token non disponibili'` è concatenata incondizionatamente | C21/B9: il costo in token per file. E a libreria vuota la frase non ha senso |
| **T13-D1 / T13-D2 / T13-D4** | «Memoria divisa per genere, non per strato; nessun ricordo dichiara quando è stato usato» | **APERTO** | `frontend/src/components/memoria.js:6-11` (`GENERI`: preference/fact/procedure/rule) e `:18-20` (filtro per `genere`); nessun campo `ultimoUso` | C22 (strati: di lavoro · episodica · semantica) e C23 (ultimo uso): C23 tocca la **forma del dato**, non solo la vista |
| **T14-D3** | «Le Attività hanno i filtri *Mie / Dell'agente* ma nessuna riga dichiara l'autore» | **APERTO** (metà curata) | `frontend/src/components/attivita.js:16` — `autore:'Autore non registrato'` **scritto nel codice**. I due filtri sono ora nascosti (`index.template.html:573`, `hidden data-richiede="fase3"`) ⇒ non promettono più il falso, ma C25 resta non fatta | Il campo `autore` nel record lato server, e la riga che lo mostra |
| **T10-D2 / T10-D3** | «passando col mouse sul proprio messaggio non compare nessuna azione» · «non esiste nessun modo di modificare un proprio messaggio ⇒ B25 irraggiungibile» | **APERTO** | `frontend/src/components/conversazione.js:175` — il commento dice «le azioni sulla **risposta**»; `:197` monta «Chiedi di nuovo». Sulla bolla dell'utente: nessun bottone | Copia + modifica sul messaggio dell'utente. Senza la modifica, tutto il ramo B25 (fork) è codice mai raggiungibile |
| **CB-13** = T07-D3 = T07-D4 | «tre numerazioni diverse di *giro* nella stessa schermata» | **APERTO** | Tre sorgenti vive: `app.js:6741`/`:2103` (`usage.giri` del kernel → piede e striscia), `:9048` (`state.realSession.runCount` → Review), la spina della cronologia | O una parola diversa per ciascuno, o un solo contatore |
| **CB-16-bis** | «i modelli locali si presentano con l'identificatore interno, lungo 102 caratteri» | **APERTO** — e **la cura esiste già altrove** | `frontend/src/components/modelli-installati.js:70` — `nome: modello.name \|\| modello.id \|\| 'Modello'`, mai `repo`. Intanto `components/chat-foot.js:65 nomeModelloUmano()` fa esattamente il lavoro giusto ed è usata in **un solo posto** (`app.js:7129`) | Usare `nomeModelloUmano` anche nel selettore «Locali», nella lista «Installati» e nel titolo del dettaglio |
| **CB-16-ter** | «la descrizione del modello locale è una frase fissa del mockup» | **APERTO** | `frontend/src/components/modelli-installati.js:145` — `'Modello locale per conversazione e codice.'` scritta nel codice, uguale per il Nemotron 30B e per gpt-oss-20b; e anche nel mockup `index.template.html:463` | O una descrizione vera dal manifest, o «descrizione non disponibile». Oggi **afferma** qualcosa preso da un mockup |
| **CB-15 (1)** | «`Dettaglio: RUNTIME_UNREACHABLE` a schermo» | **APERTO** | `frontend/src/components/runtime-modelli.js:17` — `'Dettaglio: '+d.errore` | La mappa umana esiste già lato server (`src/public-problem.mjs:8`): usarla |
| **BH-15** = CB-15 (3) | «id grezzi dei modelli su quattro superfici» | **PARZIALE** | Curato nella chat (`app.js:7127-7129` → `nomeModelloUmano`). **Non** in Board e sidebar: usano `components/session-item.js:108-110 nomeModello()`, che fa solo `split('/')` — su `local:unsloth-gpt-oss-20b-GGUF` non traduce niente. `board.js:35` la chiama | Una funzione sola. Averne due è il debito che ha prodotto la mezza cura |
| **CB-12** | «il cursore del ragionamento promette sei livelli, il modello ne ha tre — e la posizione mostrata non è quella usata» | **APERTO** | `frontend/src/legacy/app.js:5406` `LIVELLI_RAGIONAMENTO` è una lista **fissa** di sei; `:5447` ripiega su `'high'` (dichiarato «solo estetica»); `effortCompatibilePerModello` (`:4922`) è applicata **solo** al percorso del chip (`:5236`), non al foglio «Nuova sessione» | Filtrare i livelli col catalogo del modello anche nel foglio |
| **T09-D4** (= T09-D2, T11-D10, T16-D3) | «tre deleghe su tre fallite: la shell del figlio prova a entrare in `/mnt/c/Users/…`» · i figli girano con un modello che non hai scelto · si entra dentro la sessione di un sotto-agente all'avvio · righe `delega:…` indistinguibili in Board | **CHIUSO-NON-PROVATO** (fuori lane) | Commit `3a6d6e51` «fix(delega): il figlio lavora dove lavora la madre, e ne eredita il modello». Il kernel non è in questo repo (`mobile/scripts/harness-talos/talosHarness.mjs` **non esiste** qui) ⇒ **non ho potuto rileggere la cura** | Una prova con una delega vera: quattro sessioni figlie, 8 giri e 76,8k token bruciati erano il costo del difetto |
| **O-10** = T09-D1 = T10-D9 | «spawno un sottoagente e non si vede in tab Agenti» | **CHIUSO-NON-PROVATO** | `frontend/src/legacy/app.js:10865-10867` — la scheda ora si rilegge quando la delega **parte** e quando finisce, non solo a giro concluso; `/children` letta a `:4101` e `:6840` | ⛔ Il registro dell'owner lo dichiara **riaperto** e dice testualmente: «si chiude con una **foto della scheda piena**, non con una riga di codice». Quella foto non esiste |

### 2.3 · Medi

| id | frase originale | stato REALE | verifica | cosa manca |
|---|---|---|---|---|
| **BH-18** = CB-20 | «75 richieste API per disegnare la Board» | **PARZIALE** | `frontend/src/legacy/app.js:5467-5480` — ora max **4 worker paralleli**, ma resta **una `/metrics` per sessione** a ogni apertura e a ogni «Aggiorna» | Una rotta che restituisca le metriche in blocco |
| **BH-17** | «38 `<label>` su 114 senza `for`» | **PARZIALE** | Oggi: **13 su 71** senza `for` in `frontend/index.template.html` | 13 associazioni |
| **BH-03 / BH-23** | «il fuoco esce dal velo modale» | **APERTO** | Nessun `trapFocus`/`focusTrap`/`inert` in `app.js`, `bridge/*.js`, `components/dialoghi.js` | `inert` sul guscio quando un velo `overlay-layer--modal` è aperto |
| **CB-22** | «la carta di approvazione ripete il percorso tre volte in quattro righe» | **APERTO** | `frontend/src/legacy/app.js:7959` («Vuole scrivere questo file:») + `:8043` (`bersaglio` + `codice`) | Una volta sola, nel blocco codice |
| **CB-23** | «il titolo della sessione è troncato senza suggerimento» | **APERTO** | `frontend/src/components/session-item.js:155` — `talos-session-item__title` creato senza `title` | Un `title` (in Board ce l'hanno tutti: qui no) |
| **T05-D6** | «il segnaposto promette *Invio indirizza il giro in corso* anche quando nessun giro è in corso» | **APERTO** | `frontend/src/legacy/app.js:6870` — il ramo «non attivo» usa proprio quella frase | Un testo per lo stato a riposo |
| **T16-D6** | «l'intestazione è un `<th>` senza `aria-sort` e cliccarla non riordina» | **PARZIALE** | `components/board.js:108` ora mette `aria-sort`; **nessun listener di click sul `th`** (l'ordine si cambia solo dalla barra) | Il clic sull'intestazione |
| **BH-24** | «`background-motion-active` è scritta su `html`/`body` e nessuna regola la nomina» | **APERTO** | Zero occorrenze in `frontend/src/styles/*.css` | O una regola, o togliere la classe |
| **CB-25** | «un `if (false) { }` nel percorso di reset delle superfici» | **APERTO** | `frontend/src/legacy/app.js:8098` | Cancellare il ramo |
| **CB-24** | «uno schermo intero di mockup, mai raggiungibile» | **APERTO** | `frontend/index.template.html:455-473` `#schermoModelLab` (Qwen3 8B finto, download al 64%, «Primo token 0,8 s»); i `data-vaia` esistenti sono 14 e **`modellab` non c'è** | Toglierlo dal documento |
| **BH-22** = T20-D9 | «`#introDialog` e `apriIntroPrimoAvvio()` sono codice morto» | **APERTO** | `frontend/src/legacy/frammenti.html:237` (`<dialog id="introDialog">`) e `frontend/src/legacy/app.js:13270` (`apriIntroPrimoAvvio`, ~180 righe, nessun chiamante — il primo avvio passa da `apriIntroMockup`, `:13233`) | Cancellare markup e funzione |
| **BH-21** | «11 velo su 20 non li apre nessuno» | **APERTO** (oggi sono 12) | `veloNuova`, `veloModello`, `veloPermessi`, `veloEsporta`, `veloAmbiente`, `veloRiferimenti`, `veloCreaFile`, `veloEliminaFile`, `veloRinominaFile`, `veloEliminaSessione`, `veloComandi`, `veloFile`: l'unico riferimento in tutto il JS è la mappa di misure `components/dialoghi.js:23,33` | O li si usa (sono il disegno approvato) o si tolgono |
| **BH-11** | «il titolo del toast è stampato due volte» | **APERTO** | `frontend/src/components/toast.js:78` — `testo.textContent = messaggioUmano(dati.messaggio) \|\| String(dati.titolo \|\| '')` | Non ripiegare sul titolo quando manca il messaggio |
| **T01-nuova-sessione-D1** | «la modale è ancora a due colonne dense: F1-F2 vuole DUE PASSI» | **APERTO** — ⛔ mai in una tabella | `frontend/src/legacy/app.js`, `creaWorkspaceChooser` (foglio del monolite, colonne workspace/sessione) | La modale in due passi nel `veloNuova` del mockup |
| **T01-nuova-sessione-D6** | «*Planner opzionale* è ancora nella modale (F14 lo sposta nelle impostazioni)» | **APERTO** — ⛔ mai in una tabella | `frontend/src/legacy/app.js:12586-12591` (`plannerSection`) | Spostarlo, o dichiarare che F14 è rimandata |
| **T01-nuova-sessione-D2** | «i progetti non dicono quante sessioni hanno (F5)» | **APERTO** — ⛔ mai in una tabella | `frontend/src/legacy/app.js:12802` e `:12838` — la riga stampa solo nome + `Progetto`/`Usata di recente`/`Scelta rapida` | Il conteggio |
| **T01-nuova-sessione-D7** | «manca la riga col totale degli attrezzi e il costo per giro (F23)» | **APERTO** — ⛔ mai in una tabella | Nessuna riga «attrezzi» nel chooser | Il dato esiste già (`/api/v1/tools`, `tokenSchemaStimati`, usato dalle Impostazioni) |
| **T03-permessi-D1** | «nel foglio compaiono 5 attrezzi: E7 ne vuole 43» | **APERTO** — ⛔ mai in una tabella | `frontend/src/legacy/app.js:5949-5956` (5 righe) e il vincolo vero `harness-ui/src/config.mjs:273` | E7 non è realizzabile senza allargare l'insieme lato server: va deciso, non lasciato |
| **T02-primo-messaggio-D1** | «il costo della sessione non compare nel composer dopo il giro (B26)» | **CHIUSO-NON-PROVATO** — ⛔ mai in una tabella | `frontend/src/components/chat-foot.js:341-345` (`[data-runtime-costo]`, nascosto se `dati.costo` è nullo) | Serve un giro vero per vedere se `costo` arriva |
| **T05-D4** | «pannello *File toccati*, e da vuoto scrive *Nessun file scritto finora*» | **APERTO** | `frontend/index.template.html:223` («File toccati in questo giro») contro `:363` («Nessun file scritto finora») | Una parola sola per la stessa cosa |
| **T05-D5** | «l'albero mostra `.git` fra le cartelle di primo livello» | **non confermato** (nessun filtro `.git` nel frontend: la lista arriva dal server) | — | Da riprovare a schermo |
| **T05-D7** | «i toast restano sopra la colonna di destra e ne coprono l'elenco» | **non confermato** (geometria) | — | Da riprovare a schermo |
| **T06-D2 / D4 / D5 / D6** | Canc non chiude la scheda · due shell su una sessione nuova · piede tagliato · la scheda rinominata perde chi l'ha aperta | **non confermati** (servono schede vive) | `components/terminale.js:28` (`SCHEDE_MASSIME = 8`), `app.js:8283-8284` (le pastiglie del piede, isolamento incluso) | Un giro sul Terminale con tre schede |
| **T06-D3** | «la dichiarazione *Stessa macchina, senza isolamento* sparisce quando le schede diventano tre» | **non confermato** | `frontend/src/legacy/app.js:8283` — la pastiglia esiste; sparirebbe per spazio, non per codice | Misura a 1440 con tre schede |
| **T07-D2** | «*Non salvate* dice `–` mentre nel repo c'è la modifica appena scritta» | **non confermato** | `frontend/src/components/inspector.js:47` legge `c.nonSalvate`: il dato viene dal server | Un giro con una scrittura vera |
| **T07-D5 · T07-D6 · T10-D8 · T10-D10 · T10-D11 · T18-D2 · T20-D2 · T20-D7 · T20-D8** | toast ripetuto · titolo troncato a metà parola · percorsi `/mnt/c/…` e pallino orfano · niente menu col tasto destro sulla sessione · filo chiaro sul bordo · il fumetto copre «Nuova» · 12 combinazioni con testo tagliato in Board · «Apri Model Lab» in inglese · manca la riga di H20 | **non confermati in questo giro** (sono difetti di pixel e di stato vivo) | — | Vanno rifatti con il browser, non con una grep |

### 2.4 · Righe dell'owner ancora non chiuse davvero

| id | stato dichiarato | stato REALE | verifica |
|---|---|---|---|
| **O-28** | tabella ✅, prosa «🔴 APERTO» | **PARZIALE** — metà UI chiusa, metà kernel aperta | UI: `frontend/src/components/browser.js:23,135,249-256` (due modi, `testoLeggibile`, `riassuntoPulizia`) ⇒ **chiusa**. Kernel: `naviga` consegna ancora il **sorgente HTTP grezzo** troncato a 4.000 caratteri (`talosHarness.mjs:4940-4941`, **fuori da questo repo**, non riletto oggi) ⇒ il modello continua a pagare token per `<meta>` e `<style>` |
| **O-31** | tabella ✅ «provato dal vivo», prosa «🔴 APERTO, critico» | **CHIUSO-NON-PROVATO** | Commit `b4660ef1` «feat(browser): il modello vede la pagina dove navighi TU». Nessuna prova dal vivo nel repo; e la via (1) scelta ha un costo dichiarato (il server non ha i cookie della persona) che va **scritto a schermo** |
| **O-24** | ✅ | **PARZIALE** | `components/chat-foot.js:65 nomeModelloUmano` copre l'intestazione dei turni e la pillola (usata solo a `app.js:7129`). Model Lab «Installati» e la scheda «Locali» del selettore mostrano ancora i 102 caratteri (`components/modelli-installati.js:70`) — vedi CB-16-bis |
| **O-26** | 🔧 in corso | **CHIUSO-NON-PROVATO** | `frontend/src/legacy/app.js:1896-1945` — riconoscimento della riga di separazione, `md-table-wrap` che scorre, `<thead>`/`<tbody>`. Serve un giro vero (era CB-02) |
| **O-34** | 🔧, «il caso *sono salito* non ancora visto dal vivo» | **CHIUSO-NON-PROVATO** | `components/chat-foot.js:96-101 fondoInVista()` sottrae la coda; il caso «sono salito» resta non visto |
| **O-35** | 🔧 in corso | **CHIUSO-NON-PROVATO** | Commit `0251ca0a` «*Per questa sessione* ferma davvero le richieste, anche a giro in corso». La clausola `vaChiesto` sta nel kernel, fuori repo: non riletta |
| **O-36** | 🔧, «non ancora rivisto dal vivo su un rifiuto vero» | **CHIUSO-NON-PROVATO** | Commit `c6edeef5`; `components/errori.js:163 spiegaRifiutoAttrezzo` |
| **O-37** | 🔴 aperto | **CHIUSO-NON-PROVATO** | Commit `98a5446f` — l'artefatto si salva anche in Libreria. ⛔ La causa vera non era la chiave API: `artifact-store.mjs` teneva tutto in una `Map` in memoria, quindi **non erano salvati da nessuna parte** |
| **O-18** | 🔜 delegato | **CHIUSO-NON-PROVATO** | `T-LUOGHI-01` dà PASSA con 8 correzioni; restano non provati il download vero, la misura con esito vero (`/fit-estimate` risponde sempre 503 su quella macchina) e i repository `gated` |
| **O-22 / O-23** | ✅ | **CHIUSO** | `components/errori.js:31` (contesto ecceduto) e `:88` (flusso SSE vuoto), montati a `app.js:11218` |
| **O-19 / O-20 / O-21 / O-27 / O-32 / O-33** | ✅ | **CHIUSO** | `app.js:640-720` (`scrollerConversazione`, `scorriInFondoConversazione`, `--stream-follow-space`) + prova V01 dal vivo |
| **O-01…O-17 (tranne O-10), O-25, O-29, O-30, O-38** | ✅ | **CHIUSO** | verificate a campione: `components/cronologia.js`, `bridge/legacy-dom.js:192`, `chat-foot.js` (velocità locale), `styles/foglio-monolite.css:218` (`.sr-only`, era BH-08), `:159-160` (`.overlay-backdrop`, era BH-09), `:276-277` e `:346-347` (era BH-20), `dialog.command-dialog` a `:9` (era BH-01) |

### 2.5 · Blocchi della release (tutti confermati, uno smentito in parte)

| # | affermazione | stato REALE | verifica |
|---|---|---|---|
| 1 | «il kernel non è nel repo» | **APERTO — confermato** | `mobile/scripts/harness-talos/talosHarness.mjs` **non esiste**; la variabile è letta a `harness-ui/src/config.mjs:410-417,497`; `harness-ui/README.md` **non la nomina** |
| 2 | «nessuna prova end-to-end col modello sulla UI nuova» | **APERTO — confermato** | Nessun giro a pagamento su `acea72a8` |
| 3 | «la lane è 1.583 commit avanti a `main`» | **APERTO — e cresciuta** | `git rev-list --count main..HEAD` = **1.643**; `HEAD..main` = **50** |
| 4 | «CI e release non sanno che il desktop esiste» | **APERTO — confermato** | Zero occorrenze di `harness-ui` in `.github/workflows/*.yml`; `VERSION` = `v1.0.0`; `CHANGELOG.md` è del mobile |
| 5 | «controlli morti nella Review» | **PARZIALE — l'affermazione è in gran parte SBAGLIATA** | `components/review.js:135-138 nascondiAzioniFase3` li nasconde e `app.js:9183` la chiama su `#schermoReview`. **Però**: dei 40 `data-richiede="fase3"` del template, **6 non hanno `hidden` nel markup** e dipendono da quella chiamata a runtime, e uno dei sei — la nota «Scartare ripristina il file dal checkpoint del giro 4» — vive dentro `#schermoChat`, **fuori dal raggio** di `nascondiAzioniFase3` |
| doc | screenshot del README | **APERTO — confermato** | `harness-ui/README.md:8` punta a `../mobile/docs/immagini/tablet-9-coding-agent.png` |
| doc | vendor da ripulire | **APERTO — confermato** | `harness-ui/public/vendor/floating-ui` e `.../tanstack` esistono; nessun file del frontend li carica |

---

## 3 · I duplicati — quale id sopravvive

| stessa cosa, id diversi | **id da tenere** | perché |
|---|---|---|
| O-28 · T08-D4 · T08b-D1 · CB-05 · T08-D1 | **O-28** | È la segnalazione dell'owner. CB-05 resta come **prova del lato kernel** (`talosHarness.mjs:4940-4941`); T08-D1 è la metà UI, oggi chiusa |
| O-26 · CB-02 | **O-26** | Stessa cosa, stessa cura (`app.js:1896-1945`) |
| O-10 · T09-D1 · T10-D9 | **O-10** | La riga dell'owner; le altre due sono la stessa scheda vista da due prove |
| T09-D2 · T09-D3 · T09-D4 · T11-D10 · T16-D3 | **T09-D4** | Una sola causa nel kernel (`talosHarness.mjs:5915`): la delega rifiutata sulla stessa cartella. Modello non ereditato, righe `delega:…` in sidebar e Board, avvio dentro un sotto-agente sono **conseguenze** |
| T14-D1 · T14-D2 · T14-D4 | **T14-D4** | Una sola radice: `schermoNote` non esisteva. Curata (`index.template.html:543`, `components/note.js`, `bridge/legacy-dom.js:45`) |
| BH-06 · CB-19 | **BH-06** | Identico, riconosciuto dalla seconda caccia |
| BH-18 · CB-20 | **BH-18** | Identico |
| BH-15 · CB-15 (punto 3) | **BH-15** | Identico; O-24 ne copre solo la metà «chat» |
| BH-12 · T13-D3 | **BH-12** | «1 ricordi». Curato in `components/plurale.js` |
| BH-05 · T10-D5 · T10-D9 | **BH-05** | Le due UI dell'albero |
| BH-13 · T10-D6 | **BH-13** | Cappelli in inglese |
| BH-16 · la riga «ricerca sidebar» di A6 | **BH-16** (comportamento) e **A6** (decisione) | Sono due cose: il messaggio mancante e la ricerca dentro le conversazioni |
| T17-D2 · D5 dell'audit | **D5** | Curata dal blocco «luoghi» (`index.template.html:637`) |
| T17-D1 · D2 dell'audit | **D2** | Curata (`components/impostazioni-campi.js`, `SEZIONI_IMPOSTAZIONI` con i due gruppi) |
| T19-D1/D2 · H1-H5 | **H1-H5** | T-LUOGHI-05 ha verificato severità e conteggio; restano aperti solo i **rimedi eseguibili** |
| T16-D1 · T16-D2 · T16-D4 | **T16-D4** | Stessa colonna Costo. Curata nascondendola onestamente (`board.js:88` e `:107`, `th.hidden`) |
| CB-16-bis · O-24 | **entrambi** | O-24 = chat (chiusa) · CB-16-bis = Model Lab e selettore (aperta). Non fonderli o si perde la metà aperta |
| CB-09 · CB-08 | **entrambi** | CB-08 è il sintomo (una volta), CB-09 è il cancello che non lo vede (sempre) |
| T04-D1 · B16 dell'audit | **B16** | Curata (`app.js:15031`) |
| T11-D4 · T11-D9 · C10 · CB-17 | **C10** | Una sola cura: `components/nomi-attrezzi.js:130 DESCRIZIONI_ATTREZZI` + `:181 descrizioneAttrezzo`. Chiusa |
| T20-D9 · BH-22 | **BH-22** | `#introDialog` morto |
| CB-24 · BH-21 | **entrambi** | Uno schermo morto (CB-24) e dodici velo morti (BH-21): insiemi diversi |
| T17-D6 · D10-D12 | **D10-D12** | Curata (`components/scorciatoie.js` + `app.js:15017`, `Ctrl+/`) |
| T05-D2 · «lo stop diventa una carta rossa» | **T05-D2** | Curata (`app.js:7923-7931`, `fermato-da-te` → badge «Fermato», tono `accent`) |

⛔ **Ritirate, non farle risorgere**: `T06-D1`, `T07-D1`, `T10-D1`, `T15-D3`, `T18-D1`, `T20-D1`
(erano difetti della sonda, non della app) e le due accuse ritirate dell'audit sul modello avviato.

---

## 4 · Le contraddizioni fra documenti

1. ⛔ **O-28**: la **tabella** del registro dell'owner dice ✅ e la **prosa dello stesso file**
   intitola la sezione «🔴 APERTO». Verità: **UI chiusa, kernel aperto**. Il file si contraddice
   con sé stesso a venti righe di distanza.
2. ⛔ **O-31**: tabella ✅ («provato dal vivo, il modello risponde sulla pagina»), prosa «🔴 APERTO,
   critico» con tre vie proposte e nessuna scelta. Verità: c'è un commit (`b4660ef1`), non c'è una
   prova. **CHIUSO-NON-PROVATO.**
3. ⛔ **O-10**: tabella ✅, e più sotto «⛔ O-10 riaperto — una chiusura mia che non reggeva».
   La riga ✅ non è mai stata corretta.
4. ⛔ **AUDIT contro T-LUOGHI**: l'audit dà ❌ a **C5** («costo in token per attrezzo: assente»),
   **C9** («nessun pannello di dettaglio»), **G22/G29** («il pulsante notifiche non apre niente»).
   I taccuini `T-LUOGHI-03` e `T-LUOGHI-04` dimostrano, aprendo la pagina, che **erano già fatte**
   quando l'audit le ha scritte. ⇒ **l'audit del 06/09 è vecchio su almeno quattro righe**: i suoi
   numeri (80/41/46/26) non si possono citare senza rieseguirlo.
5. ⛔ **AUDIT contro T-LUOGHI-02**: D2 ⚠️, D5 ❌, D13 ⚠️, D21 ❌, D22 ❌, D26 ❌ — tutte curate.
   Verificato nel codice: `components/impostazioni-campi.js` (`SEZIONI_IMPOSTAZIONI`, dieci sezioni
   in due gruppi), `index.template.html:637` (Memoria e contesto, Costi e consumo, Sicurezza e
   privacy, Esporta/Importa/Ripristina).
6. ⛔ **BUG-HUNT-2 contro T-LUOGHI-05**: la tabella «difetti della prima caccia ancora vivi» elenca
   **BH-12** («1 sessioni» nella Board). È **curato**: `frontend/src/components/plurale.js`, usato
   da memoria · officina · board · libreria · capability · attività · doctor. La tabella è più
   vecchia della cura di poche ore.
7. ⛔ **STATO-RELEASE punto 5 contro BUG-HUNT-2 sospetto ritirato #5**: il primo dice «*Accetta
   questo file* e *Scarta tutto* senza nessun gestore», il secondo dice «non sono morti: sono
   nascosti». **Vince il secondo** (`components/review.js:135-138` + `app.js:9183`) — ma con la
   riserva del §2.5 punto 5 (sei elementi dipendono da una chiamata a runtime, uno è fuori raggio).
8. ⛔ **CB-09 contro oggi**: «`npm run verify:ui` fallisce sempre». Oggi **passa** («UI manifest
   verificato: 25 asset», uscita 0), perché `harness-ui/dist/` esiste in locale. Ma `dist/` è
   **gitignorata** (`.gitignore:48`) ⇒ su un clone pulito la diagnosi di CB-09 torna vera, e il
   difetto strutturale non è mai stato toccato (`scripts/build-ui.mjs:7-8`: `SOURCE = public`).
9. ⛔ **CB-08 contro oggi**: «`public/` è indietro rispetto ai sorgenti». **Non confermato oggi** —
   la build è vietata in questo giro. Sei marcatori delle cure più recenti (`sommaUsage`,
   `nomeModelloUmano`, `md-table`, `spiegaErrore`, `schermoNote`, `fermato-da-te`) sono **presenti**
   in `harness-ui/public/app.js`. Sembra allineata; **nessun cancello lo garantisce**.

---

## 5 · ⛔⛔⛔ LE COSE DIMENTICATE — nominate in un taccuino o nella prosa, mai in una tabella

> Questa è la sezione per cui questo documento esiste. **41 righe** vivono solo dentro un taccuino
> o dentro un paragrafo di prosa: nessuna tabella di stato le contiene, quindi domani nessuno le
> ritrova. Le ho verificate una per una.

### 5.1 · I taccuini T01–T04: **undici difetti fuori da ogni tabella**

Il `REPORT-VERIFICA-20-TASK` dichiara nel titolo di coprire **T05–T20**. I taccuini `T01`, `T02`,
`T03`, `T04` esistono, contengono difetti numerati, e **non compaiono in nessun altro file**
(verificato: `grep -rl "T01-nuova-sessione-D" .claude/` → solo il taccuino stesso; idem T02, T03,
T04).

| id | frase | stato REALE oggi |
|---|---|---|
| `T01-nuova-sessione-D1` | modale a due colonne invece che a due passi (F1-F2) | **APERTO** |
| `T01-nuova-sessione-D2` | i progetti non dicono quante sessioni hanno (F5) | **APERTO** (`app.js:12838`) |
| `T01-nuova-sessione-D3` | la cartella scelta è a 968 px dal pulsante (F8) | **non confermato** (geometria) |
| `T01-nuova-sessione-D4` | non dice quanti file ha la cartella né avvisa se è una radice (F9-F10) | **CHIUSO** — commit `a4d982c8`, `components/cartella-ritratto.js:23-29` |
| `T01-nuova-sessione-D5` | nessuna informazione git (F19-F21) | **CHIUSO** — stesso commit |
| `T01-nuova-sessione-D6` | «Planner opzionale» ancora nella modale (F14) | **APERTO** (`app.js:12586`) |
| `T01-nuova-sessione-D7` | manca la riga col totale attrezzi e il costo per giro (F23) | **APERTO** |
| `T02-primo-messaggio-D1` | il costo della sessione non compare nel composer (B26) | **CHIUSO-NON-PROVATO** (`chat-foot.js:341`) |
| `T03-permessi-D1` | 5 attrezzi nel foglio invece di 43 (E7) | **APERTO** (`config.mjs:273`) |
| **`T03-permessi-D2`** | **chiudere «scrivi» non impedisce la scrittura via «shell»** | **APERTO — è il difetto di sicurezza più grave di tutta la coda** |
| `T04-coda-e-reindirizzo-D1` | Esc non chiede di fermare il giro (B16) | **CHIUSO** (`app.js:15031`) |

⇒ **Sei aperti, uno grave, mai visti da nessuna tabella di stato in tre giorni.**

### 5.2 · Le riserve «NON VERIFICATO / NON FATTO, per nome» dei cinque taccuini T-LUOGHI

Ogni taccuino chiude con un blocco `⛔ NON VERIFICATO` scritto onestamente — e **nessuna di quelle
righe è mai risalita in una tabella**. Sono **22**:

- **T-LUOGHI-01 (Model Lab / Hugging Face)** — il **download vero** mai premuto · la misura con un
  esito **vero** (`compatible`/`tight`/`blocked`) mai vista: su quella macchina `/fit-estimate`
  risponde sempre 503, quindi il ramo «misura» di `varianteConsigliata` è provato **solo nei test
  unitari** · i repository **`gated`** mai visti a schermo · la stima copre i **soli pesi**, non il
  contesto (Hermes garantisce 64K: è un debito del runtime).
- **T-LUOGHI-02 (Impostazioni)** — **D7** (modello ausiliario per mestiere) **non fatta**, «serve il
  kernel» · **D14** (timeout approvazione), **D15** (redazione dei segreti), **D18** (checkpoint):
  **non fatte di proposito**, perché senza il motore dietro sarebbero promesse vuote · **D16/D17**
  non ispezionate · **D19** (pallino di salute dei provider) non fatta · **D27** (chat archiviate)
  non fatta, «è uno stato del server» · la **ripartizione con una finestra vera** mai vista a
  schermo · le **tabelle dei costi con dati veri** mai viste (store vuoto).
- **T-LUOGHI-03 (Capability)** — **C13** («trasforma questo lavoro in una skill») non fatta ·
  **C21** (costo in token di un file di Libreria) non fatta · **C8** (ordinare per più usati) non
  toccata · **C11** (attrezzi non supportati dal modello) non verificata · le schede **Skill ·
  Connettori · Plugin · Hook** aperte «solo di sfuggita», mai ispezionate ⇒ **C3** resta ⚠️ ·
  l'uso registrato per attrezzo mai provato con una sessione vera.
- **T-LUOGHI-04 (Notifiche)** — ⛔ **una notifica di sistema che parte DAVVERO non è mai stata
  vista**: provati solo i due versi contrari (senza permesso, a finestra visibile), entrambi a zero
  · il **clic sulla notifica** che riporta la finestra davanti: scritto, mai eseguito · il
  **contrassegno sulla riga** con un'approvazione vera in attesa: mai visto a schermo.
- **T-LUOGHI-05 (Doctor e luoghi)** — ⛔ **il plurale col numero UNO non è mai stato visto a
  schermo** (store vuoto ⇒ tutti i conteggi erano 0, cioè proprio il caso che il vecchio codice
  azzeccava per sbaglio): la cura è provata solo nei 12 test unitari · **H6** (quanto occupano app
  e store) mai cercata fra le 11 carte · **H9-H10** (versione pagina vs server) **non fatti**,
  legati alla riga W0-09 (verificato: zero controlli di versione fra pagina e server nel codice) ·
  i **rimedi eseguibili** del Doctor mai premuti («non so se ce ne sono») · **C21**, **C22**,
  **C25** non fatte.

### 5.3 · Le dodici righe «NON VERIFICATO» del report, senza un id

Il `REPORT-VERIFICA-20-TASK` ha una sezione `⛔ NON VERIFICATO, per nome` con **12 voci** — e
nessuna ha un id. Senza id non entrano in nessuna coda e nessuno le ricerca:

C12 (skill a tre stati) · C15-C17 (connettori MCP) · C18-C19 (plugin) · C21 su file veri ·
C26/C27 con dati veri · G22/G29 col caso pieno · la densità applicata alle **pagine** (provata solo
sulla sidebar) · i **veli alle tre viewport** (guardati solo a 1440×900) · il **passo 4 «Fine»**
dell'intro e H19 · il **secondo modo di O-28 su una pagina grande** (misurato solo su
`example.com`, quattro righe: il caso dell'owner da 438.747 caratteri non è mai stato riprodotto) ·
la **dettatura vocale** (B29) · il **tema chiaro guardato con l'occhio**.

⇒ Propongo gli id `NV-01…NV-12` e che entrino in questa coda.

### 5.4 · Difetti nominati nella prosa e mai numerati

1. ⛔ **Audit, sezione F, «fuori tabella»**: «con una cartella fuori dall'elenco dei progetti il
   server esige *Accesso pieno*; se scegli *Scrittura nel workspace* — cioè il default deciso in
   F16 — il primo messaggio **resta nel composer** e appare la nota *Serve Full access*».
   L'intro ti lascia scegliere una combinazione che non può funzionare e lo scopri al primo invio.
   **Nessun id, mai risalito.** Codice: `app.js`, ramo `cartellaLibera`.
2. ⛔ **Registro dell'owner, verifica finale**: «il triangolino del dettaglio si leggeva **b8** — un
   escape CSS senza terminatore veniva letto come carattere più il testo *b8*». Dichiarato corretto
   nello stesso giro, **senza id**: non c'è modo di verificarlo domani.
3. ⛔ **BUG-HUNT-2, prosa di CB-02**: «dalla stessa causa, **nessun link è cliccabile** —
   `.talos-message a[href]` = 0 su una risposta che conteneva un URL». È un difetto a sé, non un
   corollario: le tabelle sono state fatte (`app.js:1896-1945`), **i link no** (verificato: nessun
   ramo che costruisca `<a>` in `renderizzaMarkdownSemplice`, `app.js:1823`).
4. ⛔ **BUG-HUNT-2, «cosa non ho guardato»**: il **ritorno del server dopo la caduta** (CB-20-bis) —
   misurati 60 secondi di server morto, **mai riacceso**, e il pulsante «Riprova» della barra **mai
   premuto** · **due schede aperte sulla stessa sessione** (concorrenza fra client): mai provato ·
   il pulsante **«Verifica compatibilità»** della scheda Installati: visto, mai premuto.
5. ⛔ **BUG-HUNT-1, «cosa non ho coperto»**: **contrasto WCAG scartato** nella prima caccia e
   ricostruito nella seconda (CB-06) · **9 azioni distruttive saltate per costruzione** (elimina,
   svuota, disinstalla, riavvia, installa, scarica, esporta, accedi, termina) — **nessuno sa se
   funzionano**, in nessuna delle due cacce.
6. ⛔ **BUG-HUNT-2, onestà finale**: «gli screenshot li ho guardati **tutti con le sonde**, non
   tutti con gli occhi: delle 96 combinazioni ne restano guardate a occhio **una ventina**».
   ⇒ Su ~76 schermate un difetto di spaziatura o allineamento **sarebbe passato senza essere
   visto**. Non è un difetto: è un **buco di copertura** che nessuna tabella dichiara.
7. ⛔ **CB-06 (contrasto in tema chiaro)** — è in tabella nella seconda caccia ma **nessun altro
   documento lo riprende, e non è nel registro dell'owner**: `--talos-muted:#686a70` su `#ece9e2`
   dà **4,30-4,46 : 1** contro i 4,5 richiesti, su **144 elementi campionati**; il piede della chat
   sta a **2,84 : 1**. Il token è ancora quello (`frontend/src/styles/tokens.css` e
   `styles/index.css`, riga del tema chiaro). **APERTO**, e riguarda la metà della app che nessuno
   guarda.

---

## 6 · I debiti nel codice, non registrati da nessuna parte

> Cercati con `grep -rn "TODO\|FIXME\|XXX\|HACK\|@debito\|non implementato"` su
> `harness-ui/frontend/src` e `harness-ui/src`. Il risultato è **quasi pulito** (un solo TODO, e
> sta in `frontend/src/assets/xterm/xterm.css:80`, cioè in codice di terze parti). I debiti veri
> non sono commentati: sono strutturali.

| # | debito | `file:riga` | perché conta |
|---|---|---|---|
| 1 | `if (false) { }` dentro `resettaSuperficiRealiDedicate()` | `frontend/src/legacy/app.js:8098` | Residuo di una rimozione. Già CB-25, ma resta codice vivo |
| 2 | **Due funzioni per lo stesso lavoro**: `nomeModello()` (solo `split('/')`) e `nomeModelloUmano()` (traduce anche `local:`) | `frontend/src/components/session-item.js:108-110` contro `frontend/src/components/chat-foot.js:65-82` | È **la causa** della mezza cura di O-24/BH-15: Board e sidebar chiamano quella povera |
| 3 | **Due funzioni per la stessa icona**: `icon()` non valida, `iconaSvgAlbero()` ha la tabella ALIAS | `app.js:1128` contro `app.js:9830-9838` | È **la causa** di CB-10: una corregge, l'altra tace |
| 4 | `apriIntroPrimoAvvio()` (~180 righe) **senza chiamanti** + il suo `<dialog id="introDialog">` | `app.js:13270` · `frontend/src/legacy/frammenti.html:237` | Codice morto in uno strato non nascosto |
| 5 | `#schermoModelLab`: uno schermo intero di mockup finto, **irraggiungibile** | `frontend/index.template.html:455-473` | Nessun `data-vaia="modellab"` fra i 14 esistenti |
| 6 | **12 velo del mockup** che nessun codice apre | `index.template.html` (i velo) · unico riferimento `components/dialoghi.js:23,33` | Il disegno approvato è nel documento e non si usa |
| 7 | **40 `data-richiede="fase3"`**, di cui **6 senza `hidden` nel markup** | `index.template.html`; uno di questi (`talos-approval__foot-note`, «Scartare ripristina il file dal checkpoint del giro 4») sta in `#schermoChat`, che `nascondiAzioniFase3` (`components/review.js:135`, chiamata da `app.js:9183` su `#schermoReview`) **non tocca** | Un pulsante inerte che una funzione dimentica è peggio di uno dichiarato |
| 8 | `scripts/build-ui.mjs` **copia `public/` su `dist/`**: `SOURCE = public`, `OUTPUT = dist` | `harness-ui/scripts/build-ui.mjs:7-8` | Il «cancello» verifica che una copia sia uguale alla sua sorgente, **mai** che `public/` sia la build dei sorgenti |
| 9 | `verify:all` **non invoca** `verify:ui` | `harness-ui/package.json:6-8` | Il cancello esiste e non gira mai |
| 10 | `harness-ui/dist/` è **gitignorata** (`.gitignore:48`) e `verify-ui-manifest.mjs` la pretende | `harness-ui/scripts/verify-ui-manifest.mjs:6` | Passa sulla macchina di chi ha già buildato, fallisce su un clone pulito |
| 11 | `harness-ui/src/runtime-build-manifest.mjs` importato **solo dal suo test** | dichiarato in CB-09, non riverificato oggi | Un validatore che nessun codice di prodotto chiama |
| 12 | `public/vendor/floating-ui` e `public/vendor/tanstack` **non caricati da nessun file** | `harness-ui/public/vendor/` | Resti del frontend parallelo; `THIRD_PARTY_NOTICES.md` non li cita |
| 13 | Nessun **focus trap** e nessun `inert` in tutta la app | cercati `trapFocus`, `focusTrap`, `inert` in `app.js`, `bridge/*.js`, `components/dialoghi.js`: **zero** | BH-03/BH-23: il fuoco esce da ogni velo modale |
| 14 | Il permesso per attrezzo esiste solo per **5 attrezzi su 43** | `harness-ui/src/config.mjs:273` | È il tetto vero di E7 e la causa strutturale di T03-permessi-D2 |

---

## 7 · L'ordine in cui la farei

1. **T03-permessi-D2** — è sicurezza, ed è l'unica riga della coda che può far scrivere un file a
   chi credeva di aver detto no.
2. **CB-18-bis · CB-16 · CB-20-bis · CB-07** — quattro cure piccole (due regole CSS, una busta
   d'errore, un ramo di `readyState`, un campo da azzerare) su cose che **mentono** all'utente.
3. **CB-10 · BH-05 · BH-13 · BH-14 · T17-D7 · CB-11 · CB-14** — le sette cose che si vedono a
   colpo d'occhio: icone vuote, due alberi che si contraddicono, undici stringhe inglesi, un
   interruttore di Chrome, la palette sbagliata.
4. **O-39 poi O-40** — nell'ordine che l'owner ha già scritto: prima le scrollbar (un blocco di CSS
   e una prova), poi i tooltip (208 punti, un componente, una migrazione, le prove di a11y).
5. **Le 19 righe CHIUSO-NON-PROVATO** — una sessione vera col modello flash le chiude quasi tutte
   insieme: O-10, O-26, O-31, O-34, O-35, O-36, O-37, O-18, T09-D4, T02-D1, T20-D4, e almeno sei
   delle dodici `NV-*`. È anche il blocco 2 della release.
6. **I 14 debiti del §6** — sono la ragione per cui le stesse famiglie di difetti tornano.
7. **La release** (§2.5): kernel, merge di 1.643 commit, CI, README, changelog, versione.

⛔ **E prima di tutto**: rieseguire `AUDIT-DECISIONI` sulla app di oggi. Quattro delle sue ❌
(C5, C9, G22, G29) erano **già false quando è stato scritto**, e altre diciotto sono state curate
dopo: i suoi numeri non si possono citare finché non gira di nuovo.

---

## ⛔ 07/09 — UNA SOLA CAUSA dietro una fetta dei «riferimenti morti»: dodici finestre irraggiungibili

Trovato scendendo i sospetti del cancello, partendo da `data-ridimensiona`.

**Il template ha 22 veli (finestre modali). Dodici non si possono aprire**: nessun
`data-apre-velo="..."` nel markup, e nessun sorgente ne nomina l'id.

| irraggiungibile | e nel prodotto la stessa cosa si fa così |
|---|---|
| `veloNuova` | la modale vera è `#newSessionBtn` → `.workspace-chooser` |
| `veloPermessi` | il foglio vero è `openSheet('permissions')` |
| `veloModello` | il selettore vero è `.model-picker-trigger` |
| `veloEsporta` · `veloRinomina` · `veloEliminaSessione` | azioni di sessione, con `openSheet` |
| `veloFile` · `veloCreaFile` · `veloEliminaFile` · `veloRinominaFile` | menu dei file, altro meccanismo |
| `veloAmbiente` · `veloRiferimenti` | idem |

⇒ **Non è un difetto funzionale**: quelle funzioni esistono tutte, fatte col vecchio meccanismo del
monolite. È **debito del cutover**: il mockup portava la sua versione di ogni finestra, il prodotto
ne ha collegate 10 su 22, e le altre 12 sono rimaste nel markup.

**Quanto pesa: ~43 KB su 310, il 14% del template**, servito a ogni apertura della app.

⭐ E spiega **una sola causa** dietro tanti reperti del cancello: dei 15 attributi «scritti e mai
letti» (`data-modello-dialogo`, `data-fonte-modello`, `data-file-action`, `data-coda-togli`…), la
gran parte vive dentro questi dodici veli. Non sono 15 difetti sparsi: è **un difetto solo**, e ha
una cura sola.

⛔ **La cura è una decisione dell'owner**, non mia, perché sono due strade opposte:
1. **togliere** i dodici veli dal mockup — il template cala del 14%, e il mockup smette di
   promettere finestre che il prodotto non usa;
2. **collegarli** al posto dei fogli vecchi — è il cutover finito davvero, ma è molto più lavoro e
   tocca funzioni che oggi girano.

⛔ Nota su una mia cura di poche ore fa: «Gestisci nel Model Lab» l'ho collegato **dentro
`veloModello`**, cioè dentro una finestra che nessuno può aprire. Il collegamento funziona (provato
cliccando l'elemento) ma non è raggiungibile da una persona finché quella finestra resta chiusa.
Va rifatto sul selettore vero, o cade dentro la decisione qui sopra.

---

## 6 · Aggiunte e smarcature del 07/09 (owner: «non andare a memoria, segnala e smarca man mano»)

| id | cosa | stato |
|---|---|---|
| **O-59** | la risposta a schermo non è quella del giro (screenshot 14:54: otto ricerche su GLM-5.3 e sotto la risposta su `example.org`) | **APERTO — nuovo**, dettagli nel registro difetti |
| **O-60** | il suggerimento del composer riporta la query grezza con le virgolette annidate | **APERTO — nuovo** |
| **CB-10** | «11 icone che non esistono» | **CADUTA il 07/9**: misurato — 48 simboli nello sprite, 41 nomi usati, **0 usati-e-non-disegnati**. Resta solo la validazione di `icon()`, che non protegge da un nome futuro |
| **CB-11** | la palette italiana non si apriva | **IN CORSO 07/9**: `openCommandPalette` apre `#veloComandi`, ricerca/frecce/Invio collegati a entrambi i campi. Da riverificare dal vivo |
| **CB-18-bis** | l'esito di un'approvazione senza colore | **CHIUSA**: 3 regole `approval__esito--` nel foglio servito |
| **BH-13** | sei cappelli dei fogli in inglese | **CHIUSA** il 07/9 |
| **BH-14** | politiche in inglese a schermo | **CHIUSA** il 07/9 (`components/politiche.js`, valore del kernel invariato) |
| **CB-14** | l'unico interruttore non stilato | **CHIUSA** il 07/9 (vestiti tutti i controlli nativi) |
| **T03-D2** | chiudere «scrivi» non chiude il terminale | **CHIUSA** il 07/9: l'avviso vive nel velo Permessi ed è AGIBILE sul posto |
| **BH-05** | l'albero apriva due UI che si contraddicevano | **CHIUSA** il 07/9: una porta sola, `sessionTree` → `veloAlbero` coi dati veri |
| **CB-11** | la palette italiana non si apriva | **CHIUSA** il 07/9, provata dal vivo: si apre `#veloComandi`, filtra (anche per alias: «fork» trova «Crea un ramo»), frecce e Invio funzionano, «nessun risultato» compare, e il comando cambia vista |
| blocco release **1** | il kernel non era nel repo | **CHIUSA** il 07/9 (owner: «confermo, può stare sul repo pubblico»): `harness-ui/src/kernel/`, default nel config, 538 test suoi nei cancelli, `npm run kernel:controlla` per la divergenza. Provato: giro vero **senza** `TALOS_OWNER_RUNTIME_MODULE` |
| blocco release **3** | CI e artefatto non conoscevano il desktop | **CHIUSA** il 07/9: job `desktop` in `ci.yml` (4 cancelli + kernel), job `desktop` in `release.yml` sui tag `desktop-v*`, pacchetto **5,2 MB** provato dal vivo — `npm ci` in cartella pulita, avvio senza variabili, un giro vero concluso |
| blocco release **4** | nessuna prova da macchina pulita | **PARZIALE**: il pacchetto scompattato si installa, si avvia e fa un giro vero su QUESTA macchina (Node e chiave già presenti). Resta da provare su una macchina che non ha mai visto TALOS |
| blocco release **5** | controlli morti della Review | **CHIUSA**: 40 marcati «fase 3», **0 visibili** su chat/review/terminale/browser (misurato col browser) |
| **BROWSER-OGNI-PAGINA** | owner 07/09: «visualizzare ogni fottuta pagina — meglio degli altri». **DECISO: A+B, A predefinito, B quando A fallisce.** **A** = proxy universale su **origine separata** (riscrivere i link sulla nostra origine violerebbe la same-origin: gli script del sito vedrebbero `localStorage` e le nostre API). **B** = **Chromium di sistema** (canale `chrome`/`msedge` di Playwright: zero MB nel pacchetto, su Windows Edge c'è sempre; ripiego `install --only-shell`) pilotato **dal server**, con `Page.startScreencast` (~70 fps contro ~5 dello screenshot polling) e overlay di annotazione iniettato via CDP. Scartati con motivo: Servo (0.1.0 su crates.io il 13/04/2026, «rough edges» sul web aperto), Ultralight (motore ridotto, licenza commerciale), CEF (~100+ MB contro i nostri 5,2), WebView2/wry (ci obbligherebbe a diventare app nativa). ⭐ I tre sorpassi sui concorrenti diretti, in `.claude/DOSSIER-BROWSER-COMPETITOR-2026-09-07.md`: il browser sta **dove sta l'agente** (Hermes ammette in `preview-reach.ts` che col gateway cloud non si può fare); **nessuna estensione né schede personali** (Claude in Chrome chiede `debugger` e cattura le schede del gruppo); **pixel + DOM + testo insieme**. E il browser sta in un **processo separato**: Codex su Windows si chiude aprendo l'in-app browser su localhost (issue #32040). | **DA FARE — approvata, non ancora iniziata** |
| **O-42** | il Browser mostrava il riquadro rotto su una pagina che vieta la cornice | **CURATA il 07/9**: la cornice si chiede PRIMA (`/api/v1/browser/incorniciabile`) anche per le letture dell'agente; chi vieta va al testo con la riga che dice perché. Misurato: il ripiego a 4 s non poteva scattare (Chrome manda `load` sulla sua pagina d'errore). Riverifica dal vivo su github: in corso |
| **O-61** | due riquadri sovrapposti sul fumetto della barra dei giri | **CHIUSA il 07/9**: era il tooltip nativo (`title`) sopra il nostro; riverificato dal vivo (`conTitle:0, fumetti:1`) + cancello `tests/unit/cronologia.test.mjs` |
| **O-62** | il titolo della chat usciva sopra la testata in Review, e non si troncava abbastanza presto | **CHIUSA il 07/9**: il percorso era il quarto figlio di una griglia a tre colonne; ora dentro il titolo, tetto 420px. Riverificato a 1920 su quattro viste + cancello `tests/unit/topbar-forma.test.mjs` |
| **O-44 / O-46** | loghi mockup, e la chat vuota senza logo né nome | **CHIUSE il 07/9**: marchio VERO (`logo-short.svg`) nello sprite + nome in Orbitron sopra il benvenuto, misura che cresce col viewport. Verificate dal vivo con foto |
| **O-60** | il suggerimento col la query grezza | **CHIUSA il 07/9**: `frase-cercata.js`, 5 prove |
| **O-43** | l'accento nel testo del composer | **VERIFICATA il 07/9**: era già così su entrambi i composer e su entrambi i temi. Nessuna modifica |
| **O-41** | allegati dentro la bolla | **CHIUSA nel codice il 07/9** (mancava il PRIMO messaggio); riverifica dal vivo insieme a O-45 |
| **O-45** | i tre pallini non animati | **QUATTRO CAUSE ESCLUSE il 07/9** (Windows, CSS, GPU, animazione ricreata). 🔜 resta da guardare DURANTE un giro vero |
| **O-47 / O-48 / O-49 / O-50** | stop, stato del giro, errore ripetuto, riprendere | **CHIUSE**: stop misurato 4 ms; `runRealeAttivo` guarda il server; `APPROVAL_NOT_PENDING` invece di «Query non valida»; resume provato dal vivo |
| **fogli legacy** | «capabilities» e «control» erano due indici di cose che hanno già la loro schermata | **CHIUSA il 07/9**: `apriCapabilityDaFoglio()` e `case 'control' → eseguiDoctor()`; tolto anche l'ultimo chiamante (il pulsante «Apri Doctor» dell'errore cartella). 🔁 resta: i due TEMPLATE morti in `app.js` non si cancellano finché il velo `references` non ha un'altra via d'apertura (era lì dentro) |
