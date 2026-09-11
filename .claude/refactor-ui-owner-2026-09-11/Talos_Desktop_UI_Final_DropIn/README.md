# TALOS Desktop Final UI — Drop-in

Pacchetto di integrazione della UI desktop approvata, costruito sulla copia `harness-ui` fornita nella conversazione.

## Vincoli rispettati

- **Chat preservata**: nessuna nuova griglia o ridisposizione della sezione Chat. Il renderer Canvas è decorativo e non partecipa al layout.
- **Theme engine esistente come fonte di verità**: scene e rifiniture consumano i token TALOS correnti.
- **14 scene animate**: Calm, Forge, Paper, Terminal, Aurora, Glacier, Ember, Atlas, Noir, Signal, Violet, Claudius, Basicus, Telemetry.
- **Reduced motion**: la scena resta coerente ma non continua a muoversi.
- **Thread visibile**: la scena principale della Chat diventa statica; la preview nelle Impostazioni continua a muoversi.
- **Rollback**: ogni applicazione crea un backup sotto `.talos/ui-backups/`.

## Installazione Windows

1. Estrai questo ZIP in una cartella qualsiasi.
2. Apri PowerShell nella **radice del repository TALOS** (quella che contiene `harness-ui`).
3. Preflight, senza modificare nulla:

```powershell
& "<cartella-pacchetto>\VERIFICA-TALOS-UI.ps1" -Root $PWD
```

4. Applica:

```powershell
& "<cartella-pacchetto>\APPLICA-TALOS-UI.ps1" -Root $PWD
```

Oppure esegui `APPLICA-TALOS-UI.cmd` dalla radice del repository.

5. Verifica l'installazione:

```powershell
& "<cartella-pacchetto>\VERIFICA-TALOS-UI.ps1" -Root $PWD -Installed
```

Il `public/` corrente viene aggiornato subito; i sorgenti frontend ricevono gli stessi moduli per le build successive.

## Rollback

Dalla radice TALOS:

```powershell
& "<cartella-pacchetto>\RIPRISTINA-TALOS-UI.ps1" -Root $PWD
```

Il ripristino usa l'ultimo backup registrato. I backup precedenti restano disponibili e possono essere indicati con `-Backup`.

## File toccati dall'installer

Aggiunti/coperti:

- `harness-ui/frontend/src/motion/desktop-scenes.js`
- `harness-ui/frontend/src/motion/desktop-background.js`
- `harness-ui/frontend/src/styles/desktop-final.css`
- `harness-ui/public/talos-desktop-motion.js`
- `harness-ui/public/talos-desktop-final.css`

Patch minime e idempotenti:

- `harness-ui/frontend/src/main.js` — bootstrap del renderer dopo il legacy app.
- `harness-ui/frontend/src/styles/main.css` — import finale di `desktop-final.css`.
- `harness-ui/public/index.html` — collegamento immediato agli asset drop-in del `public/` già costruito.

`frontend/index.template.html` non viene modificato: nelle build successive il renderer e il CSS entrano dal grafo sorgente di `main.js`/`main.css`.

## Verifiche già eseguite prima della consegna

- 14/14 scene Canvas producono pixel.
- 14/14 scene cambiano frame nel tempo.
- cambio scena live verificato.
- Chat con messaggi: scena principale statica; preview impostazioni animata.
- applicazione su copia pulita, seconda applicazione idempotente e rollback.
- confronto SHA-256 dei file originali dopo rollback.
- estrazione pulita dello ZIP e verifica manifest/checksum.

I report sono in `review/`.

## Nota sulla baseline

Il target verificato è l'archivio `harness-ui.rar` fornito nella conversazione. L'installer non richiede hash identici: esegue un controllo strutturale e rifiuta `main.js`/`index.html` se non riconosce gli anchor necessari, evitando patch silenziose su una struttura incompatibile.
