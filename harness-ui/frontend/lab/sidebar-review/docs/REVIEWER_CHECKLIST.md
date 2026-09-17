# Checklist per il reviewer

## Ordine consigliato

1. Leggere prima i due percorsi di produzione: `src/styles/inspector-tab-visibility.css` e l'import finale di `src/styles/main.css`. Verificare che non siano cambiate API, mobile o navigazione sinistra.
2. Rigenerare il laboratorio con `python build.py` e controllare `--check`. Confrontare l'hash dell'HTML con `TESTING.md` e i sorgenti con il commit applicativo registrato.
3. Eseguire i test e osservare il trasporto scelto. Un pass di `--inline` non sostituisce l'import del foglio nel bundle desktop.
4. Provare File iniziale senza selezione; aprire viste e opzioni, selezionare con Spazio, aprire menu con Shift+F10, rinominare e ripristinare dal cestino. Verificare che le azioni non siano scomparse, ma diventate contestuali.
5. Aprire Agenti → Navigazione → File → Context → Processi → Agenti. Controllare dettaglio selezionato e posizione. Cambiare sessione e tornare; i contesti non devono contaminarsi.
6. Nel dataset 1.000 file scorrere, cambiare densità, aprire una fixture, usare Home/End. Ridimensionare a 300 px di sidebar a 1280×800; verificare focus e overflow.
7. Rinominare il file CSS della fixture, poi aprire Review: la proposta deve restare leggibile. Simulare un conflitto e verificare che Integra sia disabilitato. Integrare/scartare solo nella demo; nessuna modifica deve uscire dal browser.

## Condizioni prima del merge della correzione desktop

- [ ] Build e strumenti pertinenti del repository eseguiti sullo SHA finale; errori introdotti distinti dai preesistenti.
- [ ] Sessione reale con conversazione figlia aperta, cambio tab e ritorno verificati nel desktop distribuito.
- [ ] `aria-selected` cambia correttamente nel routing legacy; il click su File non viene annullato da un refresh successivo.
- [ ] Nessuna sovrapposizione del dettaglio su File/Context/Processi; chiusura e ritorno alla lista funzionano con eventi in arrivo.
- [ ] Scroll e focus non vengono persi o bloccati; il dettaglio nascosto non intercetta interazioni.
- [ ] `:has()` e `@supports` supportati nelle WebView target; comportamento in assenza di supporto deciso esplicitamente.
- [ ] Import CSS realmente presente nel bundle, senza sovrascritture inattese dall'ordine dei fogli.
- [ ] Tecnologie assistive e contrasto dei percorsi modificati controllati nella UI reale.

Queste caselle sono intenzionalmente non spuntate: non sono state eseguite nell'ambiente della consegna. Non equivalgono a difetti confermati. La PR può essere revisionata in bozza senza fingere di aver completato questi passaggi.

## Condizioni prima di portare il laboratorio nel prodotto

Servono adapter filesystem con ID stabili, autorizzazioni/runtime, proposte versionate e conflitti atomici, eventi ordinati e proiezioni granulari. Definire criteri di performance realistici e prove multi-agente. Non collegare direttamente i gestori della demo a operazioni sul disco.

## Rollback

I commit sono additivi e non forzati. Per togliere la sola guardia si può rimuovere l'import e il relativo foglio in un nuovo commit revisionato; farlo riporta anche il rischio di sovrapposizione originale. Per annullare solo l'hardening del foglio conservando la prima guardia, creare un revert di `2bc9266` e verificare il diff risultante.

La baseline del prototipo è conservata nel pacchetto, con hash in CP00. `Ripristina demo` azzera soltanto memoria e fixture del browser, non è un rollback Git. Non effettuare reset forzati di una branch condivisa.
