// Shared Dataview view: renders manuscript scenes as a table / list / timeline.
//
// If the Longform plugin is present, the view follows the ACTIVE draft (reads
// Longform's selectedDraftVaultPath, so it tracks whichever draft is selected —
// no hardcoded book/draft). If Longform is absent or has no active draft, it
// gracefully falls back to ALL `#manuscript/scene` notes — the view is not a
// hard Longform dependency.
//
// Usage from a note (dataviewjs):
//   await dv.view("00 Meta/dataview-views/active-scenes", { mode: "all" })
//   await dv.view("00 Meta/dataview-views/active-scenes", { mode: "all", view: "notes" })
//   await dv.view("00 Meta/dataview-views/active-scenes", { mode: "all", view: "status" })
//   await dv.view("00 Meta/dataview-views/active-scenes", { mode: "all", view: "timeline" })
//   await dv.view("00 Meta/dataview-views/active-scenes", { mode: "beat", value: dv.current().title })
//
// input: { mode?: "all"|"beat", value?: string (beat-note title), view?: "table"|"notes"|"status"|"timeline" }

const inp = input ?? {};

// Optional Longform coupling: resolve the active draft's scene folder, or null.
let folder = null;
try {
  const raw = await app.vault.adapter.read(app.vault.configDir + "/plugins/longform/data.json");
  const idxPath = JSON.parse(raw).selectedDraftVaultPath;
  const idxFm = app.metadataCache.getFileCache(app.vault.getAbstractFileByPath(idxPath))?.frontmatter?.longform ?? {};
  folder = idxPath.slice(0, idxPath.lastIndexOf("/")) + "/" + (idxFm.sceneFolder ?? "");
} catch (e) {
  // No Longform / no active draft — fall back to all manuscript scenes.
  folder = null;
}

const beatVal = String(inp.value ?? "");
const pages = dv.pages("#manuscript/scene")
  .where(p => folder === null || p.file.folder === folder)
  .where(p => inp.mode !== "beat" || (p.beat && beatVal.includes(String(p.beat))))
  .sort(p => p.order, "asc");

if (inp.view === "notes") {
  dv.list(pages.where(p => p.notes && String(p.notes).trim() !== "").map(p => `${p.file.link}: ${p.notes}`));
} else if (inp.view === "status") {
  dv.table(["#", "Chapter", "Status"], pages.map(p => [p.order, p.file.link, p.status]));
} else if (inp.view === "timeline") {
  // A single timeline: flashbacks (empty storyDay) BEFORE the present, then by storyDay.
  //   Present:   storyDay = <n> -> sorted by n (series-wide, continuous).
  //   Flashback: storyDay empty -> grouped before the present, sorted by `order`.
  const isFlash = p => p.storyDay === null || p.storyDay === undefined || p.storyDay === "";
  const rank = p => isFlash(p)
    ? { g: 0, k: p.order ?? 0, o: p.order ?? 0 }
    : { g: 1, k: Number(p.storyDay), o: p.order ?? 0 };
  const rows = pages.array().sort((a, b) => { const A = rank(a), B = rank(b); return (A.g - B.g) || (A.k - B.k) || (A.o - B.o); });
  const when = p => String(p.when ?? "").trim() || (isFlash(p) ? "Flashback" : "");
  dv.table(["When", "#", "Scene", "POV", "Location"], rows.map(p => [when(p), p.order, p.file.link, p.pov, p.location]));
} else if (inp.mode === "beat") {
  dv.table(["#", "Scene", "Who", "Where", "POV", "When"], pages.map(p => [p.order, p.file.link, p.characters, p.location, p.pov, p.when]));
} else {
  dv.table(["#", "Scene", "Beat", "Who", "Where", "POV", "When"], pages.map(p => [p.order, p.file.link, p.beat, p.characters, p.location, p.pov, p.when]));
}
