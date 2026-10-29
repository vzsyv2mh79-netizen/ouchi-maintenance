"""Explicit isolated native test runner. Never downloads or touches managed DBs."""
import argparse
import os
import pathlib
import shlex
import shutil
import subprocess
import tempfile

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--postgres-bin', required=True)
parser.add_argument('--node', required=True)
parser.add_argument('--auth-runtime', required=True)
parser.add_argument('--test-file', choices=['tests/explicit-enrollment-handler.native.mjs', 'tests/generation-session-custody.native.mjs', 'tests/generation-file-copy.native.mjs', 'tests/scoped-shared-consent.native.mjs', 'tests/bound-scoped-shared-consent.native.mjs', 'tests/totp-cross-app-compatibility.native.mjs', 'tests/post-native-seal-consent.native.mjs', 'tests/post-native-seal-consent-auth.native.mjs', 'tests/prepared-scoped-shared-consent.native.mjs', 'tests/initial-family-consent-identity.native.mjs', 'tests/ouchi-owner-only-claim.native.mjs', 'tests/shared-maintenance-prelogout-custody.native.mjs', 'tests/pre-native-after-logout-consent.native.mjs'], default='tests/scoped-shared-consent.native.mjs')
parser.add_argument('--prelogout-source-dir')
parser.add_argument('--enrollment-full-http', action='store_true', help='Require full pinned schema and actual PostgREST for enrollment')
parser.add_argument('--postgrest-binary')
parser.add_argument('--postgrest-library')
args = parser.parse_args()
if args.test_file == 'tests/shared-maintenance-prelogout-custody.native.mjs' and not args.prelogout_source_dir:
    raise SystemExit('Explicit frozen prelogout source directory required')
if args.enrollment_full_http:
    if args.test_file != 'tests/explicit-enrollment-handler.native.mjs':
        raise SystemExit('Full HTTP profile is only for the enrollment test')
    if not args.postgrest_binary or not args.postgrest_library:
        raise SystemExit('Full HTTP profile requires explicit PostgREST binary and library directory')
    rest_binary = pathlib.Path(args.postgrest_binary).resolve()
    rest_library = pathlib.Path(args.postgrest_library).resolve()
    if not rest_binary.is_file() or not rest_library.is_dir():
        raise SystemExit('Prepared PostgREST runtime missing')
    if not all(str(p).startswith('/private/tmp/') for p in [rest_binary, rest_library]):
        raise SystemExit('Disposable prepared PostgREST paths required')
    if os.environ.get('OUCHI_ENROLLMENT_UI_OUTPUT'):
        raise SystemExit('Full HTTP profile is separate from the native UI profile')
elif args.postgrest_binary or args.postgrest_library:
    raise SystemExit('PostgREST arguments require --enrollment-full-http')
root = pathlib.Path(__file__).resolve().parents[1]
binary = pathlib.Path(args.postgres_bin).resolve()
node = pathlib.Path(args.node).resolve()
auth = pathlib.Path(args.auth_runtime).resolve()
for path in [binary / 'initdb', binary / 'postgres', binary / 'pg_ctl', node, auth / 'auth-server']:
    if not path.is_file():
        raise SystemExit('Explicit prepared native executable missing: ' + str(path))
directory = pathlib.Path(tempfile.mkdtemp(prefix='ouchi-scoped-pg-', dir='/private/tmp'))
socket = directory / 's'
socket.mkdir(mode=0o700)
attempted = False
try:
    subprocess.run([str(binary / 'initdb'), '-D', str(directory / 'data'), '-U', 'ouchi_fixture',
                    '--auth-local=trust', '--auth-host=reject', '--no-locale', '-E', 'UTF8'],
                   check=True, stdout=subprocess.DEVNULL, timeout=30)
    options = ['-k', str(socket), '-p', '5432', '-c', "listen_addresses=", '-c', 'max_connections=30']
    attempted = True
    subprocess.run([str(binary / 'pg_ctl'), '-D', str(directory / 'data'), '-l', str(directory / 'server.log'),
                    '-o', shlex.join(options), '-w', '-t', '15', 'start'],
                   check=True, stdout=subprocess.DEVNULL, timeout=20)
    print('Isolated native test server: ' + subprocess.check_output([str(binary / 'postgres'), '--version'], text=True).strip(), flush=True)
    env = dict(os.environ)
    env.update(OUCHI_SCOPED_TEST_PG_SOCKET=str(socket), OUCHI_TEST_AUTH_RUNTIME=str(auth))
    if args.enrollment_full_http:
        env.update(OUCHI_ENROLLMENT_FULL_SCHEMA='1', OUCHI_TEST_POSTGREST_BINARY=str(rest_binary), OUCHI_TEST_POSTGREST_LIBRARY=str(rest_library))
        print('Enrollment profile: full pinned schema + actual local PostgREST', flush=True)
    if args.prelogout_source_dir:
        env['OUCHI_PRELOGOUT_SOURCE_DIR'] = str(pathlib.Path(args.prelogout_source_dir).resolve())
    result = subprocess.run([str(node), '--test', '--test-concurrency=1', args.test_file],
                            cwd=root, env=env, timeout=180)
    raise SystemExit(result.returncode)
finally:
    if attempted:
        subprocess.run([str(binary / 'pg_ctl'), '-D', str(directory / 'data'), '-m', 'fast', '-w', '-t', '10', 'stop'],
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=15, check=False)
        status = subprocess.run([str(binary / 'pg_ctl'), '-D', str(directory / 'data'), 'status'],
                                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=5)
        if status.returncode == 0:
            raise RuntimeError('Owned native cluster still running; directory preserved')
        if status.returncode != 3:
            raise RuntimeError('Owned native cluster stop unconfirmed; directory preserved')
    shutil.rmtree(directory)
    print('Owned native cluster stopped and temporary directory removed', flush=True)
