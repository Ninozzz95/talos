<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Services\Talos\Browser\BrowserActionAuthorization;
use App\Services\Talos\Browser\BrowserWorkerException;
use App\Services\Talos\Browser\TalosBrowserActionCapabilityIssuer;
use DateTimeImmutable;
use Lcobucci\JWT\Configuration;
use Lcobucci\JWT\Signer\Ecdsa\Sha256;
use Lcobucci\JWT\Signer\Key\InMemory;
use Lcobucci\JWT\UnencryptedToken;
use Lcobucci\JWT\Validation\Constraint\SignedWith;
use Tests\TestCase;

final class TalosBrowserActionCapabilityIssuerTest extends TestCase
{
    public function test_issues_an_exact_short_lived_es256_policy_capability(): void
    {
        [$privateKey, $publicKey] = $this->keypair('prime256v1');
        $issuer = new TalosBrowserActionCapabilityIssuer(
            base64_encode($privateKey),
            'browser-action-key-2026-07',
            30,
            static fn (): DateTimeImmutable => new DateTimeImmutable('@1750000010'),
        );
        $request = [
            'tool_use_id' => 'click-123',
            'name' => 'browser_click',
            'arguments' => ['target' => 'r7', 'snapshot_id' => 'snap_123', 'state_version' => 4],
        ];

        $compact = $issuer->issue(
            'talos-user:1',
            'brw_123',
            'browser_click',
            4,
            $request,
            BrowserActionAuthorization::policy('click-123'),
        );

        $configuration = Configuration::forAsymmetricSigner(
            new Sha256,
            InMemory::plainText($privateKey),
            InMemory::plainText($publicKey),
        );
        $token = $configuration->parser()->parse($compact);
        $this->assertInstanceOf(UnencryptedToken::class, $token);
        $this->assertTrue($configuration->validator()->validate(
            $token,
            new SignedWith(new Sha256, InMemory::plainText($publicKey)),
        ));
        $this->assertSame('ES256', $token->headers()->get('alg'));
        $this->assertSame('talos-browser-action+jwt', $token->headers()->get('typ'));
        $this->assertSame('browser-action-key-2026-07', $token->headers()->get('kid'));
        $this->assertSame('urn:talos:control-plane', $token->claims()->get('iss'));
        $this->assertSame('talos-user:1', $token->claims()->get('sub'));
        $this->assertSame(['urn:talos:browser-worker'], $token->claims()->get('aud'));
        $this->assertSame(30, $token->claims()->get('exp')->getTimestamp() - $token->claims()->get('iat')->getTimestamp());
        $this->assertSame([
            'schema_version' => 'talos.browser.action-capability.v1',
            'owner_ref' => 'talos-user:1',
            'worker_session_id' => 'brw_123',
            'action_id' => 'click-123',
            'operation' => 'browser_click',
            'precondition_state_version' => 4,
            'request' => $request,
            'authorization' => [
                'kind' => 'policy',
                'policy' => 'talos_browser_semantic_click',
            ],
        ], $token->claims()->get('https://talo.sh/claims/browser-action'));
        $this->assertMatchesRegularExpression('/^[^.]+\.[^.]+\.[^.]+$/', $compact);
        $this->assertSame($issuer->descriptor(), [
            'schema_version' => 'talos.browser.action-capability.v1',
            'algorithm' => 'ES256',
            'type' => 'talos-browser-action+jwt',
            'issuer' => 'urn:talos:control-plane',
            'audience' => 'urn:talos:browser-worker',
            'key_id' => 'browser-action-key-2026-07',
            'max_ttl_seconds' => 30,
        ]);
    }

    public function test_user_approval_hashes_the_execution_lease_and_never_exposes_it(): void
    {
        $authorization = BrowserActionAuthorization::userApproval(
            'hmi_cmd_1',
            'approval-1',
            'sha256:'.str_repeat('a', 64),
            'execution-lease-secret',
        );

        $this->assertSame([
            'kind' => 'user_approval',
            'approval_id' => 'approval-1',
            'approval_request_sha256' => 'sha256:'.str_repeat('a', 64),
            'execution_lease_sha256' => 'sha256:'.hash('sha256', 'execution-lease-secret'),
        ], $authorization->toCapabilityAttestation());
        $this->assertSame('hmi_cmd_1', $authorization->actionId());
        $this->assertStringNotContainsString('execution-lease-secret', serialize($authorization));
    }

    public function test_hmi_ref_capability_requires_user_approval_attestation(): void
    {
        [$privateKey] = $this->keypair('prime256v1');
        $issuer = new TalosBrowserActionCapabilityIssuer(
            base64_encode($privateKey),
            'browser-action-ref-key',
            30,
            static fn (): DateTimeImmutable => new DateTimeImmutable('@1750000010'),
        );
        $request = [
            'schema_version' => 'talos_browser_hmi_ref_v2',
            'interaction_id' => '123e4567-e89b-42d3-a456-426614174000',
            'command_id' => 'hmi-ref-1',
            'state_version' => 4,
            'expected_frame_sha256' => 'sha256:'.str_repeat('a', 64),
            'snapshot_id' => 'hmi_ref_'.str_repeat('b', 64),
            'ref' => 'e7',
            'button' => 'left',
            'click_count' => 1,
            'expected_fingerprint' => 'sha256:'.str_repeat('c', 64),
            'effect_classification' => 'sensitive',
            'sensitive_effect_authorized' => true,
        ];

        $compact = $issuer->issue(
            'talos-user:1',
            'brw_123',
            'hmi_ref_execute',
            4,
            $request,
            BrowserActionAuthorization::userApproval(
                'hmi-ref-1',
                'approval-ref-1',
                'sha256:'.str_repeat('d', 64),
                'execution-lease-ref-1',
            ),
        );
        $claims = $this->decodePayload($compact);
        $privateClaim = $claims[TalosBrowserActionCapabilityIssuer::PRIVATE_CLAIM] ?? null;

        $this->assertIsArray($privateClaim);
        $this->assertSame('hmi_ref_execute', $privateClaim['operation']);
        $this->assertSame($request, $privateClaim['request']);
        $this->assertSame('user_approval', $privateClaim['authorization']['kind']);

        try {
            $issuer->issue(
                'talos-user:1',
                'brw_123',
                'hmi_ref_execute',
                4,
                $request,
                BrowserActionAuthorization::policy('hmi-ref-1'),
            );
            $this->fail('A policy attestation authorized a human HMI ref action.');
        } catch (BrowserWorkerException $error) {
            $this->assertSame('TALOS_BROWSER_ACTION_CAPABILITY_INVALID', $error->errorCode);
        }
    }

    public function test_normalizes_fractional_clock_values_to_integer_numeric_dates(): void
    {
        [$privateKey] = $this->keypair('prime256v1');
        $clockValue = DateTimeImmutable::createFromFormat('U.u', '1750000010.875642');
        $this->assertInstanceOf(DateTimeImmutable::class, $clockValue);
        $issuer = new TalosBrowserActionCapabilityIssuer(
            base64_encode($privateKey),
            'browser-action-integer-time-key',
            30,
            static fn (): DateTimeImmutable => $clockValue,
        );

        $compact = $issuer->issue(
            'talos-user:1',
            'brw_123',
            'browser_click',
            0,
            [
                'tool_use_id' => 'integer-time-click',
                'name' => 'browser_click',
                'arguments' => ['target' => 'r1', 'snapshot_id' => 'snap_1', 'state_version' => 0],
            ],
            BrowserActionAuthorization::policy('integer-time-click'),
        );
        $claims = $this->decodePayload($compact);

        $this->assertSame(1_750_000_010, $claims['iat']);
        $this->assertSame(1_750_000_010, $claims['nbf']);
        $this->assertSame(1_750_000_040, $claims['exp']);
    }

    public function test_rejects_wrong_curve_key_id_ttl_list_requests_and_action_mismatch(): void
    {
        [$p384Private] = $this->keypair('secp384r1');
        $this->expectException(BrowserWorkerException::class);
        new TalosBrowserActionCapabilityIssuer(base64_encode($p384Private), 'valid-key');
    }

    public function test_rejects_invalid_issuer_inputs(): void
    {
        [$privateKey] = $this->keypair('prime256v1');

        foreach ([
            static fn () => new TalosBrowserActionCapabilityIssuer('not-base64', 'valid-key'),
            static fn () => new TalosBrowserActionCapabilityIssuer(base64_encode($privateKey), 'invalid key id'),
            static fn () => new TalosBrowserActionCapabilityIssuer(base64_encode($privateKey), 'valid-key', 31),
        ] as $factory) {
            try {
                $factory();
                $this->fail('Invalid action capability configuration was accepted.');
            } catch (BrowserWorkerException $error) {
                $this->assertSame('TALOS_BROWSER_ACTION_CAPABILITY_CONFIGURATION_INVALID', $error->errorCode);
            }
        }

        $issuer = new TalosBrowserActionCapabilityIssuer(base64_encode($privateKey), 'valid-key');
        foreach ([
            [[], BrowserActionAuthorization::policy('click-1')],
            [['tool_use_id' => 'click-1', 'name' => 'browser_click'], BrowserActionAuthorization::policy('different-action')],
        ] as [$request, $authorization]) {
            try {
                $issuer->issue('owner-1', 'brw_1', 'browser_click', 0, $request, $authorization);
                $this->fail('Invalid action capability input was accepted.');
            } catch (BrowserWorkerException $error) {
                $this->assertSame('TALOS_BROWSER_ACTION_CAPABILITY_INVALID', $error->errorCode);
            }
        }
    }

    /** @return array{0: string, 1: string} */
    private function keypair(string $curve): array
    {
        $key = openssl_pkey_new([
            'private_key_type' => OPENSSL_KEYTYPE_EC,
            'curve_name' => $curve,
        ]);
        $this->assertNotFalse($key);
        $privateKey = '';
        $this->assertTrue(openssl_pkey_export($key, $privateKey));
        $details = openssl_pkey_get_details($key);
        $this->assertIsArray($details);
        $this->assertIsString($details['key'] ?? null);

        return [$privateKey, $details['key']];
    }

    /** @return array<string, mixed> */
    private function decodePayload(string $compact): array
    {
        $encoded = explode('.', $compact)[1] ?? '';
        $encoded .= str_repeat('=', (4 - strlen($encoded) % 4) % 4);
        $json = base64_decode(strtr($encoded, '-_', '+/'), true);
        $this->assertIsString($json);
        $payload = json_decode($json, true, 512, JSON_THROW_ON_ERROR);
        $this->assertIsArray($payload);

        return $payload;
    }
}
