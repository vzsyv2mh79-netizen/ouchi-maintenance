import {createClient} from '@supabase/supabase-js';
import {handleTestAccountClosure} from '@/lib/account-closure';
import {sessionAfterAuthVerification} from '@/lib/verified-app-session';
export const runtime='nodejs';
export async function POST(request:Request){
 // Hard local-only gate: cannot be enabled on Preview/Production or shared DB.
 const url=process.env.OUCHI_CLOSURE_TEST_URL,publicKey=process.env.OUCHI_CLOSURE_TEST_PUBLISHABLE_KEY,secret=process.env.OUCHI_CLOSURE_TEST_SERVICE_KEY;
 if(process.env.NODE_ENV!=='development'||process.env.OUCHI_CLOSURE_TEST_MODE!=='true'||url!=='http://127.0.0.1:54321'||!publicKey||!secret)return Response.json({error:'Local isolated test only'},{status:503,headers:{'Cache-Control':'no-store'}});
 const options={auth:{persistSession:false,autoRefreshToken:false}};
 const admin=createClient(url,secret,options);
 return handleTestAccountClosure(request,{
  verify:async token=>{const {data,error}=await admin.auth.getUser(token);if(error||!data.user?.email)return null;const identity=sessionAfterAuthVerification(token,data.user.id);return identity?{id:identity.userID,email:data.user.email,sessionID:identity.sessionID}:null;},
  reauthenticate:async(email,password)=>{
   const auth=createClient(url,publicKey,options);
   try{const {data,error}=await auth.auth.signInWithPassword({email,password});if(error||!data.user||!data.session)return null;return data.user.id;}
   finally{const {error}=await auth.auth.signOut({scope:'local'});if(error)throw new Error('Temporary session cleanup failed');}
  },
  close:async(id,sessionID)=>{const {data,error}=await admin.rpc('close_maintenance_app_identity',{target_user:id,verified_session:sessionID});if(error||typeof data!=='boolean')throw new Error('Cleanup failed');return data;},
 });
}
