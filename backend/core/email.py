"""Async email delivery helpers backed by Resend HTTP API."""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass

import httpx

from core.config import get_settings

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class EmailSendResult:
    email_sent: bool
    message: str
    provider_id: str | None = None
    error: str | None = None

    def as_dict(self) -> dict:
        payload = {"email_sent": self.email_sent, "message": self.message}
        if self.provider_id:
            payload["provider_id"] = self.provider_id
        if self.error:
            payload["error"] = self.error
        return payload


def _get_resend_config() -> tuple[str, str]:
    settings = get_settings()
    api_key = str(getattr(settings, "RESEND_API_KEY", "") or "").strip()
    from_email = str(getattr(settings, "RESEND_FROM_EMAIL", "") or "").strip()
    return api_key, from_email


async def send_email(to: str, subject: str, html: str) -> EmailSendResult:
    """
    Send email via Resend API (async, event-loop friendly).
    Returns an explicit success/failure result and never raises to callers.
    """
    api_key, from_email = _get_resend_config()
    if not api_key or not from_email:
        return EmailSendResult(
            email_sent=False,
            message="Email service temporarily unavailable",
            error="Resend is not configured",
        )

    payload = {
        "from": from_email,
        "to": [str(to).strip()],
        "subject": str(subject or "").strip(),
        "html": str(html or ""),
    }
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await client.post("https://api.resend.com/emails", headers=headers, content=json.dumps(payload))
        if 200 <= response.status_code < 300:
            body = response.json() if response.content else {}
            return EmailSendResult(
                email_sent=True,
                message="Email sent successfully",
                provider_id=str(body.get("id") or "").strip() or None,
            )

        logger.error("Resend send failed status=%s body=%s", response.status_code, response.text)
        return EmailSendResult(
            email_sent=False,
            message="Email service temporarily unavailable",
            error=f"resend_http_{response.status_code}",
        )
    except Exception as exc:
        logger.exception("Resend delivery failed")
        return EmailSendResult(
            email_sent=False,
            message="Email service temporarily unavailable",
            error=str(exc),
        )
