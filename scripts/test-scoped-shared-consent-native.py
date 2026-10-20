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
args = parser.parse_args()
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
    result = subprocess.run([str(node), '--test', '--test-concurrency=1', 'tests/scoped-shared-consent.native.mjs'],
                            cwd=root, env=env, timeout=60)
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
