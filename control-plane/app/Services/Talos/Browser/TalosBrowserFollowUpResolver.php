<?php

declare(strict_types=1);

namespace App\Services\Talos\Browser;

use App\Models\TalosBrowserSession;
use App\Models\TalosMessage;
use App\Models\TalosSession;
use App\Services\Security\CanonicalHttpUrl;

final class TalosBrowserFollowUpResolver
{
    private const MAX_RECENT_MESSAGES = 12;

    private readonly TalosBrowserUrlIntentResolver $urlIntents;

    public function __construct(TalosBrowserUrlIntentResolver $urlIntents)
    {
        $this->urlIntents = $urlIntents;
    }

    public function resolve(
        string $message,
        ?TalosSession $session,
        ?TalosBrowserSession $browserSession = null,
        ?string $currentUserMessageId = null,
    ): TalosBrowserFollowUpDecision {
        $currentPageAvailable = $this->ownsOperablePage($session, $browserSession);
        $currentUrl = $currentPageAvailable ? $this->currentUrl($browserSession) : null;
        $urlDecision = $this->urlDecision($message, $currentUrl, $currentPageAvailable);
        if ($urlDecision !== null) {
            return $urlDecision;
        }

        if ($this->isScreenshotIntent($message)) {
            return $currentPageAvailable
                ? new TalosBrowserFollowUpDecision(
                    operation: TalosBrowserFollowUpDecision::SCREENSHOT,
                    source: 'current_message',
                    currentUrl: $currentUrl,
                    currentPageAvailable: true,
                )
                : $this->clarify('current_page_unavailable');
        }
        if ($this->mentionsScreenshot($message)) {
            return $this->none();
        }

        $current = $this->boundCurrentMessage($message, $session, $currentUserMessageId);
        $acceptsUnpersistedTurn = $this->acceptsUnpersistedTurn(
            $message,
            $session,
            $currentUserMessageId,
        );
        if (($current instanceof TalosMessage || $acceptsUnpersistedTurn) && $this->isRetryIntent($message)) {
            return $this->retryDecision($session, $current, $currentUrl, $currentPageAvailable);
        }

        if (($current instanceof TalosMessage || $acceptsUnpersistedTurn)
            && $this->isAffirmative($message)
            && $this->previousAssistantOfferedScreenshot($session, $current)) {
            return $currentPageAvailable
                ? new TalosBrowserFollowUpDecision(
                    operation: TalosBrowserFollowUpDecision::SCREENSHOT,
                    source: 'assistant_confirmation',
                    currentUrl: $currentUrl,
                    currentPageAvailable: true,
                    sourceMessageId: $current?->id,
                )
                : $this->clarify('current_page_unavailable');
        }

        if ($this->isCurrentPageInspectIntent($message)) {
            return $currentPageAvailable
                ? new TalosBrowserFollowUpDecision(
                    operation: TalosBrowserFollowUpDecision::INSPECT,
                    source: 'current_page',
                    currentUrl: $currentUrl,
                    currentPageAvailable: true,
                    sourceMessageId: $current?->id,
                )
                : $this->clarify('current_page_unavailable');
        }

        return $this->none();
    }

    /** @return array{url: string, source: 'current_message'|'retry_follow_up', source_message_id: string|null}|null */
    public function resolveNavigation(string $message, ?TalosSession $session, ?string $currentUserMessageId = null): ?array
    {
        $decision = $this->resolve($message, $session, null, $currentUserMessageId);
        if (! $decision->isExecutable()
            || $decision->targetUrl === null
            || ! in_array($decision->effectiveOperation(), [
                TalosBrowserFollowUpDecision::NAVIGATE,
                TalosBrowserFollowUpDecision::INSPECT,
            ], true)) {
            return null;
        }

        return [
            'url' => $decision->targetUrl,
            'source' => $decision->source === 'retry_follow_up' ? 'retry_follow_up' : 'current_message',
            'source_message_id' => $decision->sourceMessageId,
        ];
    }

    private function urlDecision(
        string $message,
        ?string $currentUrl,
        bool $currentPageAvailable = false,
    ): ?TalosBrowserFollowUpDecision {
        $collection = $this->urlIntents->resolve($message);
        $intents = $collection->intents();
        if (count($intents) > 1) {
            return $this->clarify('multiple_urls', $this->choices($intents));
        }
        if (count($intents) === 0) {
            return $collection->faults() !== [] ? $this->clarify('invalid_or_unsupported_url') : null;
        }

        $intent = $intents[0];
        if (! $intent->allowed) {
            return $this->clarify('url_policy_denied');
        }

        $operation = match ($intent->classification) {
            'screenshot' => TalosBrowserFollowUpDecision::SCREENSHOT,
            'inspect', 'compare' => TalosBrowserFollowUpDecision::INSPECT,
            default => TalosBrowserFollowUpDecision::NAVIGATE,
        };

        return new TalosBrowserFollowUpDecision(
            operation: $operation,
            source: 'current_message',
            targetUrl: $intent->url,
            currentUrl: $currentUrl,
            currentPageAvailable: $currentPageAvailable,
        );
    }

    private function retryDecision(
        TalosSession $session,
        ?TalosMessage $current,
        ?string $currentUrl,
        bool $currentPageAvailable,
    ): TalosBrowserFollowUpDecision {
        foreach ($this->messagesBefore($session, $current) as $candidate) {
            if ($candidate->role !== 'user') {
                continue;
            }

            $content = trim((string) $candidate->content);
            if ($content === '' || $this->isRetryIntent($content)) {
                continue;
            }
            if ($this->isScreenshotIntent($content)) {
                return $currentPageAvailable
                    ? new TalosBrowserFollowUpDecision(
                        operation: TalosBrowserFollowUpDecision::RETRY,
                        source: 'retry_follow_up',
                        currentUrl: $currentUrl,
                        currentPageAvailable: true,
                        sourceMessageId: (string) $candidate->id,
                        retryOperation: TalosBrowserFollowUpDecision::SCREENSHOT,
                    )
                    : $this->clarify('current_page_unavailable');
            }

            $resolved = $this->urlDecision($content, $currentUrl, $currentPageAvailable);
            if ($resolved === null
                || ! $resolved->isExecutable()
                || $resolved->targetUrl === null) {
                return $resolved?->operation === TalosBrowserFollowUpDecision::CLARIFY
                    ? $resolved
                    : $this->none();
            }

            return new TalosBrowserFollowUpDecision(
                operation: TalosBrowserFollowUpDecision::RETRY,
                source: 'retry_follow_up',
                targetUrl: $resolved->targetUrl,
                currentUrl: $currentUrl,
                currentPageAvailable: $currentPageAvailable,
                sourceMessageId: (string) $candidate->id,
                retryOperation: $resolved->effectiveOperation(),
            );
        }

        return $this->none();
    }

    private function boundCurrentMessage(
        string $message,
        ?TalosSession $session,
        ?string $currentUserMessageId,
    ): ?TalosMessage {
        if (! $session instanceof TalosSession || ! filled($currentUserMessageId)) {
            return null;
        }

        $current = $session->messages()
            ->whereKey($currentUserMessageId)
            ->where('role', 'user')
            ->first(['id', 'session_id', 'role', 'content', 'created_at']);

        return $current instanceof TalosMessage
            && $this->normalize((string) $current->content) === $this->normalize($message)
                ? $current
                : null;
    }

    /** @return iterable<TalosMessage> */
    private function messagesBefore(TalosSession $session, ?TalosMessage $current): iterable
    {
        $query = $session->messages();
        if ($current instanceof TalosMessage) {
            $query->where(function ($query) use ($current): void {
                $query->where('created_at', '<', $current->created_at)
                    ->orWhere(function ($sameTimestamp) use ($current): void {
                        $sameTimestamp->where('created_at', '=', $current->created_at)
                            ->where('id', '<', $current->id);
                    });
            });
        }

        return $query
            ->latest('created_at')
            ->latest('id')
            ->limit(self::MAX_RECENT_MESSAGES)
            ->get(['id', 'role', 'content', 'created_at']);
    }

    private function previousAssistantOfferedScreenshot(TalosSession $session, ?TalosMessage $current): bool
    {
        foreach ($this->messagesBefore($session, $current) as $candidate) {
            if ($candidate->role === 'system' || $candidate->role === 'tool') {
                continue;
            }
            if ($candidate->role !== 'assistant') {
                return false;
            }

            $offer = $this->normalize((string) $candidate->content);

            return preg_match('/\b(?:screenshot|schermata)\b/u', $offer) === 1
                && preg_match('/\b(?:vuoi|posso|procedo|esegua|faccio|want|shall|should|would)\b/u', $offer) === 1;
        }

        return false;
    }

    private function ownsOperablePage(?TalosSession $session, ?TalosBrowserSession $browserSession): bool
    {
        if (! $session instanceof TalosSession || ! $browserSession instanceof TalosBrowserSession) {
            return false;
        }

        return (string) $browserSession->talos_session_id === (string) $session->id
            && (int) $browserSession->user_id === (int) $session->user_id
            && $browserSession->isOperable();
    }

    private function currentUrl(?TalosBrowserSession $browserSession): ?string
    {
        if (! $browserSession instanceof TalosBrowserSession
            || ! is_string($browserSession->current_url)
            || trim($browserSession->current_url) === '') {
            return null;
        }

        try {
            return CanonicalHttpUrl::fromString($browserSession->current_url)->asciiUrl;
        } catch (\InvalidArgumentException) {
            return null;
        }
    }

    /**
     * @param  list<TalosBrowserUrlIntent>  $intents
     * @return list<array{index: int, url: string, host: string, label: string}>
     */
    private function choices(array $intents): array
    {
        $choices = [];
        foreach ($intents as $intent) {
            if (! $intent->allowed) {
                continue;
            }
            $url = CanonicalHttpUrl::fromString($intent->url);
            $label = $url->unicodeHost.($url->path === '/' ? '' : $url->path);
            if ($url->query !== null) {
                $label .= '?'.$url->query;
            }
            $choices[] = [
                'index' => count($choices) + 1,
                'url' => $intent->url,
                'host' => $intent->unicodeHost,
                'label' => mb_strimwidth($label, 0, 96, '...'),
            ];
        }

        return $choices;
    }

    /** @param list<array{index: int, url: string, host: string, label: string}> $choices */
    private function clarify(string $reason, array $choices = []): TalosBrowserFollowUpDecision
    {
        return new TalosBrowserFollowUpDecision(
            operation: TalosBrowserFollowUpDecision::CLARIFY,
            source: 'clarification',
            choices: $choices,
            reason: $reason,
        );
    }

    private function none(): TalosBrowserFollowUpDecision
    {
        return new TalosBrowserFollowUpDecision(
            operation: TalosBrowserFollowUpDecision::NONE,
            source: 'none',
        );
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

    private function isAffirmative(string $message): bool
    {
        return in_array($this->normalize($message), [
            'si',
            "s\u{00EC}",
            'certo',
            'confermo',
            'fallo',
            'procedi',
            'vai',
            'ok',
            'okay',
            'yes',
            'do it',
            'go ahead',
        ], true);
    }

    private function isScreenshotIntent(string $message): bool
    {
        $normalized = $this->normalize($message);
        if (in_array($normalized, ['screenshot', 'uno screenshot', 'take screenshot', 'take a screenshot'], true)) {
            return true;
        }

        $italianAction = '(?:fai|fammi|mi fai|cattura|scatta|puoi fare|puoi farmi|puoi catturare|puoi scattare|potresti fare|potresti farmi|potresti catturare|potresti scattare|riesci a fare|riesci a farmi|riesci a catturare|riesci a scattare)';
        $italianScope = '(?:della pagina(?: corrente)?|di questa pagina|dello schermo|del browser)';
        if (preg_match('/^(?:per favore )?'.$italianAction.'(?: (?:uno|un|una|la))? (?:screenshot|schermata)(?: '.$italianScope.')?(?: (?:ora|adesso))?(?: per favore)?$/u', $normalized) === 1) {
            return true;
        }

        $englishAction = '(?:take|capture|make|can you take|can you capture|can you make|could you take|could you capture|could you make|are you able to take|are you able to capture)';
        $englishScope = '(?:of (?:the )?(?:current )?page|of this page|of the browser)';

        return preg_match('/^(?:please )?'.$englishAction.'(?: (?:a|the))? screenshot(?: '.$englishScope.')?(?: now)?(?: please)?$/u', $normalized) === 1;
    }

    private function mentionsScreenshot(string $message): bool
    {
        return preg_match('/\b(?:screenshot|schermata|screen capture)\b/u', $this->normalize($message)) === 1;
    }

    private function isCurrentPageInspectIntent(string $message): bool
    {
        $normalized = $this->normalize($message);
        if (in_array($normalized, [
            'inspect',
            'inspect page',
            'inspect the page',
            'ispeziona',
            'ispeziona la pagina',
            'analizza',
            'analizza la pagina',
            'read',
            'read page',
            'read the page',
            'leggi',
            'leggi la pagina',
            'cosa vedi',
            'what do you see',
            'rispondi',
            'answer',
            'continua',
            'continue',
            'descrivi la pagina',
            'describe the page',
        ], true)) {
            return true;
        }

        return $this->referencesCurrentPage($normalized)
            && preg_match('/\b(?:analizza|analizzare|ispeziona|inspect|analyse|analyze|cosa vedi|what do you see|leggi|read|descrivi|describe|rispondi|answer|continua|continue)\b/u', $normalized) === 1;
    }

    private function referencesCurrentPage(string $message): bool
    {
        return preg_match('/\b(?:qui|questa pagina|quella pagina|pagina corrente|l\x27hai|la pagina|this page|current page|that page|there|it)\b/u', $this->normalize($message)) === 1;
    }

    private function acceptsUnpersistedTurn(
        string $message,
        ?TalosSession $session,
        ?string $currentUserMessageId,
    ): bool {
        if (! $session instanceof TalosSession || filled($currentUserMessageId)) {
            return false;
        }

        $latestUser = $session->messages()
            ->where('role', 'user')
            ->latest('created_at')
            ->latest('id')
            ->first(['content']);

        return ! $latestUser instanceof TalosMessage
            || $this->normalize((string) $latestUser->content) !== $this->normalize($message);
    }

    private function normalize(string $message): string
    {
        $normalized = mb_strtolower(trim($message));
        $normalized = preg_replace('/[\p{P}\p{S}]+/u', ' ', $normalized) ?? '';

        return preg_replace('/\s+/u', ' ', trim($normalized)) ?? '';
    }
}
