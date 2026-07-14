<?php

declare(strict_types=1);

namespace App\Services\Talos\Agent;

final class TalosProviderStateCodec
{
    public static function encode(array $state): string
    {
        return TalosDagCheckpointCodec::encode($state);
    }

    /** @return array<string, mixed> */
    public static function decode(string $encoded): array
    {
        return TalosDagCheckpointCodec::decode($encoded);
    }
}
