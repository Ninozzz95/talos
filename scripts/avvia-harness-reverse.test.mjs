import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
    analizzaElencoDispositivi,
    avviaTunnel,
    principale,
    risolviSerialeAttivo,
} from './avvia-harness-reverse.mjs'

/*
 * ⛔ I seriali qui sotto sono INVENTATI, e devono restarlo: questi test
 * misurano la FORMA di quello che `adb devices -l` stampa — una riga per
 * trasporto, il doppione TLS, la lista vuota — non quale tablet sia
 * collegato. Un seriale vero e' il numero di un oggetto di una persona e
 * non ha ragione di stare in un repository pubblico.
 */

const UN_DISPOSITIVO = 'List of devices attached\n1a2b3c4d\tdevice product:OPD2415 model:OPD2415 device:OP6190L1\n'
const DUE_DISPOSITIVI = 'List of devices attached\n'
    + '1a2b3c4d\tdevice product:OPD2415 model:OPD2415 device:OP6190L1\n'
    + 'adb-1a2b3c4d-1yc9eU._adb-tls-connect._tcp\tdevice product:OPD2415 model:OPD2415 device:OP6190L1\n'
const ZERO_DISPOSITIVI = 'List of devices attached\n'
const DISPOSITIVO_NON_PRONTO = 'List of devices attached\nXYZ123\tunauthorized\n'

describe('analizzaElencoDispositivi', () => {
    it('legge seriale e stato, scartando la riga di intestazione', () => {
        assert.deepEqual(analizzaElencoDispositivi(UN_DISPOSITIVO), [
            { seriale: '1a2b3c4d', stato: 'device' },
        ]);
    })

    it('elenco vuoto (solo intestazione) → array vuoto', () => {
        assert.deepEqual(analizzaElencoDispositivi(ZERO_DISPOSITIVI), []);
    })

    it('più righe, stati diversi', () => {
        assert.deepEqual(analizzaElencoDispositivi(DUE_DISPOSITIVI), [
            { seriale: '1a2b3c4d', stato: 'device' },
            { seriale: 'adb-1a2b3c4d-1yc9eU._adb-tls-connect._tcp', stato: 'device' },
        ]);
        assert.deepEqual(analizzaElencoDispositivi(DISPOSITIVO_NON_PRONTO), [
            { seriale: 'XYZ123', stato: 'unauthorized' },
        ]);
    })
})

describe('risolviSerialeAttivo', () => {
    it('un --serial esplicito vince, e non chiama nemmeno adb devices', () => {
        const eseguiAdb = () => { throw new Error('non doveva essere chiamato') };
        assert.equal(risolviSerialeAttivo(eseguiAdb, 'adb', 'scelto-a-mano'), 'scelto-a-mano');
    })

    it('un solo dispositivo pronto → il suo seriale', () => {
        const eseguiAdb = () => UN_DISPOSITIVO;
        assert.equal(risolviSerialeAttivo(eseguiAdb, 'adb', null), '1a2b3c4d');
    })

    it('zero dispositivi pronti → errore onesto, mai un seriale inventato', () => {
        const eseguiAdb = () => ZERO_DISPOSITIVI;
        assert.throws(() => risolviSerialeAttivo(eseguiAdb, 'adb', null), /[Nn]essun dispositivo/);
    })

    it('un dispositivo "unauthorized" NON conta come pronto — stesso esito di zero dispositivi', () => {
        const eseguiAdb = () => DISPOSITIVO_NON_PRONTO;
        assert.throws(() => risolviSerialeAttivo(eseguiAdb, 'adb', null), /[Nn]essun dispositivo/);
    })

    it('più di un dispositivo pronto → errore onesto che li elenca entrambi, mai un indovinare', () => {
        const eseguiAdb = () => DUE_DISPOSITIVI;
        assert.throws(
            () => risolviSerialeAttivo(eseguiAdb, 'adb', null),
            (errore) => errore.message.includes('1a2b3c4d')
                && errore.message.includes('adb-1a2b3c4d-1yc9eU._adb-tls-connect._tcp')
                && errore.message.includes('--serial'),
        );
    })
})

describe('avviaTunnel', () => {
    it('reverse + reverse --list mostra la regola tcp:4174 → torna la conferma', () => {
        const chiamate = [];
        const eseguiAdb = (adb, argomenti) => {
            chiamate.push(argomenti);
            if (argomenti.includes('--list')) return '127.0.0.1:4174 -> tcp:4174\n';
            return '';
        };
        const conferma = avviaTunnel(eseguiAdb, 'adb', 'ser-1');
        assert.match(conferma, /tcp:4174/);
        assert.deepEqual(chiamate[0], ['-s', 'ser-1', 'reverse', 'tcp:4174', 'tcp:4174']);
        assert.deepEqual(chiamate[1], ['-s', 'ser-1', 'reverse', '--list']);
    })

    /**
     * ⛔ AL CONTRARIO — "una grep non è una prova" applicato a un comando di
     * rete: `adb reverse` che non stampa errori non è, da solo, la prova
     * che il tunnel sia davvero attivo. Se `--list` non mostra la regola
     * appena chiesta, questo deve fallire rumorosamente, mai un successo
     * silenzioso e falso.
     */
    it('AL CONTRARIO: reverse non lancia errori ma --list non mostra tcp:4174 → fallisce, mai un successo silenzioso', () => {
        const eseguiAdb = (adb, argomenti) => (argomenti.includes('--list') ? 'nessuna regola qui\n' : '');
        assert.throws(() => avviaTunnel(eseguiAdb, 'adb', 'ser-1'), /non fidarsi/);
    })
})

describe('principale', () => {
    it('senza --serial: risolve da adb devices, avvia il tunnel, stampa la conferma', () => {
        const chiamate = [];
        const eseguiAdb = (adb, argomenti) => {
            chiamate.push(argomenti);
            if (argomenti[0] === 'devices') return UN_DISPOSITIVO;
            if (argomenti.includes('--list')) return '127.0.0.1:4174 -> tcp:4174\n';
            return '';
        };
        principale(eseguiAdb, []);
        assert.deepEqual(chiamate[0], ['devices', '-l']);
        assert.deepEqual(chiamate[1], ['-s', '1a2b3c4d', 'reverse', 'tcp:4174', 'tcp:4174']);
    })

    it('con --serial esplicito: non chiama mai "adb devices"', () => {
        const chiamate = [];
        const eseguiAdb = (adb, argomenti) => {
            chiamate.push(argomenti);
            if (argomenti.includes('--list')) return '127.0.0.1:4174 -> tcp:4174\n';
            return '';
        };
        principale(eseguiAdb, ['--serial', 'a-mano']);
        assert.equal(chiamate.some((argomenti) => argomenti[0] === 'devices'), false);
        assert.deepEqual(chiamate[0], ['-s', 'a-mano', 'reverse', 'tcp:4174', 'tcp:4174']);
    })

    it('--serial senza valore → errore onesto, mai un seriale "undefined"', () => {
        assert.throws(() => principale(() => '', ['--serial']), /--serial richiede un valore/);
    })
})
