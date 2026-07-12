<?php

declare(strict_types=1);

namespace App\Services\Talos\Browser;

use App\Models\TalosSession;

final class TalosBrowserFollowUpResolver
{
    private const MAX_RECENT_MESSAGES = 12;

    /** @return array{url: string, source: 'current_message'|'retry_follow_up', source_message_id: string|null}|null */
    public function resolveNavigation(string $message, ?TalosSession $session, ?string $currentUserMessageId = null): ?array
    {
        $url = $this->singleUrl($message);
        if ($url !== null) {
            return ['url' => $url, 'source' => 'current_message', 'source_message_id' => null];
        }

        if (! $session instanceof TalosSession || ! $this->isRetryIntent($message) || ! filled($currentUserMessageId)) {
            return null;
        }

        $current = $session->messages()
            ->whereKey($currentUserMessageId)
            ->where('role', 'user')
            ->first(['id', 'role', 'content', 'created_at']);

        if ($current === null
            || ! $this->isRetryIntent((string) $current->content)
            || $this->normalize((string) $current->content) !== $this->normalize($message)) {
            return null;
        }

        $messages = $session->messages()
            ->where(function ($query) use ($current): void {
                $query->where('created_at', '<', $current->created_at)
                    ->orWhere(function ($sameTimestamp) use ($current): void {
                        $sameTimestamp->where('created_at', '=', $current->created_at)
                            ->where('id', '<', $current->id);
                    });
            })
            ->latest('created_at')
            ->latest('id')
            ->limit(self::MAX_RECENT_MESSAGES)
            ->get(['id', 'role', 'content']);

        foreach ($messages as $candidate) {
            if ($candidate->role !== 'user') {
                continue;
            }

            $content = trim((string) $candidate->content);
            if ($content === '' || $this->isRetryIntent($content)) {
                continue;
            }

            $url = $this->singleUrl($content);
            if ($url === null) {
                // Never jump across an unrelated user turn to revive a stale URL.
                return null;
            }

            return [
                'url' => $url,
                'source' => 'retry_follow_up',
                'source_message_id' => (string) $candidate->id,
            ];
        }

        return null;
    }

    private function isRetryIntent(string $message): bool
    {
        return in_array($this->normalize($message), [
            'riprova',
            'riprova ora',
            'prova ora',
            'prova di nuovo',
            'ritenta',
            'ritenta ora',
            'retry',
            'retry now',
            'try again',
            'try now',
        ], true);
    }

    private function normalize(string $message): string
    {
        $normalized = mb_strtolower(trim($message));
        $normalized = preg_replace('/[\p{P}\p{S}]+/u', ' ', $normalized) ?? '';

        return preg_replace('/\s+/u', ' ', trim($normalized)) ?? '';
    }

    private function singleUrl(string $message): ?string
    {
        if (trim($message) === '') {
            return null;
        }

        $matched = preg_match_all('~https?://[^\s<>"\'`]+~iu', $message, $matches);
        if ($matched === false || $matched === 0 || ! is_array($matches[0] ?? null)) {
            return null;
        }

        $candidates = [];
        foreach ($matches[0] as $rawCandidate) {
            if (! is_string($rawCandidate)) {
                continue;
            }

            $candidate = $this->trimUrlCandidate($rawCandidate);
            if ($candidate === '' || mb_strlen($candidate) > 2048 || filter_var($candidate, FILTER_VALIDATE_URL) === false) {
                continue;
            }

            $parts = parse_url($candidate);
            $scheme = is_array($parts) && is_string($parts['scheme'] ?? null) ? strtolower($parts['scheme']) : null;
            $host = is_array($parts) && is_string($parts['host'] ?? null) ? trim($parts['host']) : '';
            if (! in_array($scheme, ['http', 'https'], true) || $host === '') {
                continue;
            }

            $candidates[$candidate] = true;
        }

        return count($candidates) === 1 ? array_key_first($candidates) : null;
    }

    private function trimUrlCandidate(string $candidate): string
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
}
