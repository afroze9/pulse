import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const css=readFileSync(new URL('../src/theme.css',import.meta.url),'utf8');
const rgb=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
const luminance=hex=>rgb(hex).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4}).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
const ratio=(fg,bg)=>(Math.max(luminance(fg),luminance(bg))+.05)/(Math.min(luminance(fg),luminance(bg))+.05);
function tokens(mode){const block=css.split(':root[data-theme="'+mode+'"] {')[1].split('}')[0];return Object.fromEntries([...block.matchAll(/--([\w-]+):\s*(#[\da-f]{6})/g)].map(m=>[m[1],m[2]]));}
function passes(fg,backgrounds,min,label){for(const bg of backgrounds)assert.ok(ratio(fg,bg)>=min,label+' '+fg+' on '+bg+' = '+ratio(fg,bg).toFixed(3));}
test('light text tokens meet AA on their cards, avatars, and timeline surfaces',()=>{
 const t=tokens('light');
 passes(t.muted,['#ffffff','#f7f8f6','#edf4e8','#e4eee4','#f3f6ec','#f8f9f2'],4.5,'muted');
 for(const [name,bgs] of Object.entries({blue:['#e3ebf5','#e6eef9','#f0f4fa'],lavender:['#ede6f3','#ede8f8','#f3eff9'],mint:['#e4f0e8','#edf5ed'],amber:['#f3eddc','#faf1e8','#fbf7eb'],danger:['#f2e4df','#fcf0e9','#fbede4']}))passes(t[name+'-text'],bgs,4.5,name);
});
test('dark text tokens meet AA on solid and tinted surfaces',()=>{
 const t=tokens('dark');passes(t.muted,[t.surface,t['surface-alt'],'#14211b'],4.5,'muted');
 for(const name of ['blue','lavender','mint','amber','danger'])passes(t[name+'-text'],[t[name+'-surface'],t.surface,t['surface-alt']],4.5,name);
});
test('focus and control borders meet 3:1 including hovered and pressed surfaces',()=>{
 const light=tokens('light'),dark=tokens('dark');
 for(const token of ['focus','control-border']){passes(light[token],['#ffffff','#f7f8f6','#e3ebf5','#ede6f3','#d7e1d8'],3,'light '+token);passes(dark[token],[dark.surface,dark['surface-alt'],'#34483c','#40584a'],3,'dark '+token);}
});
test('dark navigation remains legible in both themes and selected state',()=>{
 passes('#adc8ba',['#153d34','#254b42','#102d25','#213c34'],4.5,'project keys');
 passes('#a0d6b1',['#153d34','#254b42','#102d25','#213c34'],3,'nav focus/selection');
});
test('native title-bar secondary text meets AA in rest, hover, and pressed states',()=>{
 const native=readFileSync(new URL('../desktop/PulseTitleBar.cs',import.meta.url),'utf8');
 const match=native.match(/var muted = Color.FromArgb\(dark \? "(#[\da-f]{6})" : "(#[\da-f]{6})"\)/);
 assert.ok(match);passes(match[1],['#14211b','#34483c','#40584a'],4.5,'native dark');passes(match[2],['#f7f8f4','#e5ebe4','#d7e1d8'],4.5,'native light');
});
