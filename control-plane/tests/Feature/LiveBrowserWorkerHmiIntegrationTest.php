<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Services\Talos\Browser\BrowserActionAuthorization;
use App\Services\Talos\Browser\BrowserWorkerException;
use App\Services\Talos\Browser\HttpBrowserSessionClient;
use App\Services\Talos\Browser\TalosBrowserActionCapabilityIssuer;
use Illuminate\Support\Str;
use PHPUnit\Framework\Attributes\Group;
use Tests\TestCase;

#[Group('live-browser-worker')]
final class LiveBrowserWorkerHmiIntegrationTest extends TestCase
{
    public function test_laravel_client_stages_and_uploads_a_file_through_real_chromium(): void
    {
        $baseUrl = trim((string) getenv('TALOS_LIVE_BROWSER_WORKER_URL'));
        $token = trim((string) getenv('TALOS_LIVE_BROWSER_WORKER_TOKEN'));
        $actionPrivateKey = trim((string) getenv('TALOS_BROWSER_ACTION_PRIVATE_KEY_B64'));
        $actionKeyId = trim((string) getenv('TALOS_BROWSER_ACTION_KEY_ID'));
        if ($baseUrl === '' || $token === '' || $actionPrivateKey === '' || $actionKeyId === '') {
            $this->markTestSkipped('Set the live worker URL/token and browser action capability key configuration to run the live Chromium upload gate.');
        }

        $fixture = realpath(base_path('../browser-worker/tests/fixtures/file-upload-page.html'));
        $this->assertNotFalse($fixture, 'The Browser Worker file upload fixture must exist.');
        $fixtureUrl = 'file:///'.str_replace('\\', '/', ltrim((string) $fixture, '/'));
        $client = new HttpBrowserSessionClient(
            $baseUrl,
            $token,
            20,
            new TalosBrowserActionCapabilityIssuer($actionPrivateKey, $actionKeyId),
        );
        $ownerRef = 'talos-live-upload:'.bin2hex(random_bytes(8));
        $workerSessionId = null;

        try {
            $created = $client->create($ownerRef, 800, 600, 20_000, 300);
            $workerSessionId = $created['sessionId'] ?? null;
            $this->assertIsString($workerSessionId);
            $this->assertTrue((bool) data_get($created, 'capabilities.uploads'));

            $navigation = $client->callTool(
                $ownerRef,
                $workerSessionId,
                'live-upload-navigation',
                'browser_navigate',
                ['url' => $fixtureUrl],
                20_000,
            );
            $this->assertFalse($navigation->isError);
            $stateVersion = data_get($navigation->structuredContent, 'state_version');
            $this->assertSame(1, $stateVersion);

            $snapshot = $client->callTool(
                $ownerRef,
                $workerSessionId,
                'live-upload-snapshot',
                'browser_snapshot',
                ['state_version' => $stateVersion],
                20_000,
            );
            $this->assertFalse($snapshot->isError);
            $nodes = data_get($snapshot->structuredContent, 'nodes');
            $this->assertIsArray($nodes);
            $target = collect($nodes)->first(static fn (mixed $node): bool => is_array($node) && ($node['name'] ?? null) === 'Upload document');
            $this->assertIsArray($target);
            $this->assertMatchesRegularExpression('/^r\d+$/', (string) ($target['ref'] ?? ''));

            $bytes = 'TALOS live PHP upload payload';
            $fileId = (string) Str::uuid();
            $stageId = 'stg_'.Str::uuid();
            $digest = 'sha256:'.hash('sha256', $bytes);
            $staged = $client->stageFile($ownerRef, $workerSessionId, $stageId, [
                'file_id' => $fileId,
                'name' => 'live-evidence.txt',
                'mime_type' => 'text/plain',
                'size_bytes' => strlen($bytes),
                'sha256' => $digest,
                'base64' => base64_encode($bytes),
            ], 20_000);
            $this->assertSame($stageId, $staged['stage_id'] ?? null);

            $arguments = [
                'target' => $target['ref'],
                'element' => 'Upload document',
                'staged_file_ids' => [$stageId],
                'snapshot_id' => data_get($snapshot->structuredContent, 'snapshot_id'),
                'state_version' => $stateVersion,
            ];
            $toolUseId = 'live-upload-approved';
            $result = $client->callTool(
                $ownerRef,
                $workerSessionId,
                $toolUseId,
                'browser_file_upload',
                $arguments,
                20_000,
                BrowserActionAuthorization::userApproval(
                    $toolUseId,
                    (string) Str::uuid(),
                    'sha256:'.hash('sha256', json_encode($arguments, JSON_THROW_ON_ERROR)),
                    'live-upload-lease-'.bin2hex(random_bytes(16)),
                ),
            );

            $this->assertFalse($result->isError);
            $this->assertSame($stateVersion + 1, data_get($result->structuredContent, 'state_version'));
            $this->assertSame($fileId, data_get($result->structuredContent, 'files.0.file_id'));
            $this->assertSame('live-evidence.txt', data_get($result->structuredContent, 'files.0.name'));
            $this->assertSame($digest, data_get($result->structuredContent, 'files.0.sha256'));
            $this->assertStringContainsString('live-evidence.txt|'.$bytes, (string) data_get($result->structuredContent, 'snapshot.text_digest'));
            $serialized = json_encode($result->toArray(), JSON_THROW_ON_ERROR);
            $this->assertStringNotContainsString(base64_encode($bytes), $serialized);
            $this->assertDoesNotMatchRegularExpression('/[A-Za-z]:\\\\|\/tmp\//', $serialized);

            $nextNodes = data_get($result->structuredContent, 'snapshot.nodes');
            $this->assertIsArray($nextNodes);
            $nextTarget = collect($nextNodes)->first(static fn (mixed $node): bool => is_array($node) && ($node['name'] ?? null) === 'Upload document');
            $this->assertIsArray($nextTarget);
            $reusedArguments = [
                ...$arguments,
                'target' => $nextTarget['ref'],
                'snapshot_id' => data_get($result->structuredContent, 'snapshot.snapshot_id'),
                'state_version' => $stateVersion + 1,
            ];
            $reusedToolUseId = 'live-upload-reused';
            $reused = $client->callTool(
                $ownerRef,
                $workerSessionId,
                $reusedToolUseId,
                'browser_file_upload',
                $reusedArguments,
                20_000,
                BrowserActionAuthorization::userApproval(
                    $reusedToolUseId,
                    (string) Str::uuid(),
                    'sha256:'.hash('sha256', json_encode($reusedArguments, JSON_THROW_ON_ERROR)),
                    'live-upload-reuse-lease-'.bin2hex(random_bytes(16)),
                ),
            );
            $this->assertTrue($reused->isError);
            $this->assertSame('TALOS_BROWSER_STAGED_FILE_NOT_FOUND', data_get($reused->structuredContent, 'code'));
        } finally {
            if (is_string($workerSessionId) && $workerSessionId !== '') {
                $client->close($ownerRef, $workerSessionId, 20_000);
            }
        }
    }

    public function test_laravel_client_cancels_a_real_chromium_session_and_fences_future_inspection(): void
    {
        $baseUrl = trim((string) getenv('TALOS_LIVE_BROWSER_WORKER_URL'));
        $token = trim((string) getenv('TALOS_LIVE_BROWSER_WORKER_TOKEN'));
        if ($baseUrl === '' || $token === '') {
            $this->markTestSkipped('Set the live worker URL and token to run the live Chromium cancellation gate.');
        }

        $client = new HttpBrowserSessionClient($baseUrl, $token, 20);
        $ownerRef = 'talos-live-cancel:'.bin2hex(random_bytes(8));
        $workerSessionId = null;
        $sessionFenced = false;

        try {
            $created = $client->create($ownerRef, 800, 600, 20_000, 300);
            $workerSessionId = $created['sessionId'] ?? null;
            $this->assertIsString($workerSessionId);
            $this->assertNotSame('', $workerSessionId);

            $client->cancel($ownerRef, $workerSessionId, 'Live Chromium cancellation gate.', 20_000);

            try {
                $client->inspect($ownerRef, $workerSessionId, 20_000);
                $this->fail('A cancelled Chromium session must be removed or fenced from future inspection.');
            } catch (BrowserWorkerException $exception) {
                $this->assertSame('TALOS_BROWSER_SESSION_NOT_FOUND', $exception->errorCode);
                $sessionFenced = true;
            }
        } finally {
            if (! $sessionFenced && is_string($workerSessionId) && $workerSessionId !== '') {
                try {
                    $client->close($ownerRef, $workerSessionId, 20_000);
                } catch (BrowserWorkerException $exception) {
                    if ($exception->errorCode !== 'TALOS_BROWSER_SESSION_NOT_FOUND') {
                        throw $exception;
                    }
                }
            }
        }
    }

    public function test_laravel_client_executes_a_real_chromium_hmi_transition(): void
    {
        $baseUrl = trim((string) getenv('TALOS_LIVE_BROWSER_WORKER_URL'));
        $token = trim((string) getenv('TALOS_LIVE_BROWSER_WORKER_TOKEN'));
        $actionPrivateKey = trim((string) getenv('TALOS_BROWSER_ACTION_PRIVATE_KEY_B64'));
        $actionKeyId = trim((string) getenv('TALOS_BROWSER_ACTION_KEY_ID'));
        if ($baseUrl === '' || $token === '' || $actionPrivateKey === '' || $actionKeyId === '') {
            $this->markTestSkipped('Set the live worker URL/token and browser action capability key configuration to run the live Chromium integration gate.');
        }

        $fixture = realpath(base_path('../browser-worker/tests/fixtures/hmi-page.html'));
        $this->assertNotFalse($fixture, 'The Browser Worker HMI fixture must exist.');
        $fixtureUrl = 'file:///'.str_replace('\\', '/', ltrim((string) $fixture, '/'));

        $client = new HttpBrowserSessionClient(
            $baseUrl,
            $token,
            20,
            new TalosBrowserActionCapabilityIssuer($actionPrivateKey, $actionKeyId),
        );
        $ownerRef = 'talos-live-hmi:'.bin2hex(random_bytes(8));
        $workerSessionId = null;

        try {
            $created = $client->create($ownerRef, 800, 600, 20_000, 300);
            $workerSessionId = $created['sessionId'] ?? null;
            $this->assertIsString($workerSessionId);
            $this->assertNotSame('', $workerSessionId);
            $this->assertFalse((bool) data_get($created, 'capabilities.actions'));
            $this->assertTrue((bool) data_get($created, 'capabilities.hmiActions'));

            $navigated = $client->navigate($ownerRef, $workerSessionId, $fixtureUrl, 20_000);
            $sourceStateVersion = $navigated['stateVersion'] ?? null;
            $this->assertSame(1, $sourceStateVersion);

            $frame = $client->screenshot($ownerRef, $workerSessionId, 20_000);
            $frameSha256 = $frame['sha256'] ?? null;
            $this->assertMatchesRegularExpression('/^[a-f0-9]{64}$/', (string) $frameSha256);
            $interactionId = (string) Str::uuid();

            $pointer = [
                'schema_version' => 'talos_browser_hmi_pointer_v2',
                'interaction_id' => $interactionId,
                'state_version' => $sourceStateVersion,
                'expected_frame_sha256' => 'sha256:'.$frameSha256,
                'normalized_x' => 0.200625,
                'normalized_y' => 0.280834,
                'button' => 'left',
                'click_count' => 1,
            ];
            $preflight = $client->preflightPointer($ownerRef, $workerSessionId, $pointer, 20_000);
            $this->assertSame('talos_browser_hmi_preflight_v2', $preflight['schema_version'] ?? null);
            $this->assertSame($interactionId, $preflight['interaction_id'] ?? null);
            $this->assertSame($pointer['expected_frame_sha256'], $preflight['frame_sha256'] ?? null);
            $this->assertSame(0.200625, data_get($preflight, 'point.normalized_x'));
            $this->assertSame(0.280834, data_get($preflight, 'point.normalized_y'));
            $this->assertSame(161, data_get($preflight, 'point.x'));
            $this->assertSame(169, data_get($preflight, 'point.y'));
            $this->assertSame('Reject optional cookies', data_get($preflight, 'target.name'));
            $effectClassification = data_get($preflight, 'target.required_effect_classification');
            $this->assertContains($effectClassification, ['ordinary', 'sensitive']);
            $commandId = 'hmi_live_'.bin2hex(random_bytes(16));

            $command = [
                ...$pointer,
                'command_id' => $commandId,
                'expected_fingerprint' => data_get($preflight, 'target.fingerprint'),
                'effect_classification' => $effectClassification,
                'sensitive_effect_authorized' => $effectClassification === 'sensitive',
            ];
            $authorization = BrowserActionAuthorization::userApproval(
                $commandId,
                (string) Str::uuid(),
                'sha256:'.hash('sha256', json_encode($command, JSON_THROW_ON_ERROR)),
                'live-hmi-execution-lease-'.bin2hex(random_bytes(16)),
            );
            $result = $client->executePointer(
                $ownerRef,
                $workerSessionId,
                $command,
                20_000,
                $authorization,
            );

            $this->assertSame('talos_browser_hmi_result_v2', $result['schema_version'] ?? null);
            $this->assertSame($interactionId, $result['interaction_id'] ?? null);
            $this->assertSame($commandId, $result['command_id'] ?? null);
            $this->assertSame($sourceStateVersion, $result['source_state_version'] ?? null);
            $this->assertSame($sourceStateVersion + 1, $result['state_version'] ?? null);
            $this->assertSame('image/png', data_get($result, 'screenshot.mime_type'));
            $this->assertMatchesRegularExpression('/^sha256:[a-f0-9]{64}$/', (string) data_get($result, 'screenshot.sha256'));
            $this->assertSame('accessibility_refs_v1', data_get($result, 'snapshot.format'));
            $this->assertNotSame('', (string) data_get($result, 'snapshot.snapshot_id'));

            $replayed = $client->executePointer(
                $ownerRef,
                $workerSessionId,
                $command,
                20_000,
                $authorization,
            );
            $this->assertSame($result, $replayed, 'A fresh JWT with the same command id must replay the committed result without a second click.');

            $inspected = $client->inspect($ownerRef, $workerSessionId, 20_000);
            $this->assertSame($sourceStateVersion + 1, $inspected['stateVersion'] ?? null);
        } finally {
            if (is_string($workerSessionId) && $workerSessionId !== '') {
                $client->close($ownerRef, $workerSessionId, 20_000);
            }
        }
    }
}
