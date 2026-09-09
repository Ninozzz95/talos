#!/usr/bin/env node
/**
 * Le prove dell'hook che porta le REGOLE VINCOLANTI in ogni sessione.
 *
 * ⛔⛔ PERCHÉ ESISTE, e perché è arrivato per ultimo.
 *
 * Le altre tre guardie avevano le loro prove da settimane; questa no — ed è la
 * più critica delle quattro. Se le altre si rompono, un blocco non scatta e
 * qualcuno se ne accorge. Se si rompe questa, **una sessione nuova nasce senza
 * regole e non lo sa nessuno**: non c'è nessun errore, nessun blocco mancato,
 * solo un comportamento peggiore che sembra normale.
 *
 * L'owner l'ha detto preparando il travaso: «se tralasci qualcosa la sessione
 * parte zoppa». Un hook senza prove è esattamente quello.
 */
import { componiPromemoria } from './dopo-la-compattazione.mjs'

let falliti = 0
const p = (nome, condizione) => {
    if (condizione) console.log(`  ok       ${nome}`)
    else { falliti += 1; console.log(`  NO       ${nome}`) }
}

const nuova = componiPromemoria('', 'startup')
const ripresa = componiPromemoria('', 'resume')
const compattata = componiPromemoria('', 'compact')

console.log('\n— una sessione NUOVA riceve le regole vincolanti')
p('nomina le regole vincolanti', nuova.includes('REGOLE VINCOLANTI'))
p('la ricerca web e la PRIMA', nuova.indexOf('RICERCA WEB PRIMA') < nuova.indexOf('STRUMENTA'))
p('c\'e\' «si strumenta prima di ipotizzare»', nuova.includes('STRUMENTA PRIMA DI IPOTIZZARE'))
p('c\'e\' «prova anche al contrario»', nuova.includes('ANCHE AL CONTRARIO'))
p('c\'e\' il dispositivo reale', nuova.includes('DISPOSITIVO REALE'))
p('c\'e\' l\'intermittenza', nuova.includes('INTERMITTENTE'))
p('c\'e\' «se la tocchi la provi tutta»', nuova.includes('LA PROVI TUTTA'))
p('c\'e\' la corsa continua', nuova.includes('CORSA CONTINUA'))
p('sono SETTE regole numerate', (nuova.match(/^ {2}[1-7]\. /gm) || []).length === 7)

console.log('\n— e sa dove sta il resto')
p('indica la consegna per nome', nuova.includes('.claude/CONSEGNA.md'))
p('porta le tre uscite', nuova.includes('⛔ FERMATA:') && nuova.includes('⛔ NON VERIFICATO:'))
p('e la regola del push', nuova.includes('git -C <percorso> push'))

console.log('\n— `resume` e` una sessione che nasce, non una compattata')
p('resume riceve le regole', ripresa.includes('REGOLE VINCOLANTI'))

console.log('\n— ⛔ dopo una COMPATTAZIONE il messaggio resta quello di prima')
p('non ripete le regole', !compattata.includes('REGOLE VINCOLANTI'))
p('dice che e\' dopo la compattazione', compattata.includes('DOPO LA COMPATTAZIONE'))
p('ma le tre uscite ci sono lo stesso', compattata.includes('⛔ FERMATA:'))

console.log('\n— il taccuino, quando c\'e\'')
const conAppunti = componiPromemoria('  GBNF a 46 tool = 55.871 byte', 'startup')
p('i fatti misurati vengono accodati', conAppunti.includes('55.871 byte'))
p('e le regole restano davanti', conAppunti.indexOf('REGOLE') < conAppunti.indexOf('55.871'))
p('un taccuino vuoto non aggiunge rumore', !nuova.includes('fatti MISURATI'))

console.log('\n— ⛔ il verso contrario: il valore predefinito non deve perdere le regole')
/*
 * Se stdin tace, l'hook assume `startup`. La firma pero' ha `compact` come
 * predefinito, perche' chi chiama senza origine e' il caso storico. Questa prova
 * fissa la differenza: e' una scelta, non una svista.
 */
p('senza origine si comporta da compattazione', !componiPromemoria('').includes('REGOLE VINCOLANTI'))
p('e con origine sconosciuta da\' le regole', componiPromemoria('', 'boh').includes('REGOLE VINCOLANTI'))

console.log(falliti === 0 ? '\nTutte le prove passano.\n' : `\n${falliti} prove fallite.\n`)
process.exit(falliti === 0 ? 0 : 1)
