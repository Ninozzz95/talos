from __future__ import annotations

import hashlib
import hmac

from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials


class BearerTokenVerifier:
    """Store and compare only a fixed-length digest of a bearer token."""

    __slots__ = ("_digest",)

    def __init__(self, token: str) -> None:
        if not isinstance(token, str) or token == "":
            raise ValueError("token must be a non-empty string")
        self._digest = self._digest_token(token)

    @staticmethod
    def _digest_token(token: str | None) -> bytes:
        candidate = "" if token is None or not isinstance(token, str) else token
        return hashlib.sha256(candidate.encode("utf-8", errors="surrogatepass")).digest()

    def matches(self, candidate: str | None) -> bool:
        return hmac.compare_digest(self._digest, self._digest_token(candidate))


def verify_bearer(
    credentials: HTTPAuthorizationCredentials | None,
    verifier: BearerTokenVerifier,
) -> None:
    if (
        credentials is None
        or credentials.scheme.lower() != "bearer"
        or not verifier.matches(credentials.credentials)
    ):
        raise HTTPException(
            status_code=401,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )


def verify_trial_token(verifier: BearerTokenVerifier, candidate: str | None) -> bool:
    return verifier.matches(candidate)

