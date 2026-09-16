# Dossier di ricerca — “Apri cartella con TALOS” su Windows

Data: 1 settembre 2026  
Perimetro: Harness desktop; `mobile/` è solo riferimento e non viene modificato.

## Problema misurato

Harness Desktop è oggi un'applicazione web locale servita su loopback. La
creazione di una sessione accetta una cartella configurata all'avvio oppure un
percorso arbitrario soltanto quando la policy è `Full access`. Un verbo di
Esplora file che passasse semplicemente il percorso al browser o lo inserisse
come `cartellaLibera` trasformerebbe quindi una scelta di workspace in una
concessione di accesso totale. Questa scorciatoia è rifiutata.

Il contratto richiesto è diverso: il gesto esplicito dell'owner seleziona una
cartella come workspace; la policy della sessione resta una scelta separata.
Il browser non deve ricevere né conservare il percorso assoluto nella URL.

## Fonti primarie e implementazioni mature

1. Microsoft, **Add a File Explorer context menu command to a packaged desktop
   app**: Windows 11 richiede `IExplorerCommand` e identità applicativa per una
   voce nel menu moderno; applicazioni Win32 non pacchettizzate possono usare
   uno sparse package. Il codice caricato da Explorer deve restare rapido e il
   lavoro lungo deve iniziare solo dopo `Invoke`.
   <https://learn.microsoft.com/en-us/windows/apps/desktop/modernize/integrate-packaged-app-with-file-explorer>
2. Microsoft, **Registering Shell Extension Handlers**: `Directory` e
   `Directory\Background` sono i due contesti distinti per la cartella
   selezionata e lo sfondo della cartella.
   <https://learn.microsoft.com/en-us/windows/win32/shell/reg-shell-exts>
3. Microsoft, **Extending Shortcut Menus**: il verbo legacy può essere
   registrato nel Registro e deve quotare il percorso ricevuto come `%1`.
   <https://learn.microsoft.com/en-us/windows/win32/shell/context>
4. Microsoft PowerShell, **Start-Process**: un URL può essere aperto tramite
   l'applicazione associata; gli input non fidati non devono diventare il nome
   dell'eseguibile.
   <https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.management/start-process?view=powershell-5.1>
5. VS Code, `build/win32/code.iss`, pin
   `df2411cf7d8f2e0cfc79109a3bc8eaab2c69165b`: l'installer offre task separati
   per il menu contestuale di file/cartelle, registra sotto
   `Software\Classes` per installazioni per-utente e cancella le chiavi in
   disinstallazione. Riferimento, non dipendenza:
   <https://github.com/microsoft/vscode/blob/df2411cf7d8f2e0cfc79109a3bc8eaab2c69165b/build/win32/code.iss>
6. Playwright, **Timeouts**: il timeout per test è 30 secondi per default e
   una suite deliberatamente lunga deve usare `test.setTimeout()` localmente,
   senza allentare i timeout di tutte le altre prove.
   <https://playwright.dev/docs/test-timeouts>
7. MDN, **Animation.finished** e **Animation.cancel()**: la promessa `finished`
   risolve al completamento e viene rifiutata se l'animazione viene annullata;
   un lifecycle che usa la stessa callback per entrambi i casi deve quindi
   possedere una generazione esplicita per distinguere chiusura valida e
   callback obsoleta.
   <https://developer.mozilla.org/en-US/docs/Web/API/Animation/finished>
   <https://developer.mozilla.org/en-US/docs/Web/API/Animation/cancel>

## Decisione upstream

**ADAPT dietro un contratto TALOS.** Non si integra oggi una DLL COM né un
pacchetto MSIX perché Harness Desktop non possiede ancora l'installer e un
percorso eseguibile stabile. Il prototipo di sviluppo usa il verbo legacy
per-utente sotto `HKCU`, reversibile e senza UAC. La versione di produzione
adotterà direttamente il contratto Windows 11 `IExplorerCommand` con identità
applicativa, registrazione e rimozione possedute dall'installer.

Non viene aggiunta alcuna dipendenza npm. L'unico riferimento implementativo
esterno è VS Code al pin indicato; il protocollo interno resta proprietario di
TALOS e provider-neutral.

Per la matrice visuale si **adatta** direttamente il contratto Playwright:
timeout locale di 120 secondi per il solo test che produce 24 screenshot; il
timeout globale e quello delle singole asserzioni restano invariati.

Per le transizioni si **adatta** il lifecycle WAAPI già posseduto da TALOS:
nessuna libreria nuova; ogni uscita avanza la generazione della vista che sta
chiudendo. Una riapertura successiva la invalida, mentre una chiusura non
interrotta può rimuovere `active` quando `finished` risolve.

## Contratto di sicurezza scelto

- Il launcher locale legge una credenziale generata dal server e invia il
  percorso tramite POST loopback con un header non utilizzabile da una pagina
  cross-origin attraverso il preflight corrente.
- Il server risolve junction/symlink con `realpath`, richiede una directory
  esistente e accessibile e conserva il percorso solo in memoria.
- La risposta contiene un identificatore crittograficamente casuale, mai il
  percorso. La URL usa un fragment, che non viene inviato al server statico.
- L'intenzione ha durata limitata, viene eliminata dopo l'avvio riuscito e non
  viene consumata se l'avvio fallisce prima di creare la sessione.
- La sessione usa la policy già scelta dall'owner. `Workspace write` non viene
  riscritto in `Full access`.
- Percorsi mancanti, file al posto di cartelle, credenziali errate, token
  scaduti e server spento producono messaggi naturali e azionabili.

## Limite deliberato del prototipo

Su Windows 11 il verbo legacy può apparire sotto **Mostra altre opzioni**. La
voce moderna, l'icona definitiva, il single-instance nativo, l'avvio automatico
del runtime, upgrade/rollback e disinstallazione transazionale appartengono
alla fase Installer. Il prototipo non incorpora il percorso del checkout in un
artefatto di produzione: la registrazione per-utente punta volutamente allo
script della lane corrente ed è rimovibile con lo stesso comando.
