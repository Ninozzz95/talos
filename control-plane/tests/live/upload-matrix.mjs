#!/usr/bin/env node
// @ts-check
/**
 * TALOS LIVE composer file-upload MATRIX.
 *
 * Companion to browse-debug.mjs. Reproduces the EXACT composer upload flow from
 * resources/js/composables/useTalosChatAttachments.ts against the real running
 * stack (default http://localhost:8088), for a matrix of file types, to confirm
 * WHICH types the composer upload fails on.
 *
 * Per fixture (small .txt, 2x2 .png, small .jpg, tiny text PDF — bytes generated
 * in-script):
 *   1) POST /api/files/ingest        (multipart 'file')
 *   2) if result.status === 'available': POST /api/talos/file-authority/grants
 *      { scope:'file', permissions:['model.read','browser.upload'], file_ids:[id], label }
 * Captures: ingest HTTP + result.status + error_code + failure_reason, grant HTTP.
 *
 * Auth uses the same login flow as browse-debug.mjs (session -> /setup -> /login).
 * Reads creds from env: TALOS_USER / TALOS_PASS (base TALOS_BASE_URL).
 *
 * Does NOT touch product code. Run from control-plane/:
 *   TALOS_USER=you@example.com TALOS_PASS='...' node tests/live/upload-matrix.mjs
 */

import { chromium, devices } from '@playwright/test'
import zlib from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const BASE_URL = (process.env.TALOS_BASE_URL ?? 'http://localhost:8088').replace(/\/$/, '')
const HEADED = process.env.HEADED === '1'
const LOGIN_EMAIL = process.env.TALOS_USER ?? process.env.TALOS_EMAIL ?? process.env.TALOS_E2E_EMAIL ?? 'test@example.com'
const LOGIN_PASSWORD = process.env.TALOS_PASS ?? process.env.TALOS_PASSWORD ?? process.env.TALOS_E2E_PASSWORD ?? 'password'
const SETUP_NAME = process.env.TALOS_SETUP_NAME ?? 'TALOS Browse Debug'
const SETUP_EMAIL = process.env.TALOS_SETUP_EMAIL ?? LOGIN_EMAIL
const SETUP_PASSWORD = process.env.TALOS_SETUP_PASS ?? (LOGIN_PASSWORD.length >= 12 ? LOGIN_PASSWORD : 'TalosBrowseDebug!2607')

const stamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19)
const preferredRoot = resolve(__dirname, '../../storage/app/browse-debug')
let OUT_DIR = join(preferredRoot, `upload-matrix-${stamp}`)
try {
    mkdirSync(OUT_DIR, { recursive: true })
} catch {
    OUT_DIR = join(resolve(process.env.TEMP ?? process.env.TMPDIR ?? '.'), 'browse-debug', `upload-matrix-${stamp}`)
    mkdirSync(OUT_DIR, { recursive: true })
}

function log(...args) { console.log(...args) }
function errText(e) { return e instanceof Error ? `${e.name}: ${e.message}` : String(e) }
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)) }

/* --------------------------------------------------------------------------- */
/* Fixture bytes (all generated in-script, no external files)                  */
/* --------------------------------------------------------------------------- */

function crc32(buf) {
    let c
    const table = crc32.table ?? (crc32.table = (() => {
        const t = new Int32Array(256)
        for (let n = 0; n < 256; n += 1) {
            c = n
            for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
            t[n] = c
        }
        return t
    })())
    c = -1
    for (let i = 0; i < buf.length; i += 1) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
    return (c ^ -1) >>> 0
}

function pngChunk(type, data) {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0)
    const typeBuf = Buffer.from(type, 'latin1')
    const crcBuf = Buffer.alloc(4); crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
    return Buffer.concat([len, typeBuf, data, crcBuf])
}

function buildPng2x2() {
    const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
    const ihdr = Buffer.alloc(13)
    ihdr.writeUInt32BE(2, 0)   // width
    ihdr.writeUInt32BE(2, 4)   // height
    ihdr[8] = 8                // bit depth
    ihdr[9] = 2                // color type: RGB
    // rows: each = filter byte (0) + 2 px * 3 bytes
    const raw = Buffer.from([
        0, 255, 0, 0, 0, 255, 0,   // row0: red, green
        0, 0, 0, 255, 255, 255, 0, // row1: blue, yellow
    ])
    const idat = zlib.deflateSync(raw)
    return Buffer.concat([sig, pngChunk('IHDR', ihdr), pngChunk('IDAT', idat), pngChunk('IEND', Buffer.alloc(0))])
}

// Canonical minimal valid baseline JPEG (1x1) — enough to pass MIME sniffing.
const JPEG_1x1_BASE64 =
    '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRof' +
    'Hh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAAB' +
    'AAAAAAAAAAAAAAAAAAAAAv/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AfwD/2Q=='
function buildJpeg1x1() { return Buffer.from(JPEG_1x1_BASE64, 'base64') }

// Minimal valid single-page PDF with real extractable text (correct xref offsets).
function buildTextPdf(text) {
    const esc = text.replace(/([()\\])/g, '\\$1')
    const content = `BT /F1 18 Tf 20 100 Td (${esc}) Tj ET\n`
    const clen = Buffer.byteLength(content, 'latin1')
    const bodies = [
        '<< /Type /Catalog /Pages 2 0 R >>',
        '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
        `<< /Length ${clen} >>\nstream\n${content}endstream`,
        '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    ]
    let pdf = '%PDF-1.4\n'
    const offsets = []
    bodies.forEach((body, i) => {
        offsets.push(Buffer.byteLength(pdf, 'latin1'))
        pdf += `${i + 1} 0 obj\n${body}\nendobj\n`
    })
    const xrefOff = Buffer.byteLength(pdf, 'latin1')
    pdf += `xref\n0 ${bodies.length + 1}\n0000000000 65535 f \n`
    offsets.forEach((off) => { pdf += `${String(off).padStart(10, '0')} 00000 n \n` })
    pdf += `trailer\n<< /Size ${bodies.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOff}\n%%EOF\n`
    return Buffer.from(pdf, 'latin1')
}

const fixtures = [
    { key: 'txt', name: 'matrix-note.txt', mime: 'text/plain', bytes: Buffer.from('TALOS upload matrix fixture. Hello world. Vehicle listing test text.\n', 'utf8') },
    { key: 'png', name: 'matrix-2x2.png', mime: 'image/png', bytes: buildPng2x2() },
    { key: 'jpg', name: 'matrix-1x1.jpg', mime: 'image/jpeg', bytes: buildJpeg1x1() },
    { key: 'pdf', name: 'matrix-text.pdf', mime: 'application/pdf', bytes: buildTextPdf('Hello TALOS upload matrix. Vehicle report page one.') },
]

/* --------------------------------------------------------------------------- */
/* Auth (same flow as browse-debug.mjs)                                         */
/* --------------------------------------------------------------------------- */

async function isAuthenticated(page) {
    return await page.locator('#talos-workspace-root[data-authenticated="true"]').count() > 0
}

async function readCsrf(page) {
    const meta = page.locator('meta[name="csrf-token"]')
    if (await meta.count() > 0) { const v = await meta.getAttribute('content'); if (v) return v }
    const root = page.locator('#talos-workspace-root')
    if (await root.count() > 0) { const v = await root.getAttribute('data-csrf-token'); if (v) return v }
    return null
}

async function authenticate(page) {
    await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' })
    if (await isAuthenticated(page)) return { method: 'existing-session', email: null }

    await page.goto(`${BASE_URL}/setup`, { waitUntil: 'domcontentloaded' })
    const setupForm = page.locator('#talos-setup-form')
    if (await setupForm.isVisible().catch(() => false)) {
        await setupForm.getByLabel('Name').fill(SETUP_NAME)
        await setupForm.getByLabel('Email').fill(SETUP_EMAIL)
        await setupForm.getByLabel('Password', { exact: true }).fill(SETUP_PASSWORD)
        await setupForm.getByLabel('Confirm password').fill(SETUP_PASSWORD)
        await Promise.all([
            page.waitForURL(/\/$/, { timeout: 8_000 }).catch(() => {}),
            setupForm.getByRole('button', { name: 'Create first admin' }).click(),
        ])
        if (await isAuthenticated(page)) return { method: 'setup', email: SETUP_EMAIL }
    }

    for (const [email, password] of [[LOGIN_EMAIL, LOGIN_PASSWORD], [SETUP_EMAIL, SETUP_PASSWORD]]) {
        await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' })
        const form = page.locator('#talos-login-form')
        if (!await form.isVisible().catch(() => false)) {
            if (await isAuthenticated(page)) return { method: 'existing-session', email: null }
            continue
        }
        await form.getByLabel('Email').fill(email)
        await form.getByLabel('Password').fill(password)
        await Promise.all([
            page.waitForURL(/\/$/, { timeout: 8_000 }).catch(() => {}),
            form.getByRole('button', { name: 'Sign in' }).click(),
        ])
        if (await isAuthenticated(page)) return { method: 'login', email }
    }
    throw new Error(`Could not authenticate to ${BASE_URL}. Set TALOS_USER / TALOS_PASS.`)
}

/* --------------------------------------------------------------------------- */
/* Matrix                                                                      */
/* --------------------------------------------------------------------------- */

const report = {
    schema: 'talos_upload_matrix_v1',
    startedAt: new Date().toISOString(),
    finishedAt: null,
    baseUrl: BASE_URL,
    outDir: OUT_DIR,
    auth: null,
    hypothesis: "text/pdf become 'available'; png/jpg fail extraction (OCR disabled) -> composer marks them failed",
    rows: [],
}

async function main() {
    log(`TALOS upload-matrix`)
    log(`  base   : ${BASE_URL}`)
    log(`  out dir: ${OUT_DIR}`)

    const browser = await chromium.launch({ headless: !HEADED })
    const context = await browser.newContext({ ...devices['Desktop Chrome'], baseURL: BASE_URL, ignoreHTTPSErrors: true })
    const page = await context.newPage()

    try {
        report.auth = await authenticate(page)
        await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' })
        await page.locator('#talos-workspace-root[data-authenticated="true"]').first().waitFor({ timeout: 45_000 })
        const csrf = await readCsrf(page)
        log(`  auth   : ${report.auth.method}${report.auth.email ? ` (${report.auth.email})` : ''}; csrf=${csrf ? 'yes' : 'no'}`)

        for (const fx of fixtures) {
            const row = {
                fixture: fx.name,
                type: fx.key,
                mime: fx.mime,
                sizeBytes: fx.bytes.length,
                ingestHttp: null,
                resultStatus: null,
                errorCode: null,
                failureReason: null,
                fileId: null,
                grantHttp: null,
                grantId: null,
                verdict: null,
                error: null,
            }
            report.rows.push(row)
            // Persist the fixture bytes as evidence.
            try { writeFileSync(join(OUT_DIR, fx.name), fx.bytes) } catch { /* ignore */ }

            log(`\n[${fx.key}] ${fx.name} (${fx.bytes.length} bytes, ${fx.mime})`)
            try {
                // 1) INGEST (multipart 'file').
                const ingest = await context.request.post(new URL('/api/files/ingest', BASE_URL).toString(), {
                    headers: { Accept: 'application/json', ...(csrf ? { 'X-CSRF-TOKEN': csrf } : {}) },
                    multipart: { file: { name: fx.name, mimeType: fx.mime, buffer: fx.bytes } },
                    timeout: 60_000,
                })
                row.ingestHttp = ingest.status()
                const text = await ingest.text().catch(() => '')
                let json = null
                try { json = text ? JSON.parse(text) : null } catch { /* non-json */ }
                writeFileSync(join(OUT_DIR, `${fx.key}-ingest-response.json`), text || '(empty)')

                const data = (json && typeof json === 'object' && json.data && typeof json.data === 'object') ? json.data : (json ?? {})
                row.resultStatus = (data && typeof data.status === 'string') ? data.status : null
                row.errorCode = (json && json.error_code) || (data && data.error_code) || null
                row.failureReason = (data && data.failure_reason) || (json && json.message) || null
                row.fileId = (data && typeof data.id === 'string') ? data.id : null

                log(`   ingest -> http ${row.ingestHttp} status=${row.resultStatus} error_code=${row.errorCode ?? '-'} reason=${row.failureReason ?? '-'}`)

                // 2) GRANT (only on available).
                if (row.resultStatus === 'available' && row.fileId) {
                    const grant = await context.request.post(new URL('/api/talos/file-authority/grants', BASE_URL).toString(), {
                        headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...(csrf ? { 'X-CSRF-TOKEN': csrf } : {}) },
                        data: JSON.stringify({ scope: 'file', permissions: ['model.read', 'browser.upload'], file_ids: [row.fileId], label: fx.name }),
                        timeout: 30_000,
                    })
                    row.grantHttp = grant.status()
                    const gtext = await grant.text().catch(() => '')
                    let gjson = null
                    try { gjson = gtext ? JSON.parse(gtext) : null } catch { /* ignore */ }
                    row.grantId = gjson?.data?.id ?? null
                    writeFileSync(join(OUT_DIR, `${fx.key}-grant-response.json`), gtext || '(empty)')
                    log(`   grant  -> http ${row.grantHttp} id=${row.grantId ?? '-'}`)
                    row.verdict = grant.ok() ? 'AVAILABLE (composer would show ready)' : `available-ingest but grant failed (${row.grantHttp})`
                } else {
                    row.verdict = `FAILED at ingest (status=${row.resultStatus ?? row.ingestHttp}) — composer marks attachment failed`
                }
            } catch (error) {
                row.error = errText(error)
                row.verdict = `ERROR: ${row.error}`
                log(`   ERROR: ${row.error}`)
            }
        }
    } catch (fatal) {
        report.auth = report.auth ?? { method: 'FAILED', email: null }
        log(`\nFATAL: ${errText(fatal)}`)
        report.fatal = errText(fatal)
    } finally {
        report.finishedAt = new Date().toISOString()
        writeFileSync(join(OUT_DIR, 'upload-matrix-report.json'), JSON.stringify(report, null, 2))
        await context.close().catch(() => {})
        await browser.close().catch(() => {})
        printTable()
    }
}

function printTable() {
    log(`\n================= UPLOAD MATRIX =================`)
    log(`Report : ${join(OUT_DIR, 'upload-matrix-report.json')}`)
    log(`Auth   : ${report.auth ? report.auth.method : 'FAILED'}`)
    const head = ['fixture', 'mime', 'ingestHTTP', 'result.status', 'error_code', 'grantHTTP', 'verdict']
    const rows = report.rows.map((r) => [
        r.fixture,
        r.mime,
        String(r.ingestHttp ?? '-'),
        String(r.resultStatus ?? '-'),
        String(r.errorCode ?? '-'),
        String(r.grantHttp ?? '-'),
        String(r.verdict ?? r.error ?? '-'),
    ])
    const widths = head.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)))
    const fmt = (cells) => cells.map((c, i) => c.padEnd(widths[i])).join('  ')
    log(fmt(head))
    log(widths.map((w) => '-'.repeat(w)).join('  '))
    for (const r of rows) log(fmt(r))
    log(`================================================\n`)
}

main().catch((error) => {
    log(`Harness crashed: ${errText(error)}`)
    try { writeFileSync(join(OUT_DIR, 'upload-matrix-report.json'), JSON.stringify(report, null, 2)) } catch { /* ignore */ }
    process.exit(1)
})
