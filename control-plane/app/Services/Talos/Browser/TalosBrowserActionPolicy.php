<?php

declare(strict_types=1);

namespace App\Services\Talos\Browser;

use App\Models\TalosBrowserSession;
use App\Models\TalosBrowserTask;
use App\Models\TalosToolCall;
use App\Services\Security\CanonicalHttpUrl;
use InvalidArgumentException;
use Kadmos\Browser\Contract\BrowserActionKind;
use Kadmos\Browser\Contract\BrowserActionRisk;
use Kadmos\Browser\Contract\BrowserAutonomyProfile;
use Kadmos\Browser\Contract\BrowserCapability;
use Kadmos\Browser\Policy\BrowserActionDisposition;
use Kadmos\Browser\Policy\BrowserActionPolicy;
use Kadmos\Browser\Policy\BrowserActionPolicyContext;
use Kadmos\Browser\Policy\BrowserActionPolicyDecision;
use Kadmos\Tool\ProceduralLoopGuard;
use Kadmos\Tool\ProceduralNode;

final class TalosBrowserActionPolicy
{
    /** @var array<string, array{kind: BrowserActionKind, risk: BrowserActionRisk, capability: BrowserCapability}> */
    private const SERVER_TOOL_POLICY = [
        'browser_navigate' => [
            'kind' => BrowserActionKind::Navigate,
            'risk' => BrowserActionRisk::Read,
            'capability' => BrowserCapability::Navigate,
        ],
        'browser_snapshot' => [
            'kind' => BrowserActionKind::Snapshot,
            'risk' => BrowserActionRisk::Read,
            'capability' => BrowserCapability::Snapshot,
        ],
        'browser_read' => [
            'kind' => BrowserActionKind::Read,
            'risk' => BrowserActionRisk::Read,
            'capability' => BrowserCapability::Read,
        ],
        'browser_take_screenshot' => [
            'kind' => BrowserActionKind::Screenshot,
            'risk' => BrowserActionRisk::Read,
            'capability' => BrowserCapability::Screenshot,
        ],
        'browser_click' => [
            'kind' => BrowserActionKind::Click,
            'risk' => BrowserActionRisk::Reversible,
            'capability' => BrowserCapability::Click,
        ],
    ];

    public function __construct(private readonly BrowserActionPolicy $policy = new BrowserActionPolicy) {}

    public function evaluate(
        TalosBrowserTask $task,
        ProceduralNode $node,
        TalosBrowserSession $session,
        ?TalosToolCall $call = null,
    ): BrowserActionPolicyDecision {
        $serverPolicy = self::SERVER_TOOL_POLICY[$node->call->name] ?? null;
        if ($serverPolicy === null) {
            return $this->deny('browser_policy_tool_denied', 'This Browser tool is not registered in the server action policy.');
        }
        if ((int) $task->user_id !== (int) $session->user_id
            || (string) $task->talos_session_id !== (string) $session->talos_session_id
            || (string) $task->browser_session_id !== (string) $session->id
            || (string) $node->context->userId !== (string) $task->user_id
            || (string) $node->context->chatSessionId !== (string) $task->talos_session_id
            || (string) $node->context->browserSessionId !== (string) $session->id) {
            return $this->deny('browser_policy_scope_denied', 'The Browser action does not belong to the authenticated task scope.');
        }
        if ((string) $task->status !== 'running') {
            return $this->deny('browser_policy_task_not_running', 'Resume a live Browser task before dispatching another action.');
        }

        try {
            $profile = BrowserAutonomyProfile::from((string) $task->autonomy_profile);
            $settings = $this->policySettings($session);
            $exactApproval = $this->hasExactApproval($task, $node, $call);
            $grants = $this->capabilityGrants($profile, $session, $settings, $serverPolicy['capability'], $exactApproval);
            $allowedDomains = $this->allowedDomains($settings);
            $targetDomain = $this->targetDomain($node, $session);
            $sensitiveCategory = $this->sensitiveCategory($settings, $node->call->providerCallId);
        } catch (InvalidArgumentException) {
            return $this->deny('browser_policy_configuration_invalid', 'Repair the server-owned Browser policy before retrying this action.');
        }

        if (in_array($profile, [BrowserAutonomyProfile::Act, BrowserAutonomyProfile::Custom], true)
            && $serverPolicy['risk'] !== BrowserActionRisk::Read
            && $sensitiveCategory === null
            && $allowedDomains === []) {
            return $this->deny('browser_policy_domain_policy_required', 'Act and Custom mutations require an explicit domain allowlist.');
        }

        return $this->policy->decide(new BrowserActionPolicyContext(
            kind: $serverPolicy['kind'],
            risk: $serverPolicy['risk'],
            autonomyProfile: $profile,
            capabilityGrants: $grants,
            targetDomain: $targetDomain,
            allowedDomains: $allowedDomains,
            sensitiveCategory: $sensitiveCategory,
            exactApprovalGranted: $exactApproval,
            production: app()->environment('production'),
            developerOverride: ($settings['developer_override'] ?? false) === true,
        ));
    }

    /** @return array<string, mixed> */
    private function policySettings(TalosBrowserSession $session): array
    {
        $policy = is_array($session->policy) ? $session->policy : [];
        $settings = $policy['browser_action_policy'] ?? [];
        if (! is_array($settings) || ($settings !== [] && array_is_list($settings))) {
            throw new InvalidArgumentException('Browser action policy settings must be an object.');
        }

        return $settings;
    }

    /**
     * @param  array<string, mixed>  $settings
     * @return list<BrowserCapability>
     */
    private function capabilityGrants(
        BrowserAutonomyProfile $profile,
        TalosBrowserSession $session,
        array $settings,
        BrowserCapability $required,
        bool $exactApproval,
    ): array {
        $grants = [];
        $configured = $settings['capability_grants'] ?? [];
        if (! is_array($configured) || ! array_is_list($configured)) {
            throw new InvalidArgumentException('Browser capability grants must be a list.');
        }
        foreach ($configured as $value) {
            if (! is_string($value) || BrowserCapability::tryFrom($value) === null) {
                throw new InvalidArgumentException('Browser capability grant is unsupported.');
            }
            $grant = BrowserCapability::from($value);
            $grants[$grant->value] = $grant;
        }

        $availableReads = [
            BrowserCapability::Navigate->value => $session->supportsBrowserOperation('navigate'),
            BrowserCapability::Snapshot->value => $session->supportsBrowserOperation('snapshot'),
            BrowserCapability::Read->value => $session->supportsBrowserOperation('read'),
            BrowserCapability::Screenshot->value => $session->supportsBrowserOperation('screenshot'),
        ];
        foreach ($availableReads as $value => $available) {
            if ($available) {
                $grants[$value] = BrowserCapability::from($value);
            }
        }

        if (($profile === BrowserAutonomyProfile::Assist && $required === BrowserCapability::Click
                && in_array('interact', $session->apiCapabilities(), true))
            || $exactApproval) {
            $grants[$required->value] = $required;
        }

        return array_values($grants);
    }

    /** @param array<string, mixed> $settings @return list<string> */
    private function allowedDomains(array $settings): array
    {
        $domains = $settings['allowed_domains'] ?? [];
        if (! is_array($domains) || ! array_is_list($domains)
            || array_any($domains, static fn (mixed $domain): bool => ! is_string($domain))) {
            throw new InvalidArgumentException('Browser allowed domains must be a string list.');
        }

        return array_values($domains);
    }

    private function targetDomain(ProceduralNode $node, TalosBrowserSession $session): ?string
    {
        $url = $node->call->name === 'browser_navigate'
            ? ($node->call->arguments['url'] ?? null)
            : $session->current_url;
        if (! is_string($url) || $url === '') {
            return null;
        }

        return CanonicalHttpUrl::fromString($url)->asciiHost;
    }

    /** @param array<string, mixed> $settings */
    private function sensitiveCategory(array $settings, string $providerCallId): ?string
    {
        $categories = $settings['sensitive_categories'] ?? [];
        if (! is_array($categories) || ($categories !== [] && array_is_list($categories))) {
            throw new InvalidArgumentException('Browser sensitive categories must be a call map.');
        }
        $category = $categories[$providerCallId] ?? null;
        if ($category !== null && ! is_string($category)) {
            throw new InvalidArgumentException('Browser sensitive category must be a string.');
        }

        return $category;
    }

    private function hasExactApproval(
        TalosBrowserTask $task,
        ProceduralNode $node,
        ?TalosToolCall $call,
    ): bool {
        if (! $call instanceof TalosToolCall
            || ! in_array($call->approval_state, ['approved', 'claimed'], true)
            || (int) $call->user_id !== (int) $task->user_id
            || (string) $call->provider_call_id !== $node->call->providerCallId
            || (string) $call->node_id !== $node->id
            || (string) $call->tool_name !== $node->call->name
            || ! is_string($call->arguments_sha256)
            || ! is_string($call->approval_id)
            || $call->approval_id === ''
            || ! is_string($call->approval_payload_sha256)
            || (int) $call->approved_by_user_id !== (int) $task->user_id
            || $call->approved_at === null) {
            return false;
        }
        $argumentsHash = 'sha256:'.hash('sha256', ProceduralLoopGuard::canonicalJson($node->call->arguments));

        return hash_equals($call->arguments_sha256, $argumentsHash);
    }

    private function deny(string $reasonCode, string $remediation): BrowserActionPolicyDecision
    {
        return new BrowserActionPolicyDecision(
            BrowserActionDisposition::Deny,
            BrowserActionRisk::Sensitive,
            $reasonCode,
            $remediation,
        );
    }
}
