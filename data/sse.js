const clients = new Set();

export function sseRoute(app) {
  app.get("/api/events", (req, res) => {
    res.set({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive"
    });
    res.write("retry: 5000\n\n");
    const client = { res };
    clients.add(client);
    req.on("close", () => clients.delete(client));
  });

  setInterval(() => {
    for (const c of clients) {
      try { c.res.write(": ping\n\n"); } catch {}
    }
  }, 25000);
}

export function emit(type, payload) {
  const msg = `event: ${type}\ndata: ${JSON.stringify(payload || {})}\n\n`;
  for (const c of clients) {
    try { c.res.write(msg); } catch {}
  }
}
