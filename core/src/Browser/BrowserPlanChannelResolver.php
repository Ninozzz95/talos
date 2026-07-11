<?php

declare(strict_types=1);

namespace Kadmos\Browser;

use InvalidArgumentException;
use Kadmos\Protocol\ModelPlanResponse;

final class BrowserPlanChannelResolver
{
    /**
     * @param list<array<string, mixed>> $nativeToolCalls
     * @return list<array<string, mixed>>|null
     */
    public static function resolve(ModelPlanResponse $response, array $nativeToolCalls): ?array
    {
        $nativeMutations = BrowserToolCallParser::toMutations($nativeToolCalls);

        if ($response->parseError !== null) {
            throw new InvalidArgumentException(
                $nativeMutations === null
                    ? $response->parseError
                    : 'Browser plan is ambiguous: malformed text planning accompanied a native tool call.',
            );
        }

        if ($nativeMutations !== null && $response->mutations !== null) {
            throw new InvalidArgumentException('Browser plan is ambiguous: both native and text tool channels were used.');
        }

        if ($nativeMutations !== null && trim($response->text) !== '') {
            throw new InvalidArgumentException('Browser plan is ambiguous: native tool calls cannot include assistant prose.');
        }

        if ($response->mutations !== null && trim($response->text) !== '') {
            throw new InvalidArgumentException('Browser plan is ambiguous: text mutations cannot include assistant prose.');
        }

        return $nativeMutations ?? $response->mutations;
    }
}
