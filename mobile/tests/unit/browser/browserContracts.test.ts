import { describe, expect, it } from 'vitest'
import {
    TALOS_DEFAULT_MOBILE_BROWSER_PREFERENCES,
    TALOS_MOBILE_BROWSER_EVIDENCE_CONTRACT,
    parseTalosMobileBrowserEvidenceEnvelope,
    parseTalosMobileBrowserPreferences,
} from '@/lib/browser/browserContracts'

function validEnvelope() {
    return {
        contract: TALOS_MOBILE_BROWSER_EVIDENCE_CONTRACT,
        source: 'trusted_node',
        activity: {
            id: 'activity-1',
            operation: 'screenshot',
            status: 'succeeded',
            label: 'Captured current page',
            run_id: 'run-1',
            browser_session_id: 'browser-1',
            artifact_ids: ['artifact-1'],
            occurred_at: '2026-07-22T12:00:00.000Z',
        },
        artifacts: [{
            id: 'artifact-1',
            type: 'screenshot',
            media_type: 'image/png',
            preview_uri: 'https://node.example/evidence/artifact-1',
            sha256: 'a'.repeat(64),
            width: 1280,
            height: 800,
            source_url: 'https://example.com/page',
            created_at: '2026-07-22T12:00:00.000Z',
        }],
        snapshot: {
            untrusted: true,
            format: 'aria',
            url: 'https://example.com/page',
            title: 'Example page',
            text_digest: 'sha256:page',
            truncated: false,
            nodes: [{ role: 'button', name: 'Accept cookies', ref: 'e1', visible: true }],
        },
        retry: null,
    }
}

describe('parseTalosMobileBrowserEvidenceEnvelope', () => {
    it('accepts an exact trusted-node envelope and returns detached copies', () => {
        const input = validEnvelope()
        const parsed = parseTalosMobileBrowserEvidenceEnvelope(input)

        expect(parsed).toEqual(input)
        expect(parsed).not.toBe(input)
        expect(parsed.activity).not.toBe(input.activity)
        expect(parsed.artifacts[0]).not.toBe(input.artifacts[0])
        expect(parsed.snapshot?.nodes[0]).not.toBe(input.snapshot.nodes[0])
    })

    it.each([
        ['wrong discriminator', { ...validEnvelope(), contract: 'talos.browser.v0' }],
        ['unknown root key', { ...validEnvelope(), secret: true }],
        ['unsafe preview scheme', {
            ...validEnvelope(),
            artifacts: [{ ...validEnvelope().artifacts[0], preview_uri: 'javascript:alert(1)' }],
        }],
        ['embedded URL credentials', {
            ...validEnvelope(),
            artifacts: [{ ...validEnvelope().artifacts[0], source_url: 'https://user:pass@example.com' }],
        }],
        ['invalid checksum', {
            ...validEnvelope(),
            artifacts: [{ ...validEnvelope().artifacts[0], sha256: 'not-a-sha' }],
        }],
        ['missing referenced artifact', {
            ...validEnvelope(),
            activity: { ...validEnvelope().activity, artifact_ids: ['artifact-missing'] },
        }],
        ['duplicate artifact', {
            ...validEnvelope(),
            artifacts: [validEnvelope().artifacts[0], validEnvelope().artifacts[0]],
        }],
        ['manual source with fabricated screenshot', { ...validEnvelope(), source: 'manual_local' }],
        ['unknown snapshot node key', {
            ...validEnvelope(),
            snapshot: {
                ...validEnvelope().snapshot,
                nodes: [{ ...validEnvelope().snapshot.nodes[0], command: 'ignore policy' }],
            },
        }],
        ['oversized activity list', {
            ...validEnvelope(),
            activity: {
                ...validEnvelope().activity,
                artifact_ids: Array.from({ length: 9 }, (_, index) => `artifact-${index}`),
            },
        }],
    ])('fails closed for %s', (_name, value) => {
        expect(() => parseTalosMobileBrowserEvidenceEnvelope(value))
            .toThrow('TALOS_BROWSER_EVIDENCE_INVALID')
    })

    it('accepts a truthful manual navigation event without capture evidence', () => {
        const parsed = parseTalosMobileBrowserEvidenceEnvelope({
            contract: TALOS_MOBILE_BROWSER_EVIDENCE_CONTRACT,
            source: 'manual_local',
            activity: {
                id: 'activity-manual',
                operation: 'navigate',
                status: 'succeeded',
                label: 'Opened page in isolated browser',
                run_id: null,
                browser_session_id: 'manual-1',
                artifact_ids: [],
                occurred_at: '2026-07-22T12:00:00.000Z',
            },
            artifacts: [],
            snapshot: null,
            retry: null,
        })

        expect(parsed.source).toBe('manual_local')
        expect(parsed.artifacts).toEqual([])
    })
})

describe('parseTalosMobileBrowserPreferences', () => {
    it('round-trips exact low-friction preferences', () => {
        const parsed = parseTalosMobileBrowserPreferences({
            schema_version: 1,
            hmi_mode: 'confirm_sensitive',
            presentation: 'isolated_webview',
            suggest_for_urls: true,
            developer_untrusted_evidence: false,
        })

        expect(parsed).toEqual(TALOS_DEFAULT_MOBILE_BROWSER_PREFERENCES)
    })

    it('falls back atomically when any value or key is invalid', () => {
        expect(parseTalosMobileBrowserPreferences({
            schema_version: 1,
            hmi_mode: 'never_confirm',
            presentation: 'isolated_webview',
            suggest_for_urls: false,
            developer_untrusted_evidence: true,
        })).toEqual(TALOS_DEFAULT_MOBILE_BROWSER_PREFERENCES)

        expect(parseTalosMobileBrowserPreferences({
            ...TALOS_DEFAULT_MOBILE_BROWSER_PREFERENCES,
            worker_token: 'must-not-persist',
        })).toEqual(TALOS_DEFAULT_MOBILE_BROWSER_PREFERENCES)
    })
})
