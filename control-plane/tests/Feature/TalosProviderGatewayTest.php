<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\TalosModelProfile;
use App\Models\TalosRun;
use App\Models\TalosSession;
use App\Models\TalosToolTurn;
use App\Models\User;
use App\Services\Talos\Agent\TalosProviderAdapterResolver;
use App\Services\Talos\Agent\TalosCoreProviderAdapterResolver;
use App\Services\Talos\Agent\TalosDagCheckpointCodec;
use App\Services\Talos\Agent\TalosProviderGateway;
use App\Services\Talos\Agent\TalosProviderStateCodec;
use App\Services\Talos\Agent\TalosProviderOutcomeCodec;
use App\Services\Talos\Agent\TalosProviderRecoveryRequiredException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;
use Kadmos\Provider\ProviderCapabilities;
use Kadmos\Provider\ProviderTurnAdapterFactory;
use Kadmos\Provider\ProviderTurnAdapter;
use Kadmos\Security\ExecutionPolicy;
use Kadmos\Tool\ProviderTurnRequest;
use Kadmos\Tool\ProviderTurnResponse;
use Kadmos\Tool\ProviderTurnState;
use Kadmos\Tool\TokenUsage;
use Kadmos\Tool\ToolCall;
use Kadmos\Tool\ToolDefinition;
use Kadmos\Tool\ToolResult;
use Tests\TestCase;
use stdClass;

final class TalosProviderGatewayTest extends TestCase
{
    use RefreshDatabase;

    public function test_start_checkpoints_native_state_and_continue_reconstructs_it_from_db(): void
    {
        $user = User::factory()->create();
        [$turn, $profile] = $this->turnContext($user, 'fake_v1');
        $adapter = new FakeProviderTurnAdapter;
        $resolver = new FakeProviderAdapterResolver($adapter);
        $gateway = new TalosProviderGateway($resolver);

        $started = $gateway->start($user->id, $turn, $profile, $this->request());

        self::assertSame(ProviderTurnResponse::TOOL_CALLS, $started->kind);
        self::assertSame('awaiting_tool_results', $turn->refresh()->status);
        self::assertSame(['provider-call-1'], $turn->pending_tool_call_ids);
        self::assertSame('response-1', $turn->provider_response_id);
        self::assertSame('sha256:'.hash('sha256', TalosProviderStateCodec::encode([
            'opaque' => 'checkpoint-value',
            'empty_object' => new stdClass,
        ])), $turn->provider_state_sha256);
        self::assertStringNotContainsString(
            'checkpoint-value',
            (string) DB::table('talos_tool_turns')->where('id', $turn->id)->value('provider_state'),
        );
        self::assertArrayNotHasKey('opaque', $started->state?->toAuditArray() ?? []);
        $storedOutcome = TalosProviderOutcomeCodec::decode((string) $turn->provider_outcome);
        self::assertSame(ProviderTurnResponse::TOOL_CALLS, $storedOutcome['kind']);
        self::assertSame('provider-call-1', $storedOutcome['tool_calls'][0]['provider_call_id']);
        self::assertStringNotContainsString(
            'provider-call-1',
            (string) DB::table('talos_tool_turns')->where('id', $turn->id)->value('provider_outcome'),
        );

        $finished = $gateway->continue($user->id, $turn->id, [
            new ToolResult(
                toolUseId: 'provider-call-1',
                isError: false,
                content: [['type' => 'text', 'text' => 'done']],
                structuredContent: null,
                evidence: [],
            ),
        ]);

        self::assertSame(ProviderTurnResponse::FINAL, $finished->kind);
        self::assertSame(['checkpoint-value'], $adapter->continuedNativeValues);
        self::assertTrue($adapter->continuedEmptyObjectPreserved);
        self::assertSame('provider-secret', $resolver->receivedSecret);
        $turn->refresh();
        self::assertSame('completed', $turn->status);
        self::assertSame([], $turn->pending_tool_call_ids);
        self::assertNull($turn->provider_state);
        self::assertNull($turn->provider_state_sha256);
        self::assertNull($turn->continuation_kind);
        self::assertSame('response-final', $turn->provider_response_id);
        self::assertSame('Continued.', TalosProviderOutcomeCodec::decode((string) $turn->provider_outcome)['text']);
        self::assertSame('completed', $turn->provider_operation_status);
    }

    public function test_terminal_provider_outcomes_clear_an_existing_checkpoint(): void
    {
        foreach ([
            ProviderTurnResponse::REFUSAL => 'refused',
            ProviderTurnResponse::FAILURE => 'failed',
        ] as $kind => $status) {
            $user = User::factory()->create();
            [$turn, $profile] = $this->turnContext($user, 'fake_v1');
            $adapter = new FakeProviderTurnAdapter($kind);
            $gateway = new TalosProviderGateway(new FakeProviderAdapterResolver($adapter));

            $gateway->start($user->id, $turn, $profile, $this->request());
            $turn->refresh();

            self::assertSame($status, $turn->status);
            self::assertNull($turn->provider_state);
            self::assertSame([], $turn->pending_tool_call_ids);
            self::assertNull($turn->provider_state_sha256);
            self::assertNull($turn->continuation_kind);
        }
    }

    public function test_completed_provider_start_is_replayed_from_its_checkpoint_without_network_reexecution(): void
    {
        $user = User::factory()->create();
        [$turn, $profile] = $this->turnContext($user, 'fake_v1');
        $adapter = new FakeProviderTurnAdapter(ProviderTurnResponse::FINAL);
        $gateway = new TalosProviderGateway(new FakeProviderAdapterResolver($adapter));

        $first = $gateway->start($user->id, $turn, $profile, $this->request());
        $second = $gateway->start($user->id, $turn->refresh(), $profile, $this->request());

        self::assertSame(ProviderTurnResponse::FINAL, $first->kind);
        self::assertSame($first->kind, $second->kind);
        self::assertSame($first->text, $second->text);
        self::assertSame($first->responseId, $second->responseId);
        self::assertSame(1, $adapter->startCalls);
        self::assertSame('completed', $turn->refresh()->provider_operation_status);
    }

    public function test_completed_provider_checkpoint_replays_expanded_nullable_cache_usage(): void
    {
        $user = User::factory()->create();
        [$turn, $profile] = $this->turnContext($user, 'fake_v1');
        $usage = new TokenUsage(
            inputTokens: 120,
            outputTokens: 10,
            totalTokens: 130,
            cachedTokens: 80,
            cacheReadTokens: 80,
            cacheWriteTokens: 30,
            cacheMissTokens: 10,
            cacheWrite5mTokens: 20,
            cacheWrite1hTokens: 10,
        );
        $adapter = new FakeProviderTurnAdapter(
            terminalKind: ProviderTurnResponse::FINAL,
            responseUsage: $usage,
        );
        $gateway = new TalosProviderGateway(new FakeProviderAdapterResolver($adapter));

        $first = $gateway->start($user->id, $turn, $profile, $this->request());
        $replayed = $gateway->start($user->id, $turn->refresh(), $profile, $this->request());

        self::assertSame($usage->toArray(), $first->usage?->toArray());
        self::assertSame($usage->toArray(), $replayed->usage?->toArray());
        self::assertSame(1, $adapter->startCalls);
    }

    public function test_malformed_completed_tool_call_checkpoint_fails_as_controlled_recovery_without_reexecution(): void
    {
        $user = User::factory()->create();
        [$turn, $profile] = $this->turnContext($user, 'fake_v1');
        $adapter = new FakeProviderTurnAdapter;
        $gateway = new TalosProviderGateway(new FakeProviderAdapterResolver($adapter));
        $gateway->start($user->id, $turn, $profile, $this->request());
        $malformed = TalosDagCheckpointCodec::encode([
            'kind' => ProviderTurnResponse::TOOL_CALLS,
            'text' => null,
            'tool_calls' => ['not-a-canonical-tool-call'],
            'response_id' => 'response-1',
            'stop_reason' => 'tool_calls',
            'usage' => null,
            'failure' => null,
        ]);
        $turn->forceFill([
            'provider_outcome' => $malformed,
            'provider_outcome_sha256' => 'sha256:'.hash('sha256', $malformed),
        ])->save();

        try {
            $gateway->start($user->id, $turn->refresh(), $profile, $this->request());
            self::fail('Malformed completed provider tool calls escaped controlled recovery.');
        } catch (TalosProviderRecoveryRequiredException $exception) {
            self::assertSame('TALOS_PROVIDER_RECOVERY_REQUIRED', $exception->faultCode);
        }

        self::assertSame(1, $adapter->startCalls);
    }

    public function test_malformed_completed_usage_checkpoint_fails_as_controlled_recovery_without_reexecution(): void
    {
        $user = User::factory()->create();
        [$turn, $profile] = $this->turnContext($user, 'fake_v1');
        $adapter = new FakeProviderTurnAdapter(ProviderTurnResponse::FINAL);
        $gateway = new TalosProviderGateway(new FakeProviderAdapterResolver($adapter));
        $gateway->start($user->id, $turn, $profile, $this->request());
        $malformed = TalosDagCheckpointCodec::encode([
            'kind' => ProviderTurnResponse::FINAL,
            'text' => 'Final.',
            'tool_calls' => [],
            'response_id' => 'response-final',
            'stop_reason' => 'stop',
            'usage' => [
                'input_tokens' => 10,
                'output_tokens' => 2,
                'total_tokens' => 12,
                'cached_tokens' => 0,
                'cache_read_tokens' => 'not-an-integer',
            ],
            'failure' => null,
            'visible_reasoning' => null,
        ]);
        $turn->forceFill([
            'provider_outcome' => $malformed,
            'provider_outcome_sha256' => 'sha256:'.hash('sha256', $malformed),
        ])->save();

        try {
            $gateway->start($user->id, $turn->refresh(), $profile, $this->request());
            self::fail('Malformed provider usage escaped controlled recovery.');
        } catch (TalosProviderRecoveryRequiredException $exception) {
            self::assertSame('TALOS_PROVIDER_RECOVERY_REQUIRED', $exception->faultCode);
        }

        self::assertSame(1, $adapter->startCalls);
    }

    public function test_gateway_rejects_cross_owner_without_calling_provider(): void
    {
        $owner = User::factory()->create();
        $other = User::factory()->create();
        [$turn, $profile] = $this->turnContext($owner, 'fake_v1');
        $adapter = new FakeProviderTurnAdapter;
        $resolver = new FakeProviderAdapterResolver($adapter);
        $gateway = new TalosProviderGateway($resolver);

        try {
            $gateway->start($other->id, $turn, $profile, $this->request());
            self::fail('Expected cross-owner access to be rejected.');
        } catch (InvalidArgumentException) {
            self::assertSame(0, $adapter->startCalls);
        }
    }

    public function test_gateway_rejects_adapter_version_mismatch_without_calling_provider(): void
    {
        $owner = User::factory()->create();
        [$turn, $profile] = $this->turnContext($owner, 'old_adapter_v0');
        $adapter = new FakeProviderTurnAdapter;
        $gateway = new TalosProviderGateway(new FakeProviderAdapterResolver($adapter));

        $this->expectException(InvalidArgumentException::class);
        $gateway->start($owner->id, $turn, $profile, $this->request());
    }

    public function test_an_unresolved_provider_operation_is_not_replayed_after_a_crash(): void
    {
        $owner = User::factory()->create();
        [$turn, $profile] = $this->turnContext($owner, 'fake_v1');
        $turn->forceFill([
            'provider_operation_key' => 'sha256:'.hash('sha256', 'provider-operation'),
            'provider_operation_hash' => 'sha256:'.hash('sha256', 'provider-payload'),
            'provider_operation_status' => 'in_flight',
        ])->save();
        $adapter = new FakeProviderTurnAdapter;
        $gateway = new TalosProviderGateway(new FakeProviderAdapterResolver($adapter));

        try {
            $gateway->start($owner->id, $turn, $profile, $this->request());
            self::fail('Expected an uncertain provider operation to require recovery.');
        } catch (TalosProviderRecoveryRequiredException $exception) {
            self::assertSame('TALOS_PROVIDER_RECOVERY_REQUIRED', $exception->faultCode);
        }

        self::assertSame(0, $adapter->startCalls);
        self::assertNull($turn->refresh()->provider_outcome);
    }

    public function test_uncertain_start_exception_requires_recovery_and_is_not_replayed(): void
    {
        $owner = User::factory()->create();
        [$turn, $profile] = $this->turnContext($owner, 'fake_v1');
        $adapter = new FakeProviderTurnAdapter(throwOnStart: true);
        $gateway = new TalosProviderGateway(new FakeProviderAdapterResolver($adapter));

        foreach ([1, 2] as $attempt) {
            try {
                $gateway->start($owner->id, $turn->refresh(), $profile, $this->request());
                self::fail('Expected an uncertain provider start to require recovery.');
            } catch (TalosProviderRecoveryRequiredException $exception) {
                self::assertSame('TALOS_PROVIDER_RECOVERY_REQUIRED', $exception->faultCode);
            }

            self::assertSame(1, $adapter->startCalls, "attempt {$attempt}");
            self::assertSame('recovery_required', $turn->refresh()->status, "attempt {$attempt}");
            self::assertSame('recovery_required', $turn->provider_operation_status, "attempt {$attempt}");
            self::assertNull($turn->provider_outcome, "attempt {$attempt}");
        }
    }

    public function test_uncertain_continue_exception_preserves_checkpoint_and_is_not_replayed(): void
    {
        $owner = User::factory()->create();
        [$turn, $profile] = $this->turnContext($owner, 'fake_v1');
        $adapter = new FakeProviderTurnAdapter(throwOnContinue: true);
        $gateway = new TalosProviderGateway(new FakeProviderAdapterResolver($adapter));
        $gateway->start($owner->id, $turn, $profile, $this->request());
        $checkpointHash = $turn->refresh()->provider_state_sha256;
        $results = [$this->toolResult('provider-call-1')];

        foreach ([1, 2] as $attempt) {
            try {
                $gateway->continue($owner->id, (string) $turn->id, $results);
                self::fail('Expected an uncertain provider continuation to require recovery.');
            } catch (TalosProviderRecoveryRequiredException $exception) {
                self::assertSame('TALOS_PROVIDER_RECOVERY_REQUIRED', $exception->faultCode);
            }

            self::assertSame(1, $adapter->continueCalls, "attempt {$attempt}");
            self::assertSame('recovery_required', $turn->refresh()->status, "attempt {$attempt}");
            self::assertSame('recovery_required', $turn->provider_operation_status, "attempt {$attempt}");
            self::assertSame($checkpointHash, $turn->provider_state_sha256, "attempt {$attempt}");
        }
    }

    public function test_continue_rejects_results_that_do_not_exactly_match_pending_provider_calls(): void
    {
        foreach ([
            'missing' => [],
            'foreign' => [$this->toolResult('provider-call-1'), $this->toolResult('provider-call-foreign')],
            'duplicate' => [$this->toolResult('provider-call-1'), $this->toolResult('provider-call-1')],
            'reordered' => [$this->toolResult('provider-call-2'), $this->toolResult('provider-call-1')],
        ] as $case => $results) {
            $user = User::factory()->create();
            [$turn, $profile] = $this->turnContext($user, 'fake_v1');
            $adapter = new FakeProviderTurnAdapter;
            $gateway = new TalosProviderGateway(new FakeProviderAdapterResolver($adapter));
            $gateway->start($user->id, $turn, $profile, $this->request());
            if ($case === 'reordered') {
                $turn->forceFill(['pending_tool_call_ids' => ['provider-call-1', 'provider-call-2']])->save();
            }
            $checkpointHash = $turn->refresh()->provider_state_sha256;

            try {
                $gateway->continue($user->id, (string) $turn->id, $results);
                self::fail("Expected {$case} tool results to be rejected.");
            } catch (InvalidArgumentException $exception) {
                self::assertSame('Provider tool results do not match the pending provider calls.', $exception->getMessage());
            }

            $turn->refresh();
            self::assertSame([], $adapter->continuedNativeValues, $case);
            self::assertSame('awaiting_tool_results', $turn->status, $case);
            self::assertSame($checkpointHash, $turn->provider_state_sha256, $case);
        }
    }

    public function test_core_resolver_selects_provider_protocols_without_network_access(): void
    {
        $policy = new ExecutionPolicy(allowedHosts: ['provider.test'], maxTimeoutMs: 60000);
        $resolver = new TalosCoreProviderAdapterResolver(new ProviderTurnAdapterFactory, $policy);

        $openAi = new TalosModelProfile([
            'provider' => 'openai',
            'model' => 'gpt-test',
            'base_url' => 'https://provider.test/v1',
            'capabilities' => ['protocol' => 'responses'],
            'timeout_seconds' => 30,
        ]);
        $anthropic = new TalosModelProfile([
            'provider' => 'anthropic',
            'model' => 'claude-test',
            'base_url' => 'https://provider.test/v1',
            'timeout_seconds' => 30,
        ]);
        $gemini = new TalosModelProfile([
            'provider' => 'gemini',
            'model' => 'gemini-test',
            'base_url' => 'https://provider.test/v1beta',
            'timeout_seconds' => 30,
        ]);

        self::assertSame('openai_responses_v1', $resolver->resolve($openAi, 'secret')->capabilities()->adapterVersion);
        self::assertSame('anthropic_messages_v1', $resolver->resolve($anthropic, 'secret')->capabilities()->adapterVersion);
        self::assertSame('gemini_generate_content_v1beta', $resolver->resolve($gemini, 'secret')->capabilities()->adapterVersion);
    }

    public function test_secret_decryption_failures_are_controlled_without_secret_material_in_error(): void
    {
        $user = User::factory()->create();
        [$turn, $profile] = $this->turnContext($user, 'fake_v1');
        $ciphertext = 'malformed-provider-ciphertext';
        $profile->forceFill(['encrypted_secret' => $ciphertext])->save();
        $gateway = new TalosProviderGateway(new FakeProviderAdapterResolver(new FakeProviderTurnAdapter));

        try {
            $gateway->start($user->id, $turn, $profile, $this->request());
            self::fail('Expected secret decryption to fail.');
        } catch (InvalidArgumentException $exception) {
            self::assertStringNotContainsString($ciphertext, $exception->getMessage());
        }
    }

    /** @return array{TalosToolTurn, TalosModelProfile} */
    private function turnContext(User $user, string $adapterVersion): array
    {
        $session = TalosSession::query()->create([
            'user_id' => $user->id,
            'title' => 'Provider gateway',
            'mode' => 'verified_execution',
            'surface' => 'chat',
        ]);
        $run = TalosRun::query()->create([
            'user_id' => $user->id,
            'session_id' => $session->id,
            'mode' => 'verified_execution',
            'status' => 'running',
            'prompt_hash' => hash('sha256', 'Provider gateway'),
            'prompt' => 'Provider gateway',
            'provider' => 'openai',
            'model' => 'gpt-test',
            'metadata' => [],
            'started_at' => now(),
        ]);
        $profile = TalosModelProfile::query()->create([
            'user_id' => $user->id,
            'provider' => 'openai',
            'model' => 'gpt-test',
            'display_name' => 'Fake provider',
            'status' => 'healthy',
            'encrypted_secret' => Crypt::encryptString('provider-secret'),
            'base_url' => 'https://api.openai.com/v1',
        ]);
        $turn = TalosToolTurn::query()->create([
            'user_id' => $user->id,
            'session_id' => $session->id,
            'run_id' => $run->id,
            'model_profile_id' => $profile->id,
            'status' => 'running',
            'provider' => 'openai',
            'model' => 'gpt-test',
            'adapter_version' => $adapterVersion,
            'pending_tool_call_ids' => [],
            'budget_policy' => [],
            'budget_usage' => [],
            'started_at' => now(),
        ]);

        return [$turn, $profile];
    }

    private function request(): ProviderTurnRequest
    {
        return new ProviderTurnRequest(
            provider: 'openai',
            model: 'gpt-test',
            systemPrompt: 'Be precise.',
            messages: [['role' => 'user', 'content' => 'Continue.']],
            tools: [ToolDefinition::fromArray([
                'name' => 'lookup',
                'description' => 'Lookup data.',
                'inputSchema' => ['type' => 'object', 'properties' => [], 'additionalProperties' => false],
            ])],
        );
    }

    private function toolResult(string $providerCallId): ToolResult
    {
        return new ToolResult(
            toolUseId: $providerCallId,
            isError: false,
            content: [['type' => 'text', 'text' => 'done']],
            structuredContent: null,
            evidence: [],
        );
    }
}

final class FakeProviderAdapterResolver implements TalosProviderAdapterResolver
{
    public string $receivedSecret = '';

    public function __construct(private readonly ProviderTurnAdapter $adapter) {}

    public function resolve(TalosModelProfile $profile, string $decryptedSecret): ProviderTurnAdapter
    {
        $this->receivedSecret = $decryptedSecret;

        return $this->adapter;
    }
}

final class FakeProviderTurnAdapter implements ProviderTurnAdapter
{
    public int $startCalls = 0;

    public int $continueCalls = 0;

    /** @var list<string> */
    public array $continuedNativeValues = [];

    public bool $continuedEmptyObjectPreserved = false;

    public function __construct(
        private readonly string $terminalKind = ProviderTurnResponse::TOOL_CALLS,
        private readonly bool $throwOnStart = false,
        private readonly bool $throwOnContinue = false,
        private readonly ?TokenUsage $responseUsage = null,
    ) {}

    public function capabilities(): ProviderCapabilities
    {
        return new ProviderCapabilities(
            provider: 'openai',
            adapterVersion: 'fake_v1',
            nativeTools: true,
            parallelToolCalls: false,
            strictSchemas: true,
            statefulContinuation: true,
            reasoningContinuationState: true,
            imageToolResults: false,
            source: 'test',
        );
    }

    public function start(ProviderTurnRequest $request): ProviderTurnResponse
    {
        $this->startCalls++;
        if ($this->throwOnStart) {
            throw new \RuntimeException('Provider transport ended without a correlated response.');
        }
        if ($this->terminalKind === ProviderTurnResponse::REFUSAL) {
            return ProviderTurnResponse::refusal('Refused.', 'response-refusal', 'refusal', $this->responseUsage ?? new TokenUsage(0, 0, 0));
        }
        if ($this->terminalKind === ProviderTurnResponse::FAILURE) {
            return ProviderTurnResponse::failure(new \Kadmos\Provider\ProviderFailure(
                code: 'FAKE_FAILURE',
                message: 'Provider failed.',
                retryable: false,
            ), 'response-failure');
        }
        if ($this->terminalKind === ProviderTurnResponse::FINAL) {
            return ProviderTurnResponse::final('Final.', 'response-final', 'stop', $this->responseUsage ?? new TokenUsage(0, 0, 0));
        }

        return ProviderTurnResponse::toolCalls(
            'Working.',
            [ToolCall::fromArray([
                'schema_version' => ToolCall::SCHEMA_VERSION,
                'provider_call_id' => 'provider-call-1',
                'name' => 'lookup',
                'arguments' => [],
                'assistant_preamble' => 'Working.',
                'provider_metadata' => [],
            ])],
            new ProviderTurnState(
                provider: 'openai',
                adapterVersion: 'fake_v1',
                responseId: 'response-1',
                continuationKind: 'fake_continuation',
                nativeState: ['opaque' => 'checkpoint-value', 'empty_object' => new stdClass],
                pendingToolCallIds: ['provider-call-1'],
            ),
            'response-1',
            'tool_calls',
            $this->responseUsage ?? new TokenUsage(0, 0, 0),
        );
    }

    public function continue(ProviderTurnState $state, array $toolResults): ProviderTurnResponse
    {
        $this->continueCalls++;
        if ($this->throwOnContinue) {
            throw new \RuntimeException('Provider continuation ended without a correlated response.');
        }
        $nativeState = $state->nativeStateFor('fake_v1');
        $this->continuedNativeValues[] = (string) $nativeState['opaque'];
        $this->continuedEmptyObjectPreserved = ($nativeState['empty_object'] ?? null) instanceof stdClass;

        return ProviderTurnResponse::final('Continued.', 'response-final', 'stop', new TokenUsage(0, 0, 0));
    }
}
