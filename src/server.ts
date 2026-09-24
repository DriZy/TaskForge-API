import http from "node:http";

const PORT = Number(process.env.PORT ?? 3000);

const server = http.createServer((_req, res) => {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ success: true, data: { status: "ok" } }));
});

server.listen(PORT, () => {
  console.log(`[stub] TaskForge API listening on http://0.0.0.0:${PORT}`);
});
