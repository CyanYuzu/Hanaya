import test from 'node:test';
import assert from 'node:assert/strict';
import {boundedJSON,parseCurrent,parseManifest,spreadIndices,viewportPages} from '../src/utils/manga-reader.ts';
const base='https://test.invalid/manga-media/manga/book/chapter/current.json',version='20261013T070102123Z';
const fixture=()=>({schema_version:1,chapter_id:'chapter',release_id:version,page_count:2,reading_direction:'rtl',updated_at:'2026-10-13T07:01:02Z',pages:[0,1].map(i=>({page_id:'page-'+i,url:'/manga-media/objects/aa/'+('a'.repeat(64))+'.png',width:600,height:800,sha256:'a'.repeat(64)}))});
test('published manifest rejects private project fields and untrusted URLs',()=>{
    const value=fixture();assert.equal(parseManifest(value,base,'chapter',version).pages.length,2);
    for(const patch of [{ocr:'private text'},{pages:[{...value.pages[0],url:'/manga-api/api/v1/assets/private/file'}]},{pages:[{...value.pages[0],url:'https://other.invalid/manga-media/objects/page.png'}]},{pages:[value.pages[0],value.pages[0]]}])assert.throws(()=>parseManifest({...value,...patch},base,'chapter',version));
    assert.throws(()=>parseManifest({...value,release_id:'arbitrary'},base,'chapter','arbitrary'));
    assert.equal(parseCurrent({chapter_id:'chapter',release_id:version,manifest:'/manga-media/manga/book/chapter/releases/'+version+'/manifest.json'},base,'chapter').release_id,version);
});
test('cover and last odd page do not duplicate a facing page',()=>{assert.deepEqual(spreadIndices(0,4),[0]);assert.deepEqual(spreadIndices(1,4),[1,2]);assert.deepEqual(spreadIndices(3,4),[3]);});
test('R2 finished images require explicit origin and keep absolute URLs for cached reading',()=>{
    const value=fixture(),origin='https://roaster.cyanyuzu.work';value.pages=value.pages.map(p=>({...p,url:origin+'/book/'+encodeURIComponent('成品图')+'/chapter/objects/'+p.sha256+'.png'}));
    assert.throws(()=>parseManifest(value,base,'chapter',version));const parsed=parseManifest(value,base,'chapter',version,[origin]);assert.ok(parsed.pages[0].url.startsWith(origin));assert.deepEqual(parseManifest(parsed,base,'chapter',version,[origin]),parsed);
    for(const path of ['原图','去字图'])assert.throws(()=>parseManifest({...value,pages:[{...value.pages[0],url:origin+'/book/'+encodeURIComponent(path)+'/image.png'}],page_count:1},base,'chapter',version,[origin]));
    assert.throws(()=>parseCurrent({chapter_id:'chapter',release_id:version,manifest:origin+'/book/'+encodeURIComponent('成品图')+'/manifest.json'},base,'chapter'));
});
test('long chapter retains at most five nearby images',()=>{const near=Array.from({length:10000},(_,i)=>i);assert.deepEqual(viewportPages(500,10000,near),[500,499,501,498,502]);assert.deepEqual(viewportPages(0,2,near),[0,1]);});
test('stream limit rejects oversized public JSON before accumulating it',async()=>{await assert.rejects(boundedJSON(new Response(' '.repeat(4*1024*1024+1),{headers:{'Content-Type':'application/json'}})),/schema/);await assert.rejects(boundedJSON(new Response('{}',{headers:{'Content-Type':'text/html'}})),/schema/);});
test('long valid chapters fit the bounded transport contract',async()=>{const value=fixture();value.pages=Array.from({length:3000},(_,i)=>({...value.pages[0],page_id:'page-'+i}));value.page_count=value.pages.length;const body=JSON.stringify(value);assert.ok(Buffer.byteLength(body)>512*1024);const result=await boundedJSON(new Response(body,{headers:{'Content-Type':'application/json'}}));assert.equal(parseManifest(result,base,'chapter',version).pages.length,3000);});
