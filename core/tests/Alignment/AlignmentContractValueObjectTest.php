<?php

declare(strict_types=1);

use Kadmos\Alignment\Contract\AlignmentContractException;
use Kadmos\Alignment\Contract\CapabilityPolicySetV1;
use Kadmos\Alignment\Contract\FileAuthorityGrantV1;
use Kadmos\Alignment\Contract\LibraryItemV1;
use Kadmos\Alignment\Contract\ModelCatalogEntryV1;
use Kadmos\Alignment\Contract\ModelTransferV1;
use Kadmos\Alignment\Contract\ToolDefinitionV1;
require_once __DIR__.'/../../vendor/autoload.php';

function assertAlignmentValue(bool $condition, string $message): void
{
    if (! $condition) {
        throw new RuntimeException($message);
    }
}

/** @return array<string, mixed> */
function alignmentValueFixture(string $name): array
{
    $contents = file_get_contents(__DIR__.'/../Fixtures/alignment/v1/valid/'.$name.'.json');
    if (! is_string($contents)) {
        throw new RuntimeException("Unable to read Alignment fixture {$name}.");
    }

    return json_decode($contents, true, 128, JSON_THROW_ON_ERROR);
}

function assertAlignmentValueRejects(callable $callback, string $expectedCode): void
{
    try {
        $callback();
    } catch (AlignmentContractException $exception) {
        assertAlignmentValue(
            $exception->errorCode === $expectedCode,
            "Expected {$expectedCode}, received {$exception->errorCode}.",
        );

        return;
    }

    throw new RuntimeException("Expected Alignment failure {$expectedCode}.");
}

function testServerOwnedArraysRoundTripThroughEveryValueObject(): void
{
    $contracts = [
        'tool-definition' => ToolDefinitionV1::class,
        'capability-policy-set' => CapabilityPolicySetV1::class,
        'model-catalog-entry' => ModelCatalogEntryV1::class,
        'model-transfer' => ModelTransferV1::class,
        'file-authority-grant' => FileAuthorityGrantV1::class,
        'library-item' => LibraryItemV1::class,
    ];

    foreach ($contracts as $name => $class) {
        assertAlignmentValue(class_exists($class), "{$class} must exist.");
        $fixture = alignmentValueFixture($name);
        $value = $class::fromArray($fixture);
        assertAlignmentValue($value->toArray() === $fixture, "{$name} fromArray must preserve canonical data.");
        assertAlignmentValue(json_decode($value->toJson()) instanceof \stdClass, "{$name} JSON root must be an object.");
    }
}

function testToolDefinitionCrossFieldRulesFailClosed(): void
{
    $value = alignmentValueFixture('tool-definition');
    $value['risk'] = 'high';
    assertAlignmentValueRejects(fn () => ToolDefinitionV1::fromArray($value), 'tool_approval_required');

    $value = alignmentValueFixture('tool-definition');
    $value['effects']['mutates_state'] = true;
    assertAlignmentValueRejects(fn () => ToolDefinitionV1::fromArray($value), 'tool_parallel_mutation');

    $value = alignmentValueFixture('tool-definition');
    $value['lifecycle']['kind'] = 'managed_registry';
    assertAlignmentValueRejects(fn () => ToolDefinitionV1::fromArray($value), 'tool_location_unsupported');

    $value = alignmentValueFixture('tool-definition');
    $value['execution']['implementation_key'] = 'https://example.invalid/tool.php';
    assertAlignmentValueRejects(fn () => ToolDefinitionV1::fromArray($value), 'tool_implementation_key_unsafe');
}

function testCapabilityPolicyCrossFieldRulesFailClosed(): void
{
    $value = alignmentValueFixture('capability-policy-set');
    $value['policies'][0]['decision'] = 'deny';
    assertAlignmentValueRejects(fn () => CapabilityPolicySetV1::fromArray($value), 'policy_deny_grant_conflict');

    $value = alignmentValueFixture('capability-policy-set');
    $value['grants'][0]['scope_id'] = null;
    assertAlignmentValueRejects(fn () => CapabilityPolicySetV1::fromArray($value), 'grant_scope_id_required');
}

function testModelCatalogueAndTransferCrossFieldRulesFailClosed(): void
{
    $catalogue = alignmentValueFixture('model-catalog-entry');
    $catalogue['source']['revision'] = 'latest';
    assertAlignmentValueRejects(fn () => ModelCatalogEntryV1::fromArray($catalogue), 'model_revision_mutable');

    $transfer = alignmentValueFixture('model-transfer');
    $transfer['mode'] = 'preview';
    assertAlignmentValueRejects(fn () => ModelTransferV1::fromArray($transfer), 'transfer_preview_state_invalid');

    $transfer = alignmentValueFixture('model-transfer');
    $transfer['have_bytes'] = $transfer['total_bytes'] + 1;
    assertAlignmentValueRejects(fn () => ModelTransferV1::fromArray($transfer), 'transfer_byte_count_invalid');

    $transfer = alignmentValueFixture('model-transfer');
    $transfer['state'] = 'completed';
    assertAlignmentValueRejects(fn () => ModelTransferV1::fromArray($transfer), 'transfer_completed_unverified');
}

function testFileAuthorityScopeBindingAndAcknowledgementRulesFailClosed(): void
{
    $value = alignmentValueFixture('file-authority-grant');
    $value['scope'] = 'global';
    $value['scope_id'] = null;
    assertAlignmentValueRejects(fn () => FileAuthorityGrantV1::fromArray($value), 'file_grant_global_binding_forbidden');

    $value = alignmentValueFixture('file-authority-grant');
    $value['scope_id'] = 'library-item-other';
    assertAlignmentValueRejects(fn () => FileAuthorityGrantV1::fromArray($value), 'file_grant_file_binding_invalid');

    $value = alignmentValueFixture('file-authority-grant');
    $value['status'] = 'revoked';
    assertAlignmentValueRejects(fn () => FileAuthorityGrantV1::fromArray($value), 'file_grant_revoked_at_required');
}

function testLibraryDigestReferenceCredentialAndEphemeralRulesFailClosed(): void
{
    $value = alignmentValueFixture('library-item');
    $value['content']['sha256'] = null;
    assertAlignmentValueRejects(fn () => LibraryItemV1::fromArray($value), 'library_available_digest_required');

    $value = alignmentValueFixture('library-item');
    $value['content']['content_ref'] = 'file:///private/report.pdf';
    assertAlignmentValueRejects(fn () => LibraryItemV1::fromArray($value), 'library_content_ref_private');

    $value = alignmentValueFixture('library-item');
    $value['provenance']['content_credentials'] = [
        'format' => 'c2pa',
        'present' => false,
        'verification' => 'valid',
        'issuer' => null,
    ];
    assertAlignmentValueRejects(fn () => LibraryItemV1::fromArray($value), 'library_credentials_unverified');

    $value = alignmentValueFixture('library-item');
    $value['metadata']['persistence_mode'] = 'temporary';
    assertAlignmentValueRejects(fn () => LibraryItemV1::fromArray($value), 'library_ephemeral_provenance');
}

$tests = [
    'testServerOwnedArraysRoundTripThroughEveryValueObject',
    'testToolDefinitionCrossFieldRulesFailClosed',
    'testCapabilityPolicyCrossFieldRulesFailClosed',
    'testModelCatalogueAndTransferCrossFieldRulesFailClosed',
    'testFileAuthorityScopeBindingAndAcknowledgementRulesFailClosed',
    'testLibraryDigestReferenceCredentialAndEphemeralRulesFailClosed',
];

foreach ($tests as $test) {
    $test();
    echo $test.' passed'.PHP_EOL;
}

echo "All Alignment contract value object tests passed".PHP_EOL;
