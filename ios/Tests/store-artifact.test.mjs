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
