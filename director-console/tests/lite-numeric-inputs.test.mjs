import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const app=readFileSync(new URL('../app/director-app.js',import.meta.url),'utf8');
const scrub=readFileSync(new URL('../app/number-scrub.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');

test('continuous number fields accept fractional values; extra orbit turns remain integers',()=>{
 const fields=(app+'\n'+html).split('\n').filter(line=>line.includes('type="number"'));
 assert.ok(fields.length>40);
 for(const field of fields)assert.match(field,field.includes('id="cameraOrbitExtraTurns"')?/step="1"/:/step="any"/);
});

for(const [name,source] of [['wireInputNumberScrub',scrub],['wireProjectNumberScrub',app]]) {
 test(`${name} retains drag speed, fine adjustment and bounds independently of native step`,()=>{
  const start=source.indexOf(`function ${name}(`),end=source.indexOf('\nfunction ',start+1);
  const code=source.slice(start,end<0?undefined:end);
  let captured;
  const input={step:'any',dataset:{scrubStep:'0.05'},min:'0.001',max:'2',closest:()=>null,hasAttribute:()=>true};
  const context=vm.createContext({wireNumberScrub:(_input,options)=>{captured=options;}});
  vm.runInContext(code,context);
  if(name==='wireInputNumberScrub')context[name](input,{precision:3});
  else context[name](input,()=>{},'',{precision:3});
  assert.equal(captured.valueAtDelta(0.82,4,false),1.02);
  assert.equal(captured.valueAtDelta(0.82,4,true),0.84);
  assert.equal(captured.valueAtDelta(0.82,-100,false),0.001);
  assert.equal(captured.valueAtDelta(0.82,100,false),2);
  assert.equal(captured.format(0.825),'0.825');
 });
}
