import {createClient} from '@supabase/supabase-js';
/** Local synthetic upgrade witness only. Match the SDK's canonical header key;
 * a second lowercase key would concatenate with its Auth Authorization header.
 */
export function legacyUpgradeClient(token,fetcher){
 if(typeof token!=='string'||!token||/\s/.test(token))throw Error('Synthetic bearer required');
 return createClient('http://127.0.0.1:54321','synthetic-public-key',{
  auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
  global:{headers:{Authorization:'Bearer '+token},...(fetcher?{fetch:fetcher}:{})}
 });
}
