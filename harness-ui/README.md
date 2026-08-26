# TALOS Harness UI

Strumento locale e autonomo per leggere le campagne autorizzate di
TALOS-BANCO. La Board mostra dati reali in sola lettura; le altre superfici del
mockup restano interattive soltanto lato UI e riportano localmente
`Demo UI · non collegato`.

Harness UI non avvia processi nel banco, non importa i suoi moduli, non scrive
nei suoi file e non dipende da Vue, Vite, npm o dalla corsia mobile.

## Requisiti

- Windows con PowerShell per lo script di verifica Chrome.
- Node.js 24.18.0 per server e test.
- Google Chrome installato per la verifica visiva locale.
- Una directory TALOS-BANCO esistente e leggibile.

Non esistono `package.json`, lockfile o installazioni da eseguire.

## Avvio rapido

Dalla radice del repository:

```powershell
$env:TALOS_BANCO_DIR = 'C:\Users\Antonino\Desktop\projects\TALOS-BANCO'
node harness-ui/server.mjs
```

Apri `http://127.0.0.1:4174/`. Il server accetta soltanto host loopback e
stampa l'indirizzo locale, mai righe o evidenze delle campagne.

### Avvio raccomandato con Permission Model

Questa variante consente a Node soltanto di leggere il codice di Harness UI e
la directory del banco. Non concede permessi di scrittura, child process,
worker o addon. Il bind loopback resta imposto dalla configurazione
dell'applicazione.

```powershell
$env:TALOS_BANCO_DIR = 'C:\Users\Antonino\Desktop\projects\TALOS-BANCO'
node --permission `
  --allow-fs-read="$PWD\harness-ui" `
  --allow-fs-read="$env:TALOS_BANCO_DIR" `
  harness-ui/server.mjs
```

## Configurazione

| Variabile | Obbligatoria | Significato |
|---|---|---|
| `TALOS_BANCO_DIR` | sì | Percorso assoluto e leggibile del banco. |
| `TALOS_HARNESS_UI_CAMPAIGNS` | no | Può soltanto restringere la allowlist iniziale, mai ampliarla. |
| `TALOS_HARNESS_UI_HOST` | no | `127.0.0.1` predefinito; ammessi soltanto loopback. |
| `TALOS_HARNESS_UI_PORT` | no | `4174` predefinito; intervallo `1024..65535`. |

Le sole campagne iniziali sono `esiti-22ago-progetti` ed
`esiti-22ago-storia`.

## Cosa è reale e cosa è demo

La Board è reale e legge:

- file JSONL contenuti nelle campagne allowlisted;
- costo canonico da `<harness>.costo.json`;
- in mancanza del costo canonico, somma delle righe marcata con `~`;
- `rapporto.txt` come blocco preformattato opaco, senza riparsarlo.

Il testo `detto` viene inserito nel DOM soltanto quando l'owner apre la riga.
`Svuota evidenze` lo rimuove dalla memoria della pagina e dal DOM, senza
cancellare o modificare file.

Al 24 agosto 2026 i due `rapporto.txt` reali non sono stati prodotti. La UI
mostra quindi `Rapporto non ancora prodotto`. Il file viene generato
esternamente dal proprietario della corsa; Harness UI non tenta di crearlo.

Chat, review, terminale, browser, automazioni, impostazioni, inspector, widget
di sessione e pannelli capability sono demo UI funzionanti soltanto nel
browser. Ogni superficie non collegata è etichettata localmente.

## API locali

Sono disponibili soltanto `GET` e `HEAD`:

- `/api/v1/health`
- `/api/v1/campaigns`
- `/api/v1/campaigns/{campagna}/snapshot`
- `/api/v1/campaigns/{campagna}/runs`
- `/api/v1/campaigns/{campagna}/report`

Le righe supportano filtri esatti `harness`, `esito`, cursore opaco e limite
massimo. Il server non abilita CORS, non espone directory e serve soltanto
`index.html`, `styles.css` e `app.js`.

## Test automatici

```powershell
node --test harness-ui/tests/*.test.mjs
```

I test usano fixture sintetiche versionate. Non sostituiscono il gate finale
sulle due campagne reali.

## Verifica Chrome

Avvia prima il server, poi esegui in un secondo PowerShell:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass `
  -File harness-ui/scripts/qa-chrome.ps1 `
  -BaseUrl 'http://127.0.0.1:4174' `
  -OutputDirectory "$PWD\harness-ui\.artifacts\qa"
```

Lo script non avvia il server e non legge direttamente il banco. Usa Chrome
installato per acquisire i sei stati canonici: desktop `1440×900`, laptop
`1024×800`, tablet `768×1024`, mobile `390×844`, mobile stretto `320×720` e
capability `390×844`. Screenshot e `qa-summary.json` vengono scritti soltanto
nella directory indicata, ignorata da Git.

## Limiti intenzionali

- Strumento interno owner-only, in un solo browser Chrome.
- Nessun supporto offline o service worker.
- Nessun gate WCAG o prestazionale bloccante in questo perimetro.
- Nessun watcher: `Aggiorna` rilegge i file su richiesta.
- Nessun ordinamento o percorso fornito liberamente dal browser.
- Il rapporto end-to-end e il confronto costo/rapporto restano pendenti finché
  i proprietari delle corse non producono entrambi i file reali.

## Problemi comuni

- `TALOS_BANCO_DIR è obbligatoria`: imposta un percorso assoluto esistente.
- `Il server locale non risponde`: avvia Harness UI e premi `Aggiorna`.
- `Rapporto non ancora prodotto`: non è un errore della UI; manca il file
  esterno della campagna.
- Porta occupata: imposta `TALOS_HARNESS_UI_PORT` su una porta loopback libera.
- Chrome non trovato: passa `-ChromePath` allo script QA.
