import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

// Vercel: exit 0 skips the build; exit 1 builds. Unknown state always builds.
// These directories are not Web build/runtime inputs. If that boundary changes,
// update this rule in the same change as the new dependency.
const nonWeb = /^(?:ios\/|tests\/|docs\/|supabase\/|\.github\/|[^/]+\.md$)/;
const commitSHA = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
export function shouldSkipWebBuild({env = process.env, cwd = process.cwd()} = {}) {
  const previous = env.VERCEL_GIT_PREVIOUS_SHA, current = env.VERCEL_GIT_COMMIT_SHA;
  if (env.OUCHI_FORCE_WEB_BUILD === '1' || env.VERCEL !== '1' ||
      !['preview', 'production'].includes(env.VERCEL_ENV) ||
      !commitSHA.test(previous ?? '') || !commitSHA.test(current ?? '') || previous === current) return false;
  const git = args => execFileSync('git', args, {
    cwd, encoding: 'utf8', timeout: 5000, maxBuffer: 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  try {
    if (git(['rev-parse', '--verify', 'HEAD']).trim() !== current) return false;
    for (const sha of [previous, current]) if (git(['cat-file', '-t', sha]).trim() !== 'commit') return false;
    // Compare with the last successful branch deployment, not HEAD^: a skipped
    // documentation commit must not hide an earlier unbuilt application change.
    const names = git(['diff', '--no-ext-diff', '--no-textconv', '--no-renames', '--name-only', '-z', previous, current, '--']);
    if (!names || !names.endsWith('\0')) return false;
    const paths = names.slice(0, -1).split('\0');
    return paths.length > 0 && paths.every(path => path && !path.startsWith('/') && !path.split('/').includes('..') && nonWeb.test(path));
  } catch { return false; } // Shallow/missing history, timeout or Git failure.
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const skip = shouldSkipWebBuild();
  console.log(skip ? 'Only non-Web sources changed; skip Web build.' : 'Web change or uncertain baseline; continue Web build.');
  process.exitCode = skip ? 0 : 1;
}
