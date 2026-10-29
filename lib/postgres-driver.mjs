import {Client} from 'pg';
// Constructor only; connection acquisition is owned by the bounded adapter.
export function createPostgresClient(config){return new Client(config);}
