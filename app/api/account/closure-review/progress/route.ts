import {closureSubmissionProgressDeployment} from '@/lib/closure-submission-progress-deployment';
import {createClosureSubmissionProgressRuntime} from '@/lib/closure-submission-progress-runtime';
export const runtime='nodejs';
async function handle(request:Request){
 const config=closureSubmissionProgressDeployment(process.env);
 if(!config)return Response.json({error:'Progress is not available'},{status:503,headers:{'Cache-Control':'no-store'}});
 return createClosureSubmissionProgressRuntime(config)(request);
}
export const POST=handle;
export const GET=handle;
