# Rapporto R-05b — `Ninozzz95/talos` diventa il monorepo pubblico (13/09/2026)

Lotto iniziato da Astra (worktree `wt-astra-r05b`, interrotta dal limite d'uso Codex alle
01:56 con script, README, gitignore, test e ledger scritti ma senza prove né rapporto) e
finito inline da Claude su ordine dell'owner («B», 13/09). Scelta dell'owner sulla forma:
**A**, evolvere il repo pubblico esistente (sola mobile alla radice, 83 commit, 30 release,
chiavi APK) in monorepo con la stessa disposizione del privato.

## Cosa fa lo script (`scripts/prepara-monorepo-pubblico.ps1`)

Ledger di Astra con la ricerca: `.claude/R05B-LEDGER.md`. In breve: provenienza della copia
(origin = `Ninozzz95/talos`), copia pulita e allineata a `origin/main`; **riordino** con `git mv`
di tutto ciò che non è di radice in `mobile/` (cancello R100: solo rinomine al 100 %, zero byte
e zero mode cambiati); **esportazione** dal privato con `git archive HEAD` su un elenco di
inclusioni (radice: LICENSE, NOTICE, THIRD_PARTY_NOTICES.md, .gitattributes, .github,
README-MONOREPO.md→README.md, .gitignore-pubblico→.gitignore; `harness-ui/` server, src, public,
frontend, desktop, scripts, tests, contracts, manifesti, README, notices; `context-engine/`),
come snapshot dentro quel perimetro; **cancelli** sul candidato intero in Temp prima di toccare
la copia; con `-Esegui` il solo riordino è committato dallo script, il desktop resta in scena e
i due comandi (commit da file, push) vengono stampati, mai eseguiti.

## Cosa ha cambiato la review (rispetto al lotto di Astra)

| trovato | cura |
|---|---|
| `harness-ui/src/kernel/dist/kernelPerIlBanco.js` bloccato come `dist` | è codice a runtime importato da `talosHarness.mjs:76` (spostarlo rompe tre test al caricamento): eccezione esplicita |
| il cancello dei percorsi fermava `mobile/…/kernel/dist/kernelPerIlBanco.js`, pubblico da settimane | i cancelli di percorso e di parole saltano i blob **già in origin/main** (stesso blob anche dopo la rinomina) |
| «TALOS-BANCO» in 24 file e «aider» in 4 del desktop | sono **già pubblici** negli asset dell'APK rilasciato (13 e 6 file): una parola già uscita non trapela. Lo script chiede a origin/main quali parole dell'elenco sono già pubbliche e le conta; bloccano solo quelle mai pubblicate (prime-agent, sconto-fedelta, scorta-minima, banco di coding, falsifica.mjs) |
| «tre/gli/sugli harness» fermavano 44 righe | nel desktop «harness» è il nome del prodotto: tolte |
| la spia `C:\Users\[A-Za-z]` fermava 19 file con `C:\Users\esempio` | cerca il percorso **dell'owner** (`Users\Antonino`), come l'email in `rilascia.ps1` |
| 4174 in 143 file di harness-ui | porta predefinita del prodotto: conteggio, non blocco |
| 18 file del desktop con il percorso dell'owner (7 in chiaro, 11 nella forma `C:\\Users\\Antonino` delle stringhe JS) | ripuliti nel privato (`e8fceb6c`, `52930a21`): `esempio`; `qa-visual-pipeline.mjs` con `RADICE_PROGETTI` invece di 20 cartelle cablate |
| 2 byte NUL veri in `talosHarness.mjs` (git lo vedeva binario, `git grep` lo saltava) | escape `\x00`, stesso valore |
| il `release.yml` del desktop non aveva il cancello mobile «Codice non e' sparito di nuovo dalla release» | ripreso nel job `apk` con `working-directory: ${{ steps.dove.outputs.dir }}` |
| `licenza.test.mjs` rosso nell'albero esportato (manifesti solo privati, README inglese) | manifesti privati saltati se assenti; badge e «no telemetry» accettati |
| test: numstat scrive `-\t-` per i binari; `dist` della mobile già pubblica | asserzioni corrette |

## Prove

- `scripts/tests/prepara-monorepo-pubblico.test.mjs` (Git reale, cloni usa-e-getta): **15/15**
  — anteprima senza mutazioni, R100 + sottomoduli, idempotenza, SERIAL/PERCORSO/EMAIL piantati
  ⇒ nessun commit, PERCORSI/RICERCA/PESO/IMMAGINI respinti con copia intatta, file privato non
  committato che non esce, snapshot limitato al perimetro, modifica umana non sovrascritta.
- Anteprima (`-Riordina`, senza `-Esegui`) sul clone in Temp contro il repo vero: 926 file
  esportati (harness-ui 888 / 18,5 MB, context-engine 25, .github 7, radice 6), riordino 2.208
  rinomine, spie 0/0/0, parole mai pubblicate 0 file, immagini 2+21 tutte presenti, licenza
  con impronta, 3 sottomoduli coerenti, 22,7 s. Test puri del desktop dentro l'albero
  esportato (node_modules a giunzione): **41 verdi, 4 saltati** (manifesti solo privati).
- Giro reale su `AVM-PUBBLICA` (`-Riordina -Esegui`, 35,8 s): commit «riordino: la app mobile
  in mobile/, in vista del monorepo» = `6b3f16a`, 2.208 file, 0 inserzioni, 0 cancellazioni;
  desktop in scena: 916 file nuovi + 6 di radice modificati.

## Cosa NON è verificato

- Il job GitHub (apk e desktop) sul monorepo: non è mai girato sui runner. Il job `apk` cerca
  `mobile/package.json` (passo `dove`) ma legge `CHANGELOG.md` alla radice: per questo il
  CHANGELOG mobile resta alla radice (deciso qui, da confermare al primo tag mobile).
- I workflow pubblici sono ora quelli del ramo desktop: la lane mobile deve portarli nella sua
  lane (cherry-pick di `19f023c4`, `6b3dfa2e`, `e8fceb6c` e dei commit R-05b) prima della sua
  prossima esportazione, altrimenti la riporterebbe indietro.
- `mobile/README.md` rimanda a `LICENSE`/`NOTICE` che non stanno in `mobile/`: lo cura la lane
  mobile con `.claude/R05A-handoff.diff` (link `../LICENSE`).

## Per la lane mobile, dopo il push

Nuovo script: `scripts/prepara-monorepo-pubblico.ps1 -Repo <repo> -Copia <AVM-PUBBLICA> -Esegui`
(senza `-Riordina`, fatto una volta sola). `prepara-la-pubblicazione.ps1` non va più usato sul
pubblico. `rilascia.ps1` lo adatta la lane mobile.
