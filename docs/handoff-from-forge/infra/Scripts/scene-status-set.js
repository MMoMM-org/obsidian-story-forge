// QuickAdd user script — set the active note's `status` via a suggester.
// The allowed values are read at runtime from the canonical schema
// (00 Meta/Schema/scene.json → the `status` field's `values`), so this
// auto-adapts to schema changes. The hardcoded list is only a fallback.

async function sceneStatuses(app) {
  try {
    const raw = await app.vault.adapter.read("00 Meta/Schema/scene.json");
    const field = (JSON.parse(raw).fields || []).find((f) => f.name === "status");
    const vals = field && Array.isArray(field.values) ? field.values : [];
    if (vals.length) return vals;
  } catch (e) {
    // schema missing / unreadable — fall through to the fallback
  }
  return ["idea", "outline", "draft", "revised", "done", "final"];
}

module.exports = async ({ app, quickAddApi, obsidian }) => {
  const file = app.workspace.getActiveFile();
  if (!file) return new obsidian.Notice("No active note.");
  const STATUS = await sceneStatuses(app);
  const pick = await quickAddApi.suggester(STATUS, STATUS);
  if (!pick) return;
  await app.fileManager.processFrontMatter(file, (fm) => { fm.status = pick; });
  new obsidian.Notice(`Status = ${pick}`);
};
