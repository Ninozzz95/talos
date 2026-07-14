<?php

declare(strict_types=1);

namespace App\Services\Talos\Agent;

use InvalidArgumentException;
use Kadmos\Tool\ProviderTurnResponse;
use Kadmos\Tool\ToolCall;

final class TalosProviderOutcomeCodec
{
    public static function encode(ProviderTurnResponse $response): string
    {
        return TalosDagCheckpointCodec::encode([
            'kind' => $response->kind,
            'text' => $response->text,
            'tool_calls' => array_map(static fn (ToolCall $call): array => $call->toWireArray(), $response->toolCalls),
            'response_id' => $response->responseId,
            'stop_reason' => $response->stopReason,
            'usage' => $response->usage?->toArray(),
            'failure' => $response->failure?->toArray(),
        ]);
    }

    /** @return array<string, mixed> */
    public static function decode(string $encoded): array
    {
        $outcome = TalosDagCheckpointCodec::decode($encoded);
        if (! is_string($outcome['kind'] ?? null)
            || ! in_array($outcome['kind'], [
                ProviderTurnResponse::FINAL,
                ProviderTurnResponse::TOOL_CALLS,
                ProviderTurnResponse::REFUSAL,
                ProviderTurnResponse::INCOMPLETE,
                ProviderTurnResponse::FAILURE,
            ], true)
            || ! is_array($outcome['tool_calls'] ?? null)
            || ! array_is_list($outcome['tool_calls'])) {
            throw new InvalidArgumentException('Provider outcome checkpoint is invalid.');
        }

        return $outcome;
    }
}
