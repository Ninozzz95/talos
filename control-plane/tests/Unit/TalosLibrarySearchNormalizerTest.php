<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Services\Library\TalosLibrarySearchNormalizer;
use PHPUnit\Framework\TestCase;

final class TalosLibrarySearchNormalizerTest extends TestCase
{
    public function test_normalizes_compatibility_forms_accents_case_and_whitespace(): void
    {
        $normalizer = new TalosLibrarySearchNormalizer;

        self::assertSame(
            "caf\u{00E9} avm",
            $normalizer->normalize("  CAF\u{00C9}\t\u{FF21}\u{FF36}\u{FF2D}  "),
        );
        self::assertSame(
            $normalizer->normalize("caf\u{00E9} avm"),
            $normalizer->normalize("cafe\u{0301} avm"),
        );
    }

    public function test_preserves_non_ascii_atoms_and_ignores_emoji_presentation_selector(): void
    {
        $normalizer = new TalosLibrarySearchNormalizer;
        $family = "\u{1F468}\u{200D}\u{1F469}\u{200D}\u{1F467}\u{200D}\u{1F466}";

        self::assertSame(
            ["\u{9884}\u{7B97}", "\u{20AC}", 'c++', "\u{1F512}", $family],
            $normalizer->terms(
                "\u{9884}\u{7B97} \u{20AC} C++ \u{1F512} {$family} C++",
            ),
        );
        self::assertSame(
            $normalizer->normalize("coffee \u{2615}"),
            $normalizer->normalize("coffee \u{2615}\u{FE0F}"),
        );
    }
}
