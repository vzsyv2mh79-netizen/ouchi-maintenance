import {runPrivateOperatorCoverage} from '../lib/closure-operator-coverage.mjs';
import {createPostgresClient} from '../lib/postgres-driver.mjs';
const args=process.argv.slice(2);
if(args.length===1&&args[0]==='--help'){
 process.stdout.write('Prepare or read one private Ouchi review snapshot.\nUsage: node scripts/review-maintenance-closure-coverage.mjs <--capture-review|--read-review> --config <private-json> --project-ref <expected-ref> --request <private-json> --output <new-private-html>\nCapture must be explicitly selected. Reads accept status, page or text only. Requires the separately approved operator login used for later decisions. No source redaction, decision approval, copying, sealing or retirement is performed. After an uncertain result, preserve and reconcile the exact original request/plan ID. Existing outputs are never overwritten. Adopt private evidence/report retention before live use.\n');
}else{
 try{process.stdout.write(JSON.stringify(await runPrivateOperatorCoverage({args,createClient:createPostgresClient}))+'\n');}
 catch{process.stderr.write('Review outcome unconfirmed. Preserve the original request and plan ID; reconcile that same request. No retirement was executed by this command. Private content and connection details are not printed.\n');process.exitCode=1;}
}
