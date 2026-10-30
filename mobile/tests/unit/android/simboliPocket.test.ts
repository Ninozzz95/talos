/**
 * SIMBOLI-POCKET-01/02 (REL-083, 28/10/2026) — `libtalos_pocket_sentencepiece.so` esportava 2.056 simboli, di cui 1.638 della libc++
 * statica (`std::__`): misura del Mobile su vc349 con `llvm-nm -D --defined-only`. `-fvisibility=hidden` non basta, perché «all the
 * symbols included from libc++_static.a will become public symbols of your library» (developer.android.com/ndk/guides/symbol-visibility,
 * aggiornata il 06/03/2026). La strada indicata come la più robusta è uno script di versione: pubbliche solo le funzioni JNI, il resto
 * locale. Così la libc++ statica del modulo resta isolata dalla `libc++_shared.so` dell'app («One STL per app»,
 * developer.android.com/ndk/guides/cpp-support). La prova vera è sull'APK: 0 `std::__` esportati, le 6 `Java_ai_talos_voice_pocket_*`
 * ancora esportate.
 */
import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const cpp = resolve(__dirname, '../../../android/pocket-tts-runtime/src/main/cpp')

describe('SIMBOLI-POCKET la libreria della voce esporta solo le sue funzioni JNI', () => {
    it('SIMBOLI-POCKET-01 lo script di versione rende pubbliche solo le Java_ai_talos_voice_pocket_* e locale tutto il resto', () => {
        const mappa = resolve(cpp, 'talos_pocket_jni.map.txt')
        expect(existsSync(mappa)).toBe(true)
        const testo = readFileSync(mappa, 'utf8')
        expect(testo).toMatch(/global:\s*Java_ai_talos_voice_pocket_\*;/u)
        expect(testo).toMatch(/local:\s*\*;/u)
    })

    it('SIMBOLI-POCKET-02 il CMakeLists lega la libreria allo script, e un cambio dello script rifà il link', () => {
        const cmake = readFileSync(resolve(cpp, 'CMakeLists.txt'), 'utf8')
        expect(cmake).toMatch(/target_link_options\(\s*talos_pocket_sentencepiece[\s\S]*?-Wl,--version-script,\$\{CMAKE_CURRENT_LIST_DIR\}\/talos_pocket_jni\.map\.txt/u)
        expect(cmake).toMatch(/-Wl,--no-undefined-version/u)
        expect(cmake).toMatch(/LINK_DEPENDS\s+\$\{CMAKE_CURRENT_LIST_DIR\}\/talos_pocket_jni\.map\.txt/u)
    })
})
