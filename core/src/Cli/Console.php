<?php

declare(strict_types=1);

namespace Kadmos\Cli;

final class Console
{
    public const EXIT_SUCCESS = 0;
    public const EXIT_USER_ERROR = 1;
    public const EXIT_ENVIRONMENT_ERROR = 2;
    public const EXIT_BENCHMARK_THRESHOLD_FAILED = 3;
    public const EXIT_VALIDATOR_UNAVAILABLE = 4;

    /**
     * @param array<string, mixed> $payload
     */
    public static function json(array $payload): string
    {
        return json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . PHP_EOL;
    }
}
