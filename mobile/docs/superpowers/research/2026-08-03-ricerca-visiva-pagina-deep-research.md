# Ricerca visiva — pagina di una ricerca approfondita durante il lavoro e a rapporto finito

**Prodotto:** TALOS — Android, Capacitor 8 + Vue 3 in WebView, telefono e tablet  
**Data della ricognizione:** 3 agosto 2026  
**Tipo di consegna:** galleria comparativa con immagini reali o link diretti; nessuna immagine generata.

> **Avvertenza importante.** Questa non è una raccolta di mockup da copiare. Le schermate servono a isolare la grammatica dei lavori lunghi: cosa resta stabile, cosa cambia, cosa si può aprire, dove vive l’errore e come il processo diventa documento. TALOS ha un requisito più forte dei prodotti osservati: conserva passaggi letterali, lega ogni affermazione alle fonti, usa un giudice diverso dall’autore e consente la ri-verifica mesi dopo.

## Legenda e qualità dell’evidenza

- `[IMG]`: immagine aperta e letta direttamente durante la ricognizione.
- `[IMG-LINK]`: immagine reale con URL diretto, ma il CDN ha impedito al crawler di decodificarla; la lettura è limitata agli elementi verificabili nella pagina e nella didascalia. Non vengono inventati dettagli minuti.
- `[NO-IMG]`: non è stata trovata una prova visiva utilizzabile per quella situazione.
- `[UI-REALE]`: schermata di un uso reale, recensione o forum.
- `[UI-UFFICIALE]`: schermata pubblicata dal produttore; utile per l’interfaccia, meno probante sui casi imperfetti.
- `[PROXY]`: schermata reale del prodotto, ma non specifica della funzione Research; usata solo per studiare la grammatica dell’errore.

Le immagini più vecchie del 2025 sono segnalate. Sono incluse soltanto quando il comportamento è ancora confermato dalla documentazione corrente, oppure quando costituiscono l’unica prova visiva pubblica di un passaggio.

## Inventario rapido

| Prodotto | S1 piano | S2 fotogramma zero | S3 avanzamento | S4 attesa lunga | S5 fermo/errore | S6 rapporto | S7 fonte | S8 azioni |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| ChatGPT | immagini parziali | `[NO-IMG]` | sì | parziale | `[NO-IMG]` | sì | sì | sì |
| Gemini | sì, telefono e desktop | `[NO-IMG]` | `[NO-IMG]` verificato | `[NO-IMG]` | `[NO-IMG]` | sì | parziale | sì |
| Claude | nessun piano esplicito | `[NO-IMG]` | link reale | `[NO-IMG]` | proxy reale | sì | parziale | `[NO-IMG]` |
| Perplexity | chiarimenti documentati, non fotografati | `[NO-IMG]` | sì | sì | `[NO-IMG]` | sì | sì | export documentato, pulsante non trovato |
| Grok | nessun piano trovato | `[NO-IMG]` | sì | sì | `[NO-IMG]` | sì | pannello pensieri/fonti | `[NO-IMG]` |
| Fuori settore | preflight installer | n/a | CI, download, backup, render | sì | CI/errori | stato finale | log/dettaglio | pausa, ripresa, salta |

---

# 1. Galleria per situazione

## S1 — Prima di partire: piano, perimetro e costo

### ChatGPT-S1-A — Selezione visibile della modalità Deep Research

**Tipo:** `[IMG] [UI-UFFICIALE]` — pagina funzione OpenAI, acquisita nel 2026.  
**Fonte pagina:** <https://chatgpt.com/it-IT/features/deep-research/>  
**Immagine diretta:** <https://images.ctfassets.net/8su2tbn87fck/1TdrMm8Ig4qDcpbs27pwgw/0b49e57673af06ed036c27c313461319/1.png?fm=webp&q=90>

![ChatGPT-S1-A — selezione Deep Research](https://images.ctfassets.net/8su2tbn87fck/1TdrMm8Ig4qDcpbs27pwgw/0b49e57673af06ed036c27c313461319/1.png?fm=webp&q=90)

1. **Parte alta:** il menu strumenti, non il contenuto della ricerca; l’occhio prende subito l’elenco di capacità.
2. **Indicatore:** nessuno; è una scelta di modalità precedente al lavoro.
3. **Densità:** 6 voci, 6 icone, un solo livello di navigazione secondaria su “More”.
4. **Tipografia:** 2 livelli evidenti: voci principali e stato evidenziato.
5. **Colore:** un accento azzurro tenue speso sul fondo della voce selezionata; il resto è neutro.
6. **Movimento:** il fotogramma è statico; l’unico movimento implicito è hover/selezione.
7. **Assenza notevole:** non compaiono durata, costo, numero di passi o conseguenze economiche.

**Lettura per TALOS:** l’azione è scopribile e non dipende da un gesto nascosto, ma non risolve il vero preflight: che cosa verrà fatto e quanto costerà.

### ChatGPT-S1-B — Prompt con Research e Sources esplicitamente attivi

**Tipo:** `[IMG] [UI-UFFICIALE]` — 2026.  
**Fonte:** <https://chatgpt.com/it-IT/features/deep-research/>  
**Immagine:** <https://images.ctfassets.net/8su2tbn87fck/74fJue4aKD0lkp05Sb8L13/4878661dcea8d7227351b3c2710552c2/6.png?fm=webp&q=90>

![ChatGPT-S1-B — prompt con Research e Sources](https://images.ctfassets.net/8su2tbn87fck/74fJue4aKD0lkp05Sb8L13/4878661dcea8d7227351b3c2710552c2/6.png?fm=webp&q=90)

1. **Parte alta:** il testo dell’incarico, in un’unica grande superficie bianca.
2. **Indicatore:** nessuno; lo stato è espresso da due chip, “Research” e “Sources”.
3. **Densità:** 1 incarico, 2 modalità/fonti, 4 controlli periferici.
4. **Tipografia:** 2 livelli; testo del prompt dominante, etichette dei chip secondarie.
5. **Colore:** azzurro solo per Research; Sources resta neutro.
6. **Movimento:** nessuno nel fotogramma.
7. **Assenza notevole:** non si vede il piano che la documentazione corrente dice essere rivedibile prima dell’avvio.

**Lettura per TALOS:** il contesto operativo è leggibile già nel composer. Il costo stimato di TALOS dovrebbe apparire nello stesso momento, non in un passaggio successivo invisibile.

### ChatGPT-S1-C — Domande di chiarimento prima della ricerca

**Tipo:** `[IMG-LINK] [UI-REALE]` — Business Insider, 6 marzo 2025.  
**Pagina:** <https://www.businessinsider.com/openai-chatgpt-deep-research-reports-worth-extra-wait-time-2025-3>  
**Immagine:** <https://i.insider.com/67c8a6a1b8b41a9673f9c6dd?auto=webp&format=jpeg&width=600>

![ChatGPT-S1-C — chiarimenti prima del lavoro](https://i.insider.com/67c8a6a1b8b41a9673f9c6dd?auto=webp&format=jpeg&width=600)

1. **Parte alta:** la richiesta originale e la risposta di chiarimento.
2. **Indicatore:** nessuno; il prodotto non finge che il lavoro sia già iniziato.
3. **Densità:** un turno utente e un blocco di domande; il valore è semantico, non metrico.
4. **Tipografia:** gerarchia da conversazione, con domanda e opzioni subordinate.
5. **Colore:** accento minimo; prevale il testo.
6. **Movimento:** nessuno.
7. **Assenza notevole:** nessun prezzo o budget visibile.

**Lettura per TALOS:** il chiarimento è parte del piano, non uno stato di avanzamento. Va chiuso prima che una chiamata pagata parta.

### Gemini-S1-A — Piano su telefono con modifica e avvio separati

**Tipo:** `[IMG] [UI-REALE]` — 9to5Google, 4 febbraio 2025, app Android.  
**Pagina:** <https://9to5google.com/2025/02/04/gemini-deep-research-android/>  
**Immagine:** <https://i0.wp.com/9to5google.com/wp-content/uploads/sites/4/2025/02/Gemini-Deep-Research-Android-3.jpg?ssl=1>

![Gemini-S1-A — piano mobile](https://i0.wp.com/9to5google.com/wp-content/uploads/sites/4/2025/02/Gemini-Deep-Research-Android-3.jpg?ssl=1)

1. **Parte alta:** titolo della ricerca e prompt originale; il piano arriva subito sotto.
2. **Indicatore:** lista di fasi, non barra: Research Websites → Analyze Results → Create Report.
3. **Densità:** 7 blocchi informativi distinti; circa 21 righe testuali visibili nella porzione utile del telefono.
4. **Tipografia:** 4 livelli: titolo pagina, titolo piano, nomi delle fasi, dettagli e tempo.
5. **Colore:** un solo accento azzurro sui comandi e rosa sull’icona Gemini.
6. **Movimento:** il piano è statico; “More” espande il primo passo.
7. **Assenza notevole:** “Ready in a few mins” non è una stima numerica verificabile e non compare un costo.

**Lettura per TALOS:** è il riferimento più vicino al bisogno. I due pulsanti separano chiaramente modifica e spesa. La lista, però, comprime più sotto-passi in tre etichette generiche.

### Gemini-S1-B — Piano desktop a larghezza ampia

**Tipo:** `[IMG] [UI-REALE]` — Android Authority, 13 dicembre 2024. **Pre-2025**, incluso perché il pattern piano/modifica/avvio è confermato dalla guida Gemini corrente e dalla schermata Android 2025.  
**Pagina:** <https://www.androidauthority.com/hands-on-gemini-deep-research-3508607/>  
**Immagine:** <https://www.androidauthority.com/wp-content/uploads/2024/12/Gemini-Deep-Reserach-plan.png>

![Gemini-S1-B — piano desktop](https://www.androidauthority.com/wp-content/uploads/2024/12/Gemini-Deep-Reserach-plan.png)

1. **Parte alta:** frase di orientamento “Here’s my plan…” e card del piano.
2. **Indicatore:** tre fasi verticali con icone; nessuna percentuale.
3. **Densità:** 6 sotto-obiettivi leggibili nel primo passo più 2 fasi sintetiche; 18–20 righe di contenuto senza scorrere.
4. **Tipografia:** 4 livelli ben distinti.
5. **Colore:** azzurro solo sul CTA primario; il resto è bianco/grigio.
6. **Movimento:** espansione del dettaglio possibile, ma non mostrata.
7. **Assenza notevole:** nessuna rappresentazione del costo marginale dei singoli rami.

**Lettura per TALOS:** sul tablet una card simile può stare nel pannello destro; sul telefono la stessa quantità di testo richiede collasso per rami.

### Gemini-S1-C — Scelta del modello su Android

**Tipo:** `[IMG] [UI-REALE]` — 9to5Google, 4 febbraio 2025.  
**Immagine:** <https://i0.wp.com/9to5google.com/wp-content/uploads/sites/4/2025/02/Gemini-Deep-Research-Android-1.jpg?ssl=1>

![Gemini-S1-C — selezione modello mobile](https://i0.wp.com/9to5google.com/wp-content/uploads/sites/4/2025/02/Gemini-Deep-Research-Android-1.jpg?ssl=1)

1. **Parte alta:** nome del modello attivo; il foglio inferiore domina il resto.
2. **Indicatore:** check circolare sulla scelta, non avanzamento.
3. **Densità:** 5 modelli con una riga descrittiva ciascuno.
4. **Tipografia:** 3 livelli: famiglia, modello, descrizione.
5. **Colore:** gradiente del marchio e check bianco; pochissimi accenti.
6. **Movimento:** bottom sheet che entra dal basso.
7. **Assenza notevole:** l’utente sceglie una capacità ma non vede il costo previsto della ricerca concreta.

### Claude-S1 — Nessun piano pre-avvio fotografato

`[NO-IMG]` Non è stata trovata una schermata recente e verificabile in cui Claude mostri un piano modificabile prima di avviare Research. La guida Claude del 2 giugno 2026 documenta l’attivazione tramite `+` → `Research`, poi l’avvio diretto della ricerca: <https://support.claude.com/en/articles/11088861-use-research-on-claude>.

### Perplexity-S1 — Chiarimenti documentati, immagine non trovata

`[NO-IMG]` La guida Advanced Deep Research aggiornata il 16 luglio 2026 dice che il sistema pone domande di chiarimento prima di partire, ma non pubblica una schermata leggibile del passaggio: <https://www.perplexity.ai/help-center/en/articles/13600190-what-s-new-in-advanced-deep-research>.

### Grok-S1-A — Comandi DeepSearch e Think nell’interfaccia

**Tipo:** `[IMG-LINK] [UI-REALE]` — Punto Informatico, 20 febbraio 2025.  
**Pagina:** <https://www.punto-informatico.it/grok-3-beta-italia-deepsearch-think/>  
**Immagine:** <https://www.punto-informatico.it/app/uploads/2025/02/Grok-3-beta-DeepSearch-Think.jpg>

![Grok-S1-A — selezione DeepSearch e Think](https://www.punto-informatico.it/app/uploads/2025/02/Grok-3-beta-DeepSearch-Think.jpg)

1. **Parte alta:** interfaccia del chatbot e accesso alle modalità.
2. **Indicatore:** nessuno; modalità attivabili.
3. **Densità:** la pagina sorgente conferma DeepSearch, Think e cronologia; il dettaglio minuto non è stato decodificato dal crawler.
4. **Tipografia:** lettura non affidabile oltre le etichette nominate dalla fonte.
5. **Colore:** non quantificato per evitare una deduzione non verificata.
6. **Movimento:** apertura del pannello laterale Storia descritta dalla fonte.
7. **Assenza notevole:** nessuna prova di piano modificabile, tempo o costo prima dell’avvio.

---

## S2 — Il primo istante dopo l’avvio

### Esito della ricerca visiva

Per nessuno dei cinque prodotti IA è stata trovata una cattura affidabile dei **primi 500 ms dopo il tap su Avvia**. Le recensioni saltano dal piano a uno stato già popolato; i video marketing tagliano la transizione. Quindi:

- ChatGPT-S2: `[NO-IMG]`
- Gemini-S2: `[NO-IMG]`
- Claude-S2: `[NO-IMG]`
- Perplexity-S2: `[NO-IMG]`
- Grok-S2: `[NO-IMG]`

Questa lacuna è il risultato principale di S2: i concorrenti documentano il lavoro quando ha già qualcosa da dire, non il momento in cui non sa ancora nulla. Non sostituisco l’immagine mancante con una descrizione inventata.

### Controprova utile — Gemini prima del prompt, non dopo l’avvio

**Tipo:** `[IMG] [UI-REALE]` — serve solo a misurare quanto può essere vuota una schermata mobile, non è una prova di S2.  
**Immagine:** <https://i0.wp.com/9to5google.com/wp-content/uploads/sites/4/2025/02/Gemini-Deep-Research-Android-2.jpg?ssl=1>

![Gemini-S2-CONTRASTO — superficie vuota pre-prompt](https://i0.wp.com/9to5google.com/wp-content/uploads/sites/4/2025/02/Gemini-Deep-Research-Android-2.jpg?ssl=1)

1. **Parte alta:** modello attivo e avatar.
2. **Indicatore:** nessuno.
3. **Densità:** 3 elementi utili nella quasi totalità dello schermo.
4. **Tipografia:** 2 livelli.
5. **Colore:** gradiente centrale e controlli neutri.
6. **Movimento:** nessuno.
7. **Assenza notevole:** la superficie vuota è accettabile prima della richiesta; sarebbe inaccettabile dopo un avvio pagato.

---

## S3 — In corso, con avanzamento

### ChatGPT-S3-A — Processo di ricerca osservabile verso la fine di un lavoro di otto minuti

**Tipo:** `[IMG-LINK] [UI-REALE]` — Business Insider, 6 marzo 2025.  
**Pagina:** <https://www.businessinsider.com/openai-chatgpt-deep-research-reports-worth-extra-wait-time-2025-3>  
**Immagine:** <https://i.insider.com/67c9c357585f1dff88b15ae7?auto=webp&format=jpeg&width=600>

![ChatGPT-S3-A — ricerca in corso](https://i.insider.com/67c9c357585f1dff88b15ae7?auto=webp&format=jpeg&width=600)

1. **Parte alta:** la cronologia/attività del processo, non una percentuale.
2. **Indicatore:** flusso testuale di ricerche e decisioni; la fonte lo descrive come processo osservabile.
3. **Densità:** alta e crescente; più righe di attività nello stesso contenitore.
4. **Tipografia:** gerarchia da log: stato, azioni, testo subordinato.
5. **Colore:** secondario rispetto al testo.
6. **Movimento:** nuove righe compaiono man mano che le ricerche evolvono.
7. **Assenza notevole:** non è visibile un denominatore vero; non promette una percentuale.

**Lettura per TALOS:** utile come registro, insufficiente come stato principale. Il log deve essere consultabile, ma sopra serve “fase corrente + prossimo checkpoint + costo già impegnato”.

### Claude-S3-A — Pagina di una sessione Research in esecuzione

**Tipo:** `[IMG-LINK] [UI-REALE]` — analisi indipendente, 25 febbraio 2026.  
**Pagina:** <https://itswptom.com/ai-search/>  
**Immagine:** <https://itswptom.com/wp-content/uploads/2026/02/claude-research-plan-1024x411.png>

![Claude-S3-A — sessione Research](https://itswptom.com/wp-content/uploads/2026/02/claude-research-plan-1024x411.png)

1. **Parte alta:** pagina dei risultati della sessione, secondo la didascalia della fonte.
2. **Indicatore:** la fonte mostra lo stato della ricerca, ma il CDN non ha consentito una lettura pixel-level.
3. **Densità:** non quantificata senza render affidabile.
4. **Tipografia:** non quantificata.
5. **Colore:** non quantificato.
6. **Movimento:** la funzionalità compie ricerche multiple; il fotogramma resta una cattura statica.
7. **Assenza notevole:** nessuna prova pubblica di percentuale o tempo residuo attendibile.

### Perplexity-S3-A — Step log di Advanced Deep Research

**Tipo:** `[IMG-LINK] [UI-REALE]` — cattura su account Pro del 25 giugno 2026, ricontrollata il 21 luglio 2026.  
**Pagina:** <https://suganthan.com/blog/how-perplexity-picks-sources/>  
**Immagine:** <https://cdn.suganthan.com/uploads/screendrop-2026-07-21-08-35-07-5u5bd.jpg>

![Perplexity-S3-A — step log](https://cdn.suganthan.com/uploads/screendrop-2026-07-21-08-35-07-5u5bd.jpg)

1. **Parte alta:** sequenza di operazioni dell’agente.
2. **Indicatore:** lista di passi nominati — `LOAD_SKILL`, `SEARCH_WEB`, `GET_URL_CONTENT`, `THOUGHT`, `RESEARCH_ANSWER`.
3. **Densità:** molto alta; il valore sta nell’ispezionabilità, non nella scansione a colpo d’occhio.
4. **Tipografia:** gerarchia da log tecnico, con nomi delle operazioni e contenuti subordinati.
5. **Colore:** usato per distinguere tipi di evento/pannelli, secondo la schermata collegata; non viene attribuito un conteggio non verificato.
6. **Movimento:** il registro cresce per eventi discreti.
7. **Assenza notevole:** nessuna percentuale; il denominatore cambia con le decisioni dell’agente.

**Lettura per TALOS:** è la prova più vicina a un flight recorder. Per il pubblico finale va tradotto in fasi umane, lasciando il log tecnico dietro un’espansione.

### Grok-S3-A — Pannello laterale dei “pensieri”

**Tipo:** `[IMG-LINK] [UI-REALE]` — Punto Informatico, 20 febbraio 2025.  
**Pagina:** <https://www.punto-informatico.it/grok-3-beta-italia-deepsearch-think/>  
**Immagine:** <https://www.punto-informatico.it/app/uploads/2025/02/Grok-3-DeepSearch.jpg>

![Grok-S3-A — pannello pensieri](https://www.punto-informatico.it/app/uploads/2025/02/Grok-3-DeepSearch.jpg)

1. **Parte alta:** risposta/chat a sinistra e pannello di processo a destra, secondo la fonte.
2. **Indicatore:** testo di processo in un pannello separato.
3. **Densità:** doppia superficie: documento più traccia del lavoro.
4. **Tipografia:** almeno due gerarchie indipendenti, una per la risposta e una per il pannello.
5. **Colore:** non misurato perché l’immagine non è stata decodificata dal crawler.
6. **Movimento:** il pannello si aggiorna durante le ricerche.
7. **Assenza notevole:** non emerge un avanzamento quantitativo affidabile.

### Fuori settore-S3-A — Time Machine: percentuale vera basata sui byte copiati

**Tipo:** `[IMG] [UI-UFFICIALE]` — Apple Support, pagina aggiornata il 6 luglio 2026.  
**Pagina:** <https://support.apple.com/en-us/104984>  
**Immagine:** <https://cdsassets.apple.com/live/7WUAS350/images/macos/sequoia/macos-sequoia-macbook-pro-menu-bar-time-machine-backup-in-progress.png>

![Fuori settore-S3-A — Time Machine in corso](https://cdsassets.apple.com/live/7WUAS350/images/macos/sequoia/macos-sequoia-macbook-pro-menu-bar-time-machine-backup-in-progress.png)

1. **Parte alta:** “14.3% done — 4.49 GB copied”.
2. **Indicatore:** determinato; il denominatore è una quantità di dati nota.
3. **Densità:** 1 misura di stato, 1 comando terminale morbido (“Skip”), 2 destinazioni.
4. **Tipografia:** 2 livelli; stato disabilitato/secondario e azioni principali.
5. **Colore:** nessun accento cromatico necessario; il dato fa il lavoro.
6. **Movimento:** percentuale e byte cambiano; non c’è animazione decorativa.
7. **Assenza notevole:** non mostra log o dettagli dei file; mantiene la vista compatta.

**Idea trasferibile:** percentuale soltanto quando esiste un denominatore fisico. Per TALOS, la stessa onestà vale solo dentro un passo finito, per esempio “8/12 fonti del ramo già lette”, non per l’intera ricerca se il piano può crescere.

### Fuori settore-S3-B — GitHub Actions: passo fallito espanso nel log

**Tipo:** `[IMG-LINK] [UI-UFFICIALE]` — GitHub Docs, corrente al 2026.  
**Pagina:** <https://docs.github.com/en/actions/how-tos/monitor-workflows/use-workflow-run-logs>  
**Immagine:** <https://docs.github.com/assets/cb-33371/images/help/repository/copy-link-button-updated-2.png>

![Fuori settore-S3-B — log GitHub Actions](https://docs.github.com/assets/cb-33371/images/help/repository/copy-link-button-updated-2.png)

1. **Parte alta:** job e passi; il passo fallito viene espanso automaticamente.
2. **Indicatore:** lista di step con stati discreti, non percentuale.
3. **Densità:** alta, ma organizzata in righe collassabili.
4. **Tipografia:** nomi dei passi, durata/stato e log monospaziato.
5. **Colore:** verde/rosso/giallo sono riservati agli esiti; il log resta neutro.
6. **Movimento:** nuove righe di log, spinner sul passo attivo.
7. **Assenza notevole:** nessuna previsione teatrale del tempo residuo.

**Idea trasferibile:** aprire automaticamente il punto che richiede attenzione, non l’intero log.

### Fuori settore-S3-C — 1DM: molti lavori con stato per riga

**Tipo:** `[IMG] [UI-UFFICIALE/STORE]` — Google Play, app aggiornata nel 2025.  
**Pagina:** <https://play.google.com/store/apps/details?id=idm.internet.download.manager>  
**Immagine:** <https://play-lh.googleusercontent.com/M7uigJtV1CZocnHif8O_MKjyFdCOJ8Eok1CxIsMSV6S5XOOr3m3V-X_0etKr707ijXJDmCipXZqKxGh22pyVMw%3Dw526-h296>

![Fuori settore-S3-C — lista download 1DM](https://play-lh.googleusercontent.com/M7uigJtV1CZocnHif8O_MKjyFdCOJ8Eok1CxIsMSV6S5XOOr3m3V-X_0etKr707ijXJDmCipXZqKxGh22pyVMw%3Dw526-h296)

1. **Parte alta:** toolbar compatta con filtri/azioni globali.
2. **Indicatore:** stato e progresso per ogni riga.
3. **Densità:** circa 8–10 download visibili in una singola schermata del mockup promozionale.
4. **Tipografia:** nome file, metadati e stato; 3 livelli.
5. **Colore:** un accento viola sulla toolbar; stati quasi tutti neutri.
6. **Movimento:** barre e valori di velocità cambiano per riga.
7. **Assenza notevole:** non espande dettagli finché l’utente non li chiede.

**Idea trasferibile:** il controllo del lavoro vive accanto al lavoro, ma il dettaglio profondo resta secondario.

### Fuori settore-S3-D — Export video: percentuale, fotogrammi e tempo stimato

**Tipo:** `[IMG-LINK] [UI-REALE]` — Adobe Premiere Pro, cattura del 17 febbraio 2025, Wikimedia Commons.  
**Pagina e licenza:** <https://commons.wikimedia.org/wiki/File:Exportfortschritt_einer_Videokodierung_Screenshot_2025-02-17_143322.png>  
**Immagine stabile:** <https://commons.wikimedia.org/wiki/Special:Redirect/file/Exportfortschritt%20einer%20Videokodierung%20Screenshot%202025-02-17%20143322.png>

![Fuori settore-S3-D — export video Premiere](https://commons.wikimedia.org/wiki/Special:Redirect/file/Exportfortschritt%20einer%20Videokodierung%20Screenshot%202025-02-17%20143322.png)

1. **Parte alta:** nome/esportazione e stato del rendering.
2. **Indicatore:** determinato, perché il numero di frame è noto.
3. **Densità:** barra, percentuale, tempo trascorso/residuo e comando di annullamento.
4. **Tipografia:** 3 livelli: operazione, metriche, azioni.
5. **Colore:** accento concentrato sulla barra.
6. **Movimento:** barra e tempo si aggiornano; nessun flusso narrativo.
7. **Assenza notevole:** non mostra un log finché non c’è un errore.

---

## S4 — In corso da dieci minuti: cosa cambia

### ChatGPT-S4 — Stessa attività, più cronologia; nessun riepilogo intermedio verificato

L’immagine **ChatGPT-S3-A** mostra che il flusso di ricerca evolve e accumula attività. Non è stata trovata una schermata distinta a dieci minuti con un sommario intermedio leggibile. `[NO-IMG]` per un vero fotogramma S4 separato.

### Perplexity-S4-A — Rapporto che si compone mentre il processo continua

**Tipo:** `[IMG-LINK] [UI-REALE]` — cattura 2026.  
**Pagina:** <https://suganthan.com/blog/how-perplexity-picks-sources/>  
**Immagine:** <https://cdn.suganthan.com/uploads/screendrop-2026-07-21-08-34-27-5tc0h.jpg>

![Perplexity-S4-A — rapporto con Artefacts e Sources](https://cdn.suganthan.com/uploads/screendrop-2026-07-21-08-34-27-5tc0h.jpg)

1. **Parte alta:** documento/risultato con pannelli Artefacts e Sources.
2. **Indicatore:** il documento stesso cresce; la guida 2026 dice che key findings appaiono durante il lavoro.
3. **Densità:** tre famiglie informative: contenuto, artefatti, fonti.
4. **Tipografia:** documento editoriale al centro, metadati/pannelli secondari.
5. **Colore:** usato per separare superfici; conteggio non attribuito senza decodifica completa.
6. **Movimento:** streaming del rapporto e aggiunta progressiva di finding.
7. **Assenza notevole:** nessuna percentuale globale.

**Lettura per TALOS:** è il solo concorrente con una dichiarazione corrente esplicita sul poter leggere finding mentre lavora. TALOS può fare di più: ogni finding provvisorio deve avere stato probatorio e poter essere corretto senza sembrare definitivo.

### Grok-S4-A — DeeperSearch dopo circa sei minuti e mezzo

**Tipo:** `[IMG-LINK] [UI-REALE]` — The Decoder, 22 marzo 2025.  
**Pagina:** <https://the-decoder.com/grok-3-adds-deeper-search-and-ai-image-editing-capabilities/>  
**Immagine:** <https://the-decoder.com/wp-content/uploads/2025/03/deepersearch_grok.png>

![Grok-S4-A — DeeperSearch lungo](https://the-decoder.com/wp-content/uploads/2025/03/deepersearch_grok.png)

1. **Parte alta:** risultato di una sessione DeeperSearch.
2. **Indicatore:** il tempo lungo è espresso dal processo/risultato, non da percentuale.
3. **Densità:** maggiore rispetto al DeepSearch breve, secondo il confronto della fonte.
4. **Tipografia:** non misurata pixel-level per limite CDN.
5. **Colore:** non misurato.
6. **Movimento:** ricerca più lenta e più profonda; il fotogramma è finale/intermedio.
7. **Assenza notevole:** nessuna prova che il materiale già trovato sia navigabile durante l’esecuzione.

### Fuori settore-S4-A — GitHub Actions: filtro “in progress” su centinaia di job

**Tipo:** `[IMG-LINK] [UI-UFFICIALE]` — changelog GitHub, 22 dicembre 2025.  
**Pagina:** <https://github.blog/changelog/2025-12-22-improved-performance-for-github-actions-workflows-page/>  
**Immagine:** <https://github.com/user-attachments/assets/a32953fb-d806-4c5e-b510-fe1b841f5629>

![Fuori settore-S4-A — filtro job GitHub Actions](https://github.com/user-attachments/assets/a32953fb-d806-4c5e-b510-fe1b841f5629)

1. **Parte alta:** controllo filtro per stato.
2. **Indicatore:** stati discreti sui job.
3. **Densità:** il sistema scala oltre 300 job grazie al caricamento progressivo.
4. **Tipografia:** gerarchia di workflow → job → step.
5. **Colore:** stato codificato in modo consistente.
6. **Movimento:** lazy loading e aggiornamento dei job.
7. **Assenza notevole:** nessun tentativo di comprimere tutto in una singola barra.

**Idea trasferibile:** dopo dieci minuti, offrire un filtro “attivi / completati / richiedono attenzione” è più utile di aggiungere testo narrativo.

---

## S5 — Il lavoro si è fermato: errore, pausa o interruzione

### Claude-S5-PROXY-A — Errore inline con tentativo di recupero

**Tipo:** `[IMG] [UI-REALE] [PROXY]` — TechRadar, 11 marzo 2026. È un errore reale di Claude, ma **non è specifico di Research**.  
**Pagina:** <https://www.techradar.com/news/live/claude-anthropic-down-outage-march-11-2026>  
**Immagine:** <https://cdn.mos.cms.futurecdn.net/eFvoFGMF5WMY7WuAhAxX5a.jpg>

![Claude-S5-PROXY-A — errore inline](https://cdn.mos.cms.futurecdn.net/eFvoFGMF5WMY7WuAhAxX5a.jpg)

1. **Parte alta:** intestazione ambra “Something went wrong” con triangolo di avviso.
2. **Indicatore:** stato terminale/errore, non progresso.
3. **Densità:** titolo, dettaglio tecnico, copia, “Try again”, spiegazione, “Share feedback”: 6 elementi.
4. **Tipografia:** 3 livelli; titolo, errore monospaziato, testo/azioni.
5. **Colore:** un solo accento ambra coerente con warning; sfondo scuro.
6. **Movimento:** nessuno; il recupero è esplicito e volontario.
7. **Assenza notevole:** non dice se il lavoro parziale è stato conservato, se il retry riparte dal checkpoint o se comporta nuovo costo.

**Lettura per TALOS:** visivamente è forte e compatto, semanticamente è insufficiente per un lavoro pagato. TALOS deve dire: ultimo checkpoint salvato, passo che non è riuscito, costo già consumato e conseguenza di “Riprova”.

### Claude-S5-PROXY-B — Stato di servizio separato dal contenuto

**Tipo:** `[IMG] [UI-REALE] [PROXY]` — stessa interruzione, 11 marzo 2026.  
**Immagine:** <https://cdn.mos.cms.futurecdn.net/yJwdw43YVeY7Minw4y3Nb8.jpg>

![Claude-S5-PROXY-B — pagina di stato](https://cdn.mos.cms.futurecdn.net/yJwdw43YVeY7Minw4y3Nb8.jpg)

1. **Parte alta:** marchio “Claude Status” e invito a iscriversi agli aggiornamenti.
2. **Indicatore:** timeline di incident update con orari.
3. **Densità:** 3 aggiornamenti ordinati dal più recente al più vecchio.
4. **Tipografia:** titolo incidente, stato in grassetto, testo e timestamp.
5. **Colore:** ambra per l’incidente; il resto bianco/nero.
6. **Movimento:** aggiornamenti discreti, non animazione.
7. **Assenza notevole:** non lega l’incidente al singolo lavoro dell’utente.

**Lettura per TALOS:** essendo interamente locale, TALOS non ha bisogno di una pagina di stato server; deve invece produrre un “registro incidente” locale equivalente, legato al job.

### ChatGPT-S5

`[NO-IMG]` Non è stata trovata una schermata reale e recente di un **singolo Deep Research** fallito con stato recuperabile, checkpoint e conseguenze economiche.

### Gemini-S5

`[NO-IMG]` Non è stata trovata una schermata reale di Deep Research fallito o messo in pausa nell’app Android.

### Perplexity-S5

`[NO-IMG]` Non è stata trovata una schermata recente di Advanced Deep Research fallito, interrotto o ripreso.

### Grok-S5

`[NO-IMG]` Non è stata trovata una schermata di DeepSearch fallito con una via di recupero specifica del job.

### Fuori settore-S5-A — Time Machine offre “Skip This Backup”, non un generico stop

Riferimento visivo: **Fuori settore-S3-A**. Il comando visibile è “Skip This Backup”: nomina l’unità di lavoro e non confonde la sospensione della pianificazione con la distruzione dei dati già copiati.

### Fuori settore-S5-B — GitHub apre automaticamente il passo fallito

Riferimento visivo: **Fuori settore-S3-B**. L’errore non sostituisce l’intera pagina: il job resta leggibile, il punto rotto è espanso, le altre fasi mantengono stato e durata.

---

## S6 — Il rapporto consegnato

### ChatGPT-S6-A — Rapporto finale con forte titolo e overview

**Tipo:** `[IMG] [UI-UFFICIALE]` — pagina funzione corrente, 2026.  
**Pagina:** <https://chatgpt.com/it-IT/features/deep-research/>  
**Immagine:** <https://images.ctfassets.net/8su2tbn87fck/1GikLS86V5O2VL2hbNrkcv/5c01e450f31b3ef8c805be342350cb61/7.png?fm=webp&q=90>

![ChatGPT-S6-A — rapporto finale](https://images.ctfassets.net/8su2tbn87fck/1GikLS86V5O2VL2hbNrkcv/5c01e450f31b3ef8c805be342350cb61/7.png?fm=webp&q=90)

1. **Parte alta:** titolo su tre righe, molto più dominante di qualunque metadato.
2. **Indicatore:** nessuno; lo stato “finito” è implicito nella forma-documento.
3. **Densità:** titolo, overview, primo elemento numerato; circa 16 righe di contenuto utile nel crop.
4. **Tipografia:** almeno 5 livelli: breadcrumb/label, H1, etichetta “Overview”, corpo, H2 numerato.
5. **Colore:** quasi solo bianco/nero; l’identità visiva non compete con il testo.
6. **Movimento:** scorrimento del documento; nessuna animazione necessaria.
7. **Assenza notevole:** nel crop non si vedono fonti, indice, bilancio di affidabilità o storia del processo.

**Lettura per TALOS:** il documento finale deve diventare la superficie dominante, ma TALOS non deve far sparire lo stato probatorio. Una fascia compatta sopra l’overview può mostrare sostenute/parziali/smentite/non verificate.

### ChatGPT-S6-B — Rapporto reale con tabelle e pannello laterale

**Tipo:** `[IMG] [UI-REALE]` — Business Insider, 6 marzo 2025.  
**Pagina:** <https://www.businessinsider.com/openai-chatgpt-deep-research-reports-worth-extra-wait-time-2025-3>  
**Immagine:** <https://i.insider.com/67c5fdc5b1834fe31165ff36?width=700>

![ChatGPT-S6-B — rapporto reale su laptop](https://i.insider.com/67c5fdc5b1834fe31165ff36?width=700)

1. **Parte alta:** documento centrale; la tabella cattura subito l’occhio.
2. **Indicatore:** nessuno; la ricerca è ormai un report.
3. **Densità:** alta: testo, due tabelle, citazioni inline e pannello laterale visibile.
4. **Tipografia:** 4–5 livelli, ma la fotografia riduce la leggibilità minuta.
5. **Colore:** neutro; grigio nelle tabelle e piccoli marcatori di citazione.
6. **Movimento:** scroll verticale e apertura del pannello/citazioni.
7. **Assenza notevole:** nessun riepilogo visivo della forza delle prove.

### ChatGPT-S6-C — Conclusione e tabella nello stesso report

**Tipo:** `[IMG-LINK] [UI-REALE]` — Business Insider, 2025.  
**Immagine:** <https://i.insider.com/67c8ac5469253ccddf9861b6?auto=webp&format=jpeg&width=600>

![ChatGPT-S6-C — collage conclusione e tabella](https://i.insider.com/67c8ac5469253ccddf9861b6?auto=webp&format=jpeg&width=600)

1. **Parte alta:** conclusione editoriale.
2. **Indicatore:** nessuno.
3. **Densità:** testo strutturato e tabella; la fonte definisce la sezione centrale “dense”.
4. **Tipografia:** titoli, corpo e struttura tabulare.
5. **Colore:** secondario rispetto alla struttura.
6. **Movimento:** scroll.
7. **Assenza notevole:** nessuna separazione visiva tra fatto verificato, deduzione e limite della fonte.

### Gemini-S6-A — Rapporto in Canvas con chat persistente a sinistra

**Tipo:** `[IMG] [UI-REALE]` — Android Authority, 13 dicembre 2024. **Pre-2025**, incluso per la struttura split-view ancora coerente con l’esportazione corrente in Docs/Canvas.  
**Pagina:** <https://www.androidauthority.com/hands-on-gemini-deep-research-3508607/>  
**Immagine:** <https://www.androidauthority.com/wp-content/uploads/2024/12/Gemini-Deep-Research-report.png>

![Gemini-S6-A — report desktop in split view](https://www.androidauthority.com/wp-content/uploads/2024/12/Gemini-Deep-Research-report.png)

1. **Parte alta:** titolo del documento a destra; messaggio “I’ve completed your research” a sinistra.
2. **Indicatore:** stato terminale espresso in chat e card del report.
3. **Densità:** 2 pannelli; nel documento sono visibili titolo, intro, sezione e tabella a quattro colonne.
4. **Tipografia:** 5 livelli nel documento, 3 nella chat.
5. **Colore:** accento azzurro sui comandi; grigi per separare tabelle e pannelli.
6. **Movimento:** scroll indipendente del report; la chat resta disponibile.
7. **Assenza notevole:** non appare un indice; le fonti non sono visibili nel crop.

**Lettura per TALOS:** la vista tablet a due pannelli è naturale: conversazione/lista a sinistra, stazione-documento a destra. Sul telefono non va simulata con due colonne; la chat diventa azione o tab separato.

### Claude-S6-A — Rapporto di una sessione Research reale

**Tipo:** `[IMG-LINK] [UI-REALE]` — analisi indipendente, 25 febbraio 2026.  
**Pagina:** <https://itswptom.com/ai-search/>  
**Immagine:** <https://itswptom.com/wp-content/uploads/2026/02/claude-research-report-1024x734.png>

![Claude-S6-A — rapporto Research](https://itswptom.com/wp-content/uploads/2026/02/claude-research-report-1024x734.png)

1. **Parte alta:** report prodotto dalla sessione, secondo la didascalia.
2. **Indicatore:** nessuno; documento finito.
3. **Densità:** non conteggiata senza render affidabile del CDN.
4. **Tipografia:** non conteggiata.
5. **Colore:** non conteggiato.
6. **Movimento:** scroll del report.
7. **Assenza notevole:** la documentazione Claude corrente non descrive un indice, un’attività persistente o un pannello fonti equivalente a ChatGPT 2026.

### Perplexity-S6-A — Default contro Deep Research, confronto nello stesso fotogramma

**Tipo:** `[IMG] [UI-REALE]` — TechCrunch, 14 febbraio 2025.  
**Pagina:** <https://techcrunch.com/2025/02/14/perplexity-launches-an-in-depth-research-tool/>  
**Immagine:** <https://techcrunch.com/wp-content/uploads/2025/02/perplexity-deep-research-screenshot.jpeg?w=503>

![Perplexity-S6-A — confronto Default/Deep Research](https://techcrunch.com/wp-content/uploads/2025/02/perplexity-deep-research-screenshot.jpeg?w=503)

1. **Parte alta:** la stessa domanda è ripetuta in due colonne, Default e Deep Research.
2. **Indicatore:** nessuno nel risultato; “37 sources” segnala scala, non qualità.
3. **Densità:** Default mostra circa 10 punti sintetici; Deep Research mostra sezioni narrative e almeno un elenco.
4. **Tipografia:** 4 livelli: modalità, domanda, titolo/heading, corpo.
5. **Colore:** quasi monocromatico; accento minimo su controlli/citazioni.
6. **Movimento:** scroll; una barra/chevron in fondo suggerisce contenuto ulteriore.
7. **Assenza notevole:** il conteggio fonti non comunica quante affermazioni siano realmente sostenute.

**Lettura per TALOS:** non mettere “56 siti” come KPI principale. Il KPI deve essere il bilancio probatorio.

### Perplexity-S6-B — Documento con Artefacts e Sources

Riferimento visivo: **Perplexity-S4-A**. È sia stato lungo sia rapporto: la nuova UX 2026 fa scorrere il testo dentro un file modificabile e condivisibile, riducendo lo stacco fra attività e documento.

### Grok-S6-A — Risultato DeepSearch con dettaglio e fonti

**Tipo:** `[IMG-LINK] [UI-REALE]` — The Decoder, 22 marzo 2025.  
**Pagina:** <https://the-decoder.com/grok-3-adds-deeper-search-and-ai-image-editing-capabilities/>  
**Immagine:** <https://the-decoder.com/wp-content/uploads/2025/03/deep_research_grok_test.png>

![Grok-S6-A — risultato DeepSearch](https://the-decoder.com/wp-content/uploads/2025/03/deep_research_grok_test.png)

1. **Parte alta:** risposta alla ricerca e metadati del processo.
2. **Indicatore:** ricerca conclusa; il numero di fonti è visibile nel confronto della fonte.
3. **Densità:** risposta narrativa più tracce/fonti.
4. **Tipografia:** non quantificata senza render del CDN.
5. **Colore:** non quantificato.
6. **Movimento:** scroll e apertura dei pannelli.
7. **Assenza notevole:** nessuna prova di documento esportabile strutturato o indice.

---

## S7 — Dettaglio di una fonte o di una citazione

### ChatGPT-S7-A — Elenco delle fonti usate

**Tipo:** `[IMG-LINK] [UI-REALE]` — Business Insider, 2025.  
**Pagina:** <https://www.businessinsider.com/openai-chatgpt-deep-research-reports-worth-extra-wait-time-2025-3>  
**Immagine:** <https://i.insider.com/67c8acc8b8b41a9673f9c856?auto=webp&format=jpeg&width=600>

![ChatGPT-S7-A — fonti usate](https://i.insider.com/67c8acc8b8b41a9673f9c856?auto=webp&format=jpeg&width=600)

1. **Parte alta:** lista delle fonti del report.
2. **Indicatore:** nessuno.
3. **Densità:** elenco compatto di domini/titoli; la fonte nota anche Wikipedia tra i riferimenti.
4. **Tipografia:** titolo sezione e righe fonte.
5. **Colore:** eventuali favicon/link; non usato come misura di qualità.
6. **Movimento:** scroll e apertura del link.
7. **Assenza notevole:** una lista di fonti non mostra il passaggio letterale che sostiene una specifica affermazione.

**Lettura per TALOS:** qui TALOS deve superare i concorrenti: citazione → passaggio archiviato → pagina originale → verdetto del giudice → data della ri-verifica.

### ChatGPT-S7-B — Viewer 2026 con indice a sinistra e fonti a destra

`[NO-IMG]` È documentato e mostrato in un video OpenAI del febbraio 2026, ma non è stata trovata una cattura statica stabile abbastanza leggibile da allegare. Fonti: <https://help.openai.com/en/articles/10500283-deep-research> e <https://www.theverge.com/ai-artificial-intelligence/876775/openai-deep-research-chatgpt-full-screen-report-viewer>.

### Gemini-S7

`[NO-IMG]` La recensione 2024 riferisce fonti sotto i paragrafi, ma il crop disponibile **Gemini-S6-A** non mostra un dettaglio fonte aperto.

### Claude-S7

`[NO-IMG]` Le citazioni sono documentate come “easy-to-check”, ma non è stata trovata un’immagine recente del pannello o popover di una singola fonte.

### Perplexity-S7-A — Pannello Sources accanto al documento

Riferimento visivo: **Perplexity-S4-A**. Il vantaggio è la coesistenza del report e della lista fonti. La lacuna, rispetto a TALOS, è che la schermata non dimostra un passaggio letterale archiviato per ogni claim.

### Grok-S7-A — Pannello separato del processo

Riferimento visivo: **Grok-S3-A**. La fonte descrive un pannello laterale aperto tramite icona; è utile per non contaminare il corpo del rapporto, ma non prova la catena claim → citazione → estratto.

---

## S8 — Cosa si può fare col rapporto finito

### ChatGPT-S8-A — Condivisione e download in testa al documento

**Tipo:** `[IMG] [UI-UFFICIALE]` — 2026.  
**Pagina:** <https://chatgpt.com/it-IT/features/deep-research/>  
**Immagine:** <https://images.ctfassets.net/8su2tbn87fck/1P41rbIPv0KKNvrZSpS3IW/ec7a8a9b06f4d2dc2120ec7374e7dd93/4.png?fm=webp&q=90>

![ChatGPT-S8-A — download/condivisione](https://images.ctfassets.net/8su2tbn87fck/1P41rbIPv0KKNvrZSpS3IW/ec7a8a9b06f4d2dc2120ec7374e7dd93/4.png?fm=webp&q=90)

1. **Parte alta:** icona di esportazione nell’angolo superiore destro del documento.
2. **Indicatore:** nessuno; è una funzione post-completamento.
3. **Densità:** un solo controllo primario visibile per non rubare spazio al report.
4. **Tipografia:** il titolo resta dominante.
5. **Colore:** neutro; hover grigio.
6. **Movimento:** apertura del menu export/share.
7. **Assenza notevole:** il crop non distingue PDF, DOCX e Markdown; la guida corrente sì.

### Gemini-S8-A — “Open in Docs” e “Export to Sheets” contestuali

Riferimento visivo: **Gemini-S6-A**.

1. **Parte alta:** “Open in Docs” è nell’header del documento.
2. **Indicatore:** nessuno.
3. **Densità:** un’azione globale più una contestuale alla tabella.
4. **Tipografia:** chip compatti che non competono col titolo.
5. **Colore:** accento azzurro sulle azioni.
6. **Movimento:** passaggio a un’altra app/superficie.
7. **Assenza notevole:** non è un PDF nativo del report; delega a Docs/Sheets.

### Claude-S8

`[NO-IMG]` Non è stata trovata una schermata recente con export/condivisione specifici del rapporto Research.

### Perplexity-S8

`[NO-IMG]` La guida corrente documenta export in PDF/documento e conversione in Page, ma non è stata trovata una schermata del menu in uso reale: <https://www.perplexity.ai/help-center/en/articles/10738684-what-is-research-mode>.

### Grok-S8

`[NO-IMG]` Non è stata trovata una prova visiva affidabile di export PDF o documento del rapporto DeepSearch.

---

# 2. Risposte alle dieci domande che pesano di più

## 2.1 Il fotogramma zero

**Risposta:** nessun concorrente ha fornito una prova visiva pubblica del vero istante zero. Le schermate disponibili iniziano con un piano già composto (**Gemini-S1-A/B**) o con un log già popolato (**ChatGPT-S3-A**, **Perplexity-S3-A**). Questa assenza è utile: TALOS non deve aspettare il primo evento di rete per disegnare.

Tre soluzioni trasferibili, derivate dalle immagini ma non spacciate per screenshot del fotogramma zero:

1. **Persistenza del piano approvato:** mantenere la card di **Gemini-S1-A** e trasformare i suoi passi in stati “in attesa / attivo / completato”.
2. **Primo evento discreto:** inserire subito una riga tipo log come in **Fuori settore-S3-B**, ma umana: “Checkpoint iniziale salvato”.
3. **Documento-scheletro non decorativo:** mostrare immediatamente titolo, perimetro, costo autorizzato e sezioni previste; non blocchi grigi generici. La forma-documento di **ChatGPT-S6-A** può esistere da subito, con etichette “non ancora prodotto”.

Per TALOS il primo frame deve essere sincrono e locale: titolo, stato “Avvio”, piano approvato, costo massimo, pulsanti Pausa/Annulla e una riga `role="status"`. Nessuna attesa della rete.

## 2.2 Determinato o no — e chi dice la verità

Le interfacce IA osservate non mostrano una percentuale globale verificabile. **ChatGPT-S3-A**, **Perplexity-S3-A** e **Grok-S3-A** usano attività, passi o testo. Gemini nel piano dice solo “Ready in a few mins” (**Gemini-S1-A/B**).

Le percentuali oneste compaiono fuori dal settore:

- **Fuori settore-S3-A:** percentuale calcolata su byte copiati; il denominatore è fisico.
- **Fuori settore-S3-D:** percentuale su frame/export noto.
- **1DM-S3-C:** progresso per file di dimensione nota.

Non è stata trovata una schermata verificabile in cui una barra Deep Research arretri o resti al 90%. `[NO-IMG]` per la “prova del denominatore finto”. La conclusione prudente è che i principali prodotti evitano la percentuale globale proprio perché il piano può espandersi.

Per TALOS: barra determinata solo dentro un ramo con denominatore congelato; a livello job usare fase corrente, conteggi reali e stato dei checkpoint.

## 2.3 Leggere mentre lavora

La prova più forte è Perplexity 2026: la guida dice che i key findings appaiono man mano e il report scorre in un file modificabile; **Perplexity-S4-A** mostra documento, Artefacts e Sources. ChatGPT consente di seguire e correggere il processo (**ChatGPT-S3-A**), ma la schermata trovata non dimostra che le fonti siano apribili senza interrompere. Gemini documenta che si può lasciare l’app e tornare quando è pronto, ma non è stata trovata un’immagine di fonti navigabili durante il lavoro.

Per TALOS: sì, una fonte già archiviata deve potersi aprire mentre il job continua. Va marcata “raccolta, non ancora usata” oppure “collegata a N affermazioni provvisorie”, evitando di trasformare la mera scoperta in una promessa di qualità.

## 2.4 Il passaggio dallo stato al documento

Tre modelli:

- **ChatGPT:** il lavoro diventa una vista report a schermo intero; nel 2026 conserva anche cronologia attività, indice e fonti. Riferimenti visivi: **ChatGPT-S6-A/B**, con la cronologia documentata ma non catturata.
- **Gemini:** la chat resta a sinistra e il documento si apre a destra (**Gemini-S6-A**). Il cambio è spaziale, non una pagina completamente nuova.
- **Perplexity:** il report si compone già nel file (**Perplexity-S4-A**); il confine tra “in corso” e “finito” è il completamento degli ultimi passi.

Per TALOS è preferibile una trasformazione nella stessa route: lo stato operativo si comprime in un’intestazione consultabile, il rapporto prende il centro, e la cronologia resta sotto “Come è stato costruito”. Non cancellare il processo: TALOS possiede il registro completo e può farne un vantaggio competitivo.

## 2.5 L’errore

Non sono state trovate immagini reali, recenti e specifiche di un job Deep Research fallito per ChatGPT, Gemini, Perplexity o Grok. Per Claude è disponibile solo il proxy generico **Claude-S5-PROXY-A**: è visivamente chiaro, offre Retry e feedback, ma espone perfino un errore tecnico (`undefined is not an object`) e non chiarisce checkpoint o costo.

La lezione da **Fuori settore-S3-B** è migliore: mantenere l’intero job, espandere il passo fallito, mostrare il messaggio rilevante e offrire un recupero mirato. TALOS deve distinguere almeno:

- errore recuperabile del passo, con `Riprova questo passo`;
- pausa richiesta, con `Riprendi`;
- annullamento terminale;
- arresto del sistema/app, con checkpoint recuperato;
- fonte non raggiungibile, che può non fermare l’intera ricerca.

## 2.6 Telefono contro desktop

L’unico confronto realmente omogeneo trovato è Gemini:

- **Telefono — Gemini-S1-A:** card unica, circa 21 righe testuali visibili; i sotto-passi avvolgono su più righe; due CTA occupano una riga intera.
- **Desktop — Gemini-S1-B:** circa 18–20 righe nella card, ma sei sotto-obiettivi restano leggibili senza frammentare la gerarchia.
- **Desktop finale — Gemini-S6-A:** due pannelli permanenti, chat e documento; su telefono questa struttura deve diventare sequenziale.

Misura manuale, non normalizzata per DPI: sul telefono il piano mostra 7 blocchi distinti ma solo il primo ramo è in dettaglio; sul desktop lo stesso ramo può mostrare sei obiettivi. La perdita principale non è il numero di righe, ma la simultaneità: fonte, report e chat non possono stare fianco a fianco.

Per TALOS telefono: header sticky compatto, un solo contenuto principale, pannelli secondari come bottom sheet o route. Tablet: lista/chat sinistra, stazione destra; dentro la stazione si può aggiungere un rail fonti solo oltre una larghezza minima reale.

## 2.7 Densità e navigabilità

Conteggi manuali sui fotogrammi disponibili:

| Immagine | Contenuti distinti visibili | Righe utili approssimative | Spreco verticale |
|---|---:|---:|---|
| Gemini-S1-A telefono | 7 blocchi | ~21 righe | basso nella card, medio tra prompt e piano |
| Gemini-S2-CONTRASTO | 3 elementi | ~3 righe | altissimo, ma è pre-prompt |
| ChatGPT-S6-A | 4 blocchi | ~16 righe | basso; il titolo è grande ma giustificato |
| Perplexity-S6-A | 2 colonne, 12+ blocchi | >35 righe complessive | basso, densità alta |
| Fuori settore-S3-A | 4 righe/azioni | 4 | bassissimo |
| 1DM-S3-C | 8–10 lavori | ~20 righe | bassissimo, ma testo minuto |

La migliore economia non è “più testo”: **Fuori settore-S3-A** usa quattro righe perché può dire un numero vero; GitHub usa collasso per contenere molti passi; Perplexity accetta densità solo nel documento finale. Per TALOS, comprimere significa togliere etichette ridondanti e collassare il dettaglio, non ridurre target o corpo testo sotto una dimensione leggibile.

## 2.8 La notifica

Gemini documenta una notifica mobile quando il report è pronto; 9to5Google lo conferma. OpenAI dichiara che l’utente riceve una notifica al completamento. **Non è stata trovata una fotografia reale e recente della notifica Android Deep Research di nessuno dei prodotti. `[NO-IMG]`.**

Per TALOS la notifica di foreground service dovrebbe avere stati coerenti:

- in corso: fase corrente, tempo trascorso, Pausa, Apri;
- in pausa: “Ricerca in pausa”, ultimo checkpoint, Riprendi, Apri;
- completata: titolo, “Rapporto pronto”, Apri/Esporta;
- errore: causa umana breve, Apri per dettagli, Riprova solo quando il costo del retry è chiaro.

Toccandola deve aprire la stessa pagina del job, non una chat generica.

## 2.9 Continuare a parlarne

- ChatGPT: la pagina corrente dice esplicitamente che si può continuare a perfezionare il rapporto nella chat; **ChatGPT-S8-A** mostra l’azione export, mentre la conversazione resta il contesto del prodotto.
- Gemini: **Gemini-S6-A** mantiene il composer a sinistra del report; il rapporto è quindi già nello stesso contesto conversazionale.
- Claude: Research produce una risposta nella conversazione; non è stata trovata un’immagine di “avvia chat dal rapporto” come comando distinto.
- Perplexity: il file è modificabile/condivisibile e consente follow-up durante la ricerca, ma non è stata trovata un’immagine che mostri il rapporto come allegato esplicito in una nuova conversazione.
- Grok: le recensioni mostrano follow-up nella stessa chat; nessun comando distinto trovato.

Conclusione: i concorrenti continuano **dentro il thread originale**. Non è stata trovata prova di un flusso in cui il report diventa un allegato visibile a una nuova chat. TALOS può rendere esplicito il contratto: `Avvia conversazione dal rapporto`, con chip “Rapporto X come contesto” e possibilità di rimuoverlo.

## 2.10 L’esportazione, in particolare il PDF

ChatGPT e Perplexity documentano export PDF; Gemini delega soprattutto a Google Docs; Claude e Grok non hanno fornito una prova equivalente nella ricerca svolta. **Non è stato trovato un PDF pubblico, scaricabile e chiaramente generato da una versione corrente di ChatGPT/Gemini/Claude/Perplexity/Grok Deep Research con licenza e provenienza sufficienti per allegarne le pagine. `[NO-IMG]`.**

Le schermate **ChatGPT-S8-A** e **Gemini-S8-A** provano il punto di accesso, non la qualità del PDF. Di conseguenza non si può sostenere che uno dei concorrenti produca “un PDF a regola d’arte” soltanto perché offre il comando.

Per TALOS il PDF deve essere un artefatto editoriale separato:

- copertina con titolo, domanda originale, data, modello autore e modello giudice;
- sommario con pagine;
- executive summary e bilancio probatorio;
- citazioni numerate stabili;
- note fonte con titolo, dominio, data acquisizione, URL e hash/ID dell’estratto locale;
- appendice “metodo e limiti”;
- tabelle con header ripetuti e gestione delle interruzioni di pagina;
- link interni e URL cliccabili;
- nessuna dipendenza dalla rete durante l’impaginazione.

---

# 3. Fuori dal settore: la grammatica dei lavori lunghi

## 3.1 GitHub Actions — il lavoro come grafo di passi verificabili

**Immagini:** **Fuori settore-S3-B**, **Fuori settore-S4-A**.  
**Idea singola da rubare:** **la fase che richiede attenzione si apre da sola; tutto il resto conserva stato, durata e log senza occupare lo schermo.**

Applicazione TALOS: ogni ramo del piano è un job; ogni chiamata/modulo è uno step. Al completamento non eliminare la timeline. In errore, espandere solo il passo rotto e lasciare visibili i checkpoint riusciti. I log tecnici possono essere monospaziati, ma il livello predefinito deve tradurre l’evento in linguaggio umano.

## 3.2 1DM / download manager — controllo locale e ripresa per elemento

**Immagine:** **Fuori settore-S3-C**.  
**Idea singola da rubare:** **pausa e ripresa appartengono all’unità di lavoro, mentre velocità, bytes e stato stanno sulla stessa riga.**

Applicazione TALOS: “Pausa” non è un sinonimo di annulla. La riga e la pagina devono mostrare ultimo checkpoint, fase e costo già impegnato. Il dettaglio delle fonti non deve rendere la lista illeggibile; si apre su richiesta.

## 3.3 Adobe Premiere — una percentuale solo perché il lavoro è enumerabile

**Immagine:** **Fuori settore-S3-D**.  
**Idea singola da rubare:** **il tempo residuo è utile soltanto quando deriva da unità omogenee e misurabili.**

Applicazione TALOS: per una fase con N estratti già scelti si può mostrare `7/12 letti`; per la ricerca globale, il cui piano può crescere, no. In alternativa mostrare `fase 3 di 5 pianificate` accompagnato da “il piano può estendersi”, senza convertirlo in 60%.

## 3.4 Time Machine — stato compatto, percentuale fisica, comando nominato

**Immagini:** **Fuori settore-S3-A** e quella di completamento sotto.  
**Idea singola da rubare:** **una singola riga quantitativa vera può sostituire un’intera pagina di rassicurazioni.**

### Fuori settore-FINALE-A — Backup terminato

**Tipo:** `[IMG] [UI-UFFICIALE]` — Apple Support, 2026.  
**Immagine:** <https://cdsassets.apple.com/live/7WUAS350/images/macos/sequoia/macos-sequoia-macbook-pro-menu-bar-time-machine-backup-finished-latest.png>

![Fuori settore-FINALE-A — backup completato](https://cdsassets.apple.com/live/7WUAS350/images/macos/sequoia/macos-sequoia-macbook-pro-menu-bar-time-machine-backup-finished-latest.png)

1. **Parte alta:** “Latest Backup” con destinazione, data e ora.
2. **Indicatore:** nessuno; la misura diventa una prova temporale del completamento.
3. **Densità:** 2 righe di esito, 3 azioni.
4. **Tipografia:** 2 livelli.
5. **Colore:** neutro.
6. **Movimento:** nessuno.
7. **Assenza notevole:** non mantiene la percentuale ormai inutile.

Applicazione TALOS: a rapporto finito, sostituire l’animazione con `Completata 12:41 · durata 14:08 · costo €… · checkpoint finale salvato`. La cronologia resta raggiungibile, non dominante.

## 3.5 Installer di sistema — preflight e contratto prima dell’irreversibile

### Fuori settore-PREFLIGHT-A — “Ready to install” prima dell’avvio

**Tipo:** `[IMG-LINK] [UI-REALE]` — Pureinfotech, articolo aggiornato il 30 novembre 2025; schermata della nuova esperienza Windows Setup.  
**Pagina:** <https://pureinfotech.com/windows-11-setup-new-ui/>  
**Immagine:** <https://i0.wp.com/pureinfotech.com/wp-content/uploads/2024/01/ready-install-wizard-ui.webp?quality=78&resize=827%2C620&ssl=1&strip=all>

![Fuori settore-PREFLIGHT-A — riepilogo installazione](https://i0.wp.com/pureinfotech.com/wp-content/uploads/2024/01/ready-install-wizard-ui.webp?quality=78&resize=827%2C620&ssl=1&strip=all)

1. **Parte alta:** titolo che conferma la prontezza dell’operazione.
2. **Indicatore:** nessuno; è uno stato di preflight.
3. **Densità:** riepilogo delle scelte, conseguenze e CTA.
4. **Tipografia:** titolo, riepilogo, dettagli, azioni.
5. **Colore:** azzurro/bianco di sistema; CTA distinta.
6. **Movimento:** passaggio alla fase di installazione solo dopo conferma.
7. **Assenza notevole:** non tenta di mostrare progresso prima che il lavoro parta.

**Idea singola da rubare:** **prima di un’operazione lunga e costosa, ricapitolare esattamente che cosa succederà e che cosa resterà.**

Applicazione TALOS: il piano approvabile deve mostrare rami, budget massimo, fonti consentite, modelli usati, cosa si può modificare dopo l’avvio e cosa comporta annullare.

---

# 4. Tre direzioni possibili per la pagina TALOS

## Direzione A — “Flight recorder”: il processo come oggetto principale

### Telefono — circa 40 caratteri

```text
┌──────────────────────────────────────┐
│ ‹ Ricerca                  ⋮         │
│ Mercato batterie sodio-ion...        │
│ IN CORSO · 08:42          [Pausa]    │
│ Fase: verifica affermazioni           │
│ Costo usato €1,84 / max €3,20         │
├──────────────────────────────────────┤
│ PIANO                                 │
│ ✓ 1. Definisci perimetro        0:12 │
│ ✓ 2. Cerca e acquisisci        4:06 │
│ ● 3. Scrivi affermazioni       2:31 │
│ ○ 4. Giudice indipendente       —   │
│ ○ 5. Compila rapporto           —   │
├──────────────────────────────────────┤
│ ORA                                   │
│ 12:28  Verifica claim C-018           │
│ 12:27  Salvato estratto S-044         │
│ 12:26  Fonte non raggiungibile  [!]   │
│                                       │
│ [Apri registro completo]              │
└──────────────────────────────────────┘
```

### Tablet

```text
┌──────────── elenco ───────────┬──────────────── stazione ────────────────────────┐
│ Ricerca batterie...     ●     │ Titolo · IN CORSO · 08:42      Pausa  ⋮          │
│ Politiche UE             ✓     │ Costo €1,84 / max €3,20 · checkpoint 12:28       │
│ ...                            ├──────────────────────┬───────────────────────────┤
│                                │ Piano / fasi         │ Registro vivo             │
│                                │ ✓ perimetro          │ 12:28 claim C-018         │
│                                │ ✓ acquisizione       │ 12:27 estratto S-044      │
│                                │ ● affermazioni       │ 12:26 errore fonte        │
│                                │ ○ giudice            │                           │
│                                │ ○ rapporto           │ [dettagli evento]         │
└────────────────────────────────┴──────────────────────┴───────────────────────────┘
```

**Prende da:** lista di step e auto-espansione di **Fuori settore-S3-B**, log di **Perplexity-S3-A**, compattezza numerica di **Fuori settore-S3-A**.

**Guadagna:** trasparenza operativa, diagnosi, pausa/ripresa comprensibili, ottima gestione dell’errore, nessuna percentuale falsa.

**Perde:** il rapporto sembra lontano; dopo molti minuti il registro può sembrare un terminale. Richiede forti livelli di dettaglio e un default non tecnico.

**Cosa unica in cima:** **ri-verificabilità e checkpoint** — ultimo checkpoint, numero di claim sottoposti al giudice, registro completo.

## Direzione B — “Documento che nasce”: il rapporto è visibile dall’istante zero

### Telefono

```text
┌──────────────────────────────────────┐
│ ‹ Ricerca                  ⋮         │
│ Mercato batterie sodio-ion...        │
│ IN CORSO · Acquisizione   [Pausa]    │
│ Piano approvato · costo €1,84/€3,20  │
├──────────────────────────────────────┤
│ BILANCIO PROBATORIO                   │
│ Sostenute 06  Parziali 02             │
│ Smentite 01   Da verificare 11        │
├──────────────────────────────────────┤
│ SINTESI                               │
│ [non ancora compilata]                │
│                                       │
│ 1. Stato del mercato                  │
│ Bozza disponibile · 3 claim           │
│ [Leggi quanto c'è]                    │
│                                       │
│ 2. Costi e filiere                    │
│ Ricerca fonti in corso…               │
├──────────────────────────────────────┤
│ Fonti 24 · Estratti 37 · Claim 20     │
│ [Attività] [Fonti] [Conversazione]    │
└──────────────────────────────────────┘
```

### Tablet

```text
┌──────── elenco ────────┬──────────────────── documento ───────────────┬── prove ──┐
│ ricerche               │ Titolo · IN CORSO · fase · Pausa            │ Bilancio  │
│                        │ Sommario                                     │ 06 / 02   │
│                        │ 1. Stato del mercato                         │ 01 / 11   │
│                        │    bozza + claim citati                      │           │
│                        │ 2. Costi e filiere                           │ Fonti     │
│                        │    acquisizione in corso                     │ S-044 ... │
│                        │ 3. Prospettive [non iniziata]                │           │
└────────────────────────┴──────────────────────────────────────────────┴───────────┘
```

**Prende da:** trasformazione del report di **ChatGPT-S6-A**, file in streaming di **Perplexity-S4-A**, split-view di **Gemini-S6-A**.

**Guadagna:** elimina la pagina vuota; l’utente può leggere presto; la transizione finale è minima; il prodotto comunica che il risultato è un documento, non un’animazione.

**Perde:** una bozza può essere scambiata per conclusione. Richiede marcature rigorose “provvisorio/non verificato” e non deve riordinare il testo sotto le dita mentre l’utente legge.

**Cosa unica in cima:** **bilancio probatorio** — non numero di siti, ma claim sostenuti/parziali/smentiti/non verificati.

## Direzione C — “Sala di controllo”: prove e giudizio prima del testo

### Telefono

```text
┌──────────────────────────────────────┐
│ ‹ Ricerca                  ⋮         │
│ Mercato batterie sodio-ion...        │
│ IN CORSO · Giudice 7/20   [Pausa]    │
├──────────────────────────────────────┤
│ STATO DELLE PROVE                     │
│ ██████  sostenute        06           │
│ ██      parziali         02           │
│ █       smentite         01           │
│ ······· da verificare    11           │
├──────────────────────────────────────┤
│ CLAIM IN ESAME                        │
│ C-018 “Il costo medio...”             │
│ Autore: modello A                     │
│ Giudice: modello B · in corso         │
│ Fonti collegate: 3                    │
│ [Apri claim]                          │
├──────────────────────────────────────┤
│ [Rapporto] [Piano] [Registro]         │
└──────────────────────────────────────┘
```

### Tablet

```text
┌──────── elenco ────────┬──────────── claim / rapporto ────────────┬── evidenza ──┐
│ ricerche               │ C-018 · giudizio in corso               │ Estratto 1   │
│                        │ affermazione                             │ Fonte S-12   │
│                        │ verdetto / motivazione                   │ passaggio    │
│                        │ rapporto sotto forma di tab              │ archiviato   │
│                        │                                          │ Re-verifica  │
└────────────────────────┴──────────────────────────────────────────┴───────────────┘
```

**Prende da:** pannello fonti di **Perplexity-S4-A**, pannello processo di **Grok-S3-A**, separazione log/contenuto di **Fuori settore-S3-B**.

**Guadagna:** rende immediatamente visibile ciò che TALOS ha di unico; eccellente per audit, controllo qualità e ri-verifica.

**Perde:** per un utente che vuole semplicemente leggere il rapporto è troppo tecnica. Su telefono il claim singolo sostituisce il senso complessivo. Rischia di sembrare uno strumento da laboratorio invece di un prodotto finito.

**Cosa unica in cima:** **giudice diverso dall’autore**, con stato e verdetto per claim.

---

# 5. Raccomandazione operativa — dieci righe

1. Sceglierei la **Direzione B, documento che nasce**, con una testata operativa presa dalla Direzione A.
2. Il primo frame deve essere interamente locale: titolo, piano approvato, budget, fase “Avvio” e controlli, senza attendere la rete.
3. In cima metterei il **bilancio probatorio**, inizialmente a zero e poi aggiornato con conteggi veri, mai il numero di siti come qualità.
4. Il corpo mostrerebbe sezioni previste e contenuto provvisorio stabile; niente skeleton decorativi né testo teatrale.
5. Ogni bozza leggibile avrebbe una marcatura esplicita `provvisoria` finché il giudice diverso dall’autore non ha emesso un verdetto.
6. Piano e registro resterebbero apribili; in errore si espanderebbe automaticamente solo il passo rotto, come GitHub Actions.
7. Sul telefono userei una sola colonna e bottom sheet/route per fonti, attività e conversazione; sul tablet un rail prove opzionale.
8. La pausa fermerebbe l’avvio di nuovi passi dopo aver salvato il checkpoint corrente; la UI mostrerebbe esattamente dove riprenderà.
9. A completamento, la testata si comprimerebbe in durata, costo e data; il documento resterebbe nella stessa route e l’attività non sparirebbe.
10. Scarterei A pura perché troppo simile a un log e C pura perché troppo tecnica; B ibrida comunica subito valore senza nascondere la verificabilità.

---

# 6. Specifica visiva minima consigliata per TALOS

## Header sticky, telefono

- Riga 1: back, titolo ellittico, pulsante menu visibile con target 48 dp.
- Riga 2: stato semantico (`In corso`, `In pausa`, `Errore`, `Completata`) + durata trascorsa.
- Riga 3: fase corrente e checkpoint; numeri in monospaziato tabulare.
- Azioni: Pausa/Riprendi primaria contestuale; Annulla nel menu visibile e confermato quando terminale.
- Un solo accento ambra: stato attivo, focus e CTA; rosso riservato a distruzione/errore.

## Bilancio probatorio

```text
Sostenute       06
In parte        02
Smentite        01
Non verificate  11
```

Niente torta decorativa. Su telefono quattro coppie etichetta/numero; su tablet barra impilata accessibile più tabella numerica. Ogni categoria apre i claim filtrati.

## Fasi e progresso

- Stato globale: indeterminato + nome della fase quando il piano può crescere.
- Stato di ramo: `n/N` soltanto dopo aver congelato N.
- Stato di singolo passo: pending / running / saved / warning / failed / canceled.
- Aggiornamenti annunciati con `role="status"`, senza spostare il fuoco.
- Con `prefers-reduced-motion`, eliminare shimmer, pulsazioni e transizioni non essenziali; conservare solo cambi di stato.

## Fonte durante il lavoro

Una fonte acquisita deve poter mostrare offline:

```text
S-044  example.org
Acquisita 12:27 · 14,2 kB testo
Usata da 3 claim · 1 ancora da giudicare
[Apri estratto] [Apri claim] [Metadati]
```

Nessuna favicon richiesta in rete: usare quella catturata al salvataggio o un monogramma locale.

## Errore

```text
Impossibile leggere la fonte S-044
La pagina ha chiuso la connessione.
Ultimo checkpoint salvato alle 12:26.
Nessun nuovo addebito finché non riprovi.
[Riprova questo passo] [Continua senza] [Dettagli]
```

Il testo “nessun nuovo addebito” va mostrato solo se tecnicamente vero. In caso contrario: costo stimato del retry prima del comando.

## Completamento

```text
Completata 12:41 · 14 min 08 s
Costo totale €2,74 · 20 claim giudicati
6 sostenuti · 2 in parte · 1 smentito
11 non verificati
[Leggi rapporto] [Esporta] [Parlane]
```

---

# 7. Cosa non sono riuscito a trovare

1. Un’immagine del **vero fotogramma zero**, nei primi 500 ms, per qualunque deep research.
2. Una schermata di **percentuale globale** di Deep Research con denominatore spiegato; non ho quindi trovato neppure una prova visiva di barra che arretra o resta al 90%.
3. Una schermata reale recente di **pausa e ripresa** dentro ChatGPT, Gemini, Claude, Perplexity o Grok Research.
4. Un errore **specifico del singolo job Deep Research** con checkpoint, costo e recupero; il caso Claude allegato è un proxy generico e dichiarato come tale.
5. Una foto della **notifica Android** di completamento, benché Gemini e OpenAI la documentino.
6. Un confronto telefono/desktop omogeneo per ChatGPT, Claude, Perplexity e Grok; Gemini è l’unico caso con evidenza sufficientemente confrontabile.
7. Una schermata in cui una fonte sia aperta e letta **mentre** il lavoro IA continua, con stato esplicito non bloccante; Perplexity documenta la lettura progressiva, ma la prova del dettaglio aperto non è conclusiva.
8. Un esempio pubblico affidabile di **PDF esportato** dai prodotti correnti, con pagine verificabili e provenienza chiara.
9. Un comando distinto “avvia nuova conversazione da questo rapporto” che mostri il report come allegato rimuovibile; i prodotti tendono a continuare nello stesso thread.
10. Prove visive che uno dei concorrenti mostri ciò che TALOS può mostrare: passaggio letterale archiviato, verdetto di un giudice diverso e ri-verifica storica.
11. Catture recenti e sufficientemente leggibili per ogni situazione di Grok; alcune immagini sono linkate ma i CDN hanno impedito il rendering nel crawler.
12. Un’immagine corrente del menu export Perplexity e delle azioni post-report Claude/Grok; le capacità documentate non sono state trasformate in una falsa prova visiva.

---

# 8. Registro delle fonti

## ChatGPT / OpenAI

- Guida corrente Deep Research, piano, attività, indice, fonti, export: <https://help.openai.com/en/articles/10500283-deep-research>
- Pagina funzione con immagini correnti: <https://chatgpt.com/it-IT/features/deep-research/>
- Viewer a schermo intero, febbraio 2026: <https://www.theverge.com/ai-artificial-intelligence/876775/openai-deep-research-chatgpt-full-screen-report-viewer>
- Uso reale e immagini, 6 marzo 2025: <https://www.businessinsider.com/openai-chatgpt-deep-research-reports-worth-extra-wait-time-2025-3>

## Gemini / Google

- Guida corrente Gemini Deep Research, notifiche ed export: <https://support.google.com/gemini/answer/15719111>
- App Android con galleria reale, 4 febbraio 2025: <https://9to5google.com/2025/02/04/gemini-deep-research-android/>
- Hands-on desktop, 13 dicembre 2024 — usato solo con avvertenza: <https://www.androidauthority.com/hands-on-gemini-deep-research-3508607/>
- Descrizione ufficiale del piano e delle citazioni, 6 marzo 2025: <https://workspace.google.com/blog/ai-and-machine-learning/meet-deep-research-your-new-ai-research-assistant>

## Claude / Anthropic

- Guida corrente, 2 giugno 2026: <https://support.claude.com/en/articles/11088861-use-research-on-claude>
- Annuncio ufficiale Research, 15 aprile 2025: <https://claude.com/blog/research>
- Sessione reale indipendente con immagini, 25 febbraio 2026: <https://itswptom.com/ai-search/>
- Errore reale generico usato come proxy, 11 marzo 2026: <https://www.techradar.com/news/live/claude-anthropic-down-outage-march-11-2026>

## Perplexity

- Advanced Deep Research, aggiornata 16 luglio 2026: <https://www.perplexity.ai/help-center/en/articles/13600190-what-s-new-in-advanced-deep-research>
- Research mode ed export: <https://www.perplexity.ai/help-center/en/articles/10738684-what-is-research-mode>
- Cattura reale del flusso e dei pannelli, 25 giugno / 21 luglio 2026: <https://suganthan.com/blog/how-perplexity-picks-sources/>
- Confronto visivo Default/Deep Research, 14 febbraio 2025: <https://techcrunch.com/2025/02/14/perplexity-launches-an-in-depth-research-tool/>

## Grok / xAI

- Interfaccia DeepSearch/Think e pannello, 20 febbraio 2025: <https://www.punto-informatico.it/grok-3-beta-italia-deepsearch-think/>
- DeepSearch contro DeeperSearch, 22 marzo 2025: <https://the-decoder.com/grok-3-adds-deeper-search-and-ai-image-editing-capabilities/>
- Hands-on con processo e report, 2025: <https://indianexpress.com/article/technology/artificial-intelligence/grok-3-review-elon-musk-chatgpt-ai-model-9848064/>

## Lavori lunghi fuori settore

- GitHub Actions, log dei workflow: <https://docs.github.com/en/actions/how-tos/monitor-workflows/use-workflow-run-logs>
- GitHub Actions, filtri e oltre 300 job, 22 dicembre 2025: <https://github.blog/changelog/2025-12-22-improved-performance-for-github-actions-workflows-page/>
- 1DM su Google Play: <https://play.google.com/store/apps/details?id=idm.internet.download.manager>
- Time Machine, guida aggiornata 6 luglio 2026: <https://support.apple.com/en-us/104984>
- Export Premiere, cattura 17 febbraio 2025 e licenza: <https://commons.wikimedia.org/wiki/File:Exportfortschritt_einer_Videokodierung_Screenshot_2025-02-17_143322.png>
- Windows Setup, articolo aggiornato 30 novembre 2025: <https://pureinfotech.com/windows-11-setup-new-ui/>

---

# 9. Conclusione secca

La grammatica più solida non viene da un singolo concorrente. Gemini ha il miglior **preflight visuale**; Perplexity 2026 è il più vicino a **leggere mentre lavora**; ChatGPT 2026 tratta meglio il risultato come **documento navigabile**; GitHub Actions gestisce meglio **passi, log ed errore**; Time Machine e Premiere ricordano quando una percentuale è onesta. Nessuno mostra la catena probatoria che TALOS possiede.

La pagina TALOS dovrebbe quindi nascere come documento, non come sala d’attesa: piano persistente, fase corrente, costo e checkpoint dall’istante zero; contenuto provvisorio leggibile ma marcato; bilancio probatorio in cima; fonti apribili offline; attività e log dietro un livello secondario; errore localizzato; trasformazione finale nella stessa route. La caratteristica che deve dominare non è “quante fonti”, ma **che cosa è sostenuto, da quale passaggio, con quale verdetto e quando è stato ri-verificato**.
