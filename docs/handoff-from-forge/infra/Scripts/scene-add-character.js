// QuickAdd user script — add a canon character (tag #canon/character) to the
// active scene's `characters` frontmatter list, via a suggester.
module.exports = async ({ app, quickAddApi, obsidian }) => {
  const file = app.workspace.getActiveFile();
  if (!file) return new obsidian.Notice("No active note.");
  const chars = app.vault.getMarkdownFiles()
    .filter((f) => {
      const c = app.metadataCache.getFileCache(f);
      return c && (obsidian.getAllTags(c) || []).includes("#canon/character");
    })
    .map((f) => f.basename)
    .sort();
  if (!chars.length) return new obsidian.Notice("No canon characters found.");
  const pick = await quickAddApi.suggester(chars, chars);
  if (!pick) return;
  await app.fileManager.processFrontMatter(file, (fm) => {
    let arr = fm.characters;
    arr = Array.isArray(arr) ? arr : arr ? [arr] : [];
    if (!arr.some((x) => String(x).includes(pick))) arr.push(`[[${pick}]]`);
    fm.characters = arr;
  });
  new obsidian.Notice(`+ ${pick} → characters`);
};
