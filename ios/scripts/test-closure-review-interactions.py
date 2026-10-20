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
parser.add_argument('--text-size', choices=['large', 'accessibility-extra-extra-extra-large'], required=True)
parser.add_argument('--runtime', default='com.apple.CoreSimulator.SimRuntime.iOS-27-0')
parser.add_argument('--appearance', choices=['light', 'dark'], default='light')
parser.add_argument('--test', choices=['retained-removal', 'retained-files', 'same-number-retry', 'closure-review', 'keyboard-toolbar-probe', 'failed-reread', 'home-management', 'closure-progress', 'closure-custody', 'closure-local-cleanup', 'closure-root', 'closure-root-interruption'], default='closure-review')
parser.add_argument('--omit-input-accessory', '--omit-keyboard-toolbar', dest='omit_keyboard_toolbar', action='store_true', help='Diagnostic temporary copy only; requires keyboard-toolbar-probe')
args = parser.parse_args()
if args.omit_keyboard_toolbar and args.test != 'keyboard-toolbar-probe':
    raise SystemExit('Toolbar removal is diagnostic only; never use it for the full operation test.')
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
            'scope': ['actual protected custody, selected-reference read, cancellation and explicit fresh submission on selected preview text size'],
            'notVerified': ['real Auth HTTP', 'actual account erasure', 'VoiceOver', 'physical locked device', 'purchases', 'distribution signing']}
manifest['testSourceSHA256'] = hashlib.sha256((root / 'UITests/AccountClosureReviewInteractionTests.swift').read_bytes()).hexdigest()
manifest['selectedTest'] = args.test
manifest['previewTextMode'] = 'large' if args.text_size == 'large' else 'ax5'
manifest['temporaryToolbarProjection'] = args.omit_keyboard_toolbar
if args.test == 'keyboard-toolbar-probe':
    manifest['scope'] = ['Diagnostic read/cancel and scroll to password section only; no full request/keyboard-flow completion claim']
if args.test == 'failed-reread':
    manifest['scope'] = ['Confirmed receipt then rejected cached reply clears visible status/cancel action, displays uncertainty and retains selected reference/count2; synthetic preview only']
if args.test == 'closure-root-interruption':
    manifest['scope'] = ['Full NativeRoot flow with actual SessionController Auth Keychain erasure, then bounded guarded DEBUG pause before real AppAttest pending marker finalization. XCTest terminates the process. Restart refuses implicit reseeding and requires absent protected Auth, matching pending marker/deadline, original protected capability hashes and removed owned pending files. Logged-out saved-reference flow freshly confirms canonical completion and retries actual cleanup/recovery. Preserves full family filtering/local-only logout/original-key and foreign-file checks. Synthetic network only.']
if args.test == 'closure-root':
    manifest['scope'] = ['Full NativeRoot sign-in/settings/saved references. Real SessionController and protected Keychain; injected synthetic Auth password protocol, retired owner enrollment denial, capability-only status, explicit local cleanup switches to real sign-in hierarchy, restart without reseeding, family account filtering/running result and local-only remote sign-out. Original owner and family capability hashes plus foreign export retained. No live network, customer erasure or billing.']
if args.test == 'closure-local-cleanup':
    manifest['scope'] = ['Actual native cleanup with synthetic protected Auth Keychain, owned snapshot/upload/removal/export and AppAttest closure marker; foreign export and original protected read capability retained; restart proves no reseeding and capability-only status. Synthetic backend only; no customer data or remote deletion.']
if args.test == 'closure-custody':
    manifest['scope'] = ['Actual protected iOS Keychain custody before synthetic registration with lost acknowledgement; process restart proves original key against synthetic durable server hash, read-only recovery, unavailable reread retains key and clears old confirmation/status. No actual local erasure.']
if args.test == 'closure-progress':
    manifest['scope'] = ['Synthetic real-job states pending/running/failed/complete then unavailable; mutations remain hidden and protected submission count stays2. No receipt-registration or local erasure claim.']
if args.test == 'home-management':
    manifest['scope'] = ['Prepared member screen: explicit claim, simulated lost COMMIT acknowledgement, same protected Keychain request after app restart, read-only result reconciliation and explicit local-reference cleanup; synthetic backend only']
    manifest['notVerified'].extend(['Live settings/enrollment HTTP composition', 'real server commit or Auth policy', 'ownerless retirement and file custody'])
manifest['selectedTest'] = args.test
manifest['testHarnessDigest'] = hashlib.sha256(pathlib.Path(__file__).read_bytes() + b'\0' + (root / 'UITests/AccountClosureReviewInteractionTests.swift').read_bytes()).hexdigest()
if args.test == 'same-number-retry':
    manifest['scope'] = ['actual protected original reference selected after exact synthetic missing progress/review', 'same-number retry password/keyboard/consent/confirmation controls', 'accepted response preserves selected original ID and protected reference count; no real Auth/network']
if args.test == 'retained-files':
    manifest['scope'] = ['Exact shipping retained-family section in isolated Form; reload, PDF/photo action and pagination reachability; no destructive control']
    manifest['notVerified'] = ['Parent product form state, live Auth/Storage/download or ShareLink, physical device, billing, signing']
if args.test == 'retained-removal':
    manifest['scope'] = ['Shipping retained-family and pending-removal sections in isolated sample Form: explicit cancel preserves PDF, simulated uncertain removal hides download, same-ID retry clears pending while other photo remains. No network or real deletion.']
    manifest['notVerified'] = ['Parent product form integration', 'live Auth/Storage erasure and server retry', 'VoiceOver', 'physical device', 'billing', 'signing']
device = None

def run(*command, **kwargs):
    return subprocess.run([str(v) for v in command], check=True, **kwargs)

try:
    with tempfile.TemporaryDirectory(prefix='ouchi-ui-test-') as temporary:
        work = pathlib.Path(temporary)
        for directory in ['OuchiMaintenance', 'OuchiCore', 'Tests', 'UITests', 'OuchiMaintenance.xcodeproj']:
            shutil.copytree(root / directory, work / directory)
        shutil.copy2(root / 'Package.swift', work / 'Package.swift')
        if args.omit_keyboard_toolbar:
            view = work / 'OuchiMaintenance/AccountClosureReviewView.swift'
            code = view.read_text()
            marker = '        .toolbar {' if '        .toolbar {' in code else '        .safeAreaInset(edge: .bottom) {'
            start = code.index(marker)
            end = code.index('        .confirmationDialog(', start)
            code = code[:start] + code[end:]
            view.write_text(code)
            manifest['derivedViewSHA256'] = hashlib.sha256(code.encode()).hexdigest()
            manifest['removedInputAccessoryKind'] = marker.strip()
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
        text_environment = '<EnvironmentVariables><EnvironmentVariable key="OUCHI_UI_TEXT_MODE" value="' + manifest['previewTextMode'] + '" isEnabled="YES"/></EnvironmentVariables>'
        scheme.write_text('<Scheme version="1.3"><BuildAction buildImplicitDependencies="YES"><BuildActionEntries><BuildActionEntry buildForTesting="YES">' + ref + '</BuildActionEntry></BuildActionEntries></BuildAction><TestAction buildConfiguration="Debug" shouldUseLaunchSchemeArgsEnv="NO"><Testables><TestableReference skipped="NO">' + ref + '</TestableReference></Testables>' + text_environment + '</TestAction></Scheme>')
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
                '-only-testing:OuchiInteractionTests/AccountClosureReviewInteractionTests/' + {'retained-removal':'testRetainedFamilyRemovalCancelAndUncertainRetry', 'retained-files':'testRetainedFamilyFilesReachableWithoutDeletionControls', 'same-number-retry':'testMissingIntakeExplicitlyRetriesOriginalProtectedNumber', 'closure-root-interruption':'testRealRootRecoversAfterProcessTerminationBetweenAuthErasureAndMarkerFinalization', 'closure-root':'testRealRootRetiredOwnerCleanupLoginRecoveryAndFamilyAccountFiltering', 'closure-local-cleanup':'testScopedLocalCleanupErasesOwnedFilesAndAuthButKeepsCapabilityAfterRestart', 'closure-custody':'testProtectedCustodySurvivesLostReplyAndRestartWithoutRotation', 'closure-progress':'testRealJobProgressHidesMutationsAndKeepsUncertainReference', 'keyboard-toolbar-probe':'testKeyboardToolbarWarningDiagnostic', 'failed-reread':'testFailedRereadClearsVisibleReceiptAndRetainsReference', 'closure-review':'testProtectedReferenceReadCancelAndExplicitNewSubmission', 'home-management':'testManagementUnknownCommitRestartsWithSameProtectedReference'}[args.test],
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
