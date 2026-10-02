import test from 'node:test';
import assert from 'node:assert/strict';
import { createAppearance } from '../src/appearance.js';
function fixture(saved, send) {
  let changed, current;
  const values = new Map([['pulse.appearance', saved]]);
  const root = {dataset:{},style:{}};
  const media = {matches:false,addEventListener:(_,fn)=>changed=fn,removeEventListener:()=>changed=null};
  const app = createAppearance({root,media,send,storage:{getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)}});
  app.subscribe(value=>current=value);
  return {app,root,values,get current(){return current},change(dark){media.matches=dark;changed?.();}};
}
test('System follows live OS changes; explicit selection persists and overrides them',()=>{
  const f=fixture('invalid');assert.deepEqual(f.current,{mode:'system',resolved:'light'});
  f.change(true);assert.equal(f.root.dataset.theme,'dark');
  f.app.setMode('light');f.change(false);f.change(true);assert.equal(f.current.resolved,'light');
  assert.equal(f.values.get('pulse.appearance'),'light');
  f.app.setMode('system');assert.equal(f.current.resolved,'dark');
  f.app.destroy();f.change(false);assert.equal(f.current.resolved,'dark');
});
test('native preferences and OS notifications control both saved mode and resolved palette',()=>{
  const sent=[];const f=fixture('light',(...args)=>sent.push(args));
  f.app.acceptNative({mode:'system',resolved:'dark'});assert.equal(f.root.style.colorScheme,'dark');
  f.change(false);assert.equal(f.current.resolved,'dark');
  f.app.setMode('dark');assert.deepEqual(sent,[['appearance',{mode:'dark'}]]);
  const restored=fixture(f.values.get('pulse.appearance'));assert.equal(restored.current.resolved,'dark');
  f.app.acceptNative({mode:'system',resolved:'light'});assert.deepEqual(f.current,{mode:'system',resolved:'light'});
});
