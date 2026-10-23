#!/usr/bin/env python3
"""Validate listing text only; never upload or approve an App Store release."""
import argparse
import json
from pathlib import Path
from urllib.parse import urlsplit


LIMITS = {"name": 30, "subtitle": 30, "promotionalText": 170,
          "description": 4000}
REQUIRED = {"name", "description", "keywords"}


def check_fields(draft):
    errors, measurements = [], {}
    fields = draft.get("fields")
    if not isinstance(fields, dict):
        return ["fields: expected object"], measurements
    for key in (*LIMITS, "keywords"):
        text = fields.get(key, "")
        if not isinstance(text, str):
            errors.append(f"{key}: expected text")
            continue
        measurements[key] = {"characters": len(text),
                             "utf8Bytes": len(text.encode("utf-8"))}
        if key in REQUIRED and not text.strip():
            errors.append(f"{key}: required")
        if key in LIMITS and len(text) > LIMITS[key]:
            errors.append(f"{key}: exceeds character limit {LIMITS[key]}")
        if key == "name" and len(text.strip()) < 2:
            errors.append("name: at least two characters required")
        if key == "keywords":
            if len(text.encode("utf-8")) > 100:
                errors.append("keywords: exceeds 100 UTF-8 bytes")
            if text and any(len(term.strip()) <= 2 for term in text.split(",")):
                errors.append("keywords: each comma-separated term must exceed two characters")
    return errors, measurements


def check_owner_fields(draft):
    # Check presence/URL structure only. No reachability, contact identity,
    # legal adequacy, demo credentials or review acceptance is inferred.
    owner = draft.get("ownerFields")
    if not isinstance(owner, dict):
        return ["ownerFields: expected object"]
    errors = []
    for key in ("developerName", "copyright", "supportURL", "privacyPolicyURL"):
        value = owner.get(key)
        if not isinstance(value, str) or not value.strip():
            errors.append(f"ownerFields.{key}: missing")
            continue
        if key.endswith("URL"):
            try:
                url = urlsplit(value)
                valid = url.scheme in {"https", "http"} and url.hostname and not url.username and not url.password
                _ = url.port
            except ValueError:
                valid = False
            if not valid:
                errors.append(f"ownerFields.{key}: invalid public URL structure")
    return errors


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--listing", type=Path, default=Path(__file__).resolve().parents[1] / "Docs/ReleasePreparation/listing-ja-draft.json")
    parser.add_argument("--require-owner-fields", action="store_true")
    args = parser.parse_args()
    draft = json.loads(args.listing.read_text(encoding="utf-8"))
    errors, measurements = check_fields(draft)
    missing = check_owner_fields(draft)
    if args.require_owner_fields:
        errors.extend(missing)
    print(json.dumps({"scope": "listing text limits and owner field structure only",
                      "passed": not errors, "releaseApproved": False,
                      "measurements": measurements, "errors": errors,
                      "ownerFieldsStillRequired": missing,
                      "unverified": ["feature claims", "live support/privacy pages", "private review access", "screenshots", "signed build", "App Review"]},
                     ensure_ascii=False, indent=2))
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
