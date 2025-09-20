import express from "express";
import morgan from "morgan";
import path from "path";
import { fileURLToPath } from "url";
import { sseRoute, emit } from "./data/sse.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(morgan("dev"));
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

sseRoute(app);

app.post("/api/notify", (req, res) => {
  const { type, employeeId, ymd } = req.body || {};
  if (!type) return res.status(400).json({ ok: false, error: "type required" });
  emit(type, { employeeId, ymd, at: Date.now() });
  res.json({ ok: true });
});

// dev совместимость (локальные демо-данные в localStorage)
app.post("/api/dev/reseed", (_req, res) => res.json({ ok: true }));

app.use((_, res) => res.status(404).json({ ok: false, error: "Not found" }));
app.listen(PORT, () =>
  console.log(`Server running on http://localhost:${PORT}`)
);
