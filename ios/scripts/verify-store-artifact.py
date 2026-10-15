#!/usr/bin/env python3
"""Read-only checks for an already built app; never uploads or enables features."""
import argparse,json,pathlib,plistlib,re,subprocess,urllib.parse

def configuration_checks(info,stage):
    errors=[]
    key=info.get('SUPABASE_PUBLISHABLE_KEY','')
    url=urllib.parse.urlparse(str(info.get('SUPABASE_URL','')))
    if not isinstance(key,str) or not key.startswith('sb_publishable_') or not 20<len(key)<=4096 or any(c.isspace() for c in key):
        errors.append('Enabled modern public client key is missing; never use a server key')
    if url.scheme!='https' or not re.fullmatch(r'[a-z]{20}\.supabase\.co',url.netloc) or url.path not in ('','/'):
        errors.append('Exact HTTPS Supabase project URL is missing')
    if info.get('OUCHI_REVIEW_SAMPLE_DATA') is True:
        errors.append('Sample-data review app cannot be submitted')
    if stage=='submission':
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

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--app',type=pathlib.Path,required=True)
    parser.add_argument('--stage',choices=['development','distribution','submission'],default='submission')
    parser.add_argument('--team',required=True)
    parser.add_argument('--bundle-id',default='jp.ouchi.maintenance')
    parser.add_argument('--version',default='1.0')
    args=parser.parse_args()
    info=plistlib.loads((args.app/'Info.plist').read_bytes());errors=configuration_checks(info,args.stage)
    for name,expected in [('CFBundleIdentifier',args.bundle_id),('CFBundleShortVersionString',args.version)]:
        if info.get(name)!=expected:errors.append(name+' differs from the registered app')
    signed=subprocess.run(['codesign','--verify','--deep','--strict',str(args.app)],capture_output=True)
    if signed.returncode:errors.append('macOS signature verification failed')
    decoded=subprocess.run(['/usr/bin/security','cms','-D','-i',str(args.app/'embedded.mobileprovision')],capture_output=True)
    profile={}
    if decoded.returncode:errors.append('Embedded Apple profile could not be verified/decoded')
    else:
        profile=plistlib.loads(decoded.stdout);ent=profile.get('Entitlements',{})
        if profile.get('TeamIdentifier')!=[args.team] or ent.get('application-identifier')!=args.team+'.'+args.bundle_id:errors.append('Profile does not match the registered team/app')
        if args.stage!='development' and (ent.get('get-task-allow') is not False or 'ProvisionedDevices' in profile or profile.get('ProvisionsAllDevices')):errors.append('App Store distribution profile required')
    # Neither client key contents, device identifiers nor certificate contents
    # are logged. Passing distribution checks is not App Review acceptance.
    print(json.dumps({'stage':args.stage,'verified':not errors,'bundleId':info.get('CFBundleIdentifier'),'version':info.get('CFBundleShortVersionString'),'build':info.get('CFBundleVersion'),'signatureVerified':signed.returncode==0,'profileDecoded':decoded.returncode==0,'errors':errors,'uploaded':False,'limits':'Does not prove device behavior, purchase lifecycle, privacy answers, server readiness or App Review acceptance'},ensure_ascii=False,indent=2))
    return 1 if errors else 0

if __name__=='__main__':raise SystemExit(main())
