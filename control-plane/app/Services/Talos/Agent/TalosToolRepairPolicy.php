<?php

declare(strict_types=1);

namespace App\Services\Talos\Agent;

use InvalidArgumentException;
use Kadmos\Tool\ToolResult;

final class TalosToolRepairPolicy
{
    public const MAX_TRANSIENT_REPAIRS = 2;

    public const MAX_ARGUMENT_REPAIRS = 1;

    public const MAX_REPAIRS = self::MAX_TRANSIENT_REPAIRS;

    private const ARGUMENT_REPAIR_CODES = [
        'TALOS_BROWSER_COMMAND_MALFORMED',
        'TALOS_TOOL_ARGUMENTS_INVALID',
        'TALOS_PROVIDER_TOOL_CALL_MALFORMED',
    ];

    private const TRANSIENT_REPAIR_CODES = [
        'TALOS_BROWSER_STALE_STATE',
        'TALOS_BROWSER_TARGET_BLOCKED',
        'TALOS_WEB_SEARCH_TRANSIENT_FAILURE',
        'TALOS_BROWSER_WORKER_TRANSIENT',
    ];

    public function maxRepairsFor(ToolResult $result): int
    {
        if (! $result->isError) {
            return 0;
        }

        $code = $result->structuredContent['code'] ?? null;
        if (! is_string($code)) {
            return 0;
        }

        if (in_array($code, self::ARGUMENT_REPAIR_CODES, true)) {
            return self::MAX_ARGUMENT_REPAIRS;
        }

        if (in_array($code, self::TRANSIENT_REPAIR_CODES, true)) {
            return self::MAX_TRANSIENT_REPAIRS;
        }

        return 0;
    }

    public function shouldRepair(int $attempt, ToolResult $result): bool
    {
        if ($attempt < 0) {
            throw new InvalidArgumentException('Tool repair attempt cannot be negative.');
        }

        return $attempt < $this->maxRepairsFor($result);
    }

    public function nextAttempt(int $attempt, ToolResult $result): int
    {
        if (! $this->shouldRepair($attempt, $result)) {
            throw new InvalidArgumentException('Tool result is not eligible for another repair attempt.');
        }

        return $attempt + 1;
    }
}
