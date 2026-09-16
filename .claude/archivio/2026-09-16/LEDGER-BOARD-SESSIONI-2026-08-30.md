# LEDGER — Board: da campagne TALOS-BANCO a cruscotto sessioni (30/8)

> Piano approvato: `~/.claude/plans/elegant-spinning-dongarra.md` (stesso
> file, sovrascritto il 30/8 — il piano precedente, il giro di QA visiva
> su Gemini 3.7 Flash, resta fermo per ordine esplicito dell'owner
> ["FERMATI ADESSO, NON PARTIRE SENZA LA MIA AUTORIZZAZIONE"], stato in
> `.claude/QA-VISIVA-HARNESS-2026-08-30.md`). Compito diverso, ledger
> diverso.

## Come è nato

Preparando il terreno per il giro di QA visiva, il server si è rifiutato
di partire senza `TALOS_BANCO_DIR`. L'owner: *"mi stai dicendo che per
fare partire harness c'è bisogno di impostare una variabile
obbligatoria? non ha senso"* → poi: *"la Tab board non nasce per Talos
banco, come possiamo ridisegnarla in modo prod ready?"*. Ricerca
competitor (Hermes/Codex/Claude Code, vedi il piano) unanime: un
dashboard mostra le PROPRIE sessioni, mai i dati di uno strumento
esterno. Decisione owner: rimuovere del tutto la vista campagne da
Harness Desktop.

## Fatto — rimozione (Fase A del piano)

- **Cancellati**: `campaign-service.mjs`, `report-source.mjs`,
  `cost-reader.mjs`, `jsonl-reader.mjs` (orfano una volta rimossi i tre
  sopra — nessun altro file lo importava, verificato) + i loro 4 file di
  test + la fixture `tests/fixtures/banco/`.
- **`path-policy.mjs`**: NON cancellato per intero — `isPathInside`/
  `PathPolicyError` sono primitive di sicurezza generali, usate da
  `workspace-files.mjs`/`workspace-tree.mjs` per il containment del
  workspace (verificato via import prima di toccare nulla). Rimossa
  solo `createPathPolicy()` (la fabbrica campagna-specifica) e i suoi 5
  test dedicati; aggiunti 6 test diretti per le due primitive rimaste
  (mai avuto un test proprio prima, solo indiretto).
- **`config.mjs`**: `TALOS_BANCO_DIR`/`TALOS_HARNESS_UI_CAMPAIGNS`/
  `INITIAL_CAMPAIGNS`/`parseCampaigns` spariti. Il server non sa più
  cosa sia TALOS-BANCO.
- **`server.mjs`/`http-app.mjs`**: rimossa la costruzione di
  `pathPolicy`/`campaignService`, le rotte `/api/v1/campaigns` e
  derivate, `parseRunsQuery` (orfana), i codici errore
  `CAMPAIGN_NOT_ALLOWED`/`CAMPAIGN_UNREADABLE`/`ROW_INVALID` dalle tre
  tabelle (Set + due mappe status/messaggio).
- **app.js/index.html/styles.css** (`mobile/public/harness-ui/`):
  l'intera UI campagne (filtri, riepilogo a 5 metriche, righe
  espandibili con evidenza, pannello rapporto) rimossa — ~1400 righe
  nette fra JS/CSS/HTML.
- **README.md**: riscritto — ⛔ trovato dal gate del progetto stesso
  ("fuori si scrive in inglese"): il mio primo tentativo era in
  italiano, bloccato e riscritto in inglese, correttamente.

## Fatto — la vera funzione nuova (Fase B+C del piano)

- **Costo/consumo per sessione, MAI un secondo campo scritto sul
  disco**: `session-registry.mjs`, nuova `usageDaEventi(eventi)` — legge
  l'ULTIMO evento `StateDelta` su `path:'/usage'` già presente nella
  storia persistita di ogni sessione (lo stesso evento che il kernel
  emette già per il contatore live) invece di aggiungere una scrittura
  mutabile a parte. Funziona identica per una sessione viva o
  ripristinata da un riavvio (stessa `voce.eventi`, popolata allo stesso
  modo in entrambi i casi). `null` onesto se nessun giro ha mai
  riportato consumo — mai uno zero inventato.
- **Board ridisegnata — "Sessioni"**: legge `GET /api/v1/sessions` (la
  STESSA rotta che già alimenta la sidebar — zero meccanismo nuovo lato
  dati). Una riga per sessione: titolo, modello, orario, token
  (`prompt+completion`, "· cache Nk" se presente, "· gir_i_"), stato
  onesto a tre valori (Conclusa/Interrotta/In corso, chip verde/rosso/
  neutro). Nessun filtro, nessuna paginazione, nessun dettaglio
  espandibile — dichiarato fuori da questa prima fetta nel piano.

## Due bug reali trovati E corretti, non solo la rimozione

1. **`formattaUsageBreve` leggeva il campo sbagliato**: 
   `usage.prompt_tokens_details?.cached_tokens` (la forma NIDIFICATA
   della risposta grezza OpenRouter) — ma il kernel
   (`talosHarness.mjs`, `conto`) espone `cached_tokens` GIÀ appiattito,
   verificato leggendo il sorgente vero. La cache non veniva mai
   mostrata, nemmeno quando colpiva per davvero. Corretto (stesso
   commit), riusata la funzione corretta sia per il contatore live sia
   per la nuova Board — una sola fonte di formattazione, non due.
2. **`CODE-PRODUCT-NAME-01` bloccato dal mio stesso testo**: avevo
   scritto "Harness Desktop" nell'eyebrow della Board (index.html) e
   nel testo demo-embedded (app.js) — un test esistente e dedicato
   ("ogni riferimento visibile al prodotto è 'Codice', mai 'Harness'")
   l'ha preso subito. Corretto: "Codice" ovunque, coerente col resto del
   prodotto.

## Verificato

- Backend: **953/953** (`node --test`), incluso il nuovo
  `usageDaEventi` (3 test: ultimo StateDelta vince/REPLACE non ADD,
  null onesto senza mai un giro con usage, un altro path StateDelta
  tipo `/file/*` non viene mai scambiato per `/usage`).
- Frontend harness-scope: **168/168** (`npx vitest run tests/unit/harness/`).
- Frontend, suite intera: **6652/6684** — stessi 32 falliti pre-esistenti
  ed estranei (`androidAssetsConformance`/`shadcnConformance`/
  `gitBashLauncherConformance`, gap ambientale già documentato in
  decine di voci precedenti di questa stessa sessione, zero relazione
  con questo lavoro).
- Server avviato **senza alcuna variabile TALOS_BANCO\***: `HTTP 200` su
  `/api/v1/health`, log pulito.
- **Dal vivo, via CDP** (`scripts/qa-visual-pipeline.mjs`, nuovo scenario
  `board-sessioni`, aggiunto permanente al file): 123 sessioni reali
  già persistite da corse precedenti renderizzate nella Board
  ridisegnata — titolo/modello/orario/token/stato tutti veri, zero
  menzione di "campagna"/TALOS-BANCO in tutta la tab, badge "Demo UI"
  correttamente nascosto con dati reali. Due screenshot scattati e
  ISPEZIONATI (non solo i controlli automatici) — nessuna anomalia
  visiva oltre quanto già cercato.

## Osservazione, non un difetto di questo lavoro (dichiarata, non corretta)

Una riga della Board mostra `modello: "m"` — un valore-segnaposto banale
tipico dei test (`modello: 'm'` compare letteralmente in più fixture di
test di questo stesso repo). È inquinamento pre-esistente di
`.sessions-store/` da corse di test precedenti (probabilmente
`http-routes-*.test.mjs` puntato per errore alla cartella reale in una
sessione passata, non verificato oltre), non introdotto né peggiorato
da questo lavoro — la Board lo mostra onestamente perché è davvero lì
sul disco. Fuori scope per questo ledger: segnalato, non ripulito.

## Stato

✅ **Chiuso, verificato dal vivo, non ancora committato/pushato** — commit
in arrivo nello stesso turno (locale, mai push senza un sì esplicito
fresco).
