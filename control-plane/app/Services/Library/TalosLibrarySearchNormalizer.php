<?php

declare(strict_types=1);

namespace App\Services\Library;

use Normalizer;

final class TalosLibrarySearchNormalizer
{
    private const MAX_CHARS = 65_536;

    public function normalize(string $value, int $maxChars = self::MAX_CHARS): string
    {
        $normalized = Normalizer::normalize($value, Normalizer::FORM_KC);
        if (! is_string($normalized)) {
            return '';
        }

        $normalized = mb_strtolower($normalized, 'UTF-8');
        $normalized = preg_replace('/[\x{FE0E}\x{FE0F}]/u', '', $normalized);
        if (! is_string($normalized)) {
            return '';
        }
        $normalized = preg_replace('/\s+/u', ' ', $normalized);
        if (! is_string($normalized)) {
            return '';
        }

        return mb_substr(trim($normalized), 0, max(0, $maxChars));
    }

    /** @return list<string> */
    public function terms(string $query, int $maxTerms = 12): array
    {
        $normalized = $this->normalize($query);
        if ($normalized === '' || $maxTerms < 1) {
            return [];
        }

        return array_slice(array_values(array_unique(explode(' ', $normalized))), 0, $maxTerms);
    }
}
