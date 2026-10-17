import {runPrivateOperatorInspection} from '../lib/closure-operator-inspection.mjs';
import {createPostgresClient} from '../lib/postgres-driver.mjs';

const values=process.argv.slice(2);
if(values.length===1&&values[0]==='--help'){
 process.stdout.write('Read-only Ouchi operator inspection.\nUsage: node scripts/inspect-maintenance-closure.mjs --config <private-json> --project-ref <expected-ref> --request <private-json> --output <new-private-html>\nCredential/request files must belong to this user and have mode 0400 or 0600. Existing output files are never overwritten. This does not approve, copy, redact or delete records.\n');
}else{
 try{
  const result=await runPrivateOperatorInspection({args:values,createClient:createPostgresClient});
  process.stdout.write(JSON.stringify(result)+'\n');
 }catch{
  // Never print connection URLs, driver errors, request content or credentials.
  process.stderr.write('Inspection unavailable. Check the private input files, approved operator connection and current review scope. No approval or deletion was performed.\n');
  process.exitCode=1;
 }
}
