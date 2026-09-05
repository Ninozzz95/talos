# Consegna schermate nel mockup — 05/09/2026

## Browser
Integrato in schermoBrowser nel mockup canonico. Stesso CSS, sprite e regia; template e CSS frontend rigenerati. URL, cronologia, testo letterale, copia, apertura esterna, annotazione in bozza, note locali, permesso, caricamento, rilettura e stato vuoto. Fixture esplicite; backend nella parte B.

Riusa Topbar, Tabs, Page, Field, Button, Badge, Card. Nuovi BrowserViewport e BrowserHistory, documentati in inventario. Nessun token nuovo.

Verifiche: test:lab 60/60; npx playwright richiesto 60/60; ultimo controllo Browser 6/6 dopo correzione dello stato selezionato nelle prove. Screenshot aperti a 1440, 1280, 1024 in immagini/astra-mockup/browser-{larghezza}.png. Controllati tagli, tab attiva, testo a capo, azioni e cronologia.

Annullate le aggiunte datate 05/09 ai due AGENTS indicati dall’owner. Nessun push.

Cosa deve fare l’owner: esaminare le schermate quando desidera.
Cosa faccio dopo: Palette completa, poi altre schermate A.
Cosa rimane: Intro, Model Lab, Toast, albero, dialoghi; Parte B.

## Palette
Tutti i 15 comandi originali sono presenti e trovabili, con gruppi, descrizioni, Kbd, selezione e stato vuoto. Ctrl K, frecce, Invio ed Escape verificati. I comandi che richiedono backend sono dimostrativi nella regia; Rinomina/Esporta si collegano ai fogli A7. Nessuna funzione originale esclusa dal piano di collegamento B.
Riusa Dialog, Field, ListRow, Kbd e sprite originale; zero token nuovi. 66/66 nel cancello e nel comando npx, poi 6/6 mirati alla correzione visiva. Aperti i tre PNG palette-1440/1280/1024 dopo la correzione dell’icona e della ricerca fissa.
Cosa deve fare l’owner: può guardare i PNG. Cosa faccio dopo: Intro. Cosa rimane: Model Lab, Toast, albero, dialoghi e Parte B.

## Intro
Quattro passi nel veloIntro: cartella → modello e accesso → permessi → fine. Conservate tutte le quattro politiche originali, prova accesso con errori, scelta modello, ritorno, salto e apertura Nuova sessione. Regia esplicitamente dimostrativa; niente chiavi salvate o inviate.
72/72 test:lab e 72/72 npx. Aperti tutti i dodici PNG intro-{passo}-{larghezza}; corretti stato selezionato e riepilogo italiano. Zero token nuovi.
Cosa deve fare l’owner: può esaminare i quattro passi. Cosa faccio dopo: Model Lab. Cosa rimane: altre quattro consegne A e Parte B.

## Model Lab
Sei schede integrate nel mockup, tutte le nove lacune UI recuperate. Catalogo, Hugging Face, coda download, runtime e prova condividono lo stesso stile. Cinque dialoghi di supporto inclusi. Operazioni con dati dimostrativi espliciti; collegamento reale in parte B.
18 screenshot aperti (6 schede × 3 larghezze). Corrette spaziature e selezioni incoerenti. Rigenerazione, build e test:lab 96/96 verdi. Zero token e icone nuovi.
Cosa deve fare l’owner: può guardare le sei schede. Cosa faccio dopo: Toast. Cosa rimane: albero, dialoghi, server e parte B.

Verifica finale Model Lab: anche npx playwright test --config=playwright.lab.config.mjs 96/96.

## Base aggiornata dell’orchestratore
Merge da lane/harness-desktop a 28b1a035. Conflitti risolti conservando Browser e nuove azioni di testata. Template rigenerato. Parità statica 96/96; componenti 12/12 sulla 4178.
Cosa deve fare l’owner: nulla per sbloccare. Cosa faccio dopo: completamento Intro H16–H20. Cosa rimane: adeguamento Palette e Model Lab, Toast, albero, dialoghi e parte B.

## Intro dopo il reindirizzamento
H16–H20: quattro passi, riapertura dalle Impostazioni, locale in evidenza, scelta dei fornitori conservata, privacy con portata locale/remota, compito iniziale nel compositore della nuova conversazione. E4: conferma esplicita per Accesso pieno; niente avanzamento dalla rail che scavalchi i campi obbligatori. Tolti i controlli degli esiti dimostrativi. Riusa Dialog/Steps/Field/Callout/Toolbar; zero token nuovi.
Test:lab 99/99; npx completo 99/99 dopo la correzione visiva; 6/6 mirati Intro, 3/3 originali sulla 4179 e 3/3 riferimento Nuova. Aperti tutti i 15 PNG Intro, sei PNG originali e tre Nuova; riaperti i sei Modello/Remoto dopo aver compattato il richiamo locale. Dialogo conforme alla grammatica Nuova; a 1024 il corpo conserva lo scorrimento e il piede visibile.
Non verificato/parte B7: salvataggio e prova chiave nel portachiavi; lettura setup dal backend; creazione persistita della sessione; catalogo dinamico. La regia verifica il percorso di disegno con la propria configurazione; non è prova di questi collegamenti. Riprendi/completa usa ancora la chiave locale del mockup, da non portare nel prodotto. Richiesta al ponte per B7: mappare #introDialog/#introBody/#introRail/#introBack/#introNext/#introSkip su veloIntro e relativi elementi; conservare talos.harness.desktop.intro.v1 del contratto.
Cosa deve fare l’owner: approvare il disegno dagli screenshot. Cosa faccio dopo: Palette sulla base unita. Cosa rimane: adeguamento Model Lab, Browser senza controlli di stato nel prodotto, Toast, albero, dialoghi e parte B.
