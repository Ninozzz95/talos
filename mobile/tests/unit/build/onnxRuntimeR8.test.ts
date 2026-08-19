import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const PROGUARD = resolve(__dirname, '../../../android/app/proguard-rules.pro')

describe('ONNX Runtime survives R8 on Android', () => {
    it('keeps the Java binding classes used by JNI reflection', () => {
        const rules = readFileSync(PROGUARD, 'utf8')
        expect(rules).toContain('-keep class ai.onnxruntime.** { *; }')
    })
})
