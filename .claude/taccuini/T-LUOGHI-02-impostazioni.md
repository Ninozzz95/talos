# T-LUOGHI-02 — Impostazioni: dieci sezioni in due gruppi, e tre che non c'erano

> Prova d'uso sul **4178** (worktree `AVM-harness-luoghi`, build modulare di `frontend/dist`),
> guidata come farebbe una persona: Chrome vero via Playwright, **1440×900** e **1024×800**, tema
> **scuro** e **chiaro**, screenshot durante. 06/09/2026.

## Le decisioni in gioco

| # | Decisione | Prima (audit 06/09) | Ora |
|---|---|---|---|
| D2 | Dieci sezioni in due gruppi | ⚠️ **otto** sezioni, **nessun gruppo** | ✅ 5 + 5, «Comportamento» e «Infrastruttura» |
| D5 | Esporta, importa, ripristina | ❌ «Nessuno dei tre» | ✅ tutti e tre, funzionanti |
| D13 | Sicurezza sezione a parte | ⚠️ diluita fra due sezioni | ✅ «Sicurezza e privacy», con scritto che vale **sempre** |
| D21 | Sezione Costi | ❌ assente | ✅ «Costi e consumo» |
| D22 | Consumo per giorno e per modello | ❌ assente | ✅ due tabelle, dai dati che già registriamo |
| D26 | Memoria e contesto con la ripartizione | ❌ assente | ✅ «Memoria e contesto», con i token veri degli attrezzi |

## Cosa vede una persona

- La navigazione delle Impostazioni ha **due gruppi**: *Comportamento* (aspetto · chat · strumenti
  e permessi · memoria e contesto · sicurezza e privacy) e *Infrastruttura* (laboratorio modelli ·
  provider · costi e consumo · file e workspace · account).
- **Memoria e contesto** dice quanto della finestra è già occupato prima di scrivere: **7.454
  token** di soli schemi degli attrezzi, misurati (non stimati da me: li dichiara
  `/api/v1/tools`, campo `tokenSchemaStimati`, 43 attrezzi).
- **Costi e consumo** conta per giorno e per modello, e dichiara in fondo che **la cifra in denaro
  la dà il credito del fornitore**, non la nostra aritmetica.
- **Sicurezza e privacy** porta «Esporta in un file», «Importa da un file» e «Ripristina i valori
  iniziali».

## Cosa ho trovato dal vivo, e non si vedeva altrimenti

| # | Cosa | Gravità | Come è finita |
|---|---|---|---|
| 1 | **Un `</div>` di troppo** nel mio markup della navigazione chiudeva `<nav>` in anticipo: il parser spostava fuori dal guscio tutto quello che veniva dopo, `#schermoDoctor` compreso, e il ponte moriva all'avvio con «ponte: manca nel mockup «#schermoDoctor»». **Tutta la app restava mezza morta** | blocco | Curato. Trovato solo perché la sonda leggeva `pageerror` |
| 2 | Il componente **riscriveva la navigazione** dalla sua lista interna: il markup aveva le dieci voci giuste e `montaImpostazioni` le sostituiva con le vecchie otto, tutte nella prima tablist. A schermo: **8 + 5 voci**, e le due sezioni nuove non si aprivano | grave | Curato: `SEZIONI_IMPOSTAZIONI` porta il gruppo ed è l'unica fonte; il componente riempie **ogni** tablist con il suo gruppo |
| 3 | `/api/v1/models` risponde `{modelli}` e non `{items}`, e il campo è `contextLength`: l'avevo scritto **a memoria**. La ripartizione restava senza percentuale | medio | Curato |
| 4 | `Number(null)` vale **0 ed è finito**: la ripartizione mostrava «Istruzioni di sistema · **0 token**», cioè «le ho misurate e pesano zero» invece di «non le ho misurate» | grave | Curato: una voce non misurata non entra. Regressione in `CONTESTO-ZERO-NON-E-IGNOTO` |
| 5 | Guardando la foto: **la barra restava vuota** quando la finestra non è dichiarata — un grafico che sembra rotto | medio | Curato: la barra si nasconde, il testo spiega |
| 6 | Guardando la foto: il cappello prometteva «attrezzi, istruzioni e ricordi» e la lista mostrava **solo gli attrezzi**, senza dire perché | grave (è la classe di difetto peggiore: promettere a schermo qualcosa che non succede) | Curato: la sezione dichiara che istruzioni e ricordi li conosce il motore e non sono nel totale. Regressione in `CONTESTO-PROMESSA` |
| 7 | A 1024 px l'intestazione **«Di cui in cache» veniva tagliata** | minore | Curato: «In cache» |
| 8 | Le tre sezioni nuove non avevano l'inglese, e il cancello `I18N-COPERTURA` lo ha visto | minore | Curato in `src/i18n/en.js` |

⛔ **Un difetto era mio, nel test**: avevo appeso un test `CONTESTO-PROMESSA` che non asseriva
niente (`if (!doc) return`). Un test che passa sempre è peggio di nessun test: sostituito con uno
che morde davvero sulla lista `mancanti`, provata anche al verso contrario.

## Passi, clic per clic (giro finale, entrambe le scene)

- **apro Impostazioni** ✅ · atteso: 2 gruppi e 10 voci · visto: «Comportamento · Infrastruttura», 10 (5+5)
- **clicco tutte e dieci** ✅ · atteso: nessun pannello vuoto · visto: tutte e 10 piene
- **Memoria e contesto** ✅ · atteso: token veri, percentuale solo se la finestra è dichiarata ·
  visto: «7454 token occupati prima che tu scriva · finestra del modello non dichiarata, la
  percentuale non si può calcolare (stima)» — corretto: senza sessione aperta non c'è un modello
  scelto, e infatti **non** viene inventata nessuna percentuale
- **Costi e consumo** ✅ · visto: riepilogo, due tabelle, e la nota sul credito del fornitore
- **Sicurezza e privacy** ✅ · visto: il titolo lo dice, i tre pulsanti ci sono
- **premo «Esporta in un file»** ✅ · atteso: un file vero · visto: download
  `talos-preferenze-2026-09-06.json`, messaggio «Preferenze esportate nel file scaricato.»
- **⛔ verso contrario — importo un file che NON è un documento di preferenze** ✅ · atteso: rifiuto
  con il motivo · visto: «Importazione non riuscita: il file non contiene un documento di
  preferenze. Il file deve essere quello prodotto da «Esporta».»
- **cerco «tema» fra le preferenze** ✅ · visto: 4 righe
- **errori** ✅ · JS 0 · console 0

Foto in `scratchpad/luoghi/foto/T-LUOGHI-02-impostazioni/`: `1440-scuro-*` e `1024-chiaro-*`
(apertura, una per sezione, memoria, costi, sicurezza, importazione rifiutata, ricerca).

## Verdetto

**PASSA** — 0 difetti aperti sulle due viewport e i due temi, dopo otto correzioni.

⛔ **NON VERIFICATO / NON FATTO, per nome:**
- **D7** (un modello ausiliario per mestiere: visione, compattazione, titoli, approvazione): **non
  fatto**. L'interfaccia da sola sarebbe una bugia — chi sceglie quei modelli è il kernel, che non
  è la mia lane. Va aperto come riga a parte, insieme al kernel.
- **D14** (timeout dell'approvazione), **D15** (redazione dei segreti accesa di default), **D18**
  (checkpoint dei file): **non fatti, di proposito**. Sono interruttori che devono cambiare il
  comportamento del motore: metterli a schermo senza il motore dietro produrrebbe esattamente il
  difetto peggiore dell'audit, «promettere a schermo qualcosa che non succede».
- **D16/D17** (comandi permessi per progetto · indirizzi privati «chiedi ogni volta»): **non
  ispezionati** in questo giro.
- **D19** (pallino di salute e ultima verifica sui provider): **non fatto** in questo blocco.
- **D27** (chat archiviate): **non fatta**. Archiviare è uno stato della sessione sul server, non
  una preferenza del browser: farla solo qui vorrebbe dire fingerla.
- **La ripartizione con una finestra VERA**: su questo server non c'è una sessione aperta, quindi
  la percentuale non è mai stata disegnata dal vivo. Il calcolo è provato nei test unitari
  (`CONTESTO-RIPARTIZIONE`), la barra colorata **non l'ho mai vista a schermo**.
- **Le tabelle dei costi con dati VERI**: il mio store è vuoto (74 sessioni dell'owner non copiate
  di proposito), quindi ho visto solo lo stato vuoto. Il raggruppamento è provato nei test
  unitari, **mai su sessioni reali**.
