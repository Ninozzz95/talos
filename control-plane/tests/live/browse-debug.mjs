#!/usr/bin/env node
// @ts-check
/**
 * TALOS LIVE browse-debug harness.
 *
 * Drives the REAL running TALOS stack (default http://localhost:8088) end-to-end
 * with a headless Chromium and SCREENSHOTS + records the real HTTP responses for
 * the browser-HMI flow so we can reproduce browser bugs with on-screen evidence
 * instead of hand-testing.
 *
 * This script NEVER touches app/product code. It only reads the DOM and calls the
 * same public API the UI calls. On any step failure it still writes the report +
 * screenshots (evidence is never thrown away).
 *
 * Run (from control-plane/, so @playwright/test resolves):
 *   TALOS_USER=you@example.com TALOS_PASS='...' node tests/live/browse-debug.mjs
 *   HEADED=1 ... node tests/live/browse-debug.mjs      # watch it drive
 *   TARGET_URL=https://example.com ... node tests/live/browse-debug.mjs
 *
 * See README-browse-debug.md for the full contract.
 */

import { chromium, devices } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

/* --------------------------------------------------------------------------- */
/* Configuration (all overridable via env)                                     */
/* --------------------------------------------------------------------------- */

const BASE_URL = (process.env.TALOS_BASE_URL ?? 'http://localhost:8088').replace(/\/$/, '')
const TARGET_URL = process.env.TARGET_URL ?? 'https://caradero-web.vercel.app/'
const HEADED = process.env.HEADED === '1'
const MOBILE = process.env.MOBILE === '1'
// Normalized click point inside the snapshot frame (0..1). Upper-middle tends to
// hit a vehicle card/link on a listing page.
const CLICK_X = clampUnit(Number(process.env.CLICK_X ?? '0.5'), 0.5)
const CLICK_Y = clampUnit(Number(process.env.CLICK_Y ?? '0.34'), 0.34)

const LOGIN_EMAIL = process.env.TALOS_USER ?? process.env.TALOS_EMAIL ?? process.env.TALOS_E2E_EMAIL ?? 'test@example.com'
const LOGIN_PASSWORD = process.env.TALOS_PASS ?? process.env.TALOS_PASSWORD ?? process.env.TALOS_E2E_PASSWORD ?? 'password'
// First-run /setup fallback (Password::min(12) is enforced server-side).
const SETUP_NAME = process.env.TALOS_SETUP_NAME ?? 'TALOS Browse Debug'
const SETUP_EMAIL = process.env.TALOS_SETUP_EMAIL ?? LOGIN_EMAIL
const SETUP_PASSWORD = process.env.TALOS_SETUP_PASS ?? (LOGIN_PASSWORD.length >= 12 ? LOGIN_PASSWORD : 'TalosBrowseDebug!2607')

const NAV_TIMEOUT = 45_000
const API_WAIT_TIMEOUT = 20_000

function clampUnit(value, fallback) {
    if (!Number.isFinite(value) || value < 0 || value > 1) return fallback
    return value
}

/* --------------------------------------------------------------------------- */
/* Output directory (timestamped)                                              */
/* --------------------------------------------------------------------------- */

const stamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19)
const preferredRoot = resolve(__dirname, '../../storage/app/browse-debug')
const scratchRoot = process.env.CLAUDE_SCRATCHPAD ?? process.env.TEMP ?? process.env.TMPDIR ?? '.'

let OUT_DIR = join(preferredRoot, `run-${stamp}`)
try {
    mkdirSync(OUT_DIR, { recursive: true })
} catch {
    OUT_DIR = join(resolve(scratchRoot), 'browse-debug', `run-${stamp}`)
    mkdirSync(OUT_DIR, { recursive: true })
}

/* --------------------------------------------------------------------------- */
/* Report state                                                                */
/* --------------------------------------------------------------------------- */

const report = {
    schema: 'talos_browse_debug_v1',
    startedAt: new Date().toISOString(),
    finishedAt: null,
    baseUrl: BASE_URL,
    targetUrl: TARGET_URL,
    headed: HEADED,
    mobile: MOBILE,
    outDir: OUT_DIR,
    auth: null,
    devBrowserEvidence: null,
    browserSession: { id: null, talosSessionId: null },
    keyFindings: {
        recoveryReason: null,          // the KEY output: which reason fired
        recoveryHttpStatus: null,
        recoveryCode: null,
        blankSnapshot: null,
        snapshotPixelSummary: null,
        scrollWorks: null,
        uploadWorks: null,
        retryStuck: null,
        clickFinalStatus: null,
    },
    steps: [],
    apiLog: [],
    consoleErrors: [],
    pageErrors: [],
}

let stepCounter = 0
let authed = false
const bodyReads = []

// Identity of the CURRENT browse frame (the last screenshot the session recorded),
// captured in step 5 and consumed by the scroll verb in step 6. `sha256` is the
// RAW artifact hash (no prefix); the API wants it as `sha256:<raw>`.
let currentFrame = { artifactId: null, stateVersion: null, sha256: null }

/** Fail a UI step fast when auth never succeeded (avoids long DOM waits). */
function requireAuthed() {
    if (!authed) throw new Error('skipped — not authenticated (set TALOS_USER / TALOS_PASS)')
}

/** Normalise a browser-artifact hash to the API's `sha256:<64hex>` form. */
function prefixedSha(raw) {
    if (typeof raw !== 'string' || raw === '') return null
    return raw.startsWith('sha256:') ? raw : `sha256:${raw}`
}

/** Strip an optional `sha256:` prefix so two hashes can be compared raw-to-raw. */
function stripSha(value) {
    if (typeof value !== 'string') return null
    return value.startsWith('sha256:') ? value.slice('sha256:'.length) : value
}

function log(...args) {
    // eslint-disable-next-line no-console
    console.log(...args)
}

function shortPath(url) {
    try {
        const u = new URL(url)
        return u.pathname + (u.search || '')
    } catch {
        return url
    }
}

/** Only capture bodies for the JSON/API endpoints we care about (skip binary previews). */
function shouldCaptureBody(url) {
    const p = shortPath(url)
    if (/\/api\/talos\/browser\/artifacts\/[^/]+\/preview/.test(p)) return false
    return /\/api\/talos\/(browser|chat|sessions|settings)|\/api\/files\/ingest/.test(p)
}

function isBrowserApi(url) {
    return /\/api\/talos\/browser\//.test(shortPath(url))
}

/* --------------------------------------------------------------------------- */
/* Screenshot + step helpers                                                   */
/* --------------------------------------------------------------------------- */

async function shot(page, name, locator = null) {
    const safe = name.replace(/[^a-z0-9._-]+/gi, '-')
    const file = join(OUT_DIR, `${String(report.steps.length).padStart(2, '0')}-${safe}.png`)
    try {
        if (locator) {
            await locator.screenshot({ path: file, timeout: 8_000 })
        } else {
            await page.screenshot({ path: file, fullPage: false, timeout: 12_000 })
        }
        return file
    } catch (error) {
        return `SCREENSHOT_FAILED: ${errText(error)}`
    }
}

function errText(error) {
    if (!error) return 'unknown'
    return error instanceof Error ? `${error.name}: ${error.message}` : String(error)
}

/**
 * Run one harness step. Always records a step entry (even on throw) so evidence
 * survives. `fn` receives a mutable `record` it can annotate.
 */
async function step(page, id, title, fn) {
    stepCounter += 1
    const record = {
        n: stepCounter,
        id,
        title,
        ok: false,
        action: title,
        httpStatus: null,
        code: null,
        reason: null,
        note: null,
        screenshots: [],
        error: null,
    }
    report.steps.push(record)
    log(`\n[STEP ${id}] ${title}`)
    try {
        await fn(record)
        record.ok = true
        log(`  -> ok${record.httpStatus ? ` (http ${record.httpStatus})` : ''}${record.reason ? ` reason=${record.reason}` : ''}${record.note ? ` — ${record.note}` : ''}`)
    } catch (error) {
        record.error = errText(error)
        log(`  -> FAILED: ${record.error}`)
        record.screenshots.push(await shot(page, `${id}-error`))
    }
    return record
}

/* --------------------------------------------------------------------------- */
/* API helper (mirrors the E2E realApi: CSRF + JSON via the page's cookie jar) */
/* --------------------------------------------------------------------------- */

async function readCsrf(page) {
    const meta = page.locator('meta[name="csrf-token"]')
    if (await meta.count() > 0) {
        const v = await meta.getAttribute('content')
        if (v) return v
    }
    const root = page.locator('#talos-workspace-root')
    if (await root.count() > 0) {
        const v = await root.getAttribute('data-csrf-token')
        if (v) return v
    }
    return null
}

async function apiFetch(page, method, path, body, extraHeaders = {}) {
    const csrf = await readCsrf(page)
    const res = await page.context().request.fetch(new URL(path, BASE_URL).toString(), {
        method,
        data: body === undefined ? undefined : body,
        headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            ...(csrf ? { 'X-CSRF-TOKEN': csrf } : {}),
            ...extraHeaders,
        },
    })
    const text = await res.text().catch(() => '')
    let json = null
    try { json = text ? JSON.parse(text) : null } catch { /* non-json */ }
    return { status: res.status(), ok: res.ok(), text, json }
}

/* --------------------------------------------------------------------------- */
/* Recovery-reason extraction                                                  */
/* --------------------------------------------------------------------------- */

/** Pull { code, reason } out of a browser-HMI JSON error body. */
function extractHmiError(json) {
    if (!json || typeof json !== 'object') return { code: null, reason: null }
    const code = typeof json.code === 'string' ? json.code : null
    const details = json.details && typeof json.details === 'object' ? json.details : {}
    const reason = typeof details.reason === 'string' ? details.reason : null
    return { code, reason }
}

/* --------------------------------------------------------------------------- */
/* DOM helpers                                                                 */
/* --------------------------------------------------------------------------- */

async function firstVisible(locators, timeout = 6_000) {
    const deadline = Date.now() + timeout
    while (Date.now() < deadline) {
        for (const loc of locators) {
            if (await loc.count() > 0 && await loc.first().isVisible().catch(() => false)) {
                return loc.first()
            }
        }
        await sleep(150)
    }
    return null
}

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms))
}

async function isAuthenticated(page) {
    return await page.locator('#talos-workspace-root[data-authenticated="true"]').count() > 0
}

async function dismissOverlays(page) {
    // Intro modal (first-run) + any generic dialog close, best-effort.
    for (const loc of [
        page.getByRole('button', { name: 'Skip introduction' }),
        page.getByRole('button', { name: 'Close introduction' }),
        page.locator('[data-testid="talos-intro-modal"] [aria-label="Close introduction"]'),
    ]) {
        if (await loc.count() > 0 && await loc.first().isVisible().catch(() => false)) {
            await loc.first().click({ timeout: 3_000 }).catch(() => {})
            await sleep(300)
        }
    }
    await page.keyboard.press('Escape').catch(() => {})
}

/* --------------------------------------------------------------------------- */
/* Auth (mirrors the E2E ensureAuthenticated: session -> /setup -> /login)      */
/* --------------------------------------------------------------------------- */

async function authenticate(page) {
    await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' })
    if (await isAuthenticated(page)) return { method: 'existing-session', email: null }

    // First-run: /setup creates the first admin.
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

    // Existing install: /login.
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

    throw new Error(`Could not authenticate to ${BASE_URL}. Set TALOS_USER / TALOS_PASS to your :8088 admin credentials (see README-browse-debug.md).`)
}

async function openWorkspace(page) {
    await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' })
    await page.locator('#talos-workspace-root[data-authenticated="true"]').first().waitFor({ timeout: NAV_TIMEOUT })
    await page.getByLabel('Message TALOS').first().waitFor({ state: 'visible', timeout: NAV_TIMEOUT })
    const root = page.locator('#talos-workspace-root')
    report.devBrowserEvidence = (await root.getAttribute('data-dev-browser-evidence')) === 'true'
}

/* --------------------------------------------------------------------------- */
/* Main flow                                                                   */
/* --------------------------------------------------------------------------- */

async function main() {
    log(`TALOS browse-debug harness`)
    log(`  base    : ${BASE_URL}`)
    log(`  target  : ${TARGET_URL}`)
    log(`  headed  : ${HEADED}`)
    log(`  out dir : ${OUT_DIR}`)

    const browser = await chromium.launch({ headless: !HEADED })
    const context = await browser.newContext({
        ...(MOBILE ? devices['Pixel 7'] : devices['Desktop Chrome']),
        baseURL: BASE_URL,
        ignoreHTTPSErrors: true,
    })
    const page = await context.newPage()

    // ---- Wire up the real HTTP-response + console capture -------------------
    page.on('response', (response) => {
        const url = response.url()
        if (!/\/api\//.test(url)) return
        const entry = {
            ts: new Date().toISOString(),
            method: response.request().method(),
            path: shortPath(url),
            status: response.status(),
            contentType: response.headers()['content-type'] ?? '',
            body: undefined,
        }
        report.apiLog.push(entry)
        if (shouldCaptureBody(url)) {
            bodyReads.push(
                response.text()
                    .then((t) => { entry.body = t.length > 40_000 ? `${t.slice(0, 40_000)}…[truncated]` : t })
                    .catch(() => { entry.body = '[unreadable]' }),
            )
        }
    })
    page.on('console', (msg) => {
        if (msg.type() === 'error') report.consoleErrors.push(msg.text().slice(0, 500))
    })
    page.on('pageerror', (error) => report.pageErrors.push(errText(error).slice(0, 500)))

    try {
        /* -------- Step 1: authenticate -------- */
        await step(page, '1-auth', 'Authenticate to the live stack', async (rec) => {
            report.auth = await authenticate(page)
            await openWorkspace(page)
            authed = true
            rec.note = `method=${report.auth.method}${report.auth.email ? ` email=${report.auth.email}` : ''}; devEvidence=${report.devBrowserEvidence}`
            rec.screenshots.push(await shot(page, '1-workspace'))
        })

        /* -------- Step 2: open/prepare a chat -------- */
        await step(page, '2-chat', 'Open/create a chat session', async (rec) => {
            requireAuthed()
            await dismissOverlays(page)
            // A fresh, deterministic chat so Browse binds to a known session.
            const created = await apiFetch(page, 'POST', '/api/talos/sessions', {
                title: 'Browse Debug Harness',
                mode: 'verified_execution',
                persistence_mode: 'persistent',
                surface: 'chat',
            })
            rec.httpStatus = created.status
            const newId = created.json?.data?.id
            report.browserSession.talosSessionId = typeof newId === 'string' ? newId : null
            rec.note = `chat session id=${report.browserSession.talosSessionId ?? '(unknown — will bind to active chat)'}`
            // Reload so the UI activates a chat and the composer is ready.
            await openWorkspace(page)
            await dismissOverlays(page)
            rec.screenshots.push(await shot(page, '2-chat-ready'))
        })

        /* -------- Step 3: enable Browse -------- */
        await step(page, '3-browse', 'Enable Browse mode in the composer', async (rec) => {
            requireAuthed()
            const enableBtn = await firstVisible([
                page.getByRole('button', { name: 'Enable Browse' }),
                page.locator('button[aria-label="Enable Browse"]'),
                page.getByRole('button', { name: 'Browse', exact: true }),
            ], 8_000)
            if (!enableBtn) throw new Error('Could not find the "Enable Browse" composer control.')

            const createWait = page.waitForResponse(
                (r) => r.request().method() === 'POST' && shortPath(r.url()) === '/api/talos/browser/sessions',
                { timeout: API_WAIT_TIMEOUT },
            ).catch(() => null)
            await enableBtn.click()
            const createRes = await createWait
            if (createRes) {
                rec.httpStatus = createRes.status()
                const json = await createRes.json().catch(() => null)
                const data = json?.data ?? {}
                report.browserSession.id = typeof data.id === 'string' ? data.id : report.browserSession.id
                if (typeof data.talos_session_id === 'string') report.browserSession.talosSessionId = data.talos_session_id
                else {
                    const reqBody = createRes.request().postDataJSON?.() ?? {}
                    if (typeof reqBody.talos_session_id === 'string') report.browserSession.talosSessionId = reqBody.talos_session_id
                }
            }
            // Wait for Ready/Active state.
            const mode = page.getByTestId('talos-browse-mode')
            await mode.waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {})
            const status = await mode.getAttribute('aria-label').catch(() => null)
            rec.note = `browserSessionId=${report.browserSession.id ?? 'unknown'} talosSessionId=${report.browserSession.talosSessionId ?? 'unknown'} state="${status ?? '?'}"`
            // Surface a setup fault if Browse could not start.
            const fault = page.getByTestId('talos-browse-setup-fault')
            if (await fault.count() > 0 && await fault.isVisible().catch(() => false)) {
                rec.note += ` | SETUP FAULT: ${(await fault.innerText().catch(() => '')).slice(0, 300)}`
            }
            rec.screenshots.push(await shot(page, '3-browse-enabled'))
        })

        const sessionHeaders = () => (report.browserSession.talosSessionId
            ? { 'X-Talos-Session-Id': report.browserSession.talosSessionId }
            : {})

        /* -------- Step 4: send the target URL (chat) + deterministic navigate -------- */
        await step(page, '4-target', 'Send the target URL', async (rec) => {
            requireAuthed()
            // 4a) As a real user would: type the URL and Send (drives the agent).
            const box = page.getByLabel('Message TALOS').first()
            await box.fill(`Open and inspect ${TARGET_URL}`)
            const chatWait = page.waitForResponse(
                (r) => r.request().method() === 'POST' && shortPath(r.url()) === '/api/talos/chat',
                { timeout: 12_000 },
            ).catch(() => null)
            const sendBtn = await firstVisible([page.getByRole('button', { name: 'Send', exact: true })], 4_000)
            if (sendBtn) await sendBtn.click().catch(() => {})
            else await box.press('Enter').catch(() => {})
            const chatRes = await chatWait
            rec.note = chatRes ? `chat POST -> ${chatRes.status()}` : 'chat POST not observed (model may be unconfigured)'

            // 4b) Deterministic navigate so the visual steps have the real page
            //     even when no chat model is configured on this stack.
            if (report.browserSession.id) {
                const nav = await apiFetch(
                    page,
                    'POST',
                    `/api/talos/browser/sessions/${encodeURIComponent(report.browserSession.id)}/navigate`,
                    { url: TARGET_URL },
                    sessionHeaders(),
                )
                rec.httpStatus = nav.status
                rec.note += ` | direct navigate -> ${nav.status}`
                if (!nav.ok) rec.note += ` body=${nav.text.slice(0, 300)}`
            } else {
                rec.note += ' | no browserSession id — skipped direct navigate'
            }
            await sleep(1_500)
            rec.screenshots.push(await shot(page, '4-after-target'))
        })

        /* -------- Step 5: capture the browse SNAPSHOT + detect blank -------- */
        await step(page, '5-snapshot', 'Capture the browse snapshot (screenshot evidence) + detect blank', async (rec) => {
            requireAuthed()
            const shotBtn = await firstVisible([page.getByRole('button', { name: 'Capture browser screenshot' })], 8_000)
            if (!shotBtn) throw new Error('Could not find "Capture browser screenshot" control (Browse not ready?).')
            const shotWait = page.waitForResponse(
                (r) => r.request().method() === 'POST' && /\/api\/talos\/browser\/sessions\/[^/]+\/screenshot$/.test(shortPath(r.url())),
                { timeout: API_WAIT_TIMEOUT },
            ).catch(() => null)
            await shotBtn.click()
            const shotRes = await shotWait
            rec.httpStatus = shotRes ? shotRes.status() : null
            const shotJson = shotRes ? await shotRes.json().catch(() => null) : null
            if (shotRes && !shotRes.ok()) {
                rec.code = extractHmiError(shotJson).code
                rec.reason = extractHmiError(shotJson).reason
            }
            // Record the CURRENT frame identity (id + state_version + raw sha256)
            // so step 6's scroll verb can address the exact frame the user sees.
            const shotData = shotJson && typeof shotJson === 'object' ? shotJson.data : null
            if (shotData && typeof shotData === 'object') {
                currentFrame = {
                    artifactId: typeof shotData.id === 'string' ? shotData.id : currentFrame.artifactId,
                    stateVersion: Number.isInteger(shotData.state_version) ? shotData.state_version : currentFrame.stateVersion,
                    sha256: typeof shotData.sha256 === 'string' ? shotData.sha256 : currentFrame.sha256,
                }
            }

            // Open the evidence lightbox (this is the on-screen snapshot panel).
            const trigger = page.locator('[data-testid^="browser-evidence-open-"]').last()
            await trigger.waitFor({ state: 'visible', timeout: 15_000 })
            const triggerTestId = await trigger.getAttribute('data-testid')
            const artifactId = (triggerTestId ?? '').replace('browser-evidence-open-', '')
            await trigger.click()

            const stage = page.getByTestId('browser-evidence-stage')
            await stage.waitFor({ state: 'visible', timeout: 15_000 })
            rec.screenshots.push(await shot(page, '5-snapshot-panel', stage))

            // Save the raw preview PNG + analyze pixels for the blank/white case.
            const image = artifactId
                ? page.getByTestId(`browser-evidence-image-${artifactId}`)
                : stage.locator('img[data-browser-artifact-id]').last()
            await image.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {})
            const src = await image.getAttribute('src').catch(() => null)
            if (src) {
                const png = await page.context().request.get(new URL(src, BASE_URL).toString(), { headers: { Accept: 'image/png' } })
                if (png.ok()) {
                    try {
                        writeFileSync(join(OUT_DIR, `05-snapshot-artifact-${artifactId || 'frame'}.png`), await png.body())
                    } catch { /* ignore write error */ }
                }
            }
            if (!currentFrame.artifactId && artifactId) currentFrame.artifactId = artifactId
            const summary = await analyzeImage(image)
            report.keyFindings.snapshotPixelSummary = summary
            report.keyFindings.blankSnapshot = summary.blank
            rec.note = `artifact=${artifactId || '?'} natural=${summary.width}x${summary.height} blank=${summary.blank} (${summary.reason}) | frameIdentity{id=${currentFrame.artifactId ?? '?'} state_version=${currentFrame.stateVersion ?? '?'} sha256=${currentFrame.sha256 ? `${currentFrame.sha256.slice(0, 12)}…` : '?'}}`
        })

        /* -------- Step 6: SCROLL the snapshot via the backend scroll verb -------- */
        await step(page, '6-scroll', 'Scroll the snapshot (POST …/interactions/scroll)', async (rec) => {
            requireAuthed()
            const deltaY = 800
            rec.deltaY = deltaY
            const preShaRaw = stripSha(currentFrame.sha256)
            rec.preScreenshotSha256 = preShaRaw
            rec.postScreenshotSha256 = null
            rec.scrollWorks = null

            if (!report.browserSession.id || !currentFrame.artifactId || currentFrame.stateVersion == null || !currentFrame.sha256) {
                report.keyFindings.scrollWorks = null
                rec.note = `missing current-frame identity from step 5 (session=${report.browserSession.id ?? '?'} id=${currentFrame.artifactId ?? '?'} state_version=${currentFrame.stateVersion ?? '?'} sha256=${currentFrame.sha256 ? 'yes' : 'no'}) — cannot address the scroll verb`
                rec.screenshots.push(await shot(page, '6-scroll-no-identity'))
                return
            }

            // Address the CURRENT frame exactly as the pointer verb does.
            const body = {
                state_version: currentFrame.stateVersion,
                artifact_id: currentFrame.artifactId,
                artifact_sha256: prefixedSha(currentFrame.sha256),
                delta_y: deltaY,
            }
            const res = await apiFetch(
                page,
                'POST',
                `/api/talos/browser/sessions/${encodeURIComponent(report.browserSession.id)}/interactions/scroll`,
                body,
                sessionHeaders(),
            )
            rec.httpStatus = res.status
            const data = res.json && typeof res.json === 'object' ? res.json.data : null

            if (res.status === 200 && data && typeof data === 'object') {
                const post = data.screenshot && typeof data.screenshot === 'object' ? data.screenshot : {}
                const postShaRaw = stripSha(post.sha256)
                rec.postScreenshotSha256 = postShaRaw
                const scrollWorks = Boolean(preShaRaw && postShaRaw && preShaRaw !== postShaRaw)
                rec.scrollWorks = scrollWorks
                report.keyFindings.scrollWorks = scrollWorks

                // Save the post-scroll frame (decode the returned base64).
                const outPng = join(OUT_DIR, '06-6-after-scroll.png')
                let savedFrom = null
                if (typeof post.base64 === 'string' && post.base64.length > 0) {
                    try { writeFileSync(outPng, Buffer.from(post.base64, 'base64')); savedFrom = 'response.base64' } catch { /* ignore */ }
                }
                if (!savedFrom && typeof post.id === 'string') {
                    // Fallback: pull the preview for the new artifact id.
                    const preview = await page.context().request
                        .get(new URL(`/api/talos/browser/artifacts/${encodeURIComponent(post.id)}/preview`, BASE_URL).toString(), { headers: { Accept: 'image/png', ...sessionHeaders() } })
                        .catch(() => null)
                    if (preview && preview.ok()) {
                        try { writeFileSync(outPng, await preview.body()); savedFrom = 'artifact-preview' } catch { /* ignore */ }
                    }
                }
                if (savedFrom) rec.screenshots.push(outPng)

                // Advance the tracked frame so later steps address the new one.
                if (typeof post.id === 'string') currentFrame.artifactId = post.id
                if (Number.isInteger(post.state_version)) currentFrame.stateVersion = post.state_version
                if (typeof post.sha256 === 'string') currentFrame.sha256 = stripSha(post.sha256)

                const newState = Number.isInteger(post.state_version) ? post.state_version : (data.session?.state_version ?? '?')
                rec.note = `scroll delta_y=${deltaY} -> 200; scrollWorks=${scrollWorks} (preSha=${(preShaRaw ?? '').slice(0, 12)}… postSha=${(postShaRaw ?? '').slice(0, 12)}…) new_state_version=${newState}; saved=${savedFrom ?? 'none'}`
            } else {
                // 4xx/5xx (or malformed): keep the evidence, don't throw.
                const { code, reason } = extractHmiError(res.json)
                rec.code = code
                rec.reason = reason
                report.keyFindings.scrollWorks = false
                rec.scrollWorks = false
                rec.note = `scroll delta_y=${deltaY} -> ${res.status} code=${code ?? '-'} reason=${reason ?? '-'} body=${(res.text ?? '').slice(0, 300)}`
                rec.screenshots.push(await shot(page, '6-scroll-error'))
            }
        })

        /* -------- Step 7: CLICK an element inside the snapshot -------- */
        await step(page, '7-click', 'Click an element inside the snapshot (pointer HMI)', async (rec) => {
            requireAuthed()
            const stage = page.getByTestId('browser-evidence-stage')
            const bb = await stage.boundingBox()
            if (!bb) throw new Error('Snapshot stage has no painted surface to click.')

            const pointerWait = page.waitForResponse(
                (r) => r.request().method() === 'POST' && /\/interactions\/pointer$/.test(shortPath(r.url())),
                { timeout: API_WAIT_TIMEOUT },
            ).catch(() => null)

            await stage.click({ position: { x: bb.width * CLICK_X, y: bb.height * CLICK_Y } })
            let res = await pointerWait
            let status = res ? res.status() : null
            let json = res ? await res.json().catch(() => null) : null
            let { code, reason } = extractHmiError(json)

            // 428 -> a confirmation gate opened; confirm and capture the follow-up
            // (this is where a recovery lock frequently actually fires).
            if (status === 428) {
                rec.note = 'confirmation required (428) — confirming to reach the real execution result'
                const confirmBtn = await firstVisible([page.getByTestId('browser-hmi-confirm')], 4_000)
                if (confirmBtn) {
                    const confirmWait = page.waitForResponse(
                        (r) => r.request().method() === 'POST' && /\/interactions\/[^/]+\/confirm$/.test(shortPath(r.url())),
                        { timeout: API_WAIT_TIMEOUT },
                    ).catch(() => null)
                    await confirmBtn.click()
                    const cRes = await confirmWait
                    if (cRes) {
                        status = cRes.status()
                        json = await cRes.json().catch(() => null)
                        ;({ code, reason } = extractHmiError(json))
                    }
                }
            }

            rec.httpStatus = status
            rec.code = code
            rec.reason = reason
            report.keyFindings.clickFinalStatus = status

            if (status === 409 && code === 'TALOS_BROWSER_HMI_RECOVERY_REQUIRED') {
                report.keyFindings.recoveryHttpStatus = status
                report.keyFindings.recoveryCode = code
                report.keyFindings.recoveryReason = reason
                rec.note = `RECOVERY LOCK FIRED — reason=${reason}`
                log(`\n  *** KEY OUTPUT: recovery lock reason = ${reason} ***`)
            } else if (status === 201) {
                rec.note = 'pointer executed (201) — no recovery lock on this click'
            } else {
                rec.note = `pointer -> ${status} code=${code ?? '-'} reason=${reason ?? '-'}`
            }

            // Any inline interaction error shown to the user (toast/alert).
            const inlineErr = page.locator('[role="alert"]')
            if (await inlineErr.count() > 0) {
                rec.note += ` | UI: ${(await inlineErr.first().innerText().catch(() => '')).slice(0, 200)}`
            }
            rec.screenshots.push(await shot(page, '7-after-click'))
        })

        /* -------- Step 8: retry after the lock -------- */
        await step(page, '8-retry', 'Retry after the lock (is it stuck?)', async (rec) => {
            requireAuthed()
            const stage = page.getByTestId('browser-evidence-stage')
            const bb = await stage.boundingBox().catch(() => null)
            let secondStatus = null
            let secondCode = null
            let secondReason = null
            if (bb) {
                const w = page.waitForResponse(
                    (r) => r.request().method() === 'POST' && /\/interactions\/pointer$/.test(shortPath(r.url())),
                    { timeout: 8_000 },
                ).catch(() => null)
                await stage.click({ position: { x: bb.width * CLICK_X, y: bb.height * (CLICK_Y + 0.05) } }).catch(() => {})
                const r2 = await w
                if (r2) {
                    secondStatus = r2.status()
                    const j2 = await r2.json().catch(() => null)
                    ;({ code: secondCode, reason: secondReason } = extractHmiError(j2))
                }
            }
            // Re-capture a screenshot: after recovery_required this is expected to fail.
            const shotBtn = await firstVisible([page.getByRole('button', { name: 'Capture browser screenshot' })], 3_000)
            let recaptureStatus = null
            let recaptureDisabled = null
            if (shotBtn) {
                recaptureDisabled = await shotBtn.isDisabled().catch(() => null)
                if (!recaptureDisabled) {
                    const sw = page.waitForResponse(
                        (r) => r.request().method() === 'POST' && /\/screenshot$/.test(shortPath(r.url())),
                        { timeout: 8_000 },
                    ).catch(() => null)
                    await shotBtn.click().catch(() => {})
                    const sr = await sw
                    recaptureStatus = sr ? sr.status() : null
                }
            }
            const modeLabel = await page.getByTestId('talos-browse-mode').getAttribute('aria-label').catch(() => null)
            const stuck = report.keyFindings.recoveryReason != null
                && (secondStatus === null || secondStatus === 409 || recaptureStatus === 409 || recaptureDisabled === true)
            report.keyFindings.retryStuck = report.keyFindings.recoveryReason != null ? stuck : null
            rec.httpStatus = secondStatus
            rec.code = secondCode
            rec.reason = secondReason
            rec.note = `re-click -> ${secondStatus ?? 'no-dispatch'}; re-screenshot -> ${recaptureDisabled ? 'button disabled' : recaptureStatus}; mode="${modeLabel}"; stuck=${report.keyFindings.retryStuck} (fresh session via "Retry browser" needed if stuck)`
            rec.screenshots.push(await shot(page, '8-retry-state'))
            // Close the lightbox so composer controls are reachable for step 9.
            await page.keyboard.press('Escape').catch(() => {})
            await sleep(300)
        })

        /* -------- Step 9: file upload from the composer -------- */
        await step(page, '9-upload', 'Attach a file from the composer', async (rec) => {
            requireAuthed()
            await dismissOverlays(page)
            const uploadPath = join(OUT_DIR, 'upload-fixture.txt')
            writeFileSync(uploadPath, `TALOS browse-debug upload fixture ${new Date().toISOString()}\n`)

            const ingestWait = page.waitForResponse(
                (r) => r.request().method() === 'POST' && shortPath(r.url()) === '/api/files/ingest',
                { timeout: API_WAIT_TIMEOUT },
            ).catch(() => null)

            // Prefer setting the hidden file input directly (robust across menu states).
            const input = page.locator('[data-testid="talos-attachment-input"], input[aria-label="Attachment file input"]').first()
            if (await input.count() > 0) {
                await input.setInputFiles(uploadPath)
            } else {
                const attachBtn = await firstVisible([
                    page.getByRole('button', { name: 'Attach a file' }),
                    page.locator('[data-testid="talos-attachment-button"]'),
                ], 5_000)
                if (!attachBtn) throw new Error('Could not find the "Attach a file" control.')
                await attachBtn.click()
                const upload = await firstVisible([page.getByRole('menuitem', { name: 'Upload a file' })], 3_000)
                const chooserPromise = page.waitForEvent('filechooser', { timeout: 5_000 }).catch(() => null)
                if (upload) await upload.click()
                const chooser = await chooserPromise
                if (chooser) await chooser.setFiles(uploadPath)
            }

            const ingestRes = await ingestWait
            rec.httpStatus = ingestRes ? ingestRes.status() : null
            let uploadOk = false
            if (ingestRes) {
                uploadOk = ingestRes.ok()
                if (!uploadOk) {
                    const j = await ingestRes.json().catch(() => null)
                    rec.code = j?.code ?? null
                    rec.note = `ingest failed: ${JSON.stringify(j).slice(0, 300)}`
                }
            } else {
                rec.note = 'no /api/files/ingest response observed'
            }
            // Confirm a chip landed in the tray as user-visible proof.
            const chip = page.locator('[data-testid="talos-attachment-chip"]')
            const chipCount = await chip.count().catch(() => 0)
            report.keyFindings.uploadWorks = uploadOk && chipCount > 0 ? true : (ingestRes ? uploadOk : false)
            rec.note = (rec.note ? rec.note + ' | ' : '') + `ingest=${rec.httpStatus} chips=${chipCount} uploadWorks=${report.keyFindings.uploadWorks}`
            rec.screenshots.push(await shot(page, '9-upload'))
        })
    } catch (fatal) {
        report.pageErrors.push(`FATAL: ${errText(fatal)}`)
        log(`\nFATAL: ${errText(fatal)}`)
    } finally {
        await Promise.allSettled(bodyReads)
        report.finishedAt = new Date().toISOString()
        try {
            await page.screenshot({ path: join(OUT_DIR, 'zz-final.png') }).catch(() => {})
        } catch { /* ignore */ }
        writeFileSync(join(OUT_DIR, 'report.json'), JSON.stringify(report, null, 2))
        writeFileSync(join(OUT_DIR, 'api-log.json'), JSON.stringify(report.apiLog, null, 2))
        await context.close().catch(() => {})
        await browser.close().catch(() => {})
        printSummary()
    }
}

/* --------------------------------------------------------------------------- */
/* Image analysis (in-browser canvas sampling — no extra deps)                 */
/* --------------------------------------------------------------------------- */

async function analyzeImage(image) {
    try {
        return await image.evaluate((el) => {
            const img = /** @type {HTMLImageElement} */ (el)
            const width = img.naturalWidth
            const height = img.naturalHeight
            if (!width || !height) return { width, height, blank: true, reason: 'no decoded pixels', mean: null, variance: null }
            const canvas = document.createElement('canvas')
            canvas.width = Math.min(width, 200)
            canvas.height = Math.min(height, 200)
            const ctx = canvas.getContext('2d')
            if (!ctx) return { width, height, blank: null, reason: 'no 2d context', mean: null, variance: null }
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
            let data
            try {
                data = ctx.getImageData(0, 0, canvas.width, canvas.height).data
            } catch (e) {
                return { width, height, blank: null, reason: `tainted canvas: ${String(e).slice(0, 80)}`, mean: null, variance: null }
            }
            let sum = 0
            let sumSq = 0
            let n = 0
            let nonWhite = 0
            for (let i = 0; i < data.length; i += 4) {
                const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
                sum += lum
                sumSq += lum * lum
                n += 1
                if (lum < 250) nonWhite += 1
            }
            const mean = sum / n
            const variance = sumSq / n - mean * mean
            const nonWhiteRatio = nonWhite / n
            const blank = variance < 4 || nonWhiteRatio < 0.005
            const reason = blank
                ? (mean > 250 ? 'near-white / empty frame' : 'uniform / no visible content')
                : 'content present'
            return { width, height, blank, reason, mean: Math.round(mean * 10) / 10, variance: Math.round(variance * 10) / 10, nonWhiteRatio: Math.round(nonWhiteRatio * 1000) / 1000 }
        })
    } catch (error) {
        return { width: 0, height: 0, blank: null, reason: `analyze failed: ${errText(error)}`, mean: null, variance: null }
    }
}

/* --------------------------------------------------------------------------- */
/* Summary                                                                     */
/* --------------------------------------------------------------------------- */

function printSummary() {
    log(`\n================= BROWSE-DEBUG SUMMARY =================`)
    log(`Report      : ${join(OUT_DIR, 'report.json')}`)
    log(`Screenshots : ${OUT_DIR}`)
    log(`Auth        : ${report.auth ? report.auth.method : 'FAILED'}`)
    log(`Browser sess: ${report.browserSession.id ?? '-'} (talos ${report.browserSession.talosSessionId ?? '-'})`)
    for (const s of report.steps) {
        const flag = s.ok ? 'OK  ' : 'FAIL'
        log(`  [${flag}] ${s.id.padEnd(11)} ${s.reason ? `reason=${s.reason} ` : ''}${s.httpStatus ? `http=${s.httpStatus} ` : ''}${s.error ? `err=${s.error}` : ''}`)
    }
    const k = report.keyFindings
    log(`\nKEY FINDINGS`)
    log(`  recovery reason  : ${k.recoveryReason ?? '(no recovery lock fired on the click)'}`)
    log(`  click final http : ${k.clickFinalStatus ?? '-'}`)
    log(`  blank snapshot   : ${k.blankSnapshot}`)
    log(`  scroll works     : ${k.scrollWorks}`)
    log(`  retry stuck      : ${k.retryStuck}`)
    log(`  upload works     : ${k.uploadWorks}`)
    log(`=======================================================\n`)
}

main().catch((error) => {
    log(`Harness crashed before it could clean up: ${errText(error)}`)
    try { writeFileSync(join(OUT_DIR, 'report.json'), JSON.stringify(report, null, 2)) } catch { /* ignore */ }
    process.exit(1)
})
