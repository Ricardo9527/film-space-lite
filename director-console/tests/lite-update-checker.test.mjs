import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {createUpdateChecker,selectRelease}=require('../app/update-checker.cjs');
const release=(tag,extra={})=>({tag_name:tag,prerelease:true,body:'<img src=x onerror=alert(1)>',assets:[{name:'Film.Space.Lite.app.zip'},{name:'Film.Space.Lite.Windows.11.x64.zip'},{name:'SHA256SUMS.txt'}],...extra});
const response=(items)=>({status:200,etag:'test-etag',body:JSON.stringify(items)});
test('numeric versions, public previews and platform package completeness',async()=>{
 const items=[release('v0.1.8'),release('v0.1.10'),release('v0.1.99',{draft:true}),release('diagnostic'),release('v0.2.0',{assets:[]})];
 for(const platform of ['darwin','win32']){
  const x=await createUpdateChecker({version:'0.1.9',platform,request:async()=>response(items)}).check();
  assert.equal(x.status,'available');assert.equal(x.release.version,'0.1.10');assert.equal(x.release.prerelease,true);
  assert.equal(x.release.url,'https://github.com/Ricardo9527/film-space-lite/releases/tag/v0.1.10');
 }
 assert.equal(selectRelease([release('v0.1.10',{assets:[{name:'Film.Space.Lite.app.zip'}]})],'darwin'),undefined);
});
test('same or older release never prompts downgrade',async()=>{
 for(const tag of ['v0.1.9','v0.1.8'])assert.equal((await createUpdateChecker({version:'0.1.9',request:async()=>response([release(tag)])}).check()).status,'current');
});
test('request coalescing, hourly cache, manual cooldown and ETag reuse',async()=>{
 let time=0,calls=0;
 const checker=createUpdateChecker({now:()=>time,version:'0.1.9',request:async etag=>{calls++;if(calls===1)return response([release('v0.1.10')]);assert.equal(etag,'test-etag');return {status:304};}});
 await Promise.all([checker.check(),checker.check({force:true})]);assert.equal(calls,1);
 time=9999;await checker.check({force:true});assert.equal(calls,1);
 time=10000;assert.equal((await checker.check({force:true})).status,'available');assert.equal(calls,2);
 time+=3599999;await checker.check();assert.equal(calls,2);
 time++;await checker.check();assert.equal(calls,3);
});
test('network, rate limit, invalid payload and absent release remain explicit failures',async()=>{
 for(const request of [async()=>{throw new Error('offline');},async()=>({status:403}),async()=>({status:200,body:'broken'}),async()=>response([]),async()=>({status:304})]){
  const x=await createUpdateChecker({request}).check();assert.equal(x.status,'error');assert.ok(x.error);assert.equal(x.checkedAt,null);
 }
});
test('failed retry preserves last success timestamp without claiming current',async()=>{
 let time=0,calls=0;
 const checker=createUpdateChecker({version:'0.1.9',now:()=>time,request:async()=>{if(calls++)throw new Error('offline');return response([release('v0.1.10')]);}});
 await checker.check();time=3600000;const result=await checker.check();assert.equal(result.status,'error');assert.equal(result.checkedAt,0);
});
test('release supplied URL cannot change trusted download host',async()=>{
 const x=await createUpdateChecker({version:'0.1.9',request:async()=>response([release('v0.1.10',{html_url:'https://evil.invalid'})])}).check();
 assert.ok(x.release.url.startsWith('https://github.com/Ricardo9527/film-space-lite/'));
});
