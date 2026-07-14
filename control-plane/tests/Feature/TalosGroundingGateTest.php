<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\TalosRun;
use App\Models\TalosRunArtifact;
use App\Models\TalosSession;
use App\Models\TalosToolCall;
use App\Models\TalosToolResult;
use App\Models\TalosToolTurn;
use App\Models\User;
use App\Services\Talos\Agent\TalosGroundingException;
use App\Services\Talos\Agent\TalosGroundingGate;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Kadmos\Tool\ProviderTurnResponse;
use Kadmos\Tool\TokenUsage;
use Tests\TestCase;

final class TalosGroundingGateTest extends TestCase
{
    use RefreshDatabase;

    public function test_releases_a_final_answer_only_after_owned_browser_evidence_is_persisted(): void
    {
        [$user, $turn] = $this->turnContext();
        $call = $this->toolCall($turn, $user, 'browser_snapshot');
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
}
