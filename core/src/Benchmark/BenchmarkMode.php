<?php

declare(strict_types=1);

namespace Kadmos\Benchmark;

final class BenchmarkMode
{
    public const AVM_ON = 'avm_on';
    public const AVM_OFF_DIRECT = 'avm_off_direct';
    public const TOOL_AGENT = 'tool_agent';

    private function __construct()
    {
    }

    /**
     * @return list<string>
     */
    public static function all(): array
    {
        return [
            self::AVM_ON,
            self::AVM_OFF_DIRECT,
            self::TOOL_AGENT,
        ];
    }

    public static function label(string $mode): string
    {
        return match ($mode) {
            self::AVM_ON => 'AVM ON',
            self::AVM_OFF_DIRECT => 'AVM OFF Direct',
            self::TOOL_AGENT => 'Tool Agent',
            default => $mode,
        };
    }
}
