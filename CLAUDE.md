# TALOS — istruzioni di progetto

## ⛔ Se esiste `.claude/RIPRESA-SESSIONE.md`, aprilo PRIMA di qualunque cosa

Dice a che punto era il lavoro quando la sessione precedente si è chiusa: cosa
sta girando adesso, cosa aspetta, e la prima cosa da guardare. È un **puntatore,
non un import**: non pesa sul contesto finché non serve.

⛔ Non leggere invece i trascritti in
`~/.claude/projects/C--Users-Antonino-Desktop-projects-AVM/*.jsonl`: sono
**centinaia di MB** e leggerli rifarebbe il problema che la ripresa risolve.

## Gli altri due indici della memoria

@.claude/MEMORIA-LEZIONI.md

@.claude/MEMORIA-REGOLE.md

⛔ Perché esistono: `MEMORY.md` ha due tetti **compilati dentro claude.exe** —
**200 righe** e **25 KB** — e oltre quelli il contenuto viene tagliato **in
silenzio**, senza avviso in sessione. Nessuna impostazione li alza (verificato
il 2026-08-16 sulle costanti del binario e il 2026-08-19 sulla documentazione
ufficiale). Owner 2026-08-19: «dobbiamo trovare il modo per aumentare il tetto».

⇒ Il tetto non si alza: **l'indice si divide**. Oggi sono **tre file**, e si
caricano tutti a ogni sessione:

```
MEMORY.md               le regole VINCOLANTI, gli aperti, chi è l'owner
MEMORIA-LEZIONI.md      le lezioni chiuse
MEMORIA-REGOLE.md       le regole di ingegneria e la catena fino al telefono
```

Nessuna riga è andata persa in nessuna delle due divisioni.

⛔ **La regola vale per OGNI file dell'indice, non solo per il primo.** Il
2026-08-23 il secondo ha toccato **24.370 byte** contro il tetto di 25.000 —
cioè stava per perdere contenuto **in silenzio**, esattamente come il primo. Da
lì è nato il terzo.

⛔ Quando un indice si riavvicina a **19,9 KB** non si accorciano le glosse: si
sposta un **blocco intero** in un altro file, e si scrive perché. Il contenuto
misurato è il valore; il tetto è solo un contenitore.
