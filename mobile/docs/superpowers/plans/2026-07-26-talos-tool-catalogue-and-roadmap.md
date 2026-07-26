# TALOS — catalogo tool completo e tabella di marcia

**Stato:** piano vincolante, aperto il 2026-07-26 su richiesta esplicita dell'owner
(*"dobbiamo prima creare una tabella di marcia ben definita e memorizzata
fisicamente nel progetto CON VINCOLI INGEGNERISTICI TALOS DI TUTTI I TOOL DAL
PRIMO ALL'ULTIMO"*). Nessuna implementazione parte senza che la riga
corrispondente di questo documento sia compilata.

**Perché esiste.** Il primo blocco tool (2026-07-26, `5a1c276`…`8d72254`) ha
consegnato sei tool di sola lettura — `library_search`, `library_read`,
`notes_list`, `tasks_list`, `memory_search`, `time_now`. Sono **impianto, non
capacità**: dimostrano che il cancello dei permessi, il ciclo agentico e le
quattro traduzioni wire funzionano, e non danno all'utente una sola ragione per
volerli. L'owner l'ha detto senza giri: *"io parlo dei tool realmente utili tipo
ricerca web con fonti, generazione documenti"*. Questo documento chiude quel
divario e definisce tutto ciò che viene dopo.

---

## 1. Le tre fonti che questo piano deve rispettare

| Fonte | Cosa impone |
|---|---|
| `references/2026-07-26-android-agent-shizuku-vision.md` | Il nord: agente operativo Android. Ciclo `osservare → comprendere → pianificare → chiedere autorizzazione → agire → verificare → correggere`. Sette livelli di rischio, preview obbligatoria, rollback, audit, **tool tipizzati mai `runShell`**. |
| `references/2026-07-25-claude-tooling-oss-matrix.md` | La parità: cosa può chiamare Claude, quale controparte OSS esiste, cosa è proprietario. |
| `decisions/` + `DEBT-REGISTER.md` | I vincoli già chiusi: PIN = chiave, BYOK, local-first, budget di boot, CI. |

### I vincoli ingegneristici TALOS, applicati a ogni riga

Ogni tool di questo catalogo è ammesso solo se soddisfa **tutti e cinque**:

1. **Ricerca web prima.** Nessun tool viene scritto senza un checkpoint loggato
   (query, fonti, cosa ha cambiato nel disegno). Un tool wire scritto a memoria
   è il difetto che ha reso muti Gemini e Ollama per un giorno intero.
2. **One-up.** Se fa esattamente quello che fanno gli altri, non si spedisce:
   si spedisce con la cosa in più che solo TALOS può fare.
3. **Parity.** Quello che fa il desktop lo fa il mobile, e viceversa; le
   divergenze si dichiarano nel manifest, non si nascondono.
4. **Maximum potential.** Niente versione "minima" di un tool che poi resta
   minima per sempre.
5. **AMBITION.** Soluzioni mai fatte, che distacchino TALOS dalla concorrenza.

E tre regole di sicurezza, ereditate dal §9 della visione:

- **Tipizzati, mai shell libera.** Un tool ha uno schema; `runShell("qualsiasi
  cosa")` non esiste, e se un giorno esisterà sarà disabilitato di default,
  confinato, filtrato e tracciato.
- **I dati letti non sono istruzioni.** Ogni risultato attraversa il confine
  `TALOS_TOOL_RESULT (untrusted data…)`. Già applicato nell'executor.
- **Niente comandi decorativi.** Un interruttore che non cambia nulla, una
  preview che non descrive l'azione reale, un chevron che non apre nulla: sono
  bugie, e vengono trattate come difetti.

---

## 2. Traduzione onesta: cosa del documento gira su un telefono

La visione elenca uno stack **server-side** (SearXNG, Playwright, Trafilatura,
`python-docx`, `openpyxl`, LibreOffice headless, gVisor). In un'app Capacitor
non esiste nessuno di quei processi: niente Python, niente browser headless,
niente container. Fingere il contrario produrrebbe una roadmap di fantasia.

| Nel documento | Sul telefono, davvero | Nota |
|---|---|---|
| SearXNG | **API di ricerca BYOK** (Brave / Tavily / Exa) | stessa architettura delle chiavi provider già presenti |
| Playwright (fetch + render JS) | **`CapacitorHttp`** — nativo, **scavalca il CORS** | niente rendering JS: le pagine che richiedono JS si degradano onestamente |
| Trafilatura (estrazione) | **`@mozilla/readability` + `DOMParser`**, on-device | l'estrazione avviene **sul telefono** |
| `python-docx` / `openpyxl` / `python-pptx` | **`docx` · SheetJS · `pptxgenjs`** | JS puro, zero dipendenze native |
| WeasyPrint / ReportLab | **`pdf-lib`** | |
| Matplotlib / Plotly | **canvas + libreria chart JS**, export PNG | |
| gVisor / Firecracker (code execution) | **non disponibile** | vedi §5: sospeso, non promesso |

### La conseguenza che vale più di tutte

`CapacitorHttp` scavalca il CORS. Quindi nella ricerca web **l'unica cosa che
lascia il telefono è la query**: le pagine le scarica e le legge il dispositivo.
Perplexity, ChatGPT Search e Gemini mandano tutto ai loro server e lì fanno
l'estrazione. Il vincolo local-first, che di solito è una zavorra, qui diventa
la cosa che nessun concorrente può offrire — ed è la base dell'one-up di F1.

---

## 3. Livelli di rischio

Il §9.1 della visione ne definisce sette. Il mobile oggi ne ha tre
(`read` / `write` / `outbound`). I sette sono un **superset**, non un
ripensamento: la migrazione avviene a F3, quando arriva il primo tool
distruttivo, non prima — introdurre sette livelli per governare sei letture
sarebbe cerimonia.

| Livello | Significato | Default | Da quale fase |
|---|---|---|---|
| `observe` | sola lettura locale | consenti | F0 ✅ (oggi `read`) |
| `draft` | prepara senza applicare | consenti | F2 |
| `safe-write` | scrittura reversibile | chiedi | F3 (oggi `write`) |
| `execute` | esecuzione controllata | chiedi | F5 |
| `external-write` | azione verso terzi | nega | F6 |
| `destructive` | perdita o alterazione grave | nega + preview + rollback | F7 |
| `root` | privilegi massimi | disabilitato | F8, mai di default |

Decisioni policy previste (§9.2): `allow`, `allow_once`, `allow_for_session`,
`allow_with_preview`, `require_confirmation`, `require_biometric`, `deny`.
Oggi ne esistono tre (`allow` / `ask` / `deny`). `require_biometric` diventa
implementabile **adesso**, perché R32 ha introdotto il legame hardware col
Keystore.

---

## 4. Il catalogo — ogni tool, dal primo all'ultimo

Legenda stato: ✅ spedito · 🔜 fase assegnata · ⏸ sospeso con motivo · ⛔ escluso.

### F0 — Fondamenta (✅ spedito, `5a1c276`…`c8d0db3`)

| Tool | Rischio | Stato | Nota |
|---|---|---|---|
| `library_search` | observe | ✅ | ricerca semantica nei documenti della Libreria |
| `library_read` | observe | ✅ | legge un documento per id |
| `notes_list` | observe | ✅ | |
| `tasks_list` | observe | ✅ | filtra per stato |
| `memory_search` | observe | ✅ | |
| `time_now` | observe | ✅ | orologio del dispositivo |

**Cosa ha davvero consegnato F0**: il registro tool con JSON Schema da zod, le
quattro traduzioni wire (OpenAI/Anthropic/Gemini/Ollama), il ciclo agentico
limitato, il cancello dei permessi, l'audit, il confine untrusted. È
l'infrastruttura su cui poggia tutto il resto — e da sola non vale una riga di
rilascio.

---

### F1 — Ricerca web con fonti 🔜 **prossima**

Parità Claude: `Web Search` + `Web Fetch` + `Research multi-step` + `News
research` (tutti proprietari Anthropic).

| Tool | Rischio | Cosa fa |
|---|---|---|
| `web_search` | observe | interroga il provider BYOK, restituisce risultati con titolo, url, snippet, data |
| `web_read` | observe | scarica UNA pagina con `CapacitorHttp` ed estrae il contenuto on-device |
| `web_research` | observe | ciclo multi-passo: pianifica query → cerca → legge → confronta → risponde con citazioni |

**Vincoli specifici**
- BYOK: la chiave di ricerca vive dove vivono le chiavi provider, cifrata.
- Il contenuto estratto passa il confine untrusted **prima** di raggiungere il
  modello. Una pagina web è il vettore di prompt injection per eccellenza.
- Nessun fetch automatico di URL trovati dentro il testo dell'utente senza che
  il tool sia stato chiamato: il modello chiede, il cancello decide.
- Degradazione onesta: se una pagina richiede JS e non abbiamo contenuto, il
  risultato lo **dice**, non inventa.

**One-up / AMBITION**
1. **Solo la query lascia il telefono.** Lettura ed estrazione sul dispositivo.
2. **Data articolo ≠ data evento.** Il §4.13 lo chiede e nessun assistente lo
   fa: è il motivo per cui vengono spacciate notizie vecchie per novità.
3. **Dissenso tra fonti in evidenza.** Raggruppare gli articoli sullo stesso
   evento e mostrare **dove non concordano**, invece di mediare in un paragrafo
   rassicurante.
4. **Ogni fonte letta atterra nella Libreria di quella chat**, con provenienza,
   quindi compare nella galleria media già costruita. Una ricerca lascia un
   archivio consultabile, non solo un testo che scorre via.

**Ricerca web da fare prima**: stato 2026 delle API (Brave/Tavily/Exa),
`@mozilla/readability` in WebView Android, event clustering e citation mapping.
*(Primo passaggio già fatto il 2026-07-26 — vedi §7.)*

---

### F2 — Generazione documenti 🔜

Parità Claude: `DOCX/XLSX/PPTX/PDF generation`, `Chart e PNG`.

| Tool | Rischio | Cosa fa |
|---|---|---|
| `document_create` | draft → safe-write | genera md/html/csv/docx/xlsx/pptx/pdf |
| `chart_create` | draft → safe-write | grafico quantitativo → PNG/SVG |
| `diagram_create` | draft → safe-write | mermaid/graphviz → SVG |

**Vincoli specifici**
- Pipeline del §4.12 **per intero**: `Genera → Analizza → Anteprima → Controllo
  qualità → Correggi → Esporta`. Il passo che tutti saltano è il controllo
  qualità: TALOS **riapre il file che ha appena scritto** e verifica che sia
  valido prima di consegnarlo. Un DOCX corrotto consegnato con sicurezza è
  peggio di un rifiuto.
- Peso: i generatori si caricano **su chiamata**, mai al boot, e ognuno prende
  la sua riga in `verify-initial-chunk.mjs`.
- Il file finisce in Libreria con `origin='generated'`, quindi **non è
  reiniettabile** — regola già in vigore.

**One-up / AMBITION**
- **Anteprima prima del salvataggio**, dentro la chat, con il documento reale
  già renderizzato — non una descrizione di ciò che sarà.
- **Verifica di validità dichiarata**: "l'ho riaperto, ha 3 fogli e 12 formule,
  nessun errore". Nessuno lo fa; tutti consegnano e sperano.
- Interamente on-device: nessun documento generato attraversa un server.

---

### F3 — Scrittura locale 🔜

Parità Claude: `Memory tool`, `Text Editor tool` (versione applicativa).

| Tool | Rischio | Cosa fa |
|---|---|---|
| `notes_create` / `notes_update` | safe-write | |
| `tasks_create` / `tasks_update` | safe-write | |
| `memory_write` | safe-write | ricordo esplicito, mai implicito |
| `library_save` | safe-write | salva un documento generato |

**Vincoli specifici**
- È qui che il cancello "chiedi ogni volta" comincia davvero a governare
  qualcosa: oggi esiste e presiede quasi nulla.
- Ogni scrittura è **reversibile** e mostra una preview con valore attuale,
  valore proposto, motivo (§9.4).
- Migrazione ai sette livelli di rischio.
- Persistenza dei giri tool nella cronologia (**debito T7**), altrimenti il
  modello riesegue gli stessi tool a ogni domanda successiva.

---

### F4 — Il registro visibile 🔜

Parità Claude: `Tool-call audit`, `Checkpoint / rollback`.

| Tool / superficie | Rischio | Cosa fa |
|---|---|---|
| pannello attività tool | — | mostra **debito T8**: l'audit oggi si scrive e non lo vede nessuno |
| `undo_last_action` | safe-write | annulla l'ultima scrittura reversibile |

**One-up**: la riga muta stile Claude già costruita (`TalosMobileTraceRow`) apre
un drawer che mostra **cosa ha letto il modello, cosa ha scritto, cosa gli è
stato negato e perché**. Un rifiuto e un successo oggi si somigliano; devono
essere distinguibili a colpo d'occhio.

---

### F5 — Analisi documenti e dati 🔜

Parità Claude: `Document analysis`, `Data analysis`.

| Tool | Rischio | Cosa fa |
|---|---|---|
| `document_extract` | observe | PDF/DOCX/XLSX → testo+struttura (già parziale nell'ingestione) |
| `data_query` | execute | interroga un CSV/XLSX della Libreria |

**Vincolo**: `data_query` è il primo `execute`. Nessun linguaggio arbitrario —
una query tipizzata su dati tabellari, non un interprete.

---

### F6 — Verso l'esterno ⏸ (progettato, non aperto)

Parità Claude: `MCP Connector`, `Interactive connectors`.

| Tool | Rischio | Nota |
|---|---|---|
| `mcp_call` | external-write | MCP è aperto e model-agnostic: è la strada giusta |
| condivisione / invio | external-write | **default `deny`**, decisione owner |

**Vincolo bloccante**: `external-write` è negato di default e non si apre senza
una decisione esplicita dell'owner, per singolo connettore, con audit.

---

### F7–F8 — Il dispositivo ⏸ sospeso, richiede GO esplicito

Copre §4.1–4.9 della visione. L'owner ha fissato il 2026-07-26 il traguardo in
una frase che vale come definizione di fatto:

> **"una sorta di sistema operativo agentico sopra Android"** — un assistente che
> non risponde soltanto, ma osserva il telefono, esegue comandi, modifica file,
> controlla applicazioni, analizza notifiche, automatizza interfacce, fa
> ricerca, genera documenti e coordina workflow locali e remoti.

#### La scala dei privilegi (owner, 2026-07-26)

Ogni gradino sblocca tool diversi, e **non** è una scala che si sale per
default: ognuno è una decisione a sé, con il proprio consenso.

| Gradino | Identità | Cosa sblocca | Costo / rischio reale |
|---|---|---|---|
| App Android normale | uid app | API pubbliche, permessi concessi | dov'è TALOS oggi |
| **Shizuku via ADB** | uid `2000` (`shell`) | package manager, AppOps, `settings`, `dumpsys`, diagnostica | Shizuku va riavviato a ogni reboot senza root; SELinux resta |
| **+ Accessibility** | servizio dedicato | automazione UI: leggere l'albero, toccare, scrivere, scorrere | consenso separato e vistoso; Google lo tratta come permesso sensibile |
| **+ Notification Listener** | servizio dedicato | leggere, classificare, riassumere e rispondere alle notifiche | dati altamente sensibili: elaborazione **locale**, oscuramento nei log |
| **+ MediaProjection** | consenso per sessione | screenshot e comprensione schermo con modello vision | `FLAG_SECURE` e DRM restano invisibili — e TALOS stesso alza `FLAG_SECURE` |
| **+ VpnService** | interfaccia TUN locale | vedere e filtrare il traffico di rete del dispositivo | **il TLS non si legge** senza installare una CA, che rompe il certificate pinning ed è una scelta grave a sé |
| Device Owner / Profile Owner | policy enterprise | politiche profonde, restrizioni, gestione | richiede provisioning: di norma dispositivo azzerato |
| **Shizuku/Sui con root** | uid `0` | controllo quasi completo del sistema e dei dati locali | Sui = variante Magisk (sopravvive al reboot); SELinux, Verified Boot e Play Integrity **restano** |

#### Tool per gradino

| Blocco | Rischio | Gradino minimo | Nota |
|---|---|---|---|
| lettura dispositivo (`dumpsys`, package list, batteria) | observe | Shizuku ADB | decisione owner esistente: **read-only** per primo |
| permessi e AppOps in lettura | observe | Shizuku ADB | report privacy: quali app accedono a cosa |
| modifica impostazioni / revoca permessi | destructive | Shizuku ADB | preview obbligatoria + rollback + conferma |
| install / uninstall / force-stop / clear | destructive | Shizuku ADB | `pm clear` è perdita di dati: preview che lo dice |
| automazione UI | execute → destructive | + Accessibility | verifica dello schermo risultante dopo ogni azione |
| comprensione schermo | observe | + MediaProjection | consenso per sessione, mai persistente |
| notifiche: digest, classificazione, task | observe → safe-write | + Notification Listener | locale; niente contenuti nei log |
| ispezione/filtro di rete | observe → destructive | + VpnService | **il più delicato**: vedere il traffico è un potere che va motivato per singola funzione, non acceso in blocco |
| policy enterprise | destructive | Device Owner | fuori ambito personale, salvo richiesta esplicita |
| root | root | Sui/Magisk | **disabilitato di default**, biometrica + allowlist + audit completo |

**Nessuna riga di questo blocco parte senza un GO scritto dell'owner, e i
gradini si aprono uno alla volta.** Il §7 della visione resta valido come lista
di ciò che nemmeno il root sblocca: `/data/data` altrui, chiavi hardware,
bypass biometrico, Play Integrity, Verified Boot, DRM, permessi `signature`,
microfono/camera senza consenso.

---

### ⛔ Esclusi, con motivo

| Cosa | Perché |
|---|---|
| `Code Execution` sandboxata | richiede gVisor/Firecracker/container: non esistono su Android in-app. Non si promette. |
| `Bash tool` / shell libera | vietato dai vincoli: tool tipizzati, mai comando arbitrario |
| `Computer Use` desktop | fuori ambito mobile |
| `Image synthesis` | richiede modelli e GPU; eventualmente via provider esterno, non on-device |

---

## 5. Tabella di marcia

| Fase | Contenuto | Dipende da | Stato |
|---|---|---|---|
| **F0** | fondamenta + 6 tool observe | — | ✅ spedito |
| **F1** | ricerca web con fonti | chiave BYOK dall'owner | 🔜 **prossima** |
| **F2** | generazione documenti | F0 | 🔜 |
| **F3** | scrittura locale + 7 livelli di rischio | F0 | 🔜 |
| **F4** | registro visibile (T8) + undo | F3 | 🔜 |
| **F5** | analisi documenti e dati | F2 | 🔜 |
| **F6** | MCP / esterno | F3, F4 | ⏸ decisione owner |
| **F7** | dispositivo in lettura (Shizuku) | GO owner | ⏸ |
| **F8** | dispositivo in scrittura + root | GO owner + F4 | ⏸ |

**Ordine e perché**: F1 prima perché è ciò che manca di più e sblocca il resto
(un modello che sa cercare rende utile tutto il resto). F2 subito dopo perché
atterra nella Libreria e nella galleria già costruite. F3 e F4 insieme, perché
la scrittura senza registro visibile è la cosa che l'owner ha sempre rifiutato.

**Gate per ogni fase**: ricerca web loggata → TDD → `vue-tsc -b --force` → unit →
e2e → build con budget → **review SF avversariale** → correzioni → ledger →
commit → APK con stamp verificato **dentro** l'archivio.

---

## 6. Debiti che questo piano assorbe

| Debito | Fase che lo chiude |
|---|---|
| T7 — i giri tool non sono persistiti | F3 |
| T8 — l'audit si scrive e non si mostra | F4 |
| T6 — blocchi `thinking` Anthropic non catturati | F3 (tocca lo stesso codice) |
| S4–S6, S8–S11 | invariati, non toccati da questo piano |

---

## 7. Checkpoint di ricerca web

| Data | Query | Fonti | Impatto sul disegno |
|---|---|---|---|
| 2026-07-26 | API di ricerca per agenti AI, confronto 2026 | brave.com/learn/best-search-api-2026, aimultiple.com/agentic-search, firecrawl.dev/blog/best-web-search-apis, webscraft.org | Brave: indice indipendente, latenza minima (~669ms), $5 credito/mese. Tavily: risultati già puliti per agenti. Exa: semantico, prezzo a crediti che sale. → **BYOK con adapter, non un provider cablato** |
| 2026-07-26 | generazione DOCX/XLSX/PDF/PPTX in browser | npmjs/pptxgenjs, lobehub office skills, npm-compare | `docx@9.5`, `xlsx`, `pdf-lib@1.17`, `pptxgenjs@4` girano in browser senza dipendenze native → **F2 è interamente on-device**, contro l'aspettativa del documento |

**Da fare prima di F1**: `@mozilla/readability` dentro una WebView Android;
event clustering e claim-source mapping; estrazione della data di pubblicazione.

---

## 8. Cosa serve dall'owner

1. **Provider di ricerca + chiave** per F1. Raccomandazione: **Brave**.
2. **GO su F6** quando si arriverà lì (uscita verso l'esterno).
3. **GO su F7/F8** (Shizuku) — oggi sospesi per decisione esistente.
