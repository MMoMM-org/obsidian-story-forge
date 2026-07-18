// QuickAdd user script — bump the active note's `status` to the next stage.
// The canonical order is read at runtime from the schema
// (00 Meta/Schema/scene.json → the `status` field's `values`, in order), so
// this auto-adapts to schema changes. The hardcoded list is only a fallback.

async function sceneStatuses(app) {
  try {
    const raw = await app.vault.adapter.read("00 Meta/Schema/scene.json");
    const field = (JSON.parse(raw).fields || []).find((f) => f.name === "status");
    const vals = field && Array.isArray(field.values) ? field.values : [];
    if (vals.length) return vals;
  } catch (e) {
    // schema missing / unreadable — fall through to the fallback
  }
  // @schema-enum scene.status — schema:gen keeps this fallback in sync with the schema.
  const FALLBACK = ["idea", "outline", "draft", "revised", "done", "final"];
  return FALLBACK;
}

module.exports = async ({ app, obsidian }) => {
  const file = app.workspace.getActiveFile();
  if (!file) return new obsidian.Notice("No active note.");
  const STATUS = await sceneStatuses(app);
  await app.fileManager.processFrontMatter(file, (fm) => {
    const cur = fm.status;
    const i = STATUS.indexOf(cur);
    const next = i < 0 ? STATUS[0] : STATUS[Math.min(i + 1, STATUS.length - 1)];
    fm.status = next;
    new obsidian.Notice(`Status: ${cur ?? "—"} → ${next}`);
  });
};
