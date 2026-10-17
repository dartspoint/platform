import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium,expect} from '@playwright/test';
import {origin} from './helpers';
const browser=await chromium.launch(),results=[];
try{
 for(const locale of ['en','nl']){
  const context=await browser.newContext({viewport:{width:320,height:844},reducedMotion:'reduce'}),page=await context.newPage(),errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  try{
   await page.goto(origin+'/'+locale);
   await page.waitForFunction(()=>navigator.serviceWorker.controller?.scriptURL.endsWith('/sw-i18n.js'),{},{timeout:15000});
   await expect(page.locator('.mk-slide-buttons button').nth(1)).toBeDisabled();
   await context.setOffline(true);
   const response=await page.goto(origin+'/oefenen');
   assert.equal(response?.fromServiceWorker(),true);
   assert.equal(await page.evaluate(()=>navigator.onLine),false);
   await expect(page.locator('html')).toHaveAttribute('lang',locale);
   await expect(page.getByRole('heading',{name:locale==='en'?'Your next good throw.':'Jouw volgende goede worp.',exact:true})).toBeVisible();
   await expect(page.getByRole('img',{name:locale==='en'?'Dartboard with your last throw':'Dartbord met je laatste worp',exact:true})).toBeVisible();
   await page.getByRole('button',{name:locale==='en'?'Stop direction':'Stop richting',exact:true}).click();
   await page.getByRole('button',{name:locale==='en'?'Stop height and throw':'Stop hoogte en gooi',exact:true}).click();
   await expect(page.locator('#hit')).not.toHaveText('—');
   await expect(page.getByRole('status')).toContainText(locale==='en'?/points?|Bust|checkout/:/punt(?:en)?|Bust|finish/);
   await page.getByRole('button',{name:locale==='en'?'Practise again':'Opnieuw oefenen',exact:true}).click();
   await expect(page.getByRole('status')).toHaveText(locale==='en'?'Stop your direction with the red button or the space bar.':'Stop je richting met de rode knop of spatiebalk.');
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
   assert.deepEqual(errors,[]);results.push({locale,ok:true,actualServiceWorker:true,browserOffline:true,completedThrow:true,reset:true,mobile320:true,noRuntimeErrors:true});
  }catch(error){console.error(JSON.stringify({event:'offline_i18n_failure',locale,lang:await page.locator('html').getAttribute('lang'),headings:await page.locator('h1').allTextContents(),status:await page.locator('#status').allTextContents(),errors}));throw error;}
  finally{await context.close();}
 }
 await mkdir('artifacts/i18n',{recursive:true});
 await writeFile('artifacts/i18n/offline-browser-result.json',JSON.stringify({ok:true,results},null,2));
 console.log('Actual cached NL/EN offline practice, throws, reset and mobile layout passed');
}finally{await browser.close();}
