from __future__ import annotations

import os
from pathlib import Path

import pytest

from talos_human_journey.config import ConfigurationError, Settings


def valid_environment(tmp_path: Path) -> dict[str, str]:
    sidecar_token = tmp_path / "sidecar.token"
    simulator_key = tmp_path / "simulator.key"
    sidecar_token.write_text("s" * 43, encoding="utf-8")
    simulator_key.write_text("k" * 32, encoding="utf-8")
    return {
        "TALOS_HJ_SIDECAR_TOKEN_FILE": str(sidecar_token),
        "TALOS_HJ_SIMULATOR_API_KEY_FILE": str(simulator_key),
        "TALOS_HJ_SIMULATOR_PROVIDER_ID": "fixture-simulator",
        "TALOS_HJ_SIMULATOR_MODEL": "talos-user-simulator",
        "TALOS_HJ_SIMULATOR_BASE_URL": "http://127.0.0.1:43123/v1",
    }


def test_settings_loads_secret_files_and_frozen_bounded_defaults(tmp_path: Path) -> None:
    settings = Settings.from_env(valid_environment(tmp_path))

    assert settings.bind_host == "127.0.0.1"
    assert settings.auth_token == "s" * 43
    assert settings.simulator_api_key == "k" * 32
    assert settings.simulator_provider_id == "fixture-simulator"
    assert settings.simulator_model == "talos-user-simulator"
    assert settings.simulator_base_url == "http://127.0.0.1:43123/v1"
    assert settings.max_body_bytes == 262_144
    assert settings.max_trials == 10
    assert settings.max_turns == 64
    assert settings.max_output_tokens == 512
    assert settings.provider_timeout_seconds == 30
    assert settings.trial_ttl_seconds == 900

    with pytest.raises((AttributeError, TypeError)):
        settings.max_trials = 11  # type: ignore[misc]


@pytest.mark.parametrize(
    ("base_url", "accepted"),
    [
        ("http://127.0.0.1:8001/v1", True),
        ("https://models.example.test/v1", True),
        ("http://localhost:8001/v1", False),
        ("http://10.0.0.2:8001/v1", False),
        ("https://user:pass@models.example.test/v1", False),
        ("https://models.example.test/v1?token=secret", False),
        ("https://models.example.test/v1#fragment", False),
        ("ftp://models.example.test/v1", False),
    ],
)
def test_settings_accepts_only_https_or_literal_loopback_http(
    tmp_path: Path,
    base_url: str,
    accepted: bool,
) -> None:
    environment = valid_environment(tmp_path)
    environment["TALOS_HJ_SIMULATOR_BASE_URL"] = base_url

    if accepted:
        assert Settings.from_env(environment).simulator_base_url == base_url
    else:
        with pytest.raises(ConfigurationError, match="simulator base URL"):
            Settings.from_env(environment)


@pytest.mark.parametrize(
    ("name", "value"),
    [
        ("TALOS_HJ_MAX_BODY_BYTES", "1023"),
        ("TALOS_HJ_MAX_BODY_BYTES", "1048577"),
        ("TALOS_HJ_MAX_TRIALS", "0"),
        ("TALOS_HJ_MAX_TRIALS", "26"),
        ("TALOS_HJ_MAX_TURNS", "65"),
        ("TALOS_HJ_MAX_OUTPUT_TOKENS", "4097"),
        ("TALOS_HJ_PROVIDER_TIMEOUT_SECONDS", "0"),
        ("TALOS_HJ_PROVIDER_TIMEOUT_SECONDS", "121"),
        ("TALOS_HJ_TRIAL_TTL_SECONDS", "59"),
        ("TALOS_HJ_TRIAL_TTL_SECONDS", "3601"),
        ("TALOS_HJ_MAX_TRIALS", "+10"),
        ("TALOS_HJ_MAX_TRIALS", "01"),
        ("TALOS_HJ_MAX_TRIALS", "ten"),
    ],
)
def test_settings_rejects_noncanonical_or_out_of_range_numeric_values(
    tmp_path: Path,
    name: str,
    value: str,
) -> None:
    environment = valid_environment(tmp_path)
    environment[name] = value

    with pytest.raises(ConfigurationError, match=name):
        Settings.from_env(environment)


@pytest.mark.parametrize("secret_name", ["TALOS_HJ_SIDECAR_TOKEN_FILE", "TALOS_HJ_SIMULATOR_API_KEY_FILE"])
def test_settings_rejects_missing_empty_oversized_or_controlled_secrets(
    tmp_path: Path,
    secret_name: str,
) -> None:
    environment = valid_environment(tmp_path)
    secret_path = Path(environment[secret_name])

    secret_path.unlink()
    with pytest.raises(ConfigurationError, match="secret file"):
        Settings.from_env(environment)

    secret_path.write_text("", encoding="utf-8")
    with pytest.raises(ConfigurationError, match="secret file"):
        Settings.from_env(environment)

    secret_path.write_text("x" * 4097, encoding="utf-8")
    with pytest.raises(ConfigurationError, match="secret file"):
        Settings.from_env(environment)

    secret_path.write_text("valid\nsecret", encoding="utf-8")
    with pytest.raises(ConfigurationError, match="secret file"):
        Settings.from_env(environment)


def test_settings_rejects_symlinked_secret_file_when_platform_supports_it(tmp_path: Path) -> None:
    environment = valid_environment(tmp_path)
    target = tmp_path / "real.token"
    link = tmp_path / "linked.token"
    target.write_text("s" * 43, encoding="utf-8")
    try:
        os.symlink(target, link)
    except OSError:
        pytest.skip("This Windows account cannot create symlinks.")
    environment["TALOS_HJ_SIDECAR_TOKEN_FILE"] = str(link)

    with pytest.raises(ConfigurationError, match="symlink"):
        Settings.from_env(environment)

