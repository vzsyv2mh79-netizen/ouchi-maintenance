import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist/legacy/build/pdf.mjs";
import { extractMaintenanceLines, hasExactModel, pdfTextLines, manualMaker } from "./manual-evidence";
export async function inspectManual(bytes: Uint8Array, model:string, url:string) {
  const packageRoot=join(process.cwd(),'.manual-assets');
  GlobalWorkerOptions.workerSrc=pathToFileURL(join(packageRoot,'pdf.worker.mjs')).href;
  const task=getDocument({data:bytes,enableXfa:false,useWasm:false,useSystemFonts:false,cMapUrl:join(packageRoot,'cmaps/'),cMapPacked:true,verbosity:0});
  try {
    const document=await task.promise;
    if(document.numPages>100)throw new Error('Manual too long');
    const pages:{page:number;lines:string[]}[]=[];
    for(let number=1;number<=document.numPages;number++) {
      const page=await document.getPage(number);const content=await page.getTextContent();
      const lines=pdfTextLines(content.items.filter(item=>'str' in item));
      pages.push({page:number,lines});page.cleanup();
      if(number===2&&!hasExactModel(pages.flatMap(page=>page.lines).join('\n'),model))throw new Error('Model mismatch');
    }
    if(!hasExactModel(pages.slice(0,2).flatMap(page=>page.lines).join('\n'),model))throw new Error('Model mismatch');
    const cover=pages.slice(0,2).flatMap(page=>page.lines).join('');
    if(!cover.includes('空気清浄機'))throw new Error('Unsupported product');
    return {maker:manualMaker(url),name:cover.includes('加湿空気清浄機')?'加湿空気清浄機':'空気清浄機',pageCount:document.numPages,suggestions:extractMaintenanceLines(pages,url)};
  } finally { await task.destroy(); }
}
