#!/usr/bin/env python3
"""Read-only checks for an already built app; never uploads or enables features."""
import argparse,datetime,json,pathlib,plistlib,re,subprocess,urllib.parse

def encryption_dependency_checks(app, runner=subprocess.run):
    """Guard the reviewed OS-only dependency boundary, not legal classification.

    Static/custom algorithm implementations still require source review. Never
    infer exemption merely from absence of a third-party dynamic library.
    """
    errors=[]; executables=0
    if app.is_symlink() or not app.is_dir():return ['App bundle must be a real directory']
    magic={b'\xfe\xed\xfa\xce',b'\xce\xfa\xed\xfe',b'\xfe\xed\xfa\xcf',b'\xcf\xfa\xed\xfe',
           b'\xca\xfe\xba\xbe',b'\xbe\xba\xfe\xca',b'\xca\xfe\xba\xbf',b'\xbf\xba\xfe\xca'}
    try:
        for path in app.rglob('*'):
            if path.is_symlink():
                errors.append('Unreviewed symlink in app bundle');continue
            if not path.is_file():continue
            with path.open('rb') as stream:header=stream.read(8)
            if header==b'!<arch>\n':
                errors.append('Unreviewed static archive in app bundle');continue
            if header[:4] not in magic:continue
            executables+=1
            result=runner(['/usr/bin/otool','-L',str(path)],capture_output=True,text=True,timeout=30)
            if result.returncode:
                errors.append('Could not inspect bundled Mach-O dependencies');continue
            dependencies=[line.strip().split(' (compatibility version ',1)[0]
                          for line in result.stdout.splitlines() if line.startswith('\t')]
            if not dependencies:
                errors.append('No inspectable Mach-O dependencies');continue
            for dependency in dependencies:
                if (not dependency.startswith(('/System/Library/Frameworks/','/usr/lib/'))
                    or '..' in pathlib.PurePosixPath(dependency).parts):
                    errors.append('Bundled dependency requires renewed encryption review')
        if not executables:errors.append('No Mach-O executable found for encryption dependency review')
    except (OSError,subprocess.SubprocessError):
        errors.append('Encryption dependency inspection failed')
    return errors

def configuration_checks(info,stage):
    errors=[]
    key=info.get('SUPABASE_PUBLISHABLE_KEY','')
    url=urllib.parse.urlparse(str(info.get('SUPABASE_URL','')))
    if not isinstance(key,str) or not key.startswith('sb_publishable_') or not 20<len(key)<=4096 or any(c.isspace() for c in key):
        errors.append('Enabled modern public client key is missing; never use a server key')
    if url.scheme!='https' or not re.fullmatch(r'[a-z]{20}\.supabase\.co',url.netloc) or url.path not in ('','/'):
        errors.append('Exact HTTPS Supabase project URL is missing')
    # Xcode review builds use a string, while fixtures can use a plist boolean.
    # Unresolved build substitutions also cannot establish a shipping build.
    sample=info.get('OUCHI_REVIEW_SAMPLE_DATA',False)
    if sample is not False and sample not in ('','NO','false','0'):
        errors.append('Sample-data review app cannot be submitted')
    if stage=='submission':
        if info.get('ITSAppUsesNonExemptEncryption') is not False:
            errors.append('Reviewed Apple OS-only encryption declaration must be a resolved false boolean')
        for name in ('OUCHI_TERMS_URL','OUCHI_PRIVACY_URL','OUCHI_SUPPORT_URL'):
            address=urllib.parse.urlparse(str(info.get(name,'')))
            if address.scheme!='https' or not address.netloc or address.username or address.password or address.hostname in ('localhost','example.invalid') or str(address.hostname).endswith(('.invalid','.test','.localhost')):
                errors.append(name+' must be a reviewed public HTTPS page')
        if info.get('OUCHI_RELEASE_TIPS_ENABLED') or info.get('OUCHI_RELEASE_SUBSCRIPTIONS_ENABLED'):
            for name in ('OUCHI_PURCHASE_DISCLOSURES_REVIEWED','OUCHI_SUBSCRIPTION_OFFER_REVIEWED'):
                if info.get(name) is not True:errors.append(name+' is required before enabling purchases')
        if info.get('OUCHI_ATTACHMENTS_ENABLED'):
            for name in ('OUCHI_ATTACHMENT_MAXIMUM_BYTES','OUCHI_ATTACHMENT_MAXIMUM_FILES','OUCHI_ATTACHMENT_MAXIMUM_FILE_BYTES'):
                if not isinstance(info.get(name),int) or isinstance(info.get(name),bool) or info[name]<=0:errors.append(name+' must be a reviewed positive limit')
            if not str(info.get('OUCHI_ATTACHMENT_RETENTION_DESCRIPTION','')).strip():errors.append('Attachment retention explanation is missing')
    return errors

def profile_checks(profile,team,bundle_id,stage,now=None):
    errors=[]
    now=now or datetime.datetime.now(datetime.timezone.utc)
    def utc(value):
        if not isinstance(value,datetime.datetime):return None
        return value.replace(tzinfo=datetime.timezone.utc) if value.tzinfo is None else value.astimezone(datetime.timezone.utc)
    created=utc(profile.get('CreationDate'));expires=utc(profile.get('ExpirationDate'))
    if created is None or expires is None or not created<=now<expires:
        errors.append('Embedded profile validity period is missing or not current')
    ent=profile.get('Entitlements',{})
    if profile.get('TeamIdentifier')!=[team] or ent.get('application-identifier')!=team+'.'+bundle_id:
        errors.append('Profile does not match the registered team/app')
    if stage!='development' and (ent.get('get-task-allow') is not False or 'ProvisionedDevices' in profile or profile.get('ProvisionsAllDevices')):
        errors.append('App Store distribution profile required')
    return errors

def privacy_checks(manifest):
    if not isinstance(manifest,dict):return ['Bundled privacy manifest is missing or invalid']
    declared={entry.get('NSPrivacyAccessedAPIType'):entry.get('NSPrivacyAccessedAPITypeReasons',[])
              for entry in manifest.get('NSPrivacyAccessedAPITypes',[]) if isinstance(entry,dict)}
    required={'NSPrivacyAccessedAPICategoryUserDefaults':'CA92.1',
              'NSPrivacyAccessedAPICategoryFileTimestamp':'C617.1'}
    return ['Bundled privacy manifest is missing '+category+' reason '+reason
            for category,reason in required.items()
            if not isinstance(declared.get(category),list) or reason not in declared[category]]

def collection_privacy_checks(manifest,info):
    """Ouchi-specific minimums, not a substitute for reviewing provider practices."""
    if not isinstance(manifest,dict):return ['Data collection manifest is missing or invalid']
    errors=[]
    if manifest.get('NSPrivacyTracking') is not False:
        errors.append('Ouchi no-tracking declaration must be explicit')
    if manifest.get('NSPrivacyTrackingDomains',[])!=[]:
        errors.append('Tracking domains contradict the reviewed Ouchi no-tracking policy')
    entries=manifest.get('NSPrivacyCollectedDataTypes')
    if not isinstance(entries,list):return errors+['Collected data declarations must be an array']
    declared={}
    for entry in entries:
        if not isinstance(entry,dict):
            errors.append('Collected data entry must be a dictionary');continue
        name=entry.get('NSPrivacyCollectedDataType')
        if not isinstance(name,str) or not name:
            errors.append('Collected data type is missing');continue
        if name in declared:errors.append('Duplicate collected data type '+name)
        declared[name]=entry
        if type(entry.get('NSPrivacyCollectedDataTypeLinked')) is not bool:
            errors.append(name+' must declare identity linkage as a boolean')
        if entry.get('NSPrivacyCollectedDataTypeTracking') is not False:
            errors.append(name+' contradicts the reviewed no-tracking policy')
        purposes=entry.get('NSPrivacyCollectedDataTypePurposes')
        if not isinstance(purposes,list) or not purposes or any(not isinstance(p,str) or not p for p in purposes):
            errors.append(name+' must declare a nonempty purpose array')
    required={'EmailAddress','Name','UserID','OtherUserContent'}
    feature_categories={
        'OUCHI_ATTACHMENTS_ENABLED':{'PhotosorVideos'},
        'OUCHI_RELEASE_TIPS_ENABLED':{'PurchaseHistory'},
        'OUCHI_RELEASE_SUBSCRIPTIONS_ENABLED':{'PurchaseHistory'},
        'OUCHI_RELEASE_PURCHASE_RECOVERY_ENABLED':{'PurchaseHistory','DeviceID'},
        'OUCHI_SANDBOX_RESTORE_ENABLED':{'PurchaseHistory','DeviceID'},
        'OUCHI_NATIVE_PUSH_ENABLED':{'DeviceID'},
        'OUCHI_APP_ATTEST_REGISTRATION_ENABLED':{'DeviceID'},
        'OUCHI_CLOSURE_REVIEW_ENABLED':{'DeviceID'},
        'OUCHI_CLOSURE_PROGRESS_ENABLED':{'DeviceID'},
        'OUCHI_CLOSURE_READ_CUSTODY_ENABLED':{'DeviceID'},
        'OUCHI_CLOSURE_LOCAL_CLEANUP_ENABLED':{'DeviceID'},
    }
    for flag,categories in feature_categories.items():
        value=info.get(flag,False)
        if type(value) is not bool:
            errors.append(flag+' must be a resolved boolean in the built artifact')
        elif value:required.update(categories)
    if info.get('IOS_SANDBOX_BILLING') in ('YES',True):required.add('PurchaseHistory')
    for category in sorted(required):
        name='NSPrivacyCollectedDataType'+category
        entry=declared.get(name)
        if entry is None:
            errors.append('Enabled Ouchi data path is missing '+name);continue
        if entry.get('NSPrivacyCollectedDataTypeLinked') is not True:
            errors.append(name+' must disclose linkage to the Ouchi account')
        purposes=entry.get('NSPrivacyCollectedDataTypePurposes')
        if not isinstance(purposes,list) or 'NSPrivacyCollectedDataTypePurposeAppFunctionality' not in purposes:
            errors.append(name+' must include the app-functionality purpose')
    return errors

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--app',type=pathlib.Path,required=True)
    parser.add_argument('--stage',choices=['development','distribution','submission'],default='submission')
    parser.add_argument('--team',required=True)
    parser.add_argument('--bundle-id',default='jp.ouchi.maintenance')
    parser.add_argument('--version',default='1.0')
    args=parser.parse_args()
    info=plistlib.loads((args.app/'Info.plist').read_bytes());errors=configuration_checks(info,args.stage)
    try:manifest=plistlib.loads((args.app/'PrivacyInfo.xcprivacy').read_bytes())
    except (OSError,plistlib.InvalidFileException):manifest=None
    errors.extend(privacy_checks(manifest))
    errors.extend(collection_privacy_checks(manifest,info))
    encryption_errors=encryption_dependency_checks(args.app) if info.get('ITSAppUsesNonExemptEncryption') is False else None
    if encryption_errors is not None:errors.extend(encryption_errors)
    for name,expected in [('CFBundleIdentifier',args.bundle_id),('CFBundleShortVersionString',args.version)]:
        if info.get(name)!=expected:errors.append(name+' differs from the registered app')
    signed=subprocess.run(['codesign','--verify','--deep','--strict',str(args.app)],capture_output=True)
    if signed.returncode:errors.append('macOS signature verification failed')
    decoded=subprocess.run(['/usr/bin/security','cms','-D','-i',str(args.app/'embedded.mobileprovision')],capture_output=True)
    profile={}
    if decoded.returncode:errors.append('Embedded Apple profile could not be verified/decoded')
    else:
        profile=plistlib.loads(decoded.stdout)
        errors.extend(profile_checks(profile,args.team,args.bundle_id,args.stage))
    # Neither client key contents, device identifiers nor certificate contents
    # are logged. Passing distribution checks is not App Review acceptance.
    print(json.dumps({'stage':args.stage,'verified':not errors,'bundleId':info.get('CFBundleIdentifier'),'version':info.get('CFBundleShortVersionString'),'build':info.get('CFBundleVersion'),'signatureVerified':signed.returncode==0,'profileDecoded':decoded.returncode==0,'encryptionDependencyBoundaryVerified':encryption_errors==[],'errors':errors,'uploaded':False,'limits':'Does not prove device behavior, purchase lifecycle, privacy answers, server readiness, export obligations or App Review acceptance; source review remains necessary for static/custom cryptography'},ensure_ascii=False,indent=2))
    return 1 if errors else 0

if __name__=='__main__':raise SystemExit(main())
