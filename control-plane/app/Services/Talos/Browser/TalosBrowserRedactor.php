<?php

declare(strict_types=1);

namespace App\Services\Talos\Browser;

use App\Models\TalosAuditEvent;

final class TalosBrowserRedactor
{
    /** @param array<string, mixed> $payload @return array<string, mixed> */
    public static function payload(array $payload): array
    {
        $redacted = TalosAuditEvent::redact($payload);

        foreach ($redacted as $key => $value) {
            if (is_array($value)) {
                $redacted[$key] = self::payload($value);
            } elseif (is_string($value) && str_contains(strtolower((string) $key), 'url')) {
                $redacted[$key] = self::url($value);
            }
        }

        return $redacted;
    }

    public static function url(?string $value): ?string
    {
        if ($value === null || $value === '') {
            return $value;
        }

        $parts = parse_url($value);
        if ($parts === false || ! isset($parts['scheme'], $parts['host'])) {
            return '[redacted-url]';
        }

        $url = $parts['scheme'].'://'.$parts['host'];
        if (isset($parts['port'])) {
            $url .= ':'.$parts['port'];
        }
        $url .= $parts['path'] ?? '';
        if (isset($parts['query'])) {
            parse_str($parts['query'], $query);
            foreach ($query as $key => $item) {
                if (preg_match('/(secret|token|password|api[_-]?key|authorization|credential)/i', (string) $key) === 1) {
                    $query[$key] = '[redacted]';
                }
            }
            $encoded = http_build_query($query, '', '&', PHP_QUERY_RFC3986);
            if ($encoded !== '') {
                $url .= '?'.$encoded;
            }
        }

        return $url;
    }
}
