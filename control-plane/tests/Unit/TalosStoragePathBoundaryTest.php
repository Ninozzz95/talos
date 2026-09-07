<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Support\TalosStoragePathBoundary;
use PHPUnit\Framework\TestCase;

final class TalosStoragePathBoundaryTest extends TestCase
{
    public function test_case_sensitive_boundary_rejects_case_folded_sibling(): void
    {
        self::assertFalse(TalosStoragePathBoundary::contains(
            '/srv/talos',
            '/srv/TALOS/escape.png',
            false,
        ));
    }

    public function test_case_insensitive_boundary_accepts_same_root_with_different_case(): void
    {
        self::assertTrue(TalosStoragePathBoundary::contains(
            'C:\TALOS\storage',
            'c:\talos\STORAGE\images\safe.png',
            true,
        ));
    }

    public function test_boundary_normalizes_separators_and_rejects_common_prefix_sibling(): void
    {
        self::assertTrue(TalosStoragePathBoundary::contains(
            '/srv/talos',
            '/srv/talos/images/safe.png',
            false,
        ));
        self::assertFalse(TalosStoragePathBoundary::contains(
            '/srv/talos',
            '/srv/talos-backup/escape.png',
            false,
        ));
    }
}
