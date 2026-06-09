#!/usr/bin/env python3
"""Apply S3 bucket CORS from infra/s3-cors.json (required for browser presigned PUT uploads)."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError

ROOT = Path(__file__).resolve().parents[3]
CORS_FILE = ROOT / "infra" / "s3-cors.json"


def main() -> int:
    # Import after sys.path is set when run from repo root or services/api.
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    from config import settings  # noqa: PLC0415

    if not settings.S3_BUCKET_NAME.strip():
        print("S3_BUCKET_NAME is not set", file=sys.stderr)
        return 1
    if not settings.AWS_ACCESS_KEY_ID or not settings.AWS_SECRET_ACCESS_KEY:
        print("AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are required", file=sys.stderr)
        return 1
    if not CORS_FILE.is_file():
        print(f"CORS config not found: {CORS_FILE}", file=sys.stderr)
        return 1

    rules = json.loads(CORS_FILE.read_text())
    client = boto3.client(
        "s3",
        aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
        aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
        config=Config(
            region_name=settings.S3_REGION,
            signature_version="s3v4",
            s3={"addressing_style": "virtual"},
        ),
    )

    try:
        client.put_bucket_cors(Bucket=settings.S3_BUCKET_NAME, CORSConfiguration={"CORSRules": rules})
    except ClientError as exc:
        print(f"Failed to apply CORS to {settings.S3_BUCKET_NAME}: {exc}", file=sys.stderr)
        return 1

    print(f"Applied CORS to s3://{settings.S3_BUCKET_NAME} ({settings.S3_REGION}) from {CORS_FILE}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
