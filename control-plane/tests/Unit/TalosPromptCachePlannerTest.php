<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Models\TalosModelProfile;
use App\Services\Talos\Agent\TalosPromptCachePlanner;
use Kadmos\Provider\PromptCachePlan;
use Kadmos\Tool\ToolDefinition;
use PHPUnit\Framework\TestCase;

final class TalosPromptCachePlannerTest extends TestCase
{
    public function test_unknown_provider_or_model_has_no_cache_plan(): void
    {
        self::assertNull($this->planner()->plan(
            $this->profile('openrouter', 'openai/gpt-5.6'),
            ['prompt_cache' => ['mode' => 'automatic', 'ttl' => null]],
            'Stable system.',
            [['role' => 'user', 'content' => 'Hello.']],
            [],
        ));
    }

    public function test_default_automatic_plan_uses_only_supported_breakpoints_and_stable_identity(): void
    {
        $planner = $this->planner();
        $profile = $this->profile('openai', 'gpt-5.6');
        $first = $planner->plan(
            $profile,
            [],
            'Stable system.',
            [
                ['role' => 'user', 'content' => 'First prompt text.'],
                ['role' => 'assistant', 'content' => 'Prior answer.'],
            ],
            [$this->tool('lookup'), $this->tool('inspect')],
        );
        $second = $planner->plan(
            $profile,
            ['prompt_cache' => ['mode' => 'automatic', 'ttl' => null]],
            'Stable system.',
            [
                ['role' => 'user', 'content' => 'Completely different private text.'],
                ['role' => 'assistant', 'content' => 'Different answer.'],
            ],
            [$this->tool('inspect'), $this->tool('lookup')],
        );

        self::assertInstanceOf(PromptCachePlan::class, $first);
        self::assertInstanceOf(PromptCachePlan::class, $second);
        self::assertSame(PromptCachePlan::MODE_AUTOMATIC, $first->mode);
        self::assertSame([PromptCachePlan::BREAKPOINT_SYSTEM, 'message:1'], $first->breakpoints);
        self::assertNull($first->ttl);
        self::assertSame(1024, $first->minimumInputTokens);
        self::assertSame($first->keyHash, $second->keyHash);
        self::assertStringNotContainsString('private', $first->keyHash);
    }

    public function test_explicit_anthropic_plan_uses_bounded_breakpoints_and_supported_ttl(): void
    {
        $plan = $this->planner()->plan(
            $this->profile('anthropic', 'claude-sonnet-5'),
            ['prompt_cache' => ['mode' => 'explicit', 'ttl' => '1h']],
            'Stable system.',
            [
                ['role' => 'user', 'content' => 'A'],
                ['role' => 'assistant', 'content' => 'B'],
                ['role' => 'user', 'content' => 'C'],
            ],
            [$this->tool('lookup')],
        );

        self::assertInstanceOf(PromptCachePlan::class, $plan);
        self::assertSame(PromptCachePlan::MODE_EXPLICIT, $plan->mode);
        self::assertSame([
            PromptCachePlan::BREAKPOINT_TOOLS,
            PromptCachePlan::BREAKPOINT_SYSTEM,
            'message:2',
        ], $plan->breakpoints);
        self::assertSame('1h', $plan->ttl);
        self::assertSame(1024, $plan->minimumInputTokens);
    }

    public function test_unrepresentable_or_malformed_policy_falls_back_to_provider_default(): void
    {
        $unsupported = $this->planner()->plan(
            $this->profile('gemini', 'gemini-2.5-pro'),
            ['prompt_cache' => ['mode' => 'disabled', 'ttl' => '1h']],
            'Stable system.',
            [['role' => 'user', 'content' => 'Hello.']],
            [],
        );
        $malformed = $this->planner()->plan(
            $this->profile('deepseek', 'deepseek-chat'),
            ['prompt_cache' => ['mode' => ['automatic'], 'ttl' => 300]],
            'Stable system.',
            [['role' => 'user', 'content' => 'Hello.']],
            [],
        );

        self::assertInstanceOf(PromptCachePlan::class, $unsupported);
        self::assertSame(PromptCachePlan::MODE_PROVIDER_DEFAULT, $unsupported->mode);
        self::assertSame([], $unsupported->breakpoints);
        self::assertNull($unsupported->ttl);
        self::assertSame(2048, $unsupported->minimumInputTokens);

        self::assertInstanceOf(PromptCachePlan::class, $malformed);
        self::assertSame(PromptCachePlan::MODE_PROVIDER_DEFAULT, $malformed->mode);
        self::assertNull($malformed->minimumInputTokens);
    }

    public function test_supported_disabled_mode_emits_no_cache_write_policy(): void
    {
        $plan = $this->planner()->plan(
            $this->profile('anthropic', 'claude-opus-4-8'),
            ['prompt_cache' => ['mode' => 'disabled', 'ttl' => '1h']],
            'Stable system.',
            [['role' => 'user', 'content' => 'Hello.']],
            [$this->tool('lookup')],
        );

        self::assertInstanceOf(PromptCachePlan::class, $plan);
        self::assertSame(PromptCachePlan::MODE_DISABLED, $plan->mode);
        self::assertSame([], $plan->breakpoints);
        self::assertNull($plan->ttl);
        self::assertNull($plan->minimumInputTokens);
    }

    private function planner(): TalosPromptCachePlanner
    {
        return new TalosPromptCachePlanner();
    }

    private function profile(string $provider, string $model): TalosModelProfile
    {
        return (new TalosModelProfile())->forceFill([
            'provider' => $provider,
            'model' => $model,
        ]);
    }

    private function tool(string $name): ToolDefinition
    {
        return ToolDefinition::fromStrictArray([
            'name' => $name,
            'description' => ucfirst($name).' a resource.',
            'inputSchema' => [
                'type' => 'object',
                'properties' => [],
                'required' => [],
                'additionalProperties' => false,
            ],
        ]);
    }
}
