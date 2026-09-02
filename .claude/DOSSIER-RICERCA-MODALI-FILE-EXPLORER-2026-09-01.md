# Dossier ricerca — modali ridimensionabili e comandi File Explorer

Data: 2026-09-01  
Perimetro: Harness UI desktop; `mobile/` resta sola lettura.

## Problema misurato nel codice

- La UI espone due elementi `<dialog>` reali: `#commandDialog` e `#sheetDialog`.
- `#sheetDialog` ospita molte modali logiche diverse. Una dimensione salvata per il solo elemento DOM farebbe quindi collidere Modello, Permessi, Nuova sessione, Doctor, file viewer e gli altri fogli.
- Le modali hanno `overflow: clip` sul contenitore e aree interne scrollabili: il solo CSS `resize` non offre tre prese esplicite né un contratto affidabile di persistenza.
- Il file tree della sidebar possiede già CRUD reale nel menu contestuale, ma non una toolbar visibile.
- Il chooser pre-sessione è oggi intenzionalmente in sola lettura; per “Nuova cartella” serve un’unica mutazione esplicita, confinata e validata, senza promuoverlo a file manager completo.

## Fonti primarie consultate

1. MDN, Pointer Events e pointer capture: `setPointerCapture()` mantiene la sequenza di movimento anche quando il puntatore lascia la maniglia; la cattura termina a `pointerup`/`pointercancel`.
   - https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events
2. MDN, `localStorage`: persistenza per origine attraverso reload e riaperture; accesso protetto con `try/catch` perché può essere negato.
   - https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage
3. MDN, CSS `resize`: richiede overflow diverso da `visible`/`clip` ed espone valori horizontal/vertical/both, ma non tre prese di prodotto separate.
   - https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/resize
4. W3C APG, modal dialog: focus contenuto nel dialog, `Tab`/`Shift+Tab` ciclici, Escape per chiudere e close control visibile.
   - https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/
5. VS Code, Explorer: crea/elimina/rinomina file e cartelle, drag/drop, context menu, filtro e Reveal in File Explorer.
   - https://code.visualstudio.com/docs/editing/userinterface#_explorer-view
6. Microsoft, File Explorer Windows 11: command bar e context menu privilegiano New, Cut/Copy/Paste, Rename, Share e Delete; “New > Folder” è il percorso ufficiale per creare una cartella.
   - https://support.microsoft.com/en-US/Windows/Experience/FileExplorer/file-explorer-in-windows
   - https://support.microsoft.com/en-us/word/create-a-new-folder

## Decisione upstream

- **Adotta direttamente:** Pointer Events, pointer capture, Web Storage e contratto APG dei dialog.
- **Adatta dietro componenti TALOS:** tre maniglie possedute (`larghezza`, `altezza`, `entrambe`), limiti viewport, token grafici/motion TALOS e chiave logica per ogni modale.
- **Adatta da VS Code/Windows:** toolbar compatta con Nuovo file/Nuova cartella/Aggiorna/Comprimi tutto dove le capacità esistono; nel chooser Nuova cartella/Aggiorna/Comprimi tutto/Copia percorso.
- **Rifiuta:** dipendenza drag-resize esterna, perché Pointer Events copre interamente il bisogno senza trascinare un framework di layout nel monolite; CSS `resize` da solo, perché non soddisfa le tre prese e confligge con `overflow: clip`; Cut/Paste/Delete nel chooser pre-sessione, perché amplierebbero inutilmente una superficie di selezione in un file manager distruttivo.

## Confronto one-up

- VS Code ricorda i layout e rende visibili le azioni frequenti dell’Explorer; TALOS applica la stessa prevedibilità anche alle dimensioni di ogni singola modale, non a un unico contenitore condiviso.
- Windows rende “Nuova cartella” un’azione esplicita nel luogo in cui si sceglie una cartella; TALOS la replica ma la confina alla radice navigabile, rifiuta traversal, link/reparse e nomi Windows invalidi.
- La differenziazione TALOS resta l’onestà operativa: nessuna icona è decorativa e le mutazioni non disponibili non vengono mostrate come riuscite.

## Pin

Contratti web piattaforma correnti al 2026-09-01; nessun nuovo pacchetto o versione runtime introdotti.
