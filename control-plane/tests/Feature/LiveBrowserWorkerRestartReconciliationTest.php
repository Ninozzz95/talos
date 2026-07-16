<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Services\Talos\Browser\BrowserActionAuthorization;
use App\Services\Talos\Browser\BrowserWorkerException;
use App\Services\Talos\Browser\HttpBrowserSessionClient;
use App\Services\Talos\Browser\TalosBrowserActionCapabilityIssuer;
use Illuminate\Support\Str;
use JsonException;
use PHPUnit\Framework\Attributes\Group;
use Tests\TestCase;

#[Group('live-browser-worker')]
final class LiveBrowserWorkerRestartReconciliationTest extends TestCase
{
    /**
     * The live harness invokes this test once before and once after restarting
     * the worker. Normal suites verify that no half-configured phase leaked in.
     */
    public function test_controlled_restart_fences_the_old_session_before_action_redispatch(): void
    {
        $phase = trim((string) getenv('TALOS_LIVE_BROWSER_RESTART_PHASE'));
        if ($phase === '') {
            $this->assertSame('', trim((string) getenv('TALOS_LIVE_BROWSER_RESTART_STATE')));

            return;
        }

        $this->assertContains($phase, ['before', 'after']);
        $statePath = trim((string) getenv('TALOS_LIVE_BROWSER_RESTART_STATE'));
        $this->assertNotSame('', $statePath);

        if ($phase === 'before') {
            $this->recordCommittedAction($statePath);

            return;
        }

        $this->assertRestartFence($statePath);
    }

    private function recordCommittedAction(string $statePath): void
    {
        $client = $this->client();
        $ownerRef = 'talos-live-restart:'.bin2hex(random_bytes(8));
        $created = $client->create($ownerRef, 800, 600, 20_000, 300);
        $workerSessionId = $created['sessionId'] ?? null;
        $workerInstanceId = $created['workerInstanceId'] ?? null;
        $this->assertIsString($workerSessionId);
        $this->assertIsString($workerInstanceId);

        $fixture = realpath(base_path('../browser-worker/tests/fixtures/hmi-page.html'));
        $this->assertNotFalse($fixture);
        $fixtureUrl = 'file:///'.str_replace('\\', '/', ltrim((string) $fixture, '/'));
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
        $commandId = 'hmi_restart_'.bin2hex(random_bytes(16));
        $effectClassification = data_get($preflight, 'target.required_effect_classification');
        $this->assertContains($effectClassification, ['ordinary', 'sensitive']);
        $command = [
            ...$pointer,
            'command_id' => $commandId,
            'expected_fingerprint' => data_get($preflight, 'target.fingerprint'),
            'effect_classification' => $effectClassification,
            'sensitive_effect_authorized' => $effectClassification === 'sensitive',
        ];
        $result = $client->executePointer(
            $ownerRef,
            $workerSessionId,
            $command,
            20_000,
            $this->authorization($commandId, $command),
        );
        $this->assertSame($sourceStateVersion + 1, $result['state_version'] ?? null);

        $state = [
            'schema_version' => 'talos_browser_restart_probe_v1',
            'worker_instance_id' => $workerInstanceId,
            'owner_ref' => $ownerRef,
            'worker_session_id' => $workerSessionId,
            'command' => $command,
            'result_sha256' => 'sha256:'.hash('sha256', json_encode($result, JSON_THROW_ON_ERROR)),
        ];
        $written = file_put_contents(
            $statePath,
            json_encode($state, JSON_THROW_ON_ERROR | JSON_PRETTY_PRINT).PHP_EOL,
            LOCK_EX,
        );
        $this->assertIsInt($written);
        $this->assertGreaterThan(0, $written);
    }

    private function assertRestartFence(string $statePath): void
    {
        $state = $this->readState($statePath);
        $client = $this->client();
        $ownerRef = $state['owner_ref'];
        $workerSessionId = $state['worker_session_id'];
        $command = $state['command'];
        $commandId = $command['command_id'];

        $handshake = $client->handshake($ownerRef, 20_000);
        $this->assertNotSame($state['worker_instance_id'], $handshake->workerInstanceId);

        try {
            $client->executePointer(
                $ownerRef,
                $workerSessionId,
                $command,
                20_000,
                $this->authorization($commandId, $command),
            );
            $this->fail('A restarted worker must not redispatch an action from a lost session.');
        } catch (BrowserWorkerException $exception) {
            $this->assertSame('TALOS_BROWSER_SESSION_NOT_FOUND', $exception->errorCode);
        }

        $replacement = $client->create($ownerRef, 800, 600, 20_000, 60);
        $replacementSessionId = $replacement['sessionId'] ?? null;
        $this->assertIsString($replacementSessionId);
        $client->close($ownerRef, $replacementSessionId, 20_000);
    }

    /** @return array{worker_instance_id: string, owner_ref: string, worker_session_id: string, command: array<string, mixed>} */
    private function readState(string $statePath): array
    {
        $contents = file_get_contents($statePath);
        $this->assertIsString($contents);
        try {
            $state = json_decode($contents, true, 32, JSON_THROW_ON_ERROR);
        } catch (JsonException) {
            $this->fail('The controlled-restart probe state is invalid JSON.');
        }
        $this->assertIsArray($state);
        $this->assertSame('talos_browser_restart_probe_v1', $state['schema_version'] ?? null);
        foreach (['worker_instance_id', 'owner_ref', 'worker_session_id', 'result_sha256'] as $field) {
            $this->assertIsString($state[$field] ?? null);
            $this->assertNotSame('', $state[$field]);
        }
        $this->assertMatchesRegularExpression('/^sha256:[a-f0-9]{64}$/', $state['result_sha256']);
        $this->assertIsArray($state['command'] ?? null);
        $this->assertIsString($state['command']['command_id'] ?? null);

        /** @var array{worker_instance_id: string, owner_ref: string, worker_session_id: string, command: array<string, mixed>} $state */
        return $state;
    }

    /** @param array<string, mixed> $command */
    private function authorization(string $commandId, array $command): BrowserActionAuthorization
    {
        return BrowserActionAuthorization::userApproval(
            $commandId,
            (string) Str::uuid(),
            'sha256:'.hash('sha256', json_encode($command, JSON_THROW_ON_ERROR)),
            'live-restart-execution-lease-'.bin2hex(random_bytes(16)),
        );
    }

    private function client(): HttpBrowserSessionClient
    {
        $baseUrl = trim((string) getenv('TALOS_LIVE_BROWSER_WORKER_URL'));
        $token = trim((string) getenv('TALOS_LIVE_BROWSER_WORKER_TOKEN'));
        $privateKey = trim((string) getenv('TALOS_BROWSER_ACTION_PRIVATE_KEY_B64'));
        $keyId = trim((string) getenv('TALOS_BROWSER_ACTION_KEY_ID'));
        foreach ([$baseUrl, $token, $privateKey, $keyId] as $configured) {
            $this->assertNotSame('', $configured);
        }

        return new HttpBrowserSessionClient(
            $baseUrl,
            $token,
            20,
            new TalosBrowserActionCapabilityIssuer($privateKey, $keyId),
        );
    }
}
