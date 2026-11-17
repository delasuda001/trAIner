// Refuse de lancer Sillage si le port est déjà occupé, en IPv4 ou en IPv6.
// Sans ce contrôle, un ancien serveur peut rester sur « localhost » (::1) pendant
// que le nouveau répond sur 127.0.0.1 : deux versions différentes selon l'adresse.
import net from "node:net";

const portArg = process.argv.find((arg) => arg.startsWith("--port="));
const port = Number(portArg ? portArg.slice("--port=".length) : process.env.PORT || 3000);

function listening(host) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    const done = (value) => {
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(800, () => done(false));
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
  });
}

const busy = [];
for (const host of ["127.0.0.1", "::1"]) {
  if (await listening(host)) busy.push(host === "::1" ? `[::1]:${port} (localhost en IPv6)` : `${host}:${port}`);
}

if (busy.length) {
  console.error(`\nLe port ${port} est déjà utilisé : ${busy.join(", ")}.`);
  console.error("Un autre serveur Sillage tourne sans doute encore. Pour le trouver et l'arrêter :");
  console.error(`  lsof -nP -iTCP:${port} -sTCP:LISTEN`);
  console.error("  kill <PID>\n");
  process.exit(1);
}
