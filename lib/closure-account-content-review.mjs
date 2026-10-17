import {createClosureReviewCoverage} from './closure-review-coverage.mjs';
import {createClosureOperatorReview} from './closure-operator-review.mjs';
import {createClosureHouseholdFileReview} from './closure-household-file-review.mjs';

const definitions=[
 ['record_closure_coverage_text_decision','record_closure_account_content_text_decision','event_id','uuid,uuid,uuid,uuid,uuid,text,text,text',{
  retain_reviewed:'RETAIN_REVIEWED_TEXT_WITHOUT_DEPARTING_ACCOUNT_CONTENT_OR_PERSONAL_INFORMATION',needs_review:'REQUIRE_ADDITIONAL_TEXT_REVIEW'}],
 ['record_closure_file_decision','record_closure_account_content_file_decision','as decision_id','uuid,uuid,uuid,uuid,uuid,uuid,text,text',{
  retain_family_copy:'RETAIN_REVIEWED_FAMILY_FILE_WITHOUT_DEPARTING_ACCOUNT_CONTENT_OR_PERSONAL_INFORMATION',needs_review:'REQUIRE_ADDITIONAL_FILE_REVIEW',erase_personal_file:'ERASE_REVIEWED_PERSONAL_FILE'}],
 ['record_closure_household_file_decision','record_closure_account_content_household_file_decision','as decision_id','uuid,uuid,uuid,uuid,uuid,uuid,text,text',{
  retain_household_file:'RETAIN_REVIEWED_HOUSEHOLD_FILE_WITHOUT_DEPARTING_ACCOUNT_CONTENT_OR_PERSONAL_INFORMATION',needs_review:'REQUIRE_ADDITIONAL_FILE_REVIEW',erase_personal_file:'ERASE_REVIEWED_PERSONAL_FILE'}],
];
const routes=new Map(definitions.map(([prior,next,alias,types,confirmations])=>{
 const parameters=types.split(',').map((type,i)=>`$${i+1}::${type}`).join(',');
 return [`select maintenance_private.${prior}(${parameters}) ${alias}`,
  Object.freeze({sql:`select maintenance_private.${next}(${parameters},$9::text) ${alias}`,confirmations:Object.freeze(confirmations)})];
}));

/** Post-upgrade private operator ports. Keep existing input validation, measured
 * inspection, cancellation and unknown-COMMIT semantics. Only the three exact
 * decision statements use versioned SQL; no caller SQL or function name is added.
 * SQL independently checks the enabled operator, scope and immutable event.
 * The resulting marker records a human judgement, not automated authorship proof.
 */
export function createAccountContentReviewPorts({connect,readFileBytes}){
 if(typeof connect!=='function')throw Error('Dedicated operator connection required');
 const versionedConnect=async options=>{
  const connection=await connect(options);
  if(!connection||typeof connection.query!=='function')return connection;
  return Object.freeze({...connection,query:async(sql,args)=>{
   const route=routes.get(sql);
   if(!route)return connection.query(sql,args);
   if(!Array.isArray(args)||args.length!==8||!Object.hasOwn(route.confirmations,args[6]))throw Error('Exact account-content decision required');
   return connection.query(route.sql,[...args,route.confirmations[args[6]]]);
  }});
 };
 return Object.freeze({
  coverage:createClosureReviewCoverage({connect:versionedConnect}),
  personalFiles:createClosureOperatorReview({connect:versionedConnect,readFileBytes}),
  householdFiles:createClosureHouseholdFileReview({connect:versionedConnect,readFileBytes}),
 });
}
