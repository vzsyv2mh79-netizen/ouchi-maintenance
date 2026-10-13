#!/usr/bin/env python3
"""Build an ephemeral UI-test target for the synthetic closure review screen.
No shipping Xcode project, real account or existing simulator is modified.
"""
import argparse
import hashlib
import json
import pathlib
import plistlib
import shutil
import subprocess
import tempfile

parser = argparse.ArgumentParser()
parser.add_argument('--output', type=pathlib.Path, required=True)
parser.add_argument('--text-size', choices=['accessibility-extra-large', 'accessibility-extra-extra-extra-large'], required=True)
parser.add_argument('--runtime', default='com.apple.CoreSimulator.SimRuntime.iOS-27-0')
parser.add_argument('--appearance', choices=['light', 'dark'], default='light')
parser.add_argument('--test', choices=['closure-review'], default='closure-review')
args = parser.parse_args()
root = pathlib.Path(__file__).resolve().parents[1]
output = args.output.resolve()
if output.exists():
    raise SystemExit('Use a fresh output directory.')
output.mkdir(parents=True)
bundle = 'dev.ouchi.review.closure'
info = plistlib.loads((root / 'OuchiMaintenance/Info.plist').read_bytes())
for key, value in info.items():
    if key.startswith('OUCHI_') and key.endswith('_ENABLED') and value is not False:
        raise RuntimeError('Live feature gate must be disabled: ' + key)
sources = sorted([*root.glob('OuchiMaintenance/*.swift'), *root.glob('OuchiCore/*.swift'),
                  root / 'OuchiMaintenance/Info.plist', root / 'OuchiMaintenance.xcodeproj/project.pbxproj'])
stamp = hashlib.sha1(b''.join(str(p.relative_to(root)).encode() + b'\0' + p.read_bytes() for p in sources)).hexdigest()
manifest = {'status': 'not_run', 'sourceDigest': stamp, 'textSize': args.text_size, 'appearance': args.appearance,
            'syntheticDataOnly': True, 'productionEnabled': False, 'actualBillingEnabled': False,
            'scope': ['actual protected custody, selected-reference read, cancellation and explicit fresh submission on AX5 preview'],
            'notVerified': ['real Auth HTTP', 'actual account erasure', 'VoiceOver', 'physical locked device', 'purchases', 'distribution signing']}
manifest['testSourceSHA256'] = hashlib.sha256((root / 'UITests/AccountClosureReviewInteractionTests.swift').read_bytes()).hexdigest()
device = None

def run(*command, **kwargs):
    return subprocess.run([str(v) for v in command], check=True, **kwargs)

try:
    with tempfile.TemporaryDirectory(prefix='ouchi-ui-test-') as temporary:
        work = pathlib.Path(temporary)
        for directory in ['OuchiMaintenance', 'OuchiCore', 'Tests', 'UITests', 'OuchiMaintenance.xcodeproj']:
            shutil.copytree(root / directory, work / directory)
        shutil.copy2(root / 'Package.swift', work / 'Package.swift')
        (work / 'Config').mkdir()
        # Do not copy Local.xcconfig or read live credentials into the test build.
        (work / 'Config/Shared.xcconfig').write_text('''PRODUCT_BUNDLE_IDENTIFIER = dev.ouchi.review.closure
IPHONEOS_DEPLOYMENT_TARGET = 17.0
SWIFT_VERSION = 6.0
TARGETED_DEVICE_FAMILY = 1,2
GENERATE_INFOPLIST_FILE = YES
INFOPLIST_FILE = OuchiMaintenance/Info.plist
INFOPLIST_KEY_CFBundleDisplayName = おうちメンテ
INFOPLIST_KEY_UILaunchScreen_Generation = YES
INFOPLIST_KEY_UIApplicationSceneManifest_Generation = YES
ASSETCATALOG_COMPILER_APPICON_NAME = AppIcon
CURRENT_PROJECT_VERSION = 1
MARKETING_VERSION = 0.1.0
CODE_SIGNING_ALLOWED = YES
CODE_SIGN_IDENTITY = -
CODE_SIGN_ENTITLEMENTS = Config/ClosureReviewSimulator.entitlements
IOS_SANDBOX_BILLING = NO
SUPABASE_PROJECT_REF = aaaaaaaaaaaaaaaaaaaa
SUPABASE_PUBLISHABLE_KEY = sb_publishable_synthetic_review_only
''')
        (work / 'Config/ClosureReviewSimulator.entitlements').write_bytes(plistlib.dumps({
            'application-identifier': 'dev.ouchi.review.closure',
            'keychain-access-groups': ['dev.ouchi.review.closure'], 'get-task-allow': True}))
        info.update(OUCHI_REVIEW_SAMPLE_DATA='YES', OUCHI_REVIEW_BUILD_ID=stamp,
                    SUPABASE_URL='https://aaaaaaaaaaaaaaaaaaaa.supabase.co',
                    SUPABASE_PUBLISHABLE_KEY='sb_publishable_synthetic_review_only', IOS_SANDBOX_BILLING='NO')
        (work / 'OuchiMaintenance/Info.plist').write_bytes(plistlib.dumps(info))
        project = work / 'OuchiMaintenance.xcodeproj/project.pbxproj'
        data = plistlib.loads(subprocess.check_output(['plutil', '-convert', 'xml1', '-o', '-', str(project)]))
        objects = data['objects']
        app_id = '0E8A3AD980EC179856012B7E'
        ids = {name: hashlib.sha1(('ouchi-large-text-test-' + name).encode()).hexdigest()[:24].upper()
               for name in ['target', 'file', 'build', 'product', 'sources', 'frameworks', 'resources',
                            'group', 'debug', 'release', 'configs', 'proxy', 'dependency']}
        def add(object_key, **attributes):
            assert ids[object_key] not in objects
            objects[ids[object_key]] = attributes
        add('file', isa='PBXFileReference', lastKnownFileType='sourcecode.swift', path='AccountClosureReviewInteractionTests.swift', sourceTree='<group>')
        add('group', isa='PBXGroup', children=[ids['file']], path='UITests', sourceTree='<group>')
        add('build', isa='PBXBuildFile', fileRef=ids['file'])
        add('product', isa='PBXFileReference', explicitFileType='wrapper.cfbundle', path='OuchiInteractionTests.xctest', sourceTree='BUILT_PRODUCTS_DIR')
        for phase in ['sources', 'frameworks', 'resources']:
            add(phase, isa='PBX' + phase.capitalize() + 'BuildPhase', buildActionMask='2147483647',
                files=[ids['build']] if phase == 'sources' else [], runOnlyForDeploymentPostprocessing='0')
        settings = {'PRODUCT_NAME': '$(TARGET_NAME)', 'PRODUCT_BUNDLE_IDENTIFIER': 'dev.ouchi.review.interactions',
                    'SWIFT_VERSION': '6.0', 'IPHONEOS_DEPLOYMENT_TARGET': '17.0', 'SDKROOT': 'iphoneos',
                    'GENERATE_INFOPLIST_FILE': 'YES', 'TEST_TARGET_NAME': 'OuchiMaintenance', 'CODE_SIGNING_ALLOWED': 'YES', 'CODE_SIGN_IDENTITY': '-',
                    'TARGETED_DEVICE_FAMILY': '1,2'}
        for configuration in ['debug', 'release']:
            add(configuration, isa='XCBuildConfiguration', name=configuration.capitalize(), buildSettings=settings)
        add('configs', isa='XCConfigurationList', buildConfigurations=[ids['debug'], ids['release']],
            defaultConfigurationIsVisible='0', defaultConfigurationName='Debug')
        add('proxy', isa='PBXContainerItemProxy', containerPortal=data['rootObject'], proxyType='1',
            remoteGlobalIDString=app_id, remoteInfo='OuchiMaintenance')
        add('dependency', isa='PBXTargetDependency', target=app_id, targetProxy=ids['proxy'])
        add('target', isa='PBXNativeTarget', name='OuchiInteractionTests', productName='OuchiInteractionTests',
            productReference=ids['product'], productType='com.apple.product-type.bundle.ui-testing',
            buildConfigurationList=ids['configs'], buildPhases=[ids['sources'], ids['frameworks'], ids['resources']],
            buildRules=[], dependencies=[ids['dependency']])
        objects[data['rootObject']]['targets'].append(ids['target'])
        objects[objects[data['rootObject']]['mainGroup']]['children'].append(ids['group'])
        objects[objects[data['rootObject']]['productRefGroup']]['children'].append(ids['product'])
        project.write_bytes(plistlib.dumps(data))
        ref = '<BuildableReference BuildableIdentifier="primary" BlueprintIdentifier="' + ids['target'] + '" BuildableName="OuchiInteractionTests.xctest" BlueprintName="OuchiInteractionTests" ReferencedContainer="container:OuchiMaintenance.xcodeproj"/>'
        scheme = work / 'OuchiMaintenance.xcodeproj/xcshareddata/xcschemes/OuchiInteractions.xcscheme'
        scheme.write_text('<Scheme version="1.3"><BuildAction buildImplicitDependencies="YES"><BuildActionEntries><BuildActionEntry buildForTesting="YES">' + ref + '</BuildActionEntry></BuildActionEntries></BuildAction><TestAction buildConfiguration="Debug" shouldUseLaunchSchemeArgsEnv="NO"><Testables><TestableReference skipped="NO">' + ref + '</TestableReference></Testables></TestAction></Scheme>')
        device = subprocess.check_output(['xcrun', 'simctl', 'create', 'おうちメンテ退会依頼操作テスト',
            'com.apple.CoreSimulator.SimDeviceType.iPhone-17e', args.runtime], text=True).strip()
        manifest['simulatorUDID'] = device
        run('xcrun', 'simctl', 'boot', device)
        run('xcrun', 'simctl', 'bootstatus', device, '-b')
        run('xcrun', 'simctl', 'ui', device, 'appearance', args.appearance)
        run('xcrun', 'simctl', 'ui', device, 'content_size', args.text_size)
        with (output / 'test.log').open('w') as log:
            run('xcodebuild', '-project', work / 'OuchiMaintenance.xcodeproj', '-scheme', 'OuchiInteractions',
                '-configuration', 'Debug', '-destination', 'platform=iOS Simulator,id=' + device,
                '-derivedDataPath', work / 'DerivedData', '-resultBundlePath', output / 'InteractionTests.xcresult',
                '-parallel-testing-enabled', 'NO', '-collect-test-diagnostics', 'never',
                '-test-timeouts-enabled', 'YES', '-maximum-test-execution-time-allowance', '600',
                'CODE_SIGNING_ALLOWED=YES', 'CODE_SIGN_IDENTITY=-',
                '-only-testing:OuchiInteractionTests/AccountClosureReviewInteractionTests/testProtectedReferenceReadCancelAndExplicitNewSubmission',
                'test', stdout=log, stderr=subprocess.STDOUT)
        manifest['status'] = 'xcode_ui_tests_passed_result_inspection_required'
except BaseException:
    manifest['status'] = 'failed_or_interrupted_not_verified'
    raise
finally:
    if device:
        subprocess.run(['xcrun', 'simctl', 'shutdown', device], check=False)
        subprocess.run(['xcrun', 'simctl', 'delete', device], check=False)
        devices = json.loads(subprocess.check_output(['xcrun', 'simctl', 'list', 'devices', '-j']))
        manifest['ownedSimulatorRemoved'] = not any(d['udid'] == device for group in devices['devices'].values() for d in group)
    (output / 'verification.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
