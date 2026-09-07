<?php

declare(strict_types=1);

use Kadmos\Alignment\Contract\AlignmentContractDecoder;
use Kadmos\Alignment\Contract\AlignmentContractException;
use Kadmos\Alignment\Contract\AlignmentContractName;
require_once __DIR__.'/../../vendor/autoload.php';

function assertAlignmentDecoder(bool $condition, string $message): void
{
    if (! $condition) {
        throw new RuntimeException($message);
    }
}

function alignmentDecoderFixture(string $name): string
{
    $contents = file_get_contents(__DIR__.'/../Fixtures/alignment/v1/valid/'.$name.'.json');
    if (! is_string($contents)) {
        throw new RuntimeException("Unable to read Alignment fixture {$name}.");
    }

    return $contents;
}

function alignmentDecoderFailure(callable $callback, string $expectedCode): AlignmentContractException
{
    try {
        $callback();
    } catch (AlignmentContractException $exception) {
        assertAlignmentDecoder(
            $exception->errorCode === $expectedCode,
            "Expected {$expectedCode}, received {$exception->errorCode}.",
        );

        return $exception;
    }

    throw new RuntimeException("Expected Alignment failure {$expectedCode}.");
}

function testMalformedRootUnknownFieldsAndVersionsFailClosed(): void
{
    assertAlignmentDecoder(class_exists(AlignmentContractName::class), 'AlignmentContractName must exist.');
    assertAlignmentDecoder(class_exists(AlignmentContractException::class), 'AlignmentContractException must exist.');
    assertAlignmentDecoder(class_exists(AlignmentContractDecoder::class), 'AlignmentContractDecoder must exist.');
    assertAlignmentDecoder(count(AlignmentContractName::cases()) === 6, 'Exactly six Phase 1 contracts must be registered.');

    alignmentDecoderFailure(
        fn () => AlignmentContractDecoder::decode('{', AlignmentContractName::ToolDefinition),
        'malformed_json',
    );
    alignmentDecoderFailure(
        fn () => AlignmentContractDecoder::decode('[]', AlignmentContractName::ToolDefinition),
        'root_not_object',
    );

    $unknown = json_decode(alignmentDecoderFixture('tool-definition'), true, 128, JSON_THROW_ON_ERROR);
    $unknown['unexpected'] = true;
    $failure = alignmentDecoderFailure(
        fn () => AlignmentContractDecoder::decode(json_encode($unknown, JSON_THROW_ON_ERROR), AlignmentContractName::ToolDefinition),
        'schema_invalid',
    );
    assertAlignmentDecoder(strlen($failure->details) <= 512, 'Validation details must be bounded to 512 bytes.');

    unset($unknown['unexpected']);
    $unknown['schema_version'] = 2;
    alignmentDecoderFailure(
        fn () => AlignmentContractDecoder::decode(json_encode($unknown, JSON_THROW_ON_ERROR), AlignmentContractName::ToolDefinition),
        'schema_invalid',
    );
}

function testExternalBoundaryPreservesObjectAndListShapes(): void
{
    $decoded = AlignmentContractDecoder::decode(
        alignmentDecoderFixture('tool-definition'),
        AlignmentContractName::ToolDefinition,
    );
    $encoded = AlignmentContractDecoder::encodeServerArray($decoded, AlignmentContractName::ToolDefinition);
    $wire = json_decode($encoded, false, 128, JSON_THROW_ON_ERROR);

    assertAlignmentDecoder($wire instanceof \stdClass, 'The encoded root must remain a JSON object.');
    assertAlignmentDecoder($wire->input_schema instanceof \stdClass, 'input_schema must remain a JSON object.');
    assertAlignmentDecoder($wire->input_schema->properties instanceof \stdClass, 'Empty schema properties must remain a JSON object.');
    assertAlignmentDecoder(is_array($wire->capabilities), 'Capabilities must remain a JSON list.');
    assertAlignmentDecoder($wire->annotations instanceof \stdClass, 'Empty annotations must remain a JSON object.');
    assertAlignmentDecoder($wire->metadata instanceof \stdClass, 'Empty metadata must remain a JSON object.');
}

$tests = [
    'testMalformedRootUnknownFieldsAndVersionsFailClosed',
    'testExternalBoundaryPreservesObjectAndListShapes',
];

foreach ($tests as $test) {
    $test();
    echo $test.' passed'.PHP_EOL;
}

echo "All Alignment contract decoder tests passed".PHP_EOL;
