<?php

declare(strict_types=1);

namespace App\Services\Talos\Agent;

use InvalidArgumentException;
use Kadmos\Tool\ToolResult;

final class TalosToolRepairPolicy
{
    public const MAX_REPAIRS = 2;

    private const RECOVERABLE_CODES = [
        'TALOS_BROWSER_STALE_STATE',
        'TALOS_BROWSER_COMMAND_MALFORMED',
        'TALOS_TOOL_ARGUMENTS_INVALID',
        'TALOS_TOOL_RESULT_INVALID',
        'TALOS_PROVIDER_TOOL_CALL_MALFORMED',
        'TALOS_WEB_SEARCH_TRANSIENT_FAILURE',
        'TALOS_BROWSER_WORKER_TRANSIENT',
    ];

    public function shouldRepair(int $attempt, ToolResult $result): bool
    {
        if ($attempt < 0) {
            throw new InvalidArgumentException('Tool repair attempt cannot be negative.');
        }
        if (! $result->isError || $attempt >= self::MAX_REPAIRS) {
            return false;
        }

        $code = $result->structuredContent['code'] ?? null;

        return is_string($code) && in_array($code, self::RECOVERABLE_CODES, true);
    }

    public function nextAttempt(int $attempt, ToolResult $result): int
    {
        if (! $this->shouldRepair($attempt, $result)) {
            throw new InvalidArgumentException('Tool result is not eligible for another repair attempt.');
        }

        return $attempt + 1;
    }
}
