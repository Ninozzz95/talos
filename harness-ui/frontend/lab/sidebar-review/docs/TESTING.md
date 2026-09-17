# Testing — risultati e riproduzione

Data del passaggio: 17 settembre 2026. Sorgenti applicativi verificati al commit `073f661966c1443bf5049b43940529aedad6cb67`. Gli hash Git dei 14 sorgenti e di `build.py` coincidono con i file locali utilizzati per le prove.

## Risultato finale

| Gruppo | Esito | Significato |
| --- | --- | --- |
| Node: stato | 8/8 | Tab/dettaglio, sessioni, resize, conflitto, unsubscribe e revisione |
| Node: hardening | 27/27 | Nomi, collisioni, ricerca/regex, geometria virtuale, stati terminali |
| Browser: prototipo | 37/37 | Flussi File/Agenti/graph/Review e stati |
| Browser: explorer | 18/18 | CRUD demo, ricerca, contesto sessione, grafo e target ARIA |
| Browser: hardening | 43/43 | Riferimenti, copie, snapshot Review, tastiera, virtualizzazione, resize e rete |
| Fixture CSS | 16/16 | Visibilità, nodo/scroll conservati, selezioni invalide, hidden e isolamento |
| Build riproducibile, sintassi JS, compilazione Python | Superati | Controlli locali, non build Talos |
| Typecheck dei due moduli puri | Superato | Solo `inspector-state.mjs` e `explorer-model.mjs` |

Totali: **35 test Node, 98 controlli browser, 16 condizioni CSS**. I controlli browser sono asserzioni dentro scenari, non 98 sessioni indipendenti. Le esecuzioni iniziali della baseline erano 8 Node e 55 browser; i rapporti finali sostituiscono quei conteggi per il nuovo laboratorio.

HTML finale: **116.112 byte**. SHA-256: `59b2b6d1ce90f7b29a74f6ba0f9646f3be980776767e6b0930c27882f8ce20f1`.

## Ambiente

Node 22.16.0, Python 3.13.5, TypeScript 5.8.3, Chromium locale e Playwright Python. La versione del browser è registrata nel rapporto `hardening-report.json`. Non sono state aggiunte dipendenze al package del prodotto. Le prove browser richiedono Playwright e un Chromium compatibile già disponibili; `CHROMIUM_PATH` può selezionare l'eseguibile.

```sh
cd harness-ui/frontend/lab/sidebar-review/prototype
python build.py
python build.py --check
node --test tests/*.test.mjs
python tests/test_prototype.py
python tests/test_explorer.py
python tests/test_hardening.py
python tests/test_visibility.py

tsc --allowJs --checkJs --noEmit --target es2022 --module nodenext   src/inspector-state.mjs src/explorer-model.mjs
for f in src/*.js src/*.mjs; do node --check "$f" || exit 1; done
python -m py_compile build.py tests/*.py
```

I rapporti e gli screenshot vengono scritti in `artifacts/`, esclusi da Git salvo la directory vuota. Nel pacchetto consegnato gli esiti verificati sono separati in `evidence/` per non confonderli con successive esecuzioni.

## Limitazione del trasporto nel browser di prova

In questo ambiente `file://` e il server HTTP loopback vengono bloccati dall'amministrazione del browser. È stato quindi usato `set_content` per il laboratorio e:

```sh
python tests/test_visibility.py --inline
```

Questo incorpora **gli stessi byte CSS**, registra SHA-256 e trasporto nel JSON, senza sostituire le regole da testare. Verifica il comportamento dei selettori ma **non il caricamento HTTP né il bundling dell'import**. Su una macchina non soggetta al blocco usare la modalità HTTP predefinita e aprire anche la fixture root, che punta al vero foglio di produzione.

Nessun errore JavaScript o richiesta di rete è stato osservato nei percorsi verificati. Non è una prova esaustiva di assenza di bug o di sicurezza dell'applicazione.

## Non eseguito / non dichiarato superato

Build desktop completa, lint del repository, typecheck dell'intera app, CI remota, test con una sessione viva, compatibilità di tutte le WebView, audit screen reader e contrasto integrale. Il checkout completo con dipendenze non era disponibile. Nessun errore di questi gruppi viene attribuito al preesistente: non sono stati eseguiti, quindi non è possibile classificarli.

I launcher includono `--no-sandbox` per il container. Non usarli con contenuti non fidati e non trasferire questa opzione alla configurazione di produzione. I test non inviano messaggi, non avviano agenti e non scrivono nel workspace reale.
