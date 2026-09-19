# PIANO — LA PARITÀ COL MOCKUP, VISTA PER VISTA

> Owner, 18/09/2026: «Devi prevedere ogni singola cosa: ogni singolo riga di codice, ogni singola
> lettera, ogni singolo componente. Ogni singola cosa deve essere identica al mockup e
> completamente funzionante e collegata all'applicazione. Quello che non si può collegare
> assolutamente me lo dici e lo nascondi».

## 0 · IL RIFERIMENTO, E COME SI USA

- **Mockup**: `C:\Users\Antonino\Downloads\TALOS-Calm-Lab-04.html` — md5 `952fd467eff2cdd331f968c419fa1cc0`,
  byte-identico a `harness-ui/frontend/prototypes/calm-lab/TALOS-Calm-Lab.html` (misurato: stesso md5).
  ⛔ È **il riferimento**, e la sua riproduzione vista per vista è **incambiabile**.
- **App**: `http://127.0.0.1:4174` (sola lettura: si legge e si fotografa, ogni non-GET fermata).
- **Release pubblica**: riferimento in fase di ricognizione — dice cosa l'app **ha già** e che
  **non si deve perdere**.

## 1 · LA REGOLA DEL METODO (le tre lezioni che sono già costate tre giri)

1. ⛔ **SI MISURA, NON SI DEDUCE.** Ogni affermazione su una vista ha un **selettore che l'ha
   trovata** e un **testo o un numero letto dal DOM vivo**. Le voci della sidebar nascono da un
   template: cercarle **per testo** lasciava la pagina sulla prima sezione, e **otto fotografie su
   otto erano la stessa**. Un selettore che non trova niente si **dichiara**, non si aggira.
2. ⛔ **LA LINGUA SI DICHIARA.** Senza `uiLanguage: 'it'` l'app parte **in inglese** ed è il
   predefinito: un confronto con un mockup italiano sarebbe falso **in ogni vista**.
3. ⛔ **UNA FOTO NON È UNA MISURA, E DUE FOTO SEPARATE NON SONO UN CONFRONTO.** Si confrontano
   **affiancate** o in **coppie di file** (`<nome>_mockup` / `<nome>_real`), stessa vista, stessa
   larghezza, stesso tema.

**E quattro vincoli che non conoscevamo**, da una ricerca vera del 18/09/2026 (fonte:
`github.com/vasilyu1983/AI-Agents-public`, `skills/qa-testing-playwright/references/
visual-regression-testing.md`, letta il **18/09/2026**):
- oltre ad `animations: 'disabled'` servono **`colorScheme`, `timezoneId`, `locale` e
  `deviceScaleFactor` fissati**: le date e i numeri formattati cambiano fra locale diversi e
  producono **differenze finte** (nel laboratorio ci sono date come «18/09/2026, 17:18:28»);
- le regioni con **contenuto vivo** (RAM «12,3 GiB», contatori, timestamp) si **mascherano** o si
  **dichiarano attese** — mai contate come difetti di parità;
- la soglia si stringe, non si allarga: `maxDiffPixelRatio` oltre **0,05** è una maschera;
- le baseline non si aggiornano da sole: ogni aggiornamento si **rivede a mano**.

## 2 · COSA VUOL DIRE «IDENTICO», E COSA VUOL DIRE «COLLEGATO»

Per **ogni elemento del mockup**, una riga di questo piano dice:

| colonna | significato |
|---|---|
| **elemento** | il pezzo del mockup, col suo selettore e il testo **esatto** |
| **dove** | in quale vista e in quale punto (misure: `file:riga` del mockup, o selettore + posizione) |
| **nell'app** | dove vive oggi: file, riga, selettore — oppure **ASSENTE** |
| **azione** | `COLLEGA` (esiste la sorgente vera) · `VESTI` (c'è il contenuto, manca il disegno) · `NASCONDI` (non collegabile: si toglie dalla vista e si elenca) |
| **prova** | come si verifica che è fatto, e **cosa diventa rosso** se qualcuno lo rompe |

⛔ **Il criterio dell'owner, parola per parola**: *ciò che non si può collegare assolutamente si
dice e si nasconde* — non si inventa una fixture, non si sceglie un surrogato, non si mostra a metà.

## 3 · LE REGOLE CHE NON SI POSSONO ROMPERE (owner, 18/09)

1. ⛔ **NIENTE SI PERDE.** Nessuna funzione attuale dell'app sparisce: se non sta nella vista del
   mockup, sta in una sua — come il catalogo dei fornitori, che vive in «Provider» invece che in
   «Hugging Face».
2. ⛔ **LA CHAT NON SI TOCCA.** Si lavora sulle **Impostazioni** e sul **Laboratorio modelli**.
3. ⛔ **LE QUATTRO SCHEDE DEL MOCKUP**, coi suoi nomi: **Hugging Face** (i modelli locali) ·
   **Provider** (le chiavi API, «esattamente con lo stesso stile, layout, card, il bottone
   *Configura* che apre le modali») · **Download** · **Sistema**.
4. ⛔ **LA PANORAMICA VA DENTRO SISTEMA**, col disegno del mockup, senza perdere i suoi id.
5. ⛔ **LE SEZIONI DEL MOCKUP CHE SONO VUOTE O ATTENUATE**: «in quelle dobbiamo mettere il
   corrispondente reale così com'è ma applicando solo lo stile».

## 4 · LE FASI (una per volta: finire, verificare, poi la successiva)

> Ordine di dipendenza: prima l'intelaiatura, poi le superfici. Ogni fase si chiude con le sue
> prove e le sue foto, **non** con un «dovrebbe essere a posto».

- **FASE 0 — le mappe** (in corso): mockup · app · release pubblica. Nessuna modifica.
- **FASE 1 — l'intelaiatura delle Impostazioni**: sidebar (voci, icone, gruppi, cercatore, piede),
  testata di sezione (eyebrow, titolo 32px, sottotitolo, badge informativo), griglia della pagina.
- **FASE 2 — le dieci sezioni**, una per una: dal mockup si prende il DISEGNO, dall'app il
  CONTENUTO vero. Per ognuna: cosa mostra il mockup (o che è vuota), cosa mostra l'app, e la
  tabella di azioni.
- ✅ **FASE 3 — il Laboratorio: la banda** — **CHIUSA il 19/09/2026** (`0948d437`): «Modello per le
  nuove chat» + budget RAM + la politica cloud. ⛔ La terza frase **non** è quella del mockup:
  «Nessun passaggio automatico al cloud» è **falso** in TALOS — il ripiego esiste ed è condizionato
  (`session-registry.mjs:3739` e `:3735`) — quindi la banda porta «Al cloud solo con un consenso
  esplicito.» e la prova **vieta** l'altra (BANDA-01). Review mia con mutazione, 4174 in sola
  lettura, foto nei due temi. Le tre decisioni dell'owner del 19/09 sono nel documento di ripresa.
- **FASE 4 — le quattro schede**, una per una: Hugging Face · Provider · Download · Sistema.
  È anche la fase che fa diventare verdi `lab-faccette` (7/7, oggi in `timedOut`) e «Model Lab
  filters» di `baseline-shell` — gli unici due cancelli rossi che questa catena di fasi possiede.
- **FASE 5 — la pagina del modello** e i suoi lati.
- **FASE 6 — il confronto finale**: ogni vista, mockup contro app, coi file in
  `Downloads/confronto-mockup-app/`, e la tabella delle differenze che resta.

## 5 · COME SI CHIUDE UNA FASE (e non è un'opinione)

1. **Le prove del repo**: `npm run build`, `npm run test:unit`, le spec delle superfici toccate,
   il cancello dei componenti quando si tocca il markup.
2. **Le prove che mordono**: per ogni cura, la riga tolta che fa diventare **rossa** la prova.
3. **Le foto**, mockup e app, stessa vista/larghezza/tema, **guardate una per una** cercando
   difetti anche fuori da ciò che si è corretto.
4. **La consegna sul 4174** (`npm run aggiorna`) e la salute.
5. **La tabella delle differenze**: cosa resta, per nome, con la ragione.

## 6 · LE MAPPE (da riempire coi referti dei tre ricognitori)

### 6.1 · Il mockup, vista per vista — MISURATO il 18/09/2026

md5 verificato `952fd467eff2cdd331f968c419fa1cc0`. Servito da `python -m http.server 4213`
(⛔ **la 4210 era occupata** da un server che serve `prototypes/calm-lab/` e dà 404 sul file).
Viewport 1440×900, **0 errori di console**, hash iniziale `#/impostazioni/modelli/models`.

#### ⛔ LA SCOPERTA CHE CAMBIA IL PIANO: il mockup è pieno solo in DUE viste
`p.nav-scope` lo dichiara a parole: «**Le voci attenuate sono fuori da questo primo lotto.**»
Delle 10 voci, **7 sono `disabled` con `opacity 0.58` e `cursor: not-allowed`**, e non esiste
nessuna rotta che le mostri: `chat` · `tools`(shield) · `memoria` · `privacy`(key) · `costi`(cost) ·
`workspace`(folder) · `account`(activity). Provato in **4 modi indipendenti**: proprietà `disabled`,
`getComputedStyle`, click (hash invariato 7 su 7), e **hash imposto a mano** → il router **normalizza
sempre** a `#/impostazioni/modelli/models` (9 tentativi su 9).
⇒ **Solo `appearance` e `models` sono PIENE.** L'ottava voce, «Provider e accessi», non è attenuata
ma porta `data-action="providers-tab"` e apre `#/impostazioni/modelli/providers`.

⛔ **E la conseguenza, che è la chiave di tutto il piano**: il mockup **non ha** il contenuto delle
altre 7 sezioni — l'app **sì, ed è piena**. Quindi lì non c'è nessun disegno da copiare: si porta
lo **stile** del mockup sul **contenuto vero dell'app**, che è esattamente ciò che l'owner ha
chiesto («in quelle dobbiamo mettere il corrispondente reale così com'è ma applicando solo lo stile»).

#### L'intelaiatura
`#app` grid **246px | 1194px** · `.sidebar` 246 ([22px 16px 16px]) · `.topbar` 1194×64 ·
`.content` ([32px 36px 26px]) · `footer.statusbar` 1194×42 @y=858.
- `.brand` → **"TALOS"** (18/650) + **"WORKSPACE"** (10px, ls 2px) · `.sidebar-title` **"Impostazioni"**.
- `#open-settings-search` **"Cerca impostazioni"** + `kbd` **"Ctrl K"** ← l'app ha invece il campo
  di ricerca **in alto**.
- Nav 213×615, gruppi **COMPORTAMENTO** / **INFRASTRUTTURA**, voci **213×42, 13px, padding 10px 12px,
  radius 8px**; attiva in `rgb(112,72,20)`, le attenuate `rgb(99,101,107)`.
- `.sidebar-bottom` → `.scope-card` con avatar + **"Spazio personale"** + **"Calm · anteprima isolata"**.
- **Breadcrumb: C'È** (`.breadcrumbs` → "Impostazioni" › `#breadcrumb-current`), e sulla pagina
  modello diventa **"Laboratorio / Qwen3 8B"**. ⛔ **L'app non ce l'ha.**
- Topbar: **"PROTOTIPO · 04"**, tasto tema rapido (`light`↔`dark`, misurato), **"Guida al mockup"**.
- **Statusbar**: «Nessuna chiamata reale · dati demo» + **selettore Scenario** con **5 scenari**
  (`ready, empty, offline, error, denied`) che cambiano davvero la pagina.
- Testata: eyebrow 11px/500 ls 1.87px · `#page-title` **32px/600 ls -1.76px** · p 13px ·
  **`#add-model` "Aggiungi modello"** (12px/650, fondo `rgb(155,104,35)`).
- **Badge di destra**: `appearance` **"40 controlli · 14 temi"** ✓ (veri, §7.1) · models/downloads/
  pagina modello **nessuno** · `providers` **"Nessuna chiave reale"** · `system` **"Hardware non rilevato"**.

#### `appearance` — `#/impostazioni/aspetto` (PIENA)
Banda `theme-launcher` 1122×132: swatch + eyebrow **"IL TUO TEMA"** + `h2` **"Calm"** +
«Palette, modalità colore, scene e tutte le regolazioni dello sfondo.» + bottone **"Temi e atmosfere"**.
Corpo `settings-layout` grid **786px | 300px** gap 36 — ⛔ **l'app non ha la colonna destra**.
**5 sezioni, 26 righe** (riga: 786×111, flex gap 24, padding 21px 0; etichetta 14px/550):

| # | sezione | righe |
|---|---|---|
| 0 | Interfaccia e conversazione | **9** (densità, lingua, dimensione, testo chat, forma composer, + , stile messaggi, animazione risposta, pannelli) |
| 1 | Accessibilità e risorse | **4** check (animazioni, sospendi nascosta, risparmio dati, riduci movimento) |
| 2 | Movimento dell'interfaccia | **11**, dentro `<details>` **CHIUSO** (49px → 1270px): Profilo, Curva, Durata 50, Intensità 65, Ritardo 40, 6 famiglie |
| 3 | Desktop | **1** (Intestazione immersiva) |
| 4 | Spazio di lettura | **1** (Chat a tutta larghezza) |

Colonna destra: **ANTEPRIMA DEL TEMA** con `canvas` vivo, finestra finta, didascalia scena e due
note («Un controllo, una preferenza.» / «…non collegati a un agente.»).
Dialog **"Temi e atmosfere"**: 331 elementi, 38 controlli, **14 temi** in griglia, 14 righe, anteprima
dal vivo, «Modifiche applicate subito.» + **"Chiudi studio"**.

#### `models` (Laboratorio) — PIENA, e la banda è su TUTTI e 4 i tab
Banda `setup-band` 1122×116 **@y=216**, margin `0 0 23px`: glyph + **"MODELLO PER LE NUOVE CHAT"** +
**"Qwen3 8B"** + badge **"Locale"** + «Le chat già aperte non cambiano.» | **"BUDGET RAM · SCENARIO
DEMO"** **18,6 GiB** «su 32 GiB» + barra | bottone **"Nessun passaggio automatico al cloud"** → dialog
**"Locale non significa tutto offline."**
Tab `lab-tabs` 1122×44, gap **26px**, `border-bottom: 2px`, attivo `rgb(35,36,39)` + bordo
`rgb(155,104,35)`; in coda `span.tab-end` **"Dati dimostrativi"**.

- **models**: campo ricerca + **9 ordinamenti** + chip **Tutti / Locali 12 / Cloud 3 / Installati 2 /
  Preferiti** + 4 faccette (Grandezza, Contesto, Formato, Compatibilità RAM) + `#catalog-expand` →
  12 gruppi di faccette + **"15 modelli"** + **"Viste salvate (0)"** + **"Salva vista"**.
  **15 `.model-row` 1122×96** in 2 gruppi (**SUL DISPOSITIVO 12** / **VIA PROVIDER 3**), ognuna con
  glyph, nome 14/550 (una con **"Predefinito"**), meta, disponibilità, **capacità** («8,2B /
  32.768 token»), **stella Preferiti** e **checkbox confronta**. ⛔ **La colonna da 332px è VUOTA.**
- **providers**: **2 card 551×332** (OpenRouter con badge **"Verificato · demo"** + **"Configura"** /
  **"Verifica accesso"**; llama.cpp "Locale · demo" + **"Apri sistema"**) + avviso «Qui non inserire
  chiavi reali.» ⛔ **L'app ne ha 28, e il bottone "Configura" apre le modali vere.**
- **downloads**: ⛔ **VUOTA** — 74 elementi, 1 `.empty-state` 1122×330, **0 righe**: «Nessun download
  in coda.» + **"Esplora il catalogo"**.
- **system**: 2 card — «Memoria di esempio» badge **"Fixture"** 18,6 GiB con **GPU/VRAM "Non
  rilevate"**; «Runtime locale» badge **"Pronto · demo"** llama.cpp con **"Simula nuova verifica"**.

#### La pagina del modello — **TRE lati**, non cinque
`#/impostazioni/modelli/scheda/<id>/<lato>`, id **URL-encoded** (`local%3Aqwen8`). Toolbar con
**"Tutti i modelli"** + **"Banco prova"** + `#model-primary-action` che è **"Già predefinito"**
(disabilitato) o **"Usa per le nuove chat"** → dialog **"Una scelta esplicita."**.
Hero con `#page-title` **40px/550**, repo, **"Nei preferiti"**, «Conosci il modello. Scegli come
usarlo.» · striscia a 4 blocchi · tab **"Scheda Hugging Face" · "File del modello" · "Compatibilità"**
+ nota **"Nessun avvio automatico"**.
⛔ **Il mockup ha 3 lati; l'owner ne ha nominati 5** (Scheda · Provider · Accesso · Identità ·
Compatibilità) — vedi le domande.

#### Le sorgenti dichiarate nel mockup (per non inventare)
`DEMO_MODELS` (riga 1946, 5 modelli) · `extendCatalog` (1817: +9 righe sintetiche +1 cloud = **15** ✓)
· `SETTINGS_INDEX` (1953, **9 voci**, tutte `appearance` o `models`) · `MODEL_SOURCES` (2058, **solo
3** id hanno una scheda) · `DETAIL_TABS` (2063, **3**) · `THEME_CONTRACT` (504) + `THEME_NAMES` → **14
temi** ✓ · `STORAGE_KEY` `talos.calm-lab.prototype.v3` · `APPEARANCE_KEY` `…appearance.v4`.
Cercatore: dialog con **44 risultati**, provenienze solo «Temi e atmosfere / Aspetto e movimento /
Intelligenza · Modelli / Laboratorio · Provider · Download · Sistema».

### 6.2 · L'app, vista per vista — MISURATA il 18/09/2026 sul 4174

Metodo: sonda Playwright inline, viewport **1440×900**, `page.route('**/*')` con abort di ogni
non-GET (**la lista dei bloccati è rimasta vuota in 8 esecuzioni**: nessuna scrittura è partita).
Ogni numero da `getBoundingClientRect`/`getComputedStyle`, ogni testo dal DOM vivo.

⛔ **COME SI NAVIGA** (la trappola che ha bruciato i primi giri): le voci della sidebar **non hanno
testo** — `[data-vaia="impostazioni"]` è un `BUTTON.talos-icon-button` con `innerText` **vuoto**.
La sezione si cambia con `window.__talosHarnessUiRuntime.setSettingsSection('<id>', {persist:false})`
(`app.js:4398`). ⛔ Senza `persist:false` **scrive in `localStorage`**, e il cambio sezione **fa
partire richieste GET** per `tools`/`memoria`/`costi`.

#### L'intelaiatura
- `#schermoImpostazioni` → **[276, 0, 1164, 900]**; `.talos-sidebar` **[0,0,276,900]**, fondo `rgb(37,38,42)`.
- Testata: `header.settings-header` **[316,28,1084,64]**, `h1` «Impostazioni» + p «Un posto per
  configurare il tuo modo di lavorare.» + `p.settings-save` «Le preferenze di aspetto si applicano subito.»
- Cercatore: `input#settingsSearch` **[1084,44]**, segnaposto «Cerca per nome, funzione o parola
  chiave…» + `button[data-settings-clear]`. Risultati: `#settingsSearchResults` con «N risultati»,
  percorso + etichetta + aiuto per riga, salto con `data-settings-hit`, Esc svuota.
- Nav: `nav.settings-nav` **[316,182,220,570]**, `role=tablist`, **2 gruppi** «COMPORTAMENTO» (5) e
  «INFRASTRUTTURA» (5), **10 voci** ognuna con **la sua icona** (`#i-image`, `#i-send`, `#i-settings`,
  `#i-brain`, `#i-shield`, `#i-command`, `#i-link`, `#i-bolt`, `#i-folder`, `#i-user`). Frecce/Home/End.
  ⛔ **Piede della nav: NON ESISTE** (0 elementi). ⛔ **Breadcrumb: NON ESISTE** (0 elementi).
- Testata di sezione: `header.settings-section-heading` **[558,182,842,88]** → eyebrow 11px,
  `h2` **32px/600**, sottotitolo 13px, più a destra `span.settings-scope` (il badge di portata).
- Contenuto: `div.settings-content` **[558,182,842,1667]**; pannelli `#setting-panel-<id>`.
- Card: `[842,H] padding 20px 24px radius 14px`; riga `[792,79] grid 455px | 317px`; il controllo
  nativo è **nascosto** e quello visibile è `.calm-select`.

#### Le dieci sezioni — titolo · sottotitolo · badge (eyebrow: solo 2 su 10)
| id | titolo | badge |
|---|---|---|
| appearance | Aspetto e movimento | Questo profilo |
| chat | Chat e composer | Profilo e sessione |
| tools | Strumenti agente e permessi | Sessione e server |
| memoria | Memoria e contesto | Sessione corrente |
| privacy | Sicurezza e privacy | Questo profilo |
| models | Laboratorio modelli | Computer e provider |
| providers | Provider e accessi | Portachiavi e server |
| costi | Costi e consumo | Sessioni registrate |
| workspace | File e workspace | Workspace corrente |
| account | Account, Doctor e backup | Questo computer |

Eyebrow presenti: solo **appearance** («IL TUO SPAZIO») e **models** («INTELLIGENZA, SOTTO
CONTROLLO»); le altre 8 hanno lo span **vuoto e `hidden`**. **41 righe** di preferenza, **14
migrate** nello studio temi (`data-td-migrata="si"`, non disegnate). Aspetto ha 4 blocchi
(design 553px · sfondo 440px · animazioni 292px · desktop).

#### Il Laboratorio (misurato dal vivo)
`[842,1730]` · `data-lab-guscio=v3` · `data-lab-scheda-attiva=**system**` ← ⛔ **si apre su Sistema, non su Hugging Face**.
- Testata della card: **`hidden`, `display:none`**.
- La banda: `[792,136]` · «Modello attivo condiviso con Chat: **Scegli il modello**» + RAM libera
  **12,3 GiB su 31,6 GiB** su un `<progress>` **vivo** (una seconda lettura dava 12,1).
- Il registro: 4 `talos-kv` con badge — Capacità macchina **Misurata** · Accessi server **5 con
  chiave · nessuno ancora provato** · Modelli osservati **Catalogo non caricato** · Runtime locale
  **1 runtime disponibile**.
- Le 4 schede: `models`→**«Hugging Face»**, `providers`→«Provider», `downloads`→«Download», `system`→«Sistema».
- Le **6 sotto-schede** dentro `models`: overview «Panoramica» · providers «Provider» · catalog
  «Catalogo API» · installed «Installati» · huggingface «Hugging Face» · downloads «Download» —
  **non visibili** quando è attiva una scheda esterna diversa da `models`.
- Contenuti: `models` ha il modello installato reale + il catalogo HF con autore/filtri/ordinamento;
  `providers` ha **28 fornitori** e 6908 caratteri; `downloads` ha **3 contatori e nessuna riga**
  (coda vuota); `system` ha RAM/disco/runtime/motore grafico (Vulkan · AMD Radeon RX 9070 XT).

#### La pagina del modello (esiste solo nella lane)
Rotta `#/impostazioni/modelli/scheda/<id>/card|files|compatibility` (`app.js:4142`), su `hashchange`,
`section#paginaModello` **a schermo pieno**. Tre lati, verificati con un id reale: **Scheda Hugging
Face** (README integrale + indice) · **File del modello** (impronta disco ↔ repository, «Coincide
col repository») · **Compatibilità** (verdetto, memoria/disco, contesto).

⛔ **DIFETTO VERO, misurato nel DOM vivo** — nella scheda **Compatibilità**, sotto «Modello servito
dal runtime», escono **`[object Object] · [object Object]`**: due oggetti stampati grezzi invece
del loro contenuto.

**Causa trovata, col `file:riga` e la prova** (non dedotta):
- a valle, `components/scheda-modello.js:994`:
  `const backend = [ispezione.backend, ispezione.build].filter(Boolean).join(' · ');`
- e i due campi **sono oggetti**, per costruzione: `src/local-runtime-probe.mjs:24-26` —
  `observedString(value)` restituisce `fact('observed', value)` oppure `unknown()`, cioè un
  **fatto tipizzato**, non una stringa. `filter(Boolean)` non li scarta (un oggetto è *truthy*) e
  `join` li rende `[object Object]`.
- **il server manda la forma giusta**: la cura è **a valle**, e le righe sorelle della stessa lista
  (`scheda-modello.js:988-991`) lo fanno già bene, perché passano i fatti a `rigaFatto`, che li sa
  leggere. Solo la **994** li concatena a mano.
⇒ Cura: usare lo stesso trattamento delle righe sorelle (estrarre il valore dal fatto, o passarlo
a `rigaFatto`). Da fare nella fase della pagina del modello.

⛔ **TRAPPOLA PER I SELETTORI**: esistono **duplicati legacy ancora nel DOM e nascosti** — 8
`[data-settings-tab]` e 8 pannelli (`#appearanceSettingsCard`, `#settingsChatPanel`, …) che portano
**lo stesso `data-settings-panel`**. Un `querySelector('[data-settings-panel=…]')` ingenuo può
colpire il pannello **legacy**: è stato visto succedere. Ogni selettore va ancorato a `v3`.

### 6.3 · La release pubblica — MISURATA il 18/09/2026

**Riferimento**: `13f65c15cdeaf8986b882993a0773cdeafb867d2` (16/09/2026 18:44), che vale
`refs/pr/public-main` = `refs/remotes/public/main` = `refs/remotes/public/HEAD`. Il codice è
**identico** al tag di release `desktop-v0.1.13` (`a898162f`): fra i due c'è **un solo file**,
`desktop/LEDGER-R02.md`, e solo documentazione. Remoto: `public` = `github.com/Ninozzz95/talos.git`.

**Cosa NON è andato perso** (misurato, non supposto):
- le **10 sezioni** delle Impostazioni, coi loro id, nomi e gruppi: identiche;
- i **40 controlli** coi loro id: identici (la lane ne ha spostati 5 da `appearance` a `chat`);
- le **46 rotte** `/api/v1/*`: identiche, zero mancanti;
- le **6 schede** del laboratorio (`overview`, `providers`, `catalog`, `installed`, `huggingface`,
  `downloads`): tutte presenti, raggruppate dal guscio in 4 visibili;
- il registro dei comandi della lane ha **31 comandi** contro i 15 del pubblico: è un sovrainsieme.

**Cosa è andato perso DAVVERO — e sono due, una voluta e una no:**

1. **L'INTRO / «Primo avvio»** — `components/intro.js` **cancellato** + 324 righe di `app.js` +
   la voce «Ripeti il primo avvio» nelle Impostazioni. **Rimozione VOLUTA** e documentata
   (`app.js:19775-19791`: PO-27 del 17/09, lo stato vuoto onesto al posto della modale a quattro
   passi). `/api/v1/setup/stato` resta, perché la usa `scripts/avvia-talos.mjs:123`.
   ➜ ✅ **DECISO DALL'OWNER, 18/09**: «**quella va mantenuta cancellata**». Nessuna azione.

2. **`shareSession()`** — la condivisione di **sistema** via `navigator.share` (col ripiego sugli
   appunti). Nella lane `navigator.share` **non esiste più**: il comando «Condividi» c'è ancora
   (`services/commands/registry.ts:53`) ma esegue l'**esportazione in file** (`exportSession`,
   `app.js:20783`).
   ➜ ✅ **DECISO DALL'OWNER, 18/09**: «*"Share session" solo se esporta in file fisici. Esportare e
   condividere il link non ha senso perché è un'applicazione locale*». **Misurato**: esporta già
   file fisici — `exportSession()` apre un foglio con due scelte, **Trascrizione leggibile `.md`**
   e **JSON completo `.json`**, e scarica il file (`scaricaTesto`, `app.js:20796`). Quindi il
   **comportamento è confermato e resta**; cambia solo la **parola**: il comando si chiama `share`
   con etichetta «**Prepara una copia da condividere**» (`registry.ts:53`) e la parola
   «condividere» va sostituita con l'esportazione in un file. `navigator.share` **non torna**.

**E una cosa che la lane ha IN PIÙ**: la **pagina del modello** (`scheda-modello.js`,
`pagina-modello.css`) — il pubblico non ce l'ha. È un'aggiunta, non una perdita.

⛔ **Da valutare anche questo, perché è mio lavoro di oggi**: i **titoli `<h3>` di sette pannelli**
delle Impostazioni sono stati tolti (i commit «il titolo di sezione è 32px come il mockup» e «le
introduzioni smettono di ripetere il titolo»). Il nome della sezione **vive solo nella barra
laterale**. Non è una perdita di funzione, ma è una perdita di **parola a schermo** — e va nella
tabella delle decisioni.

## 8 · LE DECISIONI DELL'OWNER — 18/09/2026

> Prese una per una, con la domanda secca. **Queste governano tutte le fasi.**

| # | domanda | ✅ decisione |
|---|---|---|
| 1 | la pagina del modello: 3 lati o 5? | **3, come il mockup** (Scheda HF · File · Compatibilità). ⛔ E l'owner ha corretto me: le «5 tab» che aveva nominato erano del **laboratorio**, non della scheda — ero io ad aver capito male |
| 2 | la colonna destra dell'anteprima in Aspetto | **si aggiunge, col canvas VERO** (lo stesso dello studio temi) |
| 3 | breadcrumb e statusbar | **breadcrumb SÌ, statusbar NO** (il selettore Scenario non ha sorgente) |
| 4 | il raggruppamento di Aspetto | **i 5 gruppi del mockup, con dentro le righe dell'app** |
| 5 | il cercatore | **quello del mockup, in sidebar**, con Ctrl K |
| 6 | le icone della sidebar | ⛔ **restano — e il mockup LE HA**, l'owner ha corretto me. Misurato: `.nav-item .icon{width:17px;height:17px}` con `gap:11px`, **più `.nav-item.active:after` = un punto tondo 5×5 a destra** (`margin-left:auto`) che nessuno aveva visto |
| 7 | i filtri del catalogo | **le faccette del mockup, alimentate coi dati veri** di Hugging Face; ciò che i dati non dicono si nasconde e si elenca |
| 8 | «Aggiungi modello» | **bottone in testata come il mockup**, che apre le due strade vere: importa un `.gguf` dal disco, o cerca nel catalogo |
| 9 | Intro / «Primo avvio» | **resta cancellata** |
| 10 | «Share session» | **solo esportazione in file fisici** (già così); cambia la **parola**, non il comportamento. `navigator.share` non torna |
| 11 | il cancello della ricerca web | **le 7 scritture della corsia 5 sono autorizzate**, una volta |

⛔ **Lezione del 18/09, da non ripetere**: ho scritto che il mockup **non** aveva le icone basandomi
sull'**assenza in un referto** — che non è una misura. L'owner mi ha corretto e il CSS gli dà
ragione. Un'assenza in un referto dice cosa quel referto ha guardato, non cosa esiste.
([[il-banco-non-vede-chi-manca]])

## 7 · IL DELTA (le cose che NON si possono collegare, da dire e nascondere)

> Da riempire con le mappe. Candidati già noti dalla ricognizione del 18/09:
> la stella/«Preferiti» (nessuna rotta) · «Viste salvate» (nessuna rotta) · «Aggiungi modello»
> come rotta · «Simula nuova verifica» · i parametri `parametersB` · GPU/VRAM
> (`/api/v1/model-lab/capacity` non ha nessun campo GPU — misurato) · la galleria immagini del
> README.

### 7.0 · ⛔ UNA CORSA FERMA, E NON PER COLPA SUA — il cancello della ricerca web

> Segnalato dalla corsia 5 il **18/09/2026**, con misure.

`scripts/ricerca-prima-di-scrivere.mjs` legge **`input.transcript_path`**. La ricerca di un
**subagente** vive nel **sidechain** (`…/subagents/agent-<id>.jsonl`: 60 riscontri) e nel
transcript di **sessione** che il cancello legge **non arriva mai** (0 su tutto il file). Quindi il
cancello **nega a un agente che ha già cercato** — esattamente il difetto che il suo stesso header
documenta («un cancello che nega anche a chi ha obbedito insegna solo ad aggirarlo»).

**Misurato**: col file dell'agente il cancello **non negherebbe** (4 ricerche nella sua finestra di
300 righe, verificato chiamando le sue stesse funzioni); col transcript di sessione **nega** —
nella finestra ci sono 16 Bash, 3 Agent, 3 Edit, 1 Write e **zero** WebSearch/WebFetch.

⛔ **E la via di uscita NON esiste**, l'ha chiusa il classificatore: una ricerca fatta dal **padre**
sbloccherebbe la finestra, ma è **tunnel di un blocco attraverso un'altra via** — vietato, e giusto
così. ⇒ **La corsia resta ferma su 7 scritture** (`baseline-shell.spec.mjs`) finché **l'owner non
decide**: autorizzare quelle 7, o far sistemare il cancello. Non si aggira.
Riguarda **tutti** gli agenti delegati, non solo questa corsia.

### 7.2 · IL DELTA — ciò che nel mockup NON ha una sorgente vera

> Criterio dell'owner: «**Quello che non si può collegare assolutamente me lo dici e lo nascondi**».
> Quindi: si **nasconde** dalla vista, e **non** si riempie con una fixture, non si sceglie un
> surrogato, non si mostra a metà.

**A · DA NASCONDERE — non esiste nessuna sorgente, in nessun posto** (14 voci)

| # | elemento del mockup | perché non si collega |
|---|---|---|
| 1 | il **selettore Scenario** nella statusbar (ready/empty/offline/error/denied) | è una simulazione del prototipo: 5 stati finti che cambiano la pagina. Nessuna rotta, nessun campo |
| 2 | la **statusbar** intera | è del prototipo: «Nessuna chiamata reale · dati demo» |
| 3 | il tag **"PROTOTIPO · 04"** | etichetta del prototipo, non del prodotto |
| 4 | il bottone **"Guida al mockup"** | guida del mockup |
| 5 | la frase **«Le voci attenuate sono fuori da questo primo lotto.»** | nel prodotto le voci ci sono tutte: la frase sarebbe falsa |
| 6 | **`span.tab-end` "Dati dimostrativi"** | dichiara il contrario di quello che l'app mostra davvero |
| 7 | **badge "Nessuna chiave reale"** (providers) | **falso**: l'app ha 5 chiavi configurate |
| 8 | **badge "Hardware non rilevato"** (system) | **falso**: l'app l'hardware lo misura |
| 9 | la **stella «Preferiti»** su ogni riga del catalogo | nessuna rotta, nessun campo |
| 10 | **"Viste salvate (0)"** e **"Salva vista"** | nessuna rotta |
| 11 | la **checkbox «confronta»** su ogni riga | nessuna rotta di confronto |
| 12 | **badge "Verificato · demo" / "Locale · demo" / "Pronto · demo" / "Fixture"** | dicono «demo» dove l'app dice la verità |
| 13 | **«Su 15 nel catalogo demo»** e i **15 modelli finti** | l'app ha i suoi modelli, veri |
| 14 | il badge **«Prototipo»** e la didascalia «non collegati a un agente» | note interne del mockup |

**B · DA COLLEGARE ALLA SORGENTE VERA — il disegno si porta, il contenuto diventa quello dell'app**

| elemento del mockup | la sorgente vera nell'app |
|---|---|
| banda **"MODELLO PER LE NUOVE CHAT"** + nome modello + «Le chat già aperte non cambiano.» | `[data-lab-banda]` + `#modelLabActiveModel` (esiste già) |
| **"BUDGET RAM"** 18,6 GiB su 32 GiB | RAM **vera** (12,3 su 31,6) — `data-lab-banda-valore` |
| **"Nessun passaggio automatico al cloud"** | la stessa promessa è già nel prodotto |
| **"Configura"** e **"Verifica accesso"** delle 2 card | i **28 fornitori** veri e le loro modali (`gestisciAzioneProvider`) |
| **"Apri sistema"** | `[data-model-lab-go=system]` |
| **"Simula nuova verifica"** | **"Prova runtime"** vero |
| **"Esplora il catalogo"** (downloads vuoto) | il catalogo HF vero |
| «Memoria di esempio» / «Fixture» / «Non rilevate» nel system | le misure **vere** (RAM, disco, GPU/Radeon) |
| **"40 controlli · 14 temi"** | **veri** (§7.1): si contano dal contratto |
| **"Aggiungi modello"** | il gesto vero c'è ma si chiama **"Importa .gguf"** → ⬅ **decisione** |
| **"Banco prova"** della pagina modello | ⬅ **decisione**: l'app ha «Prova runtime», il mockup descrive una simulazione senza inferenza |
| la **colonna destra dell'anteprima** (300px) | il canvas esiste nello **studio temi**: si porta, ma fuori dallo studio temi non c'è oggi → ⬅ **decisione** |

**C · I TRE DUBBI CHE NON DECIDO IO** → sono nelle domande all'owner
1. la pagina del modello: **il mockup ha 3 lati**, l'owner ne ha nominati **5** (Scheda · Provider ·
   Accesso · Identità · Compatibilità). Nell'app oggi ce ne sono **3**.
2. i filtri del catalogo: il mockup ha **12 gruppi di faccette**; l'app ha autore/filtri/ordinamento
   con **9 ordinamenti** diversi. Quale dei due insiemi governa?
3. la striscia di **icone nelle voci della sidebar**: l'app le ha già (messe oggi), il mockup **non
   le ha** — la voce del mockup è solo testo. ⬅ va confermato che restano.

### 7.1 · I due numeri del mockup — MISURATI il 18/09/2026, e sono VERI

Il mockup dichiara, nel suo pannello di aiuto: «**Tutti i 14 temi e i 40 controlli attuali**,
scena dal vivo, accessibilità e ripristino selettivo». Non è una promessa da inventare: si è
contato.

| numero | dove si è contato | esito |
|---|---|---|
| **14 temi** | `src/components/impostazioni-campi.js`, campo `themePresetSelect`, le sue `opzioni` | **14** — forge · paper · terminal · aurora · glacier · ember · atlas · noir · signal · violet · claudius · basicus · telemetry · calm |
| **40 controlli** | stesso file, le voci del contratto `CAMPI_IMPOSTAZIONI` | **40** — 34 in `appearance`, 6 in `chat` |

⇒ **Nessuna decisione da chiedere**: il testo del mockup si riproduce **così com'è**, perché è
vero. E il numero non si scrive a mano: si **conta** dal contratto, così se un giorno diventa 41
il badge lo dice da solo.
