import assert from 'node:assert/strict';
import { setSharedDataStore } from '../lib/data-store.mjs';

const records = new Map();
setSharedDataStore({
  hasCloudDataStore: () => true,
  readData: (key, fallback) => records.has(key) ? JSON.parse(records.get(key)) : fallback,
  async writeData(key, value) {
    records.set(key, JSON.stringify(value));
    return { ok: true };
  },
});

async function request(routes, action, body) {
  const response = {};
  const req = { method: body ? 'POST' : 'GET' };
  await routes.handleDirector(req, response, new URL('http://local/api/director/' + action), {
    readBody: async () => JSON.stringify(body),
    sendJSON: (res, state, status = 200) => Object.assign(res, { state, status }),
  });
  assert.equal(response.status, 200, JSON.stringify(response.state?.error));
  return response.state;
}

const beforeRestart = await import('../director/routes.mjs');
await request(beforeRestart, 'scene', { id: 'commentary' });
await request(beforeRestart, 'settings', { id: 'commentary', patch: { banner: { title: '赛事成就' } } });
await request(beforeRestart, 'settings', { id: 'commentary', patch: { banner: { content: '第十场胜利' } } });
const timer = { minutes: '8', seconds: '30' };
await request(beforeRestart, 'draft', { section: 'timer', value: timer });
const roster = { teams: { blue: { name: '蓝队' } }, items: Array.from({ length: 5 }, () => ({ blue: { player: '待确认选手' } })) };
await request(beforeRestart, 'draft', { section: 'spotlight', value: roster });
await request(beforeRestart, 'scene', { id: 'spotlight', rememberScene: false });

const afterRestart = await import('../director/routes.mjs?restart');
afterRestart.restoreDirectorWorkspace();
const restored = await request(afterRestart, 'state');
assert.equal(restored.lastManualScene, 'commentary');
assert.equal(restored.onAir.scene, 'blank');
assert.deepEqual(restored.preview.settings.commentary.banner, { title: '赛事成就', content: '第十场胜利' });
assert.deepEqual(restored.directorDraft, { timer, spotlight: roster });
assert.equal(restored.live.spotlightPlaylist, null);
console.log('test-director-workspace: cloud round trip, scene selection and unpushed drafts passed');
