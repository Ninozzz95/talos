# Changelog di TALOS Desktop

## desktop-v0.1.0 — non rilasciata

- Guscio **Electron 44.3.0** della stessa interfaccia TALOS, con Node incluso, backend locale, kernel e motore di contesto (R-01).
- Installer **NSIS per utente**, senza privilegi amministrativi e **non firmato**, più archivio ZIP completo; i dati utente sono conservati dopo la disinstallazione (R-02).
- Motore **llama.cpp b10517**, CPU e Vulkan, incluso e verificato tramite SHA-256; i modelli GGUF non sono inclusi (R-02).
- Workflow Windows per i tag `desktop-vX.Y.Z`, controlli di regressione, prova di installazione/avvio/reload/disinstallazione, SHA-256 e attestazioni degli artefatti. Implementato e provato localmente; l'esecuzione su GitHub resta da verificare (R-04).
- Nessun aggiornamento automatico. Telemetria: nessuna. I provider remoti e i download dei modelli richiedono rete quando usati.
- Licenza del progetto: **AGPL-3.0-only**; le terze parti conservano le proprie licenze (R-05A).

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
