// Test compiler target only. Production imports its actual pg constructor.
let factory;
export function installDeletionRuntimeTestDriver(value){
 if(typeof value!=='function'||factory)throw Error('Explicit isolated test driver required');
 factory=value;return ()=>{factory=undefined;};
}
export function createPostgresClient(config){
 if(!factory)throw Error('No isolated deletion runtime driver installed');
 return factory(config);
}
