# Ordine di lavoro per CODEX — l'interfaccia del banco/harness

> ⛔ Questo documento è autosufficiente. Non hai una memoria che si carica da
> sola, non hai hook che ti fermano, non hai un indice di lezioni alle
> spalle: tutto ciò che serve è scritto qui o nei file che questo documento
> cita per percorso. Leggilo tutto **prima** di toccare una riga.

# 1 · Il lavoro, in una riga

Portare il mockup già pronto dell'interfaccia del banco (18 file,
interattivo, custodito fuori dal repo) a leggere dati **veri** delle
campagne di TALOS-BANCO — implantato **per intero fin da subito**, sezioni
senza dati reali comprese, mano a mano collegate dopo.

# 2 · Dove lavori — ⛔ NON nella cartella principale

```
C:\Users\Antonino\Desktop\projects\AVM-harness-ui\
```

È un **worktree separato**, già creato, sul ramo `lane/harness-ui`,
staccato da `AVM-harness` alla `587f989f` (Stadio A, chiuso). La cartella
`AVM-harness` (senza `-ui`) è di un altro lavoro — non aprirla, non
leggerla, non scriverci.

### Passo 0 — da fare per primo, una volta sola

```bash
cd C:/Users/Antonino/Desktop/projects/AVM-harness-ui
git status                    # deve essere pulito, HEAD a 587f989f
npm --prefix mobile ci         # se il worktree ha un package.json in mobile/
```

⛔ Se manca qualcosa che ti aspetti di trovare già pronto (una cartella, un
file), **fermati e dichiaralo** — non improvvisare un percorso alternativo.

# 3 · Il mockup — dove sta, cosa contiene

```
C:\Users\Antonino\Desktop\projects\TALOS-RICERCHE\harness-ui-mockup-2026-08-20\
```

Fuori dal tuo albero di lavoro, di proposito (`git clean -xfd` lo
cancellerebbe se fosse dentro). **Copialo** dentro
`AVM-harness-ui/harness-ui/mockup-originale/` come primo commit, intatto,
prima di toccare una riga — è il riferimento a cui tornare se qualcosa non
torna più.

Dentro: `index.html` / `styles.css` / `app.js` (l'interfaccia intera,
interattiva — tavolozza dei comandi, coda, fogli, approvazioni, export,
cambio vista), `talos-harness-standalone.html` (la stessa cosa in un file
solo), `RESEARCH.md` (analisi dei concorrenti), `UI_REVIEW.md` (matrice QA
responsive, 6 risoluzioni), `preview-*.png` (6), `references/` (4: Claude
mobile, DeepSeek harness, OpenClaw workbench, TALOS attuale).

# 4 · Il contratto dati — l'unica cosa che leggi, e come

⛔⛔ **Regola strutturale, non una promessa**: il tuo codice non chiama MAI
`child_process`, `exec`, `spawn`, o qualunque cosa avvii un processo. Legge
file, punto. Se un giorno servisse eseguire qualcosa, quella è una
richiesta esplicita all'owner, non una riga che scrivi da solo.

| sorgente | percorso | cosa puoi leggere |
|---|---|---|
| righe di corsa | `TALOS-BANCO/esiti-*/*.jsonl` (un file per harness, una riga JSON per task) | `harness`, `id`, `difficolta`, `esito`, `ms`, `costoUsd`, `corpus`, `modello`, `quota`, `quando`, `giriDelTask[]`, `detto`, `cambiamenti.quanti` |
| rapporto | l'output testuale di `node rapportoCampagna.mjs` (lo lanci tu, lo cattura il tuo server, non lo riparsi) | il blocco intero, preformattato — non lo reinterpreti campo per campo |
| elenco campagne | i nomi delle cartelle `TALOS-BANCO/esiti-*/` | solo il nome, per un selettore |

⛔ **Se ti serve un campo che non è in questa tabella**: fermati, dichiaralo
nella consegna finale, non lo leggi sperando che resti stabile — è
esattamente il tipo di accoppiamento implicito che questo contratto esiste
per evitare.

# 5 · Lo stack — deciso, non da rivalutare

Niente Vue, niente framework nuovo, niente dipendenza npm nuova. Il
mockup è già HTML/CSS/JS statico. La forma finale:

- `app.js` legge i JSONL veri (via il tuo server, sotto) al posto dei dati
  finti del mockup.
- Un server locale minimo in Node puro (`node:http`, libreria standard,
  **zero dipendenze nuove** — non Express, non serve) che serve i file
  statici e un endpoint di sola lettura sopra `esiti-*/`.
- Lancio: `node harness-ui/server.mjs`, porta locale (proponi tu quale,
  dichiarala), aperto a mano nel browser. Nessun deployment.

# 6 · Implanta TUTTO il mockup, subito — la sezione più importante di questo prompt

⛔⛔ **Owner, 24/8, esplicito**: non aspettare di avere il dato vero per
costruire una sezione. Tutte le 18 schermate/sezioni del mockup entrano
**ora**, comprese quelle senza un corrispettivo nel banco (coda, fogli,
approvazioni — erano ispirate da Claude Code/Codex, il banco non ha
niente del genere oggi). Il collegamento ai dati veri, sezione per
sezione, è lavoro **successivo**, non di questo primo innesto.

**La sola disciplina che conta qui**: ogni sezione senza dati veri dietro
mostra uno **stato dichiarato** — un badge o un pannello «non ancora
collegato» — mai un numero del mockup travestito da dato reale. La stessa
regola che vale in tutto il resto di questo progetto: una scheda mostra
stato e comando, non finge "fatto". Una UI può sembrare incompleta prima
di esserlo davvero; non può mentire su cosa sta mostrando.

Sezioni che HANNO un corrispettivo reale da subito (collegale davvero,
non solo esteticamente): elenco campagne, righe per harness, pass-rate,
costo, il rapporto testuale.

# 7 · Cosa NON fai, in nessun caso

- Non avvii una corsa vera, da nessun bottone, in nessuna sezione (§4).
- Non scrivi mai in `esiti-*/` — sola lettura, sempre.
- Non tocchi `AVM-harness` (senza `-ui`) né `TALOS-BANCO`: leggi i dati di
  quest'ultimo da fuori, con un percorso configurabile (env var), non lo
  possiedi.

# 8 · Le regole — valgono uguali a ogni agente di questo progetto

## Sul dire il vero
Se una sezione non è collegata, lo dice a schermo. Se il server non trova
`esiti-*/`, lo dice — non mostra una tabella vuota senza spiegazione.

## Sul misurare
Prima di dichiarare una sezione "collegata", falla vedere renderizzata su
dati VERI (`esiti-22ago-storia`, 40 righe reali, già congelate) — uno
screenshot o una descrizione precisa di cosa hai visto, non "dovrebbe
funzionare".

## Sul lavorare
Commit sì, **push mai** — quello lo decide l'owner, sempre, dopo la
review. Consegna con numeri: quante sezioni collegate, quante ancora
segnaposto, quanto impiega a caricare 40 righe.

## ⛔ Quando fermarsi
1. Un campo che ti serve non è nel contratto (§4).
2. Una decisione di struttura non è già scritta qui (per esempio: quale
   framework CSS usare se il mockup non lo specifica chiaramente).
3. Qualcosa nel mockup presuppone dati che il banco proprio non ha e non
   avrà mai (dichiaralo, non inventare un dato finto per farcelo stare).
4. Hai finito il lavoro assegnato — non ripartire su un compito nuovo da
   solo.

# 9 · Consegna

Scrivi `AVM-harness-ui/.claude/RITORNO-HARNESS-UI.md`: cosa hai fatto,
cosa hai verificato (con che dati), cosa resta segnaposto e perché, il
commit finale. Non pushare. La review la fa la sessione principale.
