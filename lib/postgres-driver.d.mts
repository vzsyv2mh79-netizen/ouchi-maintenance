import type {DedicatedPostgresClient} from './dedicated-postgres-connection.mjs';
export function createPostgresClient(config:Readonly<Record<string,unknown>>):DedicatedPostgresClient;
