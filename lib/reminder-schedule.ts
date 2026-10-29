export type ReminderSchedule = {minuteOfDay:number;weekdays:number[];leadDays:number;includeOverdue:boolean};
export const freeReminderSchedule:ReminderSchedule={minuteOfDay:540,weekdays:[1,2,3,4,5,6,7],leadDays:0,includeOverdue:true};
export function parseReminderSchedule(value:unknown):ReminderSchedule{
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Invalid schedule');
 const v=value as Record<string,unknown>;
 if(Object.keys(v).sort().join(',')!=='includeOverdue,leadDays,minuteOfDay,weekdays'||!Number.isInteger(v.minuteOfDay)||(v.minuteOfDay as number)<0||(v.minuteOfDay as number)>1439||!Array.isArray(v.weekdays)||v.weekdays.length<1||v.weekdays.length>7||new Set(v.weekdays).size!==v.weekdays.length||v.weekdays.some(d=>!Number.isInteger(d)||d<1||d>7)||![0,1,3,7].includes(v.leadDays as number)||typeof v.includeOverdue!=='boolean')throw Error('Invalid schedule');
 return {minuteOfDay:v.minuteOfDay as number,weekdays:[...v.weekdays].sort((a,b)=>a-b),leadDays:v.leadDays as number,includeOverdue:v.includeOverdue};
}
