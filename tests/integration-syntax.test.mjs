import test from 'node:test';
import {readdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {join} from 'node:path';

test('environment-gated integration scripts parse before external test services start',()=>{
 // The ordinary unit suite does not import .integration.mjs files. Check their
 // grammar without running them, connecting services or reading any secrets.
 for(const name of readdirSync('tests').filter(name=>name.endsWith('.integration.mjs'))){
  execFileSync(process.execPath,['--check',join('tests',name)],{stdio:'pipe',timeout:10000});
 }
});
