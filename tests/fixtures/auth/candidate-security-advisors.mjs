import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Client} from 'pg';

// Catalog-only verification for the isolated CI database. This is not a
// production grant/endpoint review or a reason to create permissive policies.
assert.equal(process.env.CI, 'true');
assert.equal(process.env.OUCHI_CANDIDATE_SECURITY_TEST, 'true');
assert.equal(process.argv.length, 3);
const report = JSON.parse(await readFile(process.argv[2], 'utf8'));
assert.ok(Array.isArray(report.results) && report.results.length <= 1000);
const db = new Client({host:'127.0.0.1', port:54323, database:'auth_test',
 user:'postgres', password:'synthetic-ci-only', ssl:false,
 connectionTimeoutMillis:2000, query_timeout:5000});
await db.connect();
try {
 await db.query('begin read only');
 assert.equal((await db.query("select current_database() = 'auth_test' matches")).rows[0].matches, true);
 let reviewed = 0;
 for (const lint of report.results) {
  assert.equal(lint.level, 'INFO', 'Warnings/errors must stop the advisor step');
  assert.equal(lint.name, 'rls_enabled_no_policy', 'Unreviewed advisory requires investigation');
  assert.deepEqual(lint.categories, ['SECURITY']);
  const {schema, name, type} = lint.metadata ?? {};
  assert.equal(type, 'table');
  assert.ok(schema === 'maintenance_private' || (schema === 'public' && name === 'maintenance_push_test_limits'));
  assert.ok(typeof name === 'string' && /^[a-z_][a-z_0-9]{0,62}$/.test(name));
  const result = await db.query(`select c.relrowsecurity as rls,
   not exists(select 1 from pg_catalog.pg_policy p where p.polrelid=c.oid) as no_policies,
   (select count(*)=2 and bool_and(not r.rolsuper and not r.rolbypassrls
    and not pg_catalog.pg_has_role(r.oid,c.relowner,'MEMBER')
    and not exists(select 1 from pg_catalog.pg_roles privileged
     where (privileged.rolsuper or privileged.rolbypassrls)
      and pg_catalog.pg_has_role(r.oid,privileged.oid,'MEMBER'))
    and not pg_catalog.has_table_privilege(r.oid,c.oid,'TRUNCATE')
    and not pg_catalog.has_table_privilege(r.oid,c.oid,'REFERENCES')
    and not pg_catalog.has_table_privilege(r.oid,c.oid,'TRIGGER'))
    from pg_catalog.pg_roles r where r.rolname in ('anon','authenticated')) as default_deny
   from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
   where n.nspname=$1 and c.relname=$2 and c.relkind in ('r','p')`, [schema,name]);
  assert.deepEqual(result.rows, [{rls:true,no_policies:true,default_deny:true}], `${schema}.${name}: current client-role denial required`);
  reviewed++;
 }
 await db.query('rollback');
 console.log(`candidate security advisors: ${reviewed} informational no-policy tables independently retain RLS default denial for anon/authenticated; no ownership, bypass-role membership, TRUNCATE, REFERENCES or TRIGGER escape; catalog-only read-only transaction, not production RPC/least-privilege proof`);
} finally {
 await db.end();
}
