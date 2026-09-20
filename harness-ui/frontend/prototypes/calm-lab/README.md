# TALOS Calm Lab 04 — riferimento interattivo

Aprire `TALOS-Calm-Lab.html` nel browser. Non servono server, chiavi o Internet. È un prototipo, non la shell Electron. Il catalogo, i prezzi, la memoria, il download e il banco prova sono dimostrativi. Nessuna inferenza o chiamata provider.

## Ambito approvato

Catalogo a tutta larghezza; clic sul modello → pagina dedicata con scheda Hugging Face, file e compatibilità. Filtri funzionali v03 preservati: parametri totali/attivi MoE, intervalli, formato, quantizzazione, file, RAM, contesto, attività, capacità, lingue, autore, licenza, accesso, provider, stato, preferiti e costi separati. Dati ignoti espliciti, filtri combinabili, recovery, ordinamento e viste salvate.

## Aspetto: tutti i 40 controlli

14 temi originali, chiaro/scuro/sistema, scena indipendente, densità, lingua, scala UI/chat, composer, messaggi, pannelli e layout desktop. Movimento: attivazione, renderer, qualità, tutti gli otto parametri della scena, sospensione, risparmio dati, riduzione del movimento, profilo, curva, durata, intensità UI, stagger e sei famiglie di animazioni. Ricerca, reset selettivi, reset generale e errori di persistenza.

I controlli sono custom, con pulsanti semantici, combobox/listbox, switch e slider. I nodi originari nascosti servono solo da ponte di valore/eventi. Non sono un secondo store nel prodotto. Il prototipo ha invece uno storage separato `talos.calm-lab.prototype.appearance.v4`: non importa le preferenze del profilo TALOS.

Il selettore cambia davvero i token di tema e la modalità. Il campione live usa le scene del prodotto e rispetta il movimento ridotto del sistema. Impostazioni relative alla conversazione/pannelli sono dimostrate dal campione, non da un agente reale. La lingua dei menu nel prototipo è una preferenza dimostrata, non una traduzione integrale della UI. I limiti sono distinti dai percorsi reali di applicazione/salvataggio mantenuti nella PR.

## Riproduzione

```sh
node build.mjs
node --test tests/*.test.mjs
python tests/controls-browser.py
python tests/appearance-browser.py
python tests/browser03.py --label reviewer
```

Test browser: Python 3 + Playwright 1.57.0 e Chromium. `CHROMIUM_PATH` può specificare il browser; il default Linux è `/usr/bin/chromium`. I test del prototipo iniettano l'HTML esatto. La suite appearance usa uno storage in memoria dichiarato per i roundtrip; non prova il profilo Desktop. I test produttivi sono separati in `harness-ui/frontend/tests/qualification/calm-controls-real.mjs` e richiedono il checkout completo e il bundle compilato.

Per rigenerare i contratti dal repository, in `harness-ui/frontend/prototypes/calm-lab`:

```sh
node make-contract.mjs
node build.mjs
```

Fuori dal repository passare a `make-contract.mjs` la directory `harness-ui/frontend/src` di un checkout TALOS contenente i controlli custom. Non rieseguire trasporti storici `*-slice`. Il verificatore del dossier confronta i byte senza eseguirli.

Il codice derivato da TALOS conserva la licenza del repository (GPL-3.0-or-later; vedere LICENSE e NOTICE). Nessun font, modello, runtime o credenziale incluso.
