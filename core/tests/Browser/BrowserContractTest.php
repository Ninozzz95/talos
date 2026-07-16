<?php

declare(strict_types=1);

use Kadmos\Browser\Contract\BrowserAction;
use Kadmos\Browser\Contract\BrowserActionIntent;
use Kadmos\Browser\Contract\BrowserActionKind;
use Kadmos\Browser\Contract\BrowserArtifactKind;
use Kadmos\Browser\Contract\BrowserArtifactReference;
use Kadmos\Browser\Contract\BrowserCapability;
use Kadmos\Browser\Contract\BrowserCapabilityManifest;
use Kadmos\Browser\Contract\BrowserContractVersion;
use Kadmos\Browser\Contract\BrowserCheckpoint;
use Kadmos\Browser\Contract\BrowserEvidenceBundle;
use Kadmos\Browser\Contract\BrowserLeaseStatus;
use Kadmos\Browser\Contract\BrowserSessionLease;
use Kadmos\Browser\Contract\BrowserTask;
use Kadmos\Browser\Contract\BrowserTaskStatus;
use Opis\JsonSchema\CompliantValidator;

require_once __DIR__.'/../../vendor/autoload.php';

function browserContractFixture(string $path): string
{
    $contents = file_get_contents(__DIR__.'/../Fixtures/browser/v1/'.$path.'.json');
    if (! is_string($contents)) {
        throw new RuntimeException("Unable to read Browser contract fixture {$path}.");
    }

    return $contents;
}

function assertBrowserContract(bool $condition, string $message): void
{
    if (! $condition) {
        throw new RuntimeException($message);
    }
}

function assertBrowserContractThrows(callable $callback, string $message): void
{
    try {
        $callback();
    } catch (InvalidArgumentException) {
        return;
    }

    throw new RuntimeException($message);
}

function testTaskTransitionsAreImmutableAndCompareAndSwapGuarded(): void
{
    $task = BrowserTask::fromJson(browserContractFixture('valid/browser-task'));
    assertBrowserContract($task->status === BrowserTaskStatus::Running, 'Task fixture should parse its typed status.');
    assertBrowserContract($task->stateVersion === 3, 'Task fixture should retain state_version.');

    $waiting = $task->transition(BrowserTaskStatus::WaitingUser, 3);
    assertBrowserContract($waiting !== $task, 'Task transition should return a new immutable value.');
    assertBrowserContract($waiting->status === BrowserTaskStatus::WaitingUser, 'Allowed transition should update status.');
    assertBrowserContract($waiting->stateVersion === 4, 'Allowed transition should increment state_version exactly once.');
    assertBrowserContract($task->stateVersion === 3, 'Original task must remain unchanged.');

    $recovering = $task->transition(BrowserTaskStatus::Recovering, 3);
    $recoveryWait = $recovering->transition(BrowserTaskStatus::WaitingUser, 4);
    assertBrowserContract(
        $recoveryWait->status === BrowserTaskStatus::WaitingUser && $recoveryWait->stateVersion === 5,
        'A consequential recovery must enter human review without reopening model dispatch.',
    );

    assertBrowserContractThrows(
        fn () => $task->transition(BrowserTaskStatus::Completed, 2),
        'A stale expected state version must fail closed.',
    );

    $completed = BrowserTask::fromJson(browserContractFixture('invalid/invalid-transition'));
    assertBrowserContractThrows(
        fn () => $completed->transition(BrowserTaskStatus::Running, 7),
        'A terminal task must not return to running.',
    );
}

function testAllCanonicalValueObjectsParseTypedFixtures(): void
{
    $intent = BrowserActionIntent::fromJson(browserContractFixture('valid/browser-action-intent'));
    $action = BrowserAction::fromJson(browserContractFixture('valid/browser-action'));
    $artifact = BrowserArtifactReference::fromJson(browserContractFixture('valid/browser-artifact-reference'));
    $evidence = BrowserEvidenceBundle::fromJson(browserContractFixture('valid/browser-evidence-bundle'));
    $checkpoint = BrowserCheckpoint::fromJson(browserContractFixture('valid/browser-checkpoint'));
    $manifest = BrowserCapabilityManifest::fromJson(browserContractFixture('valid/browser-capability-manifest'));
    $lease = BrowserSessionLease::fromJson(browserContractFixture('valid/browser-session-lease'));

    assertBrowserContract($intent->kind === BrowserActionKind::Navigate, 'Intent kind should be typed.');
    assertBrowserContract($action->kind === BrowserActionKind::Navigate, 'Action kind should be typed.');
    assertBrowserContract($artifact->kind === BrowserArtifactKind::Screenshot, 'Artifact kind should be typed.');
    $evidence->verifyAgainst($action);
    assertBrowserContract($checkpoint->taskStateVersion === 4, 'Checkpoint should preserve the task frontier.');
    assertBrowserContract($manifest->supports(BrowserCapability::Click), 'Manifest should expose discovered capabilities.');
    assertBrowserContract(! $manifest->supports(BrowserCapability::Upload), 'Manifest must not invent absent capabilities.');
    assertBrowserContract($lease->status === BrowserLeaseStatus::Active, 'Lease status should be typed.');
    assertBrowserContract(
        BrowserContractVersion::WORKER_PROTOCOL === 'talos.browser.worker.v2',
        'The canonical capability manifest must bind worker protocol v2.',
    );
}

function testWireBoundaryPreservesRootShapeAndRejectsUnknownFields(): void
{
    assertBrowserContract(class_exists(CompliantValidator::class), 'The real pinned Opis validator must be available.');

    assertBrowserContractThrows(
        fn () => BrowserTask::fromJson(browserContractFixture('invalid/list-instead-of-object')),
        'A JSON list must never be accepted as a BrowserTask object.',
    );
    assertBrowserContractThrows(
        fn () => BrowserTask::fromJson(browserContractFixture('invalid/unknown-version')),
        'An unknown schema version must fail closed.',
    );
    assertBrowserContractThrows(
        fn () => BrowserAction::fromJson(browserContractFixture('invalid/unknown-action-field')),
        'Unknown action fields must fail closed instead of being stripped.',
    );

    $actionPayload = json_decode(browserContractFixture('valid/browser-action'), true, 64, JSON_THROW_ON_ERROR);
    $actionPayload['arguments'] = [];
    assertBrowserContractThrows(
        fn () => BrowserAction::fromJson(json_encode($actionPayload, JSON_THROW_ON_ERROR)),
        'An empty JSON list must not be coerced into an arguments object.',
    );
}

function testEvidenceIdentityMustMatchItsAction(): void
{
    $action = BrowserAction::fromJson(browserContractFixture('valid/browser-action'));
    $mismatched = BrowserEvidenceBundle::fromJson(browserContractFixture('invalid/mismatched-evidence'));

    assertBrowserContractThrows(
        fn () => $mismatched->verifyAgainst($action),
        'Evidence from a different task must not verify against the action.',
    );
}

function testInitialAboutBlankIsAcceptedWithoutBroadeningOpaqueSchemes(): void
{
    $evidencePayload = json_decode(browserContractFixture('valid/browser-evidence-bundle'), true, 64, JSON_THROW_ON_ERROR);
    $evidencePayload['url'] = 'about:blank';
    $evidence = BrowserEvidenceBundle::fromJson(json_encode($evidencePayload, JSON_THROW_ON_ERROR));
    assertBrowserContract($evidence->url === 'about:blank', 'Initial Browser evidence must preserve about:blank exactly.');

    foreach (['about:srcdoc', 'data:text/html,unsafe', 'javascript:alert(1)'] as $unsupportedUrl) {
        $evidencePayload['url'] = $unsupportedUrl;
        assertBrowserContractThrows(
            fn () => BrowserEvidenceBundle::fromJson(json_encode($evidencePayload, JSON_THROW_ON_ERROR)),
            "Browser evidence must reject unsupported opaque URL {$unsupportedUrl}.",
        );
    }

    $checkpointPayload = json_decode(browserContractFixture('valid/browser-checkpoint'), true, 64, JSON_THROW_ON_ERROR);
    $checkpointPayload['tab_inventory'][0]['url'] = 'about:blank';
    $checkpoint = BrowserCheckpoint::fromJson(json_encode($checkpointPayload, JSON_THROW_ON_ERROR));
    assertBrowserContract(
        $checkpoint->tabInventory[0]['url'] === 'about:blank',
        'An initial Browser checkpoint must preserve about:blank exactly.',
    );

    $checkpointPayload['tab_inventory'][0]['url'] = 'file:///etc/passwd';
    assertBrowserContractThrows(
        fn () => BrowserCheckpoint::fromJson(json_encode($checkpointPayload, JSON_THROW_ON_ERROR)),
        'Browser checkpoints must not broaden initial-page support to file URLs.',
    );
}

$tests = [
    'testTaskTransitionsAreImmutableAndCompareAndSwapGuarded',
    'testAllCanonicalValueObjectsParseTypedFixtures',
    'testWireBoundaryPreservesRootShapeAndRejectsUnknownFields',
    'testEvidenceIdentityMustMatchItsAction',
    'testInitialAboutBlankIsAcceptedWithoutBroadeningOpaqueSchemes',
];

foreach ($tests as $test) {
    $test();
    echo $test.' passed'.PHP_EOL;
}

echo 'All Browser contract tests passed'.PHP_EOL;
