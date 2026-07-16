<?php

declare(strict_types=1);

namespace App\Services\Talos\Browser;

use Pdp\Rules;
use RuntimeException;
use Throwable;

final class TalosPublicSuffixList
{
    public const PACKAGE_VERSION = '6.4.0';

    public const DATA_COMMIT = '9b5c814414374aa19a93dc6dd7e47c01909524cc';

    public const DATA_SHA256 = 'd2ae7d02585e00b8cb5427dc660d3d45e2a49f618d61c83344fc80502236194c';

    /** @var array<string, Rules> */
    private static array $cache = [];

    private readonly Rules $rules;

    public function __construct(?string $dataPath = null)
    {
        $dataPath ??= resource_path('talos/public_suffix_list.dat');
        $resolvedPath = realpath($dataPath);
        if (! is_string($resolvedPath) || ! is_file($resolvedPath)) {
            throw new RuntimeException('Public Suffix List resource is unavailable.');
        }

        $digest = hash_file('sha256', $resolvedPath);
        if (! is_string($digest) || ! hash_equals(self::DATA_SHA256, strtolower($digest))) {
            throw new RuntimeException('Public Suffix List integrity verification failed.');
        }

        try {
            $this->rules = self::$cache[$resolvedPath] ??= Rules::fromPath($resolvedPath);
        } catch (Throwable $exception) {
            throw new RuntimeException('Public Suffix List could not be loaded.', previous: $exception);
        }
    }

    public function resolve(string $asciiHost): TalosPublicSuffixResolution
    {
        $host = strtolower(rtrim(trim($asciiHost, "[] \t\n\r\0\x0B"), '.'));
        if ($host === '') {
            throw new RuntimeException('Public suffix resolution requires a host.');
        }

        if (filter_var($host, FILTER_VALIDATE_IP) !== false) {
            return new TalosPublicSuffixResolution($host, null, null, true, 'ip');
        }

        try {
            $resolved = $this->rules->resolve($host);
            $suffix = $resolved->suffix()->value();
            $registrableDomain = $resolved->registrableDomain()->value();
            $section = match (true) {
                $resolved->suffix()->isICANN() => 'icann',
                $resolved->suffix()->isPrivate() => 'private',
                default => 'unknown',
            };
        } catch (Throwable) {
            $suffix = null;
            $registrableDomain = null;
            $section = 'unknown';
        }

        return new TalosPublicSuffixResolution(
            asciiHost: $host,
            suffix: is_string($suffix) && $suffix !== '' ? $suffix : null,
            registrableDomain: is_string($registrableDomain) && $registrableDomain !== '' ? $registrableDomain : null,
            isIp: false,
            section: $section,
        );
    }
}
