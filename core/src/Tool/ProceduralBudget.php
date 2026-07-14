<?php

declare(strict_types=1);

namespace Kadmos\Tool;

use InvalidArgumentException;

final readonly class ProceduralBudget
{
    public function __construct(
        public int $maxCalls = 16,
        public int $maxNavigations = 4,
        public int $maxScreenshots = 4,
        public int $maxEvidenceNodes = 16,
        public int $maxElapsedMilliseconds = 120_000,
        public int $maxInputTokens = 131_072,
        public int $maxOutputTokens = 65_536,
        public int $maxCostMicros = 5_000_000,
    ) {
        foreach (get_object_vars($this) as $name => $value) {
            ToolContractGuard::jsonSafeNonNegativeInteger($value, sprintf('Procedural budget %s', $name));
        }
        if ($maxCalls > 1024 || $maxNavigations > 1024 || $maxScreenshots > 1024 || $maxEvidenceNodes > 1024) {
            throw new InvalidArgumentException('Procedural node-count budgets cannot exceed 1024.');
        }
    }

    /**
     * @param list<ToolCall> $calls
     * @param array<string, ProceduralToolSpec> $registry
     * @return array{code: string, message: string}|null
     */
    public function violation(array $calls, array $registry, ?ProceduralUsage $usage = null): ?array
    {
        $usage ??= new ProceduralUsage;
        foreach ($calls as $call) {
            if (! $call instanceof ToolCall) {
                return ['code' => 'TALOS_TOOL_CALL_INVALID', 'message' => 'Procedural tool calls must be typed before budget evaluation.'];
            }
        }

        if ($usage->calls + count($calls) > $this->maxCalls) {
            return ['code' => 'TALOS_TOOL_CALL_BUDGET_EXHAUSTED', 'message' => 'The procedural call budget was exhausted.'];
        }

        $navigations = 0;
        $screenshots = 0;
        $evidenceNodes = 0;
        foreach ($calls as $call) {
            $navigations += $call->name === 'browser_navigate' ? 1 : 0;
            $screenshots += $call->name === 'browser_take_screenshot' ? 1 : 0;
            $evidenceNodes += ($registry[$call->name] ?? null)?->producesEvidence === true ? 1 : 0;
        }

        return match (true) {
            $usage->navigations + $navigations > $this->maxNavigations => ['code' => 'TALOS_TOOL_NAVIGATION_BUDGET_EXHAUSTED', 'message' => 'The navigation budget was exhausted.'],
            $usage->screenshots + $screenshots > $this->maxScreenshots => ['code' => 'TALOS_TOOL_SCREENSHOT_BUDGET_EXHAUSTED', 'message' => 'The screenshot budget was exhausted.'],
            $usage->evidenceNodes + $evidenceNodes > $this->maxEvidenceNodes => ['code' => 'TALOS_TOOL_EVIDENCE_BUDGET_EXHAUSTED', 'message' => 'The evidence-node budget was exhausted.'],
            $calls !== [] && $usage->elapsedMilliseconds >= $this->maxElapsedMilliseconds => ['code' => 'TALOS_TOOL_TIME_BUDGET_EXHAUSTED', 'message' => 'The procedural time budget was exhausted.'],
            $calls !== [] && $usage->inputTokens >= $this->maxInputTokens => ['code' => 'TALOS_TOOL_INPUT_TOKEN_BUDGET_EXHAUSTED', 'message' => 'The provider input-token budget was exhausted.'],
            $calls !== [] && $usage->outputTokens >= $this->maxOutputTokens => ['code' => 'TALOS_TOOL_OUTPUT_TOKEN_BUDGET_EXHAUSTED', 'message' => 'The provider output-token budget was exhausted.'],
            $calls !== [] && $usage->costMicros >= $this->maxCostMicros => ['code' => 'TALOS_TOOL_COST_BUDGET_EXHAUSTED', 'message' => 'The provider cost budget was exhausted.'],
            default => null,
        };
    }
}
