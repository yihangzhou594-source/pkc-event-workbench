import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const require=createRequire(import.meta.url);
const {chromium}=require('C:/Users/12113/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'pkc-scene-regression-'));
for(const f of fs.readdirSync('数据')) if(f.endsWith('.json')) fs.copyFileSync(path.join('数据',f),path.join(temp,f));
const port=23571;
const server=spawn(process.execPath,['server.mjs'],{env:{...process.env,PKC_PORT:String(port),PKC_OPEN:'0',PKC_DATA_DIR:temp},stdio:'ignore',windowsHide:true});
let browser;
try {
 for(let i=0;i<80;i++){try{if((await fetch(`http://127.0.0.1:${port}/api/ping`)).ok) break;}catch{} await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({channel:'msedge',headless:true});
 for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:900}});
  await page.route('**/api/store/**',r=>r.request().method()==='POST'?r.abort():r.continue());
  await page.goto(`http://127.0.0.1:${port}/generator`);
  await page.waitForFunction(()=>window.PKC);
  const result=await page.evaluate(()=>{
   const series=PKC.series(); const g=PKC.game();
   g.ourId=series.teams[0].id;g.oppId=series.teams[1].id;g.matchKey='REGRESSION';delete g.sidesConfirmed;
   return [g.ourId,g.oppId];
  });
  await page.locator('#btnParse').click();
  await page.getByRole('dialog').locator('button[value="1"]').click();
  await page.getByRole('dialog').waitFor({state:'hidden'});
  const chosen=await page.evaluate(()=>[PKC.game().ourId,PKC.game().oppId,PKC.normGame(PKC.game(),0).sidesConfirmed]);
  assert.deepEqual(chosen,[result[1],result[0],true]);
  await page.evaluate(()=>PKC.renderGameBar());
  await page.locator('#gameBar button').filter({hasText:'新一局'}).click();
  assert.deepEqual(await page.evaluate(()=>[PKC.game().ourId,PKC.game().oppId]),result);
  await page.close();
 }
 const page=await browser.newPage();
 await page.goto(`http://127.0.0.1:${port}/obs/interval`);
 const stable=await page.evaluate(()=>{
   const live={countdown:{remainingMs:60000,running:true}};
   renderInterval({},live); const root=document.querySelector('.iv'); const clock=document.querySelector('.iv-clock');
   for(let i=59;i>=50;i--)renderInterval({}, {countdown:{remainingMs:i*1000,running:true}});
   return {same:root===document.querySelector('.iv'),sameClock:clock===document.querySelector('.iv-clock'),text:clock.textContent};
 });
 assert.equal(stable.same,true); assert.equal(stable.sameClock,true); assert.match(stable.text,/50/);
 console.log('desktop + mobile: first-game selection, persisted flag, next-game swap; interval DOM stable over 10 countdown ticks: passed');
 // The existing drawing regression verifies both classic and KPL exports.
 const test=fs.readFileSync('tools/test-chart-lane-reference.mjs','utf8').replace('http://127.0.0.1:8971',`http://127.0.0.1:${port}`);
 fs.writeFileSync('tools/.chart-reference-run.mjs',test);
 const run=spawnSync(process.execPath,['tools/.chart-reference-run.mjs'],{encoding:'utf8',timeout:90000});
 console.log(run.stdout);if(run.status!==0)throw new Error(run.stderr);
} finally {await browser?.close();server.kill();try{fs.unlinkSync('tools/.chart-reference-run.mjs');}catch{}}
