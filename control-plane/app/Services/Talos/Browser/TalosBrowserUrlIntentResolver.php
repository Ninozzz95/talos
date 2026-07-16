<?php

declare(strict_types=1);

namespace App\Services\Talos\Browser;

use App\Services\Security\CanonicalHttpUrl;
use Throwable;

final class TalosBrowserUrlIntentResolver
{
    private const MAX_URL_BYTES = 2048;

    public function __construct(
        private readonly ?TalosPublicSuffixList $publicSuffixList = null,
        private readonly ?TalosBrowserPolicy $policy = null,
    ) {}

    public function resolve(string $text, bool $requireResolution = true): TalosBrowserUrlIntentCollection
    {
        $candidates = $this->candidates($text);
        $classification = $this->classification($text, count($candidates));
        $intents = [];
        $faults = [];

        foreach ($candidates as $candidate) {
            $raw = $candidate['raw'];
            $start = $candidate['start'];
            $end = $start + strlen($raw);
            if (strlen($raw) > self::MAX_URL_BYTES) {
                $faults[] = $this->fault($raw, $start, $end, 'URL exceeds the supported length.');

                continue;
            }

            try {
                $url = CanonicalHttpUrl::fromString($raw);
                $suffix = ($this->publicSuffixList ?? new TalosPublicSuffixList)->resolve($url->asciiHost);
                $decision = ($this->policy ?? new TalosBrowserPolicy)->inspect(
                    $url->asciiUrl,
                    $requireResolution,
                );
            } catch (Throwable) {
                $faults[] = $this->fault($raw, $start, $end, 'URL is malformed or unsupported.');

                continue;
            }

            $intents[] = new TalosBrowserUrlIntent(
                raw: $raw,
                url: $url->asciiUrl,
                unicodeUrl: $url->unicodeUrl,
                asciiHost: $url->asciiHost,
                unicodeHost: $url->unicodeHost,
                startByte: $start,
                endByte: $end,
                textBefore: trim(substr($text, 0, $start)),
                textAfter: trim(substr($text, $end)),
                classification: $classification,
                confidence: $this->confidence($classification),
                publicSuffix: $suffix->suffix,
                registrableDomain: $suffix->registrableDomain,
                allowed: $decision['allowed'],
                policyReason: $decision['reason'],
                resolvedIps: $decision['resolved_ips'],
            );
        }

        return new TalosBrowserUrlIntentCollection($intents, $faults);
    }

    /** @return list<array{raw: string, start: int}> */
    private function candidates(string $text): array
    {
        if ($text === '') {
            return [];
        }

        $matched = preg_match_all(
            <<<'REGEX'
~(?<![A-Za-z0-9+.-])(?<url>[A-Za-z][A-Za-z0-9+.-]*://[^\s<>"'`]+)~u
REGEX,
            $text,
            $matches,
            PREG_OFFSET_CAPTURE,
        );
        if (! is_int($matched) || $matched < 1 || ! is_array($matches['url'] ?? null)) {
            return [];
        }

        $candidates = [];
        foreach ($matches['url'] as $match) {
            if (! is_array($match) || ! is_string($match[0] ?? null) || ! is_int($match[1] ?? null)) {
                continue;
            }
            $raw = $this->trimCandidate($match[0]);
            if ($raw !== '') {
                $candidates[] = ['raw' => $raw, 'start' => $match[1]];
            }
        }

        return $candidates;
    }

    private function trimCandidate(string $candidate): string
    {
        $candidate = rtrim($candidate, '.,;:!?');
        foreach ([['(', ')'], ['[', ']'], ['{', '}']] as [$open, $close]) {
            while (str_ends_with($candidate, $close)
                && substr_count($candidate, $close) > substr_count($candidate, $open)) {
                $candidate = substr($candidate, 0, -1);
            }
        }

        return rtrim($candidate, '.,;:!?');
    }

    private function classification(string $text, int $candidateCount): string
    {
        $normalized = mb_strtolower($text);
        if ($candidateCount > 1 && preg_match('/\b(?:confronta|confrontare|compara|compare|versus|vs)\b/u', $normalized) === 1) {
            return 'compare';
        }
        if (preg_match('/\b(?:screenshot|schermata|cattura|capture)\b/u', $normalized) === 1) {
            return 'screenshot';
        }
        if (preg_match('/\b(?:analizza|analizzare|ispeziona|inspect|analyse|analyze|cosa vedi|what do you see|leggi|read)\b/u', $normalized) === 1) {
            return 'inspect';
        }
        if (preg_match('/\b(?:apri|naviga|vai|visita|open|navigate|visit|go to)\b/u', $normalized) === 1) {
            return 'navigate';
        }

        return 'reference';
    }

    private function confidence(string $classification): float
    {
        return match ($classification) {
            'compare', 'screenshot', 'inspect', 'navigate' => 0.98,
            default => 0.85,
        };
    }

    private function fault(string $raw, int $start, int $end, string $message): TalosBrowserUrlIntentFault
    {
        return new TalosBrowserUrlIntentFault(
            raw: $raw,
            startByte: $start,
            endByte: $end,
            code: 'invalid_or_unsupported_url',
            message: $message,
        );
    }
}
