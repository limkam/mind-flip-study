"""S3 helpers: presigned uploads, existence checks, deletes."""

from __future__ import annotations

import logging
from urllib.parse import quote

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError, NoCredentialsError

from config import settings

logger = logging.getLogger(__name__)


class S3ConfigurationError(RuntimeError):
    """Raised when S3 is not configured for presigned uploads."""


def validate_s3_configuration() -> None:
    """Fail fast at startup when S3 is required but misconfigured."""
    if not settings.S3_BUCKET_NAME.strip():
        raise S3ConfigurationError("S3_BUCKET_NAME is not set")
    if settings.ENVIRONMENT == "production":
        if not settings.AWS_ACCESS_KEY_ID or not settings.AWS_SECRET_ACCESS_KEY:
            raise S3ConfigurationError(
                "AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are required in production",
            )


def _client():
    if not settings.S3_BUCKET_NAME.strip():
        raise S3ConfigurationError("S3_BUCKET_NAME is not configured")
    kwargs: dict = {}
    if settings.AWS_ACCESS_KEY_ID:
        kwargs["aws_access_key_id"] = settings.AWS_ACCESS_KEY_ID
    if settings.AWS_SECRET_ACCESS_KEY:
        kwargs["aws_secret_access_key"] = settings.AWS_SECRET_ACCESS_KEY

    config = Config(
        region_name=settings.S3_REGION,
        signature_version="s3v4",
        s3={"addressing_style": "virtual"},
    )
    try:
        return boto3.client("s3", **kwargs, config=config)
    except NoCredentialsError as exc:
        raise S3ConfigurationError(
            "AWS credentials are missing. Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY.",
        ) from exc


def build_s3_https_url(key: str) -> str:
    """Virtual-hosted–style object URL (private bucket; for stored reference / future GET)."""
    safe_key = quote(key, safe="/")
    b, r = settings.S3_BUCKET_NAME, settings.S3_REGION
    return f"https://{b}.s3.{r}.amazonaws.com/{safe_key}"


def generate_presigned_put_url(*, key: str, content_type: str) -> str:
    try:
        return _client().generate_presigned_url(
            "put_object",
            Params={
                "Bucket": settings.S3_BUCKET_NAME,
                "Key": key,
                "ContentType": content_type,
            },
            ExpiresIn=3600,
        )
    except S3ConfigurationError:
        raise
    except ClientError as exc:
        logger.exception("S3 presign failed for key=%s", key)
        raise S3ConfigurationError("Could not generate S3 upload URL") from exc
    except Exception as exc:
        logger.exception("Unexpected S3 presign error for key=%s", key)
        raise S3ConfigurationError("Could not generate S3 upload URL") from exc


def head_object_content_length(key: str) -> int | None:
    """Return ``ContentLength`` if the object exists, else ``None``."""
    try:
        resp = _client().head_object(Bucket=settings.S3_BUCKET_NAME, Key=key)
    except ClientError as exc:  # pragma: no cover - network-specific branches
        code = exc.response.get("Error", {}).get("Code", "")
        if code in ("404", "403", "NoSuchKey", "NotFound"):
            return None
        raise
    return int(resp["ContentLength"])


def delete_object_key(key: str) -> None:
    _client().delete_object(Bucket=settings.S3_BUCKET_NAME, Key=key)


def get_object_bytes(key: str) -> bytes:
    """Download full object body (used by Celery workers)."""
    resp = _client().get_object(Bucket=settings.S3_BUCKET_NAME, Key=key)
    return resp["Body"].read()
