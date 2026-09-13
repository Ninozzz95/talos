# Changelog di TALOS Desktop

Forma: [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/) (letto il 13/09/2026); versioni
[SemVer](https://semver.org/): in 0.y.z tutto può ancora cambiare. La versione vive in
`package.json` e nel tag `desktop-vX.Y.Z`.

## Unreleased

## desktop-v0.1.0 — non rilasciata

**Cosa NON fa ancora:** non è firmata (Windows mostra SmartScreen), non si aggiorna da sola, non
include modelli GGUF (si scaricano dall'app), non è stata provata su Windows 10 1809 né su una
macchina senza driver Vulkan.

### Added
- Guscio **Electron 44.3.0** della stessa interfaccia TALOS, con Node incluso, backend locale, kernel e motore di contesto (R-01).
- Installer **NSIS per utente**, senza privilegi amministrativi e **non firmato**, più archivio ZIP completo; i dati utente sono conservati dopo la disinstallazione (R-02).
- Motore **llama.cpp b10517**, CPU e Vulkan, incluso e verificato tramite SHA-256; i modelli GGUF non sono inclusi (R-02).
- Il motore locale si sceglie dalla macchina: Vulkan solo se elenca una scheda; se la scheda manca o si perde durante il caricamento il modello riparte una volta sul processore; menu «Motore locale» (Automatico · Scheda grafica · Processore); stato del motore nel Laboratorio modelli (R-03).
- Workflow Windows per i tag `desktop-vX.Y.Z`: controlli di regressione, costruzione, prova di installazione/avvio/ricarica/disinstallazione, SHA-256 e attestazioni di provenienza degli artefatti (R-04).

### Changed
- Licenza del progetto: **AGPL-3.0-only** su tutto il monorepo; le terze parti conservano le proprie licenze (R-05a).
- Il repository pubblico è un monorepo: la app mobile in `mobile/`, il desktop in `harness-ui/` e `context-engine/` (R-05b).

### Security
- Nessuna telemetria. I provider remoti e i download dei modelli usano la rete solo per quell'azione.
- Renderer senza Node né preload, isolamento del contesto e sandbox attivi, navigazione e nuove finestre fuori dall'origine locale bloccate (checklist ufficiale di Electron, letta il 13/09/2026).

### Misure registrate in R-06

| Misura | Valore |
| --- | --- |
| Installer | **145,0 MiB** (152.067.178 byte) |
| RAM a riposo, guscio e backend | **611 MiB**, 10 secondi dopo la pagina pronta |
| Prima finestra visibile | **3,82 s** dal lancio strumentato dell'EXE installato; pagina pronta in 3,96 s |

Misure storiche del pacchetto R-02 sulla macchina dell'owner: Windows 11 Pro
10.0.26200 x64, Ryzen 7 7800X3D, circa 32 GB di RAM. Il tempo è misurato con
Playwright e non comprende un doppio clic manuale o SmartScreen; non è una
garanzia su altre macchine. Metodo e provenienza: [LEDGER-R06.md](LEDGER-R06.md).

### Limiti noti

- La v0.1 non è firmata: Windows può mostrare SmartScreen con autore sconosciuto.
- Requisito dichiarato: **Windows 10 1809+ x64** o Windows 11 x64. La prova su Windows 10 1809 resta da eseguire.
- Vulkan è opzionale e richiede driver compatibili; è previsto il ripiego sul motore CPU incluso. La prova su una macchina senza driver Vulkan resta da eseguire.
- Il job GitHub di release è stato provato solo in locale, mai sui runner, e le attestazioni richiedono il repo pubblico: questa versione non è ancora una release pubblicata.

Fonti di release: [LEDGER-R02.md](LEDGER-R02.md) e [LEDGER-R06.md](LEDGER-R06.md); i rapporti
R-01 e R-04 stanno nel repo di sviluppo (cartella `.claude/`, non esportata).
