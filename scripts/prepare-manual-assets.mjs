import {cp,mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {dirname,join} from 'node:path';
const require=createRequire(import.meta.url);
const source=dirname(require.resolve('pdfjs-dist/package.json'));
const target=join(process.cwd(),'.manual-assets');
await mkdir(target,{recursive:true});
// Physical copies avoid deployment packages with symlinked asset directories.
await cp(join(source,'cmaps'),join(target,'cmaps'),{recursive:true,dereference:true});
await cp(join(source,'legacy/build/pdf.worker.mjs'),join(target,'pdf.worker.mjs'),{dereference:true});
