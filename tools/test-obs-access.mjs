import assert from 'node:assert/strict';
import {obsReadAllowed,tokenMatches} from '../lib/obs-access.mjs';
for(const path of ['/obs/chart','/obs/commentary','/assets/pkc-draw.js','/thumb/a.png','/api/obs/stream','/api/obs/teams']) assert.equal(obsReadAllowed('GET',path),true,path);
for(const path of ['/director','/api/store/library','/api/store/matches','/api/competition/teams','/api/director/stream','/api/director/push','/api/store/prefs','/api/obs-links','/api/store/heroPick/backups','/api/remote/access']) assert.equal(obsReadAllowed('GET',path),false,path);
for(const method of ['POST','PUT','DELETE']) assert.equal(obsReadAllowed(method,'/api/store/matches'),false);
assert.equal(tokenMatches('abc','abc'),true);assert.equal(tokenMatches('abc','abd'),false);assert.equal(tokenMatches('',''),false);assert.equal(tokenMatches('a','abc'),false);
console.log('test-obs-access: read-only boundaries and credentials passed');
