#!/usr/bin/env node

/**
 * PERM-RED-01/02 — release-artifact gate for Capacitor permission metadata.
 *
 * R8 can produce a valid APK while removing the annotation payload that
 * Capacitor reads through reflection. This gate inspects the actual release
 * dex; source/configuration tests alone cannot prove that the payload survived.
 *
 * Usage from mobile/:
 *   node scripts/verify-release-permission-metadata.mjs
 *   node scripts/verify-release-permission-metadata.mjs <apk> <mapping>
 */

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const MOBILE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

export const PERMISSION_METADATA_CASES = Object.freeze([
    {
        className: 'ai.talos.parola.TalosParolaPlugin',
        permissions: [{ alias: 'microfono', strings: ['android.permission.RECORD_AUDIO'] }],
    },
    {
        className: 'ai.talos.TalosDevicePermissionsPlugin',
        permissions: [
            { alias: 'notifications', strings: ['android.permission.POST_NOTIFICATIONS'] },
            { alias: 'contacts', strings: ['android.permission.READ_CONTACTS'] },
            {
                alias: 'calendar',
                strings: ['android.permission.READ_CALENDAR', 'android.permission.WRITE_CALENDAR'],
            },
            { alias: 'camera', strings: ['android.permission.CAMERA'] },
            { alias: 'mailCount', strings: ['com.google.android.gm.permission.READ_CONTENT_PROVIDER'] },
            { alias: 'location', strings: ['android.permission.ACCESS_COARSE_LOCATION'] },
        ],
    },
    {
        className: 'ai.talos.agent.TalosCalendarioPlugin',
        permissions: [
            { alias: 'calendario', strings: ['android.permission.READ_CALENDAR'] },
            { alias: 'calendarioScrittura', strings: ['android.permission.WRITE_CALENDAR'] },
        ],
    },
    {
        className: 'ai.talos.agent.TalosDictationPlugin',
        permissions: [{ alias: 'microfono', strings: ['android.permission.RECORD_AUDIO'] }],
    },
    {
        className: 'ai.talos.agent.TalosDevicePlugin',
        permissions: [{ alias: 'posta', strings: ['com.google.android.gm.permission.READ_CONTENT_PROVIDER'] }],
    },
    {
        className: 'ai.talos.agent.TalosRubricaPlugin',
        permissions: [{ alias: 'contatti', strings: ['android.permission.READ_CONTACTS'] }],
    },
    {
        className: 'ai.talos.agent.TalosSpeechSicuro',
        permissions: [{ alias: 'speechRecognition', strings: ['android.permission.RECORD_AUDIO'] }],
    },
])

function escapeRegExp(value) {
    return value.replace(/[.$]/g, '\\$&')
}

export function mappedClassName(mapping, originalName) {
    const match = mapping.match(
        new RegExp('^' + escapeRegExp(originalName) + ' -> ([^:]+):$', 'm'),
    )
    return match?.[1] ?? originalName
}

export function methodBody(dex, methodName) {
    const marker = new RegExp(
        '^\\.method [^\\n]*\\b' + escapeRegExp(methodName) + '\\(',
        'm',
    )
    const start = dex.search(marker)
    if (start < 0) return null
    const end = dex.indexOf('\n.end method', start)
    return dex.slice(start, end < 0 ? dex.length : end)
}

export function assertPermissionMetadata(dex, contract) {
    if (!dex.includes('.class ')) {
        throw new Error('apkanalyzer did not return a class for ' + contract.className)
    }
    if (!dex.includes('permissions = {')) {
        throw new Error(contract.className + ': @CapacitorPlugin.permissions is missing')
    }
    for (const permission of contract.permissions) {
        if (!dex.includes('alias = "' + permission.alias + '"')) {
            throw new Error(contract.className + ': alias ' + permission.alias + ' is missing')
        }
        for (const androidPermission of permission.strings) {
            if (!dex.includes('"' + androidPermission + '"')) {
                throw new Error(
                    contract.className + ': permission ' + androidPermission + ' is missing',
                )
            }
        }
    }
}

function sdkCandidates() {
    const roots = [
        process.env.ANDROID_SDK_ROOT,
        process.env.ANDROID_HOME,
        process.env.LOCALAPPDATA
            ? path.join(process.env.LOCALAPPDATA, 'Android', 'Sdk')
            : null,
    ].filter(Boolean)
    const candidates = []
    for (const root of roots) {
        candidates.push(
            path.join(root, 'cmdline-tools', 'latest', 'bin', 'apkanalyzer.bat'),
            path.join(root, 'cmdline-tools', 'latest', 'bin', 'apkanalyzer'),
            path.join(root, 'tools', 'bin', 'apkanalyzer.bat'),
            path.join(root, 'tools', 'bin', 'apkanalyzer'),
        )
    }
    return candidates
}

export function findApkanalyzer() {
    const candidate = sdkCandidates().find(existsSync)
    if (!candidate) {
        throw new Error(
            'apkanalyzer non trovato: imposta ANDROID_SDK_ROOT/ANDROID_HOME ' +
            'o installa cmdline-tools.',
        )
    }
    return candidate
}

function analyze(askanalyzer, apk, className) {
    const command = process.platform === 'win32' && askanalyzer.endsWith('.bat')
        ? 'cmd.exe'
        : askanalyzer
    const args = command === 'cmd.exe'
        ? [
            '/d',
            '/c',
            (askanalyzer.includes(' ') ? '"' + askanalyzer + '"' : askanalyzer) +
                ' dex code --class ' + className + ' ' +
                (apk.includes(' ') ? '"' + apk + '"' : apk),
        ]
        : ['dex', 'code', '--class', className, apk]
    try {
        return execFileSync(
            command,
            args,
            { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
        )
    } catch (error) {
        const output = String(error.stdout ?? '') + String(error.stderr ?? '')
        // Some apkanalyzer versions return non-zero after emitting valid smali.
        if (output.includes('.class ')) return output
        throw new Error(
            'apkanalyzer fallito per ' + className + ': ' + (output || error.message),
        )
    }
}

export function verifyReleasePermissionMetadata({
    apk,
    mapping,
    askanalyzer = findApkanalyzer(),
} = {}) {
    const apkPath = path.resolve(
        MOBILE_ROOT,
        apk ?? 'android/app/build/outputs/apk/release/app-release-unsigned.apk',
    )
    const mappingPath = path.resolve(
        MOBILE_ROOT,
        mapping ?? 'android/app/build/outputs/mapping/release/mapping.txt',
    )
    if (!existsSync(apkPath)) throw new Error('APK non trovato: ' + apkPath)
    if (!existsSync(mappingPath)) throw new Error('mapping R8 non trovato: ' + mappingPath)

    const mappingText = readFileSync(mappingPath, 'utf8')
    const reports = []

    for (const contract of PERMISSION_METADATA_CASES) {
        const dex = analyze(
            askanalyzer,
            apkPath,
            mappedClassName(mappingText, contract.className),
        )
        assertPermissionMetadata(dex, contract)
        reports.push(contract.className)
    }

    const capacitorPlugin = analyze(
        askanalyzer,
        apkPath,
        mappedClassName(mappingText, 'com.getcapacitor.annotation.CapacitorPlugin'),
    )
    for (const member of ['name()', 'permissions()', 'requestCodes()']) {
        if (!capacitorPlugin.includes(member)) {
            throw new Error('CapacitorPlugin annotation member ' + member + ' is missing')
        }
    }

    const permission = analyze(
        askanalyzer,
        apkPath,
        mappedClassName(mappingText, 'com.getcapacitor.annotation.Permission'),
    )
    for (const member of ['alias()', 'strings()']) {
        if (!permission.includes(member)) {
            throw new Error('Permission annotation member ' + member + ' is missing')
        }
    }

    const base = analyze(
        askanalyzer,
        apkPath,
        mappedClassName(mappingText, 'com.getcapacitor.Plugin'),
    )
    for (const methodName of [
        'getPermissionStates',
        'requestPermissionForAliases',
        'requestPermissions',
    ]) {
        const body = methodBody(base, methodName)
        if (!body) throw new Error('Capacitor Plugin method ' + methodName + ' is missing')
        if (!body.includes('permissions()')) {
            throw new Error(methodName + ': release body no longer reads permissions()')
        }
        if (/const\/4\s+\w+, 0x0\s*\n\s*throw/.test(body)) {
            throw new Error(methodName + ': release body still contains throw-null')
        }
    }

    return { apk: apkPath, mapping: mappingPath, plugins: reports }
}

function main() {
    const result = verifyReleasePermissionMetadata({
        apk: process.argv[2],
        mapping: process.argv[3],
    })
    console.log(
        'PERM-ARTIFACT-GREEN ' +
        result.plugins.length +
        ' plugin contracts; Capacitor permission readers retained: ' +
        result.apk,
    )
}

const invokedPath = process.argv[1]
if (invokedPath && pathToFileURL(path.resolve(invokedPath)).href === import.meta.url) {
    main()
}
