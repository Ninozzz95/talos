from __future__ import annotations


class OcrFault(Exception):
    """A safe, stable fault that may cross the OCR worker boundary."""

    def __init__(
        self,
        code: str,
        safe_message: str,
        *,
        status_code: int,
        retryable: bool = False,
    ) -> None:
        super().__init__(safe_message)
        self.code = code
        self.safe_message = safe_message
        self.status_code = status_code
        self.retryable = retryable

