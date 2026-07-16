<?php

declare(strict_types=1);

use Kadmos\Browser\Contract\BrowserActionKind;
use Kadmos\Browser\Contract\BrowserActionRisk;
use Kadmos\Browser\Contract\BrowserAutonomyProfile;
use Kadmos\Browser\Contract\BrowserCapability;
use Kadmos\Browser\Budget\BrowserBudget;
use Kadmos\Browser\Policy\BrowserActionDisposition;
use Kadmos\Browser\Policy\BrowserActionPolicy;
use Kadmos\Browser\Policy\BrowserActionPolicyContext;
use Kadmos\Browser\Recovery\BrowserRecoveryClassifier;
use Kadmos\Browser\Recovery\BrowserRecoveryObservation;
use Kadmos\Browser\Recovery\BrowserRecoveryStrategy;

require_once __DIR__.'/../../vendor/autoload.php';

function assertBrowserOrchestration(bool $condition, string $message): void
{
    if (! $condition) {
        throw new RuntimeException($message);
    }
}

/** @param list<BrowserCapability> $grants @param list<string> $allowedDomains */
function browserPolicyContext(
    BrowserActionKind $kind,
    BrowserActionRisk $risk,
    BrowserAutonomyProfile $profile,
    array $grants,
    ?string $targetDomain = 'example.test',
    array $allowedDomains = [],
    ?string $sensitiveCategory = null,
    bool $exactApprovalGranted = false,
    bool $production = true,
    bool $developerOverride = false,
): BrowserActionPolicyContext {
    return new BrowserActionPolicyContext(
        kind: $kind,
        risk: $risk,
        autonomyProfile: $profile,
        capabilityGrants: $grants,
        targetDomain: $targetDomain,
        allowedDomains: $allowedDomains,
        sensitiveCategory: $sensitiveCategory,
        exactApprovalGranted: $exactApprovalGranted,
        production: $production,
        developerOverride: $developerOverride,
    );
}

function testPolicyMatrixKeepsReadAndMutationAuthorityDistinct(): void
{
    $policy = new BrowserActionPolicy;
    $read = $policy->decide(browserPolicyContext(
        BrowserActionKind::Navigate,
        BrowserActionRisk::Read,
        BrowserAutonomyProfile::Observe,
        [BrowserCapability::Navigate],
    ));
    assertBrowserOrchestration($read->disposition === BrowserActionDisposition::Allow, 'Observe should allow a granted read action.');
    assertBrowserOrchestration($read->allowsModelDispatch(), 'Allowed read should be dispatchable.');

    $observeMutation = $policy->decide(browserPolicyContext(
        BrowserActionKind::Click,
        BrowserActionRisk::Reversible,
        BrowserAutonomyProfile::Observe,
        [BrowserCapability::Click],
    ));
    assertBrowserOrchestration($observeMutation->disposition === BrowserActionDisposition::Deny, 'Observe must deny model mutation.');

    $assistMutation = $policy->decide(browserPolicyContext(
        BrowserActionKind::Click,
        BrowserActionRisk::Reversible,
        BrowserAutonomyProfile::Assist,
        [BrowserCapability::Click],
    ));
    assertBrowserOrchestration($assistMutation->disposition === BrowserActionDisposition::Confirm, 'Assist mutation must stop for exact confirmation.');

    $approvedMutation = $policy->decide(browserPolicyContext(
        BrowserActionKind::Click,
        BrowserActionRisk::Reversible,
        BrowserAutonomyProfile::Assist,
        [BrowserCapability::Click],
        exactApprovalGranted: true,
    ));
    assertBrowserOrchestration($approvedMutation->disposition === BrowserActionDisposition::Allow, 'Exact approval should release the same reversible action.');

    $actMutation = $policy->decide(browserPolicyContext(
        BrowserActionKind::Click,
        BrowserActionRisk::Reversible,
        BrowserAutonomyProfile::Act,
        [BrowserCapability::Click],
    ));
    assertBrowserOrchestration($actMutation->disposition === BrowserActionDisposition::Allow, 'Act may run an explicitly granted reversible action.');

    $customWithoutGrant = $policy->decide(browserPolicyContext(
        BrowserActionKind::Click,
        BrowserActionRisk::Reversible,
        BrowserAutonomyProfile::Custom,
        [],
    ));
    assertBrowserOrchestration($customWithoutGrant->disposition === BrowserActionDisposition::Deny, 'Custom must deny absent grants.');
}

function testCapabilityAndDomainRestrictionsOnlyTightenAuthority(): void
{
    $policy = new BrowserActionPolicy;
    $missingGrant = $policy->decide(browserPolicyContext(
        BrowserActionKind::Navigate,
        BrowserActionRisk::Read,
        BrowserAutonomyProfile::Act,
        [],
    ));
    assertBrowserOrchestration($missingGrant->reasonCode === 'browser_policy_capability_denied', 'Missing server grant must fail closed.');

    $blockedDomain = $policy->decide(browserPolicyContext(
        BrowserActionKind::Navigate,
        BrowserActionRisk::Read,
        BrowserAutonomyProfile::Act,
        [BrowserCapability::Navigate],
        targetDomain: 'blocked.example',
        allowedDomains: ['allowed.example'],
    ));
    assertBrowserOrchestration($blockedDomain->reasonCode === 'browser_policy_domain_denied', 'Domain policy must tighten an otherwise granted action.');

    $allowedSubdomain = $policy->decide(browserPolicyContext(
        BrowserActionKind::Navigate,
        BrowserActionRisk::Read,
        BrowserAutonomyProfile::Act,
        [BrowserCapability::Navigate],
        targetDomain: 'shop.allowed.example',
        allowedDomains: ['allowed.example'],
    ));
    assertBrowserOrchestration($allowedSubdomain->disposition === BrowserActionDisposition::Allow, 'An explicitly allowed registrable domain should cover its subdomains.');
}

function testCredentialAndPaymentCategoriesRemainHumanOnly(): void
{
    $policy = new BrowserActionPolicy;

    foreach (['credential', 'recovery_code', 'two_factor', 'payment_data', 'payment_confirmation'] as $category) {
        foreach (BrowserAutonomyProfile::cases() as $profile) {
            $decision = $policy->decide(browserPolicyContext(
                BrowserActionKind::Type,
                BrowserActionRisk::Sensitive,
                $profile,
                [BrowserCapability::Type],
                sensitiveCategory: $category,
                exactApprovalGranted: true,
                production: false,
                developerOverride: true,
            ));
            assertBrowserOrchestration(
                $decision->disposition === BrowserActionDisposition::HumanOnly,
                "{$category} must remain human-only for {$profile->value}.",
            );
            assertBrowserOrchestration(! $decision->allowsModelDispatch(), 'Human-only input must never reach model dispatch.');
        }
    }
}

function testConsequentialEffectsBindApprovalAndDeveloperOverride(): void
{
    $policy = new BrowserActionPolicy;
    $unapproved = $policy->decide(browserPolicyContext(
        BrowserActionKind::Click,
        BrowserActionRisk::Irreversible,
        BrowserAutonomyProfile::Act,
        [BrowserCapability::Click],
    ));
    assertBrowserOrchestration($unapproved->disposition === BrowserActionDisposition::Confirm, 'Act must confirm irreversible effects.');

    $approved = $policy->decide(browserPolicyContext(
        BrowserActionKind::Click,
        BrowserActionRisk::Irreversible,
        BrowserAutonomyProfile::Act,
        [BrowserCapability::Click],
        exactApprovalGranted: true,
    ));
    assertBrowserOrchestration($approved->disposition === BrowserActionDisposition::Allow, 'Exact approval should release the bound irreversible effect.');

    $productionOverride = $policy->decide(browserPolicyContext(
        BrowserActionKind::Click,
        BrowserActionRisk::Reversible,
        BrowserAutonomyProfile::Assist,
        [BrowserCapability::Click],
        production: true,
        developerOverride: true,
    ));
    assertBrowserOrchestration($productionOverride->disposition === BrowserActionDisposition::Confirm, 'Developer override must be inert in production.');

    $localOverride = $policy->decide(browserPolicyContext(
        BrowserActionKind::Click,
        BrowserActionRisk::Reversible,
        BrowserAutonomyProfile::Assist,
        [BrowserCapability::Click],
        production: false,
        developerOverride: true,
    ));
    assertBrowserOrchestration($localOverride->reasonCode === 'browser_policy_developer_override', 'Explicit local override should be visible in the decision.');
    assertBrowserOrchestration($localOverride->allowsModelDispatch(), 'Explicit local override may release non-protected actions.');
}

function testBudgetAllowsExactBoundaryAndReportsEveryExceededLimit(): void
{
    $budget = BrowserBudget::fromArray([
        'max_actions' => 20,
        'max_elapsed_ms' => 120000,
        'max_bytes' => 10485760,
        'max_tabs' => 4,
        'max_domains' => 3,
        'max_tokens' => 8000,
    ]);

    $atBoundary = $budget->evaluate([
        'actions' => 19,
        'elapsed_ms' => 119999,
        'bytes' => 10485759,
        'tabs' => 3,
        'domains' => 2,
        'tokens' => 7999,
    ], [
        'actions' => 1,
        'elapsed_ms' => 1,
        'bytes' => 1,
        'tabs' => 1,
        'domains' => 1,
        'tokens' => 1,
    ]);
    assertBrowserOrchestration($atBoundary->allowed, 'A candidate exactly at every configured boundary must remain allowed.');
    assertBrowserOrchestration($atBoundary->exhaustedLimits === [], 'An exact boundary must not be reported as exhausted.');

    $overEveryLimit = $budget->evaluate($atBoundary->projectedUsage, [
        'actions' => 1,
        'elapsed_ms' => 1,
        'bytes' => 1,
        'tabs' => 1,
        'domains' => 1,
        'tokens' => 1,
    ]);
    assertBrowserOrchestration(! $overEveryLimit->allowed, 'A candidate over any configured boundary must fail closed.');
    assertBrowserOrchestration($overEveryLimit->exhaustedLimits === [
        'max_actions',
        'max_elapsed_ms',
        'max_bytes',
        'max_tabs',
        'max_domains',
        'max_tokens',
    ], 'The budget decision must report every exceeded limit in canonical order.');
}

function testBudgetRejectsUnknownOrMalformedCountersAndKeepsLegacyLimitsCompatible(): void
{
    $legacy = BrowserBudget::fromArray([
        'max_actions' => 20,
        'max_elapsed_ms' => 120000,
        'max_bytes' => 10485760,
        'max_tabs' => 4,
    ]);
    assertBrowserOrchestration($legacy->limits() === [
        'max_actions' => 20,
        'max_elapsed_ms' => 120000,
        'max_bytes' => 10485760,
        'max_tabs' => 4,
    ], 'Legacy four-limit budgets must retain their canonical shape.');

    foreach ([
        fn () => BrowserBudget::fromArray([...$legacy->limits(), 'max_unknown' => 1]),
        fn () => BrowserBudget::fromArray(['max_actions' => 20]),
        fn () => $legacy->evaluate(['actions' => -1]),
        fn () => $legacy->evaluate(['actions' => 1.5]),
        fn () => $legacy->evaluate(['unknown' => 1]),
        fn () => $legacy->evaluate([], ['tokens' => '1']),
    ] as $invalidOperation) {
        try {
            $invalidOperation();
            throw new RuntimeException('Malformed budget input unexpectedly passed validation.');
        } catch (InvalidArgumentException) {
            // Expected fail-closed boundary.
        }
    }
}

function recoveryObservation(array $overrides = []): BrowserRecoveryObservation
{
    return new BrowserRecoveryObservation(...array_values(array_replace([
        'ownershipVerified' => true,
        'journalIntegrityVerified' => true,
        'versionVerified' => true,
        'policyVerified' => true,
        'workerAvailable' => true,
        'dispatchState' => 'not_dispatched',
        'evidenceCommitted' => false,
        'consequentialAction' => false,
        'safeCheckpointAvailable' => true,
        'idempotencyIntentMatches' => true,
        'currentFrameVerified' => true,
    ], $overrides)));
}

function testRecoveryClassifierImplementsTheDurableTruthTable(): void
{
    $classifier = new BrowserRecoveryClassifier;

    $cases = [
        [recoveryObservation(), BrowserRecoveryStrategy::Resume, 'browser_recovery_safe_resume'],
        [recoveryObservation(['dispatchState' => 'committed', 'evidenceCommitted' => true]), BrowserRecoveryStrategy::Resume, 'browser_recovery_result_replay'],
        [recoveryObservation(['dispatchState' => 'committed']), BrowserRecoveryStrategy::Reconcile, 'browser_recovery_evidence_reconcile'],
        [recoveryObservation(['dispatchState' => 'ambiguous']), BrowserRecoveryStrategy::Reconcile, 'browser_recovery_action_reconcile'],
        [recoveryObservation(['workerAvailable' => false]), BrowserRecoveryStrategy::Fork, 'browser_recovery_safe_fork'],
        [recoveryObservation(['dispatchState' => 'ambiguous', 'consequentialAction' => true]), BrowserRecoveryStrategy::WaitForUser, 'browser_recovery_consequential_ambiguous'],
        [recoveryObservation(['ownershipVerified' => false]), BrowserRecoveryStrategy::Fail, 'browser_recovery_ownership_unverified'],
        [recoveryObservation(['journalIntegrityVerified' => false]), BrowserRecoveryStrategy::Fail, 'browser_recovery_journal_invalid'],
        [recoveryObservation(['versionVerified' => false]), BrowserRecoveryStrategy::Fail, 'browser_recovery_version_unverified'],
        [recoveryObservation(['policyVerified' => false]), BrowserRecoveryStrategy::Fail, 'browser_recovery_policy_unverified'],
    ];

    foreach ($cases as [$observation, $expectedStrategy, $expectedReason]) {
        $decision = $classifier->classify($observation);
        assertBrowserOrchestration($decision->strategy === $expectedStrategy, "Recovery strategy {$expectedStrategy->value} was not selected.");
        assertBrowserOrchestration($decision->reasonCode === $expectedReason, "Recovery reason {$expectedReason} was not preserved.");
    }

    $unverifiedFrame = $classifier->classify(recoveryObservation([
        'dispatchState' => 'ambiguous',
        'consequentialAction' => true,
        'currentFrameVerified' => false,
    ]));
    assertBrowserOrchestration($unverifiedFrame->strategy === BrowserRecoveryStrategy::Fail, 'Human recovery choices require a current verified frame.');
}

function testRecoveryObservationRejectsUnknownDispatchState(): void
{
    try {
        recoveryObservation(['dispatchState' => 'probably_dispatched']);
        throw new RuntimeException('Unknown dispatch state unexpectedly passed validation.');
    } catch (InvalidArgumentException) {
        // Expected fail-closed boundary.
    }
}

$tests = [
    'testPolicyMatrixKeepsReadAndMutationAuthorityDistinct',
    'testCapabilityAndDomainRestrictionsOnlyTightenAuthority',
    'testCredentialAndPaymentCategoriesRemainHumanOnly',
    'testConsequentialEffectsBindApprovalAndDeveloperOverride',
    'testBudgetAllowsExactBoundaryAndReportsEveryExceededLimit',
    'testBudgetRejectsUnknownOrMalformedCountersAndKeepsLegacyLimitsCompatible',
    'testRecoveryClassifierImplementsTheDurableTruthTable',
    'testRecoveryObservationRejectsUnknownDispatchState',
];

foreach ($tests as $test) {
    $test();
    echo $test.' passed'.PHP_EOL;
}

echo 'All Browser orchestration tests passed'.PHP_EOL;
