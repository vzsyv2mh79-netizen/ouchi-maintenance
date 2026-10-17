import {runPrivateDeletionDispatch} from '../lib/private-deletion-dispatch.mjs';
const args=process.argv.slice(2);
if(args.length===1&&args[0]==='--help'){
 process.stdout.write('Validate explicit private settings or execute one SQL-authorized Ouchi deletion job.\nUsage: node --conditions=react-server scripts/run-maintenance-deletion.mjs <--validate-only|--execute-authorized-job> --config <private-json> --project-ref <expected-ref> --receipt <new-private-json> [--confirmation RUN_ONE_SQL_AUTHORIZED_OUCHI_DELETION_JOB]\nRequires Node24+ with built-in TypeScript stripping and synchronous module hooks. Only trusted repository lib TypeScript imports are resolved; server-only conditions remain required. Configuration contains projectID, secretKey and fileExecutorConfig. Validation checks configuration shape only; it does not connect, verify live credentials or authorize execution. Execution may irreversibly erase one eligible server-selected job; it cannot choose a customer, create a job or approve retention. SQL independently checks policy, exact scope, lease and checker evidence. A confirmation string is not human review or permission. The result concerns one invocation, not all queued jobs or all accounts. An unconfirmed local receipt never proves that no deletion happened. Inspect canonical server progress and leases before further work; another invocation may select another eligible job. No scheduler, public endpoint or production activation is installed. Private credential/receipt retention and live rollout require adoption first.\n');
}else{
 let hook;
 try{
  const {registerHooks}=await import('node:module');
  if(Number(process.versions.node.split('.')[0])<24||!process.features.typescript||typeof registerHooks!=='function')throw Error('Supported Node required');
  const root=new URL('../lib/',import.meta.url).href;
  hook=registerHooks({resolve(specifier,context,nextResolve){
   if(context.parentURL?.startsWith(root)&&specifier.startsWith('./')&&!/[?#]/.test(specifier)&&!/\.[a-z]+$/i.test(specifier)){
    const target=new URL(specifier+'.ts',context.parentURL);
    if(!target.href.startsWith(root))throw Error('Trusted library import required');
    return nextResolve(target.href,context);
   }
   return nextResolve(specifier,context);
  },load(url,context,nextLoad){return nextLoad(url,url.startsWith(root)&&url.endsWith('.ts')?{...context,format:'module-typescript'}:context);}});
  const {createAccountDeletionRuntime}=await import('../lib/account-deletion-runtime.ts');
  process.stdout.write(JSON.stringify(await runPrivateDeletionDispatch({args,createRuntime:createAccountDeletionRuntime}))+'\n');
 }catch{
  process.stderr.write('Deletion invocation outcome unconfirmed. Preserve the private receipt and inspect canonical server progress before further work. No global completion is claimed. Private credentials, targets and errors are not printed. Use Node24+ with --conditions=react-server for this trusted server command.\n');process.exitCode=1;
 }finally{hook?.deregister();}
}
