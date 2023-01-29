// @ts-check
import WebSocket, { WebSocketServer } from "ws";
import chokidar from "chokidar";

const watchOptn = {
  // awaitWriteFinish: {stabilityThreshold:100, pollInterval:50},
  ignoreInitial: true,
};
async function hotReload() {
  const wss = new WebSocketServer({ port: 8081 });
  wss.on("connection", () => console.log(wss.clients.size));
  wss.on("close", () => console.log(wss.clients.size));
  const sendToClients = (
    /** @type {{ action: string; payload?: any }} */ message
  ) => {
    wss.clients.forEach(function each(
      /** @type {{ readyState: number; send: (arg0: string) => void; }} */ client
    ) {
      if (client.readyState === WebSocket.OPEN) {
        console.log("sending");
        client.send(JSON.stringify(message));
      }
    });
  };
  chokidar.watch("src", watchOptn).on("all", async (...args) => {
    console.log(args);
    try {
      sendToClients({ action: "update-app" });
    } catch (e) {
      console.error(e);
      sendToClients({ action: "error", payload: e.message });
    }
  });
}

hotReload();
