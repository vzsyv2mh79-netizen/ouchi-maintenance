import {runPrivateOperatorCopy} from '../lib/closure-operator-copy.mjs';
import {createPostgresClient} from '../lib/postgres-driver.mjs';
const args=process.argv.slice(2);
if(args.length===1&&args[0]==='--help'){
 process.stdout.write('Prepare, inspect status or copy one already-reviewed family file.\nUsage: node scripts/copy-maintenance-reviewed-file.mjs <--read-copy-status|--prepare-reviewed-copy|--copy-reviewed-file> --config <private-database-json> --project-ref <expected-ref> --request <private-json> --receipt <new-private-json> [--storage-config <private-json>]\nOnly the copy command accepts Storage credentials. Prepare requires the exact reviewed decision, source file and new immutable intent/destination IDs; inspect its private receipt before copying. SQL independently checks current account-content review, operator scope and capacity. A copy only reaches staged verified bytes; it does not activate a copy, erase the source or retire an account. Unknown writes remain pending, even if destination bytes appear. Never invent retry IDs, force a second upload, overwrite receipts or release held capacity from a timeout. Preserve original requests and reconcile same-ID status after uncertain acknowledgements. Credentials and receipts need an adopted private retention policy before live use.\n');
}else{
 try{process.stdout.write(JSON.stringify(await runPrivateOperatorCopy({args,createClient:createPostgresClient}))+'\n');}
 catch{process.stderr.write('Copy outcome unconfirmed. Preserve original request/intent/destination IDs and private receipt; reconcile status before further work. No activation, source removal or account retirement was executed by this command. Private content, credentials and connection errors are not printed.\n');process.exitCode=1;}
}
