import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { assertCampiRisorsa, campiNelDex, campiRisorsa, classiNelMapping } from './verify-release-r8-risorse.mjs'

/*
 * D-0146-1 (Pad, 26/10/2026): R8 aveva tolto `TalosMotoreOspite.legato`, il `LocalSocket` che possiede il socket in ascolto del
 * motore ospite; il GC lo finalizzava e il Codice col modello locale moriva («nessun modello aperto»). Mapping e `dexdump` qui
 * sotto sono quelli VERI per quella classe: vc298 (prima, `ai.talos.n1` senza il campo) e vc299 (dopo, `ai.talos.o1`, il campo
 * tenuto col suo nome e per questo ASSENTE dal mapping).
 */
const MAPPING_VC298 = `ai.talos.TalosMotoreOspite -> ai.talos.n1:
# {"id":"sourceFile","fileName":"TalosMotoreOspite.java"}
    int $r8$classId -> b
      # {"id":"com.android.tools.r8.synthesized"}
    java.lang.String socketPath -> c
      # {"id":"com.android.tools.r8.residualsignature","signature":"Ljava/lang/Object;"}
    java.lang.String chiave -> d
    android.net.LocalServerSocket server -> e
    ai.talos.TalosMotoreOspiteServizio servizio -> f
    1:3:void <init>(android.content.Context):0:0 -> <init>
`
const DEX_VC298 = `Class #1            -
  Class descriptor  : 'Lai/talos/n1;'
  Access flags      : 0x0011 (PUBLIC FINAL)
  Static fields     -
  Instance fields   -
    #0              : (in Lai/talos/n1;)
      name          : 'b'
      type          : 'I'
    #1              : (in Lai/talos/n1;)
      name          : 'c'
      type          : 'Ljava/lang/Object;'
    #2              : (in Lai/talos/n1;)
      name          : 'd'
      type          : 'Ljava/lang/Object;'
    #3              : (in Lai/talos/n1;)
      name          : 'e'
      type          : 'Ljava/lang/Object;'
    #4              : (in Lai/talos/n1;)
      name          : 'f'
      type          : 'Ljava/lang/Object;'
  Direct methods    -
    #0              : (in Lai/talos/n1;)
      name          : '<init>'
`
const MAPPING_VC299 = `ai.talos.TalosMotoreOspite -> ai.talos.o1:
# {"id":"sourceFile","fileName":"TalosMotoreOspite.java"}
    java.lang.String socketPath -> a
    java.lang.String chiave -> b
    java.io.File socket -> c
    ai.talos.TalosMotoreOspiteServizio servizio -> d
    boolean vivo -> e
    0:3:void <init>(android.content.Context):109:109 -> <init>
`
const DEX_VC299 = `  Class descriptor  : 'Lai/talos/o1;'
  Static fields     -
    #0              : (in Lai/talos/o1;)
      name          : 'f'
      type          : 'La0/f0;'
  Instance fields   -
    #0              : (in Lai/talos/o1;)
      name          : 'a'
      type          : 'Ljava/lang/String;'
    #5              : (in Lai/talos/o1;)
      name          : 'legato'
      type          : 'Landroid/net/LocalSocket;'
    #6              : (in Lai/talos/o1;)
      name          : 'server'
      type          : 'Landroid/net/LocalServerSocket;'
  Direct methods    -
    #0              : (in Lai/talos/o1;)
      name          : '<init>'
`

const SORGENTE = `package ai.talos;

final class TalosMotoreOspite {
    private static TalosMotoreOspite attivo;
    final String socketPath;
    private final LocalSocket legato;
    private final LocalServerSocket server;
    private void accetta() {
        while (true) {
            final LocalSocket connessione;
        }
    }
}
`

test('R8-RIS-01 dal sorgente: i campi di classe con un tipo-risorsa, mai le variabili locali', () => {
    assert.deepEqual(campiRisorsa(SORGENTE, 'TalosMotoreOspite.java'), [
        { classe: 'ai.talos.TalosMotoreOspite', campo: 'legato', tipo: 'LocalSocket' },
        { classe: 'ai.talos.TalosMotoreOspite', campo: 'server', tipo: 'LocalServerSocket' },
    ])
    const kotlin = 'package ai.talos.x\n\nclass Ponte {\n    private var tubo: ParcelFileDescriptor? = null\n    fun f() {\n        var lettura: ParcelFileDescriptor? = null\n    }\n}\n'
    assert.deepEqual(campiRisorsa(kotlin, 'Ponte.kt'), [{ classe: 'ai.talos.x.Ponte', campo: 'tubo', tipo: 'ParcelFileDescriptor' }])
})

test('R8-RIS-02 la vc298 (prima): `legato` non c\'è nel dex, il cancello FALLISCE', () => {
    const esito = assertCampiRisorsa({ mapping: MAPPING_VC298, dex: DEX_VC298, campi: campiRisorsa(SORGENTE, 'TalosMotoreOspite.java') })
    assert.equal(esito.verdict, 'FAIL')
    assert.equal(esito.issues.length, 1)
    assert.match(esito.issues[0], /ai\.talos\.TalosMotoreOspite\.legato \(LocalSocket\): assente dal dex \(classe ai\.talos\.n1\)/u)
})

test('R8-RIS-03 la vc299 (dopo): i campi tenuti col loro nome NON sono nel mapping ma sono nel dex, il cancello PASSA', () => {
    assert.equal(classiNelMapping(MAPPING_VC299).get('ai.talos.TalosMotoreOspite').rinominati.has('legato'), false)
    const esito = assertCampiRisorsa({ mapping: MAPPING_VC299, dex: DEX_VC299, campi: campiRisorsa(SORGENTE, 'TalosMotoreOspite.java') })
    assert.deepEqual(esito, { verdict: 'PASS', issues: [], assenti: [] })
})

test('R8-RIS-04 un campo RINOMINATO si cerca col nome del mapping; una classe tolta per intero non fa fallire', () => {
    const mapping = MAPPING_VC298.replace('    android.net.LocalServerSocket server -> e\n', '    android.net.LocalSocket legato -> e\n')
    const campi = [{ classe: 'ai.talos.TalosMotoreOspite', campo: 'legato', tipo: 'LocalSocket' }]
    assert.equal(assertCampiRisorsa({ mapping, dex: DEX_VC298, campi }).verdict, 'PASS')
    const tolta = assertCampiRisorsa({ mapping: 'altro.Classe -> a.b:\n', dex: '', campi: [{ classe: 'ai.talos.Tolta', campo: 'x', tipo: 'LocalSocket' }] })
    assert.deepEqual(tolta, { verdict: 'PASS', issues: [], assenti: ['ai.talos.Tolta'] })
    assert.deepEqual([...campiNelDex(DEX_VC299).get('Lai/talos/o1;')].sort(), ['a', 'f', 'legato', 'server'])
})

test('R8-RIS-05 il sorgente VERO del motore ospite dichiara i due campi che il cancello controlla', () => {
    const vero = readFileSync(new URL('../android/app/src/main/java/ai/talos/TalosMotoreOspite.java', import.meta.url), 'utf8')
    const nomi = campiRisorsa(vero, 'TalosMotoreOspite.java').map((c) => c.campo)
    assert.ok(nomi.includes('legato') && nomi.includes('server'), nomi.join(','))
})
