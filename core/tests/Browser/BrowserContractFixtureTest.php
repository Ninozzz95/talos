<?php

declare(strict_types=1);

use Kadmos\Browser\Contract\BrowserAction;
use Kadmos\Browser\Contract\BrowserActionIntent;
use Kadmos\Browser\Contract\BrowserArtifactReference;
use Kadmos\Browser\Contract\BrowserCapabilityManifest;
use Kadmos\Browser\Contract\BrowserCheckpoint;
use Kadmos\Browser\Contract\BrowserEvidenceBundle;
use Kadmos\Browser\Contract\BrowserSessionLease;
use Kadmos\Browser\Contract\BrowserTask;

require_once __DIR__.'/../../vendor/autoload.php';

function assertBrowserFixture(bool $condition, string $message): void
{
    if (! $condition) {
        throw new RuntimeException($message);
    }
}

function testEveryCanonicalFixtureHasARealLocalSchemaAndParser(): void
{
    $contracts = [
        'browser-task' => BrowserTask::fromJson(...),
        'browser-action-intent' => BrowserActionIntent::fromJson(...),
        'browser-action' => BrowserAction::fromJson(...),
        'browser-artifact-reference' => BrowserArtifactReference::fromJson(...),
        'browser-evidence-bundle' => BrowserEvidenceBundle::fromJson(...),
        'browser-checkpoint' => BrowserCheckpoint::fromJson(...),
        'browser-capability-manifest' => BrowserCapabilityManifest::fromJson(...),
        'browser-session-lease' => BrowserSessionLease::fromJson(...),
    ];

    foreach ($contracts as $name => $parser) {
        $fixturePath = __DIR__.'/../Fixtures/browser/v1/valid/'.$name.'.json';
        $schemaPath = __DIR__.'/../../resources/schema/browser/v1/'.$name.'.schema.json';
        assertBrowserFixture(is_file($fixturePath), "Missing canonical fixture {$fixturePath}.");
        assertBrowserFixture(is_file($schemaPath), "Missing package-local schema {$schemaPath}.");
        $json = file_get_contents($fixturePath);
        assertBrowserFixture(is_string($json), "Unable to read {$fixturePath}.");
        assertBrowserFixture(is_object($parser($json)), "Parser for {$name} must return a value object.");
    }
}

function testCanonicalRoundTripsRemainJsonObjects(): void
{
    $fixturePath = __DIR__.'/../Fixtures/browser/v1/valid/browser-action.json';
    $fixture = file_get_contents($fixturePath);
    assertBrowserFixture(is_string($fixture), 'Unable to read action fixture.');
    $action = BrowserAction::fromJson($fixture);
    $encoded = json_encode($action->toCanonicalArray(), JSON_THROW_ON_ERROR);
    $decoded = json_decode($encoded, false, 64, JSON_THROW_ON_ERROR);

    assertBrowserFixture($decoded instanceof stdClass, 'Canonical action JSON root must remain an object.');
    assertBrowserFixture($decoded->arguments instanceof stdClass, 'Canonical empty or populated arguments must remain an object.');
    assertBrowserFixture(is_array($decoded->preconditions), 'Canonical preconditions must remain a list.');
}

function testServerConstructedArraysUseTheSameCanonicalValidationBoundary(): void
{
    $contracts = [
        'browser-task' => BrowserTask::fromArray(...),
        'browser-action-intent' => BrowserActionIntent::fromArray(...),
        'browser-action' => BrowserAction::fromArray(...),
        'browser-artifact-reference' => BrowserArtifactReference::fromArray(...),
        'browser-evidence-bundle' => BrowserEvidenceBundle::fromArray(...),
        'browser-checkpoint' => BrowserCheckpoint::fromArray(...),
        'browser-capability-manifest' => BrowserCapabilityManifest::fromArray(...),
        'browser-session-lease' => BrowserSessionLease::fromArray(...),
    ];

    foreach ($contracts as $name => $parser) {
        $json = file_get_contents(__DIR__.'/../Fixtures/browser/v1/valid/'.$name.'.json');
        assertBrowserFixture(is_string($json), "Unable to read {$name} fixture.");
        $value = json_decode($json, true, 64, JSON_THROW_ON_ERROR);
        assertBrowserFixture(is_array($value) && ! array_is_list($value), "{$name} must decode as an object-shaped server value.");
        $contract = $parser($value);
        assertBrowserFixture(is_object($contract), "Server parser for {$name} must return a value object.");
        $roundTrip = json_decode(json_encode($contract->toCanonicalArray(), JSON_THROW_ON_ERROR), true, 64, JSON_THROW_ON_ERROR);
        assertBrowserFixture($roundTrip === $value, "Server parser for {$name} must preserve canonical values.");
    }
}

$tests = [
    'testEveryCanonicalFixtureHasARealLocalSchemaAndParser',
    'testCanonicalRoundTripsRemainJsonObjects',
    'testServerConstructedArraysUseTheSameCanonicalValidationBoundary',
];

foreach ($tests as $test) {
    $test();
    echo $test.' passed'.PHP_EOL;
}

echo 'All Browser contract fixture tests passed'.PHP_EOL;
