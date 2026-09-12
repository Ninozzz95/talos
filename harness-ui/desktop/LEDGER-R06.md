# LEDGER R-06 — le tre misure del prodotto installato (13/09/2026)

Riga R-06 del piano decisionale (`.claude/PIANO-DECISIONALE-RELEASE-DESKTOP-2026-09-12.md`):
«misure mai prese: peso installer, RAM a riposo, tempo dal doppio clic alla prima schermata —
tre numeri nel ledger, macchina dichiarata». Prese sul pacchetto di R-02 (`5c3cb15c`) con lo
smoke di R-04 (`scripts/ci-smoke.ps1` → `scripts/ci-smoke-installed.mjs`), non con una prova
a parte: così ogni release futura le rimisura da sola nel riepilogo del job.

**Macchina:** Windows 11 Pro 10.0.26200 x64, AMD Ryzen 7 7800X3D (16 processori logici),
33.944.801.280 byte di RAM, pwsh 7.6.5, Node 24. Installer lanciato da disco locale,
installazione per utente in `%LOCALAPPDATA%\Programs\talos-desktop`.

| misura | valore | come |
|---|---|---|
| peso dell'installer | **152.067.178 byte (145,0 MiB)**; zip 255.856.651 byte (244,0 MiB); installato su disco 730.817.105 byte (8.263 file) | `Get-Item`, `.prove/R04-ci-smoke.json` e `.prove/R02-installer.json` |
| RAM a riposo | **611 MiB in tutto**: guscio 479 MiB su 4 processi (Browser 114, GPU 141, Utility 53, Tab 172) + backend 132 MiB | 10 s dopo la pagina pronta, senza interazione; guscio da `app.getAppMetrics()` (`memory.workingSetSize`, KB), backend da `WorkingSet64` del pid; due giri: 640.512.000 e 641.196.032 byte |
| tempo alla prima schermata | **3,82 s** alla prima finestra visibile, 3,96 s pagina pronta (`.prove/R02-installer.json`, 12/09 22:38 UTC); 5,1–5,6 s nello smoke (misura più larga: fino all'URL senza token) | `performance.now` dal lancio Playwright dell'exe installato: **non è un doppio clic**, è la misura più vicina ripetibile in CI |

Per confronto R-01 da sorgente (`.prove/R01-misure.json`): prima finestra 1,51 s, backend 103,6 MiB.
Il pacchetto installato paga 2,3 s in più all'avvio (NSIS per utente su disco, `resources/`
non compressa, primo avvio dopo installazione) e 28 MiB in più sul backend (`node_modules` di
produzione dallo staging).

Altre misure raccolte dallo stesso smoke, per la release: installazione silenziosa 39,3–48,2 s
(tre giri), disinstallazione 4,2–20,3 s (dipende da quando il disinstallatore copiato in Temp
finisce la pulizia), chiusura dell'app 1,1–5,7 s.

**Non verificato:** le stesse misure su un Windows 10 1809 e su una macchina senza GPU Vulkan;
il tempo da un doppio clic vero (Esplora risorse) non è misurabile da uno script senza un
sensore esterno e resta dichiarato tale.
