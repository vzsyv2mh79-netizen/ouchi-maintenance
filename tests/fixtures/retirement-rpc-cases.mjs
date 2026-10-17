import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
export const expected=['accept_home_invite(text,text)','add_product_with_tasks(jsonb,jsonb)','complete_maintenance(uuid)','create_home_invite(uuid)','create_maintenance_home(text,text)','erase_maintenance_data()','import_maintenance(uuid,text,jsonb)','load_household()','restore_maintenance_backup(text,jsonb)'];
export async function snapshot(db){
 const tables=(await db.query("select n.nspname,c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','maintenance_private','auth') and c.relkind in ('r','p') order by n.nspname,c.relname")).rows;
 const result={};for(const t of tables){assert.match(t.nspname,/^[a-z_]+$/);assert.match(t.relname,/^[a-z_]+$/);const rows=(await db.query(`select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb) data from ${t.nspname}.${t.relname} t`)).rows[0].data;result[t.nspname+'.'+t.relname]=createHash('sha256').update(JSON.stringify(rows)).digest('hex');}return result;
}

export function retirementRpcCases({home,ownHome,ownTask,productTemplate,taskTemplate,token,other,thirdSession}){
 const payload=h=>{const p={...productTemplate,id:randomUUID(),homeId:h,name:'Synthetic RPC product'},t={...taskTemplate,id:randomUUID(),productId:p.id,name:'Synthetic RPC task',lastCompletedAt:null};return {products:[p],tasks:[t],history:[]};};
 const closed=payload(ownHome),active=payload(home),closedImport=payload(ownHome),activeImport=payload(home);
 const backup=()=>{const h=randomUUID();return {homes:[{id:h,name:'Synthetic restored RPC home',kind:'home'}],...payload(h)};};
 const cases=[
  {sig:expected[0],sql:'select public.accept_home_invite($1,$2)',closed:[token,'Synthetic rejoin'],active:[token,'Synthetic new family'],user:other,session:thirdSession},
  {sig:expected[1],sql:'select public.add_product_with_tasks($1::jsonb,$2::jsonb)',closed:[closed.products[0],closed.tasks],active:[active.products[0],active.tasks]},
  {sig:expected[2],sql:'select public.complete_maintenance($1)',closed:[ownTask],active:[active.tasks[0].id]},
  {sig:expected[3],sql:'select public.create_home_invite($1)',closed:[ownHome],active:[home]},
  {sig:expected[4],sql:'select public.create_maintenance_home($1,$2)',closed:['Synthetic forbidden new home','home'],active:['Synthetic allowed new home','home']},
  {sig:expected[5],sql:'select public.erase_maintenance_data()',closed:[],active:[],activeDenied:true},
  {sig:expected[6],sql:'select public.import_maintenance($1,$2,$3::jsonb)',closed:[ownHome,'c'.repeat(64),closedImport],active:[home,'c'.repeat(64),activeImport]},
  {sig:expected[7],sql:'select public.load_household()',closed:[],active:[]},
  {sig:expected[8],sql:'select public.restore_maintenance_backup($1,$2::jsonb)',closed:['d'.repeat(64),backup()],active:['d'.repeat(64),backup()]}
 ];
 const names=[['invite_code','member_name'],['product_data','task_data'],['task_id'],['home_id'],['home_name','home_kind'],[],['target_home','import_hash','payload'],[],['backup_hash','payload']];return cases.map((c,i)=>({...c,method:c.sig.split('(')[0],argumentNames:names[i]}));
}
