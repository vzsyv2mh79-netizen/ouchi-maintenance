#!/usr/bin/env python3
"""Build an ephemeral UI-test target against the actual in-memory sample app.
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
parser.add_argument('--text-size', choices=['large', 'accessibility-extra-large', 'accessibility-extra-extra-extra-large'], required=True)
parser.add_argument('--runtime', default='com.apple.CoreSimulator.SimRuntime.iOS-27-0')
parser.add_argument('--appearance', choices=['light', 'dark'], default='light')
parser.add_argument('--device-type', choices=['iPhone-18-Pro', 'iPhone-18-Pro-Max', 'iPhone-17e', 'iPhone-SE-3rd-generation'], default='iPhone-18-Pro')
parser.add_argument('--test', choices=['all', 'completion', 'completion-export', 'editor-overdue', 'overdue-dynamic-type', 'legal-links', 'editor', 'audit', 'home', 'memo', 'overdue', 'task-audits', 'family', 'home-switch', 'theme'], default='all')
args = parser.parse_args()
root = pathlib.Path(__file__).resolve().parents[1]
output = args.output.resolve()
if output.exists():
    raise SystemExit('Use a fresh output directory.')
output.mkdir(parents=True)
bundle = 'dev.ouchi.review.storecaptures'
info = plistlib.loads((root / 'OuchiMaintenance/Info.plist').read_bytes())
for key, value in info.items():
    if key.startswith('OUCHI_') and key.endswith('_ENABLED') and value is not False:
        raise RuntimeError('Live feature gate must be disabled: ' + key)
sources = sorted([*root.glob('OuchiMaintenance/*.swift'), *root.glob('OuchiCore/*.swift'),
                  root / 'OuchiMaintenance/Info.plist', root / 'OuchiMaintenance.xcodeproj/project.pbxproj'])
stamp = hashlib.sha1(b''.join(str(p.relative_to(root)).encode() + b'\0' + p.read_bytes() for p in sources)).hexdigest()
test_stamp = hashlib.sha256(pathlib.Path(__file__).read_bytes() + b'\0' +
                           (root / 'UITests/LargeTextInteractionTests.swift').read_bytes()).hexdigest()
manifest = {'status': 'not_run', 'sourceDigest': stamp, 'textSize': args.text_size, 'appearance': args.appearance, 'deviceType': args.device_type, 'selectedTest': args.test, 'auditUsesReleaseHeaderLayout': args.test in ['audit', 'memo', 'overdue', 'overdue-dynamic-type', 'task-audits', 'family', 'all'],
            'testHarnessDigest': test_stamp, 'auditIssuesFiltered': False,
            'syntheticDataOnly': True, 'productionEnabled': False, 'actualBillingEnabled': False,
            'scope': (['actual family details navigation, in-memory member decoding and fully visible member/reload controls; screenshots only, not cloud membership proof'] if args.test == 'family' else ['reviewed synthetic legal links reachable from settings privacy page; no URL opened, no live policy review or billing'] if args.test == 'legal-links' else ['isolated unfiltered Dynamic Type category on visible overdue row; does not replace seven-category audit or resolve separate contrast'] if args.test == 'overdue-dynamic-type' else ['unfiltered screen textClipped audit with complete task-product label visible', 'unfiltered screen contrast audit with complete next-date label visible; does not replace full audit'] if args.test == 'task-audits' else
                      ['complete actual sample task; exactly one history addition and next due date update', 'export action produces a reachable share control'] if args.test == 'completion-export' else
                      ['complete actual sample task; exactly one history addition and next due date update'] if args.test == 'completion' else
                      ['theme toggle and relaunch retention on isolated sample; restore starting appearance'] if args.test == 'theme' else
                      ['two synthetic homes: product/history filtering and return to original home; not cloud RLS verification'] if args.test == 'home-switch' else
                      ['product editor visible software-keyboard avoidance after scrolling/typing', 'overdue-label reachability with retained failure tree/viewport and unfiltered screen audit'] if args.test == 'editor-overdue' else
                      ['seven unfiltered accessibility audit categories after scrolling overdue-count label entirely above tab bar'] if args.test == 'overdue' else
                      ['seven unfiltered accessibility audit categories after scrolling product memo entirely above tab bar'] if args.test == 'memo' else
                      ['home menu open and current-home reselection; not multi-home switching'] if args.test == 'home' else
                      ['seven automatic accessibility audit categories on five initial tab viewports; no issue suppression'] if args.test == 'audit' else
                      ['product editor model input above open software keyboard', 'back navigation without save preserves sample model'] if args.test == 'editor' else
                      ['scroll and activate sample completion', 'next due date and history update',
                       'scroll and activate export; share control appears', 'product editor keyboard and cancel',
                       'five initial tab automatic accessibility audits', 'home menu current-home reselection', 'visible product memo accessibility audit', 'visible overdue-count accessibility audit', 'two-home product/history filtering', 'theme toggle and relaunch retention', 'focused task product clipping and next-date contrast while fully visible', 'family detail member/reload reachability using in-memory sample members']),
            'notVerified': ['real cloud persistence', 'VoiceOver', 'physical device', 'purchases', 'final signed build']}
device = None

def run(*command, **kwargs):
    return subprocess.run([str(v) for v in command], check=True, **kwargs)

try:
    # Catch harness syntax errors before creating/booting an ephemeral device.
    run('xcrun', 'swiftc', '-frontend', '-parse', root / 'UITests/LargeTextInteractionTests.swift')
    with tempfile.TemporaryDirectory(prefix='ouchi-ui-test-') as temporary:
        work = pathlib.Path(temporary)
        for directory in ['OuchiMaintenance', 'OuchiCore', 'Tests', 'UITests', 'OuchiMaintenance.xcodeproj']:
            shutil.copytree(root / directory, work / directory)
        shutil.copy2(root / 'Package.swift', work / 'Package.swift')
        (work / 'Config').mkdir()
        # Do not copy Local.xcconfig or read live credentials into the test build.
        (work / 'Config/Shared.xcconfig').write_text('''PRODUCT_BUNDLE_IDENTIFIER = dev.ouchi.review.storecaptures
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
CODE_SIGNING_ALLOWED = NO
IOS_SANDBOX_BILLING = NO
SUPABASE_PROJECT_REF = aaaaaaaaaaaaaaaaaaaa
SUPABASE_PUBLISHABLE_KEY = sb_publishable_synthetic_review_only
''')
        info.update(OUCHI_REVIEW_SAMPLE_DATA='YES', OUCHI_REVIEW_BUILD_ID=stamp,
                    SUPABASE_URL='https://aaaaaaaaaaaaaaaaaaaa.supabase.co',
                    SUPABASE_PUBLISHABLE_KEY='sb_publishable_synthetic_review_only', IOS_SANDBOX_BILLING='NO')
        if args.test in ['legal-links', 'all']:
            # Synthetic display-only destinations; the test never opens them.
            info.update(OUCHI_PURCHASE_DISCLOSURES_REVIEWED=True,
                        OUCHI_TERMS_URL='https://example.invalid/terms',
                        OUCHI_PRIVACY_URL='https://example.invalid/privacy',
                        OUCHI_SUPPORT_URL='https://example.invalid/support')
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
        add('file', isa='PBXFileReference', lastKnownFileType='sourcecode.swift', path='LargeTextInteractionTests.swift', sourceTree='<group>')
        add('group', isa='PBXGroup', children=[ids['file']], path='UITests', sourceTree='<group>')
        add('build', isa='PBXBuildFile', fileRef=ids['file'])
        add('product', isa='PBXFileReference', explicitFileType='wrapper.cfbundle', path='OuchiInteractionTests.xctest', sourceTree='BUILT_PRODUCTS_DIR')
        for phase in ['sources', 'frameworks', 'resources']:
            add(phase, isa='PBX' + phase.capitalize() + 'BuildPhase', buildActionMask='2147483647',
                files=[ids['build']] if phase == 'sources' else [], runOnlyForDeploymentPostprocessing='0')
        settings = {'PRODUCT_NAME': '$(TARGET_NAME)', 'PRODUCT_BUNDLE_IDENTIFIER': 'dev.ouchi.review.interactions',
                    'SWIFT_VERSION': '6.0', 'IPHONEOS_DEPLOYMENT_TARGET': '17.0', 'SDKROOT': 'iphoneos',
                    'GENERATE_INFOPLIST_FILE': 'YES', 'TEST_TARGET_NAME': 'OuchiMaintenance', 'CODE_SIGNING_ALLOWED': 'NO',
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
        device = subprocess.check_output(['xcrun', 'simctl', 'create', 'おうちメンテ大きい文字操作テスト',
            'com.apple.CoreSimulator.SimDeviceType.' + args.device_type, args.runtime], text=True).strip()
        manifest['simulatorUDID'] = device
        run('xcrun', 'simctl', 'boot', device)
        run('xcrun', 'simctl', 'bootstatus', device, '-b')
        run('xcrun', 'simctl', 'ui', device, 'appearance', args.appearance)
        run('xcrun', 'simctl', 'ui', device, 'content_size', args.text_size)
        with (output / 'test.log').open('w') as log:
            run('xcodebuild', '-project', work / 'OuchiMaintenance.xcodeproj', '-scheme', 'OuchiInteractions',
                '-configuration', 'Debug', '-destination', 'platform=iOS Simulator,id=' + device,
                '-derivedDataPath', work / 'DerivedData', '-resultBundlePath', output / 'InteractionTests.xcresult',
                '-parallel-testing-enabled', 'NO', '-collect-test-diagnostics', 'never', 'CODE_SIGNING_ALLOWED=NO',
                *(['-only-testing:OuchiInteractionTests/LargeTextInteractionTests/' + name for name in {'family': 'testFamilyDetailsLoadAndRemainReachable', 'legal-links': 'testReviewedLegalLinksAreReachableFromPrivacy', 'overdue-dynamic-type': 'testVisibleOverdueDynamicType', 'editor-overdue': 'testProductEditorKeyboardAndCancel,testVisibleOverdueCountAccessibilityAudit', 'completion-export': 'testCompletionUpdatesDueDateAndHistory,testExportControlReachableAndProducesShareControl', 'task-audits': 'testVisibleTaskProductClipping,testVisibleNextDateContrast', 'completion': 'testCompletionUpdatesDueDateAndHistory', 'editor': 'testProductEditorKeyboardAndCancel', 'audit': 'testInitialTabAccessibilityAudits', 'home': 'testHomeMenuCurrentHomeReselection', 'memo': 'testVisibleProductMemoAccessibilityAudit', 'overdue': 'testVisibleOverdueCountAccessibilityAudit', 'home-switch': 'testHomeSwitchKeepsRecordsInSelectedHome', 'theme': 'testAppearanceChoiceSurvivesRelaunch'}[args.test].split(',')] if args.test != 'all' else []),
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
