import path from 'node:path';
import net from 'node:net';
const port = Number(process.env.DISPLAY_PORT || process.env.PKC_PORT || 8971);
const root = path.resolve(process.env.PKC_ROOT || process.cwd()).toLowerCase();
let ping;
try { const r = await fetch(`http://127.0.0.1:${port}/api/ping`, {signal:AbortSignal.timeout(2500)}); ping = await r.json(); } catch {}
if (ping) {
  if (path.resolve(ping.root || '').toLowerCase() !== root || !Number.isInteger(ping.pid)) { console.log('CONFLICT'); process.exit(0); }
  try { process.kill(ping.pid); } catch { console.log('FAILED'); process.exit(0); }
}
for (let i=0;i<30;i++) {
  const free = await new Promise(resolve => { const server=net.createServer(); server.once('error',()=>resolve(false)); server.listen(port,'0.0.0.0',()=>server.close(()=>resolve(true))); });
  if (free) { console.log(ping ? 'STOPPED' : 'NONE'); process.exit(0); }
  if (!ping) { console.log('CONFLICT'); process.exit(0); }
  await new Promise(r=>setTimeout(r,100));
}
console.log('FAILED');
