# Consegna — avvio server e watcher workspace

Data: 2026-09-01
Stato: **boot corretto; pressione risorse del watcher attivo elevata e passata
al P0 lag**.

## Cosa è stato trovato

Il server precedente avviava un watcher ricorsivo per ogni sessione storica
durante il ripristino. Prima ancora di mettersi in ascolto aveva circa 130.000
handle e 1,8 GB di memoria privata. Questo rendeva l'avvio praticamente
bloccato.

## Correzione chiusa

`session-registry.ripristina()` ora ricostruisce le sessioni senza avviare
watcher. Il watcher nasce soltanto quando una sessione viene realmente avviata
o ripresa, e la stessa sessione non ne crea due. Il test permanente è
`SESSION-RESTORE-LAZY-WATCHER-24`.

## Evidenza

- RED: dopo `ripristina()` risultava un watcher attivo invece di zero.
- Focused GREEN session registry + watcher: **221/221**.
- Boot reale dopo fix: salute in **1,296 s**, circa **275 handle**, **82 MB**.
- Backend completo finale: **1253/1253**.
- Salute corrente di `4174`: HTTP **200**.

## Debito misurato trasferito al P0 lag

Dopo l'attivazione di una singola workspace grande il processo è cresciuto in
modo progressivo: prima circa 22.450 handle / 295 MB, poi 179.737 / 2,36 GB e
infine 255.309 / 3,03 GB. Il server resta raggiungibile, ma questo non è uno
stato accettabile né viene dichiarato robusto. Il processo non è stato
riavviato alla fine della misura, così il profilo del lag può osservare lo
stato degradato reale prima di qualunque modifica.

## Dati storici non inventati

Su 17 registri storici ispezionati, 15 contengono soltanto eventi
`WorkspaceChanged` senza intestazione, uno contiene corruzione interna e uno è
ripristinabile. Non sono stati modificati, ricostruiti o cancellati: mancano i
dati necessari per recuperarli onestamente.

## Regola processo owner

L'owner autorizza permanentemente la gestione e il riavvio del solo server
desktop `127.0.0.1:4174`. Prima e dopo ogni ciclo devono essere verificati PID,
command line, cartella di lavoro, porta e health; nessun processo estraneo può
essere terminato.
