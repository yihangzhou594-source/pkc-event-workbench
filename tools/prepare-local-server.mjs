import path from "node:path";
import net from "node:net";

const port = Number(process.env.DISPLAY_PORT || process.env.PKC_PORT || 8971);
const root = path.resolve(process.env.PKC_ROOT || process.cwd()).toLowerCase();

async function probeStatus() {
  let ping;
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/ping`, {
      signal:AbortSignal.timeout(2500),
    });
    ping = await response.json();
  } catch {
    // The port may be unused or owned by a different service.
  }

  if (ping) {
    if (path.resolve(ping.root || "").toLowerCase() !== root || !Number.isInteger(ping.pid)) return "CONFLICT";
    try {
      process.kill(ping.pid);
    } catch {
      return "FAILED";
    }
  }

  for (let i = 0; i < 30; i++) {
    const free = await new Promise(resolve => {
      const server = net.createServer();
      server.once("error", () => resolve(false));
      server.listen(port, "0.0.0.0", () => server.close(() => resolve(true)));
    });
    if (free) return ping ? "STOPPED" : "NONE";
    if (!ping) return "CONFLICT";
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  return "FAILED";
}

// Allow piped stdout to flush naturally before cmd.exe reads the result.
console.log(await probeStatus());
