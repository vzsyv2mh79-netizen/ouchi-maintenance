import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
const run=body=>execFileSync('python3',['-c',`import importlib.util\ns=importlib.util.spec_from_file_location('artifact','ios/scripts/verify-store-artifact.py')\nm=importlib.util.module_from_spec(s);s.loader.exec_module(m)\nvalid={'SUPABASE_PUBLISHABLE_KEY':'sb_publishable_synthetic_config_test','SUPABASE_URL':'https://abcdefghijklmnopqrst.supabase.co'}\n${body}`],{encoding:'utf8'});
test('release artifact refuses absent or server credentials, wrong project hosts and review sample mode',()=>{
 assert.equal(run(`assert m.configuration_checks(valid,'distribution')==[]
for key in ['', 'REPLACE_WITH_PUBLISHABLE_KEY','sb_secret_server_key','eyJ.server_role.value','sb_publishable_contains whitespace']:
 assert m.configuration_checks({**valid,'SUPABASE_PUBLISHABLE_KEY':key},'distribution')
assert m.configuration_checks({**valid,'SUPABASE_URL':'https://abcdefghijklmnopqrst.supabase.co.attacker.invalid'},'distribution')
assert m.configuration_checks({**valid,'OUCHI_REVIEW_SAMPLE_DATA':True},'distribution')
for sample in ['YES','true','1','$(OUCHI_REVIEW_SAMPLE_DATA)']:
 assert m.configuration_checks({**valid,'OUCHI_REVIEW_SAMPLE_DATA':sample},'distribution')
for sample in [False,'','NO','false','0']:
 assert m.configuration_checks({**valid,'OUCHI_REVIEW_SAMPLE_DATA':sample},'distribution')==[]
print('passed')`).trim(),'passed');
});
test('expired, future, undated and device-only profiles cannot establish App Store readiness',()=>{
 assert.equal(run(`import datetime
now=datetime.datetime(2026,10,15,tzinfo=datetime.timezone.utc)
before=now-datetime.timedelta(days=1);after=now+datetime.timedelta(days=1)
profile={'TeamIdentifier':['TEAM123'],'Entitlements':{'application-identifier':'TEAM123.jp.ouchi.maintenance','get-task-allow':False},'CreationDate':before,'ExpirationDate':after}
check=lambda p:m.profile_checks(p,'TEAM123','jp.ouchi.maintenance','distribution',now)
assert check(profile)==[]
assert check({**profile,'ExpirationDate':now})
assert check({**profile,'CreationDate':after})
assert check({k:v for k,v in profile.items() if k!='ExpirationDate'})
assert check({**profile,'ExpirationDate':'2099-01-01'})
assert check({**profile,'ProvisionedDevices':['synthetic-device']})
assert check({**profile,'ProvisionsAllDevices':True})
assert check({**profile,'TeamIdentifier':['OTHER']})
assert check({**profile,'Entitlements':{**profile['Entitlements'],'get-task-allow':True}})
assert check({**profile,'CreationDate':before.replace(tzinfo=None),'ExpirationDate':after.replace(tzinfo=None)})==[]
print('passed')`).trim(),'passed');
});
test('distribution proof never stands in for reviewed public policies or purchase/storage disclosures',()=>{
 assert.equal(run(`assert len(m.configuration_checks(valid,'submission'))==3
ready={**valid,**{k:'https://ouchi-maintenance.vercel.app/'+k for k in ['OUCHI_TERMS_URL','OUCHI_PRIVACY_URL','OUCHI_SUPPORT_URL']}}
assert m.configuration_checks(ready,'submission')==[]
assert m.configuration_checks({**ready,'OUCHI_TERMS_URL':'https://example.invalid/terms'},'submission')
assert len(m.configuration_checks({**ready,'OUCHI_RELEASE_SUBSCRIPTIONS_ENABLED':True},'submission'))==2
assert len(m.configuration_checks({**ready,'OUCHI_ATTACHMENTS_ENABLED':True},'submission'))==4
print('passed')`).trim(),'passed');
});
test('the built artifact must carry declarations for the APIs actually bundled in Ouchi',()=>{
 assert.equal(run(`import plistlib
manifest=plistlib.loads(open('ios/OuchiMaintenance/PrivacyInfo.xcprivacy','rb').read())
assert m.privacy_checks(manifest)==[]
assert m.privacy_checks(None)
assert len(m.privacy_checks({}))==2
assert m.privacy_checks({'NSPrivacyAccessedAPITypes':[e for e in manifest['NSPrivacyAccessedAPITypes'] if e['NSPrivacyAccessedAPIType']!='NSPrivacyAccessedAPICategoryFileTimestamp']})
assert m.privacy_checks({'NSPrivacyAccessedAPITypes':[{'NSPrivacyAccessedAPIType':'NSPrivacyAccessedAPICategoryFileTimestamp','NSPrivacyAccessedAPITypeReasons':['DDA9.1']}]})
print('passed')`).trim(),'passed');
});
test('enabled photos, purchases and device registration cannot outgrow the bundled data disclosures',()=>{
 assert.equal(run(`import copy,plistlib
manifest=plistlib.loads(open('ios/OuchiMaintenance/PrivacyInfo.xcprivacy','rb').read())
assert m.collection_privacy_checks(manifest,{})==[]
assert m.collection_privacy_checks(None,{})
for category in ['EmailAddress','Name','UserID','OtherUserContent']:
 missing=copy.deepcopy(manifest)
 missing['NSPrivacyCollectedDataTypes']=[e for e in missing['NSPrivacyCollectedDataTypes'] if e['NSPrivacyCollectedDataType']!='NSPrivacyCollectedDataType'+category]
 assert m.collection_privacy_checks(missing,{})
for flag,category in [('OUCHI_ATTACHMENTS_ENABLED','PhotosorVideos'),('OUCHI_RELEASE_SUBSCRIPTIONS_ENABLED','PurchaseHistory'),('OUCHI_RELEASE_TIPS_ENABLED','PurchaseHistory'),('OUCHI_NATIVE_PUSH_ENABLED','DeviceID'),('OUCHI_APP_ATTEST_REGISTRATION_ENABLED','DeviceID'),('OUCHI_CLOSURE_PROGRESS_ENABLED','DeviceID'),('OUCHI_CLOSURE_READ_CUSTODY_ENABLED','DeviceID'),('OUCHI_CLOSURE_LOCAL_CLEANUP_ENABLED','DeviceID')]:
 assert m.collection_privacy_checks(manifest,{flag:True})
 complete=copy.deepcopy(manifest)
 entry=copy.deepcopy(complete['NSPrivacyCollectedDataTypes'][0]);entry['NSPrivacyCollectedDataType']='NSPrivacyCollectedDataType'+category
 complete['NSPrivacyCollectedDataTypes'].append(entry)
 assert m.collection_privacy_checks(complete,{flag:True})==[]
 assert m.collection_privacy_checks(manifest,{flag:False})==[]
for flag in ['OUCHI_RELEASE_PURCHASE_RECOVERY_ENABLED','OUCHI_SANDBOX_RESTORE_ENABLED']:
 assert len(m.collection_privacy_checks(manifest,{flag:True}))==2
assert m.collection_privacy_checks(manifest,{'IOS_SANDBOX_BILLING':'YES'})
for value in ['NO','false','$(OUCHI_ATTACHMENTS_ENABLED)',0,1]:
 assert m.collection_privacy_checks(manifest,{'OUCHI_ATTACHMENTS_ENABLED':value})
print('passed')`).trim(),'passed');
});
test('collection checks reject contradictory tracking, duplicate and unlinked declarations without accepting malformed data',()=>{
 assert.equal(run(`import copy,plistlib
manifest=plistlib.loads(open('ios/OuchiMaintenance/PrivacyInfo.xcprivacy','rb').read())
for change in [{'NSPrivacyTracking':True},{'NSPrivacyTracking':'false'},{'NSPrivacyTrackingDomains':['tracker.invalid']},{'NSPrivacyCollectedDataTypes':None},{'NSPrivacyCollectedDataTypes':['bad']}]:
 assert m.collection_privacy_checks({**manifest,**change},{})
duplicate=copy.deepcopy(manifest);duplicate['NSPrivacyCollectedDataTypes'].append(duplicate['NSPrivacyCollectedDataTypes'][0])
assert m.collection_privacy_checks(duplicate,{})
for change in [{'NSPrivacyCollectedDataTypeLinked':False},{'NSPrivacyCollectedDataTypeLinked':'true'},{'NSPrivacyCollectedDataTypeTracking':True},{'NSPrivacyCollectedDataTypePurposes':[]},{'NSPrivacyCollectedDataTypePurposes':'NSPrivacyCollectedDataTypePurposeAppFunctionality'},{'NSPrivacyCollectedDataTypePurposes':['NSPrivacyCollectedDataTypePurposeAnalytics']}]:
 altered=copy.deepcopy(manifest);altered['NSPrivacyCollectedDataTypes'][0].update(change)
 assert m.collection_privacy_checks(altered,{})
print('passed')`).trim(),'passed');
});
