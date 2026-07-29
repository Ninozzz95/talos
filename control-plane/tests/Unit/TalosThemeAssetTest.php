<?php

declare(strict_types=1);

namespace Tests\Unit;

use Tests\TestCase;

final class TalosThemeAssetTest extends TestCase
{
    public function test_calm_poster_is_a_bounded_local_webp_asset(): void
    {
        $path = public_path('talos/backgrounds/calm-poster.webp');

        self::assertFileExists($path);
        self::assertGreaterThanOrEqual(20_000, filesize($path));
        self::assertLessThanOrEqual(1_000_000, filesize($path));
        self::assertSame(
            'ffebdc509e716743951997480e16b453419a2598fbf95bcff95e63cb22c64379',
            hash_file('sha256', $path),
        );

        $image = getimagesize($path);
        self::assertIsArray($image);
        self::assertSame('image/webp', $image['mime'] ?? null);
        self::assertSame(1920, $image[0]);
        self::assertSame(1080, $image[1]);
        self::assertSame(16 / 9, $image[0] / $image[1]);
    }
}
