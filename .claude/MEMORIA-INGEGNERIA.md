# MEMORIA — le regole di ingegneria

> ⛔ **QUINTO file dell'indice di memoria**, importato da `CLAUDE.md` come gli altri. Nato il
> **2026-09-10** insieme a `MEMORIA-BANCO.md`, quando `.claude/MEMORIA-REGOLE.md` è stato trovato a
> **28.850 byte** contro un tetto di **25.000** oltre il quale il contenuto si taglia **in silenzio**:
> era già sopra di 3.850 byte, cioè stava già perdendo righe senza che nessuno lo vedesse. Tolto il
> blocco del banco restavano 26.537 byte, ancora sopra — e questo blocco, da solo, ne pesava 12.715.
>
> ⇒ Stessa regola di sempre: **non si accorciano le glosse, si sposta un blocco intero**. Qui stanno
> le regole di ingegneria (sonde, cancelli, misure, screenshot, viewport, chiusura di fase). Nessuna
> riga persa.
>
> ⛔ I file citati stanno in
> `~/.claude/projects/C--Users-Antonino-Desktop-projects-AVM/memory/`.

## 📚 Le regole di ingegneria del 22/08 — spostate in `MEMORIA-INGEGNERIA-2026-08.md`

> ⛔ **Spostate la sera del 13/09/2026.** Questo file era a **18.886 byte** contro il tetto
> d'allarme di 19.900: **1.014** di margine. Blocco intero (12.716 byte), non accorciato, nessuna
> riga persa — il sesto indice si carica a ogni sessione come gli altri cinque.
>
> ⛔ Perche' un file NUOVO e non uno esistente: le due lezioni chiuse qui sotto pesavano 5.301
> byte e l'indice delle lezioni ne aveva 4.744 liberi. **La destinazione si misura come l'origine**,
> e quando nessuna ha spazio si apre un file invece di far entrare il blocco a forza.

## ⭐⭐⭐ P-13, 10/09/2026 — tre lezioni da un aggancio di due righe

- ⛔⛔⛔⭐⭐⭐ [Un modello che non vede non TACE: SPIEGA](un-modello-che-non-vede-non-tace-spiega.md) — `glm-5.3-flash` sul 4174, otto giri e sei ricerche, poi: «**0** — la cartella `harness-ui/src` non esiste». **Sono 104**, e la cartella che indica come quella vera ne ha zero: le ha invertite. ⛔ Il difetto non è il conteggio: è che non ha detto «non lo so» — ha **negato l'esistenza** con una motivazione costruita, e il banco l'ha registrato `successo`. ⇒ Una risposta sbagliata SICURA e una «non lo so» non sono lo stesso fallimento, e `successo` non le distingue
- ⛔⛔⭐⭐⭐ [Il catch GIUSTO nasconde il bug SBAGLIATO](il-catch-giusto-nasconde-il-bug-sbagliato.md) — `creaFiltro(radice)` passava una stringa a chi voleva `{radice}`: Node lanciava `ERR_INVALID_ARG_TYPE` e il `catch` messo lì per il «.gitignore illeggibile» **lo scambiava per quello**. Elenco senza filtro: **25.163 token invece di 6.518**, e nessun rosso. ⇒ Un catch che degrada in silenzio dice QUALE guasto copre e **rilancia gli errori di contratto**; e i due contratti si provano una volta **sul dato vero**, non sulle fixture
- ⛔⛔⭐⭐ **Il posto di un aggancio è una MISURA, non una preferenza** — agganciare P-13 in `session-registry.mjs` dentro `avviaESegui` faceva cadere **213 test**; il solo ritardo di **UN TICK** ne fa cadere **148**, perché `avviaSessione` emette `RunStarted` come sua prima riga e chi chiama conta su quell'evento già nel buffer al ritorno sincrono. Il repo lo diceva alla riga 2245: **l'ho letto dopo aver rotto la suite**. ⇒ Prima di infilare un `await` in una catena, si cerca il commento che spiega perché è sincrona — e il posto giusto è quasi sempre dove lo **stesso file** fa già lavoro asincrono d'avvio (qui: MCP, Skills, Plugin, tutti fra RunStarted e talosLavora)

## ⭐⭐⭐ La notte del 10-11/09 — due lezioni che valgono piu del codice che le ha prodotte

- ⛔⛔⛔⭐⭐⭐ [MISURA L OGGETTO, MAI L AMBIENTE](misura-loggetto-mai-lambiente.md) — sei cure di fila su un componente SANO: il segnavia non si muoveva perche due regole CSS universali con `!important` (`body.reduce-motion *` e `@media (prefers-reduced-motion){ * }`) spegnevano OGNI animazione dell app, e una regola universale con `!important` non si batte da valle. La domanda «chi ALTRO parla di animazioni in questo progetto?» costava un grep e l ho fatta alla settima volta. ⭐ Corollario misurato: **un attributo che cambia non e un pixel che cambia** — 12 valori distinti di `stroke-dashoffset` su 12 letture, e a schermo 11,6 pixel su 864 (1,3%), sotto la soglia della vista.
- ⛔⛔⛔⭐⭐⭐ [BUILD VERDE E TEST VERDI NON GUARDANO IL RUNTIME](build-verde-non-guarda-il-runtime.md) — tre errori JavaScript arrivati all owner in una notte (`fermaMotore is not defined`, `$2 is not a function`, `$$(...).querySelectorAll is not a function`), tutti con build e 620 test VERDI. Li ha trovati aprire la pagina e leggere la console. ⇒ Cancello `tests/parity/nessun-errore-a-runtime.spec.mjs`, provato nei due versi — ma **scriverlo non basta**: due dei tre sono passati DOPO che esisteva, perche non l avevo rilanciato.
- ⛔⛔⛔⭐⭐⭐ [TEMA CHIARO E SCURO, SEMPRE TUTTI E DUE](tema-chiaro-e-scuro-sempre-tutti-e-due.md) — owner 11/09: «GUARDA SEMPRE LA APP CON TEMA CHIARO E SCURO SEMPRE». Nata da un velo d'avvio che usciva CHIARO su una app SCURA: un lampo bianco, cioè peggio del difetto che copriva. ⛔ Una superficie che nasce PRIMA che la app applichi il tema non lo eredita: va letto dalla preferenza salvata e stampato sulla radice prima del primo disegno. La prova vale solo con **entrambe** le foto
- ⛔⛔⛔⭐⭐⭐ [NON CONSEGNARE AL 4174 IL LAVORO A META' DI UN ALTRO](non-consegnare-il-lavoro-a-meta-di-un-altro.md) — 11/09: avevo PREVISTO io il rischio del verde e ho consegnato lo stesso; l'owner si e' ritrovato la chat verde. Una consegna porta TUTTO l'albero. ⛔ E una foto di un profilo VERGINE non e' una verifica: il verde veniva dalle preferenze SALVATE dell'owner, che Playwright non ha — si riproduce lo stato con `addInitScript`, o si dichiara non verificato. ⛔ Spegnere un default non basta quando la scelta e' timbrata: si smette di DISEGNARE
- ⛔⛔⛔⭐⭐⭐ [IL WORKSPACE PIU LARGO NON E UN POSTO DOVE SCRIVERE](il-workspace-largo-non-e-un-posto-dove-scrivere.md) — 11/09: `document_create` dava EPERM in `C:\` e sembrava una risoluzione fallita che ricade sulla radice. Era il contrario: `cartellaEffettivaPerPermessi` ritorna `parse(base).root` **apposta** per «Full access», e la radice di sistema su Windows accetta cartelle ma non file (ACL del gruppo Users) ⇒ nessun nome diverso poteva riuscire, e il consiglio «prova un altro titolo» era falso. ⭐ Erano due domande in una variabile sola: **da dove si legge** e **dove si deposita un file generato** (`cartellaCreazioni` → `cartellaBase`). ⛔ Corollario: quando un permesso allarga un ambito, chiedersi se allarga anche le SCRITTURE e se il posto più largo sia scrivibile. ⛔ Aperto, trovato per strada: un cambio di permesso a sessione viva **non raggiunge la conversazione** — il modello si è creduto in sola lettura per sei giri
