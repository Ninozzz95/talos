# Laboratorio File / Agenti

Prototipo desktop offline. Nessuna connessione a filesystem, repository, modello o stream Talos. I dati sono dimostrativi e le operazioni avvengono nella memoria del browser.

```sh
python build.py
python build.py --check
node --test tests/*.test.mjs
```

Aprire `talos-sidebar-interattiva.html`, generato dal primo comando. I test browser richiedono Playwright Python e Chromium; comandi completi e limitazioni in [TESTING.md](../docs/TESTING.md). Il dossier parte da [REVIEWER_START.md](../docs/REVIEWER_START.md).

Il file generato è escluso da Git per tenere il diff centrato sui sorgenti. Nessun font viene distribuito. La shell è quella del laboratorio approvato, non una copia pixel-per-pixel della build desktop avviata.
