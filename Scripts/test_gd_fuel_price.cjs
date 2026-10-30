const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const script = fs.readFileSync(path.join(__dirname, 'gd_fuel_price.js'), 'utf8');

function snapshot() {
  return { schema_version: 2, updated_at: '2026-10-29', checked_at: '2026-10-30',
    official_status: 'ok', reference_state: 'synced', unit: '元/升',
    items: [{name:'92#',price:8.91},{name:'95#',price:9.65},{name:'98#',price:11.65},{name:'0# 柴油',price:8.6}] };
}

async function run({data = snapshot(), cache, manual = true, error = false, qx = false, failFirst = false, source} = {}) {
  const store = {};
  if (cache) { store.gd_fuel_cache = JSON.stringify(cache); store.gd_fuel_cache_time = String(Date.now()/1000); }
  let calls = 0, done = 0;
  const context = {
    setTimeout, clearTimeout,
    $trigger: manual ? 'button' : 'timer',
    $argument: source ? `source=${encodeURIComponent(source)}` : '',
    $persistentStore: {read:k=>store[k], write:(v,k)=>{store[k]=v;return true;}},
    $httpClient: {get:(o,cb)=>{calls++;const failed=error||(failFirst&&calls===1);cb(failed ? 'offline' : null, {status:failed?503:200}, failed?'':JSON.stringify(data));}},
  };
  if (qx) {
    context.$task = { fetch:async()=>{calls++;if(error)throw Error('offline');return {statusCode:200,body:JSON.stringify(data)};} };
    context.$prefs = {valueForKey:k=>store[k],setValueForKey:(v,k)=>{store[k]=v;return true;}};
  }
  const panel = await new Promise((resolve,reject)=>{
    context.$done = p=>{done++;resolve(p);};
    try { vm.runInNewContext(script, context, {timeout:1000}); } catch(e) {reject(e);}
  });
  assert.equal(done,1);
  return {panel,store,calls};
}

test('fresh official prices and check date render', async()=>{
  const {panel}=await run();
  assert.match(panel.content,/92#: 8.91/);
  assert.match(panel.content,/最近核对：2026-10-30/);
});
test('missing 98 never hides three official prices or shows zero',async()=>{
  const data=snapshot();data.items[2].price=null;data.reference_state='unavailable';data.reference_status='暂无可信参考价';
  const {panel}=await run({data});
  assert.match(panel.content,/98#: 暂无可信数据/);
  assert.match(panel.content,/95#: 9.65/);
  assert.doesNotMatch(panel.content,/98#: 0.00/);
  assert.equal(panel['icon-color'],'#FF9500');
});
test('retained 98 exposes its own reference date',async()=>{
  const data=snapshot();data.reference_state='retained';data.reference_status='暂沿用';data.reference_updated_at='2026-09-13';
  assert.match((await run({data})).panel.content,/参考日期：2026-09-13/);
});
test('bad payload cannot overwrite good cache',async()=>{
  const data=snapshot();data.items[0].price=NaN;
  const {panel,store}=await run({data,cache:snapshot()});
  assert.match(panel.content,/网络失败/);
  assert.equal(JSON.parse(store.gd_fuel_cache).items[0].price,8.91);
});
test('invalid cached object is never rendered',async()=>{
  const {panel}=await run({cache:{items:[{price:0}]},error:true});
  assert.match(panel.content,/没拿到油价数据/);
});
test('valid cache used on automatic run; manual run fetches',async()=>{
  assert.equal((await run({cache:snapshot(),manual:false})).calls,0);
  assert.equal((await run({cache:snapshot(),manual:true})).calls,1);
});
test('official failure is visible with retained prices',async()=>{
  const data=snapshot();data.official_status='degraded';
  const {panel}=await run({data});assert.match(panel.content,/官方核对失败/);assert.match(panel.content,/92#: 8.91/);
});
test('stale verification date warns even if HTTP fetch succeeds',async()=>{
  const data=snapshot();data.checked_at='2020-01-01';
  assert.match((await run({data})).panel.content,/超过三天/);
});
test('legacy JSON and QX response remain supported',async()=>{
  const data=snapshot();delete data.schema_version;delete data.checked_at;delete data.reference_state;
  assert.match((await run({data,qx:true})).panel.content,/92#: 8.91/);
});
test('duplicate names rejected',async()=>{
  const data=snapshot();data.items[2].name='95#';
  assert.match((await run({data})).panel.content,/没拿到油价数据/);
});
test('GitHub API recovers when Raw fails',async()=>{
  const {panel,calls}=await run({failFirst:true});
  assert.equal(calls,2);assert.match(panel.content,/92#: 8.91/);
});
test('custom source never falls back to unrelated default data',async()=>{
  const {panel,calls}=await run({error:true,source:'https://example.com/custom.json'});
  assert.equal(calls,1);assert.match(panel.content,/没拿到油价数据/);
});
test('older fetched snapshot cannot roll back good cache',async()=>{
  const data=snapshot();data.updated_at='2026-09-24';data.items[0].price=8.63;
  const {panel}=await run({data,cache:snapshot()});
  assert.match(panel.content,/92#: 8.91/);assert.match(panel.content,/网络失败/);
});
