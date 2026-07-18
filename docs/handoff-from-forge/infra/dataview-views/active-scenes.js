// Shared Dataview view: renders scenes of the ACTIVE Longform draft.
// Reads Longform's selectedDraftVaultPath so the table always follows whichever
// draft is selected in the Longform pane (no hardcoded V1/V2).
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

let folder = null;
try {
  const raw = await app.vault.adapter.read(app.vault.configDir + "/plugins/longform/data.json");
  const idxPath = JSON.parse(raw).selectedDraftVaultPath;
  const idxFm = app.metadataCache.getFileCache(app.vault.getAbstractFileByPath(idxPath))?.frontmatter?.longform ?? {};
  folder = idxPath.slice(0, idxPath.lastIndexOf("/")) + "/" + (idxFm.sceneFolder ?? "");
} catch (e) {
  dv.paragraph("⚠️ Kein aktiver Longform-Draft gefunden (" + e.message + ").");
  return;
}

const beatVal = String(inp.value ?? "");
const pages = dv.pages("#manuscript/scene")
  .where(p => p.file.folder === folder)
  .where(p => inp.mode !== "beat" || (p.beat && beatVal.includes(String(p.beat))))
  .sort(p => p.order, "asc");

if (inp.view === "notes") {
  dv.list(pages.where(p => p.notes && String(p.notes).trim() !== "").map(p => `${p.file.link}: ${p.notes}`));
} else if (inp.view === "status") {
  dv.table(["#", "Kapitel", "Status"], pages.map(p => [p.order, p.file.link, p.status]));
} else if (inp.view === "timeline") {
  // Eine Zeitachse: Rückblenden (leeres storyDay) VOR der Gegenwart, dann nach storyDay.
  //   Gegenwart: storyDay = <n> -> sortiert nach n (serienweit fortlaufend).
  //   Rückblende: storyDay leer -> Gruppe vor der Gegenwart, sortiert nach `order`.
  const isFlash = p => p.storyDay === null || p.storyDay === undefined || p.storyDay === "";
  const rank = p => isFlash(p)
    ? { g: 0, k: p.order ?? 0, o: p.order ?? 0 }
    : { g: 1, k: Number(p.storyDay), o: p.order ?? 0 };
  const rows = pages.array().sort((a, b) => { const A = rank(a), B = rank(b); return (A.g - B.g) || (A.k - B.k) || (A.o - B.o); });
  const when = p => String(p.when ?? "").trim() || (isFlash(p) ? "Rückblende" : "");
  dv.table(["Zeit", "#", "Szene", "POV", "Ort"], rows.map(p => [when(p), p.order, p.file.link, p.pov, p.location]));
} else if (inp.mode === "beat") {
  dv.table(["#", "Szene", "Wer", "Wo", "POV", "Zeit"], pages.map(p => [p.order, p.file.link, p.characters, p.location, p.pov, p.when]));
} else {
  dv.table(["#", "Szene", "Beat", "Wer", "Wo", "POV", "Zeit"], pages.map(p => [p.order, p.file.link, p.beat, p.characters, p.location, p.pov, p.when]));
}
