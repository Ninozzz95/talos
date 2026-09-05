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

## S-01 · SessionItem (la riga di sessione della sidebar) — ✅ verde, aspetta l'owner

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

## S-02 · NavItem (i Luoghi con i badge di conteggio) — ✅ verde, aspetta l'owner

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

## S-03 · WorkspaceFooter (il piede della sidebar) — ✅ verde, aspetta l'owner

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

## S-04 · Topbar (la testata della sessione) — ✅ verde, aspetta l'owner

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

## S-05 · Conversazione (Turn, Message, ActivityBundle, ToolRow, ToolFailure, SystemNote, ApprovalCard, DiffView, SignedReceipt, TouchedFiles, ArtifactCard, attesa) — ✅ verde, aspetta l'owner

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
