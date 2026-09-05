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
