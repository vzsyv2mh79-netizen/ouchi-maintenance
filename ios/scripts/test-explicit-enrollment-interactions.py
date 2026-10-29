#!/usr/bin/env python3
"""Owned Simulator UI runner; prepare the build and device before starting Auth.
No existing device or shipping project is changed. Synthetic credentials only.
"""
import argparse, hashlib, json, os, pathlib, plistlib, shutil, subprocess, tempfile
parser=argparse.ArgumentParser()
parser.add_argument('--output',type=pathlib.Path,required=True)
parser.add_argument('--runtime',default='com.apple.CoreSimulator.SimRuntime.iOS-27-0')
parser.add_argument('--prepare-only',action='store_true')
parser.add_argument('--prepared',type=pathlib.Path)
args=parser.parse_args()
root=pathlib.Path(__file__).resolve().parents[1]
if args.prepare_only == bool(args.prepared):
    raise SystemExit('Choose --prepare-only or --prepared DIRECTORY')
fixture_environment={key:os.environ.get(key,'') for key in ['OUCHI_ENROLLMENT_REAL_FIXTURE','OUCHI_ENROLLMENT_TEST_EMAIL','OUCHI_ENROLLMENT_TEST_PASSWORD','OUCHI_ENROLLMENT_VERIFY_RECORDS']}
if not args.prepare_only and (fixture_environment['OUCHI_ENROLLMENT_REAL_FIXTURE']!='1' or not fixture_environment['OUCHI_ENROLLMENT_TEST_EMAIL'].endswith('@fixture.invalid') or len(fixture_environment['OUCHI_ENROLLMENT_TEST_PASSWORD'])<16):
    raise SystemExit('Requires isolated fixture credentials; refusing a skipped test.')
output=args.output.resolve()
if output.exists(): raise SystemExit('Use a fresh output directory')
output.mkdir(parents=True,mode=0o700)
info=plistlib.loads((root/'OuchiMaintenance/Info.plist').read_bytes())
for key,value in info.items():
    if key.startswith('OUCHI_') and key.endswith('_ENABLED') and value is not False:
        raise SystemExit('Live feature gate must remain disabled: '+key)
sources=sorted([*root.glob('OuchiMaintenance/*.swift'),*root.glob('OuchiCore/*.swift'),root/'UITests/ExplicitEnrollmentInteractionTests.swift',root/'OuchiMaintenance/Info.plist',root/'OuchiMaintenance.xcodeproj/project.pbxproj',pathlib.Path(__file__)])
stamp=hashlib.sha256(b''.join(p.read_bytes() for p in sources)).hexdigest()
manifest={'status':'not_run','sourceDigest':stamp,'customerDataUsed':False,'billingEnabled':False,'notVerified':['Apple purchase','Production Auth','Household persistence','physical device']}
device=None
handed_off=False
def run(*command,**kwargs):
    return subprocess.run([str(x) for x in command],check=True,**kwargs)
def prepare(work):
    for directory in ['OuchiMaintenance','OuchiCore','Tests','UITests','OuchiMaintenance.xcodeproj']:
        shutil.copytree(root/directory,work/directory)
    shutil.copy2(root/'Package.swift',work/'Package.swift')
    (work / 'Config').mkdir()
    # Do not copy Local.xcconfig or read live credentials into the test build.
    (work / 'Config/Shared.xcconfig').write_text('''PRODUCT_BUNDLE_IDENTIFIER = dev.ouchi.review.enrollment
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
        'application-identifier': 'dev.ouchi.review.enrollment',
        'keychain-access-groups': ['dev.ouchi.review.enrollment'], 'get-task-allow': True}))
    # Enable only the enrollment UI inside this disposable loopback build.
    # Source/shipping gates were checked disabled above and are never changed.
    info.update(OUCHI_REVIEW_SAMPLE_DATA='NO', OUCHI_REVIEW_BUILD_ID=stamp,
                OUCHI_EXPLICIT_ENROLLMENT_ENABLED=True,
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
    add('file', isa='PBXFileReference', lastKnownFileType='sourcecode.swift', path='ExplicitEnrollmentInteractionTests.swift', sourceTree='<group>')
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
    text_environment = ''
    scheme.write_text('<Scheme version="1.3"><BuildAction buildImplicitDependencies="YES"><BuildActionEntries><BuildActionEntry buildForTesting="YES">' + ref + '</BuildActionEntry></BuildActionEntries></BuildAction><TestAction buildConfiguration="Debug" shouldUseLaunchSchemeArgsEnv="NO"><Testables><TestableReference skipped="NO">' + ref + '</TestableReference></Testables>' + text_environment + '</TestAction></Scheme>')
runtime_manifest=None
try:
    if args.prepare_only:
        work=output/'Prepared'
        work.mkdir()
        prepare(work)
        with (output/'build.log').open('w') as log:
            run('xcodebuild','-project',work/'OuchiMaintenance.xcodeproj','-scheme','OuchiInteractions',
                '-configuration','Debug','-destination','generic/platform=iOS Simulator',
                '-derivedDataPath',work/'DerivedData','CODE_SIGNING_ALLOWED=YES','CODE_SIGN_IDENTITY=-',
                'build-for-testing',stdout=log,stderr=subprocess.STDOUT,timeout=600)
        built_info=plistlib.loads((work/'DerivedData/Build/Products/Debug-iphonesimulator/OuchiMaintenance.app/Info.plist').read_bytes())
        if built_info.get('CFBundleIdentifier')!='dev.ouchi.review.enrollment' or built_info.get('OUCHI_EXPLICIT_ENROLLMENT_ENABLED') is not True:
            raise RuntimeError('Disposable enrollment build identity/entry configuration missing')
        if any(value is not False for key,value in built_info.items()
               if key.startswith('OUCHI_') and key.endswith('_ENABLED') and key!='OUCHI_EXPLICIT_ENROLLMENT_ENABLED'):
            raise RuntimeError('Unrelated feature enabled in disposable enrollment build')
        manifests=list((work/'DerivedData/Build/Products').glob('*.xctestrun'))
        if len(manifests)!=1: raise RuntimeError('Expected exactly one prepared test manifest')
        device=subprocess.check_output(['xcrun','simctl','create','おうちメンテ登録通し確認','com.apple.CoreSimulator.SimDeviceType.iPhone-17e',args.runtime],text=True).strip()
        manifest['ownedSimulator']=device
        run('xcrun','simctl','boot',device)
        run('xcrun','simctl','bootstatus',device,'-b')
        # Install only these isolated review bundles before any Auth session exists.
        products=work/'DerivedData/Build/Products/Debug-iphonesimulator'
        for bundle in ['OuchiMaintenance.app','OuchiInteractionTests-Runner.app']:
            run('xcrun','simctl','install',device,products/bundle)
        # Require functioning XCTest accessibility before starting any Auth clock.
        with (output/'preflight.log').open('w') as log:
            run('xcodebuild','test-without-building','-xctestrun',manifests[0],
                '-destination','platform=iOS Simulator,id='+device,
                '-resultBundlePath',output/'Preparation.xcresult',
                '-parallel-testing-enabled','NO','-collect-test-diagnostics','never',
                '-only-testing:OuchiInteractionTests/ExplicitEnrollmentInteractionTests/testPreparationCanReadLoginScreen',
                stdout=log,stderr=subprocess.STDOUT,timeout=240)
        preflight=json.loads(subprocess.check_output(['xcrun','xcresulttool','get','test-results','summary','--path',str(output/'Preparation.xcresult')]))
        if preflight.get('passedTests')!=1 or preflight.get('failedTests')!=0 or preflight.get('skippedTests')!=0:
            raise RuntimeError('UI preparation must pass without skips before Auth starts')
        manifest['automationPreflightPassed']=True
        manifest.update(status='prepared_not_executed',testManifest=str(manifests[0]))
        handed_off=True
    else:
        prepared=args.prepared.resolve()
        previous=json.loads((prepared/'verification.json').read_text())
        if previous.get('status')!='prepared_not_executed' or previous.get('sourceDigest')!=stamp or previous.get('automationPreflightPassed') is not True:
            raise RuntimeError('Prepared build missing or source changed; rebuild before creating Auth sessions')
        original=pathlib.Path(previous['testManifest']).resolve()
        if not original.is_relative_to(prepared/'Prepared'): raise RuntimeError('Unexpected prepared build location')
        contents=plistlib.loads(original.read_bytes())
        injected=[]
        def inject(value):
            if isinstance(value,dict):
                if 'TestBundlePath' in value:
                    value.setdefault('EnvironmentVariables',{}).update(fixture_environment)
                    injected.append(value['TestBundlePath'])
                for item in value.values(): inject(item)
            elif isinstance(value,list):
                for item in value: inject(item)
        inject(contents)
        if len(injected)!=1: raise RuntimeError('Expected one UI test target')
        fd,path=tempfile.mkstemp(prefix='enrollment-runtime-',suffix='.xctestrun',dir=original.parent)
        runtime_manifest=pathlib.Path(path)
        with os.fdopen(fd,'wb') as stream: plistlib.dump(contents,stream)
        candidate=previous.get('ownedSimulator')
        devices=json.loads(subprocess.check_output(['xcrun','simctl','list','devices','-j']))
        matches=[d for group in devices['devices'].values() for d in group if d['udid']==candidate]
        if len(matches)!=1 or matches[0]['name']!='おうちメンテ登録通し確認' or matches[0]['state']!='Booted':
            raise RuntimeError('Prepared owned Simulator must already be booted; prepare before starting Auth')
        device=candidate
        manifest['ownedSimulator']=device
        previous['status']='runtime_claimed'
        (prepared/'verification.json').write_text(json.dumps(previous,ensure_ascii=False,indent=2)+'\n')
        with (output/'test.log').open('w') as log:
            run('xcodebuild','test-without-building','-xctestrun',runtime_manifest,
                '-destination','platform=iOS Simulator,id='+device,'-resultBundlePath',output/'Enrollment.xcresult',
                '-parallel-testing-enabled','NO','-collect-test-diagnostics','never',
                '-only-testing:OuchiInteractionTests/ExplicitEnrollmentInteractionTests/testLostAcknowledgementUsesReadOnlyConfirmation',
                stdout=log,stderr=subprocess.STDOUT,timeout=120)
        result=json.loads(subprocess.check_output(['xcrun','xcresulttool','get','test-results','summary','--path',str(output/'Enrollment.xcresult')]))
        if result.get('passedTests')!=1 or result.get('failedTests')!=0 or result.get('skippedTests')!=0:
            raise RuntimeError('Expected exactly one passed UI test, no skips')
        manifest['status']='ui_passed_database_assertions_still_required'
except BaseException:
    manifest['status']='failed_or_interrupted'
    raise
finally:
    if runtime_manifest: runtime_manifest.unlink(missing_ok=True)
    if device and not handed_off:
        subprocess.run(['xcrun','simctl','shutdown',device],check=False)
        subprocess.run(['xcrun','simctl','delete',device],check=False)
        devices=json.loads(subprocess.check_output(['xcrun','simctl','list','devices','-j']))
        manifest['ownedSimulatorRemoved']=not any(d['udid']==device for group in devices['devices'].values() for d in group)
    (output/'verification.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
