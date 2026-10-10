import {createClient} from '@supabase/supabase-js';
import {handleTestAccountClosure} from '@/lib/account-closure';
export const runtime='nodejs';
export async function POST(request:Request){
 // Hard local-only gate: cannot be enabled on Preview/Production or shared DB.
 const url=process.env.OUCHI_CLOSURE_TEST_URL,publicKey=process.env.OUCHI_CLOSURE_TEST_PUBLISHABLE_KEY,secret=process.env.OUCHI_CLOSURE_TEST_SERVICE_KEY;
 if(process.env.NODE_ENV!=='development'||process.env.OUCHI_CLOSURE_TEST_MODE!=='true'||url!=='http://127.0.0.1:54321'||!publicKey||!secret)return Response.json({error:'Local isolated test only'},{status:503,headers:{'Cache-Control':'no-store'}});
 const options={auth:{persistSession:false,autoRefreshToken:false}};
 const admin=createClient(url,secret,options);
 return handleTestAccountClosure(request,{
  verify:async token=>{const {data,error}=await admin.auth.getUser(token);return !error&&data.user?.email?{id:data.user.id,email:data.user.email}:null;},
  reauthenticate:async(email,password)=>{
   const auth=createClient(url,publicKey,options);
   try{const {data,error}=await auth.auth.signInWithPassword({email,password});if(error||!data.user||!data.session)return null;return data.user.id;}
   finally{const {error}=await auth.auth.signOut({scope:'local'});if(error)throw new Error('Temporary session cleanup failed');}
  },
  close:async id=>{const {data,error}=await admin.rpc('close_maintenance_account_access',{target_user:id});if(error||typeof data!=='boolean')throw new Error('Cleanup failed');return data;},
 });
}
