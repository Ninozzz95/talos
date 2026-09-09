# Consegna — descrizioni umane nei comandi espansi

Data: 2026-09-01  
Perimetro: Harness UI desktop.  
Stato: implementazione e gate principali verdi; review indipendente richiesta prima del commit.

## Cosa è cambiato

Quando l’owner apre un riepilogo come “7 comandi eseguiti”, ogni comando shell può ora raccontare **perché** è stato eseguito con una frase breve prodotta dal modello. La stessa riga nasce, si aggiorna e si conclude senza trasformarsi nel generico “1 comando eseguito”.

Esempio reale verificato con Qwen 3.8 Flash:

- riga leggibile: “Sto verificando la versione di Node.js installata sul progetto”;
- dettaglio espanso: `node --version`;
- esito reale: `exit 0`, `v24.18.0`.

Le sessioni vecchie o un provider che non fornisca il campo continuano a mostrare il fallback esistente. Gli schemi di MCP, plugin, Forge e strumenti terzi non sono stati modificati.

## File toccati da questa correzione

- `.claude/DOSSIER-RICERCA-DESCRIZIONI-COMANDI-2026-09-01.md`
- `.claude/LEDGER-DESCRIZIONI-COMANDI-2026-09-01.md`
- `.claude/CONSEGNA-DESCRIZIONI-COMANDI-2026-09-01.md`
- `.claude/PIANO-COMPLETO-DESKTOP-2026-08-31.md`
- `.claude/QA-VISIVA-HARNESS-2026-08-30.md`
- `harness-ui/src/runtime-owner-adapter.mjs`
- `harness-ui/tests/runtime-owner-adapter.test.mjs`
- `harness-ui/public/app.js`
- `harness-ui/frontend/tests/browser/baseline-shell.spec.mjs`
- `harness-ui/frontend/tests/fixtures/legacy-contract.snapshot.json`

## Prove eseguite

- RED adapter: export mancante, test fallito come previsto.
- RED UI: atteso “Verifica la configurazione del server”, ricevuto “1 comando eseguito”.
- Test adapter mirati: **8/8 verdi**.
- Backend completo: **1.188/1.188 verdi**.
- Frontend `npm run verify`: verde dopo l’aggiornamento mirato del digest `app.js`.
- Browser prodotto sul server owner 4174: **38/38 verdi**.
- Laboratorio isolato: **3/3 verdi** a 1440×900, 1280×800 e 1024×800.
- Gate reale isolato su 4175: Qwen `qwen/qwen3.8-flash` ha prodotto davvero il campo `descrizione`; shell conclusa con successo.
- Server owner 4174: HTTP 200 prima e dopo; mai fermato o riavviato.

## Screenshot ispezionati per intero

- `harness-ui/frontend/artifacts/tool-description-1440x900.png`
- `harness-ui/frontend/artifacts/tool-description-1024x800.png`

La nuova gerarchia è corretta: conteggio aggregato sopra, intento umano nella riga, comando/esito sotto. Nessuna duplicazione di `descrizione` nel dettaglio.

Finding separato annotato: a 1024×800 il rail destro comprime/taglia visivamente la parte destra del composer. È preesistente e fuori dal piccolo fix; resta un debito nominato nel taccuino, non è stato ignorato.

## Osservazione di robustezza

Dopo il tool riuscito, il secondo giro Qwen sul server isolato non ha chiuso rapidamente con “OK”. La sessione di prova è stata annullata e il server isolato fermato. Il fatto non invalida la prova della descrizione, già presente negli eventi reali, ma resta un finding distinto da approfondire nel lifecycle/runtime. Il server owner non è stato coinvolto.

## Riepilogo semplice dello step

Prima, aprendo il gruppo, vedevi tante righe tutte uguali e dovevi leggere i comandi tecnici per capire cosa stesse facendo TALOS. Ora il modello dà un titolo comprensibile a ogni comando shell e quel titolo non scompare quando il comando finisce. Chi vuole controllare i dettagli può ancora aprire la riga e vedere comando ed esito veri.
