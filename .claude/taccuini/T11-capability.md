# T11-capability — Capability: attrezzi, skill, connettori, plugin — cosa il modello può usare

> Prova d'uso sull'istanza 4188 (worktree AVM-harness-prove, base c1984d79), guidata come farebbe una persona. 2026-09-06 14:19

## Passi

- **apro Capability dalla barra laterale** ✅
  - atteso: una PAGINA intera, non un foglio (C1)
  - visto: voce="Capability43" · schermo=schermoCapability
- **le schede della pagina** ✅
  - atteso: Attrezzi · Skill · Connettori · Plugin, col numero (C2-C3)
  - visto: ["Attrezzi 43","Skill","Connettori","Plugin","Hook","Tutti"]
- **il numero sulle schede** ❌
  - atteso: C3: «Attrezzi 43 · Skill 12», come Hermes
  - visto: ["Attrezzi 43"]

> ⛔ **T11-capability-D1** (medio): solo 1 scheda su 4 porta il numero (C3 le vuole tutte): ["Attrezzi 43","Skill","Connettori","Plugin","Hook"]
- **il totale in token in cima** ✅
  - atteso: C5: ogni attrezzo dichiara il suo costo, e in cima c è il totale
  - visto: 7454 token di schema per giro
- **il totale come percentuale della finestra** ❌
  - atteso: C6
  - visto: false

> ⛔ **T11-capability-D2** (medio): il totale degli attrezzi non è espresso come PERCENTUALE della finestra del modello scelto (C6) — prova: 7454 token di schema per giro
- **la ricerca fra gli attrezzi** ✅
  - atteso: C7: con un esempio VERO nel segnaposto
  - visto: Cerca un attrezzo…
- **l'ordine per più usati** ❌
  - atteso: C8: il conteggio d uso c è già
  - visto: dichiara «Uso nella sessione non registrato»

> ⛔ **T11-capability-D3** (medio): Capability dichiara «Uso nella sessione non registrato»: l ordine per «più usati in questa sessione» (C8) non è possibile
- **la descrizione degli attrezzi** ❌
  - atteso: C10: la nostra in ITALIANO, quella del kernel marcata «testo inviato al modello»
  - visto: inglese=true · marcaKernel=false

> ⛔ **T11-capability-D4** (grave): gli attrezzi mostrano SOLO la descrizione inglese del kernel («Lists the files of the workspace…»), senza la descrizione nostra in italiano e senza la marca «testo inviato al modello» (C10) — prova: permessoDa configurareAggiorna 43 di 43 attrezzi offerti~7454 token di schema per giro (stima)Uso nella sessione non registrato. elenco della cartellaLists the files of the workspace, with their sizes. Only the top levels: use "cerca" to fi
- **i nomi tecnici a schermo** ❌
  - atteso: H22: mai `web_search`, `tool_create`… a schermo
  - visto: ["web_search","library_list","tasks_list","notes_list"]

> ⛔ **T11-capability-D5** (medio): nomi tecnici del kernel a schermo (H22): web_search, library_list, tasks_list, notes_list — prova: web_search, library_list, tasks_list, notes_list
- **il permesso sulla riga dell attrezzo** ✅
  - atteso: C4: si spengono uno per uno, col permesso sulla stessa riga
  - visto: ogni riga porta «Politica della sessione»
- **il pannello di dettaglio** ❌
  - atteso: C9: descrizione, costo, permesso e ULTIME CHIAMATE
  - visto: ultimeChiamate=false

> ⛔ **T11-capability-D6** (medio): il dettaglio di un attrezzo non mostra le ULTIME CHIAMATE (C9, e E8 ne vuole tre)
- **gli attrezzi non supportati dal modello** ✅
  - atteso: C11: dichiarati e spenti (lezione Gemma 3)
  - visto: false

> ⛔ **T11-capability-D7** (minore): nessuna riga dichiara gli attrezzi che il modello scelto NON supporta (C11)
- **dove vivono i file** ✅
  - atteso: C29: scritto in piccolo sotto ogni elenco
  - visto: true
- **scheda «Skill»** ✅
  - atteso: o dati veri, o uno stato vuoto onesto che dice cosa manca
  - visto: CapabilityAttrezzi 43SkillConnettoriPluginHook AttrezziQuello che il modello può usarePermessi della sessione aperta. La scelta per attrezzo precede la politica generale. TuttiCon permessoDa configurareAggiorna 43 di 43 attrezzi offerti~7454 token di schema pe
- **scheda «Connettori»** ✅
  - atteso: o dati veri, o uno stato vuoto onesto che dice cosa manca
  - visto: CapabilityAttrezzi 43SkillConnettoriPluginHook AttrezziQuello che il modello può usarePermessi della sessione aperta. La scelta per attrezzo precede la politica generale. TuttiCon permessoDa configurareAggiorna 43 di 43 attrezzi offerti~7454 token di schema pe
- **scheda «Plugin»** ✅
  - atteso: o dati veri, o uno stato vuoto onesto che dice cosa manca
  - visto: CapabilityAttrezzi 43SkillConnettoriPluginHook AttrezziQuello che il modello può usarePermessi della sessione aperta. La scelta per attrezzo precede la politica generale. TuttiCon permessoDa configurareAggiorna 43 di 43 attrezzi offerti~7454 token di schema pe
- **scheda «Hook»** ✅
  - atteso: o dati veri, o uno stato vuoto onesto che dice cosa manca
  - visto: CapabilityAttrezzi 43SkillConnettoriPluginHook AttrezziQuello che il modello può usarePermessi della sessione aperta. La scelta per attrezzo precede la politica generale. TuttiCon permessoDa configurareAggiorna 43 di 43 attrezzi offerti~7454 token di schema pe
- **«Trasforma questo lavoro in una skill»** ❌
  - atteso: C13, dalla sessione corrente
  - visto: false

> ⛔ **T11-capability-D8** (minore): non esiste «Trasforma questo lavoro in una skill» (C13)

## Verdetto

**PASSA CON RISERVA** — difetti trovati: 8 (T11-capability-D1, T11-capability-D2, T11-capability-D3, T11-capability-D4, T11-capability-D5, T11-capability-D6, T11-capability-D7, T11-capability-D8).

> ⚠️ **Il verdetto vale per il codice alla base `c1984d79`.** Un altro agente sta riscrivendo queste
> superfici in parallelo: quello che segue è com'erano il 06/09 alle 16:20, non un giudizio sul lavoro
> in corso.

> ⚠️ Rettifica su quattro passi: le letture «scheda Skill/Connettori/Plugin/Hook» leggevano il
> `textContent` dell'INTERO `#schermoCapability`, pannelli nascosti compresi, quindi riportavano
> sempre il testo degli Attrezzi. Le linguette **funzionano** (foto `03-skill.png`): la prova di
> quelle tre schede vale solo per quello che si vede nelle foto.

## Ispezione delle foto — Capability

Foto lette: `01-capability.png`, `02-dettaglio.png`, `03-skill.png`, `03-connettori.png`,
`03-plugin.png`, `03-hook.png`.

### ⛔ Le descrizioni degli attrezzi sono un muro di inglese (C10)

`02-dettaglio.png`, riga per riga, verbatim da schermo:

- «Lists the files of the workspace, with their sizes. Only the top levels: use "cerca" to find files deeper down.»
- «Finds files anywhere in the workspace, at any depth…»
- «Reads one file of the workspace. Path is relative, e.g. "src/prezzo.mjs".»
- «Writes one file of the workspace, replacing it entirely. Read it first: the whole content is required.»
- «Runs the project test suite and returns its output. This is the judge: the task is done when it passes.»

> ⛔ **T11-capability-D9** (grave): la descrizione dell'attrezzo **«comando nel terminale»** è un
> paragrafo inglese di otto righe che parla di **telefono Android** («When this session runs on a
> connected Android phone instead of the PC, the shell is the device's own minimal one… no
> Node/npm/python/apt… it expects glibc»). Su un'app **desktop**, a una persona italiana, si spiega il
> comportamento su un telefono che non c'è. Ed è così lungo che **viene tagliato** dal bordo del
> riquadro: la frase finisce a metà — prova: `02-dettaglio.png`, ultima riga dell'elenco

### ⛔ Aprendo la app si finisce dentro una sessione di sotto-agente

> ⛔ **T11-capability-D10** (grave): in tutte e sei le foto la sessione **selezionata** è
> `delega:667b9d42-4b10-4e…` (quella andata in errore), e il piede della barra laterale dichiara come
> cartella di lavoro **`sottotask-conta-righe-2`** — la cartella del sotto-agente, non la mia. Aprendo
> TALOS si entra nell'ultima sessione creata, e l'ultima creata è una **delega**: una persona si
> ritrova dentro il lavoro di un agente che non ha mai aperto — prova: barra laterale e piede in
> `03-skill.png`

### Cosa invece funziona, e va detto

- La pagina è **una pagina intera** con le cinque linguette in alto a destra (C1-C2), e «Attrezzi 43»
  porta il numero.
- In cima: **«43 di 43 attrezzi offerti · ~7454 token di schema per giro (stima)»** — il totale c'è, e
  dichiara di essere una **stima** (H25). Manca solo la percentuale della finestra (C6).
- Ogni riga porta **nome umano** (E6, H22: «elenco della cartella», «scrittura di un file», «comando
  nel terminale»), il **costo in token** (`~60`, `~124`, `~310`) e la **pastiglia del permesso** sulla
  stessa riga (C4): «Politica della sessione» o «Come la sessione».
- Il **pannello di dettaglio a destra** (C9) c'è ed è ben fatto: Disponibilità «Offerto al modello»,
  Schema stimato, Categoria, **Permesso** con la tendina e la frase che spiega cosa comporta,
  Dipendenze, e **«Uso osservato → Uso non registrato per questo attrezzo»**: onesto, anche se è
  proprio il dato che C8 e C9 volevano.
- In fondo alla pagina c'è **«NON ANCORA IMPLEMENTATI»** come elenco piatto (C28), con tre voci vere:
  «Insiemi di attrezzi attivabili per sessione», «Computer use e immagini verso il modello»,
  «Gateway di messaggistica e profili di preferenze». È la forma giusta: promesse dichiarate, non
  pulsanti finti.
- La scheda **Skill** ha uno stato vuoto onesto: «0 di 0 voci del progetto · Nessuna voce dichiarata
  nel progetto».

### ⛔ NON VERIFICATO, per nome

- **C12** (skill coi tre stati sempre/chiedi/mai): non ci sono skill nel progetto, quindi la
  grammatica dei tre stati **non si è potuta vedere**.
- **C15-C17** (connettori: origine, timeout, elenco permesso, spegnimento per sessione): nessun
  connettore MCP configurato.
- **C18-C19** (cosa porta dentro un plugin, fiducia legata all'impronta): nessun plugin installato.

## Verdetto (rivisto dopo l'ispezione delle foto)

**PASSA CON RISERVA** — 10 difetti (1 grave sull'inglese, 1 grave sull'attrezzo shell, 1 grave sulla
sessione di sotto-agente aperta da sola, il resto medio/minore). L'impianto è quello deciso in C1-C9 e
si vede; quello che manca è la **voce**: la pagina promette «la descrizione nostra in italiano» e
mostra il testo che va al modello, in inglese, telefono compreso.

> Base del codice: `c1984d79` (worktree `AVM-harness-prove`, istanza sulla porta **4188**).
