# Web build scope

`vercel.json` uses `node scripts/ignore-web-build.mjs` as its Ignored Build Step. No dependency installation is needed to run this check. Vercel exit status is inverted: 0 skips a build and 1 continues it.

Compare the current commit with Vercel's **last successful deployment for this project and branch**, never just its immediate parent. Skip only when every changed path is in `ios/`, `tests/`, `docs/`, `supabase/`, `.github/`, or a root Markdown document. These are currently outside Web build/runtime inputs. If the Web begins importing any of these directories, change this rule in the same update. Public assets, content, application code, dependencies, configuration and build scripts always build. Renames include both old and new paths.

First deployment, missing or shallow history, unknown/custom environments, malformed metadata, a different checkout, large/failed Git output, and same-commit redeployment all continue the build. The check does not fetch Git history, change project settings, access credentials, skip GitHub tests, or change the reminder schedule. To explicitly rebuild, set `OUCHI_FORCE_WEB_BUILD=1`, or use Vercel's redeploy option that bypasses the Ignored Build Step.

Ignored deployments can still count toward Vercel deployment quotas and concurrent slots. This reduces unnecessary build work; it is not a promise of zero fees. Test the first real non-Web-only update using Vercel build logs before claiming hosted skip behavior is verified.

Verified with a disposable Git repository and actual command exit statuses: non-Web updates skip; an earlier unbuilt Web change is not hidden by a later documentation commit; Web changes and renamed public content build; uncertain history continues building. The local project Git metadata is never modified by this test.

Official references:

- [ignoreCommand](https://vercel.com/docs/project-configuration/vercel-json#ignorecommand)
- [Ignored Build Step and deployment quotas](https://vercel.com/docs/project-configuration/project-settings#ignored-build-step)
- [Last successful branch deployment metadata](https://vercel.com/docs/environment-variables/system-environment-variables#vercel_git_previous_sha)
