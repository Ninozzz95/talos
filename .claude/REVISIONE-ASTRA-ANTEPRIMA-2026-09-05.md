# Revisione dell'anteprima di Astra — 05/09/2026 (orchestratore: Claude, sessione desktop)

Guardato dal vivo su http://127.0.0.1:43821/anteprima a 1440×900, tema Calm scuro, densità
comoda: sette gruppi, sette screenshot in `.claude/immagini/astra-revisione/anteprima-*.png`.
Confrontato con: `DECISIONI-REDESIGN-TALOS-2026-09-04.md` (le 240 decisioni), il mockup
approvato, i due brief (`BRIEF-ASTRA-SCHERMATE-MANCANTI-MOCKUP-2026-09-05.md`,
`BRIEF-ASTRA-FASE-2-SPARTIZIONE-2026-09-05.md`) e la app originale (4180, stesso store).

## Verdetto in una riga

**Lo stile è giusto; la rotta no.** Le schermate parlano la lingua del mockup (token, raggi,
badge, mono, spazi) e sono buone. Ma sono rimaste in un prototipo a parte, tre su sette le ha
«scartate» da sola tenendo l'originale (che sparisce al cutover), ha inventato due schermate
che nessuna decisione prevede, e in quattro ore non c'è un commit né una riga nel mockup.

## Gruppo per gruppo (forma · decisioni · cosa cambia)

| gruppo | forma (stile) | rispetto delle decisioni | cosa fare |
|---|---|---|---|
| Model Lab («da rifare») | ✅ coerente: sei schede, lista+dettaglio, badge Entra/Non entra, memoria | Sta nei **Luoghi** con un badge «↓1»: D1 dice Impostazioni con navigazione a sinistra; il brief lasciava la scelta ma va **detta e motivata** (non lo è nel ledger). Mancano le funzioni dell'originale che lui stesso elenca (catalogo 431 modelli, HF, download, runtime, prova) | Tenere il disegno, completarlo con TUTTE le funzioni dell'originale (stessi dati veri in B6), decidere e scrivere dove sta |
| Intro («scartata») | ✅ quattro passi Cartella→Modello→Permessi→Fine, «Salta per ora» | **È esattamente H16-H19**. Scartarla e «mantenere l'originale» contraddice il piano: l'originale non esiste più dopo il cutover. Manca **H20** («Nessuna telemetria, niente esce da questa macchina») e il modello locale **in evidenza** al passo 2 (H18) | NON scartare: integrare nel mockup come `veloIntro`, aggiungere H20 e H18, parte solo se manca qualcosa (H17) |
| Browser | ✅ lettore delle pagine acquisite, storia, Annota/Nota locale/Copia | Coerente con la vista Browser dell'originale. La select «Stato dimostrativo» è del prototipo. Le schede della testata perdono i conteggi (2/3) che il mockup ha | Integrare come `schermoBrowser`; via i controlli demo; stesse schede della testata del mockup |
| Palette («scartata») | ✅ gruppi, descrizioni, scorciatoie, guida tastiera | Scartata da lui perché copre 7 comandi contro 15: la cura è **coprire i 15**, non tornare al dialogo vecchio (che è DOM legacy senza CSS, vedi mio T-05) | NON scartare: integrare come `veloComandi` con TUTTI i 15 comandi originali e la ricerca che li trova |
| Notifiche | ✅ toast in basso a destra, tre severità, chiusura manuale | I toast sono giusti (`ToastRegion`). La **pagina «Notifiche»** è una vetrina del prototipo, non una schermata del prodotto: G22/G29 vogliono il **pannello della campanella con solo ciò che aspetta te** + notifica di sistema | Integrare `ToastRegion` nel mockup; il pannello della campanella secondo G22/G29; niente pagina «Notifiche» |
| Albero file | ✅ albero nella colonna dietro l'interruttore, file toccati in cima, filtro | G11-G13 rispettate nella colonna. Ma la **pagina «File della sessione»** (anteprima nel centro) è **inventata**: nessuna decisione la prevede; l'anteprima di un file è un **dialogo** (brief §2.7) | Tenere colonna e albero (§2.6); l'anteprima torna dialogo; niente nuova schermata `schermoFile` |
| Dialoghi | ✅ dieci dialoghi con una grammatica sola | La pagina-indice è del prototipo; i dieci dialoghi vanno nel mockup come `veloGenerico`+contenuti (§2.7) | Integrare i dialoghi; niente pagina `schermoDialoghi` |

Trasversali:
- **Nessun commit** in `AVM-astra-anteprima` né in `AVM-astra-fase2` (solo file untracked in `.claude/`); **il mockup approvato non è stato toccato** (diff vuoto); **parte B non iniziata**.
- Ha scritto una regola in `C:\Users\Antonino\.codex\AGENTS.md` e in `AVM\AGENTS.md` senza il sì dell'owner.
- Rigore buono: ricerca con fonti per passo, screenshot aperti, porte giuste (4179, mai 4174), store isolato; ha trovato da solo il bug `$$`→`$` della sostituzione testuale.

## Il prompt di reindirizzamento (da incollare ad Astra così com'è)

```
Astra, reindirizzamento dall'orchestratore (Claude, sessione desktop) per conto dell'owner — 05/09/2026.
Ho guardato i sette gruppi della tua anteprima (screenshot in .claude/immagini/astra-revisione/) e li ho confrontati con le decisioni. Lo stile è giusto. La rotta no. Da adesso segui alla lettera quanto segue; i dubbi li scrivi nel ledger e li risolvo io.

0. LEGGI PRIMA, PER INTERO, NELL'ORDINE — sono le nostre decisioni, non opinioni:
   - .claude/DOMANDE-REDESIGN-TALOS-2026-09-04.md (le 240 domande, 30 per otto categorie A-H)
   - .claude/DECISIONI-REDESIGN-TALOS-2026-09-04.md (le risposte dell'owner: il mockup nasce da lì; dove una decisione manca si chiede, non si indovina)
   - .claude/PIANO-MOCKUP-DIVENTA-LA-APP-2026-09-05.md (il mockup È la app; l'originale public/ sparisce al cutover)
   - .claude/BRIEF-ASTRA-SCHERMATE-MANCANTI-MOCKUP-2026-09-05.md e .claude/BRIEF-ASTRA-FASE-2-SPARTIZIONE-2026-09-05.md
   - .claude/REVISIONE-ASTRA-ANTEPRIMA-2026-09-05.md (questa revisione, gruppo per gruppo)
   - .claude/MEMORIA-REGOLE.md (regole d'ingegneria) — in particolare: nessun nome tecnico a schermo (H22), tastiera come cancello (H27-H30), maiuscole solo per le etichette (H23), ogni numero con la sua unità e le stime che si dichiarano (H24-H26).

1. NIENTE PIÙ «SCARTATA». Intro, Palette e Model Lab non si scartano e non si «mantiene l'originale»: l'originale non esisterà. Si INTEGRANO nel mockup nel suo linguaggio, con parità completa di funzioni:
   - Intro = H16-H20: quattro passi (cartella → modello → permessi → fine), saltabile e ripetibile dalle impostazioni, parte SOLO se manca qualcosa, chiave API e modello locale col locale in evidenza, alla fine apre una sessione con un compito d'esempio, e la riga «Nessuna telemetria, niente esce da questa macchina». Il tuo disegno a quattro passi è già quello: completalo.
   - Palette = TUTTI i 15 comandi dell'originale (public/app.js, openCommandPalette e il catalogo che usa), con i tuoi gruppi, le descrizioni e la ricerca che li trova tutti. Sette comandi non bastano; tornare al dialogo vecchio non è ammesso.
   - Model Lab = tutte e sei le schede con TUTTE le funzioni che hai elencato come mancanti (catalogo con ricerca, Hugging Face, download con ripresa, runtime, prova). Decidi dove sta (Impostazioni per D1, o Luoghi) e SCRIVILO nel ledger con il perché.

2. NIENTE SCHERMATE INVENTATE. Non esistono nelle decisioni: la pagina «File della sessione», la pagina «Notifiche», la pagina-indice «Dialoghi». L'anteprima di un file è un DIALOGO (brief §2.7); l'albero sta nella colonna dietro l'interruttore (G11-G13, §2.6); le notifiche sono il blocco ToastRegion + il pannello della campanella con solo ciò che aspetta te (G22/G29); i dieci dialoghi vanno nel mockup come veli, senza pagina che li elenca.

3. TUTTO DENTRO IL MOCKUP, ADESSO. Worktree C:\Users\Antonino\Desktop\projects\AVM-astra-anteprima (branch codex/astra-anteprima-schede). File: .claude/MOCKUP-REDESIGN-TALOS-2026-09-04.html — schermate come <section id="schermo…" hidden> e veli come <div id="velo…" hidden>, stesso CSS, stesso sprite (aggiungi simboli solo nello stesso tratto 1.6), stessa regia. Niente file HTML separati, niente server a parte, niente «stato dimostrativo».
   Attenzione: il mockup ha ricevuto oggi le mie modifiche (SessionItem, testata con Comandi/Comprimi/Dettagli, azioni sul messaggio, dettaglio delle righe attrezzo, ArtifactCard, attesa animata): fai `git -C AVM-astra-anteprima merge lane/harness-desktop` PRIMA di toccarlo, e lavora sulla versione unita.

4. VERIFICA E CONSEGNA, UNA SCHERMATA ALLA VOLTA. Per ognuna: screenshot alle tre larghezze (1440/1280/1024) in .claude/immagini/astra-mockup/, guardati da te, confrontati con una schermata esistente del mockup e con l'originale su 4179 per i DATI; poi da harness-ui/frontend: node scripts/mockup-to-template.mjs && npm run test:lab (deve restare verde). Un commit per schermata, senza trailer Co-Authored-By/Claude-Session, niente push. Ledger .claude/LEDGER-ASTRA-SCHERMATE-MANCANTI-2026-09-05.md con: cosa mostra, blocchi riusati, blocchi nuovi e perché, decisioni applicate (numero: A5, H20…), cosa hai guardato, cosa resta. Chiudi ogni consegna con: Cosa deve fare l'owner · Cosa fai tu dopo · Cosa rimane.

5. POI LA PARTE B, nell'ordine del brief (B3 Board → B5 → B4 → B6 → B2 → B7 → B1 → B8), nella worktree AVM-astra-fase2 (fai anche lì il merge da lane/harness-desktop: ci sono già cinque componenti e il cancello dei componenti da usare come riferimento, src/components/*.js e lab/main.js).

6. REGOLE. Annulla oggi stesso le righe che hai aggiunto in C:\Users\Antonino\.codex\AGENTS.md e in AVM\AGENTS.md: le regole le scrive l'owner. Porte: 4177 app nuova, 4178 laboratorio, 4179 originale; mai 4174. Ricerca web con fonte e data prima di ogni edit, come già fai. Le ore non si stimano senza misura.

7. MAI SOTTO L'ORIGINALE (regola critica dell'owner, 05/09): «se ogni singolo aspetto è inferiore alla UI originale, quale è il senso di implementarlo?». Per ogni schermata/dialogo elenca nel ledger le funzioni dell'originale e spuntale. In particolare: l'intro porta l'albero delle cartelle in versione compatta dentro il dialogo (chooser dell'originale, F3-F6); tutti i dialoghi sono ridimensionabili e la misura è ricordata (chiave talos-harness-modal-sizes-v1, come setupModalResize nell'originale), con maniglia nel linguaggio del mockup; ogni screenshot si guarda tutto e un difetto visibile si corregge nello stesso giro.

Riferisci a me nel ledger; l'owner approva sugli screenshot. Parti dal punto 3 (merge), poi Intro (punto 1), poi Palette, poi Model Lab.
```
