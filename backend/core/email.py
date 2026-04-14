"""
Email delivery helpers.

Uses Resend when configured, with an SMTP fallback for local development.
"""

from __future__ import annotations

import json
import smtplib
from email.message import EmailMessage
from urllib import error, request

from fastapi import HTTPException

from core.config import get_settings


def _get_resend_from_address() -> str:
    settings = get_settings()
    return str(getattr(settings, "RESEND_FROM_EMAIL", "") or settings.MAIL_USERNAME or "").strip()


def _send_via_resend(to_email: str, subject: str, text_body: str, html_body: str | None = None) -> None:
    settings = get_settings()
    api_key = str(getattr(settings, "RESEND_API_KEY", "") or "").strip()
    from_email = _get_resend_from_address()
    if not api_key or not from_email:
        raise RuntimeError("Resend is not configured")

    payload = {
        "from": from_email,
        "to": [to_email],
        "subject": subject,
        "text": text_body,
    }
    if html_body:
        payload["html"] = html_body

    data = json.dumps(payload).encode("utf-8")
    req = request.Request(
        "https://api.resend.com/emails",
        data=data,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with request.urlopen(req, timeout=20) as resp:
            if resp.status >= 400:
                raise RuntimeError(f"Resend returned HTTP {resp.status}")
    except error.HTTPError as exc:
        raise RuntimeError(f"Resend returned HTTP {exc.code}") from exc


def _send_via_smtp(to_email: str, subject: str, text_body: str, html_body: str | None = None) -> None:
    settings = get_settings()
    if not settings.MAIL_USERNAME or not settings.MAIL_PASSWORD:
        raise RuntimeError("SMTP is not configured")

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = settings.MAIL_USERNAME
    msg["To"] = to_email
    if html_body:
        msg.set_content(text_body)
        msg.add_alternative(html_body, subtype="html")
    else:
        msg.set_content(text_body)

    with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=20) as server:
        server.ehlo()
        server.starttls()
        server.ehlo()
        server.login(settings.MAIL_USERNAME, settings.MAIL_PASSWORD)
        server.send_message(msg)


def send_email(to_email: str, subject: str, text_body: str, html_body: str | None = None) -> None:
    """
    Send an email using Resend when configured, otherwise SMTP fallback.
    Raises HTTP 503 on delivery failure to keep frontend errors explicit.
    """
    try:
        _send_via_resend(to_email, subject, text_body, html_body)
        return
    except Exception:
        pass

    try:
        _send_via_smtp(to_email, subject, text_body, html_body)
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Email delivery failed: {exc}") from exc
