<?php

declare(strict_types=1);

require_once __DIR__.'/../vendor/autoload.php';

use Kadmos\Tool\ProviderInputResource;
use Kadmos\Tool\ProviderTurnRequest;
use Kadmos\Tool\ToolDefinition;

function assertInputResource(bool $condition, string $message): void
{
    if (! $condition) {
        throw new RuntimeException($message);
    }
}

/** @param callable(): void $operation */
function assertInvalidInputResource(callable $operation, string $message): void
{
    try {
        $operation();
    } catch (InvalidArgumentException) {
        return;
    }

    throw new RuntimeException($message);
}

function inputResourceDefinition(): ToolDefinition
{
    $definition = json_decode(
        (string) file_get_contents(__DIR__.'/fixtures/tool-contracts/valid-definition.json'),
        true,
        flags: JSON_THROW_ON_ERROR,
    );

    return ToolDefinition::fromStrictArray($definition);
}

function testResourceDerivesDigestAndEmitsRedactedAuditMetadata(): void
{
    $bytes = "\x89PNG\r\n\x1a\nfixture";
    $resource = ProviderInputResource::fromBytes(
        resourceId: 'file-018f-resource-1',
        kind: ProviderInputResource::KIND_IMAGE,
        filename: 'diagram.png',
        mediaType: 'image/png',
        bytes: $bytes,
    );

    assertInputResource($resource->resourceId === 'file-018f-resource-1', 'Resource ID must survive the canonical boundary.');
    assertInputResource($resource->sizeBytes === strlen($bytes), 'Resource size must be derived from bytes.');
    assertInputResource($resource->sha256 === 'sha256:'.hash('sha256', $bytes), 'Resource digest must be derived from bytes.');
    assertInputResource($resource->base64Data() === base64_encode($bytes), 'Provider base64 must derive from the original bytes.');
    assertInputResource($resource->dataUri() === 'data:image/png;base64,'.base64_encode($bytes), 'Provider data URI must include canonical MIME.');
    assertInputResource($resource->isImage() && ! $resource->isDocument(), 'Resource kind helpers must be exclusive.');

    $audit = $resource->toAuditArray();
    $encoded = json_encode($audit, JSON_THROW_ON_ERROR);
    assertInputResource(($audit['schema_version'] ?? null) === ProviderInputResource::SCHEMA_VERSION, 'Audit metadata must be versioned.');
    assertInputResource(($audit['sha256'] ?? null) === $resource->sha256, 'Audit metadata must preserve the digest.');
    assertInputResource(! str_contains($encoded, base64_encode($bytes)), 'Audit metadata must never contain inline bytes.');
    assertInputResource(! str_contains($encoded, 'data:image/png'), 'Audit metadata must never contain a data URI.');
}

function testResourceRejectsUnsafeNamesInvalidMimeEmptyAndOversizedBytes(): void
{
    foreach (['../secret.pdf', '..\\secret.pdf', '.', '..', "bad\0name.pdf", "line\nbreak.pdf"] as $filename) {
        assertInvalidInputResource(
            static fn () => ProviderInputResource::fromBytes('resource-1', ProviderInputResource::KIND_DOCUMENT, $filename, 'application/pdf', 'pdf'),
            "Unsafe filename [{$filename}] must fail closed.",
        );
    }

    assertInvalidInputResource(
        static fn () => ProviderInputResource::fromBytes('resource-1', ProviderInputResource::KIND_DOCUMENT, 'report.pdf', 'Application/PDF', 'pdf'),
        'Non-canonical MIME types must fail closed.',
    );
    assertInvalidInputResource(
        static fn () => ProviderInputResource::fromBytes('resource-1', ProviderInputResource::KIND_DOCUMENT, 'report.pdf', 'not a mime', 'pdf'),
        'Invalid MIME grammar must fail closed.',
    );
    assertInvalidInputResource(
        static fn () => ProviderInputResource::fromBytes('resource-1', ProviderInputResource::KIND_DOCUMENT, 'report.pdf', 'application/pdf', ''),
        'Empty bytes must fail closed.',
    );
    assertInvalidInputResource(
        static fn () => ProviderInputResource::fromBytes('resource-1', ProviderInputResource::KIND_DOCUMENT, 'report.pdf', 'application/pdf', str_repeat('x', ProviderInputResource::MAX_BYTES + 1)),
        'Oversized resources must fail closed.',
    );
}

function testTurnRequestRejectsResourcesWithToolsOrNonUserTail(): void
{
    $resource = ProviderInputResource::fromBytes(
        'resource-1',
        ProviderInputResource::KIND_DOCUMENT,
        'report.pdf',
        'application/pdf',
        '%PDF-fixture',
    );

    $request = new ProviderTurnRequest(
        provider: 'openai',
        model: 'gpt-test',
        systemPrompt: 'Answer from the supplied document.',
        messages: [['role' => 'user', 'content' => 'Summarize the report.']],
        tools: [],
        resources: [$resource],
    );
    $redacted = json_encode($request->toRedactedArray(), JSON_THROW_ON_ERROR);
    assertInputResource(count($request->resources) === 1, 'A valid resource-only turn must be accepted.');
    assertInputResource(str_contains($redacted, $resource->sha256), 'Request audit input must include resource provenance.');
    assertInputResource(! str_contains($redacted, $resource->base64Data()), 'Request audit input must exclude provider bytes.');

    assertInvalidInputResource(
        static fn () => new ProviderTurnRequest(
            provider: 'openai',
            model: 'gpt-test',
            systemPrompt: 'Use the tool.',
            messages: [['role' => 'user', 'content' => 'Run this.']],
            tools: [inputResourceDefinition()],
            resources: [$resource],
        ),
        'Native resources and procedural tools must be mutually exclusive.',
    );
    assertInvalidInputResource(
        static fn () => new ProviderTurnRequest(
            provider: 'openai',
            model: 'gpt-test',
            systemPrompt: 'Continue.',
            messages: [
                ['role' => 'user', 'content' => 'Question.'],
                ['role' => 'assistant', 'content' => 'Answer.'],
            ],
            tools: [],
            resources: [$resource],
        ),
        'Resources must attach to a final user message.',
    );
}

function testTurnRequestEnforcesResourceIdentityCountAndAggregateBudgets(): void
{
    $resource = static fn (string $id, string $bytes = 'pdf'): ProviderInputResource => ProviderInputResource::fromBytes(
        $id,
        ProviderInputResource::KIND_DOCUMENT,
        $id.'.pdf',
        'application/pdf',
        $bytes,
    );

    assertInvalidInputResource(
        static fn () => new ProviderTurnRequest(
            provider: 'openai',
            model: 'gpt-test',
            systemPrompt: 'Summarize.',
            messages: [['role' => 'user', 'content' => 'Read the files.']],
            tools: [],
            resources: [$resource('duplicate'), $resource('duplicate')],
        ),
        'Duplicate resource IDs must fail closed.',
    );

    assertInvalidInputResource(
        static fn () => new ProviderTurnRequest(
            provider: 'openai',
            model: 'gpt-test',
            systemPrompt: 'Summarize.',
            messages: [['role' => 'user', 'content' => 'Read the files.']],
            tools: [],
            resources: array_map(static fn (int $index): ProviderInputResource => $resource('resource-'.$index), range(1, 5)),
        ),
        'More than four resources must fail closed.',
    );

    $sevenMiB = str_repeat('x', 7 * 1024 * 1024);
    assertInvalidInputResource(
        static fn () => new ProviderTurnRequest(
            provider: 'openai',
            model: 'gpt-test',
            systemPrompt: 'Summarize.',
            messages: [['role' => 'user', 'content' => 'Read the files.']],
            tools: [],
            resources: [
                $resource('large-1', $sevenMiB),
                $resource('large-2', $sevenMiB),
                $resource('large-3', $sevenMiB),
            ],
        ),
        'Aggregate resource bytes above twenty MiB must fail closed.',
    );
}

$tests = [
    'testResourceDerivesDigestAndEmitsRedactedAuditMetadata',
    'testResourceRejectsUnsafeNamesInvalidMimeEmptyAndOversizedBytes',
    'testTurnRequestRejectsResourcesWithToolsOrNonUserTail',
    'testTurnRequestEnforcesResourceIdentityCountAndAggregateBudgets',
];

foreach ($tests as $test) {
    $test();
    echo $test." passed\n";
}

echo "All provider input resource tests passed\n";
