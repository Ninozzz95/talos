# «Temi e atmosfere» — dal mockup alla app vera

**12/09/2026 · lane `lane/harness-desktop` · Opus 5 (effort high)**
Foto e misure grezze: `.claude/foto-temi-atmosfere-2026-09-12/` (55 PNG + `temi.json`, `misure-3.json`, `vera.json`).

---

## 0. Le tre domande dell'owner, e cosa hanno cambiato

| # | Parole dell'owner | Cosa c'era | Cosa c'è ora |
|---|---|---|---|
| 1 | «il pannello Temi e atmosfere del mockup lo prevediamo? Implementarlo in modo coerente» | portato l'11/09 (lotto F), **mai confrontato col mockup** né provato sui 14 temi | confronto testa a testa fatto, 14 temi provati uno per uno in chiaro e scuro |
| 2 | «ok ma **l'anteprima non è dal vivo** come sul mockup» (foto con Paper) | un segnaposto di tre `<span>` — un pallino e tre barre — su fondo **scuro anche con un tema chiaro** | la **scena Canvas vera** del pacchetto (14 scene, `src/motion/desktop-scenes.js`) in movimento, più una mini-conversazione coi token del tema |
| 3 | «vorrei anche i diversi slider TUTTI nella modale», poi «gli slider **relativi dell'animazione e del tema**, ovviamente» | 14 preferenze sparse fra due gruppi delle Impostazioni | le stesse 14 vivono **solo** nello studio; nelle Impostazioni resta **un rimando** |

---

## 1. Cosa vuole il mockup — righe lette, non ricordate

`.claude/refactor-ui-owner-2026-09-11/Talos_Desktop_Final_Mockup_Interattivo.html`

| Riga | Cosa dice |
|---|---|
| 6263-6277 | `atelierThemes`: per ogni tema **nome, fondo, accento** (*una quindicesima tavolozza*) + **scena, materiale, testo** (prosa) |
| 6312 | `themeChooser()`: il markup — `.td-theme-studio` = elenco `role="radiogroup"` + scheda con titolo, descrizione, `#td-theme-preview`, segmento Scuro/Chiaro, cursore Intensità, «Ferma anteprima», tre dati, nota, `<details>`, tre azioni |
| 6312 (coda) | `TalosAmbient.create($('#td-theme-preview'), {preview:true})` — **l'anteprima è una scena Canvas viva** |
| 6313 | `syncThemeChooser()`: «Accento applicato» = `channelColor('--talos-accent')`, cioè il token **risolto**; «Raggio» = `--talos-radius-card` calcolato; roving tabindex + spunta |
| 6315 | il gestore `data-art`: `theme` → `setAppearance('setting-themePresetSelect', …)` → **la app intera cambia sotto la modale** |
| 6317 | frecce/Home/End dentro il radiogroup |
| 6319 | `initAtelier()`: il pulsante «Esplora le 14 atmosfere» **sotto la riga «Tema TALOS»** delle Impostazioni |
| 4340-4381, 4376-4381 | le misure: modale `min(1120px, 100vw-40px)`, colonne `228px minmax(0,1fr)` con `gap:28`, voce `min-height:43`, pallino 22 px, titolo `550 27px/1.3` a `-.04em`, riquadro `clamp(210px,32vh,355px)`, didascalia `bottom:14px` |

---

## 2. Confronto testa a testa — stessa vista, stesso tema, stessa larghezza

Foto affiancate: `app-1440-{dark,light}-{calm,paper}.png` ↔ `mockup-1440-…`, idem a 1024.
Misure lette dal DOM di entrambe le pagine (`misure-3.json`), 8 combinazioni:

| Misura | Mockup | App | Esito |
|---|---|---|---|
| larghezza modale @1440 | 1120 px | **1120 px** | uguale |
| larghezza modale @1024 | 984 px | **984 px** | uguale |
| colonne @1440 | `228px 814px` | **`228px 814px`** | uguale |
| colonne @1024 | `185px 731px` | **`185px 731px`** | uguale |
| altezza anteprima | 288 px | **288 px** | uguale |
| anteprima viva | canvas animato | **canvas animato**, `data-scene-status="animating"` | uguale |
| cursori nella modale | 1 (Intensità) | **8** | ordine (3) dell'owner |

### Le differenze, una per una

| # | Differenza | Perché |
|---|---|---|
| D1 | **Ordine dell'elenco**: mockup Calm→Forge→…; app Forge→…→Calm | *dato vero che il mockup non ha*: l'ordine è quello del **contratto dei controlli** (`themePresetSelect`) e di `TALOS_THEME_IDS` in `legacy/app.js`. Riordinare qui vorrebbe dire che il `<select>` e lo studio elencano gli stessi 14 temi in ordini diversi |
| D2 | **Tre modi colore** (Sistema/Chiaro/Scuro) invece di due | *dato vero*: la app ha `colorMode: system` come default. Togliere «Sistema» vorrebbe dire che aprire lo studio spegne per sempre il rispetto della preferenza di sistema senza averlo chiesto |
| D3 | **Otto cursori + scena + modo di disegno + qualità + interruttore** invece del solo cursore Intensità | **ordine dell'owner del 12/09** (punto 3) |
| D4 | **Mini-conversazione** dentro l'anteprima (bolle, testo, pulsante d'invio) | *scelta motivata*: il mockup mostra la sola scena e accanto offre «Prova nella chat vuota», che porta a una schermata dimostrativa. Qui quella schermata **non esiste** (la Chat è quella vera, con le sessioni dell'owner). La domanda a cui quel pulsante rispondeva trova risposta dentro il riquadro, e usa **solo token** — nessun colore scritto |
| D5 | Manca «Prova nella chat vuota» | stessa ragione di D4 |
| D6 | «Sfondo Chat: attivo» non è un pulsante ma un **interruttore** nel gruppo | è una preferenza con due stati, non un'azione: l'interruttore lo dice, il pulsante no |
| D7 | **24 px** fra descrizione e anteprima invece di 17 | *difetto corretto*: la mensola appiccicosa deve coprire i 24 px di margine della modale, o il testo che scorre affiora sopra il riquadro. Sette pixel dichiarati contro un testo tagliato |
| D8 | «Ripristina i valori del movimento» (di gruppo) e non per singolo cursore | i valori di serie vivono in `DESKTOP_APPEARANCE_DEFAULTS` dentro `legacy/app.js`, che **non li esporta**. Riscriverli qui sarebbe la quindicesima tavolozza con i numeri al posto dei colori ⇒ si preme il pulsante della app (`#resetMotionButton`), l'unico posto dove quei valori sono scritti |
| D9 | Etichette riscritte nel pannello: «Sfondo attivo»→**«Attivo dietro la chat»**, «Sfondo animato»→**«Scena»**, «Renderer»→**«Modo di disegno»** | *difetto visto nella prima foto*: due righe a dieci centimetri l'una dall'altra dicevano «attivo» e «animato» sotto un titolo che diceva già «Sfondo animato»; e «Renderer» è un nome tecnico a schermo (regola owner 04/09). **Cambia solo l'etichetta visibile**: id, chiave salvata e titolo nelle Impostazioni restano quelli del contratto |

### Cosa è stato riportato al mockup (era diverso e non doveva esserlo)

| Cosa | Prima (11/09) | Ora |
|---|---|---|
| Didascalia | **fuori** dal riquadro, sotto | **dentro**, `bottom:14px`, con le pastiglie `--talos-background` — come il mockup (regola 4351) |
| Fondo del riquadro | `--preview-bg` calcolato dal seme | `var(--talos-background)`: il colore che la app **sta usando**, non una nostra derivazione del seme (regola 4349) |
| «Accento applicato» | il **seme** dichiarato da `temi.css` | il token **risolto** dalla radice, come `channelColor` del mockup: `rgb(192, 139, 60)` |
| «Raggio delle schede» | il seme | il valore **calcolato** sulla radice |
| Primo campo dei tre | «Accento» | «**Materiale**» (Grafite / bronzo…) — è il campo del mockup |
| `<details>` «Porting, qualità e accessibilità» | assente | presente, coi fatti di questa app |
| Altezza riquadro | `clamp(160px,22dvh,250px)` | `clamp(210px,32vh,355px)` (mockup 4376) |
| Elenco a 760 px | non rientrava | tre colonne, `max-height:165px`, spunta nascosta (mockup 4372) |

---

## 3. Le cure, file per file

### `src/components/theme-studio.js` — riscritto (309 → 1.028 righe)

| Riga | Cosa |
|---|---|
| 1-91 | testata: i tre ordini, perché il tema si applica alla **radice** (`temi.css` dichiara `:root[...]`: un `data-talos-theme` su un `<div>` non accende niente, e per dipingere il solo riquadro servirebbe ricopiare la tavolozza), le tre fonti web con data |
| 153-168 | `DESCRIZIONI_TEMI`: **solo prosa** (scena, materiale, testo) dal mockup. Un test verifica che non contenga nemmeno un `#rrggbb` |
| 170-181 | `descrizioneTema(id, seme)`: un tema senza prosa riceve una scheda **onesta**, non tre vuoti |
| 192-205 | `CONTROLLI_MIGRATI` (14) e `CURSORI_SCENA` (8) |
| 216-239 | `TITOLI_STUDIO` / `titoloStudio()` — D9 |
| 250-254 | `valoreAspetto()`: lo studio non tiene una seconda copia dello stato |
| 274-279 | `scenaPerAspetto()`: stessa regola di `currentConfig()` del pacchetto |
| 285-325 | `RUOLI_PALETTE` e `PARAMETRI_SCENA` + `parametriScena()`: i parametri si leggono da `--talos-motion-*` **come il renderer**, non dai cursori |
| 330-346 | `statoAnteprima()` / `TESTO_STATO`: cinque stati, in italiano |
| 349-365 | `caricaScene()`: `import()` pigro di `desktop-scenes.js` — in Node fallisce **in silenzio** e lo studio resta utile |
| 382-430 | `risolviColore()` + `normalizzaColore()` |
| 440-619 | `creaAnteprimaScena()`: il runtime locale — 30 fps, DPR ≤ 1,5, `visibilitychange`, `ResizeObserver`, `impostaScene()`, `ferma()` |
| 622-649 | `miniConversazione()`: `inert` + `aria-hidden` — è una figura, non un'interfaccia |
| 651-979 | `apriStudioTemi()`: elenco, mensola appiccicosa, controlli, gruppi, dettagli, note, azioni, `MutationObserver` sulla radice |
| 981 | `migraRigheImpostazioni()` |
| 1001 | `montaScorciatoiaTemi()`: ora costruisce **la scheda di rimando** |

**Quattro difetti trovati dalle foto e dalle misure, non leggendo il codice:**

1. **L'anteprima restava «Scena non disponibile» per sempre.** `creaAnteprimaScena` riceveva le scene solo alla creazione, e la creazione avviene **prima** che `import()` finisca. Cura: `impostaScene(mappa)`.
2. **«Accento applicato» scriveva una formula.** In modo chiaro dieci temi su quattordici derivano l'accento con `color-mix()`: `getPropertyValue` restituisce il token com'è scritto. Visibile solo nella tabella dei 14 — in scuro la stessa riga era giusta. Cura: sonda + canvas 1×1 → `rgb(r, g, b)`.
3. **Il titolo del gruppo scorreva tagliato sotto l'anteprima appiccicosa.** Cura: mensola opaca del colore della modale.
4. **La mensola copriva l'ultima riga della descrizione** (D7). Cura: tolto il margine negativo.

### `src/styles/mockup-td.css` — sezione 8 rifatta (36 → 99 righe, il foglio passa da 637 a 709)
Misure del mockup riga per riga; `.td-preview-canvas`, `.td-mini*`, `.td-studio-gruppo/righe/riga/cursore`, `.td-theme-mensola`, `.td-studio-rimando`, `.talos-setting[data-td-migrata="si"]{display:none}`; regole strette a 760 px.

### `lab/main.js` — la regia dell'aspetto nel laboratorio
`dipingiAspettoLaboratorio()` + `montaAspettoLaboratorio()`: gli stessi attributi che `applicaAspettoDesktop` stampa sulla radice. **Nessun colore**: i colori li dà `temi.css`. Senza questo, nel laboratorio ogni foto usciva «Calm».

### `tests/parity/impostazioni-vivo.spec.mjs` — aggiornato, col perché nel file
* `SET-COPERTURA38`: le 38 righe ci sono ancora e 14 portano `data-td-migrata="si"`; le 24 rimaste si toccano in Impostazioni, **le 14 migrate si toccano nello studio** e si verifica che il controllo **vero** abbia ricevuto il valore.
* `SET-RICERCA`: cercava «bilanciata» → «Qualità», che ora sta nello studio; cerca «elastica» → «Curva», che è rimasta lì. Una sola riga come prima.
* `SET-MOVIMENTO`: tema e «Velocità» si regolano nello studio; la verifica resta su `#themePresetSelect` e `#motionSpeedRange`, cioè dove la preferenza **vive**.

### Diff per `legacy/app.js`: **nessuno**
Non è servito. `montaScorciatoiaTemi($('#schermoImpostazioni'))` è già chiamata dopo ogni `montaImpostazioni` (righe 4141, 4171, 4323) e da lì parte anche la migrazione delle righe. Le 14 preferenze continuano a passare per `appearanceControlMap` → `aggiornaAspettoDesktop` → `talos.harness.desktop.settings.v1`: **nessuna chiave nuova, nessun secondo storage**.

---

## 4. I quattordici temi — provati uno per uno

`temi.json`, 28 righe (14 temi × chiaro/scuro), foto `tema-{dark,light}-<id>.png`. Per ognuna si legge: `data-talos-theme` sulla radice, `data-talos-scene`, il seme di `temi.css`, l'accento **applicato**, il raggio, lo stato del canvas e **quanti pixel il canvas ha davvero dipinto**.

| tema | scena | accento applicato (scuro / chiaro) | raggio | pixel dipinti |
|---|---|---|---|---|
| forge | forge | `rgb(201,139,50)` / `rgb(112,81,36)` | 14px | 17,1 % |
| paper | paper | `rgb(169,102,23)` / `rgb(97,64,24)` | 10px | 69,0 % |
| terminal | terminal | `rgb(99,240,142)` / `rgb(65,127,79)` | 6px | 57,3 % |
| aurora | aurora | `rgb(66,231,199)` / `rgb(50,123,105)` | 16px | 57,5 % |
| glacier | glacier | `rgb(35,103,209)` / `rgb(36,64,110)` | 14px | 43,9 % |
| ember | ember | `rgb(255,92,98)` / `rgb(137,59,59)` | 14px | 65,6 % |
| atlas | atlas | `rgb(212,154,82)` / `rgb(117,88,51)` | 12px | 10,0 % |
| noir | noir | `rgb(242,242,242)` / `rgb(131,128,125)` | 4px | 81,6 % |
| signal | signal | `rgb(255,111,97)` / `rgb(137,68,58)` | 10px | 6,8 % |
| violet | violet | `rgb(183,148,246)` / `rgb(104,85,127)` | 18px | 17,3 % |
| claudius | claudius | `rgb(217,119,87)` / `rgb(119,71,54)` | 12px | 58,0 % |
| basicus | basicus | `rgb(25,118,210)` / `rgb(31,71,110)` | 8px | 50,2 % |
| telemetry | telemetry | `rgb(106,212,212)` / `rgb(68,114,111)` | 10px | 6,4 % |
| calm | calm | `rgb(192,139,60)` / `rgb(155,104,35)` | 12px | 71,6 % |

**28 righe su 28 in regola**: tema applicato alla radice, scena del tema, `animating`, accento risolto. I pixel dipinti vanno dal 6,4 % (telemetry, strumenti sottili) all'81,6 % (noir, lamelle piene): **sono scene diverse, non la stessa disegnata quattordici volte**.

---

## 5. Prove al contrario (quelle che devono FALLIRE)

| Prova | Atteso | Misurato |
|---|---|---|
| `prefers-reduced-motion: reduce` | anteprima **ferma ma a colori**, non vuota | `sceneStatus="reduced"`, **154.000 pixel dipinti su 234.432 (65,7 %)**, didascalia «Movimento ridotto», «Ferma anteprima» disabilitato, **due impronte a 1,2 s di distanza identiche** |
| Escape | modale chiusa, fuoco **a chi ha aperto** | modale via, fuoco su «Apri Temi e atmosfere», in chiaro e scuro |
| preset inesistente sulla radice | si ricade su `calm`, **niente errori** | `scena="calm"`, modale viva, 0 errori |
| pacchetto scene assente (Node) | Map vuota, studio utile lo stesso | `caricaScene()` → `Map(0)`, nessuna eccezione |
| controllo assente | `valoreAspetto` → `null`, non `false` | ✔ |
| righe non migrate | **non** marcate | `uiDensitySelect`, `chatFontScaleSelect` intatte |
| prosa dei temi | **nessun colore** | nessun `#rrggbb` in `DESCRIZIONI_TEMI` |

---

## 6. Cancelli

| Cancello | Esito |
|---|---|
| `npm run test:unit` | **930 / 930** (erano 920; 10 nuovi, tutti nei due versi) |
| `npm run test:componenti` (build + banco 4187/4186, 3 viewport) | **147 / 147**, incluso `RUNTIME-01: aprire la app non produce nessun errore JavaScript` e `COMP SettingRow` |
| Giro dal vivo sulla **app vera** (build di adesso, banco **4188** mio, solo GET) | 0 errori JS, 0 richieste non-GET, chiaro **e** scuro |

### Il giro dal vivo, in dettaglio (`vera.json`)
* rimando presente e visibile, **14 righe migrate**;
* scelto «Aurora» **dallo studio** → radice `data-talos-theme=aurora`, `#themePresetSelect` = `aurora`, `localStorage.appearance.themePreset` = `aurora`, anteprima `animating` sulla scena `aurora`;
* trascinato «Intensità» a fondo corsa **dallo studio** → widget 100, `#motionIntensityRange` 100, token `--talos-motion-intensity` = `1`, salvato 100;
* **ricaricata la pagina**: tema `aurora`, intensità `100`. La preferenza sopravvive, e passa sempre dai controlli veri.

---

## 7. Cosa NON ho verificato

1. **Il 4174 dell'owner.** Serve `harness-ui/public/`, che non contiene questo codice finché qualcuno non lo ripubblica. Tutto il visto qui è sul laboratorio (5313) e sulla app vera ricostruita su un banco mio (4188). ⇒ **il giro sul 4174 va rifatto dopo la pubblicazione**.
2. **`playwright.astra.config.mjs` / `impostazioni-vivo.spec.mjs`**: il file l'ho **aggiornato** ma **non eseguito** — quella suite vuole il monolite originale sulla 4179, che non ho. È l'unico pezzo di questo lotto che resta «modificato, non provato».
3. **Costo per fotogramma dell'anteprima**: dichiarati i tetti (30 fps, DPR ≤ 1,5, un canvas, fermo se nascosto, distrutto alla chiusura) ma **non misurato** un p95 in ms. La regola «GPU spenta nel browser» del 02/09 dice che una misura headless non parla del desktop vero ⇒ non l'ho fatta invece di darne una falsa.
4. **La ricerca delle Impostazioni conta ancora le 14 migrate.** `filtraImpostazioni` legge il contratto, non il DOM: cercare «intensità» dice «Preferenze trovate: 1» e la riga resta nascosta. Tampone: la scheda di rimando le nomina tutte e quattordici a schermo. **Debito registrato**, non chiuso.
5. **Mini-conversazione**: testo fisso in italiano. Non passa da `lingua.js`, come il resto delle stringhe dello studio. Debito noto, uguale a quello del resto del pannello.
6. Nel laboratorio le righe «Densità delle liste» e «Lingua dei menu» hanno un `<select>` vuoto (`impostazioni-dark.png`): è **pre-esistente** e riguarda la fixture del laboratorio, non questo lotto.

---

## ⛔ Riepilogo veloce

**Cosa devi fare tu**
1. Guardare due foto e dire sì/no: `foto-temi-atmosfere-2026-09-12/vera-studio-dark.png` e `vera-studio-light.png` (la app **vera**, tema Aurora, anteprima viva).
2. Decidere su D1: l'elenco dei temi resta nell'ordine del contratto (Calm ultimo) o va messo **Calm per primo** come nel mockup?
3. Decidere sul debito 4: la ricerca delle Impostazioni deve poter portare allo studio, o basta la scheda di rimando?

**Cosa faccio io**
Niente di aperto: lotto chiuso, cancelli verdi, foto in cartella. Se dai il via alla pubblicazione, rifaccio il giro sul 4174 e riscatto le due foto lì.

**Cosa rimane**
`impostazioni-vivo.spec.mjs` aggiornato ma **non eseguito** (serve la 4179) · costo per fotogramma dell'anteprima **non misurato** · la ricerca delle Impostazioni conta 14 preferenze che non disegna più · le stringhe dello studio non passano da `lingua.js`.
