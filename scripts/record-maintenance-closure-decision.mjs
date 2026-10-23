import {runPrivateOperatorDecision} from '../lib/closure-operator-decisions.mjs';
import {createPostgresClient} from '../lib/postgres-driver.mjs';

const args=process.argv.slice(2);
if(args.length===1&&args[0]==='--help'){
 process.stdout.write('Record one reviewed Ouchi operator decision.\nUsage: node scripts/record-maintenance-closure-decision.mjs --record-reviewed-decision --config <private-json> --project-ref <expected-ref> --request <private-json> --receipt <new-private-json>\nRequires a separately approved dedicated decision login and human-reviewed evidence captured by that same operator principal. Its operator role supports the wider review workflow: this command exposes only decision recording, and is not a database permission boundary. Input files must be private (0400/0600). No erasure, redaction or copying is executed. If the outcome is unconfirmed, preserve and reconcile the exact original request/event; never create a new retry ID. Receipt files are never overwritten. Input evidence and receipts remain private operator records; their retention and cleanup policy must be adopted before live use.\n');
}else{
 try{
  const receipt=await runPrivateOperatorDecision({args,createClient:createPostgresClient});
  process.stdout.write(JSON.stringify(receipt)+'\n');
 }catch{
  process.stderr.write('Decision outcome unconfirmed. No retirement was executed by this command. Preserve the original request and event ID; reconcile the same request before any new decision. Connection errors and private content are not printed.\n');
  process.exitCode=1;
 }
}
