"""Notification framework for 24-hour doctor verification alerts (framework stub only)."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Literal


@dataclass(slots=True)
class NotificationIntent:
    """Represents a queued Email/SMS notification intent without dispatching external messages."""

    status: Literal["framework_stub_queued", "skipped_guest_no_contact"]
    channel: Literal["email", "sms", "email_and_sms", "none"]
    will_notify_within_24h: bool
    eta_hours: int
    estimated_ready_at: str
    recipient_masked: str | None
    message: str
    metadata: dict[str, str] = field(default_factory=dict)

    def to_dict(self) -> dict[str, object]:
        return {
            "status": self.status,
            "channel": self.channel,
            "will_notify_within_24h": self.will_notify_within_24h,
            "eta_hours": self.eta_hours,
            "estimated_ready_at": self.estimated_ready_at,
            "recipient_masked": self.recipient_masked,
            "message": self.message,
            "metadata": self.metadata,
        }


class NotificationFramework:
    """Pluggable Email/SMS notification framework stub for doctor-verified patient updates."""

    @staticmethod
    def _mask_contact(email: str | None, phone: str | None) -> str | None:
        if phone:
            digits = phone.strip()
            return f"***{digits[-4:]}" if len(digits) >= 4 else "***"
        if email and "@" in email:
            local, domain = email.split("@", 1)
            prefix = local[:2] if len(local) >= 2 else local[:1]
            return f"{prefix}***@{domain}"
        return None

    def queue_doctor_verification_alert(
        self,
        *,
        user_email: str | None,
        user_phone: str | None,
        review_id: str,
        preferred_language: str = "en",
    ) -> NotificationIntent:
        """Prepare a 24-hour doctor verification notification intent (framework stub)."""
        now = datetime.now(UTC)
        ready_at = (now + timedelta(hours=24)).isoformat()
        is_guest = bool(user_email and user_email.endswith("@guest.medsarthi.local"))

        if is_guest and not user_phone:
            return NotificationIntent(
                status="skipped_guest_no_contact",
                channel="none",
                will_notify_within_24h=False,
                eta_hours=24,
                estimated_ready_at=ready_at,
                recipient_masked=None,
                message=(
                    "Saved for 24-hour doctor review in this guest session. "
                    "Sign in with email or phone to enable Email/SMS alerts."
                ),
                metadata={"review_id": review_id, "language": preferred_language},
            )

        has_email = bool(user_email and not is_guest)
        has_phone = bool(user_phone)
        if has_email and has_phone:
            channel: Literal["email", "sms", "email_and_sms", "none"] = "email_and_sms"
        elif has_phone:
            channel = "sms"
        elif has_email:
            channel = "email"
        else:
            channel = "none"

        return NotificationIntent(
            status="framework_stub_queued" if channel != "none" else "skipped_guest_no_contact",
            channel=channel,
            will_notify_within_24h=channel != "none",
            eta_hours=24,
            estimated_ready_at=ready_at,
            recipient_masked=self._mask_contact(user_email if has_email else None, user_phone),
            message=(
                "Notification framework queued: Email/SMS alert will be sent once a doctor "
                "verifies your prescription & conversation within 24 hours."
            ),
            metadata={"review_id": review_id, "language": preferred_language, "mode": "framework_stub"},
        )


notification_framework = NotificationFramework()
