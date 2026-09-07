<?php

declare(strict_types=1);

use Kadmos\Alignment\Contract\AlignmentContractException;
use Kadmos\Alignment\Contract\CapabilityPolicySetV1;
use Kadmos\Alignment\Contract\FileAuthorityGrantV1;
use Kadmos\Alignment\Contract\LibraryItemV1;
use Kadmos\Alignment\Contract\ModelCatalogEntryV1;
use Kadmos\Alignment\Contract\ModelTransferV1;
use Kadmos\Alignment\Contract\ToolDefinitionV1;
use Mcp\Schema\Tool;

require_once __DIR__.'/../../vendor/autoload.php';

function alignmentFixture(string $state, string $name): string
{
    $contents = file_get_contents(__DIR__.'/../fixtures/alignment/v1/'.$state.'/'.$name.'.json');
    if (! is_string($contents)) {
        throw new RuntimeException("Unable to read Alignment fixture {$state}/{$name}.");
    }

    return $contents;
}

function assertAlignmentFixture(bool $condition, string $message): void
{
    if (! $condition) {
        throw new RuntimeException($message);
    }
}

function testAllFrozenValidFixturesRoundTripAndInvalidFixturesFailClosed(): void
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
        assertAlignmentFixture(class_exists($class), "{$class} must exist before Alignment fixtures can be evaluated.");

        $expected = json_decode(alignmentFixture('valid', $name), true, 128, JSON_THROW_ON_ERROR);
        $contract = $class::fromJson(alignmentFixture('valid', $name));
        assertAlignmentFixture($contract->toArray() === $expected, "{$name} must preserve every canonical field.");
        assertAlignmentFixture(
            json_decode($contract->toJson(), true, 128, JSON_THROW_ON_ERROR) === $expected,
            "{$name} must round-trip through canonical JSON.",
        );

        try {
            $class::fromJson(alignmentFixture('invalid', $name));
        } catch (AlignmentContractException $exception) {
            assertAlignmentFixture($exception->contract->value === $name, "{$name} failure must retain its contract identity.");
            assertAlignmentFixture($exception->errorCode !== '', "{$name} failure must expose a stable error code.");
            continue;
        }

        throw new RuntimeException("{$name} invalid fixture must fail closed.");
    }
}

function testRepresentativeToolFixtureConformsToPinnedMcpSdk(): void
{
    $definition = ToolDefinitionV1::fromJson(alignmentFixture('valid', 'tool-definition'))->toArray();
    $tool = Tool::fromArray([
        'name' => $definition['name'],
        'title' => $definition['title'],
        'description' => $definition['description'],
        'inputSchema' => $definition['input_schema'],
        'annotations' => $definition['annotations'],
    ]);

    assertAlignmentFixture($tool->name === $definition['name'], 'The MCP projection must preserve the canonical tool name.');
    assertAlignmentFixture($tool->title === $definition['title'], 'The MCP projection must preserve the canonical tool title.');
    assertAlignmentFixture($tool->inputSchema['type'] === 'object', 'The MCP projection must retain an object input schema.');

    $serialized = json_decode(json_encode($tool, JSON_THROW_ON_ERROR), false, 128, JSON_THROW_ON_ERROR);
    assertAlignmentFixture($serialized->inputSchema->properties instanceof stdClass, 'MCP must serialize empty schema properties as a JSON object.');
    assertAlignmentFixture(! property_exists($serialized, 'outputSchema'), 'A null canonical output schema must be omitted from MCP output.');
}

testAllFrozenValidFixturesRoundTripAndInvalidFixturesFailClosed();
echo "testAllFrozenValidFixturesRoundTripAndInvalidFixturesFailClosed passed".PHP_EOL;
testRepresentativeToolFixtureConformsToPinnedMcpSdk();
echo "testRepresentativeToolFixtureConformsToPinnedMcpSdk passed".PHP_EOL;
echo "All Alignment contract fixture tests passed".PHP_EOL;
