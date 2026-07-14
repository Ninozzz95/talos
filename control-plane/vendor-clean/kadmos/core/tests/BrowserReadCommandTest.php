<?php

declare(strict_types=1);

require_once __DIR__ . '/../src/Browser/BrowserReadCommand.php';

use Kadmos\Browser\BrowserReadCommand;

function browserCommandFixture(string $operation = 'snapshot', array $arguments = []): array
{
    return [
        'schema_version' => 'talos_browser_command_v1',
        'command_id' => 'bc_1',
        'run_id' => '0190f2f1-7a4b-7abc-8def-0123456789ab',
        'node_id' => 'browser_1',
        'browser_session_id' => '0190f2f1-7a4b-7abc-8def-0123456789ac',
        'operation' => $operation,
        'arguments' => $arguments,
        'observation_request' => [],
        'risk' => 'read',
        'expected_evidence_hash' => $operation === 'read' ? 'sha256:' . str_repeat('a', 64) : null,
        'idempotency_key' => 'sha256:' . str_repeat('b', 64),
    ];
}

function assertBrowserCommandRejected(array $command, string $message): void
{
    try {
        BrowserReadCommand::fromArray($command);
    } catch (InvalidArgumentException) {
        return;
    }

    throw new RuntimeException($message);
}

function testBrowserReadCommandAcceptsCanonicalReadOperations(): void
{
    $snapshot = BrowserReadCommand::fromArray(browserCommandFixture());
    if ($snapshot->operation !== 'snapshot') {
        throw new RuntimeException('Snapshot command should parse as a typed read operation.');
    }

    $read = BrowserReadCommand::fromArray(browserCommandFixture('read', ['ref' => 'r1']));
    if ($read->expectedEvidenceHash !== 'sha256:' . str_repeat('a', 64)) {
        throw new RuntimeException('Read command should retain its exact source evidence hash.');
    }
}

function testBrowserReadCommandRejectsUnknownKeysAndAuthorityClaims(): void
{
    foreach (['approval', 'capability'] as $claim) {
        $command = browserCommandFixture();
        $command[$claim] = $claim === 'approval' ? true : 'browser.write';
        assertBrowserCommandRejected($command, "Browser command must reject {$claim} claims.");
    }
}

function testBrowserReadCommandRejectsMalformedIdsAndHashes(): void
{
    foreach ([
        'run_id' => 'run_1',
        'browser_session_id' => 'browser-session-1',
        'node_id' => 'browser node',
        'command_id' => 'bc.1',
        'idempotency_key' => 'sha256:command-1',
    ] as $field => $value) {
        $command = browserCommandFixture();
        $command[$field] = $value;
        assertBrowserCommandRejected($command, "Browser command must reject malformed {$field}.");
    }

    $read = browserCommandFixture('read', ['query' => 'Total']);
    $read['expected_evidence_hash'] = 'not-a-sha256';
    assertBrowserCommandRejected($read, 'Read command must reject a malformed evidence hash.');

    $read['expected_evidence_hash'] = str_repeat('a', 64);
    assertBrowserCommandRejected($read, 'Read command must reject an unprefixed evidence hash.');
}

function testBrowserReadCommandRequiresExactEvidenceForReadOnly(): void
{
    $read = browserCommandFixture('read', ['ref' => 'r1']);
    $read['expected_evidence_hash'] = null;
    assertBrowserCommandRejected($read, 'Read command must require its source evidence hash.');

    $snapshot = browserCommandFixture();
    $snapshot['expected_evidence_hash'] = 'sha256:' . str_repeat('a', 64);
    assertBrowserCommandRejected($snapshot, 'Non-read commands must not claim source evidence.');
}

function testBrowserReadCommandEnforcesDiscriminatedArguments(): void
{
    assertBrowserCommandRejected(
        browserCommandFixture('snapshot', ['url' => 'https://example.com']),
        'Snapshot commands must reject navigate arguments.',
    );
    assertBrowserCommandRejected(
        browserCommandFixture('read'),
        'Read commands must require a ref or query.',
    );
    assertBrowserCommandRejected(
        browserCommandFixture('read', ['ref' => 123]),
        'Read command arguments must preserve their declared types.',
    );
    assertBrowserCommandRejected(
        browserCommandFixture('navigate', ['url' => 'file:///etc/passwd']),
        'Navigate commands must require an HTTP or HTTPS URL.',
    );
}

$tests = [
    'testBrowserReadCommandAcceptsCanonicalReadOperations',
    'testBrowserReadCommandRejectsUnknownKeysAndAuthorityClaims',
    'testBrowserReadCommandRejectsMalformedIdsAndHashes',
    'testBrowserReadCommandRequiresExactEvidenceForReadOnly',
    'testBrowserReadCommandEnforcesDiscriminatedArguments',
];

foreach ($tests as $test) {
    $test();
    echo $test . " passed\n";
}

echo "BrowserReadCommandTest: OK\n";
