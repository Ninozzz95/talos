# TALOS — istruzioni di progetto

## Il secondo indice della memoria

@.claude/MEMORIA-LEZIONI.md

⛔ Perché esiste: `MEMORY.md` ha due tetti **compilati dentro claude.exe** —
**200 righe** e **25 KB** — e oltre quelli il contenuto viene tagliato **in
silenzio**, senza avviso in sessione. Nessuna impostazione li alza (verificato
il 2026-08-16 sulle costanti del binario e il 2026-08-19 sulla documentazione
ufficiale). Owner 2026-08-19: «dobbiamo trovare il modo per aumentare il tetto».

⇒ Il tetto non si alza: **l'indice si sdoppia**. `MEMORY.md` tiene le regole
vincolanti, gli aperti e chi è l'owner; il file importato qui sopra tiene le
lezioni chiuse. Entrambi si caricano a ogni sessione, e nessuna riga è andata
persa nella divisione.

⛔ Quando `MEMORY.md` si riavvicina a 19,9 KB **non si accorciano le glosse**:
si sposta un blocco intero nel secondo indice. Il contenuto misurato è il
valore; il tetto è solo un contenitore.
