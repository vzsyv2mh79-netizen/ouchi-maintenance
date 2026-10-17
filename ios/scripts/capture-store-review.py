#!/usr/bin/env python3
"""Capture real native sample UI; never produces submission-approved images.
Creates and removes only its own simulator. No live login, purchase or network API.
"""
import argparse
import hashlib
import json
import os
import pathlib
import plistlib
import subprocess
import tempfile
import time

parser = argparse.ArgumentParser()
parser.add_argument('--output', type=pathlib.Path, required=True)
parser.add_argument('--device', choices=['iphone', 'ipad'], default='iphone')
parser.add_argument('--iphone-size', choices=['large', 'medium'], default='large')
parser.add_argument('--appearances', nargs='+', choices=['light', 'dark'], default=['light'])
parser.add_argument('--text-sizes', nargs='+', choices=['large', 'accessibility-extra-large', 'accessibility-extra-extra-extra-large'], default=['large'])
parser.add_argument('--runtime', default='com.apple.CoreSimulator.SimRuntime.iOS-27-0')
args = parser.parse_args()
root = pathlib.Path(__file__).resolve().parents[1]
output = args.output.resolve()
output.mkdir(parents=True, exist_ok=True)
if any(output.rglob('*.png')) or any(output.rglob('*.jpg')):
    raise SystemExit('Use a fresh directory; existing captures are never overwritten.')
bundle = 'dev.ouchi.review.storecaptures'
sources = sorted([*root.glob('OuchiMaintenance/*.swift'), *root.glob('OuchiCore/*.swift'),
                  root / 'OuchiMaintenance/Info.plist', root / 'OuchiMaintenance.xcodeproj/project.pbxproj'])
source_hash = hashlib.sha1(b''.join(str(p.relative_to(root)).encode() + b'\0' + p.read_bytes() for p in sources)).hexdigest()

def run(*command, **kwargs):
    return subprocess.run([str(v) for v in command], cwd=root, check=True, **kwargs)

manifest = {'status': 'native_sample_review_not_submission_images', 'sourceDigest': source_hash,
            'bundle': bundle, 'device': args.device, 'appearances': args.appearances, 'imageFormat': 'jpeg', 'textSizes': args.text_sizes, 'syntheticDataOnly': True, 'releaseBuild': False,
            'iphoneSize': args.iphone_size if args.device == 'iphone' else None,
            'officialSpecifications': 'https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/',
            'remaining': ['Visual review', 'Family sharing detail capture', 'Final signed release build captures',
                          'Required iPad capture if iPad support retained'], 'captures': []}
device = None
completed = False
try:
    with tempfile.TemporaryDirectory(prefix='ouchi-store-capture-') as temporary:
        build = pathlib.Path(temporary)
        info = plistlib.loads((root / 'OuchiMaintenance/Info.plist').read_bytes())
        for key, value in info.items():
            if key.startswith('OUCHI_') and key.endswith('_ENABLED') and value is not False:
                raise RuntimeError('Capture requires all live feature gates disabled: ' + key)
        info['OUCHI_REVIEW_SAMPLE_DATA'] = 'YES'
        info['OUCHI_REVIEW_BUILD_ID'] = source_hash
        info['SUPABASE_URL'] = 'https://aaaaaaaaaaaaaaaaaaaa.supabase.co'
        info['SUPABASE_PUBLISHABLE_KEY'] = 'sb_publishable_synthetic_review_only'
        info['IOS_SANDBOX_BILLING'] = 'NO'
        # All live feature gates remain disabled from the source Info.plist.
        plist = build / 'Sample.plist'
        plist.write_bytes(plistlib.dumps(info))
        with (output / 'build.log').open('w') as log:
            run('xcodebuild', '-project', root / 'OuchiMaintenance.xcodeproj', '-scheme', 'OuchiMaintenance',
                '-configuration', 'Debug', '-sdk', 'iphonesimulator', '-destination', 'generic/platform=iOS Simulator',
                '-derivedDataPath', build / 'DerivedData', 'CODE_SIGNING_ALLOWED=NO',
                'PRODUCT_BUNDLE_IDENTIFIER=' + bundle, 'INFOPLIST_FILE=' + str(plist),
                'IOS_SANDBOX_BILLING=NO', 'SUPABASE_PROJECT_REF=aaaaaaaaaaaaaaaaaaaa',
                'SUPABASE_PUBLISHABLE_KEY=sb_publishable_synthetic_review_only', 'build', stdout=log, stderr=subprocess.STDOUT)
        app = build / 'DerivedData/Build/Products/Debug-iphonesimulator/OuchiMaintenance.app'
        built = plistlib.loads((app / 'Info.plist').read_bytes())
        assert built['CFBundleIdentifier'] == bundle and built['OUCHI_REVIEW_SAMPLE_DATA'] == 'YES'
        assert built['OUCHI_REVIEW_BUILD_ID'] == source_hash
        assert built['OUCHI_RELEASE_SUBSCRIPTIONS_ENABLED'] is False
        device = subprocess.check_output(['xcrun', 'simctl', 'create', 'おうちメンテ紹介画面サンプル',
            {'iphone': 'com.apple.CoreSimulator.SimDeviceType.iPhone-18-Pro-Max' if args.iphone_size == 'large' else 'com.apple.CoreSimulator.SimDeviceType.iPhone-18-Pro',
             'ipad': 'com.apple.CoreSimulator.SimDeviceType.iPad-Pro-13-inch-M5-12GB'}[args.device], args.runtime], text=True).strip()
        manifest['simulatorUDID'] = device
        run('xcrun', 'simctl', 'boot', device)
        run('xcrun', 'simctl', 'bootstatus', device, '-b')
        run('xcrun', 'simctl', 'install', device, app)
        container = pathlib.Path(subprocess.check_output(['xcrun', 'simctl', 'get_app_container', device, bundle, 'data'], text=True).strip())
        ready = container / 'Documents/OuchiCaptureReady.txt'
        for appearance in args.appearances:
            appearance_output = output / appearance
            appearance_output.mkdir()
            run('xcrun', 'simctl', 'ui', device, 'appearance', appearance)
            for text_size in args.text_sizes:
                size_output = appearance_output / text_size
                size_output.mkdir()
                run('xcrun', 'simctl', 'ui', device, 'content_size', text_size)
                for tab, name in enumerate(['home', 'care', 'products', 'history', 'settings']):
                    if ready.exists(): ready.unlink()
                    env = dict(os.environ, SIMCTL_CHILD_OUCHI_REVIEW_CAPTURE_TAB=str(tab))
                    run('xcrun', 'simctl', 'launch', device, bundle, '-AppleLanguages', '(ja)', '-AppleLocale', 'ja_JP', env=env)
                    deadline = time.monotonic() + 45
                    while not ready.exists() or ready.read_text() != str(tab):
                        if time.monotonic() >= deadline:
                            raise RuntimeError('Sample did not confirm loaded household; no screenshot accepted.')
                        time.sleep(0.2)
                    time.sleep(2)
                    path = size_output / (name + '-native.jpg')
                    run('xcrun', 'simctl', 'io', device, 'screenshot', '--type=jpeg', path)
                    manifest['captures'].append({'tab': tab, 'appearance': appearance, 'textSize': text_size, 'file': str(path.relative_to(output)), 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()})
                    run('xcrun', 'simctl', 'terminate', device, bundle)
        completed = True
finally:
    if device:
        subprocess.run(['xcrun', 'simctl', 'shutdown', device], check=False)
        subprocess.run(['xcrun', 'simctl', 'delete', device], check=False)
    manifest['status'] = 'native_sample_captured_needs_visual_review' if completed else 'capture_failed_not_accepted'
    (output / 'capture-manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
