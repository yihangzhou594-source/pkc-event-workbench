import assert from 'node:assert/strict';
await import('../assets/director-chart-flow.js');
const items=Array.from({length:6},()=>({seriesId:'s',game:{id:'g',matchKey:'m'}}));
const context={seriesId:'s',gameId:'g',matchKey:'m'};
function setup(){const calls=[];return {calls,post:async(action,body)=>{calls.push([action,body]);return {preview:{scene:'chart'}}},push:async()=>{calls.push(['push']);return true}}}
const live=setup();await PKCChartFlow.play({items,context,intervalMs:8000,...live});
assert.deepEqual(live.calls.map(x=>x[0]),['chart/playlist','scene','push','chart/playlist']);
assert.equal(live.calls[0][1].patch.running,false);assert.equal(live.calls[3][1].patch.running,true);
const preview=setup();await PKCChartFlow.play({items,context,...preview,previewOnly:true});assert.equal(preview.calls.length,2);
const mismatch=setup();await assert.rejects(()=>PKCChartFlow.play({items,context:{...context,gameId:'other'},...mismatch}),/不一致/);assert.equal(mismatch.calls.length,0);
const failed=setup();await assert.rejects(()=>PKCChartFlow.play({items,context,...failed,push:async()=>false}),/尚未切到直播/);assert.equal(failed.calls.length,2);
await assert.rejects(()=>PKCChartFlow.play({items:[],context,...setup()}),/尚未生成/);
await assert.rejects(()=>PKCChartFlow.play({items,context,...setup(),post:async()=>({error:'offline'})}),/offline/);
console.log('test-director-chart-flow: live, preview, mismatch, cancellation and failure passed');
