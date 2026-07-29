<?php

declare(strict_types=1);

namespace App\Support;

final class TalosStoragePathBoundary
{
    public static function contains(
        string $root,
        string $candidate,
        ?bool $caseInsensitive = null,
    ): bool {
        $normalizedRoot = self::normalize($root);
        $normalizedCandidate = self::normalize($candidate);
        if ($normalizedRoot === '' || $normalizedCandidate === '') {
            return false;
        }

        $rootPrefix = rtrim($normalizedRoot, '/').'/';
        $candidatePath = rtrim($normalizedCandidate, '/').'/';
        $caseInsensitive ??= PHP_OS_FAMILY === 'Windows';

        return $caseInsensitive
            ? strncasecmp($candidatePath, $rootPrefix, strlen($rootPrefix)) === 0
            : str_starts_with($candidatePath, $rootPrefix);
    }

    private static function normalize(string $path): string
    {
        return str_replace('\\', '/', $path);
    }
}
