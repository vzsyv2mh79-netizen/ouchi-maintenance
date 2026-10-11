#!/usr/bin/env python3
"""Generate a separate macOS hosted-test project, never the shipping iOS target."""
from pathlib import Path
import hashlib
import json
import plistlib

root = Path(__file__).resolve().parent
project = root / 'LocalStoreKitCatalog.xcodeproj'
project.mkdir(exist_ok=True)
objects = {}
def key(name): return hashlib.sha256(('ouchi-local-storekit:' + name).encode()).hexdigest()[:24].upper()
def obj(label, isa, **values):
    identity = key(label); objects[identity] = dict(isa=isa, **values); return identity
def ref(name, path, kind, source='<group>'):
    return obj(name, 'PBXFileReference', lastKnownFileType=kind, path=path, sourceTree=source)
host = ref('host-source','LocalStoreKitHost.swift','sourcecode.swift')
tests = ref('tests-source','LocalStoreKitCatalogTests.swift','sourcecode.swift')
catalog = ref('catalog','OuchiLocal.storekit','text')
purchase = ref('purchase-source','../OuchiMaintenance/PurchaseManager.swift','sourcecode.swift')
native_sources = [ref('native-'+name, '../OuchiMaintenance/'+name+'.swift','sourcecode.swift') for name in ['NativeStore','KeychainSessionStorage','LocalReminders','NativeReviewFixture']]
# Extract the actual shipping tip view; only visibility differs in the test module.
ui_source = (root.parent/'OuchiMaintenance/NativeRootView.swift').read_text()
ui_start = ui_source.index('private struct ReleaseTipPurchaseSection: View {')
ui_end = ui_source.index('\nprivate struct FormalReminderSettingsView:', ui_start)
ui_body = ui_source[ui_start:ui_end].replace('private struct ReleaseTipPurchaseSection:', 'struct ReleaseTipPurchaseSection:', 1)
(root/'ReleaseTipUIReview.swift').write_text('import SwiftUI\nimport StoreKit\nimport OuchiCore\n\n'+ui_body+'\n')
native_sources.append(ref('tip-ui-source','ReleaseTipUIReview.swift','sourcecode.swift'))

package=obj('core-package','XCLocalSwiftPackageReference',relativePath='..')
core=obj('core-product','XCSwiftPackageProductDependency',package=package,productName='OuchiCore')
app_product = ref('app-product','LocalStoreKitHost.app','wrapper.application','BUILT_PRODUCTS_DIR')
test_product = ref('test-product','LocalStoreKitCatalogTests.xctest','wrapper.cfbundle','BUILT_PRODUCTS_DIR')
def phase(name, isa, refs):
    builds = [obj(name+str(i), 'PBXBuildFile', fileRef=r) for i,r in enumerate(refs)]
    return obj(name, isa, buildActionMask=2147483647, files=builds, runOnlyForDeploymentPostprocessing=0)
app_sources=phase('app-sources','PBXSourcesBuildPhase',[host])
test_sources=phase('test-sources','PBXSourcesBuildPhase',[tests,purchase,*native_sources])
core_build=obj('core-link','PBXBuildFile',productRef=core)
test_frameworks=obj('test-frameworks','PBXFrameworksBuildPhase',buildActionMask=2147483647,files=[core_build],runOnlyForDeploymentPostprocessing=0)
test_resources=phase('test-resources','PBXResourcesBuildPhase',[catalog])
common={'SDKROOT':'macosx','MACOSX_DEPLOYMENT_TARGET':'15.2','SWIFT_VERSION':'6.0','CODE_SIGNING_ALLOWED':'NO','ENABLE_APP_SANDBOX':'NO','ENABLE_HARDENED_RUNTIME':'NO','GENERATE_INFOPLIST_FILE':'YES','PRODUCT_NAME':'$(TARGET_NAME)','CLANG_ENABLE_MODULES':'YES','LD_RUNPATH_SEARCH_PATHS':['$(inherited)','@executable_path/../Frameworks','@loader_path/../Frameworks']}
def configs(name, extra):
    ids=[]
    for configuration in ['Debug','Release']:
        settings=dict(common,**extra)
        settings['ONLY_ACTIVE_ARCH']='YES'
        settings['SWIFT_OPTIMIZATION_LEVEL']='-Onone' if configuration=='Debug' else '-O'
        if configuration=='Debug': settings['SWIFT_ACTIVE_COMPILATION_CONDITIONS']='DEBUG OUCHI_LOCAL_STOREKIT_TESTS' if name=='test' else 'DEBUG'
        ids.append(obj(name+configuration,'XCBuildConfiguration',buildSettings=settings,name=configuration))
    return obj(name+'configs','XCConfigurationList',buildConfigurations=ids,defaultConfigurationIsVisible=0,defaultConfigurationName='Debug')
host_info={'CFBundleExecutable':'$(EXECUTABLE_NAME)','CFBundleIdentifier':'$(PRODUCT_BUNDLE_IDENTIFIER)',
           'CFBundleName':'$(PRODUCT_NAME)','CFBundlePackageType':'APPL','CFBundleShortVersionString':'1.0',
           'CFBundleVersion':'1','LSMinimumSystemVersion':'$(MACOSX_DEPLOYMENT_TARGET)',
           'NSPrincipalClass':'NSApplication','SKIncludeConsumableInAppPurchaseHistory':True,'OUCHI_LOCAL_TIP_UI_REVIEW':'$(OUCHI_LOCAL_TIP_UI_REVIEW)'}
(root/'LocalStoreKitHost-Info.plist').write_bytes(plistlib.dumps(host_info))
app_configs=configs('app',{'PRODUCT_BUNDLE_IDENTIFIER':'dev.ouchi.review.storekit.catalog','GENERATE_INFOPLIST_FILE':'NO','INFOPLIST_FILE':'LocalStoreKitHost-Info.plist'})
test_configs=configs('test',{'PRODUCT_BUNDLE_IDENTIFIER':'dev.ouchi.review.storekit.catalog.tests','TEST_HOST':'$(BUILT_PRODUCTS_DIR)/LocalStoreKitHost.app/Contents/MacOS/LocalStoreKitHost','BUNDLE_LOADER':'$(TEST_HOST)','FRAMEWORK_SEARCH_PATHS':['$(inherited)','$(PLATFORM_DIR)/Developer/Library/Frameworks']})
app_id=obj('app-target','PBXNativeTarget',buildConfigurationList=app_configs,buildPhases=[app_sources],buildRules=[],dependencies=[],name='LocalStoreKitHost',productName='LocalStoreKitHost',productReference=app_product,productType='com.apple.product-type.application')
proxy=obj('dependency-proxy','PBXContainerItemProxy',containerPortal=key('project'),proxyType=1,remoteGlobalIDString=app_id,remoteInfo='LocalStoreKitHost')
dependency=obj('dependency','PBXTargetDependency',target=app_id,targetProxy=proxy)
test_id=obj('test-target','PBXNativeTarget',buildConfigurationList=test_configs,buildPhases=[test_sources,test_resources,test_frameworks],buildRules=[],dependencies=[dependency],packageProductDependencies=[core],name='LocalStoreKitCatalogTests',productName='LocalStoreKitCatalogTests',productReference=test_product,productType='com.apple.product-type.bundle.unit-test')
products=obj('products','PBXGroup',children=[app_product,test_product],name='Products',sourceTree='<group>')
group=obj('main-group','PBXGroup',children=[host,tests,catalog,purchase,*native_sources,products],sourceTree='<group>')
project_configs=configs('project',{})
obj('project','PBXProject',attributes={'LastUpgradeCheck':'2700','TargetAttributes':{test_id:{'TestTargetID':app_id}}},buildConfigurationList=project_configs,compatibilityVersion='Xcode 14.0',developmentRegion='ja',hasScannedForEncodings=0,knownRegions=['ja','en','Base'],mainGroup=group,productRefGroup=products,packageReferences=[package],projectDirPath='',projectRoot='',targets=[app_id,test_id])
def render(v):
    if isinstance(v,dict): return '{ '+ ' '.join(json.dumps(str(k))+ ' = '+render(value)+';' for k,value in v.items())+' }'
    if isinstance(v,list): return '( '+', '.join(render(value) for value in v)+' )'
    if isinstance(v,int): return str(v)
    return json.dumps(v,ensure_ascii=False)
(project/'project.pbxproj').write_text('// !$*UTF8*$!\n'+render({'archiveVersion':1,'classes':{},'objectVersion':56,'objects':objects,'rootObject':key('project')})+'\n')
def buildable(identifier,name):
    return f'<BuildableReference BuildableIdentifier="primary" BlueprintIdentifier="{identifier}" BuildableName="{name}" BlueprintName="{name.split(".")[0]}" ReferencedContainer="container:LocalStoreKitCatalog.xcodeproj"/>'
app_ref=buildable(app_id,'LocalStoreKitHost.app');test_ref=buildable(test_id,'LocalStoreKitCatalogTests.xctest')
scheme=f'''<?xml version="1.0" encoding="UTF-8"?>
<Scheme LastUpgradeVersion="2700" version="1.3">
<BuildAction parallelizeBuildables="YES" buildImplicitDependencies="YES"><BuildActionEntries>
<BuildActionEntry buildForTesting="YES" buildForRunning="YES" buildForProfiling="NO" buildForArchiving="NO" buildForAnalyzing="YES">{app_ref}</BuildActionEntry>
<BuildActionEntry buildForTesting="YES" buildForRunning="NO" buildForProfiling="NO" buildForArchiving="NO" buildForAnalyzing="YES">{test_ref}</BuildActionEntry>
</BuildActionEntries></BuildAction>
<TestAction buildConfiguration="Debug" selectedDebuggerIdentifier="Xcode.DebuggerFoundation.Debugger.LLDB" selectedLauncherIdentifier="Xcode.IDEFoundation.Launcher.LLDB" shouldUseLaunchSchemeArgsEnv="YES"><Testables><TestableReference skipped="NO">{test_ref}</TestableReference></Testables></TestAction>
<LaunchAction buildConfiguration="Debug" selectedDebuggerIdentifier="Xcode.DebuggerFoundation.Debugger.LLDB" selectedLauncherIdentifier="Xcode.IDEFoundation.Launcher.LLDB" launchStyle="0" useCustomWorkingDirectory="NO" ignoresPersistentStateOnLaunch="NO"><BuildableProductRunnable runnableDebuggingMode="0">{app_ref}</BuildableProductRunnable></LaunchAction>
<AnalyzeAction buildConfiguration="Debug"/>
</Scheme>'''
schemes=project/'xcshareddata/xcschemes';schemes.mkdir(parents=True,exist_ok=True)
(schemes/'LocalStoreKitCatalog.xcscheme').write_text(scheme)
print('Generated separate local test project; shipping project unchanged.')
