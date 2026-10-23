// Run from a full repository checkout with Node's TypeScript stripping enabled.
import { catalog } from '../../lib/product-lookup.ts';
import { writeFileSync } from 'node:fs';
const destination = process.argv[2];
if (!destination) throw new Error('Pass the output JSON file path');
writeFileSync(destination, JSON.stringify(catalog));
console.log(`Exported ${catalog.length} Web catalog entries`);
