<?php

declare(strict_types=1);

namespace App\Services\Talos\Browser;

final class TalosBrowserHmiPolicy
{
    public const READ_ONLY = 'read_only';

    public const CONFIRM_SENSITIVE = 'confirm_sensitive';

    public const CONFIRM_EVERY_INTERACTION = 'confirm_every_interaction';

    /** @var list<string> Labels whose semantics are explicitly non-consequential. */
    private const ORDINARY_LABELS = [
        'back',
        'cancel',
        'close',
        'collapse',
        'dismiss',
        'expand',
        'forward',
        'fullscreen',
        'mute',
        'next',
        'next page',
        'page',
        'pagination',
        'pause',
        'play',
        'previous',
        'previous page',
        'reject',
        'tab',
        'unmute',
        'volume',
        'zoom',
    ];

    /** @var list<string> A token in this set is consequential unless a stronger deny rule applies. */
    private const CONSEQUENTIAL_LABEL_TOKENS = [
        'accept',
        'add',
        'approve',
        'book',
        'booking',
        'buy',
        'camera',
        'checkout',
        'clipboard',
        'comment',
        'confirm',
        'credential',
        'delete',
        'download',
        'export',
        'grant',
        'invite',
        'location',
        'microphone',
        'notification',
        'oauth',
        'order',
        'otp',
        'password',
        'pay',
        'payment',
        'permission',
        'post',
        'publish',
        'purchase',
        'remove',
        'revoke',
        'save',
        'send',
        'share',
        'sign',
        'subscribe',
        'token',
        'transfer',
        'upload',
    ];

    /** @param array<string, mixed> $target @return array<string, mixed> */
    public function classify(array $target, string $userMode = self::CONFIRM_SENSITIVE, ?string $workspaceMode = null): array
    {
        $mode = $this->effectiveMode($userMode, $workspaceMode);
        if ($mode === self::READ_ONLY) {
            return $this->decision('deny', 'policy_denied', 'HMI interaction is disabled by read-only policy.');
        }

        if (($target['missing'] ?? false) === true || ($target['visible'] ?? null) === false || ($target['disabled'] ?? null) === true) {
            return $this->decision('deny', 'target_denied', 'The browser target is missing, invisible, or disabled.');
        }

        if ($this->containsPrivateDestination($target['href'] ?? null)) {
            return $this->decision('deny', 'destination_denied', 'The browser destination is not permitted by the public URL policy.');
        }

        $category = $this->classifyTarget($target);
        if ($mode === self::CONFIRM_EVERY_INTERACTION) {
            return $this->decision('confirm', $category, 'This workspace requires confirmation for every browser interaction.');
        }
        if ($category !== 'ordinary') {
            return $this->decision('confirm', $category, 'This browser interaction may have an external or consequential effect.');
        }

        return $this->decision('allow', 'ordinary', 'This browser interaction is an ordinary, non-consequential control.');
    }

    public function effectiveMode(string $userMode, ?string $workspaceMode = null): string
    {
        $user = $this->normalizeMode($userMode) ?? self::CONFIRM_SENSITIVE;
        $workspace = $workspaceMode === null ? null : $this->normalizeMode($workspaceMode);
        if ($workspaceMode !== null && $workspace === null) {
            return self::READ_ONLY;
        }
        if ($workspace === null) {
            return $user;
        }

        return $this->strictness($workspace) > $this->strictness($user) ? $workspace : $user;
    }

    private function classifyTarget(array $target): string
    {
        if (($target['required_effect_classification'] ?? null) === 'sensitive') {
            return 'sensitive';
        }

        $name = $this->normalizeLabel((string) ($target['name'] ?? ''));
        $tokens = $this->labelTokens($name);
        $inputType = strtolower(trim((string) ($target['input_type'] ?? '')));
        $formMethod = strtolower(trim((string) ($target['form_method'] ?? '')));

        if (($target['href'] ?? null) !== null) {
            return $this->isPotentiallyEffectfulNavigation($target, $tokens, $formMethod)
                ? 'external_commit'
                : 'external_navigation';
        }
        if ($this->isBoundedSearch($target, $tokens, $formMethod)) {
            return 'ordinary';
        }
        if (($target['is_submit'] ?? false) === true || ($target['is_download'] ?? false) === true || ($target['opens_new_context'] ?? false) === true) {
            return 'sensitive';
        }
        if (($target['is_editable'] ?? false) === true || in_array($inputType, ['file', 'password', 'hidden'], true)) {
            return 'sensitive';
        }
        // Only explicit semantic facts can allow a dynamic control. Unknown controls remain ambiguous.
        if ($this->hasAnyToken($tokens, self::CONSEQUENTIAL_LABEL_TOKENS)) {
            return 'sensitive';
        }
        if ($this->isOrdinaryLabel($name, $tokens)) {
            return 'ordinary';
        }

        $role = strtolower(trim((string) ($target['role'] ?? '')));
        if ($formMethod !== '' && $formMethod !== 'get') {
            return 'sensitive';
        }
        if (in_array($role, ['tab', 'pagination', 'navigation'], true) && $formMethod === '') {
            return 'ordinary';
        }

        return 'ambiguous';
    }

    /** @param list<string> $tokens */
    private function isPotentiallyEffectfulNavigation(array $target, array $tokens, string $formMethod): bool
    {
        return ($target['is_submit'] ?? false) === true
            || ($target['is_download'] ?? false) === true
            || ($target['opens_new_context'] ?? false) === true
            || ($target['is_editable'] ?? false) === true
            || ($formMethod !== '' && ! in_array($formMethod, ['get', 'head'], true))
            || $this->hasAnyToken($tokens, self::CONSEQUENTIAL_LABEL_TOKENS);
    }

    /**
     * Ordinary means a bounded search or an explicitly structural/dismissive control.
     * Consequential controls are identified by metadata or a deterministic semantic token set.
     * A dynamic button without either signal is ambiguous and therefore requires confirmation.
     *
     * @param list<string> $tokens
     */
    private function isBoundedSearch(array $target, array $tokens, string $formMethod): bool
    {
        return $formMethod === 'get'
            && $this->hasAnyToken($tokens, ['search', 'find', 'query'])
            && ($target['is_submit'] ?? false) === true
            && ($target['is_download'] ?? false) !== true;
    }

    /** @param list<string> $tokens */
    private function isOrdinaryLabel(string $name, array $tokens): bool
    {
        if (in_array($name, self::ORDINARY_LABELS, true)) {
            return true;
        }

        return (in_array('cookie', $tokens, true) || in_array('cookies', $tokens, true))
            && $this->hasAnyToken($tokens, ['close', 'dismiss', 'reject']);
    }

    private function normalizeLabel(string $label): string
    {
        $normalized = preg_replace('/[^a-z0-9]+/i', ' ', strtolower(trim($label)));

        return trim($normalized ?? '');
    }

    /** @return list<string> */
    private function labelTokens(string $label): array
    {
        return $label === '' ? [] : explode(' ', $label);
    }

    /** @param list<string> $tokens @param list<string> $candidates */
    private function hasAnyToken(array $tokens, array $candidates): bool
    {
        return array_intersect($tokens, $candidates) !== [];
    }

    private function containsPrivateDestination(mixed $href): bool
    {
        if ($href === null) {
            return false;
        }
        if (! is_string($href) || trim($href) === '') {
            return true;
        }
        $parts = parse_url($href);
        $host = is_array($parts) ? strtolower((string) ($parts['host'] ?? '')) : '';
        if (! in_array(strtolower((string) ($parts['scheme'] ?? '')), ['http', 'https'], true) || $host === '') {
            return true;
        }
        if (in_array($host, ['localhost', 'localhost.localdomain'], true) || str_ends_with($host, '.local')) {
            return true;
        }
        $ip = filter_var($host, FILTER_VALIDATE_IP);

        return $ip !== false && filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE) === false;
    }

    /** @return array<string, string> */
    private function decision(string $decision, string $category, string $consequence): array
    {
        return ['decision' => $decision, 'category' => $category, 'consequence' => $consequence];
    }

    public function normalizeMode(mixed $mode): ?string
    {
        return is_string($mode)
            && in_array($mode, [self::READ_ONLY, self::CONFIRM_SENSITIVE, self::CONFIRM_EVERY_INTERACTION], true)
                ? $mode
                : null;
    }

    private function strictness(?string $mode): int
    {
        return match ($mode) {
            self::CONFIRM_SENSITIVE => 1,
            self::CONFIRM_EVERY_INTERACTION => 2,
            self::READ_ONLY => 3,
            default => 0,
        };
    }
}
