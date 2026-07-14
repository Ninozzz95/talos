<?php

declare(strict_types=1);

namespace Kadmos\Tool;

use InvalidArgumentException;
use Kadmos\Provider\ProviderFailure;

final readonly class ProviderTurnResponse
{
    public const FINAL = 'final';
    public const TOOL_CALLS = 'tool_calls';
    public const REFUSAL = 'refusal';
    public const INCOMPLETE = 'incomplete';
    public const FAILURE = 'failure';

    /** @param list<ToolCall> $toolCalls */
    private function __construct(
        public string $kind,
        public ?string $text,
        public array $toolCalls,
        public ?ProviderTurnState $state,
        public ?string $responseId,
        public ?string $stopReason,
        public ?TokenUsage $usage,
        public ?ProviderFailure $failure,
    ) {
        ToolContractGuard::listArray($toolCalls, 'Provider turn response tool calls');
        foreach ($toolCalls as $call) {
            if (! $call instanceof ToolCall) {
                throw new InvalidArgumentException('Provider turn response calls must be ToolCall values.');
            }
        }
        if ($kind === self::FINAL && ($text === null || trim($text) === '' || $toolCalls !== [] || $failure !== null)) {
            throw new InvalidArgumentException('Final provider outcomes require text and no calls or failure.');
        }
        if ($kind === self::TOOL_CALLS && ($toolCalls === [] || $state === null || $failure !== null)) {
            throw new InvalidArgumentException('Tool-call provider outcomes require calls and continuation state.');
        }
        if (in_array($kind, [self::REFUSAL, self::INCOMPLETE], true) && ($text === null || trim($text) === '' || $toolCalls !== [])) {
            throw new InvalidArgumentException('Controlled provider outcomes require explanatory text and no calls.');
        }
        if ($kind === self::FAILURE && ($failure === null || $toolCalls !== [])) {
            throw new InvalidArgumentException('Failure provider outcomes require a typed failure and no calls.');
        }
        if (! in_array($kind, [self::FINAL, self::TOOL_CALLS, self::REFUSAL, self::INCOMPLETE, self::FAILURE], true)) {
            throw new InvalidArgumentException('Provider turn response kind is unsupported.');
        }
    }

    public static function final(string $text, ?string $responseId, ?string $stopReason, TokenUsage $usage): self
    {
        return new self(self::FINAL, $text, [], null, $responseId, $stopReason, $usage, null);
    }

    /** @param list<ToolCall> $toolCalls */
    public static function toolCalls(?string $preamble, array $toolCalls, ProviderTurnState $state, ?string $responseId, ?string $stopReason, TokenUsage $usage): self
    {
        return new self(self::TOOL_CALLS, $preamble, $toolCalls, $state, $responseId, $stopReason, $usage, null);
    }

    public static function refusal(string $text, ?string $responseId, ?string $stopReason, TokenUsage $usage): self
    {
        return new self(self::REFUSAL, $text, [], null, $responseId, $stopReason, $usage, null);
    }

    public static function incomplete(string $text, ?string $responseId, ?string $stopReason, TokenUsage $usage): self
    {
        return new self(self::INCOMPLETE, $text, [], null, $responseId, $stopReason, $usage, null);
    }

    public static function failure(ProviderFailure $failure, ?string $responseId = null, ?string $stopReason = null, ?TokenUsage $usage = null): self
    {
        return new self(self::FAILURE, null, [], null, $responseId, $stopReason, $usage, $failure);
    }
}
