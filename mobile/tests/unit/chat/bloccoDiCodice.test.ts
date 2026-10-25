import { describe, expect, it } from 'vitest'
import {
    contenutoDelFile,
    estensioneDellaLingua,
    nomeDellaLingua,
    nomeDalRecinto,
    nomeDelFile,
    nomeSicuro,
    righeDelCodice,
    tipoDelContenuto,
} from '@/lib/chat/bloccoDiCodice'

/**
 * Blocchi di codice: esportazione (bozzetto approvato dall'owner il 23/10/2026, specifica unica col desktop). Le trappole vengono
 * dalla ricerca del Desktop (`RICERCA-BLOCCHI-CODICE-2026-10-23.md`): la guardia `hasOwnProperty` di LibreChat
 * (`downloadFile.ts:81-85`, mai `in`), il BOM del CSV di Streamdown (`utils.ts:74-76`) e i nomi di file validi su Windows.
 */
describe('bloccoDiCodice', () => {
    it('BLOCCO-EXT-01 l\'estensione viene dalla mappa con hasOwnProperty: le chiavi del prototipo non passano', () => {
        expect(estensioneDellaLingua('python')).toBe('py')
        expect(estensioneDellaLingua('Python')).toBe('py')
        expect(estensioneDellaLingua('typescript')).toBe('ts')
        expect(estensioneDellaLingua('bash')).toBe('sh')
        expect(estensioneDellaLingua('markdown')).toBe('md')
        expect(estensioneDellaLingua('html')).toBe('html')
        // la mappa non restituisce mai una proprietà del prototipo (una funzione): una lingua breve e sicura è usata così com'è
        expect(estensioneDellaLingua('constructor')).toBe('constructor')
        expect(estensioneDellaLingua('toString')).toBe('tostring')
        expect(estensioneDellaLingua('__proto__')).toBe('txt')
        expect(estensioneDellaLingua('hasOwnProperty')).toBe('txt')
        expect(estensioneDellaLingua('')).toBe('txt')
        expect(estensioneDellaLingua('c++ con spazi')).toBe('txt')
        expect(estensioneDellaLingua('../etc')).toBe('txt')
    })

    it('BLOCCO-NOME-01 il nome scritto dal modello nella riga d\'apertura vince', () => {
        expect(nomeDalRecinto('python sync.py')).toBe('sync.py')
        expect(nomeDalRecinto('python title="sync.py"')).toBe('sync.py')
        expect(nomeDalRecinto('ts {title="src/app.ts"}')).toBe('app.ts')
        expect(nomeDalRecinto('python')).toBeNull()
        expect(nomeDalRecinto('')).toBeNull()
    })

    it('BLOCCO-NOME-02 il nome è valido su Windows: niente caratteri vietati, punti e spazi in fondo, nomi riservati, 100 caratteri', () => {
        expect(nomeSicuro('a<b>c:d"e/f\\g|h?i*j.txt')).toBe('abcdefghij.txt')
        expect(nomeSicuro('nome con\u0007controllo.py')).toBe('nome concontrollo.py')
        expect(nomeSicuro('finale. . ')).toBe('finale')
        expect(nomeSicuro('CON')).toBe('_CON')
        expect(nomeSicuro('com1.txt')).toBe('_com1.txt')
        expect(nomeSicuro('LPT9.log')).toBe('_LPT9.log')
        expect(nomeSicuro('x'.repeat(150) + '.py').length).toBeLessThanOrEqual(100)
        expect(nomeSicuro('x'.repeat(150) + '.py').endsWith('.py')).toBe(true)
        expect(nomeSicuro('')).toBe('')
    })

    it('BLOCCO-NOME-03 senza nome del modello: talos-<lingua>-<AAAAMMGG-HHMM>, e l\'estensione segue il formato scelto', () => {
        const ora = new Date(2026, 9, 23, 21, 7)
        expect(nomeDelFile('python', 'python', ora, 'lingua')).toBe('talos-python-20261023-2107.py')
        expect(nomeDelFile('python', 'python', ora, 'md')).toBe('talos-python-20261023-2107.md')
        expect(nomeDelFile('python', 'python', ora, 'txt')).toBe('talos-python-20261023-2107.txt')
        expect(nomeDelFile('', '', ora, 'lingua')).toBe('talos-code-20261023-2107.txt')
        expect(nomeDelFile('python sync.py', 'python', ora, 'lingua')).toBe('sync.py')
        expect(nomeDelFile('python sync.py', 'python', ora, 'md')).toBe('sync.md')
        expect(nomeDelFile('python sync.py', 'python', ora, 'txt')).toBe('sync.txt')
        expect(nomeDelFile('python CON.py', 'python', ora, 'lingua')).toBe('_CON.py')
        expect(nomeDelFile('python CON', 'python', ora, 'lingua')).toBe('talos-python-20261023-2107.py')
    })

    it('BLOCCO-MD-01 nel .md il recinto è più lungo della fila di apici più lunga dentro il codice', () => {
        const codice = 'a\n```\nb\n````\nc'
        const md = contenutoDelFile(codice, 'markdown', 'md')
        expect(md.startsWith('`````markdown\n')).toBe(true)
        expect(md.endsWith('\n`````\n')).toBe(true)
        expect(contenutoDelFile('x = 1', 'python', 'md')).toBe('```python\nx = 1\n```\n')
    })

    it('BLOCCO-CSV-01 il .csv prende il BOM perché Excel su Windows legga l\'UTF-8; gli altri no, e il testo resta grezzo', () => {
        expect(contenutoDelFile('a,b\nè,1', 'csv', 'lingua')).toBe('﻿a,b\nè,1')
        expect(contenutoDelFile('a,b', 'csv', 'txt')).toBe('a,b')
        expect(contenutoDelFile('print(1)', 'python', 'lingua')).toBe('print(1)')
        expect(tipoDelContenuto('md')).toBe('text/markdown')
        expect(tipoDelContenuto('txt')).toBe('text/plain')
        expect(tipoDelContenuto('lingua')).toBe('text/plain')
    })

    it('BLOCCO-LINGUA-01 il nome della lingua nel titolo del menu: sigle in maiuscolo, nomi composti come si scrivono, il resto con l\'iniziale', () => {
        expect(nomeDellaLingua('python')).toBe('Python')
        expect(nomeDellaLingua('html')).toBe('HTML')
        expect(nomeDellaLingua('json')).toBe('JSON')
        expect(nomeDellaLingua('javascript')).toBe('JavaScript')
        expect(nomeDellaLingua('typescript')).toBe('TypeScript')
        expect(nomeDellaLingua('ts')).toBe('TypeScript')
        expect(nomeDellaLingua('csharp')).toBe('C#')
        expect(nomeDellaLingua('')).toBe('')
    })

    it('BLOCCO-RIGHE-01 le righe contano l\'ultima anche senza a capo, e non contano l\'a capo finale', () => {
        expect(righeDelCodice('')).toBe(0)
        expect(righeDelCodice('a')).toBe(1)
        expect(righeDelCodice('a\nb')).toBe(2)
        expect(righeDelCodice('a\nb\n')).toBe(2)
    })

    // Revisione avversaria del Desktop sui SUOI blocchi (23/10 sera): difetti che valgono anche qui.
    it('BLOCCO-NOME-04 i caratteri di formato (\\p{Cf}) spariscono: U+202E non fa leggere «photoexe.jpg» al posto di «photogpj.exe»', () => {
        expect(nomeSicuro('photo‮gpj.exe')).toBe('photogpj.exe')
        expect(nomeSicuro('a​b⁦c﻿.py')).toBe('abc.py')
    })

    it('BLOCCO-NOME-05 il taglio a 100 conta i caratteri veri: le emoji non si spezzano', () => {
        const nome = nomeSicuro('😀'.repeat(120) + '.py')
        expect(Array.from(nome).length).toBeLessThanOrEqual(100)
        expect(nome.endsWith('.py')).toBe(true)
        expect(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(nome)).toBe(false)
        // sotto i 100 caratteri veri non si taglia niente, anche se in UTF-16 sono più di 100 unità
        expect(nomeSicuro('😀'.repeat(60) + '.py')).toBe('😀'.repeat(60) + '.py')
    })

    it('BLOCCO-NOME-06 un nome del modello con estensione eseguibile che non è quella della lingua prende il nome di serie', () => {
        const ora = new Date(2026, 9, 23, 21, 7)
        expect(nomeDelFile('python setup.exe', 'python', ora, 'lingua')).toBe('talos-python-20261023-2107.py')
        expect(nomeDelFile('python title="run.bat"', 'python', ora, 'lingua')).toBe('talos-python-20261023-2107.py')
        expect(nomeDelFile('text a.ps1', 'text', ora, 'lingua')).toBe('talos-text-20261023-2107.txt')
        // il caso del Desktop: la doppia estensione non inganna, conta l'ultima
        expect(nomeDelFile('text invoice.pdf.exe', 'text', ora, 'lingua')).toBe('talos-text-20261023-2107.txt')
        expect(nomeDelFile('html x.hta', 'html', ora, 'lingua')).toBe('talos-html-20261023-2107.html')
        // il controllo guarda il nome GIÀ ripulito: il punto finale e i caratteri invisibili non lo aggirano
        expect(nomeDelFile('python setup.exe.', 'python', ora, 'lingua')).toBe('talos-python-20261023-2107.py')
        expect(nomeDelFile('python setup.e​xe', 'python', ora, 'lingua')).toBe('talos-python-20261023-2107.py')
        expect(nomeDelFile('python SETUP.EXE', 'python', ora, 'lingua')).toBe('talos-python-20261023-2107.py')
        // l'estensione È quella della lingua: resta
        expect(nomeDelFile('bat run.bat', 'bat', ora, 'lingua')).toBe('run.bat')
        expect(nomeDelFile('powershell setup.ps1', 'powershell', ora, 'lingua')).toBe('setup.ps1')
        expect(nomeDelFile('javascript app.js', 'javascript', ora, 'lingua')).toBe('app.js')
        // in .md e .txt l'estensione del modello non sopravvive comunque
        expect(nomeDelFile('python setup.exe', 'python', ora, 'md')).toBe('setup.md')
        // il titolo con lo spazio resta intero
        expect(nomeDelFile('js title="My File.js"', 'js', ora, 'lingua')).toBe('My File.js')
    })

    // Desktop 23/10 (lo fa anche lui): un recinto ```exe non scarica un .exe; gli script restano la loro estensione.
    it('BLOCCO-EXT-03 una LINGUA puramente binaria dà txt; gli script tengono la loro estensione', () => {
        for (const binaria of ['exe', 'com', 'scr', 'msi', 'msp', 'lnk', 'pif', 'cpl', 'dll', 'jar', 'appx', 'msix', 'EXE']) {
            expect(estensioneDellaLingua(binaria), binaria).toBe('txt')
        }
        expect(estensioneDellaLingua('bat')).toBe('bat')
        expect(estensioneDellaLingua('ps1')).toBe('ps1')
        expect(estensioneDellaLingua('js')).toBe('js')
        expect(nomeDelFile('exe', 'exe', new Date(2026, 9, 23, 21, 7), 'lingua')).toBe('talos-exe-20261023-2107.txt')
    })

    // Allineamenti dal Desktop, 24/10 mattina (riverifica della sua revisione).
    it('BLOCCO-EXT-04 lingue con la versione attaccata: html5 → html, css3 → css, php8 → php, c99 → c, es6 → js', () => {
        expect(estensioneDellaLingua('html5')).toBe('html')
        expect(estensioneDellaLingua('css3')).toBe('css')
        expect(estensioneDellaLingua('php8')).toBe('php')
        expect(estensioneDellaLingua('c99')).toBe('c')
        expect(estensioneDellaLingua('es6')).toBe('js')
        expect(estensioneDellaLingua('ES2020')).toBe('js')
    })

    it('BLOCCO-EXT-05 altre lingue che Windows apre come programma danno txt: url, scf, inf, hta, application, gadget', () => {
        for (const lingua of ['url', 'scf', 'inf', 'hta', 'application', 'gadget', 'HTA']) {
            expect(estensioneDellaLingua(lingua), lingua).toBe('txt')
        }
    })

    it('BLOCCO-NOME-07 CONIN$ e CONOUT$ sono nomi riservati di Windows', () => {
        expect(nomeSicuro('CONIN$')).toBe('_CONIN$')
        expect(nomeSicuro('conout$.txt')).toBe('_conout$.txt')
        expect(nomeSicuro('coninx.txt')).toBe('coninx.txt')
    })

    it('BLOCCO-LINGUA-02 testo semplice non ha un nome di lingua: il titolo resta «Code · n lines», mai «Text code» in una frase italiana', () => {
        for (const lingua of ['text', 'plain', 'plaintext', 'txt', 'TEXT']) {
            expect(nomeDellaLingua(lingua), lingua).toBe('')
        }
        expect(nomeDellaLingua('python')).toBe('Python')
    })

    it('BLOCCO-EXT-02 una lingua con la versione prende l\'estensione della lingua: python3.11 → py', () => {
        expect(estensioneDellaLingua('python3.11')).toBe('py')
        expect(estensioneDellaLingua('python3')).toBe('py')
        expect(estensioneDellaLingua('ruby2.7')).toBe('rb')
        // Desktop 24/10: le versioni di ECMAScript sono JavaScript
        expect(estensioneDellaLingua('es2015')).toBe('js')
    })

    it('BLOCCO-CSV-02 il BOM va a ogni file finale .csv, non solo alla lingua csv', () => {
        expect(contenutoDelFile('a,b', 'text', 'lingua', 'dati.csv')).toBe('﻿a,b')
        expect(contenutoDelFile('a,b', 'csv', 'lingua', 'talos-csv-20261023-2107.csv')).toBe('﻿a,b')
        expect(contenutoDelFile('a,b', 'csv', 'txt', 'dati.txt')).toBe('a,b')
        expect(contenutoDelFile('a,b', 'text', 'lingua', 'dati.txt')).toBe('a,b')
    })
})
