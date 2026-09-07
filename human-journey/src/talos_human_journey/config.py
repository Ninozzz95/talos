from __future__ import annotations

import os
import stat
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlsplit


class ConfigurationError(ValueError):
    """Raised when sidecar startup configuration is unsafe or malformed."""


_NUMERIC_SETTINGS: dict[str, tuple[int, int, int]] = {
    "TALOS_HJ_MAX_BODY_BYTES": (1_024, 1_048_576, 262_144),
    "TALOS_HJ_MAX_TRIALS": (1, 25, 10),
    "TALOS_HJ_MAX_TURNS": (1, 64, 64),
    "TALOS_HJ_MAX_OUTPUT_TOKENS": (1, 4_096, 512),
    "TALOS_HJ_PROVIDER_TIMEOUT_SECONDS": (1, 120, 30),
    "TALOS_HJ_TRIAL_TTL_SECONDS": (60, 3_600, 900),
}


def _parse_bounded_integer(environment: Mapping[str, str], name: str) -> int:
    minimum, maximum, default = _NUMERIC_SETTINGS[name]
    raw_value = environment.get(name)
    if raw_value is None:
        return default
    if not raw_value.isascii() or not raw_value.isdecimal():
        raise ConfigurationError(f"{name} must be a canonical decimal integer")
    value = int(raw_value)
    if str(value) != raw_value or not minimum <= value <= maximum:
        raise ConfigurationError(f"{name} must be between {minimum} and {maximum}")
    return value


def _parse_required_text(
    environment: Mapping[str, str],
    name: str,
    *,
    maximum_bytes: int = 256,
) -> str:
    value = environment.get(name)
    if value is None or value == "" or value != value.strip():
        raise ConfigurationError(f"{name} is required")
    try:
        encoded = value.encode("utf-8", errors="strict")
    except UnicodeError as error:
        raise ConfigurationError(f"{name} must be valid UTF-8") from error
    if len(encoded) > maximum_bytes or any(ord(character) < 32 or ord(character) == 127 for character in value):
        raise ConfigurationError(f"{name} contains an invalid value")
    return value


def read_secret_file(
    raw_path: str | None,
    *,
    label: str,
    minimum_bytes: int = 1,
    maximum_bytes: int = 4_096,
) -> str:
    """Read one bounded UTF-8 secret without accepting links or controls."""

    if raw_path is None or raw_path == "" or raw_path != raw_path.strip():
        raise ConfigurationError(f"{label} secret file is required")

    path = Path(raw_path)
    try:
        before = path.lstat()
    except OSError as error:
        raise ConfigurationError(f"{label} secret file is unavailable") from error
    if stat.S_ISLNK(before.st_mode):
        raise ConfigurationError(f"{label} secret file cannot be a symlink")
    if not stat.S_ISREG(before.st_mode):
        raise ConfigurationError(f"{label} secret file must be a regular file")
    if not minimum_bytes <= before.st_size <= maximum_bytes:
        raise ConfigurationError(f"{label} secret file has an invalid size")

    flags = os.O_RDONLY | getattr(os, "O_BINARY", 0) | getattr(os, "O_NOINHERIT", 0)
    flags |= getattr(os, "O_NOFOLLOW", 0)
    try:
        descriptor = os.open(path, flags)
        try:
            opened = os.fstat(descriptor)
            if not stat.S_ISREG(opened.st_mode):
                raise ConfigurationError(f"{label} secret file must be a regular file")
            if before.st_dev != opened.st_dev or before.st_ino != opened.st_ino:
                raise ConfigurationError(f"{label} secret file changed while it was read")
            payload = os.read(descriptor, maximum_bytes + 1)
        finally:
            os.close(descriptor)
    except ConfigurationError:
        raise
    except OSError as error:
        raise ConfigurationError(f"{label} secret file is unavailable") from error

    if not minimum_bytes <= len(payload) <= maximum_bytes:
        raise ConfigurationError(f"{label} secret file has an invalid size")
    try:
        secret = payload.decode("utf-8", errors="strict")
    except UnicodeError as error:
        raise ConfigurationError(f"{label} secret file must contain valid UTF-8") from error
    if any(ord(character) < 32 or ord(character) == 127 for character in secret):
        raise ConfigurationError(f"{label} secret file contains control characters")
    return secret


def parse_provider_base_url(value: str) -> str:
    """Accept HTTPS providers or cleartext on literal IPv4 loopback only."""

    if value == "" or value != value.strip() or any(ord(character) < 32 for character in value):
        raise ConfigurationError("simulator base URL is invalid")
    try:
        parsed = urlsplit(value)
        port = parsed.port
    except ValueError as error:
        raise ConfigurationError("simulator base URL is invalid") from error
    if parsed.scheme not in {"http", "https"} or parsed.hostname is None:
        raise ConfigurationError("simulator base URL must use HTTPS or literal loopback HTTP")
    if parsed.username is not None or parsed.password is not None or parsed.query or parsed.fragment:
        raise ConfigurationError("simulator base URL cannot contain credentials, query, or fragment")
    if parsed.scheme == "http" and parsed.hostname != "127.0.0.1":
        raise ConfigurationError("simulator base URL cleartext is limited to literal 127.0.0.1")
    if port is not None and not 1 <= port <= 65_535:
        raise ConfigurationError("simulator base URL has an invalid port")
    return value


@dataclass(frozen=True, slots=True)
class Settings:
    """Validated startup-only sidecar configuration."""

    bind_host: str
    auth_token: str
    simulator_api_key: str
    simulator_provider_id: str
    simulator_model: str
    simulator_base_url: str
    max_body_bytes: int
    max_trials: int
    max_turns: int
    max_output_tokens: int
    provider_timeout_seconds: int
    trial_ttl_seconds: int

    @classmethod
    def from_env(cls, environment: Mapping[str, str] | None = None) -> Settings:
        values = os.environ if environment is None else environment
        return cls(
            bind_host="127.0.0.1",
            auth_token=read_secret_file(
                values.get("TALOS_HJ_SIDECAR_TOKEN_FILE"),
                label="sidecar token",
                minimum_bytes=32,
            ),
            simulator_api_key=read_secret_file(
                values.get("TALOS_HJ_SIMULATOR_API_KEY_FILE"),
                label="simulator API key",
            ),
            simulator_provider_id=_parse_required_text(values, "TALOS_HJ_SIMULATOR_PROVIDER_ID", maximum_bytes=128),
            simulator_model=_parse_required_text(values, "TALOS_HJ_SIMULATOR_MODEL"),
            simulator_base_url=parse_provider_base_url(
                _parse_required_text(values, "TALOS_HJ_SIMULATOR_BASE_URL", maximum_bytes=2_048)
            ),
            max_body_bytes=_parse_bounded_integer(values, "TALOS_HJ_MAX_BODY_BYTES"),
            max_trials=_parse_bounded_integer(values, "TALOS_HJ_MAX_TRIALS"),
            max_turns=_parse_bounded_integer(values, "TALOS_HJ_MAX_TURNS"),
            max_output_tokens=_parse_bounded_integer(values, "TALOS_HJ_MAX_OUTPUT_TOKENS"),
            provider_timeout_seconds=_parse_bounded_integer(values, "TALOS_HJ_PROVIDER_TIMEOUT_SECONDS"),
            trial_ttl_seconds=_parse_bounded_integer(values, "TALOS_HJ_TRIAL_TTL_SECONDS"),
        )

