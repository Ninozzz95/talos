# R-05b · registro di esecuzione · 13 settembre 2026

Sottosistema: distribuzione/documentazione TALOS desktop. Base privata `6b3dfa2e`.
Nessun add/commit/push nel worktree; nessuna scrittura nella copia originale, nessuna rete salvo documentazione; nessuna porta di servizio.

## Ricerca prima del codice

Fonti lette il 13/09/2026:
- https://git-scm.com/docs/git-mv — aggiorna indice, gitfile/core.worktree e tenta di aggiornare `.gitmodules`.
- https://git-scm.com/docs/git-diff — `-M100%` richiede identità; confrontare anche mode e blob, non solo la presentazione stat.
- https://git-scm.com/docs/git-log — `--follow` attraversa rinomine di un solo file, con limiti nella storia non lineare.
- https://git-scm.com/docs/gitmodules — configurazione alla radice, path relativo al superprogetto.
- https://git-scm.com/docs/git-archive — snapshot di un albero Git; nessuna copia dello stato privato non committato.
- https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases — release legate a tag, asset associati alle release. Inferenza: un commit di spostamento non modifica vecchi tag/asset.
- https://github.com/actions/checkout — sottomoduli disabilitati di default, `recursive` per il nativo.
- https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/licensing-a-repository — Licensee confronta LICENSE, complessità e avvisi vanno separati.
- https://github.com/laurent22/joplin — un prodotto multipiattaforma, accessi distinti per installazione e sviluppo.
- https://github.com/bitwarden/clients — README breve con perimetro esplicito e collegamenti ai client/documentazione (mobile separato oggi).
- https://github.com/rhysd/actionlint/releases/tag/v1.7.12 — versione richiesta.

Decisione upstream: adottare direttamente Git **2.55.0.windows.3**, archive/mv/diff/grep e tar di Windows; nessuna reimplementazione delle rinomine. Node **24.18.0** `node:test`, PowerShell 7; `github-actionlint@1.7.12` solo da cache (il primo npx offline trova ENOTCACHED). I pin Actions già presenti restano invariati, incluso checkout `3d3c42e5aac5ba805825da76410c181273ba90b1`.

## File esatti

Creare:
- `scripts/prepara-monorepo-pubblico.ps1`
- `scripts/tests/prepara-monorepo-pubblico.test.mjs`
- `README-MONOREPO.md`
- `.gitignore-pubblico`
- `.claude/R05B-LEDGER.md`
- `.claude/RAPPORTO-R05B-MONOREPO-PUBBLICO-2026-09-13.md`
- `.claude/R05B-workflow-release.yml.diff`
- `.claude/R05B-workflow-ci.yml.diff`
- `.claude/R05B-ispezione.json`
- `.claude/R05B-prove.log`
- `.claude/R05B-esportazione.log`
- `.claude/R05B-desktop-puri.log`
- `.claude/R05B-actionlint.log`
- `.claude/R05B-prepare-fixture.mjs`

Non modificare workflow: ispezione completa invalida l'ipotesi iniziale di spostare CHANGELOG. `scripts/rilascia.ps1:105` pretende quello in radice, quindi si applica l'eccezione espressa dall'owner; APK già corretto con changelog alla radice. CI mobile usa `dove` per tutti i percorsi. Artefatto APK è intenzionalmente copiato in GITHUB_WORKSPACE, non un sorgente mobile rimasto alla radice.

## Contratti e simboli

CLI stabile nuova: `-Repo`, `-Copia`, `-Esegui`, `-Riordina`; default Repo padre di scripts, Copia clone pubblico dell'owner.
Funzioni interne previste: `Git`, `Scrivi`, `Percorso-Sicuro`, `Leggi-Albero`, `Disposizione`, `Verifica-Provenienza`, `Controlla-Copia`, `Riordina-Mobile`, `Esporta-Snapshot`, `Verifica-Immagini`, `Cancelli`, `Riepilogo`.
Schema locale `r05b-preparazione.json`: versione 1, base pubblica, HEAD destinazione, sorgente, albero preparato. Nessuna API prodotto/schema/migrazione modificati.

## Ordine e gates

1. RED `R05B-CLI`: script mancante. Test Node costruisce clone pubblico temporaneo e fixture sorgente dichiaratamente sintetica con Git reale, senza modificare il worktree.
2. Preflight destinazione: remote GitHub o catena locale verificata fino al clone pubblico, upstream origin/main, pulizia e assenza divergenza. Riesecuzione ammessa soltanto per uno stato preparato identico e riconosciuto.
3. Costruzione candidato in Temp (anche guarda-e-basta: nessuna mutazione del Repo/Copia). Riordino con git mv; prova raw R100, mode/blob identici. Riscrittura `.gitmodules` differita al secondo commit: è matematicamente incompatibile con zero byte modificati nel primo. Il primo commit è solo preparatorio e non va taggato/pubblicato da solo.
4. Archive HEAD del privato a inclusioni, snapshot limitato a desktop/context e radici esportate. README e ignore vengono da template committati. Nessun fallback silenzioso ai file di lavoro. Nelle prove il futuro commit è sintetizzato **soltanto in un clone usa-e-getta**.
5. Indice candidato completo, git grep di tutto il tracciato; tre spie personali, 4174 fuori tests/frontend/tests, parole vietate sui file nostri, percorsi vietati, >5 MB nuovi, immagini, hash AGPL. Contare owner e 4174 test.
6. Solo dopo tutti i cancelli verdi: ripetere riordino sulla Copia, commit puro; applicare snapshot e indice del secondo commit. Stampare commit da file e push, mai eseguirli. Se rosso, Copia intatta e candidato conservato per diagnosi/test.
7. GREEN focalizzato `node --test scripts/tests/prepara-monorepo-pubblico.test.mjs`; regressioni permanenti `R05B-R100`, `R05B-SERIAL`, `R05B-PERCORSO`, `R05B-EMAIL`, `R05B-IDEMPOTENZA`, `R05B-SNAPSHOT`, `R05B-SOTTOMODULI`, `R05B-HEAD`, `R05B-PERCORSI`, `R05B-IMMAGINI`, `R05B-PESO`, `R05B-PORTA`, `R05B-RICERCA`, `R05B-DIRTY`.
8. Gate upstream reale: clone a6cb16b + sorgenti desktop reali; non sostituire il risultato con quello delle fixture. Gate umano: log con percorsi, conteggi, byte, durata, diff; test puri nel candidato reale con giunzione node_modules. Actionlint offline su clone, senza installazioni dalla rete.

## Regressioni/blocchi già scoperti

- `R05B-SORGENTI-PRIVATI`: 20 file desktop candidati contengono C:\\Users\\, 143 citano 4174 (prima della separazione test), 42 parole interne (prima del filtro file nostri). Non editabili in questo lotto: rapporto file per file.
- `R05B-DIST-KERNEL`: `harness-ui/src/kernel/dist/kernelPerIlBanco.js` è tracciato ma il segmento dist è vietato. Non escluderlo di nascosto: il cancello deve bloccare.
- `R05B-WORKFLOW-MOBILE`: la versione desktop di release.yml perde il cancello pubblico `verify-release-plugin-classes.mjs`. Fuori dall'autorizzazione «solo percorsi»: handoff alla lane mobile.
- `R05B-LICENZA-MOBILE`: README/package mobile rilasciati ancora Apache; preservarli byte per byte impedisce di applicare R05a in questo lotto. Handoff licenza obbligatorio prima della pubblicazione.

Rollback: gli errori di preparazione lasciano soltanto il candidato diagnostico in Temp. Dopo successo, clone destinatario ha un commit di solo riordino e desktop staged; non riscrivere automaticamente HEAD né scartare modifiche. L'owner può rifare il banco da un clone fresco. Originale pubblico e privato restano invariati.
