import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
    TALOS_MOBILE_FEATURE_PARITY_CONTRACT,
    TalosContractError,
    parseMobileFeatureParityEntry,
    parseMobileFeatureParityContract,
    parseMobileFeatureParityLedger,
    parseTalosVersionedContract,
} from '../src/index.ts'

function validEntry() {
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
    }
}

function validContract() {
    return {
        schema_version: 1,
        contract: 'talos.mobile.feature-parity/v1',
        payload: {
            desktop_revision: 'ebf7ec3',
            generated_at: '2026-07-18',
            generated_by: 'contracts conformance test',
            expected_desktop_feature_ids: ['chat'],
            features: [validEntry()],
        },
    }
}

describe('talos mobile contracts conformance', () => {
    it('rejects unknown schema versions and non-list feature entries', () => {
        assert.throws(
            () => parseTalosVersionedContract(
                { schema_version: 99, contract: TALOS_MOBILE_FEATURE_PARITY_CONTRACT, payload: {} },
                TALOS_MOBILE_FEATURE_PARITY_CONTRACT,
                (payload) => payload,
            ),
            (error) => error instanceof TalosContractError && error.code === 'unknown_schema_version',
        )
        assert.throws(
            () => parseTalosVersionedContract(
                { schema_version: 1, contract: TALOS_MOBILE_FEATURE_PARITY_CONTRACT, payload: {}, unexpected: true },
                TALOS_MOBILE_FEATURE_PARITY_CONTRACT,
                (payload) => payload,
            ),
            (error) => error instanceof TalosContractError && error.code === 'unknown_field',
        )
        assert.throws(
            () => parseMobileFeatureParityLedger({ features: 'chat' }),
            (error) => error instanceof TalosContractError && error.code === 'invalid_shape',
        )
        assert.throws(
            () => parseMobileFeatureParityLedger('chat'),
            (error) => error instanceof TalosContractError && error.code === 'invalid_shape',
        )
        assert.throws(
            () => parseMobileFeatureParityEntry({ ...validEntry(), desktop_owner: 'backend_team' }),
            (error) => error instanceof TalosContractError && error.code === 'invalid_owner',
        )
        assert.throws(
            () => parseMobileFeatureParityEntry({ ...validEntry(), unknown_key: 1 }),
            (error) => error instanceof TalosContractError && error.code === 'unknown_field',
        )
    })

    it('rejects a mismatched contract discriminator before parsing payload', () => {
        let payloadParserCalled = false
        assert.throws(
            () => parseTalosVersionedContract(
                { schema_version: 1, contract: 'wrong.contract/v999', payload: {} },
                TALOS_MOBILE_FEATURE_PARITY_CONTRACT,
                (payload) => {
                    payloadParserCalled = true
                    return payload
                },
            ),
            (error) => error instanceof TalosContractError && error.code === 'invalid_contract',
        )
        assert.equal(payloadParserCalled, false)
    })

    it('rejects unknown parity envelope and payload fields', () => {
        assert.throws(
            () => parseMobileFeatureParityContract({ ...validContract(), unexpected: true }),
            (error) => error instanceof TalosContractError && error.code === 'unknown_field',
        )
        assert.throws(
            () => parseMobileFeatureParityContract({
                ...validContract(),
                payload: { ...validContract().payload, unexpected: true },
            }),
            (error) => error instanceof TalosContractError && error.code === 'unknown_field',
        )
    })

    it('rejects entry revisions that differ from the snapshot revision', () => {
        const contract = validContract()
        contract.payload.features[0] = { ...contract.payload.features[0], desktop_revision: 'different-revision' }

        assert.throws(
            () => parseMobileFeatureParityContract(contract),
            (error) => error instanceof TalosContractError
                && error.code === 'invalid_state'
                && error.message.includes('desktop_revision'),
        )
    })

    it('round-trips valid canonical contracts without losing object/list shape', () => {
        const canonical = {
            schema_version: 1,
            contract: 'talos.mobile.feature-parity/v1',
            payload: {
                desktop_revision: 'ebf7ec3',
                expected_desktop_feature_ids: ['chat', 'files_ingestion'],
                features: [validEntry()],
                nested: { empty_object: {}, empty_list: [], list_of_lists: [[1, 2]] },
            },
        }

        const parsed = parseTalosVersionedContract(
            canonical,
            TALOS_MOBILE_FEATURE_PARITY_CONTRACT,
            (payload) => payload,
        )
        const roundTripped = JSON.parse(JSON.stringify(parsed))

        assert.deepEqual(roundTripped, canonical)
        assert.equal(Array.isArray(roundTripped.payload.features), true)
        assert.equal(Array.isArray(roundTripped.payload.nested.empty_object), false)
        assert.equal(Array.isArray(roundTripped.payload.nested.empty_list), true)

        const entries = parseMobileFeatureParityLedger(canonical.payload.features)
        assert.equal(entries.length, 1)
        assert.deepEqual(entries[0], validEntry())
    })

    it('parses the complete canonical parity contract', () => {
        assert.deepEqual(parseMobileFeatureParityContract(validContract()), validContract())
    })

    it('rejects impossible calendar dates and control characters, keeping real human text', () => {
        for (const generated_at of ['2026-13-45', '2026-02-30', '2026-00-10', '2026-04-31', '0000-01-01']) {
            assert.throws(
                () => parseMobileFeatureParityContract({
                    ...validContract(),
                    payload: { ...validContract().payload, generated_at },
                }),
                (error) => error instanceof TalosContractError
                    && error.code === 'invalid_shape'
                    && error.message.includes('generated_at'),
                `impossible date ${generated_at} must fail closed`,
            )
        }
        // Real calendar dates, including a leap day, stay accepted verbatim.
        for (const generated_at of ['2026-07-18', '2024-02-29', '2026-12-31']) {
            const contract = { ...validContract(), payload: { ...validContract().payload, generated_at } }
            assert.deepEqual(parseMobileFeatureParityContract(contract), contract)
        }
        // Control characters in any bounded string fail closed in both parsers.
        for (const control of ['\u0000', '\u001b', '\n', '\u007f', '\u009f']) {
            assert.throws(
                () => parseMobileFeatureParityEntry({ ...validEntry(), mobile_surface: `Chat${control}Screen` }),
                (error) => error instanceof TalosContractError && error.code === 'invalid_shape',
                `control char ${JSON.stringify(control)} must fail closed`,
            )
            assert.throws(
                () => parseMobileFeatureParityEntry({ ...validEntry(), test_ids: [`mobile/tests/x${control}.ts`] }),
                (error) => error instanceof TalosContractError && error.code === 'invalid_shape',
            )
        }
        // Non-ASCII human text (accents, symbols) is legitimate parity prose and stays accepted.
        const accented = parseMobileFeatureParityEntry({ ...validEntry(), mobile_surface: 'sovranità è qui ✓' })
        assert.equal(accented.mobile_surface, 'sovranità è qui ✓')
    })
})
