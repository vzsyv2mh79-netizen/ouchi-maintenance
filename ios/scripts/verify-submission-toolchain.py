#!/usr/bin/env python3
"""Check Apple's minimum upload SDK; does not prove signing or store acceptance."""
import argparse
import plistlib
import re
import subprocess
from pathlib import Path

MINIMUM = 26

def major(value, label):
    match = re.fullmatch(r"(\d+)(?:\.\d+)*", value.strip())
    if not match or int(match[1]) < MINIMUM:
        raise ValueError(f"{label} must be a numeric version >= {MINIMUM}: {value!r}")
    return int(match[1])

def verify_product(path):
    with path.open("rb") as stream:
        info = plistlib.load(stream)
    if info.get("DTPlatformName") != "iphoneos":
        raise ValueError("Product must be an iPhoneOS build, not a Simulator build")
    sdk = info.get("DTSDKName", "")
    if not isinstance(sdk, str) or not sdk.startswith("iphoneos"):
        raise ValueError("Missing iPhoneOS SDK metadata")
    major(sdk.removeprefix("iphoneos"), "Product SDK")
    version = info.get("DTXcode", "")
    if not isinstance(version, str) or not re.fullmatch(r"\d{4,}", version) or int(version) < 2600:
        raise ValueError("Product Xcode metadata must be >= 26")
    print(f"PASS: product SDK={sdk}, DTXcode={version}; signing/Apple acceptance not verified")

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--product-plist", type=Path)
    args = parser.parse_args()
    xcode = subprocess.check_output(["xcodebuild", "-version"], text=True, timeout=30)
    match = re.search(r"^Xcode ([^\n]+)$", xcode, re.MULTILINE)
    if not match:
        raise ValueError("Missing selected Xcode version")
    major(match[1], "Selected Xcode")
    sdk = subprocess.check_output(
        ["xcrun", "--sdk", "iphoneos", "--show-sdk-version"], text=True, timeout=30
    ).strip()
    major(sdk, "Selected iPhoneOS SDK")
    print(f"PASS: selected Xcode={match[1]}, iPhoneOS SDK={sdk}; minimum upload SDK only")
    if args.product_plist:
        verify_product(args.product_plist)

if __name__ == "__main__":
    main()
