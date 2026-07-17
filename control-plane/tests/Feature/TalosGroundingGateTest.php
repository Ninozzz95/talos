<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\TalosBrowserAction;
use App\Models\TalosBrowserSession;
use App\Models\TalosMessage;
use App\Models\TalosRun;
use App\Models\TalosRunArtifact;
use App\Models\TalosSession;
use App\Models\TalosToolCall;
use App\Models\TalosToolResult;
use App\Models\TalosToolTurn;
use App\Models\User;
use App\Services\Talos\Agent\TalosGroundingException;
use App\Services\Talos\Agent\TalosGroundingGate;
use App\Services\Talos\Browser\TalosBrowserArtifactStore;
use App\Services\Talos\Browser\TalosBrowserEvidenceCommitRequest;
use App\Services\Talos\Browser\TalosBrowserEvidenceCommitService;
use App\Services\Talos\Browser\TalosBrowserEvidenceOutbox;
use App\Services\Talos\Browser\TalosBrowserTaskRuntime;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Kadmos\Tool\ProviderTurnResponse;
use Kadmos\Tool\ProceduralLoopGuard;
use Kadmos\Tool\TokenUsage;
use Kadmos\Tool\ToolResult as CanonicalToolResult;
use Tests\TestCase;

final class TalosGroundingGateTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $fake = Storage::fake('grounding-evidence-'.str()->uuid());
        Storage::set('local', $fake);
    }

    public function test_releases_a_final_answer_after_owned_web_evidence_is_persisted(): void
    {
        [$user, $turn] = $this->turnContext();
        $call = $this->toolCall($turn, $user, 'web_fetch');
        $artifact = TalosRunArtifact::query()->create([
            'run_id' => $turn->run_id,
            'artifact_type' => 'browser_snapshot',
            'uri' => 'talos-tool-evidence://snapshot-evidence-1',
            'mime_type' => 'application/json',
            'metadata' => ['sha256' => 'sha256:'.hash('sha256', 'snapshot'), 'trust' => 'untrusted'],
        ]);
        $evidence = [[
            'artifact_id' => (string) $artifact->id,
            'kind' => 'snapshot',
            'sha256' => 'sha256:'.hash('sha256', 'snapshot'),
            'trusted_boundary' => 'untrusted_web_content',
        ]];
        $this->toolResult($call, $turn, $user, false, $evidence);
        $response = ProviderTurnResponse::final('The page title is Example Domain.', 'response-final', 'stop', new TokenUsage(10, 8, 18));

        $text = app(TalosGroundingGate::class)->release($turn, $response);

        $this->assertSame('The page title is Example Domain.', $text);
    }

    public function test_releases_a_browser_grounded_answer_only_after_atomic_evidence_reconciliation(): void
    {
        $context = $this->browserEvidenceContext();
        $bundle = app(TalosBrowserEvidenceCommitService::class)->commit(
            $this->browserEvidenceCommitRequest($context),
        );
        app(TalosBrowserEvidenceOutbox::class)->resume((string) $bundle->id);

        $text = app(TalosGroundingGate::class)->release(
            $context['turn'],
            ProviderTurnResponse::final('The Browser observed Vehicles.', 'response-browser-final', 'stop', new TokenUsage(4, 4, 8)),
        );

        $this->assertSame('The Browser observed Vehicles.', $text);
    }

    public function test_staged_browser_evidence_cannot_ground_a_final_answer(): void
    {
        $context = $this->browserEvidenceContext();
        app(TalosBrowserEvidenceCommitService::class)->commit(
            $this->browserEvidenceCommitRequest($context),
        );

        try {
            app(TalosGroundingGate::class)->release(
                $context['turn'],
                ProviderTurnResponse::final('Unreconciled Browser claim.', 'response-browser-staged', 'stop', new TokenUsage(4, 4, 8)),
            );
            $this->fail('Staged Browser evidence must not ground provider prose.');
        } catch (TalosGroundingException $exception) {
            $this->assertSame('TALOS_GROUNDING_EVIDENCE_NOT_PERSISTED', $exception->faultCode);
        }
    }

    public function test_tampered_reconciled_browser_bytes_cannot_ground_a_final_answer(): void
    {
        $context = $this->browserEvidenceContext();
        $bundle = app(TalosBrowserEvidenceCommitService::class)->commit(
            $this->browserEvidenceCommitRequest($context),
        );
        app(TalosBrowserEvidenceOutbox::class)->resume((string) $bundle->id);
        Storage::disk('local')->put((string) $context['artifact']->storage_path, '{"tampered":true}');

        try {
            app(TalosGroundingGate::class)->release(
                $context['turn'],
                ProviderTurnResponse::final('Tampered Browser claim.', 'response-browser-tampered', 'stop', new TokenUsage(4, 4, 8)),
            );
            $this->fail('Tampered Browser bytes must not ground provider prose.');
        } catch (TalosGroundingException $exception) {
            $this->assertSame('TALOS_GROUNDING_EVIDENCE_INVALID', $exception->faultCode);
        }
    }

    public function test_matching_synthetic_evidence_ids_are_rejected_when_no_owned_artifact_exists(): void
    {
        [$user, $turn] = $this->turnContext();
        $call = $this->toolCall($turn, $user, 'web_search');
        $this->toolResult($call, $turn, $user, false, [[
            'artifact_id' => 'synthetic-evidence-id',
            'kind' => 'search_result',
            'sha256' => 'sha256:'.hash('sha256', 'synthetic'),
            'trusted_boundary' => 'untrusted_web_content',
        ]]);

        try {
            app(TalosGroundingGate::class)->release(
                $turn,
                ProviderTurnResponse::final('A fabricated current claim.', 'response-final', 'stop', new TokenUsage(1, 1, 2)),
            );
            $this->fail('Synthetic evidence IDs must never satisfy the grounding gate.');
        } catch (TalosGroundingException $exception) {
            $this->assertSame('TALOS_GROUNDING_EVIDENCE_NOT_PERSISTED', $exception->faultCode);
        }
    }

    public function test_evidence_artifact_from_another_run_is_rejected(): void
    {
        [$user, $turn] = $this->turnContext();
        [, $foreignTurn] = $this->turnContext();
        $foreignArtifact = TalosRunArtifact::query()->create([
            'run_id' => $foreignTurn->run_id,
            'artifact_type' => 'web_fetch',
            'uri' => 'talos-tool-evidence://foreign-run',
            'mime_type' => 'application/json',
            'metadata' => ['sha256' => 'sha256:'.hash('sha256', 'foreign-run'), 'trust' => 'untrusted'],
        ]);
        $call = $this->toolCall($turn, $user, 'web_fetch');
        $this->toolResult($call, $turn, $user, false, [[
            'artifact_id' => (string) $foreignArtifact->id,
            'kind' => 'web_fetch',
            'sha256' => 'sha256:'.hash('sha256', 'foreign-run'),
            'trusted_boundary' => 'untrusted_web_content',
        ]]);

        try {
            app(TalosGroundingGate::class)->release(
                $turn,
                ProviderTurnResponse::final('Foreign-run claim.', 'response-final', 'stop', new TokenUsage(1, 1, 2)),
            );
            $this->fail('Evidence from another run must fail closed.');
        } catch (TalosGroundingException $exception) {
            $this->assertSame('TALOS_GROUNDING_EVIDENCE_NOT_PERSISTED', $exception->faultCode);
        }
    }

    public function test_successful_web_tool_without_evidence_fails_closed(): void
    {
        [$user, $turn] = $this->turnContext();
        $call = $this->toolCall($turn, $user, 'web_fetch');
        $this->toolResult($call, $turn, $user, false, []);

        try {
            app(TalosGroundingGate::class)->release(
                $turn,
                ProviderTurnResponse::final('Unverified page claim.', 'response-final', 'stop', new TokenUsage(1, 1, 2)),
            );
            $this->fail('A web-grounded answer without evidence must fail closed.');
        } catch (TalosGroundingException $exception) {
            $this->assertSame('TALOS_GROUNDING_EVIDENCE_REQUIRED', $exception->faultCode);
        }
    }

    public function test_successful_browser_file_upload_without_evidence_fails_closed(): void
    {
        [$user, $turn] = $this->turnContext();
        $call = $this->toolCall($turn, $user, 'browser_file_upload');
        $this->toolResult($call, $turn, $user, false, []);

        try {
            app(TalosGroundingGate::class)->release(
                $turn,
                ProviderTurnResponse::final('The file was uploaded.', 'response-upload-final', 'stop', new TokenUsage(1, 1, 2)),
            );
            $this->fail('A Browser file upload without correlated evidence must fail closed.');
        } catch (TalosGroundingException $exception) {
            $this->assertSame('TALOS_GROUNDING_EVIDENCE_REQUIRED', $exception->faultCode);
        }
    }

    public function test_cross_owner_result_is_rejected_before_release(): void
    {
        [$owner, $turn] = $this->turnContext();
        $other = User::factory()->create();
        $call = $this->toolCall($turn, $owner, 'web_search');
        $this->toolResult($call, $turn, $other, false, [[
            'artifact_id' => 'foreign-evidence',
            'kind' => 'search_result',
            'sha256' => 'sha256:'.hash('sha256', 'foreign'),
            'trusted_boundary' => 'untrusted_web_content',
        ]]);

        try {
            app(TalosGroundingGate::class)->release(
                $turn,
                ProviderTurnResponse::final('Foreign claim.', 'response-final', 'stop', new TokenUsage(1, 1, 2)),
            );
            $this->fail('Cross-owner evidence must fail closed.');
        } catch (TalosGroundingException $exception) {
            $this->assertSame('TALOS_GROUNDING_OWNERSHIP_MISMATCH', $exception->faultCode);
        }
    }

    public function test_plain_final_answer_without_tool_calls_remains_supported(): void
    {
        [, $turn] = $this->turnContext();
        $response = ProviderTurnResponse::final('Ordinary chat answer.', 'response-final', 'stop', new TokenUsage(1, 1, 2));

        $this->assertSame('Ordinary chat answer.', app(TalosGroundingGate::class)->release($turn, $response));
    }

    public function test_talos_evidence_reference_without_tool_calls_fails_closed(): void
    {
        [, $turn] = $this->turnContext();
        $response = ProviderTurnResponse::final(
            '![Screenshot](https://talo.sh/artifact/019f6041-b3d6-7f8e-87f9-02110be8a48a)',
            'response-final',
            'stop',
            new TokenUsage(1, 1, 2),
        );

        try {
            app(TalosGroundingGate::class)->release($turn, $response);
            $this->fail('Uncorrelated TALOS evidence must never reach the transcript.');
        } catch (TalosGroundingException $exception) {
            $this->assertSame('TALOS_GROUNDING_EVIDENCE_REQUIRED', $exception->faultCode);
        }
    }

    public function test_talos_evidence_reference_must_match_the_current_tool_result(): void
    {
        [$user, $turn] = $this->turnContext();
        $call = $this->toolCall($turn, $user, 'web_fetch');
        $artifact = TalosRunArtifact::query()->create([
            'run_id' => $turn->run_id,
            'artifact_type' => 'web_fetch',
            'uri' => 'talos-tool-evidence://owned-evidence',
            'mime_type' => 'application/json',
            'metadata' => ['sha256' => 'sha256:'.hash('sha256', 'owned-evidence'), 'trust' => 'untrusted'],
        ]);
        $this->toolResult($call, $turn, $user, false, [[
            'artifact_id' => (string) $artifact->id,
            'kind' => 'snapshot',
            'sha256' => 'sha256:'.hash('sha256', 'owned-evidence'),
            'trusted_boundary' => 'untrusted_web_content',
        ]]);

        try {
            app(TalosGroundingGate::class)->release(
                $turn,
                ProviderTurnResponse::final(
                    '![Different artifact](https://talo.sh/artifact/019f6041-b3d6-7f8e-87f9-02110be8a48a)',
                    'response-final',
                    'stop',
                    new TokenUsage(1, 1, 2),
                ),
            );
            $this->fail('Provider prose must not substitute a different TALOS artifact identity.');
        } catch (TalosGroundingException $exception) {
            $this->assertSame('TALOS_GROUNDING_EVIDENCE_INVALID', $exception->faultCode);
        }
    }

    /** @return array{User, TalosToolTurn} */
    private function turnContext(): array
    {
        $user = User::factory()->create();
        $session = TalosSession::query()->create([
            'user_id' => $user->id,
            'title' => 'Grounding gate',
            'mode' => 'verified_execution',
            'surface' => 'chat',
        ]);
        $run = TalosRun::query()->create([
            'user_id' => $user->id,
            'session_id' => $session->id,
            'mode' => 'verified_execution',
            'status' => 'running',
            'prompt_hash' => hash('sha256', 'Inspect the page.'),
            'prompt' => 'Inspect the page.',
            'provider' => 'deepseek',
            'model' => 'deepseek-chat',
            'metadata' => [],
            'started_at' => now(),
        ]);
        $turn = TalosToolTurn::query()->create([
            'user_id' => $user->id,
            'session_id' => $session->id,
            'run_id' => $run->id,
            'status' => 'finalizing',
            'provider' => 'deepseek',
            'model' => 'deepseek-chat',
            'adapter_version' => 'openai_chat_v1',
            'pending_tool_call_ids' => [],
            'budget_policy' => ['max_calls' => 8],
            'budget_usage' => [],
            'started_at' => now(),
        ]);

        return [$user, $turn];
    }

    private function toolCall(TalosToolTurn $turn, User $user, string $toolName): TalosToolCall
    {
        return TalosToolCall::query()->create([
            'tool_turn_id' => $turn->id,
            'run_id' => $turn->run_id,
            'user_id' => $user->id,
            'sequence' => 1,
            'logical_call_id' => 'logical-1',
            'provider_call_id' => 'provider-call-1',
            'node_id' => 'node-1',
            'tool_name' => $toolName,
            'node_type' => 'TOOL_'.strtoupper($toolName),
            'arguments' => [],
            'arguments_sha256' => 'sha256:'.hash('sha256', '{}'),
            'dependencies' => [],
            'fingerprint' => 'sha256:'.hash('sha256', $toolName),
            'risk' => 'low',
            'capability' => 'web.read',
            'status' => 'succeeded',
            'attempt' => 0,
            'approval_state' => 'not_required',
        ]);
    }

    /** @param list<array<string, string>> $evidence */
    private function toolResult(TalosToolCall $call, TalosToolTurn $turn, User $user, bool $isError, array $evidence): TalosToolResult
    {
        return TalosToolResult::query()->create([
            'tool_call_id' => $call->id,
            'tool_turn_id' => $turn->id,
            'run_id' => $turn->run_id,
            'user_id' => $user->id,
            'provider_call_id' => $call->provider_call_id,
            'attempt' => 0,
            'status' => $isError ? 'failed' : 'succeeded',
            'is_error' => $isError,
            'canonical_result' => [
                'schema_version' => 'talos_tool_result_v1',
                'tool_use_id' => $call->provider_call_id,
                'isError' => $isError,
                'content' => [['type' => 'text', 'text' => $isError ? 'Failed.' : 'Observed.']],
                'structuredContent' => ['evidence_ids' => array_column($evidence, 'artifact_id')],
                'evidence' => $evidence,
            ],
            'evidence_ids' => array_column($evidence, 'artifact_id'),
        ]);
    }

    /** @return array{user: User, turn: TalosToolTurn, call: TalosToolCall, browser: TalosBrowserSession, action: TalosBrowserAction, artifact: \App\Models\TalosBrowserArtifact, result: CanonicalToolResult} */
    private function browserEvidenceContext(): array
    {
        [$user, $turn] = $this->turnContext();
        $browser = TalosBrowserSession::query()->create([
            'user_id' => $user->id,
            'talos_session_id' => $turn->session_id,
            'worker_session_id' => 'worker-grounding-'.str()->uuid(),
            'status' => 'active',
            'mode' => 'read_only',
            'current_url' => 'https://example.test/vehicles',
            'current_title' => 'Vehicles',
            'viewport_width' => 1280,
            'viewport_height' => 800,
            'capabilities' => ['navigation' => true, 'screenshots' => true, 'accessibilitySnapshot' => true],
            'policy' => [],
            'worker_state_version' => 1,
            'expires_at' => now()->addHour(),
        ]);
        $turn->forceFill(['browser_session_id' => $browser->id])->save();
        TalosMessage::query()->create([
            'session_id' => $turn->session_id,
            'run_id' => $turn->run_id,
            'role' => 'user',
            'content' => 'Inspect vehicles.',
        ]);
        $call = $this->toolCall($turn, $user, 'browser_snapshot');
        $call->forceFill([
            'logical_call_id' => 'logical-browser-grounding',
            'provider_call_id' => 'provider-browser-grounding',
            'risk' => 'read',
            'capability' => 'browser.snapshot',
            'effect_key' => 'sha256:'.hash('sha256', 'grounding-effect'),
            'effect_status' => 'completed',
        ])->save();
        $task = app(TalosBrowserTaskRuntime::class)->begin((int) $user->id, $turn->run, $browser);
        $action = TalosBrowserAction::query()->create([
            'schema_version' => 'talos.browser.action.v1',
            'task_id' => $task->id,
            'user_id' => $user->id,
            'talos_session_id' => $turn->session_id,
            'intent_id' => $call->logical_call_id,
            'sequence' => 1,
            'kind' => 'snapshot',
            'arguments' => [],
            'expected_state_version' => 1,
            'risk' => 'read',
            'idempotency_key' => $call->effect_key,
            'preconditions' => [],
            'status' => 'committed',
            'result_sha256' => 'sha256:'.hash('sha256', 'pending-result'),
            'requested_at' => now(),
            'approved_at' => now(),
            'started_at' => now(),
            'committed_at' => now(),
        ]);
        $artifact = app(TalosBrowserArtifactStore::class)->store(
            $browser,
            'snapshot',
            'application/json',
            json_encode([
                'format' => 'accessibility_refs_v1',
                'url' => 'https://example.test/vehicles',
                'title' => 'Vehicles',
                'textDigest' => hash('sha256', 'Vehicles'),
                'nodes' => [],
            ], JSON_THROW_ON_ERROR),
            ['format' => 'accessibility_refs_v1', 'text_digest' => hash('sha256', 'Vehicles'), 'node_count' => 0],
            ['trust_boundary' => 'untrusted_browser_content', 'state_version' => 1],
        );
        TalosRunArtifact::query()->create([
            'run_id' => $turn->run_id,
            'artifact_type' => 'browser_snapshot',
            'uri' => 'talos-browser-artifact://'.$artifact->id,
            'mime_type' => 'application/json',
            'metadata' => [
                'browser_artifact_id' => (string) $artifact->id,
                'browser_session_id' => (string) $browser->id,
                'tool_turn_id' => (string) $turn->id,
                'provider_call_id' => (string) $call->provider_call_id,
                'sha256' => (string) $artifact->sha256,
                'trust' => 'untrusted',
            ],
        ]);
        $evidence = [[
            'artifact_id' => (string) $artifact->id,
            'kind' => 'snapshot',
            'sha256' => 'sha256:'.$artifact->sha256,
            'trusted_boundary' => 'untrusted_browser_content',
        ]];
        $result = new CanonicalToolResult(
            toolUseId: (string) $call->provider_call_id,
            isError: false,
            content: [['type' => 'text', 'text' => '{"ok":true}']],
            structuredContent: ['ok' => true, 'evidence_ids' => [(string) $artifact->id]],
            evidence: $evidence,
        );
        $this->toolResult($call, $turn, $user, false, $evidence);

        return compact('user', 'turn', 'call', 'browser', 'action', 'artifact', 'result');
    }

    /** @param array{turn: TalosToolTurn, call: TalosToolCall, browser: TalosBrowserSession, action: TalosBrowserAction, result: CanonicalToolResult} $context */
    private function browserEvidenceCommitRequest(array $context): TalosBrowserEvidenceCommitRequest
    {
        $resultSha256 = 'sha256:'.hash('sha256', ProceduralLoopGuard::canonicalJson($context['result']->toWireArray()));
        $context['action']->forceFill(['result_sha256' => $resultSha256])->save();

        return new TalosBrowserEvidenceCommitRequest(
            task: $context['action']->task,
            action: $context['action'],
            call: $context['call'],
            result: $context['result'],
            browserSession: $context['browser'],
            resultSha256: $resultSha256,
        );
    }
}
