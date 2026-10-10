#!/usr/bin/env python3
"""Compile every smoke executable against a fresh core; optionally build iOS.
All executable tests use fixtures/mock transport, never the live household.
"""
import argparse
import pathlib
import platform
import subprocess
import tempfile

parser = argparse.ArgumentParser()
parser.add_argument('--sdk', required=True, help='Compatible macOS SDK path')
parser.add_argument('--target', default=f'{platform.machine()}-apple-macosx15.0')
parser.add_argument('--ios-build', action='store_true')
parser.add_argument('--catalog', help='Optional JSON from export-web-catalog.mjs for full-catalog checks')
args = parser.parse_args()
root = pathlib.Path(__file__).resolve().parents[1]

def run(command):
    subprocess.run([str(value) for value in command], cwd=root, check=True)

with tempfile.TemporaryDirectory(prefix='ouchi-native-check-') as directory:
    build = pathlib.Path(directory)
    common = ['swiftc', '-sdk', args.sdk, '-target', args.target,
              '-swift-version', '6', '-module-cache-path', build / 'module-cache']
    run(common + ['-emit-module', '-emit-library', '-enable-testing', '-module-name', 'OuchiCore',
                  *sorted((root / 'OuchiCore').glob('*.swift')), '-o', build / 'libOuchiCore.dylib',
                  '-emit-module-path', build / 'OuchiCore.swiftmodule'])
    tests = sorted((root / 'Tests').glob('*Smoke.swift'))
    for test in tests:
        executable = build / test.stem
        run(common + ['-I', build, '-L', build, '-lOuchiCore', '-parse-as-library', test, '-o', executable])
        run([executable, args.catalog] if test.stem == 'LookupSmoke' and args.catalog else [executable])
    typechecked = ['KeychainSessionStorage.swift', 'PurchaseManager.swift', 'LocalReminders.swift', 'NativeStore.swift']
    run(common + ['-I', build, '-typecheck', *[root / 'OuchiMaintenance' / name for name in typechecked]])
    run(common + ['-D', 'DEBUG', '-I', build, '-typecheck', *[root / 'OuchiMaintenance' / name for name in typechecked]])
    run(['swiftc', '-frontend', '-parse', *sorted((root / 'OuchiMaintenance').glob('*.swift'))])
    run(['plutil', '-lint', root / 'OuchiMaintenance.xcodeproj/project.pbxproj'])
    print(f'PASS: {len(tests)} freshly compiled smoke tests, macOS typecheck, UI syntax and project plist.', flush=True)
    if args.ios_build:
        run(['xcodebuild', '-project', root / 'OuchiMaintenance.xcodeproj', '-scheme', 'OuchiMaintenance',
             '-sdk', 'iphonesimulator', '-destination', 'generic/platform=iOS Simulator',
             '-derivedDataPath', build / 'ios-build', 'CODE_SIGNING_ALLOWED=NO', 'build'])
        print('PASS: iOS Simulator SDK build. Device/network/StoreKit tests still required.', flush=True)
    else:
        print('iOS SDK build, UI rendering, real Auth/DB/notifications and StoreKit were NOT verified.', flush=True)
