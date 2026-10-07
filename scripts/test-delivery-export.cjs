const fs=require('fs'),path=require('path'),assert=require('assert');
const {chromium}=require(process.env.PULSE_PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const out=path.resolve('artifacts/export-check');fs.mkdirSync(out,{recursive:true});
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
 const page=await browser.newPage({viewport:{width:1600,height:1050}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const data=JSON.parse(fs.readFileSync('src/demo.json','utf8'));
 const configuration={projects:data.projects.map(p=>p.id),people:data.people.map(p=>p.id),types:['epic','story','task','bug']};
 await page.route('**/api/**',route=>route.fulfill({json:{version:1,data,configuration,source:'jira',canUndo:false,jira:{configured:false,connected:false}}}));
 await page.goto('http://127.0.0.1:5193/');
 await page.getByRole('button',{name:'Preview & Export',exact:true}).click();
 await page.getByRole('dialog').waitFor();
 await page.getByLabel('From',{exact:true}).fill('2026-10-01');
 await page.getByLabel('Through',{exact:true}).fill('2026-12-31');
 await page.locator('.paper').evaluate(img=>img.decode());
 await page.screenshot({path:path.join(out,'preview.png')});
 for(const [label,file] of [['PNG · This Page','preview.png-export'],['SVG · This Page','preview.svg'],['PDF · All Pages','delivery.pdf']]){
  const promise=page.waitForEvent('download');await page.getByRole('button',{name:label,exact:true}).click();
  const download=await promise;await download.saveAs(path.join(out,file));
  assert(fs.statSync(path.join(out,file)).size>1000);
 }
 const pdf=fs.readFileSync(path.join(out,'delivery.pdf'));assert(pdf.subarray(0,5).toString()==='%PDF-');
 const pageCount=(pdf.toString('latin1').match(/\/Type \/Page\b/g)||[]).length;assert(pageCount>1);
 await page.getByRole('button',{name:'Next Preview Page',exact:true}).click();
 assert((await page.locator('.paging').innerText()).includes('Page 2'));
 await page.keyboard.press('Escape');assert.equal(await page.getByRole('dialog').count(),0);
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({exports:['PNG','SVG','PDF'],pdfPages:pageCount,browserErrors:errors,screenshot:path.join(out,'preview.png')}));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1)});
