<?php

declare(strict_types=1);

namespace Kadmos\Browser\Policy;

use InvalidArgumentException;
use Kadmos\Browser\Contract\BrowserActionKind;
use Kadmos\Browser\Contract\BrowserActionRisk;
use Kadmos\Browser\Contract\BrowserAutonomyProfile;
use Kadmos\Browser\Contract\BrowserCapability;

final readonly class BrowserActionPolicyContext
{
    public const SENSITIVE_CATEGORIES = [
        'credential',
        'recovery_code',
        'two_factor',
        'payment_data',
        'payment_confirmation',
        'form_submission',
        'message_post',
        'account_change',
        'permission_grant',
        'executable_download',
        'cross_origin_disclosure',
        'destructive_effect',
    ];

    /** @var list<BrowserCapability> */
    public array $capabilityGrants;

    /** @var list<string> */
    public array $allowedDomains;

    /**
     * @param list<BrowserCapability> $capabilityGrants
     * @param list<string> $allowedDomains
     */
    public function __construct(
        public BrowserActionKind $kind,
        public BrowserActionRisk $risk,
        public BrowserAutonomyProfile $autonomyProfile,
        array $capabilityGrants,
        public ?string $targetDomain,
        array $allowedDomains,
        public ?string $sensitiveCategory,
        public bool $exactApprovalGranted,
        public bool $production,
        public bool $developerOverride,
    ) {
        if (! array_is_list($capabilityGrants)
            || array_any($capabilityGrants, static fn (mixed $grant): bool => ! $grant instanceof BrowserCapability)) {
            throw new InvalidArgumentException('Browser action capability grants must be a typed list.');
        }
        $uniqueGrants = [];
        foreach ($capabilityGrants as $grant) {
            $uniqueGrants[$grant->value] = $grant;
        }
        $this->capabilityGrants = array_values($uniqueGrants);

        if (! array_is_list($allowedDomains)
            || array_any($allowedDomains, static fn (mixed $domain): bool => ! is_string($domain))) {
            throw new InvalidArgumentException('Browser action allowed domains must be a string list.');
        }
        $normalizedDomains = [];
        foreach ($allowedDomains as $domain) {
            $normalized = self::normalizeDomain($domain);
            $normalizedDomains[$normalized] = $normalized;
        }
        $this->allowedDomains = array_values($normalizedDomains);

        if ($targetDomain !== null) {
            self::normalizeDomain($targetDomain);
        }
        if ($sensitiveCategory !== null && ! in_array($sensitiveCategory, self::SENSITIVE_CATEGORIES, true)) {
            throw new InvalidArgumentException('Browser action sensitive category is unsupported.');
        }
    }

    public function hasCapability(BrowserCapability $capability): bool
    {
        return in_array($capability, $this->capabilityGrants, true);
    }

    public function targetDomainAllowed(): bool
    {
        if ($this->allowedDomains === []) {
            return true;
        }
        if ($this->targetDomain === null) {
            return false;
        }

        $target = self::normalizeDomain($this->targetDomain);
        foreach ($this->allowedDomains as $allowed) {
            if ($target === $allowed || str_ends_with($target, '.'.$allowed)) {
                return true;
            }
        }

        return false;
    }

    private static function normalizeDomain(string $domain): string
    {
        $domain = strtolower(rtrim(trim($domain), '.'));
        if ($domain === '' || strlen($domain) > 253 || preg_match('/^[a-z0-9:.\-]+$/D', $domain) !== 1) {
            throw new InvalidArgumentException('Browser action domain is invalid.');
        }

        return $domain;
    }
}
