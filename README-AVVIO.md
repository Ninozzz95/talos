# TALOS Desktop — sorgenti con avvio one-click

Questo archivio contiene il codice sorgente del repository e il frontend di produzione ricompilato. Non è un mockup o uno showcase al posto dell'applicazione. L'identità di avvio è **TALOS Preview**, separata dall'installazione TALOS abituale. Il commit esatto è in `SOURCE_COMMIT.txt`; l'inventario e le impronte sono in `SOURCE-MANIFEST.json`.

## Avvio Windows x64

1. Estrarre **tutto** lo ZIP in una cartella scrivibile, non aprire lo script dentro la finestra dell'archivio.
2. Aprire la cartella `TALOS` e fare doppio clic su **`AVVIA-TALOS.cmd`**.
3. Lasciare aperta la finestra di preparazione. Al termine si apre l'harness completo.

Non occorrono installazioni globali di Node, npm o Electron, né privilegi amministrativi. Il primo avvio richiede Internet: lo script scarica la versione portabile di Node fissata nel manifesto, verifica SHA-256 dell'archivio e dell'eseguibile, installa le dipendenze dai lock, ripristina gli asset richiesti verificandoli, ricompila la UI, verifica gli addon nativi e prepara i runtime locali CPU/Vulkan. Tutto resta nella cartella estratta o nel profilo di prova. Non vengono cambiate execution policy, SmartScreen, Defender o impostazioni di sicurezza del dispositivo.

Le librerie native sono quelle effettivamente usate dall'app: Electron, node-pty, portachiavi di sistema e sqlite-vec. Non vengono sostituite con implementazioni finte. La preparazione non scarica modelli GGUF, non importa credenziali e non chiama un provider di inferenza.

Negli avvii successivi le dipendenze già preparate vengono riutilizzate quando lock e versioni corrispondono. La UI viene nuovamente compilata: una modifica ai sorgenti non deve lasciare in esecuzione un vecchio bundle. Una preparazione completa permette di usare l'app offline con un modello locale già disponibile; i servizi cloud richiedono la loro connettività.

## Configurazione del modello

La home si apre **senza modale di primo avvio**, anche senza modello. Da "Scegli un modello" o dalle impostazioni si configura esplicitamente un provider o un modello locale compatibile. Nessuna chiave è inclusa nello ZIP. Non incollare credenziali in issue, log o documentazione di revisione.

Le operazioni di terminale, file, strumenti e agente sono reali. Verificare workspace e permessi prima di eseguirle. Eliminare il wizard non concede automaticamente autorizzazioni e non sceglie un servizio a pagamento.

## Profilo, credenziali e chiusura

- Dati della preview: `%APPDATA%\TALOS Preview`.
- Profilo Chromium: sottocartella `browser` della preview.
- Namespace del portachiavi: `desktop-preview`, distinto da `desktop` dell'app abituale.
- Cache di preparazione locale: `.talos-runtime` dentro la cartella sorgenti.

Non vengono importate automaticamente chiavi dell'app stabile o dell'ambiente. Le diverse copie della **stessa preview** condividono il suo namespace del portachiavi: una cartella dati personalizzata non crea un terzo namespace delle credenziali. Non cancellare credenziali reali durante le prove.

Per terminare anche il servizio locale usare **Esci** dal menu dell'applicazione. Il comportamento della X della finestra può mantenere la shell nel tray, secondo le preferenze. Non confondere una finestra nascosta con un processo terminato.

## Modalità del lanciatore

Da un prompt nella cartella `TALOS`:

```bat
AVVIA-TALOS.cmd --prepare-only
AVVIA-TALOS.cmd --cpu
AVVIA-TALOS.cmd --verify
```

`--prepare-only` prepara senza aprire l'app. `--cpu` prepara e seleziona soltanto il motore CPU. `--verify` confronta i file consegnati con il manifesto: segnala le differenze, non le sovrascrive. I file derivati possono risultare modificati dopo un intervento intenzionale ai sorgenti; conservare una copia dello ZIP originale per confrontarli.

`--data-dir "C:\percorso-assoluto\profilo-di-prova"` permette un percorso di prova esplicito; non puntarlo al profilo della versione abituale. La shell rifiuta la sovrapposizione con la posizione standard dell'app stabile. Non usare collegamenti o junction per cache e dipendenze.

## Problemi di preparazione

Una mancata connessione, un hash errato o un addon che non si carica interrompe l'avvio con un messaggio, senza proseguire con una configurazione parziale. Non disabilitare le protezioni di Windows per aggirarlo.

Se una precedente preparazione è stata interrotta, può restare `.talos-runtime/preparation.lock`. Prima di rimuovere **solo quel lock**, controllare che nessun altro avvio della stessa copia sia in corso. Non eliminare il profilo o il portachiavi per risolvere un problema di dipendenze.

Per ricostruire gli strumenti mantenendo i dati, chiudere Talos e lavorare su una nuova estrazione verificata. Per assistenza raccogliere commit, fase e messaggio di errore; non condividere token, file privati del profilo o chiavi.

## Build, test e laboratorio componenti

Dopo la preparazione, usare il Node portabile e npm inclusi in `.talos-runtime/node-v24.18.0-win-x64`. I comandi del progetto restano quelli definiti nei rispettivi manifest:

```bat
.talos-runtime\node-v24.18.0-win-x64\node.exe --test tools\delivery\start.test.mjs
.talos-runtime\node-v24.18.0-win-x64\npm.cmd --prefix harness-ui/frontend run build
.talos-runtime\node-v24.18.0-win-x64\npm.cmd --prefix harness-ui/frontend run test:unit
.talos-runtime\node-v24.18.0-win-x64\npm.cmd --prefix harness-ui/frontend run build:lab
```

Il laboratorio resta un supporto per componenti e stati, **non sostituisce l'harness reale**. I test browser richiedono l'installazione esplicita dei browser Playwright prevista dal repository; il normale avvio dell'app non li richiede. I test completi e la qualificazione dell'eseguibile sono descritti in `docs/refactor/REVIEW-AGENT.md`.

## Perimetro della consegna e della revisione

"Sorgenti completi" descrive l'archivio, non la chiusura automatica dei 57 lotti del piano. La documentazione di revisione distingue implementato, verificato, parziale e aperto; una build verde non autorizza da sola il merge né dimostra il completamento di tutta la revisione UI/UX.

Il codice Android presente è mantenuto come parte del monorepo, ma il lanciatore riguarda esclusivamente Desktop. I submodule nativi Android esterni sono identificati con commit esatto in `EXTERNAL-GITLINKS.json`; non servono ad avviare Desktop. Non sono inclusi dipendenze installate, modelli, dati personali o credenziali.

La PR resta in bozza fino alla revisione. Nessun merge, tag, release o aggiornamento dell'installazione abituale è effettuato da questi script.
