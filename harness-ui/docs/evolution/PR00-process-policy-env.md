# PR00 — restringimento dell'ambiente dei processi

## Perimetro

Base: `Ninozzz95/talos`, commit
`13f65c15cdeaf8986b882993a0773cdeafb867d2`.

Questa modifica corregge soltanto il contratto `envKeys` di
`runApprovedProcess`. Non introduce Supervisor, self-extension, nuove authority,
nuove dipendenze, modifiche al kernel, all'installer o al comportamento di Forge.
La correzione dell'allowlist non e' una sandbox OS e non prova il confinamento
previsto dall'architettura evolutiva.

## Difetto riprodotto

`prepareApprovedProcess` filtrava l'ambiente con l'intersezione fra `envKeys`
della richiesta e `envAllowlist` della policy. Successivamente `prepare`
ricostruiva l'ambiente da `process.env` usando l'allowlist generale.
Una variabile presente nel processo padre, ammessa dalla policy ma esclusa
dalla richiesta, veniva quindi reintrodotta prima di `spawnFn`.

La riproduzione usa esclusivamente variabili sintetiche `TALOS_TEST_ENV_*`.
Il comportamento e' stato osservato sia allo `spawnFn` iniettato sia in un vero
processo Node figlio. Non sono state lette o pubblicate credenziali reali.

## Correzione

`prepare` riceve internamente l'allowlist effettiva, con il vecchio default per
`spawn`, `execFile` ed `execFileSync`. `prepareApprovedProcess` passa l'intersezione
e l'ambiente viene costruito una sola volta.

Contratto conservato:

- `envKeys` assente: usa l'allowlist della policy;
- `envKeys: []`: nessuna variabile inoltrata dalla policy;
- richiesta esplicita: puo' restringere, mai ampliare, la policy;
- valori espliciti: prevalgono sul padre soltanto per chiavi ammesse;
- input non validi: rifiutati prima dello spawn.

Non cambia l'API pubblica. Non sono modificati i test preesistenti per ottenere
un risultato verde artificiale.

## Prove eseguite

Ambiente locale: **Linux x64, Node v22.16.0, npm 10.9.2**.
Il clone non era disponibile per un errore DNS del container. Sono stati
ricostruiti via connettore GitHub i due file necessari alla baseline, verificando
che i loro Git blob hash fossero identici a quelli del commit:

| File | Git blob SHA-1 originale |
| --- | --- |
| `src/process-policy.mjs` | `e0d24aa8fa3e0f8bc533dff751fa4d435fc97a3e` |
| `tests/process-policy.test.mjs` | `c593ec0860dae659fe97f70518ea26f1236ec0b8` |

I percorsi della tabella sono relativi a `harness-ui/`. Non si tratta di un
checkout completo ne' di un'attestazione dell'intero repository.

| Suite | Prima | Dopo |
| --- | --- | --- |
| 8 test preesistenti di process policy | 6 pass, 2 fail | 6 pass, gli stessi 2 fail |
| 15 nuovi test di regressione | 8 pass, 7 fail | 15 pass, 0 fail |

La nuova suite include una verifica esaustiva di **1.024 combinazioni** fra
chiavi richieste, variabili del padre e override espliciti. Include inoltre un
vero processo figlio e controlli sulle tre API legacy. Dopo la correzione e'
stata ripetuta altre cinque volte: sempre 15/15. Sono passati anche i controlli
`node --check` del modulo e della nuova suite.

I due fallimenti preesistenti sono le verifiche del cwd esterno che usano il
letterale Windows `C:\\outside`: su Linux il percorso non e' assoluto e il modulo
restituisce `CWD_REQUIRED`, mentre il test attende `CWD_NOT_ALLOWED`.
Sono fallimenti di baseline, **non test saltati e non regressioni della patch**.

Comandi eseguiti dalla root dello snapshot:

```sh
node --check harness-ui/src/process-policy.mjs
node --check harness-ui/tests/process-policy-env-narrowing.test.mjs
node --test --test-reporter=tap harness-ui/tests/process-policy.test.mjs
node --test --test-reporter=tap harness-ui/tests/process-policy-env-narrowing.test.mjs
```

## Gate ancora aperti

La suite completa del repository, Windows, Electron e installer **non sono
stati eseguiti localmente**. Il checkout esterno del kernel dell'owner non e'
stato consultato. Non si deduce un esito verde per questi gate dai test mirati.

Il workflow esistente `.github/workflows/ci.yml` esegue gia' `desktop-core` su
`windows-latest` con Node 24 e `node --test tests/*.test.mjs`: include la nuova
suite senza modificare la CI. Prima del merge servono la verifica Windows e i
gate pertinenti del repository; questa PR nasce **in bozza**, non pronta per una
release. Non modifica `main`, non crea tag e non pubblica installer.

## Passo successivo, non implementato qui

Uno spike Windows separato deve provare AppContainer, Job Object, identita' del
peer IPC, revoca e terminazione dell'albero dei processi. Soltanto dopo quel gate
si collega generazione del codice e hot activation. Il runtime ufficiale resta
fidato nella prima fase; il confinamento dell'intero runtime evolvibile rimane un
traguardo distinto e non viene dichiarato raggiunto da questa correzione.
