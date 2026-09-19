# INVENTARIO DELLE INCONGRUENZE — app 4174 contro mockup

> Owner, 18/09/2026: «*vedo già tantissime incongruenze, la app 4174 ha tante cose che non vanno
> rispetto al mockup. Fai un inventario completo tu stesso mentre l'agente ispettore lavora e poi
> unite i findings*». Questo è **il mio** inventario. I findings dell'ispettore si uniscono qui.

## Come è stato fatto, e cosa vuol dire «visto»

- **Foto guardate una per una** in `C:\Users\Antonino\Downloads\confronto-fase1\`, coppie
  `<vista>_<risoluzione>_mockup.png` / `_real.png`, tema **scuro**, a **1440p (2560×1440)** e
  **1080p (1920×1080)** — restando al mockup lato per lato.
- «**VISTO**» = l'ho guardato in fotografia. «**MISURATO**» = c'è un numero preso dal DOM vivo
  (referti del 18/09/2026). «**RIFERITO**» = viene da un referto e non l'ho guardato io: va
  riconfermato prima di agire.
- ⛔ **Non si giudica il contenuto**: i dati dimostrativi del mockup contro i dati veri dell'app
  (RAM viva, date di misura, i 15 modelli finti contro i modelli veri) sono **differenze attese**.
- Gravità: **P0** blocca l'uso · **P1** salta all'occhio · **P2** si nota guardando · **P3** rifinitura.

---

## A · L'INTELAIATURA

| # | cosa | mockup | app 4174 | gravità | visto |
|---|---|---|---|---|---|
| A1 | **sidebar delle impostazioni** | **una** colonna da 246px, dedicata, con «TALOS / WORKSPACE» e «Impostazioni» in cima | **due** colonne: la sidebar generale dell'app (Home, Conversazioni, Note, …) **più** la nav delle impostazioni | **P2** | VISTO |
| A2 | **piede della nav** | `.scope-card`: avatar + «Spazio personale» + «Calm · anteprima isolata» | assente (c'è un «Workspace locale / Tema Calm» in fondo alla sidebar **generale**, altra cosa) | **P2** | VISTO |
| A3 | **posizione del breadcrumb** | nella **topbar**, fuori dal contenuto | **dentro** il contenuto, sopra la testata | P3 | VISTO |
| A4 | **torna** al breadcrumb | — | ✅ **il breadcrumb c'è** (messo oggi, FASE 1) | — | VISTO |
| A5 | **tasto tema rapido** e **«Guida al mockup»**, tag **«PROTOTIPO · 04»** | presenti in topbar | assenti | — | VISTO |
| A6 | **statusbar** in fondo, col selettore **Scenario** (5 stati finti) | presente | assente | — | VISTO |
| A7 | **«Le voci attenuate sono fuori da questo primo lotto.»** | presente | assente | — | VISTO |

⛔ **A1 e A2 non sono difetti da curare senza una decisione**: il mockup è un prototipo **isolato**
che mostra solo le impostazioni; l'app ha una struttura sua. **A5, A6, A7 vanno nascosti** (già
deciso): sono etichette del prototipo e dati dimostrativi senza sorgente.

## B · ASPETTO E MOVIMENTO

| # | cosa | mockup | app 4174 | gravità | visto |
|---|---|---|---|---|---|
| B1 | **badge di testata** | `40 controlli · 14 temi` | `Questo profilo` | **P2** | VISTO |
| B2 | **banda tema** | card con **swatch** + eyebrow «IL TUO TEMA» + **il nome del tema in grande** («Calm») + «Palette, modalità colore, scene e tutte le regolazioni dello sfondo.» + bottone «Temi e atmosfere» | un riquadro con **solo** «Temi e atmosfere» + «Palette, modalità chiara o scura e sfondi animati si regolano nello studio temi, con anteprima.» + «Apri studio temi»: **niente swatch, niente nome del tema** | **P1** | VISTO |
| B3 | **i 5 gruppi** | «Interfaccia e conversazione» `9 CONTROLLI` · «Accessibilità e risorse» `4 CONTROLLI` · «Movimento dell'interfaccia» `11 CONTROLLI` · «Desktop» `1 CONTROLLI` · «Spazio di lettura» `1 CONTROLLI` | **nessun titolo di gruppo**: le righe sono in blocchi senza intestazione né conteggio | **P1** | VISTO |
| B4 | **colonna destra** | `aside` da **300px** con l'anteprima viva (canvas + finestra finta) + «Palette dal foglio temi del prodotto.» + «Un controllo, una preferenza.» + 2 note | **assente** | **P1** | VISTO |
| B5 | eyebrow dei gruppi | «MOVIMENTO», «INTERAZIONI», «Desktop» | «MOVIMENTO» c'è ✅ | — | VISTO |
| B6 | le **righe** | etichetta 14px/550 + aiuto, controllo a destra | ✅ stesse misure (FASE 1) | — | VISTO |
| B7 | griglia della pagina | `786px | 300px`, gap 36 | colonna unica | **P1** | MISURATO |

## C · LABORATORIO — LA BANDA (su tutti e 4 i tab)

| # | cosa | mockup | app 4174 | gravità | visto |
|---|---|---|---|---|---|
| C1 | **banda** | «MODELLO PER LE NUOVE CHAT» + glyph + nome + badge «Locale» + «Le chat già aperte non cambiano.» · «BUDGET RAM · SCENARIO DEMO» + `18,6 GiB` «su 32 GiB» + barra · **«Nessun passaggio automatico al cloud»** | «Modello attivo condiviso con Chat: **Scegli il modello**» + «RAM libera 11,7 GiB su 31,6 GiB» + barra. **Manca l'etichetta «MODELLO PER LE NUOVE CHAT»**, manca «Le chat già aperte non cambiano.», manca il terzo blocco «Nessun passaggio automatico al cloud» | **P1** | VISTO |
| C2 | **sottotitolo della pagina** | «Il modello giusto. La scelta resta tua.» | «Scegli dove eseguire i modelli. Accessi, cataloghi e runtime hanno stati distinti.» | **P2** | VISTO |
| C3 | **«Aggiungi modello»** | bottone oro in testata | **assente** | **P1** | VISTO |
| C4 | **badge di testata** | nessuno | «Computer e provider» | P3 | VISTO |
| C5 | **`span.tab-end` «Dati dimostrativi»** | presente | assente | — | VISTO |
| C6 | **le 4 schede** | Modelli · Provider · Download · Sistema, **con icone** | ✅ «Hugging Face · Provider · Download · Sistema», **con icone** | — | VISTO |
| C7 | **registro a 4 fatti** (Capacità macchina · Accessi server · Modelli osservati · Runtime locale) | **non esiste nel mockup** | presente | — | VISTO |

## D · LE QUATTRO SCHEDE

### D1 · Hugging Face (`models`)
| # | cosa | mockup | app | gravità |
|---|---|---|---|---|
| D1.1 | ricerca | «Cerca modello, autore o repository…» + «Ordina» / «Ordine del catalogo» (9 voci) | «Cerca repository Hugging Face» + autore + filtri + «Più scaricati» | **P2** |
| D1.2 | **chip** | Tutti · Locali 12 · Cloud 3 · Installati 2 · Preferiti | **assenti** (c'è un selettore di stato) | **P1** |
| D1.3 | **faccette** | 4 primarie (Grandezza · Contesto minimo · Formato · Compatibilità RAM) + **12 gruppi** dietro «Tutti i filtri» | **assenti** | **P1** |
| D1.4 | righe modello | glyph + nome + «Predefinito» + meta + disponibilità + **capacità** («8,2B / parametri totali / 32.768 token») + **stella** + casella confronta | nome + percorso + «Entra» come stima | **P2** |
| D1.5 | «15 modelli su 15 nel catalogo demo», **«Viste salvate (0)»**, «Salva vista» | presenti | assenti | — (senza sorgente) |
| D1.6 | riga di stato | «L'utente ha liberato…» | ✅ presente (testo vero) | — |

### D2 · Provider
| # | cosa | mockup | app | gravità |
|---|---|---|---|---|
| D2.1 | **card** | **2 card** `551×332`: OpenRouter (badge «Verificato · demo», righe Credenziale/Configurazione/Ultima prova, bottoni **«Configura»** e **«Verifica accesso»**) e llama.cpp («Locale · demo», «Apri sistema») | **lista di 28 fornitori** con «Aggiungi chiave» / «Prova collegamento» / «Salva collegamento»; **nessuna card col bottone «Configura»** | **P0** per la richiesta dell'owner |
| D2.2 | titolo | «Collegamenti, non scatole nere.» | ✅ **c'è già** | — |
| D2.3 | sottotitolo | «Credenziale, configurazione e raggiungibilità sono tre fatti diversi.» | ✅ **c'è già** | — |
| D2.4 | avviso | «**Qui non inserire chiavi reali.**» | assente (il prodotto è quello vero, la frase sarebbe falsa) | — |
| D2.5 | badge | «Nessuna chiave reale» | «5 con chiave · nessuno ancora provato» **falso da mostrare**: il mockup dice una cosa che nel prodotto non è vera | — |

### D3 · Download
| # | cosa | mockup | app | gravità |
|---|---|---|---|---|
| D3.1 | titolo e sottotitolo | «Ogni download, al suo posto.» / «Avanzamento, pause e recupero senza perdere il contesto.» | ✅ **identici** | — |
| D3.2 | intestazione | «Download» + «Una coda per tutti i modelli. Puoi continuare a lavorare mentre scarichi.» | ✅ **identici** | — |
| D3.3 | corpo | **VUOTO**: `empty-state` «Nessun download in coda.» + «Esplora il catalogo» | ha **3 contatori** («1 completato») e le righe vere | — (l'app è più avanti) |

### D4 · Sistema
| # | cosa | mockup | app | gravità |
|---|---|---|---|---|
| D4.1 | titolo e sottotitolo | «Il dispositivo, senza supposizioni.» / «Distingui ciò che è misurato, stimato o ancora sconosciuto.» | ✅ **identici** | — |
| D4.2 | **card** | **2 card**: «Memoria di esempio» `Fixture` con `18,6 GiB` grande + Origine/Misura sul tuo PC/GPU-VRAM · «Runtime locale» `Pronto · demo` con llama.cpp + Indirizzo/Ultima verifica reale/Inferenze eseguite + «Simula nuova verifica» | misure **vere** (RAM, disco, 3 runtime, motore grafico Vulkan/AMD) in un altro disegno | **P1** (forma) |
| D4.3 | badge | «Hardware non rilevato» | **falso**: l'app l'hardware lo misura | — |
| D4.4 | avviso finale | «In integrazione, il backend resta l'unica fonte dello stato…» | ✅ presente («GiB = 1.024³ byte…») | — |

## E · LA PAGINA DEL MODELLO

| # | cosa | mockup | app | gravità | fonte |
|---|---|---|---|---|---|
| E1 | toolbar | «Tutti i modelli» + «Banco prova» + `#model-primary-action` («Già predefinito» disabilitato / «Usa per le nuove chat») | «Tutti i modelli» ✅ + «Apri su Hugging Face» + «Copia link»; **niente «Banco prova»**, niente «Usa per le nuove chat» | **P1** | RIFERITO |
| E2 | hero | `#page-title` **40px/550** + repo + «Nei preferiti» + «Conosci il modello. Scegli come usarlo.» | eyebrow + nome + striscia; **manca «Conosci il modello. Scegli come usarlo.»** | P2 | RIFERITO |
| E3 | striscia | 4 blocchi: Destinazione · Profilo demo · Stato demo · **Nuove chat** | 6 blocchi (Origine · Stato · File · Formato · Verifica · Contesto) — **più ricca** | — | RIFERITO |
| E4 | i tre lati | Scheda Hugging Face · File del modello · Compatibilità | ✅ **gli stessi tre** | — | VISTO |
| E5 | ⛔ **`[object Object] · [object Object]`** nella scheda Compatibilità | — | **DIFETTO VERO** — ✅ **CURATO il 18/09** (commit `6da75b08`), causa: `scheda-modello.js:1004` faceva `join(' · ')` su due **fatti tipizzati** `{state, value}` | era **P1** | VISTO + MISURATO |

**E5-bis · la conferma con gli occhi miei, sulla foto `pagina-modello-compatibility_1080p_real.png`**:
il difetto si legge in fondo alla card «Contesto e capacità», subito sotto la riga «Modello servito
dal runtime → runtime non raggiungibile», e subito sopra «Misurato 18/09/2026, 18:40:01». La cura
è nel codice ma **non ancora sul 4174**: il pacchetto non è stato ricostruito di proposito, perché
tre corsie stanno scrivendo in `src/`.

**E6 · la pagina del modello, per intero (VISTO)**: toolbar con «Tutti i modelli» + «Apri su Hugging
Face» + «Copia link»; testata «MODELLO LOCALE» + nome; repo con revisione/licenza/tipo/download/like;
**striscia a 6 blocchi** (Origine · Stato · File sul disco · Formato · Verifica · Contesto richiesto);
i tre lati «Scheda Hugging Face · File del modello · Compatibilità» + nota «Nessun avvio automatico»;
card «Memoria e spazio» con verdetto **«Non entra»** e la frase «La memoria è la RAM; lo spazio è il
disco. Non sono la stessa grandezza, anche quando il server le chiama uguale.» — che è una delle
cose **migliori** della pagina, e va tenuta.

## F · CIÒ CHE L'APP HA E IL MOCKUP NON HA — non si perde

Il registro a 4 fatti del laboratorio · «Trova un modello su Hugging Face» · i 28 fornitori veri ·
la coda dei download vera · il motore grafico e i runtime misurati · le 7 sezioni piene
(chat, strumenti, memoria, privacy, costi, file, account) · la pagina del modello con le impronte
dei file · il grafico del contesto · le due tabelle dei costi · il trasferimento delle preferenze ·
l'elenco delle chiavi di `localStorage`.

⛔ **Regola dell'owner**: «NON DOBBIAMO NASCONDERE O PERDERE NESSUNA FUNZIONE ATTUALE DELLA APP».
Quindi ciò che il mockup non ha **si tiene**, si sistema nel disegno, e si **dichiara** qui.

## G · I DIFETTI CHE NON SONO DI PARITÀ (misurati, non estetici)

1. ⛔ **`[object Object] · [object Object]`** nella scheda Compatibilità (`scheda-modello.js:994`) —
   causa nota, cura di una riga.
2. ⛔ **18 controlli sotto la soglia di area toccabile 36px** (12 `calm-check` 42×25, 6 bottoni h=32) —
   ⛔ **e il mockup è sotto la stessa soglia**: decidere «come il mockup» vuol dire accettare aree
   sotto i 36px. **Decide l'owner.**
3. ⛔ **`[data-runtime-usage]`**: la telemetria è stata cancellata dal prodotto da `65e557d3` e non
   esiste in nessuno dei due mockup. O si rimette, o si tolgono le asserzioni. **Decide l'owner.**

## E-bis · LE ALTRE DUE SCHEDE DELLA PAGINA MODELLO (VISTO)

**`files`** — l'app mostra «File del modello · **1 sul disco** · **29 nel repository**»,
«L'impronta del file sul disco confrontata con quella dichiarata dal repository.», e la card del
file con il verdetto **«Coincide col repository»**, il checksum SHA-256 col bottone «Copia», la
revisione, l'impronta nel repository e quella dell'intero modello, più «▸ Altri 28 file nel
repository, non scaricati».
⇒ **Il mockup è più povero**: dice «Non verificato» e «Fixture TALOS» perché è una simulazione.
L'app ha **dati veri e un confronto d'impronta che il mockup non ha**. Qui **l'app è avanti**.
⛔ Manca solo il titolo del mockup «Il file che userai, senza ambiguità.» — il resto si tiene.

**`compatibility`** — card «Memoria e spazio» col verdetto **«Non entra»** e la frase più bella
della pagina: «*La memoria è la RAM; lo spazio è il disco. Non sono la stessa grandezza, anche
quando il server le chiama uguale.*»; poi «Contesto e capacità» con i badge «dichiarato» e i
«Sconosciuto» onesti. ⛔ **Da tenere parola per parola.**

---

## H · COSA NON HO VERIFICATO (dichiarato, non taciuto)

- **Le pagine `files` e `compatibility` della pagina modello**: guardate solo di sfuggita; le voci
  E1-E3 vengono dai referti, non dai miei occhi.
- **Il comportamento dinamico**: hover, focus, stati di caricamento ed errore non sono nelle foto.
  Il mockup ha 5 **scenari** che cambiano la pagina; l'app ha gli stati veri, che non ho forzato.
- **Le sette sezioni attenuate**: nel mockup non esistono, quindi non c'è parità da misurare — solo
  il suo stile da applicare al contenuto vero.
- **Sotto i 1080p**: non ho guardato viewport più strette (tablet/telefono), che per questo
  prodotto sono regole diverse.
