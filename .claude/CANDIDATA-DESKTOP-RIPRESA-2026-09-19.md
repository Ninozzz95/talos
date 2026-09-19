# Candidata desktop — checkpoint ripresa 19/09/2026

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
