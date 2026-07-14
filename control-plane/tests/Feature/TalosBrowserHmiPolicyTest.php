<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Services\Talos\Browser\TalosBrowserHmiPolicy;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

final class TalosBrowserHmiPolicyTest extends TestCase
{
    public function test_default_mode_allows_ordinary_controls_and_requires_confirmation_for_sensitive_controls(): void
    {
        $policy = app(TalosBrowserHmiPolicy::class);

        $this->assertSame('allow', $policy->classify($this->target(name: 'Reject optional cookies'))['decision']);
        $this->assertSame('confirm', $policy->classify($this->target(name: 'Buy now'))['decision']);
        $this->assertSame('confirm', $policy->classify($this->target(overrides: ['is_submit' => true, 'form_method' => 'post']))['decision']);
        $this->assertSame('confirm', $policy->classify($this->target(overrides: ['tag' => 'div', 'role' => null, 'name' => 'Mystery control']))['decision']);
    }

    public function test_worker_effect_attestation_can_only_raise_the_required_confirmation_level(): void
    {
        $result = app(TalosBrowserHmiPolicy::class)->classify($this->target(
            name: 'Reject optional cookies',
            overrides: [
                'effect_attestation' => 'unattestable',
                'required_effect_classification' => 'sensitive',
            ],
        ));

        $this->assertSame('confirm', $result['decision']);
        $this->assertSame('sensitive', $result['category']);
    }

    #[DataProvider('ordinaryTargetProvider')]
    public function test_approved_ordinary_matrix_is_allowed(string $name): void
    {
        $result = app(TalosBrowserHmiPolicy::class)->classify($this->target(name: $name));

        $this->assertSame('allow', $result['decision']);
        $this->assertSame('ordinary', $result['category']);
    }

    /** @return iterable<string, array{string}> */
    public static function ordinaryTargetProvider(): iterable
    {
        foreach (['Close', 'Dismiss', 'Reject', 'Cancel', 'Expand', 'Collapse', 'Next page', 'Previous page', 'Play', 'Pause'] as $name) {
            yield $name => [$name];
        }
    }

    #[DataProvider('confirmationTargetProvider')]
    public function test_approved_confirmation_matrix_never_auto_allows(string $name, array $overrides): void
    {
        $result = app(TalosBrowserHmiPolicy::class)->classify($this->target(name: $name, overrides: $overrides));

        $this->assertSame('confirm', $result['decision']);
        $this->assertNotSame('ordinary', $result['category']);
    }

    /** @return iterable<string, array{string, array<string, mixed>}> */
    public static function confirmationTargetProvider(): iterable
    {
        yield 'submit' => ['Submit', ['is_submit' => true]];
        yield 'payment' => ['Payment', []];
        yield 'communication' => ['Send message', []];
        yield 'destructive' => ['Delete account', []];
        yield 'credential' => ['Password', ['is_editable' => true, 'input_type' => 'password']];
        yield 'download' => ['Export', ['is_download' => true]];
        yield 'popup' => ['Open', ['opens_new_context' => true]];
    }

    #[DataProvider('deniedTargetProvider')]
    public function test_denied_target_facts_are_never_reclassified_as_confirmation(string $reason, array $overrides): void
    {
        $result = app(TalosBrowserHmiPolicy::class)->classify($this->target(overrides: $overrides));

        $this->assertSame('deny', $result['decision'], $reason);
    }

    /** @return iterable<string, array{string, array<string, mixed>}> */
    public static function deniedTargetProvider(): iterable
    {
        yield 'missing' => ['missing', ['missing' => true]];
        yield 'invisible' => ['invisible', ['visible' => false]];
        yield 'disabled' => ['disabled', ['disabled' => true]];
    }

    public function test_read_only_denies_and_workspace_can_only_make_the_user_mode_stricter(): void
    {
        $policy = app(TalosBrowserHmiPolicy::class);
        $ordinary = $this->target(name: 'Close');

        $this->assertSame('deny', $policy->classify($ordinary, 'read_only')['decision']);
        $this->assertSame('confirm', $policy->classify($ordinary, 'confirm_sensitive', 'confirm_every_interaction')['decision']);
        $this->assertSame('deny', $policy->classify($ordinary, 'confirm_every_interaction', 'read_only')['decision']);
        $this->assertSame('confirm_every_interaction', $policy->effectiveMode('confirm_sensitive', 'confirm_every_interaction'));
        $this->assertSame('read_only', $policy->effectiveMode('confirm_every_interaction', 'read_only'));
        $this->assertSame('confirm_sensitive', $policy->effectiveMode('invalid', null));
    }

    public function test_invalid_workspace_floor_fails_closed_instead_of_falling_back_to_user_mode(): void
    {
        $policy = app(TalosBrowserHmiPolicy::class);

        $this->assertSame('read_only', $policy->effectiveMode('confirm_sensitive', 'invalid'));
        $this->assertSame(
            'deny',
            $policy->classify($this->target(name: 'Close'), 'confirm_sensitive', 'invalid')['decision'],
        );
    }

    public function test_dynamic_buttons_without_innocuous_semantics_require_confirmation(): void
    {
        $policy = app(TalosBrowserHmiPolicy::class);

        foreach (['Confirm', 'Approve access', 'Save', 'Add to cart'] as $name) {
            $result = $policy->classify($this->target(name: $name));

            $this->assertSame('confirm', $result['decision'], $name);
            $this->assertNotSame('ordinary', $result['category'], $name);
        }
    }

    public function test_bounded_search_is_ordinary_but_unknown_descriptor_requires_confirmation(): void
    {
        $policy = app(TalosBrowserHmiPolicy::class);

        $this->assertSame('allow', $policy->classify($this->target(name: 'Search', overrides: ['is_submit' => true, 'form_method' => 'get']))['decision']);
        $this->assertSame('confirm', $policy->classify(['name' => 'Unknown', 'visible' => true, 'disabled' => false])['decision']);
    }

    #[DataProvider('httpDestinationProvider')]
    public function test_http_destinations_are_never_classified_as_ordinary(array $overrides, string $expectedCategory): void
    {
        $result = app(TalosBrowserHmiPolicy::class)->classify($this->target(
            name: 'Next page',
            overrides: $overrides,
        ));

        $this->assertSame('confirm', $result['decision']);
        $this->assertSame($expectedCategory, $result['category']);
    }

    /** @return iterable<string, array{array<string, mixed>, string}> */
    public static function httpDestinationProvider(): iterable
    {
        yield 'external GET navigation with a path' => [[
            'tag' => 'a',
            'role' => 'link',
            'href' => 'https://example.com/docs/next-page',
        ], 'external_navigation'];
        yield 'effectful POST destination' => [[
            'tag' => 'button',
            'href' => 'https://example.com/account/close',
            'form_method' => 'post',
            'is_submit' => true,
        ], 'external_commit'];
    }

    /** @return array<string, mixed> */
    private function target(string $name = 'Unknown', array $overrides = []): array
    {
        return array_replace([
            'tag' => 'button',
            'role' => 'button',
            'name' => $name,
            'input_type' => null,
            'href' => null,
            'form_method' => null,
            'is_editable' => false,
            'is_submit' => false,
            'is_download' => false,
            'opens_new_context' => false,
            'visible' => true,
            'disabled' => false,
        ], $overrides);
    }
}
