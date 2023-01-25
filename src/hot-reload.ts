import isProduction from "./is-production";

if (!isProduction) {
  const socket = new WebSocket("ws://localhost:8081");
  socket.addEventListener("connection", (event) => {
    console.log("connected ", event);
  });
  socket.addEventListener("message", async (event) => {
    if ((window as any).no_hot_reload) return;
    console.log("Message from server ", event);
    const { action, payload } = JSON.parse(event.data);
    if (action === "update-app") window.location.reload();
    if (action === "error") console.warn(payload);
  });
}
