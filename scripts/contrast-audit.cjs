const fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..');
const {chromium}=require(process.env.PULSE_PLAYWRIGHT_MODULE||'playwright');
const out=path.resolve(process.env.PULSE_CONTRAST_OUTPUT||path.join(root,'artifacts/contrast'))+path.sep;
fs.mkdirSync(out,{recursive:true});
const phase=process.argv[2]||'before';
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 const context=await browser.newContext({viewport:{width:1600,height:1100},deviceScaleFactor:1});
 const data=JSON.parse(fs.readFileSync(path.join(root,'src/demo.json'),'utf8'));
 const configuration={projects:data.projects.map(x=>x.id),people:data.people.map(x=>x.id),types:['epic','story','task','bug']};
 await context.route('**/api/**',route=>{
   if(route.request().method()!=='GET')return route.abort();
   const workspace=route.request().url().endsWith('/workspace');
   return route.fulfill({json:workspace?{version:1,data,configuration,source:'jira',canUndo:false,jira:{configured:false,connected:false}}:{configured:false,connected:false,message:'Contrast audit fixture',hasToken:false}});
 });
 // No external requests are necessary for contrast measurement.
 await context.route(/^https:\/\//,route=>route.abort());
 const results=[];
 for(const theme of ['light','dark']){
 const page=await context.newPage();
 await page.addInitScript(mode=>localStorage.setItem('pulse.appearance',mode),theme);
 await page.goto(process.env.PULSE_PREVIEW_URL||'http://127.0.0.1:5190/');await page.locator('.vis-timeline').waitFor();
 async function scan(view){
   await page.waitForTimeout(250);
   const result=await page.evaluate(()=>{
     const parse=s=>{const n=s.match(/[\d.]+/g)?.map(Number)||[];return [n[0]||0,n[1]||0,n[2]||0,n[3]??1]};
     const blend=(fg,bg)=>fg.slice(0,3).map((v,i)=>v*fg[3]+bg[i]*(1-fg[3]));
     const lum=c=>c.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4}).reduce((a,v,i)=>a+v*[.2126,.7152,.0722][i],0);
     const ratio=(a,b)=>(Math.max(lum(a),lum(b))+.05)/(Math.min(lum(a),lum(b))+.05);
     const selector=el=>el.tagName.toLowerCase()+[...el.classList].filter(x=>!x.startsWith('svelte-')).map(x=>'.'+x).join('');
     const rows=[]; const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
     for(let node;node=walker.nextNode();){
       if(!node.textContent.trim())continue;const el=node.parentElement;
       if(!el||el.closest('script,style,[disabled],[aria-disabled="true"]'))continue;
       const s=getComputedStyle(el);if(s.visibility!=='visible'||!el.getClientRects().length)continue;
       const chain=[];for(let p=el;p;p=p.parentElement)chain.unshift(p);
       let bg=[255,255,255],opacity=1,gradient=false;
       for(const p of chain){const c=getComputedStyle(p);opacity*=Number(c.opacity);const rgba=parse(c.backgroundColor);rgba[3]*=opacity;bg=blend(rgba,bg);if(c.backgroundImage!=='none')gradient=true;}
       if(opacity===0)continue;const fg=parse(s.color);fg[3]*=opacity;const rendered=blend(fg,bg);
       const required=parseFloat(s.fontSize)>=24||(parseFloat(s.fontSize)>=18.66&&parseInt(s.fontWeight)>=700)?3:4.5;
       const value=ratio(rendered,bg);
       rows.push({selector:selector(el),parent:selector(el.parentElement),text:node.textContent.trim().slice(0,85),color:s.color,background:bg.map(Math.round),opacity,ratio:+value.toFixed(3),required,gradient,pass:value>=required});
     }
   const controls=[];
   for(const el of document.querySelectorAll('input:not(:disabled),select:not(:disabled),button.chosen,.filter-trigger,.plain-button:not(:disabled)')){
     if(!el.getClientRects().length)continue;const s=getComputedStyle(el);
     const chain=[];for(let p=el;p;p=p.parentElement)chain.unshift(p);
     let bg=[255,255,255];for(const p of chain)bg=blend(parse(getComputedStyle(p).backgroundColor),bg);
     if(s.borderTopStyle!=='none'&&parseFloat(s.borderTopWidth)>0)controls.push({selector:selector(el),kind:'border',color:s.borderTopColor,background:bg,ratio:+ratio(parse(s.borderTopColor),bg).toFixed(3)});
   }
   return {rows,controls};
   });
   results.push({theme,view,count:result.rows.length,failures:result.rows.filter(r=>!r.pass),gradientReview:result.rows.filter(r=>r.gradient),controls:result.controls,minimum:Math.min(...result.rows.filter(r=>!r.gradient).map(r=>r.ratio))});
 }
 await scan('resources');
 await page.locator('.project-nav button').first().hover();await scan('sidebar-hover');
 await page.locator('.project-nav button').first().click();await scan('sidebar-selected');await page.locator('.project-nav button').first().click();
 await page.locator('.resource-ticket').first().click();await scan('ticket-details');await page.getByRole('button',{name:'Close details',exact:true}).click();
 await page.locator('.filter-trigger').click();await scan('project-filter');await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'Plan Allocation',exact:true}).click();await scan('plan-dialog');await page.keyboard.press('Escape');
 // Escape is handled by dialogs; use their explicit close if still present.
 if(await page.locator('.modal-shade').count())await page.locator('.modal-shade .icon-button').first().click();
 await page.locator('nav').getByRole('button',{name:'Projects',exact:true}).click();await scan('projects');
 await page.locator('nav').getByRole('button',{name:'Roadmap',exact:true}).click();await scan('roadmap');
 await page.locator('.help-link').click();await scan('capacity-dialog');await page.locator('.policy-modal .icon-button').click();
 await page.locator('nav').getByRole('button',{name:'Configuration',exact:true}).click();await scan('configuration');
 await page.getByRole('button',{name:'Dark',exact:true}).focus();await page.keyboard.press('Tab');
 const focus=await page.locator(':focus').evaluate(el=>{const s=getComputedStyle(el);return {color:s.outlineColor,width:s.outlineWidth,style:s.outlineStyle,focusVisible:el.matches(':focus-visible')};});
 results[results.length-1].focus=focus;
 await page.screenshot({path:out+'contrast-'+phase+'-'+theme+'.png'});
 await page.close();
 }
 fs.writeFileSync(out+'contrast-'+phase+'.json',JSON.stringify(results,null,2));
 console.log(JSON.stringify(results.map(({theme,view,count,failures,minimum,gradientReview})=>({theme,view,count,failures:failures.length,minimum,gradientRows:gradientReview.length})),null,2));
 const unique=new Map();for(const r of results)for(const f of r.failures)unique.set([r.theme,f.selector,f.color,f.background,f.opacity].join('|'),{theme:r.theme,...f});
 console.log('UNIQUE FAILURES',JSON.stringify([...unique.values()].sort((a,b)=>a.ratio-b.ratio),null,2));
 const controlFailures=results.flatMap(r=>r.controls.filter(c=>c.ratio<3).map(c=>({theme:r.theme,view:r.view,...c})));
 console.log('CONTROL CHECKS',JSON.stringify({count:results.reduce((n,r)=>n+r.controls.length,0),failures:controlFailures,focus:results.filter(r=>r.focus).map(r=>({theme:r.theme,...r.focus}))},null,2));
 await browser.close();
 if(results.some(r=>r.failures.length)||controlFailures.length||results.some(r=>r.focus&&(!r.focus.focusVisible||r.focus.style==='none')))process.exitCode=1;
})().catch(e=>{console.error(e);process.exit(1)});
