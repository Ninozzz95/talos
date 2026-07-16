<?php

declare(strict_types=1);

namespace Kadmos\Browser\Policy;

use Kadmos\Browser\Contract\BrowserActionKind;
use Kadmos\Browser\Contract\BrowserActionRisk;
use Kadmos\Browser\Contract\BrowserAutonomyProfile;
use Kadmos\Browser\Contract\BrowserCapability;

final class BrowserActionPolicy
{
    private const HUMAN_ONLY_CATEGORIES = [
        'credential',
        'recovery_code',
        'two_factor',
        'payment_data',
        'payment_confirmation',
    ];

    public function decide(BrowserActionPolicyContext $context): BrowserActionPolicyDecision
    {
        $risk = $this->effectiveRisk($context);

        if ($context->sensitiveCategory !== null
            && in_array($context->sensitiveCategory, self::HUMAN_ONLY_CATEGORIES, true)) {
            return $this->decision(
                BrowserActionDisposition::HumanOnly,
                $risk,
                'browser_policy_sensitive_human_only',
                'Enter credentials, recovery, two-factor or payment data directly as the human operator.',
            );
        }

        $requiredCapability = $this->requiredCapability($context->kind);
        if (! $context->hasCapability($requiredCapability)) {
            return $this->decision(
                BrowserActionDisposition::Deny,
                $risk,
                'browser_policy_capability_denied',
                'Grant the exact Browser capability from trusted TALOS settings before retrying.',
            );
        }
        if (! $context->targetDomainAllowed()) {
            return $this->decision(
                BrowserActionDisposition::Deny,
                $risk,
                'browser_policy_domain_denied',
                'Add the target domain to the task allowlist or choose an allowed page.',
            );
        }

        if ($context->developerOverride && ! $context->production) {
            return $this->decision(
                BrowserActionDisposition::Allow,
                $risk,
                'browser_policy_developer_override',
                'Local developer override authorized this non-protected action; retain the audit event.',
            );
        }

        if ($risk === BrowserActionRisk::Read) {
            return $this->decision(
                BrowserActionDisposition::Allow,
                $risk,
                'browser_policy_allowed',
                'The server-classified read action is authorized.',
            );
        }
        if ($context->autonomyProfile === BrowserAutonomyProfile::Observe) {
            return $this->decision(
                BrowserActionDisposition::Deny,
                $risk,
                'browser_policy_observe_mutation_denied',
                'Switch to Assist, Act or an explicitly granted Custom profile to perform page mutations.',
            );
        }

        if ($context->exactApprovalGranted) {
            return $this->decision(
                BrowserActionDisposition::Allow,
                $risk,
                'browser_policy_exact_approval',
                'The exact server-bound action and target were approved by the authenticated operator.',
            );
        }

        if ($risk === BrowserActionRisk::Reversible
            && in_array($context->autonomyProfile, [BrowserAutonomyProfile::Act, BrowserAutonomyProfile::Custom], true)) {
            return $this->decision(
                BrowserActionDisposition::Allow,
                $risk,
                'browser_policy_allowed',
                'The explicitly granted reversible action is authorized by the active autonomy profile.',
            );
        }

        return $this->decision(
            BrowserActionDisposition::Confirm,
            $risk,
            'browser_policy_confirmation_required',
            'Review and approve this exact action, target and arguments before execution.',
        );
    }

    private function effectiveRisk(BrowserActionPolicyContext $context): BrowserActionRisk
    {
        $minimum = match ($context->kind) {
            BrowserActionKind::Navigate,
            BrowserActionKind::Snapshot,
            BrowserActionKind::Screenshot,
            BrowserActionKind::Read,
            BrowserActionKind::Scroll,
            BrowserActionKind::Hover,
            BrowserActionKind::History => BrowserActionRisk::Read,
            BrowserActionKind::Upload,
            BrowserActionKind::Download => BrowserActionRisk::Sensitive,
            default => BrowserActionRisk::Reversible,
        };

        if ($context->sensitiveCategory === 'destructive_effect') {
            $minimum = BrowserActionRisk::Irreversible;
        } elseif ($context->sensitiveCategory !== null) {
            $minimum = BrowserActionRisk::Sensitive;
        }

        $rank = [
            BrowserActionRisk::Read->value => 0,
            BrowserActionRisk::Reversible->value => 1,
            BrowserActionRisk::Sensitive->value => 2,
            BrowserActionRisk::Irreversible->value => 3,
        ];

        return $rank[$context->risk->value] >= $rank[$minimum->value] ? $context->risk : $minimum;
    }

    private function requiredCapability(BrowserActionKind $kind): BrowserCapability
    {
        return match ($kind) {
            BrowserActionKind::Navigate => BrowserCapability::Navigate,
            BrowserActionKind::Snapshot => BrowserCapability::Snapshot,
            BrowserActionKind::Screenshot => BrowserCapability::Screenshot,
            BrowserActionKind::Read => BrowserCapability::Read,
            BrowserActionKind::Click => BrowserCapability::Click,
            BrowserActionKind::Type => BrowserCapability::Type,
            BrowserActionKind::Select => BrowserCapability::Select,
            BrowserActionKind::Check => BrowserCapability::Check,
            BrowserActionKind::Scroll => BrowserCapability::Scroll,
            BrowserActionKind::Hover => BrowserCapability::Hover,
            BrowserActionKind::Key => BrowserCapability::Key,
            BrowserActionKind::Drag => BrowserCapability::Drag,
            BrowserActionKind::Upload => BrowserCapability::Upload,
            BrowserActionKind::Download => BrowserCapability::Download,
            BrowserActionKind::Tab => BrowserCapability::Tabs,
            BrowserActionKind::History => BrowserCapability::History,
            BrowserActionKind::Dialog => BrowserCapability::Dialogs,
        };
    }

    private function decision(
        BrowserActionDisposition $disposition,
        BrowserActionRisk $risk,
        string $reasonCode,
        string $remediation,
    ): BrowserActionPolicyDecision {
        return new BrowserActionPolicyDecision($disposition, $risk, $reasonCode, $remediation);
    }
}
