import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
    missingDesktopFeatureIds,
    validateParityLedger,
    verifyParityLedgerFile,
} from './verify-parity-ledger.mjs'
import {
    TalosContractError,
    parseMobileFeatureParityContract,
} from '../packages/contracts/src/index.ts'

function validEntry(overrides = {}) {
    return {
        feature_id: 'chat',
        desktop_contract: 'POST /api/talos/chat persists multi-turn sessions and messages',
        desktop_owner: 'control_plane',
        mobile_owner: 'mobile_core',
        mobile_surface: 'ChatScreen (M4)',
        execution_location: ['local_mobile', 'remote_provider'],
        required_capabilities: ['model.profile.selected'],
        evidence_contract: 'M4 gate: conversation survives process death offline',
        status: 'planned',
        blocking_reason: null,
        test_ids: ['mobile/tests/e2e/mobile-chat-files.e2e.spec.ts'],
        desktop_revision: 'ebf7ec3',
        ...overrides,
    }
}

function validLedger(overrides = {}) {
    return {
        schema_version: 1,
        contract: 'talos.mobile.feature-parity/v1',
        payload: {
            desktop_revision: 'ebf7ec3',
            generated_at: '2026-07-18',
            generated_by: 'parity verifier conformance test',
            expected_desktop_feature_ids: ['chat'],
            features: [validEntry()],
            ...overrides,
        },
    }
}

function assertBothReject(value, messageFragment) {
    const javascript = validateParityLedger(value)
    assert.equal(javascript.ok, false, 'JavaScript governance verifier must reject the value')
    if (messageFragment) {
        assert.ok(javascript.errors.some((error) => error.includes(messageFragment)))
    }
    assert.throws(
        () => parseMobileFeatureParityContract(value),
        (error) => error instanceof TalosContractError,
        'TypeScript canonical parser must reject the same value',
    )
}

describe('verify-parity-ledger', () => {
    it('fails when a known desktop feature is absent', () => {
        const missing = missingDesktopFeatureIds(['chat', 'files_ingestion', 'browser_p0'], [validEntry()])
        assert.deepEqual(missing, ['files_ingestion', 'browser_p0'])

        const result = validateParityLedger(validLedger({
            expected_desktop_feature_ids: ['chat', 'files_ingestion'],
        }))
        assert.equal(result.ok, false)
        assert.ok(result.errors.some((error) => error.includes('files_ingestion')))
    })

    it('fails when verified lacks a real test id and evidence contract', () => {
        const result = validateParityLedger(validLedger({
            features: [validEntry({ status: 'verified', test_ids: [], evidence_contract: '' })],
        }))
        assert.equal(result.ok, false)
        assert.ok(result.errors.some((error) => error.includes('verified') && error.includes('test_ids')))
        assert.ok(result.errors.some((error) => error.includes('evidence_contract')))
    })

    it('fails duplicate feature ids and free-form owners', () => {
        const duplicates = validateParityLedger(validLedger({
            expected_desktop_feature_ids: ['chat'],
            features: [validEntry(), validEntry()],
        }))
        assert.equal(duplicates.ok, false)
        assert.ok(duplicates.errors.some((error) => error.includes('duplicate') && error.includes('chat')))

        const freeForm = validateParityLedger(validLedger({
            features: [validEntry({ desktop_owner: 'backend_team', mobile_owner: 'someone' })],
        }))
        assert.equal(freeForm.ok, false)
        assert.ok(freeForm.errors.some((error) => error.includes('desktop_owner')))
        assert.ok(freeForm.errors.some((error) => error.includes('mobile_owner')))
    })

    it('rejects unknown parity envelope and payload fields in both validators', () => {
        assertBothReject({ ...validLedger(), unexpected: true }, 'unknown field')
        assertBothReject(validLedger({ unexpected: true }), 'unknown field')
    })

    it('rejects a mismatched contract discriminator in both validators', () => {
        assertBothReject({ ...validLedger(), contract: 'wrong.contract/v999' }, 'contract')
    })

    it('rejects entry revisions that differ from the snapshot revision in both validators', () => {
        assertBothReject(validLedger({
            features: [validEntry({ desktop_revision: 'different-revision' })],
        }), 'desktop_revision')
    })

    it('keeps TypeScript and JavaScript parity validation decisions identical', () => {
        const valid = validLedger()
        assert.equal(validateParityLedger(valid).ok, true)
        assert.deepEqual(parseMobileFeatureParityContract(valid), valid)

        const invalidValues = [
            validLedger({ expected_desktop_feature_ids: ['chat', 'chat'] }),
            validLedger({ expected_desktop_feature_ids: ['chat', 'files_ingestion'] }),
            validLedger({ features: [validEntry({ blocking_reason: 'stale blocker' })] }),
        ]
        for (const value of invalidValues) {
            assertBothReject(value)
        }
    })

    it('rejects impossible dates and control characters identically in both validators', () => {
        for (const generated_at of ['2026-13-45', '2026-02-30', '0000-01-01']) {
            assertBothReject(validLedger({ generated_at }), 'generated_at')
        }
        assertBothReject(validLedger({ features: [validEntry({ mobile_surface: 'Chat\u0000Screen' })] }))
        assertBothReject(validLedger({ features: [validEntry({ desktop_contract: 'line1\nline2' })] }))

        // Real calendar dates and accented human text remain accepted by both validators.
        const accented = validLedger({ features: [validEntry({ mobile_surface: 'sovranità è qui' })] })
        assert.equal(validateParityLedger(accented).ok, true)
        assert.deepEqual(parseMobileFeatureParityContract(accented), accented)

        const leapDay = validLedger({ generated_at: '2024-02-29' })
        assert.equal(validateParityLedger(leapDay).ok, true)
        assert.deepEqual(parseMobileFeatureParityContract(leapDay), leapDay)
    })

    it('verifyParityLedgerFile reads and validates a ledger from disk', () => {
        const directory = mkdtempSync(join(tmpdir(), 'talos-parity-'))
        const file = join(directory, 'feature-parity.json')
        try {
            writeFileSync(file, JSON.stringify(validLedger(), null, 2))
            const ok = verifyParityLedgerFile(file)
            assert.equal(ok.ok, true)
            assert.deepEqual(ok.errors, [])

            writeFileSync(file, '{ not json')
            const broken = verifyParityLedgerFile(file)
            assert.equal(broken.ok, false)
            assert.ok(broken.errors.length > 0)
        } finally {
            rmSync(directory, { recursive: true, force: true })
        }
    })
})
