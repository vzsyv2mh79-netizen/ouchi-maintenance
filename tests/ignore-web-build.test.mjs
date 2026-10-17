import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, renameSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {execFileSync, spawnSync} from 'node:child_process';
import {shouldSkipWebBuild} from '../scripts/ignore-web-build.mjs';

test('actual Git range skips non-Web edits but builds application changes, renames and uncertain history', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'ouchi-ignore-build-'));
  const git = args => execFileSync('git', args, {cwd, encoding: 'utf8', stdio: ['ignore','pipe','pipe']}).trim();
  const write = (name, value) => {mkdirSync(join(cwd, name, '..'), {recursive:true});writeFileSync(join(cwd,name),value);};
  const commit = () => {git(['add','.']);git(['-c','user.name=Synthetic','-c','user.email=synthetic@example.invalid','-c','commit.gpgsign=false','commit','-qm','Synthetic fixture']);return git(['rev-parse','HEAD']);};
  const env = (previous, current) => ({VERCEL:'1',VERCEL_ENV:'preview',VERCEL_GIT_PREVIOUS_SHA:previous,VERCEL_GIT_COMMIT_SHA:current});
  try {
    git(['init','-q']);write('app/page.tsx','initial');const first=commit();
    write('ios/Docs/review.json','{}');write('tests/synthetic sample\nfile.mjs','test');write('supabase/migrations/synthetic.sql','select 1;');write('docs/release.md','draft');const docs=commit();
    assert.equal(shouldSkipWebBuild({cwd,env:env(first,docs)}),true);
    assert.equal(shouldSkipWebBuild({cwd,env:{...env(first,docs),VERCEL_ENV:'production'}}),true);
    assert.equal(shouldSkipWebBuild({cwd,env:{...env(first,docs),OUCHI_FORCE_WEB_BUILD:'1'}}),false);
    const script=resolve('scripts/ignore-web-build.mjs');
    assert.equal(spawnSync(process.execPath,[script],{cwd,env:{...process.env,...env(first,docs)}}).status,0);
    write('content/release-information-draft.json','{}');const web=commit();
    assert.equal(shouldSkipWebBuild({cwd,env:env(docs,web)}),false);
    write('docs/release.md','new draft');const laterDocs=commit();
    assert.equal(shouldSkipWebBuild({cwd,env:env(first,laterDocs)}),false,'HEAD^ would incorrectly hide the unbuilt Web change');
    assert.equal(spawnSync(process.execPath,[script],{cwd,env:{...process.env,...env(first,laterDocs)}}).status,1);
    write('docs/was-document.md','rename');const beforeRename=commit();mkdirSync(join(cwd,'public'),{recursive:true});renameSync(join(cwd,'docs/was-document.md'),join(cwd,'public/document.md'));const renamed=commit();
    assert.equal(shouldSkipWebBuild({cwd,env:env(beforeRename,renamed)}),false);
    for(const changed of ['package.json','pnpm-lock.yaml','next.config.ts','vercel.json','scripts/prepare-manual-assets.mjs','assets/licenses/notice.json','lib/api.ts','components/controls.tsx','public/icon.png']) {
      const before=git(['rev-parse','HEAD']);write(changed,'changed');const current=commit();assert.equal(shouldSkipWebBuild({cwd,env:env(before,current)}),false,changed);
    }
    const head=git(['rev-parse','HEAD']);
    for(const bad of [env('',head),env('a'.repeat(40),head),env(first,first),env('HEAD^',head),{...env(first,head),VERCEL:'0'},{...env(first,head),VERCEL_ENV:'custom'}])assert.equal(shouldSkipWebBuild({cwd,env:bad}),false);
    assert.equal(shouldSkipWebBuild({cwd:join(cwd,'absent'),env:env(first,head)}),false);
  } finally {rmSync(cwd,{recursive:true,force:true});}
});
