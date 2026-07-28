#!/usr/bin/env python3
"""Validate this repository against the GTM Community Template Gallery contract.

The gallery publishes no submission-status feedback and re-checks repositories on a
2-3 day cycle, so a violation is invisible until it becomes an outage: SUP-1008 was
found by a customer ~24h after the LICENSE was replaced. This script is the only
place a violation can be caught before it ships.

Contract: https://developers.google.com/tag-platform/tag-manager/templates/gallery

Run locally from the repository root:

    python3 scripts/validate-gallery.py

Exits 0 when every check passes, 1 otherwise. All violations are reported, not just
the first, so one CI run tells you everything that is wrong.
"""

import json
import re
import subprocess
import sys
from pathlib import Path

METADATA_PATH = Path("metadata.yaml")
TEMPLATE_PATH = Path("template.tpl")
LICENSE_PATH = Path("LICENSE")

# The complete set of category values the gallery accepts.
ALLOWED_CATEGORIES = {
    "ADVERTISING",
    "AFFILIATE_MARKETING",
    "ANALYTICS",
    "ATTRIBUTION",
    "CHAT",
    "CONVERSIONS",
    "DATA_WAREHOUSING",
    "EMAIL_MARKETING",
    "EXPERIMENTATION",
    "HEAT_MAP",
    "LEAD_GENERATION",
    "MARKETING",
    "PERSONALIZATION",
    "REMARKETING",
    "SALES",
    "SESSION_RECORDING",
    "SOCIAL",
    "SURVEY",
    "TAG_MANAGEMENT",
    "UTILITY",
}

# Phrases that must never appear in LICENSE. Replacing the Apache 2.0 text with
# Axeptio's proprietary notice is what caused SUP-1008 — the gallery requires the
# contents to be *only* Apache 2.0.
FORBIDDEN_IN_LICENSE = (
    "axeptio_contract",
    "IMPORTANT LICENSE NOTICE",
    "AVIS IMPORTANT",
)

errors: list[str] = []
warnings: list[str] = []


def fail(check: str, detail: str) -> None:
    errors.append(f"{check}: {detail}")


def warn(check: str, detail: str) -> None:
    warnings.append(f"{check}: {detail}")


def git(*args: str) -> subprocess.CompletedProcess:
    return subprocess.run(("git",) + args, capture_output=True, text=True)


def check_required_files() -> None:
    """Required files, at the repository root, with exact casing."""
    for path in (LICENSE_PATH, METADATA_PATH, TEMPLATE_PATH):
        if not path.is_file():
            fail("required-files", f"{path} is missing from the repository root")

    # The gallery requires the licence filename in all caps. A case-insensitive
    # filesystem (macOS) resolves LICENSE/license alike, so ask git, which is
    # case-sensitive and matches what GitHub actually serves.
    tracked = git("ls-files").stdout.split()
    if LICENSE_PATH.is_file() and "LICENSE" not in tracked:
        fail(
            "required-files", "LICENSE is not tracked at the root with all-caps casing"
        )

    # "Each Git repository should only have one template.tpl file."
    tpls = [p for p in tracked if p.endswith("template.tpl")]
    if len(tpls) > 1:
        fail(
            "single-template",
            f"expected exactly one template.tpl, found {len(tpls)}: {tpls}",
        )
    elif tpls and tpls != ["template.tpl"]:
        fail(
            "single-template",
            f"template.tpl must be at the repository root, found at {tpls[0]}",
        )


def check_license() -> None:
    if not LICENSE_PATH.is_file():
        return
    body = LICENSE_PATH.read_text(encoding="utf-8")

    if "Apache License" not in body or "Version 2.0" not in body:
        fail("license-apache", "LICENSE does not contain the Apache License 2.0 text")
    if "TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION" not in body:
        fail(
            "license-apache",
            "LICENSE is missing the Apache 2.0 terms and conditions body",
        )

    for phrase in FORBIDDEN_IN_LICENSE:
        if phrase.lower() in body.lower():
            fail(
                "license-only-apache",
                f"LICENSE contains {phrase!r}. The gallery requires the contents to be "
                "ONLY Apache 2.0 and delists templates that differ (SUP-1008).",
            )


def load_metadata() -> dict | None:
    if not METADATA_PATH.is_file():
        return None
    try:
        import yaml
    except ImportError:
        fail("metadata-parse", "PyYAML is not installed (pip install pyyaml)")
        return None
    try:
        data = yaml.safe_load(METADATA_PATH.read_text(encoding="utf-8"))
    except Exception as exc:  # noqa: BLE001 - any parse error is a failure
        fail("metadata-parse", f"metadata.yaml is not valid YAML: {exc}")
        return None
    if not isinstance(data, dict):
        fail("metadata-parse", "metadata.yaml does not parse to a mapping")
        return None
    return data


def check_metadata_fields(data: dict) -> list:
    for field in ("homepage", "documentation"):
        value = data.get(field)
        if not isinstance(value, str) or not value.strip():
            fail("metadata-fields", f"`{field}` is missing or empty")
        elif not value.startswith(("http://", "https://")):
            fail("metadata-fields", f"`{field}` is not a URL: {value!r}")

    versions = data.get("versions")
    if not isinstance(versions, list) or not versions:
        fail("metadata-fields", "`versions` is missing or empty")
        return []
    return versions


def check_versions(versions: list) -> None:
    """Every sha must be real and on the current branch, newest first."""
    shas = []
    for index, entry in enumerate(versions):
        if not isinstance(entry, dict) or "sha" not in entry:
            fail("versions-shape", f"versions[{index}] has no `sha`")
            continue
        # str() because YAML types an all-digit sha as an int. A real one is
        # effectively never all digits, and the coercion loses leading zeros so
        # the hex check below rejects it — noisy but fail-safe, never a silent pass.
        sha = str(entry["sha"])
        if not re.fullmatch(r"[0-9a-f]{40}", sha):
            fail(
                "versions-sha",
                f"versions[{index}].sha is not a 40-character hex commit: {sha!r}. "
                "A placeholder here would break the gallery.",
            )
            continue
        if git("cat-file", "-e", f"{sha}^{{commit}}").returncode != 0:
            fail(
                "versions-sha",
                f"versions[{index}].sha {sha[:8]} does not exist in this repository",
            )
            continue
        if git("merge-base", "--is-ancestor", sha, "HEAD").returncode != 0:
            fail(
                "versions-sha",
                f"versions[{index}].sha {sha[:8]} is not an ancestor of HEAD — "
                "the gallery serves template.tpl from that commit, so it must be on the branch",
            )
            continue
        shas.append((index, sha))

    # "ordered in reverse chronological order, (most recent to oldest)" — this is
    # what the gallery indexes by, so a mis-ordered list publishes the wrong version.
    for (i, newer), (j, older) in zip(shas, shas[1:]):
        if git("merge-base", "--is-ancestor", older, newer).returncode != 0:
            fail(
                "versions-order",
                f"versions[{i}] ({newer[:8]}) is not a descendant of versions[{j}] ({older[:8]}); "
                "entries must be newest first",
            )


def check_latest_marker() -> None:
    """The `# Latest version` marker is a comment, so YAML parsing cannot see it.

    It is part of Google's published sample and was removed once already, so check
    the raw text: the marker must sit directly above the first entry.
    """
    if not METADATA_PATH.is_file():
        return
    lines = METADATA_PATH.read_text(encoding="utf-8").splitlines()
    try:
        versions_at = next(
            i for i, l in enumerate(lines) if re.fullmatch(r"versions:\s*", l)
        )
    except StopIteration:
        fail("latest-marker", "no `versions:` key found in metadata.yaml")
        return

    after = [l for l in lines[versions_at + 1 :] if l.strip()]
    if not after:
        fail("latest-marker", "`versions:` has no entries")
        return
    if after[0].strip() != "# Latest version":
        fail(
            "latest-marker",
            f"the line after `versions:` should be `# Latest version`, found {after[0].strip()!r}",
        )


def check_template_info() -> None:
    if not TEMPLATE_PATH.is_file():
        return
    # UTF-8 with BOM — decoding as plain utf-8 corrupts the first marker.
    source = TEMPLATE_PATH.read_text(encoding="utf-8-sig")

    try:
        start = source.index("___INFO___") + len("___INFO___")
        end = source.index("___TEMPLATE_PARAMETERS___")
    except ValueError:
        fail("template-info", "could not locate the ___INFO___ block in template.tpl")
        return

    try:
        info = json.loads(source[start:end].strip())
    except json.JSONDecodeError as exc:
        fail("template-info", f"___INFO___ is not valid JSON: {exc}")
        return

    categories = info.get("categories")
    if categories is None:
        fail(
            "template-categories",
            "___INFO___ has no `categories`. The gallery requires at least one "
            f"(max three) from: {', '.join(sorted(ALLOWED_CATEGORIES))}",
        )
        return
    if not isinstance(categories, list) or not 1 <= len(categories) <= 3:
        fail(
            "template-categories",
            f"`categories` must be a list of 1-3 values, got {categories!r}",
        )
        return
    unknown = [c for c in categories if c not in ALLOWED_CATEGORIES]
    if unknown:
        fail("template-categories", f"unsupported category value(s): {unknown}")


def check_issues_enabled() -> None:
    """Documented but demonstrably not enforced, so this only warns.

    The sibling gallery repo axeptio/axeptio-gtm-public-variable has Issues disabled
    and remains listed, as did this repository for years.
    """
    result = subprocess.run(
        ["gh", "api", "repos/{owner}/{repo}", "--jq", ".has_issues"],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        return  # no gh or no token: not worth failing the build over
    if result.stdout.strip() == "false":
        warn(
            "issues-enabled",
            "GitHub Issues are disabled; the gallery docs ask for them to be on",
        )


def main() -> int:
    check_required_files()
    check_license()
    data = load_metadata()
    if data is not None:
        check_versions(check_metadata_fields(data))
        check_latest_marker()
    check_template_info()
    check_issues_enabled()

    for warning in warnings:
        print(f"warning  {warning}")
    if errors:
        print(f"\n{len(errors)} gallery contract violation(s):\n", file=sys.stderr)
        for error in errors:
            print(f"  FAIL  {error}", file=sys.stderr)
        print(
            "\nSee https://developers.google.com/tag-platform/tag-manager/templates/gallery",
            file=sys.stderr,
        )
        return 1

    print("OK  repository satisfies the GTM Community Template Gallery contract")
    return 0


if __name__ == "__main__":
    sys.exit(main())
