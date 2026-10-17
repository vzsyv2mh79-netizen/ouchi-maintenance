import {runPrivateOperatorFinalization} from '../lib/closure-operator-finalization.mjs';
import {createPostgresClient} from '../lib/postgres-driver.mjs';
const args=process.argv.slice(2);
if(args.length===1&&args[0]==='--help'){
 process.stdout.write('Preview one scoped text redaction or coverage seal before recording it.\nUsage: node scripts/finalize-maintenance-closure-review.mjs <--preview|--apply-reviewed> --config <private-json> --project-ref <expected-ref> --request <private-json> --receipt <new-private-json> [--preview-digest <digest>]\nInspect the private preview before applying its exact request. A digest binds the request; it does not prove human approval or replace database authorization. Redaction changes only its checked field and requires a fresh capture afterward. A seal is historical review evidence, never a retirement permit. This command cannot execute retirement, delete accounts or copy files. Preserve original requests and event IDs after uncertain replies; do not invent retry IDs. Private credentials, source text, previews and receipts require an adopted retention policy before live use.\n');
}else{
 try{process.stdout.write(JSON.stringify(await runPrivateOperatorFinalization({args,createClient:createPostgresClient}))+'\n');}
 catch{process.stderr.write('Review outcome unconfirmed. Preserve the exact original request/event and reconcile it before new work. No retirement was executed by this command. Private content and connection errors are not printed.\n');process.exitCode=1;}
}
