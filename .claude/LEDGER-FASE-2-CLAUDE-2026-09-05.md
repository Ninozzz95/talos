# LEDGER — Fase 2, la metà di Claude (dal 05/09/2026)

> Il piano: `PIANO-MOCKUP-DIVENTA-LA-APP-2026-09-05.md`. La spartizione con Astra:
> `BRIEF-ASTRA-FASE-2-SPARTIZIONE-2026-09-05.md` (la sua metà ha il suo ledger,
> `LEDGER-ASTRA-FASE-2-2026-09-05.md`). Qui: una sezione per componente della mia metà —
> Sidebar, Topbar, Chat, Piede, Chat vuota, Review, cutover. Ogni sezione chiude SOLO con
> il cancello verde **e** le immagini guardate contro mockup **e** originale, e la chiude
> l'owner.

## Metodo (uguale per ogni componente, vedi brief §3)

ricerca (fonte+data) → markup del mockup copiato → fixture nella forma vera dell'API →
`src/components/<blocco>.js` → laboratorio + cancello dei componenti (struttura, parole,
pixel, 3 viewport) → innesto nel monolite → cancello statico (54/54) → dal vivo su 4175
(store copiato) con la app originale su **4180** (stesso store) come metro dei DATI →
screenshot guardati → commit.

Porte mie: 4175 app nuova · 4176 laboratorio · 4180 app originale. Mai il 4174.

---

## S-01 · SessionItem (la riga di sessione della sidebar) — ✅ verde · APPROVATA dall'owner il 05/09 («Approvate»)

**Blocchi del mockup**: `SessionItem` (in `SessionList` e nel `NavGroup` «Fissate»).
**Fixture**: `lab/fixtures/sessioni.js`, 7 sessioni nella forma di `GET /api/v1/sessions`
(`sessionId, nome, taskId, modello, conclusa, interrotta, inAttesaApprovazione,
ultimoEsito, avviataAlle, usage.giri, forkDa`), `ADESSO` fisso.
**Componente**: `src/components/session-item.js` — `creaSessionItem`, `statoSessione`,
`oraCompatta`, `nomeModello`.
**Monolite toccato** (`src/legacy/app.js`, commenti `05/9 Fase 2`): `aggiornaElencoSessioniReali`
(il ciclo delle righe), `rigaSessionePendente`, `contenitoreSessioniReali` (il blocco va DOPO
la testata «Sessioni · N»), il rinomina della sessione aperta (selettore), lo `statoSessione`
locale rimosso (vive nel componente, esportato ai test hook). Import in testa al file.
**Ponte** (`src/bridge/legacy-dom.js`): il blocco «Fissate» perde la riga d'esempio e resta
nascosto (`data-fissate="vuoto"`) finché il pin non esiste.
**Mockup toccato** (solo per farlo funzionare, stesso linguaggio): il testo di stato della riga
sta in `<span class="talos-session-item__state">` e il CSS lo tronca con i puntini; il titolo è
`display:block` e il contenitore ha `min-width:0`. Senza questo i nomi VERI delle sessioni
(«Add and export a function `sottrai(a, b)` in src/matematica.mjs…») invadevano la colonna
dell'ora — nel mockup non si vedeva perché i suoi nomi sono corti.

**Ricerca** (05/09/2026): CSS Flexible Box Layout Module Level 1, §4.5 «Automatic Minimum Size
of Flex Items» (w3.org/TR/css-flexbox-1/#min-size-auto) — un elemento flex/grid ha
`min-width:auto`, quindi non si stringe sotto il suo contenuto: il troncamento vuole
`min-width:0` sul contenitore e un elemento (non un nodo di testo anonimo) su cui applicare
`text-overflow`. Light-DOM-only web components (blog.master.dev/light-dom-only, 05/09).

**Cancelli**: componenti **3/3** (1440/1280/1024; parole identiche dopo il `locale: it-IT` —
la regia del mockup traduce da `navigator.language` e Chrome headless è `en-US`: prima del
fix il confronto delle PAROLE era fra due lingue) · statico **54/54** · build 30 asset.

**Dal vivo** (4175 contro 4180, store copiato, 74 sessioni): 74 righe da entrambe le parti,
zero errori di pagina; stessi giri (9 · 24 · 22 · 24 · 15…), stessi stati (conclusa/errore),
stesso ordine; la testata dice «Sessioni · 74». Immagini in
`.claude/immagini/fase2-claude/SessionItem/`: `cancello-mockup-1440` ↔ `cancello-app-1440`
(identiche a occhio), `vivo-nuova-{1440,1024}` ↔ `vivo-originale-{1440,1024}`.

**Differenze volute rispetto all'originale** (forma del mockup, dati uguali): l'ora è compatta
(«18:09» oggi, «ieri», «2 g», poi la data) invece della sola ora; lo stato usa le parole del
mockup («errore», «giri finiti» quando il motivo è noto) invece di «conclusa con errore».

**Taccuino — difetti visti fuori tema, da chiudere nelle prossime sezioni**
- T-01 i contatori dei Luoghi (Capability 43 · Board 69 · Libreria 18 · Memoria 7 · Attività 4)
  sono ancora i numeri del mockup → **S-02 NavItem** (dati veri: Board = 74 sessioni, ecc.).
- T-02 «Workspace locale · Tema Calm · locale» è testo del mockup → **S-03 WorkspaceFooter**.
- T-03 il mockup non ha la **selezione multipla** delle sessioni (toolbar «Seleziona sessioni ·
  Nessuna selezionata» dell'originale) né il suggerimento «Tieni premuta una chat per le
  azioni»: si disegnano NEL mockup col suo linguaggio (sidebar = mia), poi si rendono vivi.
- T-04 il **pin** («Fissate») non esiste nell'app: vuole un campo `fissata` in
  `GET /api/v1/sessions` e un endpoint per cambiarlo → contratto congelato fino alla Fase 3;
  si fa lì, con il blocco che si riaccende da `data-fissate`.

**Non verificato**: la selezione multipla e il menu del tasto destro sulle righe nuove (i
gestori sono cablati; il pulsante «Seleziona sessioni» non è nel mockup, T-03). Il tema
chiaro (B8, Astra).

Cosa deve fare l'owner: guardare le immagini di `immagini/fase2-claude/SessionItem/` e dire
sì/no · Cosa faccio io: S-02 NavItem e S-03 WorkspaceFooter, poi la Topbar · Cosa rimane:
T-03 e T-04 (sopra), per nome.

---

## S-02 · NavItem (i Luoghi con i badge di conteggio) — ✅ verde · APPROVATA dall'owner il 05/09 («Approvate»)

**Blocchi**: `NavItem` (5 + «Altro» + 4 dentro `#luoghiAltri`). **Fixture**: `lab/fixtures/luoghi.js`
(i conteggi del mockup, già ridotti a numero). **Componente**: `src/components/nav-item.js` —
`creaNavItem`, `impostaConteggioNav`, `aggiornaConteggiNav`, `LUOGHI`, `LUOGHI_ALTRI`.
**Monolite**: nuova `aggiornaContatoriLuoghi(n)` chiamata da `aggiornaElencoSessioniReali`:
Board = sessioni lette; Capability = `attrezzi.length` di `/api/v1/tools`; Automazioni =
`items.length`; Libreria · Memoria · Attività · Note · Ricerca · Officina = le liste della
sessione aperta (`voci`, `memorie`, `attivita`, `note`, `ricerche`, `strumenti`), rilette solo se
la sessione cambia o dopo 15 s. Senza sessione, o su rotta fallita/`null`, il badge NON c'è.
**Mockup toccato**: il pulsante «Note» (che non ha una schermata) porta `data-conteggio="note"`
per essere indirizzabile; nessun cambio visivo.

**Ricerca** (05/09/2026): il conteggio resta testo visibile del pulsante — niente `aria-label`
che duplichi il testo (non tradotto dai browser, sovrascrive il nome accessibile:
aditus.io/aria/aria-label; web-accessibility-checker.com «ARIA labels best practices»);
badge `aria-hidden` + nome in `aria-label` solo per pulsanti a sola icona
(opensource.ebay.com/evo-web icon-button). Hermes web dashboard (docs «memory», 2026) mostra la
memoria come percentuale d'uso: qui i numeri sono dimensioni di liste, come nel mockup.

**Cancelli**: componenti **6/6** (SessionItem + NavItem × 3 viewport) · statico **54/54** ·
unit `tests/unit/componenti-sidebar.test.mjs` 5/5 (anche al verso contrario: esito assente ≠
successo, data non valida → «»).

**Dal vivo** (4175, store copiato, sessione aperta): Board **74**, Libreria **0**, Memoria **1**,
Attività **2**; Capability SENZA badge perché `/api/v1/tools` risponde `attrezzi:null`
(«runtime agente non configurato» sulla porta di prova: sul 4174 dell'owner il kernel c'è).
Immagini in `.claude/immagini/fase2-claude/NavItem/`.

**Taccuino**: T-02 (footer) resta per S-03. Le voci dentro «Altro» non si vedono nel confronto
dal vivo (disclosure chiuso): si guardano in S-03 aprendolo.

---

## S-03 · WorkspaceFooter (il piede della sidebar) — ✅ verde · APPROVATA dall'owner il 05/09 («Approvate»)

**Blocco**: `WorkspaceFooter` (+ `IconButton` impostazioni con `data-vaia="impostazioni"`).
**Fixture**: `lab/fixtures/workspace.js` (nessuna sessione, tema `calm`, modello `local:…` →
«Workspace locale / Tema Calm · locale», le parole del mockup). **Componente**:
`src/components/workspace-footer.js` — `creaWorkspaceFooter`, `aggiornaWorkspaceFooter`,
`testiPiede`, `nomeDaPercorso`, `fornitoreDelModello`, `NOMI_TEMA`.
**Monolite**: nuova `aggiornaPiedeSidebar()` chiamata da `aggiornaSottotitoloSessione` (ogni
ridisegno della sidebar), da `applicaAspettoDesktop` (cambio tema) e dopo ogni assegnazione di
`state.model`. Titolo = cartella della sessione (`cartellaAssoluta`, la verità di RunStarted) o
il nome scelto in «Nuova» prima del primo giro, altrimenti «Workspace locale»; sottotitolo =
«Tema <preset>» dalla radice (`data-talos-theme`, scritto da `applicaThemeDesktop`) e «· locale»
per `local:<id>` o «· <fornitore>» per `fornitore/modello`; niente secondo pezzo se il modello
non lo dice. Il `~` davanti al modello è l'alias del catalogo (`src/model-catalog.mjs`, 27/8):
tolto prima di leggere il fornitore, come fa il picker.

**Ricerca** (05/09/2026): VS Code «Custom Layout» (code.visualstudio.com/docs/configure/
custom-layout) e forum Cursor «VSCode traditional side panel»: il piede della barra laterale
porta identità/workspace a sinistra e l'ingranaggio delle impostazioni a destra — la stessa
disposizione del mockup, confermata.

**Cancelli**: componenti **9/9** (S-01+S-02+S-03 × 3 viewport) · statico **54/54** · unit
**6/6** (radice del disco «C:\» mostrata com'è, alias `~` tolto, modello senza fornitore → niente
secondo pezzo).

**Dal vivo** (4175, store copiato): prima e dopo l'apertura di una sessione il piede dice
«C:\ / Tema Calm · deepseek» — la sessione aperta ha come cartella la radice del disco (è la
sessione «workspace = C:\» già nota dalla review del 02/09) e il modello `~deepseek/…`. La
app originale (4180) mostra un testo fisso «Workspace locale / Tema TALOS · locale» che NON è un
dato: qui non è un metro. Immagini in `.claude/immagini/fase2-claude/WorkspaceFooter/`.

**Taccuino**: nessun difetto nuovo. La sidebar è finita (S-01, S-02, S-03): restano T-03
(selezione multipla, da disegnare nel mockup) e T-04 (pin, Fase 3). Prossimo: **S-04 Topbar**.

---

## S-04 · Topbar (la testata della sessione) — ✅ verde · APPROVATA dall'owner il 05/09 («Approvate»)

**Blocchi**: `Topbar`, `Tabs`, `IconButton` ×5. **Fixture**: `lab/fixtures/testata.js`.
**Componente**: `src/components/topbar.js` — `aggiornaTopbar`, `impostaConteggioScheda`
(aggiorna il markup del template dai dati, non lo ricrea: il monolite lo trova per id).
**Monolite**: nuova `aggiornaTestataSessione()` chiamata da `aggiornaSottotitoloSessione`, dopo
ogni `sessionTitle.textContent = state.session` (8 punti), all'arrivo della cartella
(RunStarted) e a ogni ridisegno della Review. Titolo = `state.session`; percorso =
`cartellaAssoluta` intero (la app non conosce la home: un «~» sarebbe inventato), assente
senza cartella; badge Review = `reviewFiles.size`; badge Terminale = NON scritto finché le
schede W1-01 non hanno una UI (B1, Astra).
**Ponte**: il titolo col chevron e il pulsante «Albero dei rami» aprono il foglio VERO
(`data-open-sheet="sessionTree"`) invece del velo statico del mockup; i tre pulsanti nuovi
prendono `#commandPaletteBtn`, `#compactSessionBtn` e `data-open-panel="inspector"` +
`desktop-context-toggle` (il monolite ascolta il toggle solo con quella classe). I doppioni
legacy degli stessi id/classi nei frammenti nascosti sono stati demossi a `data-legacy-*`.
**Mockup toccato** (nel suo linguaggio): tre `IconButton` in più nella testata — «Comandi
(Ctrl K)», «Comprimi il contesto», «Mostra o nascondi i dettagli» (`aria-expanded`) — con due
simboli portati dallo sprite originale (`i-command`, `i-layout`, stesso tratto 1.6); le schede
e le azioni della testata `flex:none` e il titolo `min-width:0` (con i nomi VERI delle sessioni
«Review» finiva tagliato); `.talos-shell.inspector-collapsed` nasconde la colonna dei dettagli
come già fa `data-vista="pagina"`.

**Ricerca** (05/09/2026): WAI-ARIA APG «Tabs Pattern» (w3.org/WAI/ARIA/apg/patterns/tabs):
attivazione automatica al focus solo se i pannelli sono già nel DOM (lo sono), roving
tabindex; il toggle di una regione usa `aria-expanded` (è ciò che `syncInspectorToggle` scrive).

**Cancelli**: componenti **12/12** (4 componenti × 3 viewport) · statico **54/54**.

**Dal vivo** (4175, sessione aperta, 1440 e 1024, zero errori): titolo vero con i puntini,
percorso «C:\», tre schede visibili a entrambe le larghezze; il titolo e «Albero dei rami»
aprono «Albero sessione»; «Comandi» apre «Comandi TALOS»; «Dettagli» nasconde e rimostra la
colonna (`inspector-collapsed`, `display:none`/`flex`, `aria-expanded` false/true);
«Comprimi» parte (nessun errore) ma senza kernel sul 4175 non c'è un giro da comprimere.
Immagini in `.claude/immagini/fase2-claude/Topbar/`.

**Taccuino**
- T-05 il dialogo «Comandi TALOS» è il DOM legacy senza CSS (icone giganti): il velo della
  palette nel linguaggio del mockup è la parte A di Astra (§2.4) + B7; finché non arriva, il
  pulsante apre il foglio vecchio.
- T-06 a 1024 la barra del composer va a capo («Sessione ~$0,08» sotto): da guardare in
  **S-06 Piede**.
- T-07 la colonna dei dettagli mostra ancora i dati d'esempio del mockup (B2, Astra).
- T-08 badge Terminale assente finché le schede non hanno una UI (B1, Astra).

---

## S-05 · Conversazione (Turn, Message, ActivityBundle, ToolRow, ToolFailure, SystemNote, ApprovalCard, DiffView, SignedReceipt, TouchedFiles, ArtifactCard, attesa) — ✅ verde · APPROVATA dall'owner il 05/09 («Approvate»)

**Blocchi**: tutti quelli della chat del mockup. **Fixture**: `lab/fixtures/conversazione.js` (la
chat del mockup come dati, nella forma che il monolite ha dopo gli eventi dello stream).
**Componente**: `src/components/conversazione.js` — fabbriche `creaTurno`, `creaMessaggioUtente`,
`creaMessaggioTalos`, `creaAzioniMessaggio`, `creaAttivita`, `creaRigaAttrezzo`,
`creaFallimentoAttrezzo`, `creaNotaSistema`, `creaApprovazione`, `creaDiff`, `creaRicevuta`,
`creaFileToccati`, `creaArtefatto`, `creaAttesa`; `ICONA_ATTREZZO` (icona per attrezzo, i nomi che
riceve il modello non cambiano).
**Monolite** (`handleRealEvent` e gli `append*` — il cervello resta, cambia il DOM che emette):
nuove `nellaChat`, `turnoTalosCorrente`, `segnaGiroNellaSpine`, `aggiornaTickGiro`;
`appendRealTaskStart`/`appendUserFollowUp` → Message utente in un Turn; `ensureAssistantMessageElement`
→ testo nel Message TALOS del turno corrente (involucro `.talos-message__copy` con dentro
`.assistant-copy`, il gancio del render incrementale) + azioni copia/ascolta/chiedi di nuovo;
`apriBatchSeServe` → ActivityBundle (riassunto e «+18 −2» in testa); `appendToolNote` → ToolRow con
icona dell'attrezzo, dettaglio mono (`bersaglioAttrezzoNudo`), pallino running/success/error e corpo
espandibile (argomenti + esito); il ragionamento è un bundle suo, nascosto come prima
(`real-reasoning-note`); `appendStatusNote` → SystemNote (Nota/Errore, tick rosso sul giro);
`appendApprovalCard` → ApprovalCard con «Consenti una volta · Per questa sessione · Nega» (per
sessione = approva e ricorda «sempre» per quell'attrezzo via `sincronizzaImpostazioniSessione`;
`sheet-actions`/`assistant-copy` restano i ganci di ApprovalResolved); `appendArtifactCard` →
ArtifactCard (iframe isolato + «Apri»); `mostraAttesaRisposta` → scheletro del mockup con la riga
animata del marchio (stessa immagine del mobile, owner 02/9). I numeri della spine sono i giri:
uno per bundle di attrezzi (il ragionamento non conta); il tick cresce con gli attrezzi (fino a 5)
e prende il tono dell'esito (current → nessuno a fine giro, warning su approvazione, danger su
errore). Nel replay di una cronologia l'ora NON si scrive (non c'è nel flusso: non si inventa).
**Ponte/regia**: il clic sui disclosure (`[aria-expanded][aria-controls]`) è della regia portata in
app.js: il componente non aggiunge un secondo gestore (prima si annullavano a vicenda); da
tastiera Invio/Spazio sulla riga.
**Mockup toccato** (nel suo linguaggio): azioni sul messaggio (`.talos-message__actions`, visibili
al passaggio del mouse; simboli `i-copy`/`i-history` dallo sprite originale), corpo espandibile
della ToolRow (`pre.talos-tool-row__body`, esempio dentro il bundle chiuso), `ArtifactCard`
(scheda con anteprima in iframe) nel terzo turno, riga animata dell'attesa sopra lo scheletro;
**composer**: barra su una riga sola (owner: «il pulsante send non deve andare a capo»), chip che
si stringono con i puntini, scorciatoie nascoste sotto 1280.

**Ricerca** (05/09/2026): AG-UI «Messages» (docs.ag-ui.com/concepts/messages), LangChain «From
Token Streams to Agent Streams», fuselabcreative.com «UI Design for AI Agents 2026»: filo della
conversazione separato dall'attività dell'agente, attrezzi raggruppati e aggiornabili nel tempo,
eventi di ciclo distinti dai messaggi — la forma del mockup.

**Cancelli**: componenti **15/15** (5 componenti × 3 viewport; la Conversazione confronta l'intera
chat del mockup ricostruita dai dati: struttura, parole, pixel) · statico **54/54**.

**Dal vivo** (4175, sessione «Add and export a function `sottrai`…», 9 giri, contro l'originale
4180 sulla stessa sessione; 1440 e 1024; zero errori): 2 turni (1 persona, 1 TALOS), 10 bundle
(7 di ragionamento nascosti), 18 righe attrezzo, 21 blocchi di testo con lo stesso contenuto
dell'originale («Let me find the project files.», l'elenco puntato, il codice inline); bundle e
righe si aprono (esito vero: `ENOENT … C:\.automations`); spine 1 · 2 3 4. Immagini in
`.claude/immagini/fase2-claude/Conversazione/`.

**Non verificato dal vivo** (vuole il kernel: `TALOS_OWNER_RUNTIME_MODULE`, un modello a chiave e
i soldi dell'owner): lo streaming in diretta, l'attesa animata, ApprovalCard con «Per questa
sessione», ArtifactCard con un artefatto vero, SignedReceipt e TouchedFiles (il monolite oggi
non emette ricevute né file-per-giro: il blocco esiste, l'innesto arriva con la Review, S-07).

**Taccuino**
- T-09 il piede della chat è ancora testo del mockup (StatusStrip «giro 7 · 41 s», chip
  «claude-opus-5 · Scrittura nel workspace · Giri 7 · Sessione ~$0,08», barra di stato «41,2k
  token…»): **S-06 Piede**, con il composer ridimensionabile (`talos-harness-composer-size-v1`).
- T-10 il dialogo «Albero sessione» aperto dal titolo è il foglio legacy senza CSS (B7 Astra +
  regola dell'owner: dialoghi ridimensionabili e ricordati, `talos-harness-modal-sizes-v1`).

---

## S-06 · ChatFooter (striscia del giro, coda, composer, barra di stato) — ✅ verde · APPROVATA dall'owner il 05/09 («Approvate»)

**Blocchi**: `ChatFooter`, `StatusStrip`, `MessageQueue`, `Composer`, `AttachButton`, `Chip` ×4,
`SendButton`, `StatusBar`, `IconButton` (microfono). **Fixture**: `lab/fixtures/piede.js` (un giro
in corso, `usage` come da StateDelta /usage, permesso col valore interno).
**Componente**: `src/components/chat-foot.js` — `aggiornaPiedeChat`, `etichettaPermesso` (H22: Sola
lettura · Su richiesta · Scrittura nel workspace · Accesso completo), `tonoPermesso`, `testiUsage`
(41,2k token · 7 giri · cache 87% · velocità), `testoLatenza` (primo token 1,4 s), `kilo`.
**Monolite**: nuova `aggiornaPiedeChatDaStato()` (cosa sta facendo TALOS = la riga attrezzo in
corso o l'etichetta dell'attesa; giro = `usage.giri`; secondi dall'inizio del giro; TTFT dalle
misure di latenza `invio → primoDelta`; modello breve; permesso; tema dal piede della sidebar),
chiamata da `syncRunComposerState`, dal timer dell'attesa (ogni secondo), da
`aggiornaRiassuntoBatch`, da `aggiornaComposerUsage` e da `aggiornaPillolaPermessi`. Il ramo
legacy dei nodi `[data-runtime-*]` si spegne quando c'è il piede del mockup. Il chip del modello
mostra il nome breve. ⛔ Il costo («Sessione ~$0,08») non si stima da soli: senza un dato dal
server il chip resta nascosto.
**Mockup toccato** (nel suo linguaggio, per non perdere NIENTE dell'originale — regola
dell'owner): maniglia di ridimensionamento `.talos-resizer--composer` (angolo in alto a
sinistra, come l'originale; `#composerResizeHandle` → `setupComposerResize`: trascinamento,
frecce, doppio clic, misura ricordata in `talos-harness-composer-size-v1`), i chip modello e
permesso sono pulsanti (`data-open-sheet`), «Reindirizza» (`#redirectRunButton`, appare con testo
scritto durante un giro), microfono (`i-mic` dallo sprite originale, dettatura), «+» =
`#capabilityBtn` (aggiungi contesto), ganci `data-run-what/-meta`, `.stop-run`, `[data-runtime-*]`,
`[data-statusbar]`; il composer è una colonna flex (il testo riempie la misura scelta, la barra
sta in fondo) e consuma le variabili che il monolite scrive (`--composer-canonical-h`,
`--composer-max-w`, `--composer-textarea-max-h`); scorciatoia nel chip nascosta quando il
composer è stretto (`@container`).

**Ricerca** (05/09/2026): resize handle fra fratelli flex con misura in localStorage e frecce da
tastiera (glama.ai backlog-mcp `viewer/components/resize-handle.ts`); `<textarea>` MDN (`resize`);
la maniglia unica a doppio verso è quella dell'originale (`setupComposerResize`, 3/9).

**Cancelli**: componenti **18/18** · statico **54/54**.

**Dal vivo** (4175, sessione conclusa da 9 giri, 1440 e 1024, zero errori): chip
«deepseek-v4-flash-latest · Accesso completo · Giri 9», costo nascosto, striscia e coda nascoste
(nessun giro in corso), barra «Tema Calm · deepseek · 92,1k token · 9 giri · cache 83%»;
trascinando la maniglia il composer passa da 727×110 a 732×239, la misura è in
`talos-harness-composer-size-v1`, sopravvive al ricarico, il doppio clic la azzera; il chip del
modello apre «Modello», quello del permesso «Permessi di esecuzione». Immagini in
`.claude/immagini/fase2-claude/ChatFooter/`.

**Non verificato dal vivo** (vuole il kernel): la striscia durante un giro (cosa · giro · secondi ·
Ferma), «Reindirizza», la coda con un messaggio vero, la dettatura.

**Taccuino**: l'ambiente (chip dell'originale) vive nella colonna dei dettagli (B2, Astra): il
foglio «Ambiente» resta raggiungibile da lì. I fogli aperti dai chip sono ancora i dialoghi legacy
senza CSS (B7 Astra, T-10).

---

## S-07 · Review (ReviewPane, ReviewFileList, DiffView) — ✅ verde · APPROVATA dall'owner il 05/09 («Approvate»)

**Blocchi**: `ReviewScreen` (testata con sommario e azioni), `ReviewPane`, `ReviewFileList`
(righe `talos-list-row`), `DiffView` (testa, righe, piede). **Fixture**: `lab/fixtures/review.js`
(le tre voci del mockup nella forma di `reviewFiles`: percorso, `code` [tipo, testo] col segno nel
testo, giro, ricevuta, conteggi). **Componente**: `src/components/review.js` — `creaRigaFileReview`,
`aggiornaDiffReview`, `contaDiff` (dalla voce se il server ha contato, altrimenti dalle righe),
`riassuntoReview` («3 file modificati · +112 −2»), `sottotitoloFile` («giro 5 · nuovo file»),
`nascondiAzioniFase3`.
**Monolite**: `renderRealReviewList` → righe del mockup in `.talos-review__files` (attiva = il
file scelto o l'ultimo scritto), sommario nella testata della Review, titolo = la sessione, stato
vuoto onesto; `renderReviewFile` → `aggiornaDiffReview` (righe col numero e il segno come nell'
originale, avviso «simboli spariti» come SystemNote nel linguaggio del mockup); la voce di
`reviewFiles` porta `giro` (il giro in cui è stata scritta). `aggiornaTestataSessione` aggiorna
titolo e badge delle schede su TUTTE le testate di sessione (Chat, Terminale, Review); la Review
tiene il suo sommario al posto del percorso.
**Mockup toccato**: «Copia i diff» (`#copyAllDiffs`, funzione dell'originale) nella testata della
Review; Accetta tutto · Scarta tutto · Accetta questo file · Apri nell'editor · Scarta e la nota
«Scartare ripristina…» portano `data-richiede="fase3"`: dal vivo restano NASCOSTI finché non hanno
una rotta (mai un pulsante che non fa niente); «−0» non si scrive (come nel mockup).

**Ricerca** (05/09/2026): review dell'agente = elenco file con +/−, diff per file, accetta/scarta
per file — Copilot «Edits Review», Cursor; Claude Code lo ha nel Code tab del desktop e non
nell'estensione VS Code (github.com/anthropics/claude-code/issues/33932); diffity, Agent Diff
Viewer. Il mockup è a quel livello; le azioni aspettano il kernel.

**Cancelli**: componenti **21/21** · statico **54/54**.

**Dal vivo** (4175, sessione «Rispondi con una sola parola: ciao.» con un file scritto, 1440 e
1024, zero errori): «1 file modificato · +11 −0» in testata, riga «screenshot-desktop.ps1 · giro
4 · nuovo file · +11», diff di 12 righe numerate, «Copia i diff» → toast «Diff di 1 file copiato»,
azioni della Fase 3 nascoste. Immagini in `.claude/immagini/fase2-claude/Review/`.

**Taccuino / per l'owner**
- T-11 **Accetta / Scarta / Apri nell'editor** (per file e per tutto) vogliono rotte nuove del
  kernel (ripristino dal checkpoint del giro, apertura nell'editor): contratto congelato → Fase 3,
  con una riga K nel ledger kernel. Fino ad allora i pulsanti non si vedono.
- T-12 le **ricevute firmate** per scrittura (badge «Ricevuta a1f4…9c02», blocco SignedReceipt):
  il server ha la chiave (`TALOS_HARNESS_RECEIPT_*`) ma il flusso non emette l'hash al client →
  Fase 3.

---

## S-07-bis · Review a SCHEDE (owner 05/09: «schede in alto e diff piena larghezza sotto, stile VS Code») — ✅ verde

Ricerca (05/09/2026): Hermes Desktop, Review pane (hermes-agent.nousresearch.com/docs/user-guide/
desktop): file modificati in elenco o albero, diff con ambito Uncommitted · Branch · Last turn,
stage/revert/commit dallo stesso pannello; VS Code: schede dei file in alto, editor di diff a
tutta larghezza. **Mockup ridisegnato**: `ReviewFileTabs` (una `talos-tabs__list` con una scheda
per file: percorso mono, +A, −R) sopra il `DiffView` a tutta larghezza (testa: percorso, ricevuta,
+/−, «giro N»); via l'elenco a colonna. **Componente**: `creaRigaFileReview` emette la scheda
(`role="tab"`, roving tabindex); **monolite**: frecce/Home/End sulle schede (attivazione
automatica: il diff è già nel DOM). Cancelli **24/24** e **54/54**; dal vivo 1440/1024 su una
sessione con un file scritto, zero errori. Immagini in `immagini/fase2-claude/Review/*schede*`.
Resta per la Fase 3 (T-11): ambito Non committato · Ramo · Ultimo giro (W1-06, servizio git),
Accetta/Scarta, vista affiancata.

## S-08 · EmptyState (lo stato vuoto di una sessione nuova) — ✅ verde

**Componente**: `src/components/stato-vuoto.js` — `creaStatoVuoto`, `suggerimentiDallaCartella`
(dai FATTI: `.claude` → ledger aperti, `src` → mappa, `tests` → test; package.json/README quando
il browser del workspace elencherà anche i file: oggi elenca solo cartelle). **Monolite**:
`montaStatoVuoto` al posto dell'hero in `avviaSessionePendente` — il blocco entra nella colonna
della Chat (UN composer, quello vero), «Riapri l'ultima sessione» apre davvero l'ultima, un
suggerimento riempie il composer senza inviare; `nuovaGenerazioneSessione` lo toglie. Cancelli
verdi; dal vivo (Nuova → «Continua nella chat — AVM-harness-desktop»): titolo con la cartella,
riga guida, «Riapri l'ultima sessione», zero errori; nessun suggerimento perché la cartella scelta
è un progetto con id (niente percorso per il browser) → T-13: leggere i fatti anche per i
progetti allowlistati (`/api/v1/projects` porta il percorso?) — da verificare.

## S-09 · Le due colonne si comprimono e si ricordano (owner 05/09: «le due sidebar devono essere collassabili») — ✅ verde

Pulsante «Comprimi o espandi la barra laterale» nel marchio della sidebar (mockup, `i-menu` dallo
sprite originale) → `#sessionsCollapseBtn` → `toggleSessionsPanel` del monolite; la barra compressa
è la modalità a icone del mockup (`data-sidebar="icone"`, CSS già pronto, 64 px). Il toggle
«Dettagli» della testata comprime la colonna destra. Entrambi si ricordano in
`talos-harness-panel-widths` (chiave del contratto) e si riapplicano all'avvio; il flag si scrive
solo sul gesto della persona (il sync dell'avvio lo cancellava). Dal vivo: 276→64 px, ricarico,
entrambe ricordate, riapertura, zero errori. Immagini in `immagini/fase2-claude/Collassi/`.
Per Astra B8 restano: densità, tema chiaro, lingua.

**T-13** (verificato 05/09 sera): `GET /api/v1/projects` risponde solo `{id, nome}` — nessun
percorso — quindi per un progetto con id lo stato vuoto non può leggere i fatti della cartella
(niente suggerimenti, onestamente). Serve il percorso nella risposta (o una rotta
`workspace-browser?projectId=`): riga K per il kernel/server, Fase 3.


---

## S-10 · La prova DAL VIVO col kernel (autorizzata dall'owner il 05/09) — ✅ fatta

Istanza 4181: `frontend/dist`, store nuovo, progetto usa-e-getta `prova-vivo` (package.json con
`npm test`, `src/matematica.mjs`, un test), kernel `talosHarness.mjs`, modello `z-ai/glm-4.7-flash`
(fascia flash, a chiave; qwen ha un solo fornitore → 429). Screenshot DURANTE, ogni 3 s.

**Giro 1** («Aggiungi ed esporta sottrai… poi fai passare la suite»): 27 s, 7 giri, 62,0k token,
primo token 2,9 s. Visto dal vivo, nel disegno del mockup: l'attesa animata, poi lo streaming del
testo, la striscia del giro con COSA sta facendo («Scrittura di src/matematica.mjs… · giro 4 · 12 s
· Ferma»), i bundle («2 file letti, 1 ricerca completata», «2 file modificati, 1 comando eseguito
+5 −2»), le righe attrezzo running → success, il badge Review 2, la spine 2·3·4, il chip
«glm-4.7-flash» e «Tema Calm · z-ai» nel piede. TALOS ha davvero scritto `sottrai` e il test e la
suite passa. Zero errori di pagina.

**Giro 2** (permesso «Su richiesta», «Crea NOTE.md…»): la ApprovalCard del mockup compare per
`date -u` (badge «Chiede di eseguire», comando in mono, «Vuole eseguire il comando…», tre
risposte, «Vale solo per questa richiesta»; la riga in sidebar dice «aspetta te»); «Consenti una
volta» risponde davvero; la seconda richiesta (scrittura di NOTE.md) resta in attesa finché
qualcuno risponde — e dopo un RICARICO della pagina la scheda pendente è ancora lì con i pulsanti
attivi (persistenza vera); «Per questa sessione» approva e ricorda; `npm test` chiede di nuovo
(attrezzo diverso: giusto); a fine giro la scheda dice «— Approvato.» senza pulsanti; NOTE.md esiste
con la data vera. Immagini in `.claude/immagini/fase2-claude/Vivo/`.

**Difetto trovato e curato nello stesso giro**: il chip del modello diceva «Scegli il modello» e
il piede «Tema Calm» senza fornitore quando la persona non ha scelto un modello (il server ne ha
uno suo): ora mostrano il modello del GIRO (`currentRunModel`).

**Non ancora visto dal vivo**: ArtifactCard con un artefatto vero (il compito non ne ha creati),
«Reindirizza» durante un giro, la dettatura. Costo: due giri flash, letto dal credito del fornitore
dall'owner (non dal CLI).

**Taccuino dopo la prova dal vivo**
- Curato nello stesso giro: la meta del messaggio della persona diceva «On request» (nome
  tecnico): ora «Su richiesta» (H22, stessa mappa del chip).
- T-14 dopo un ricarico, una scheda di approvazione risolta da QUESTA scheda dice «Approvato (da un
  altro client)»: il monolite perde `_rispostaDataQui` al ricarico. Onesto ma impreciso; si cura
  ricordando la richiesta risposta nello store della sessione (Fase 3, con le ricevute).
- Istanza 4181 (kernel, a pagamento) SPENTA a prova finita.
### R-06 (05/09 ~22:15) — R05 etichette (8e338c1f) + B6.4 CatalogoModelli (bb836a25): ACCETTATI, uniti

Owner: «procedi, r05». L'unione è stata un fast-forward sul merge di Astra `7de75f24`, che
conteneva già il suo commit successivo (Catalogo modelli): rivisto anche quello. Cancelli sulla
lane unita: template fedele (diff 0), unit 72/72, statico 195/195, componenti 78/78, build ok.
Codice: `components/catalogo-modelli.js` con normalizzazione stretta, «Non dichiarato» al posto
dei buchi, parole umane per modalità e parametri, prezzi per milione in it-IT, ripristino di
fuoco e scroll, «Usa nella sessione» marcato fase3, nota onesta sulle credenziali.
Taccuino sul suo screenshot `app-catalogo-1440.png` (regola: tutto lo schermo): sopra il
catalogo affiorano le righe GREZZE del Model Lab originale (statistiche e striscia
«PanoramicaProviderCatalogo API…» tutta attaccata) e «Gated» è un nome tecnico (H22). Stesso
difetto dei toast (T-16): superficie del monolite nuda dentro il mockup. Chiesto ad Astra di
vestirla nella prossima consegna: `.claude/PROMPT-ASTRA-2026-09-05-R06-MODEL-LAB.md`.

### R-07 (05/09 ~23:20) — cornice Model Lab (3ddd37b8): ACCETTATO, unito in `2ab60bbb`

Risposta alla R-06: `components/cornice-model-lab.js` veste la testata originale del Model Lab
(quattro righe → `talos-kv` con badge, striscia → `talos-tabs` con frecce/Home/End) senza toccare
id, controlli o rotte; «Gated» sparito, lo stato del runtime è una parola onesta («Nessun runtime
raggiunto» · «N runtime disponibili» · «Verifica in corso…»). Screenshot `testata-1440.png`
guardato tutto; al contrario `ricerca-vuota` e `fornitore-vuoto` consegnati. Cancelli sulla lane
unita: template diff 0, unit 76/76, statico 195/195, componenti 78/78, build ok. Prompt:
`.claude/PROMPT-ASTRA-2026-09-05-R07-CORNICE-MODEL-LAB.md` (gli passo Toast e connessione).

### R-08 (05/09 ~23:55) — MemoryMeter (98552518): ACCETTATO, unito (fast-forward)

`components/memoria-misura.js`: misure del server (schema `talos.model-lab.capacity/1`) senza
stime per processo, «Non misurata» dove manca il dato, `meter` con soglie 75/90 e etichetta
parlante, tre errori distinti (misura · runtime · scarico) con `role=alert`, azioni disabilitate
finché non hanno senso. Screenshot al contrario consegnati (errore misura/runtime/scarica alle
tre larghezze). Cancelli sulla lane unita: template diff 0, unit 79/79, statico 195/195,
componenti 81/81, build ok.

### Confronto con Hermes — strumento e primo giro (05/09 notte, owner «VIA»)

`scripts/confronto/{avvia-hermes,guida,confronto}.mjs` + `passi/chat.mjs`: 7 passi, 6 PASS,
1 FAIL (Tab al composer: misura instabile, riga di lavoro per una scorciatoia). Hermes Desktop
0.17.0 (copia compilata del 04/09) si avvia con lo switch di Chromium; il suo
`HERMES_DESKTOP_CDP_PORT` vale solo in modalità sviluppo. Mezz'ora persa su un'istanza fantasma
(blocco di istanza unica + `tasklist /FI` rotto da Git Bash): lezione in memoria
`tasklist-fi-da-git-bash-dice-zero`. Due difetti nostri trovati e curati dal confronto
(nomi accessibili di «+» e delle azioni del messaggio). Tabella e osservazioni nel taccuino.
Cancelli: unit 79/79, statico 195/195, componenti Conversazione+ChatFooter 6/6.

### R-09 (06/09 ~00:30) — RuntimeCard del Model Lab (cb095d3f): ACCETTATO, unito in `624ef8f3`

`components/runtime-modelli.js`: una scheda per motore (Ollama · LM Studio · llama.cpp) con
stato onesto («Raggiunto» / «Non raggiunto» / fasi di llama.cpp in parole), elenco modelli,
indirizzo, data di verifica, dettaglio d'errore. Nota di review: quattro `!important` in
`.talos-runtime-panel` per vincere il CSS legacy del pannello — accettato ora, da togliere al
cutover quando il CSS legacy sparisce (riga di pulizia, non bloccante). Cancelli sulla lane
unita: template diff 0, unit 84/84, statico 195/195, componenti 84/84, build ok.

### Confronto con Hermes — gruppo 2 (navigazione), 06/09 ~01:30: 7/7 PASS dopo tre correzioni nostre

- **T-17** (trovato dal confronto, CHIUSO): il campanello apriva il menu legacy
  `.notifications-menu` che nessun CSS disegnava più — esisteva nel DOM e non si vedeva. Ora apre
  il pannello «Aspetta te» del mockup (`components/notifiche.js`, `#pannelloNotifiche`): titolo e
  sommario onesti, una `ListRow` per notifica, «Segna tutte come viste» (aggiunto anche al mockup),
  fuoco alla prima riga o alla chiusura, Esc e clic fuori chiudono e il fuoco torna al campanello,
  il cui nome dice QUANTE cose aspettano. Il primo innesto si chiudeva nello stesso clic: la regia
  dei disclosure (`aria-controls`) e il mio gestore commutavano entrambi — `stopPropagation` sul
  campanello. Ricerca 06/09: W3C APG dialog-modal (NON modale qui), Carbon «Notification»
  accessibility (area persistente raggiungibile, fuoco dentro all'apertura), accessibility.build
  focus management. Prove: laboratorio `NotificationPanel` nel cancello componenti (87/87), dal vivo
  `notifiche-vivo.mjs` (aperto → fuoco su Chiudi → Esc → nascosto, fuoco sul campanello),
  screenshot `foto/notifiche-intera.png`.
- **Ricerca sessioni**: la casella filtrava SOLO le righe demo `.session-item`; le sessioni vere
  restavano tutte a schermo (74 su 74, era così anche nell'originale). Ora filtra anche
  `.real-session-item`: «sottrai» 74→37, «ciao» 74→28.
- **Nomi accessibili**: sette IconButton (barra laterale, albero, comandi, contesto, dettagli,
  riprendi, impostazioni) avevano solo `title`; ora `aria-label` dal mockup (APG names-and-descriptions).
Cancelli: unit 84/84, statico 195/195, componenti 87/87. Esiti in `artifacts/confronto/navigazione/esiti.json`.

### Confronto con Hermes — gruppo 3 (sessione), 06/09 ~02:30: 3 PASS, 1 non misurabile

Istanza 4182 = app nuova sullo store del kernel vero (`scratchpad/store-vivo`, 3 sessioni con
file scritti, senza kernel: solo lettura). Due difetti nostri trovati e curati:
- **Review vuota**: finta scheda «−» e «Nessun file scritto finora» ripetuto nel diff. Ora uno
  `EmptyState` del mockup (`#vuotoReview`, aggiunto anche al mockup) e schede+diff nascosti
  finché non c'è un file.
- **Diff di un file creato «+1 −1»** con una riga «−» vuota: `''.split('
')` dava una riga
  fantasma; `righeDelTesto` toglie il caso vuoto e l'a-capo finale (git-scm.com/docs/git-diff,
  diffchecker.pro Unified Diff 2026, letti il 06/09). Ora «+1», 1 riga.
Non misurabile: frecce fra le schede dei file (serve una sessione con due file: la prossima prova
a pagamento). Terminale e Browser restano fuori (B1/K-I di Astra).
Cancelli: unit 84/84, statico 195/195, componenti Review+Conversazione 6/6.

### R-10 (06/09 ~02:45) — ProviderCard (c66e2109) e raccordo Runtime (768ae6fd): ACCETTATI, uniti in `6f56e4e6`

Sette fornitori come schede a disclosure (APG disclosure citato), tre fatti distinti (chiave ·
configurazione · prova), bozze preservate, recupero errori; il pannello Runtime ora con
`talos-field`/`talos-label`/`talos-textarea`, azioni primaria/secondaria e badge di stato — la
richiesta R-08/R-09 è soddisfatta. Cancelli sulla lane unita: template diff 0, unit 87/87,
statico 195/195, componenti 90/90, build ok.

### Confronto con Hermes — gruppo 4 (pagine), 06/09 ~03:15: 6/6 PASS

Pagine di Astra misurate con lo stesso strumento: nessun controllo senza nome, nessun errore di
pagina. Osservazioni per il ledger (non correzioni): Libreria e Capability vanno rimisurate sullo
store del kernel vero; «Auxiliary models» di Hermes (modello per compito) = PROPOSTA nuova.

### 06/09 ~03:45 — Astra ha finito i crediti: la sua coda è mia, inline (owner: «farai tutto tu, inline»)

Prima riga chiusa: la richiesta server INST-DELETE-FILE che Astra aveva lasciato — «Elimina» di un
modello locale toglieva solo i manifest e lasciava i pesi sul disco. `local-model-store.mjs
remove()` ora cancella file e cartella del modello, solo dentro `rootDir` (riverifica di
contenimento con `path.relative` prima di un rm ricorsivo; il `path` del manifest può essere la
cartella del download HF o il file dell'import locale: si guarda con `stat`), mai la radice; se i
pesi non si lasciano cancellare i manifest vanno via lo stesso. Ricerca 06/09: openreplay
«Preventing Path Traversal in Node.js», googleapis/nodejs-storage #2654. Prove: due test nuovi
(REMOVE-01 pesi+cartella via, file estraneo intatto; REMOVE-02 senza manifest), il primo giro
rompeva HF-DIRECT-CONTROLS-01 (cancel su una CARTELLA: rm senza recursive) — trovato dalla suite,
curato; suite server 1678/1678.

### B6.8 — scheda «Installati» del Model Lab (06/09 ~05:00): FATTA, dal piano di Astra

`components/modelli-installati.js` (dati → riga `ListRow` con stato e verdetto «Entra» · dettaglio
`DetailPanel` con formato/disco/origine/licenza, stima, azione principale «Verifica compatibilità»
o «Libera memoria», Rinomina · Copia percorso · Elimina dal disco · ricerca e filtro di stato · riga
della memoria · stato vuoto con «Azzera ricerca»), fixture con le tre righe del mockup, voce nel
laboratorio e nel cancello componenti (`ModelliInstallati` su `#schermoModelLab`), unit
`tests/unit/modelli-installati.test.mjs` (numeri con la virgola, quattro verdetti, filtro anche al
contrario). Innesto in `app.js`: `montaInstallati` sposta il pannello del mockup in
`#modelLabInstalledPanel` rinominando i controlli con gli id che il monolite ascolta (ricerca,
importazione, progresso, annulla); rinomina ed elimina passano dai dialoghi del mockup
(`veloRinominaModello`/`veloEliminaModello`, `data-lab-dialog-action`) invece di prompt/confirm;
«Copia percorso» aggiunto al mockup (era del monolite). Ricerca 06/09: LM Studio «My Models»
(lmstudio.ai/docs/cli, datacamp) distingue sul disco/caricato. Prove: componenti 93/93 (Installati
3/3 struttura+parole+pixel), unit 91/91, statico 195/195; dal vivo su 4175 con i TRE modelli veri
dell'owner (4,6 · 10,8 · 15,2 GB; 32 GB di RAM, 12,9 liberi): lista, dettaglio «GGUF · Q4_K_M»,
dialogo Elimina aperto e chiuso con Esc, ricerca senza esito → stato vuoto → Azzera → 3 righe;
0 errori di pagina; screenshot `foto/installati-4175.png`.

### B6.9 — scheda «Hugging Face» del Model Lab (06/09 ~06:15): FATTA

`components/hf-catalogo.js`: righe dei repository (`ListRow` con tipo/licenza, badge «Autore del
modello» o «Accesso richiesto»), dettaglio `DetailPanel` (nome, autore, licenza, revisione, «Tutti i
file» → `veloFileModello` riempito con i file veri e sha256 presente/assente, «Scegli il file» come
radiogroup con una scelta per variante GGUF — i set `-0000N-of-0000M` stanno insieme e un set
incompleto lo dice — con dimensione e stima in parole, callout per i repository con accesso
richiesto, riga della stima «X necessari · Y allocabili», «Rimisura su questo PC», «Scarica sul
computer · X GB» disabilitato se set incompleto/sha assente/accesso richiesto, «Leggi la scheda
del modello» che apre la scheda in linea), stato vuoto con «Azzera ricerca», «Carica altri
risultati». Fixture con i due repository e le tre varianti del mockup; laboratorio + cancello
(`CatalogoHf` su `#schermoModelLab`, 3/3 al primo giro); unit `tests/unit/hf-catalogo.test.mjs`.
Innesto in `app.js`: `montaHf` rimappa ricerca/autore/ordine/tag/lista/altri sugli id del
monolite; `renderizzaHfConMockup` disegna lista e dettaglio dal componente e lascia il legacy
solo se il pannello non è montato; ordina/autore/tag rilanciano la ricerca; download e misura
usano le API di prima. ⛔ Trovato dal vivo: il dettaglio non elencava i file perché non passavo
`revision` all'endpoint (elenca solo con la revisione: «fase 2» del server) — curato; e il pulsante
della scheda si richiudeva nello stesso clic (regia dei disclosure): `stopPropagation`.
Ricerca 06/09: Hub API (search/author/sort, gated). Prove: componenti 96/96, unit 94/94, statico
195/195; dal vivo su 4175 con una ricerca VERA («qwen3 8b gguf» → 20 repository), dettaglio con
12 varianti, misura su questo PC («~4,3 GB di memoria · entra» … «F16 · 15,3 GB · oltre la memoria
allocabile», 12,8 GB allocabili), «Tutti i file» 14 righe, scheda aperta, ricerca senza esito → stato
vuoto e dettaglio nascosto; 0 errori di pagina. Screenshot `foto/hf-4175-dettaglio.png`.
Nota: la scheda mostra il front matter YAML grezzo del README (renderer legacy) — riga di pulizia.

### B6.10 — scheda «Download» del Model Lab (06/09 ~07:30): FATTA

`components/download-coda.js`: conteggi per stato (in corso · in pausa · falliti · completati),
«Mostra solo attivi», una `DownloadRow` per trasferimento nelle tre forme del mockup — in corso
(barra, percento · ricevuti di totali · velocità · rimanente, Pausa, Annulla → `veloAnnullaDownload`),
fallito (scheda d'errore col motivo umano, «Ricevuti X. Puoi riprovare dal punto salvato», Riprova,
Dettagli che apre i fatti grezzi), completato («verifica del file riuscita», «Vedi modello» →
Installati). Velocità e tempo rimanente si stimano fra due letture successive (`stimaFraLetture`):
il server non li dà e un numero inventato non si scrive. Fixture con le tre righe del mockup,
laboratorio + cancello (`CodaDownload`, 3/3 al primo giro), unit `download-coda.test.mjs`.
Server: `status()` di `hf-direct-transfer.mjs` ora porta `repo`, `file`, `name`, `finishedAt`
(la coda a schermo diceva l'id interno); test aggiornato, suite 1678/1678.
⛔ Trovato e curato: il velo «Annulla download» ha `data-lab-dialog-action="annulla"` e il mio
gestore B6.8 (`[data-lab-dialog-action]` generico) lo avrebbe preso per «elimina modello» — ora
ascolta solo rinomina/elimina. Ricerca 06/09: AB Download Manager 2026, Vortex download
management, Continuata docs (stati, riprova per voce, verifica sha256 prima di «pronto»).
Prove: componenti 99/99, unit 98/98, statico 195/195; dal vivo su 4175 con un download VERO e
piccolo (Qwen3-0.6B Q8_0, 0,6 GB): riga «in corso» con barra, Pausa → «1 in pausa», Riprendi →
«1 in corso», Annulla dal velo → «Annullato»; i tre modelli reali dell'owner compaiono come
«Completato · verifica del file riuscita»; 0 errori di pagina. Screenshot
`foto/download-4175-incorso.png`. ⛔ NON VERIFICATO dal vivo: la forma «fallito» (serve una
caduta di rete durante un download: provata solo nel laboratorio e a unità).

### B2 — la colonna dei dettagli (06/09 ~09:30): FATTA, e dice il vero

⛔ Trovato prima di iniziare: in produzione la colonna mostrava ancora i valori DIMOSTRATIVI del
mockup («W1-02 registro processi», un ramo, tre file toccati, quattro processi mai esistiti).
`components/inspector.js` + innesto in `app.js` (`aggiornaInspectorDaStato`, stessa cadenza del
piede della chat): titolo = nome della sessione · Ambiente da `RunStarted.contesto` (ramo,
worktree, non salvate, repo annidati; «—» dove il dato non c'è, anche nel replay) · Finestra del
contesto da `usage` (Conversazione, Libera; la finestra del modello quando il catalogo la
dichiara, la ripartizione per categoria SOLO se il kernel la dichiara — percentuali troncate al
decimo e «Libera» che chiude a 100 come nel mockup) · Indice dei giri dalla spine della
conversazione (numero, riassunto del gruppo di attività, attrezzi, «in corso») · File toccati da
`reviewFiles` (+N −M) · Agenti (stato vuoto onesto del mockup) · Processi dai comandi eseguiti
(`ToolCallStart`/`Args`/`Result` di `shell` con ora di ricezione e giro: comando, stato, durata,
uscita, «Nessuna uscita da N secondi»). L'albero della cartella è quello del monolite disegnato
DENTRO `#alberoFile` del mockup (bridge: `#inspector-files` → `#alberoCartella`, id legacy
duplicati demoti; righe con le classi del mockup, freccia solo sulle cartelle, «mod.»/«nuovo» come
parola, icone del monolite tradotte nei simboli del mockup e con la classe `i`). Fixture con i
valori del mockup, laboratorio + cancello (`Inspector` e `Inspector_processi` su `#inspectorSessione`;
sotto i 1040 px la colonna è un pannello chiuso: si confrontano struttura e parole, non i pixel),
unit `tests/unit/inspector.test.mjs`. Ricerca 06/09: Codex /status (token contro finestra),
Context Lens (ripartizione per categoria). Prove: componenti 105/105, unit 102/102, statico
195/195; dal vivo su 4175 (titolo vero, Conversazione 92,1k, indice dei giri con i riassunti veri,
albero di C:\ con 46 righe, processi = il comando bash vero della sessione) e su 4182
(«Repo annidati nessuno» dal contesto replayed, albero di prova-vivo). ⛔ NON VERIFICATO: la
finestra del modello (il catalogo dei modelli non è in memoria prima di aprire il foglio: resta
«finestra non dichiarata» — riga di lavoro: leggere `contextLength` dal catalogo all'avvio).

- T-15 (prova AL CONTRARIO, 05/09 21:05, `caduta-vivo.mjs` su 4175): server irraggiungibile per
  15 s con la sessione aperta → lo schermo NON cambia: nessun banner, nessuna riga di stato, la
  statusbar continua a dire «Tema Calm · deepseek 92,1k token»; il composer resta attivo. Solo
  all'invio compare il toast «Invio non riuscito: Failed to fetch» — testo grezzo del browser in
  inglese (H22), da `app.js:10554-10555`. Al ritorno del server nessun «ricollegato». Hermes ha
  `gateway-connecting-overlay.tsx` per questo stato. ⇒ riga di lavoro dopo il cutover: stato
  onesto della connessione nella statusbar (`runtime-status` è mio) con testo umano, e prova al
  contrario nello script di confronto. Stesso cervello sull'originale: comportamento identico per
  costruzione (4180 spento al momento della prova, non rilanciato).
  ✅ CHIUSA 05/09 ~23:00, owner «t 15 approvato adesso». Componente
  `src/components/connessione.js`: macchina a quattro stati (collegato · riconnessione · caduto ·
  ricollegato) che ascolta le due fetch centrali del monolite (`apiGet`/`apiPost` via
  `fetchSorvegliata`), l'EventSource (`onerror` con readyState 0 = riprova da solo, 2 = ha
  rinunciato; `onmessage` = canale vivo) e gli eventi offline/online del browser (presi come
  sospetto, mai come verità), e conferma con un battito su `/api/v1/health` SOLO quando qualcosa
  non va (2 s → 4 → 8 → 15 s tetto; dopo 4 tentativi «Il server non risponde» + pulsante
  Riprova; da sano non batte mai). Al ritorno: «Collegato di nuovo» per 4 s, toast riuscito, e
  gancio che riapre lo stream della sessione se era CLOSED senza evento terminale. Nel mockup:
  `<span data-runtime-connessione>` con pallino (warning/danger/success) + `Riprova` nella
  barra di stato, testo umano (H22). Ricerca 05/09: MDN EventSource + html.spec.whatwg.org §9.2
  (CONNECTING vs CLOSED), websocket.org/guides/reconnection e coder/mux #1194 2025 (indicatore
  dopo il primo tentativo fallito, riprova manuale dopo la resa), xjavascript.com e
  websocket.org/guides/heartbeat (navigator.onLine inaffidabile: battito vero). Prove: unit
  `tests/unit/connessione.test.mjs` (3, col tempo finto, anche al verso contrario), unit totale
  75/75, statico 195/195, componenti 78/78, dal vivo `caduta-vivo.mjs` su 4175: 3 s «Connessione
  persa · riprovo (2)», 8 s «(3)», 15 s «Il server non risponde» + Riprova, al ritorno 2,5 s
  «Collegato di nuovo», 8,5 s barra pulita; screenshot `foto/caduta-4175-15s.png` e
  `-ritorno.png`. ⛔ NON VERIFICATO dal vivo: la riapertura dello stream al ritorno (la sessione
  della prova era conclusa: nessuno stream da riaprire) — provata a unità (gancio chiamato).
- T-16 (stesso screenshot `foto/caduta-4175-invio.png`): i toast del monolite (`toast()`) escono
  in basso a SINISTRA come testo grezzo in grassetto, fuori dalla shell, senza il linguaggio del
  mockup (nessun `talos-toast`); e il toast «Ripresa della sessione avviata 1 g fa · riprendere
  costa circa 92.1k token (stima)» resta in coda e riappare al primo invio. Il contenitore dei
  toast è DOM legacy: va battezzato col `Toast` del mockup (chi: B7 Astra se i dialoghi/notifiche
  sono suoi, altrimenti io nel bridge) — da decidere nella prossima review, non lasciare cadere.
  ✅ CHIUSA 05/09 21:40, ordine dell'owner («bruttissima quella notifica in basso a sinistra,
  sistemala bene»): componente `src/components/toast.js` col markup del mockup (badge col tono,
  testo, azione facoltativa, chiusura `#i-x`), pila in `#regioneToast` (basso a destra, al più
  tre, timer fermo sotto il mouse e col fuoco, guasti che restano finché non li chiudi,
  `role=alert` per i guasti), variante `talos-toast--breve` nel mockup per i toast senza azione
  (chiusura in alto a destra, scheda bassa); `toast()` del monolite rimappata senza toccare i 25
  punti di chiamata; H22: «Failed to fetch» → «Il server non risponde. Controlla che TALOS sia
  avviato e riprova.» (`messaggioUmano`). Ricerca 05/09: phoca.cz a11y-component-lab/toast,
  ariaui.dev toast, designsystemproblems.com toast accessibility (status/alert, ≥5 s, errori
  persistenti, max 3, pausa su hover/fuoco). Prove: laboratorio `Toast` nel cancello componenti
  (75/75, tre larghezze, struttura+parole+pixel contro i tre toast del mockup), unit
  `tests/unit/toast.test.mjs`, statico 195/195, dal vivo su 4175 con `caduta-vivo.mjs`
  (screenshot `foto/caduta-4175-invio.png`: due toast nel linguaggio del mockup). T-15 (nessun
  segnale a server caduto) resta APERTA.


**Giro 3** (artefatto + reindirizzo): con un testo scritto durante il giro «Reindirizza» compare
(prima nascosto) e, premuto, il modello risponde alla correzione («di' solo quante funzioni»: «2
funzioni»); `artifact_create` produce una ArtifactCard vera («Funzioni matematica.mjs», iframe
isolato su `/api/v1/artifacts/<id>`, «Apri»). 22 s, zero errori. Immagini: `artefatto-vero.png`,
`reindirizza-durante-il-giro.png`, `artefatto-giro-concluso.png`. Resta non visto dal vivo solo la
dettatura (serve un microfono). Istanza 4181 spenta di nuovo.

---

## R-01 · Review del commit di Astra `c2985683` («selettore modello e dialoghi ridimensionabili») — ✅ accettato e unito (`fb0e5fda`)

Guardato `dialogo-modello-1440.png` e il diff del mockup: il dialogo «Modello e ragionamento»
parla la lingua del mockup (due fonti OpenRouter/Locali, ricerca, gruppi richiudibili, «Attuale»,
cursore del ragionamento con «Automatico», «Mostra ragionamento», «La scelta vale dal prossimo
invio», Fatto); tre maniglie per dialogo (`.talos-resizer--dialog-*`) con misura ricordata; via
l'anteprima separata: tutto DENTRO il mockup, come chiesto. Ricerca citata (APG dialog-modal,
MDN setPointerCapture). Test nuovi nel cancello statico (ASTRA Dialogo Modello, misura
persistita) verdi anche sul mio albero dopo l'unione: statico **135/135**, componenti **24/24**.
Nota per Astra (già nel suo ledger): «Comandi» nascosto sotto 640 px di testata è voluto (Ctrl K
resta). Da B7: le maniglie vanno innestate su `setupModalResize` del monolite
(`talos-harness-modal-sizes-v1`), non duplicate.

---

## S-11 · Tastiera e tema chiaro sulle mie superfici (H27-H30) — ✅

Camminata con Tab dal campo «Cerca chat…» (4175): Nuova → i Luoghi → Altro → UNA fermata sulla
lista delle sessioni (roving tabindex: frecce su/giù, Home/End; prima erano 74 fermate, una per
riga) → Impostazioni → maniglia → titolo → UNA fermata sulle schede → Albero · Comandi · Comprimi ·
Dettagli · Riprendi → i bundle della chat → copia · ascolta · chiedi di nuovo → maniglia del
composer (ora con anello di fuoco) → messaggio. Nessuna fermata invisibile. Tema chiaro: stessa
pagina, palette chiara del mockup, leggibile (immagine `chat-chiaro-nuova-1440-cima`).
Dopo l'unione di Astra la testata andava A CAPO su due righe (suo CSS `flex-wrap:wrap` con la
quarta scheda «Browser»): ripristinata su una riga, adattiva per larghezza (percorso ≤900,
Comprimi ≤820, Comandi ≤720); la scheda «Browser» porta `data-vaia="browser"` e apre la vista
browser del monolite finché Astra non innesta `#schermoBrowser`.

---

## R-02 · Review dei sei innesti di Astra (Board, Memoria, Attività, Libreria, Ricerca, Officina) e degli undici commit di mockup — ✅ accettati e uniti

Letti commit per commit (`6ea01e80`, `86f108e1`, `9bc1fadb`, `d6b2b99d`, `316484d0`, `0ec35981`;
mockup `893f9d18`…`e7087b2c`): stesso metodo (componente + fixture + laboratorio + riga nel
cancello + unit + prova dal vivo 4177/4179 + screenshot a tre larghezze + ricerca citata), solo le
sue funzioni del monolite toccate. Guardate `Board/app-reale-1440` (73 sessioni vere, filtri,
colonne oneste con «—») e `ForgeList/app-vuota-1440` (stato vuoto onesto). Uniti in
`lane/harness-desktop`; dopo l'unione: unit **49/49**, componenti **45/45**, statico **194/195** —
l'unico rosso è un errore di I/O (`UNKNOWN … open dialogo-elimina-cartella-1280.png`) dei SUOI
test che scrivono screenshot dentro `.claude/immagini/astra-mockup/` (file committati): da
spostare in `artifacts/` (prompt R-02, punto 1). Corretto da me l'import di `nomi-attrezzi`
(spostato in `src/components/`). Prompt per Astra: `.claude/PROMPT-ASTRA-2026-09-05-R02-SEI-PAGINE.md`
(screenshot in artifacts, merge prima di ogni innesto, OAuth/computer-use = PROPOSTE non
autorizzate, coda del brief, decisione dell'owner sul cutover).

---

## R-03 · Le due correzioni di Astra (`9f12edd6`, `d1b87890`) — ✅ accettate e unite

`9f12edd6` riallinea Officina e Automazioni al dizionario canonico dei nomi (`nomi-attrezzi` in
`src/components/`); `d1b87890` sposta gli screenshot dei test in `artifacts/astra-mockup` (53) e
`artifacts/parita` (4), con un unit test che lo garantisce (`test-artifacts.test.mjs`). Dopo
l'unione (fast-forward): unit **50/50**, statico **195/195**, componenti **45/45**, e il cancello
non tocca più nessun file committato (0 PNG modificati). I due stash dei PNG rigenerati
(`png-astra-mockup-rigenerati-dai-test-2026-09-05` e `-bis`) non servono più: si possono
buttare quando l'owner vuole (io non butto niente).

---

## R-04 · Capability (attrezzi e permessi, skill/connettori/plugin/hook) e Doctor di Astra (`8f1674ad`, `cad3d10b`, `20004be0`) — ✅ accettati e uniti

Stesso metodo; funzioni toccate solo sue (`caricaPannelloAttrezzi`, `caricaCapability`,
`caricaEstensioni*`, `eseguiDoctor`, `esportaDoctor`); il template rigenerato dal mockup non cambia
di una riga (nessuna modifica a mano). Doctor dal vivo: 11 controlli veri raggruppati per
gravità con il conteggio in testa (H1-H5), «Esporta in JSON» (H7), «Ricontrolla»; ogni avviso dice
cosa fare. Dopo l'unione (fast-forward): unit **61/61**, statico **195/195**, componenti **63/63**.

---

## S-12 · Le impostazioni d'aspetto agiscono sulla chat (raccordo con B6 di Astra) — ✅

Il monolite (`applicaAspettoDesktop`) scrive sulla radice `--talos-ui-font-scale`,
`--talos-chat-font-size`, `data-talos-message-style`, `data-talos-composer-shape`, le classi
`chat-full-width`/`immersive-header` e `body.reduce-motion`: il CSS del mockup ora li onora
(scala dell'intera app con `zoom`, testo dei messaggi, bolle per TALOS, composer classico/compatto,
chat a tutta larghezza, testata immersiva, niente animazioni). Verificato dal vivo scrivendo le
preferenze nella chiave `talos.harness.desktop.settings.v1` e ricaricando: zoom 1,15, bolle,
composer compatto (raggio 11px), colonna senza limite. Cancelli: statico 195/195, componenti 63/63.
Ricerca 05/09/2026: rem/`clamp()` e scala per proprietà personalizzate (MDN font-size, CSS-Tricks
«Accessible font sizing», csswg #6709). Preset di tema, scena e movimento restano B8 (Astra) e li
onorerò allo stesso modo. Prompt per Astra: `.claude/PROMPT-ASTRA-2026-09-05-B6-RACCORDO-ASPETTO.md`.

---

## R-05 · B6 Impostazioni di Astra (`dc7ec327` navigazione e controlli, `c6c583bf` fonte e prova della ricerca web) — ✅ accettati e uniti

Funzioni toccate solo sue (`disegnaPannelloRicercaWeb`, `azioneRicercaWeb`, montaggio delle
Impostazioni); template rigenerato dal mockup senza differenze; i 38 controlli originali
conservati con gli stessi nodi (i miei ganci d'aspetto S-12 li leggono). Dopo l'unione
(fast-forward): unit **66/66**, statico **195/195**, componenti **72/72**.
