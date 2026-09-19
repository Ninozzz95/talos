# Candidata desktop — checkpoint ripresa 19/09/2026

## Gate aggiornato 2026-09-19T22:35Z

- Fix streaming/rotella: il forwarding sul tasto `#chatTornaInFondo` non forza più layout; focused wheel, `scroll-p0` e `chat-lunga-p0` verdi (`d8084fe2`, `d4de2d61`, `3021e377`).
- Electron isolato `2026-09-19T22-17-11-401Z-desktop-c5f4b5db`: pure e shell/backend reali verdi; keyring resta sostituito in memoria e installer/provider credentials non certificati.
- Backend aggiornato `2026-09-19T22-19-10-435Z-backend-48a8756a` exit 0. 4174 resta vivo senza riavvio, health 200 e `app.js` live hash `0c1634b5f12e8ce4af45aab4bb1a8ff65e4c98f65ab3a30aeadc699e74820f75`.
- La candidata resta **NON rilasciabile**: full browser baseline 711/648/46/17 da riconciliare, percorsi provider/installer reali mancanti e advisory HIGH transitive aperti.
- Full browser aggiornato `2026-09-19T22-35-37-174Z-browser-361dcb2d`: 658 pass, 37 fail, 3 skip, 14 non eseguiti. Il wheel/streaming fix è verde nel run; i 37 fallimenti nominativi e i 14 non eseguiti impediscono ancora la candidata.

## Preparazione rilascio in corso — 2026-09-19T21:40:30.278989+00:00

Richiesta owner: fare tutto il necessario per il rilascio. HEAD143145103a59dfb8f8411e7cea8610d98bfd0c2c salvato sul privato. Nessun tag. Questo riquadro prevale sui conteggi storici sotto.
- Backend completo nuovo:3916test,3900pass,3fail,13skip (fbbc97a8). Classificazione cleanup replay corretta e focused verde(cb027bd5). I due fallimenti shell marker passano in due repliche isolate(8e4c06a7,b610da00), causa ancora ignota: diagnostica aggiunta ai messaggi di fallimento, serve nuova suite completa.
- Browser completo in corso:2026-09-19T21-32-50-461Z-browser-00ccbf68. Non avviare un secondo full-run contemporaneo. Prove correnti in harness-ui/frontend/artifacts/ripresa; events.jsonl conserva ogni esito anche con interruzione improvvisa.
- Correzioni SOLO di test per ora: writer replay attesi esplicitamente; inventario rispetta eliminazione owner dei quattro riepiloghi e prepara modello locale; sonde HF usano lastModified; test confronto usa SOLO TALOS-Calm-Lab-04.html, che ha3ingressi funzionanti e7voci disabilitate. GREEN browser di queste modifiche ancora da eseguire dopo la baseline.
- Nuovo runner isolato Electron: harness-ui/desktop/scripts/ripresa-desktop-gate.mjs. Solo syntaxcheck per ora; eseguirlo dopo browser. Strumenta SOLO snapshot bootstrap per keyring in memoria; nessuna certificazione installer/credenziali reali implicita.
- Public main13f65c15cdeaf8986b882993a0773cdeafb867d2 verificato. Workflow pubblico più recente: non sovrascriverlo con privato. Provenienza corretta in .claude/release-2026-09-19/public-release-provenance-v2.json (v1 conteneva provider-store assente, non prova valida).
- G10 Evolution: censita nuova PR#37 https://github.com/talos-private/agent-virtual-machine/pull/37, head4175dc760d39d78011fa1e545d7fc9d23049055c; Windows process-tree containment su baseevolution/e0-3-native-rust-workspace. Aperta, nessun merge/import implicito; affianca#34–36 come dipendenza da auditare.
Ledger esatto: .claude/LEDGER-RELEASE-GATE-2026-09-19.md. Nessuna modifica prodotto/deploy4174 in questo lotto. 4174 resta da controllare a fine gate senza riavvio.


**Stato: checkpoint di sviluppo salvabile, NON ancora rilasciabile.** Nessun numero di versione nuovo assegnato, tag creato o pacchetto pubblicato.
Ultima release pubblica verificata via GitHub il19/09: desktop-v0.1.13, pubblicata16/09/2026 16:35:27Z. Le versioni già pubblicate non si riscrivono.

## Contenuto del checkpoint
Model Lab e pagina HF (download, parametri/paginazione, azioni installati, Libera memoria); correzioni chat/composer/aspetto; sidebar agenti e grafo ricorsivo/interattivo; tracking background e journal persistente del replay; errori runtime locale; restringimento ambiente spawn; test permanenti, runner isolato, asset/licenze Dagre3.1.1 e documenti di ripresa.
Il manifest esatto dei file selezionati sarà conservato in .claude/CONSEGNA-RIPRESA-FILE-2026-09-19.json. Comprende modifiche tracciate e nuovi sorgenti/test/documenti pertinenti; evita git add -A sull'intero workspace.

## Stato delle prove
- Backend ultimo lotto431/431; frontend unit1447/1447; PO30/replay45/45; browser finale8/8. ID completi e limiti nella roadmap e nel ticket. Non sono la suite globale prodotto.
- Gate backend allargato pre-commit in esecuzione: report aggiornato nel ticket alla conclusione.
- Manifest UI corrente verificato:33asset. Build e sorgenti finali già verificati nei rapporti del lotto replay.
- Confronti16screenshot ultimi su4174 e due mockup; nessun mockup chat. Parità completa ancora aperta.
- 4174 ripristinata con PID19300,33sessioni e hashHTTP=public; stabilità fra turni ancora da confermare. Causa dello stop precedente ignota.

## Blocchi prima di qualsiasi tag
1. R0 suite completa: riprodurre e attribuire i fallimenti, non ereditare verdi o chiamarli preesistenti senza confronto.
2. R1 divergenza privata/pubblica: confrontare release e main pubblico, preservare chiavi, uninstall e release-path; auditPR23–36/SHA. Mai esportare monoliti privati sopra pubblico.
3. R2/R3 D-LAB-03 e percorsi reali download/provider/unload, matrice screenshot completa, nessun dato demo come misura.
4. D-PAR-04 e RUN-560B: modello reale, almeno4figli contemporanei con padre operativo; diagnosi interruzioni locale. Replay lungo e restart reale.
5. R4 residui feed/inspector e sicurezzaP0 ai confini reali.
6. R5 pacchetto Electron isolato: avvio/riavvio/persistenza/clipboard/exportfisico/shutdown/processiresidui, installer/update/uninstall; manifest/licenze e changelog versione.

## Procedura di rilascio da completare
Origine lavoro privata: https://github.com/talos-private/agent-virtual-machine, ramo lane/harness-desktop. Origin Ninozzz95/agent-virtual-machine è reindirizzato qui (isPrivate=true verificato).
Pubblico: https://github.com/Ninozzz95/talos. La sua storia è distinta. Le directory .claude, sessioni, ricerche, chiavi e backup non devono raggiungerlo.
Leggere C:/Users/Antonino/Desktop/projects/AVM-harness-desktop/scripts/prepara-monorepo-pubblico.ps1 e scripts/prepara-la-pubblicazione.ps1, i loro test e .github/workflows/release.yml prima di scegliere la procedura attuale. Non usare per automatismo il vecchio export solo mobile. Riconciliare i fix già presenti sul pubblico in un checkout isolato, produrre diff revisionabile, eseguire i gate, poi preparare changelog e versione disponibile. Mai force-push/tagrewrite o copia integrale del repository privato.
La richiesta owner autorizza commit/push di questo lavoro; l'obiettivo release è da raggiungere superando i blocchi, non forzando una pubblicazione rossa. Non aprire una PR pubblica contenente documenti privati. Nessun merge su main per deduzione.

## Esclusioni conservate sul disco
Store owner, immagini chat, backup sessioni/public, report grezzi, screenshot/trace, cartelle prova, archivi pesanti, vecchi scratchpad e artefatti .claude/archivio preesistenti. Non cancellati; percorsi nel ticket e nella roadmap. I bundle public già tracciati rimangono inclusi perché sono asset di distribuzione previsti dal repository.


### Checkpoint pre-commit — 2026-09-19T20:44:54+00:00
Gate backend allargato: 537/537 pass, 0 fallimenti; run2026-09-19T20-41-35-273Z-backend-24dc5a4f,13spec interessate in isolamento. ManifestUI33asset valido. Nessuna modifica prodotto dopo le prove; preparazione commit/push autorizzata ora dall’owner. Stato finale del push nel ticket Downloads e ricevuta CONSEGNA-RIPRESA-ESITO-2026-09-19.json. Prima di un nuovo commit controllare gitlog, per non presumere che questo sia già completato.


## Salvataggio remoto confermato — 2026-09-19T20:47:09+00:00
Commit prodotto `725d66cd5d66c7a2a2d194382bbf2903a2c915b3` sul ramo privato `talos-private/agent-virtual-machine:lane/harness-desktop`, SHA verificato via GitHubAPI. Inclusi22commit precedenti. Ticket autosufficiente in `.claude/TICKET-RIPRESA-TALOS-2026-09-19-FINALE.md` e `C:/Users/Antonino/Downloads/TICKET-RIPRESA-TALOS-2026-09-19-FINALE.md`; ricevuta in `.claude/CONSEGNA-RIPRESA-ESITO-2026-09-19.json`. Gate537/537backend e manifest33asset validi;4174HTTP200/33sessioni. Nessun tag, pubblicazione o nuova versione; restano i blocchi della candidata.
