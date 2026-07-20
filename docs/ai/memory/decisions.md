# Decisions Memory

<!-- 2026-07-20 -->
- Views UI should follow the markdown-mason "scripts tab" pattern: one single **Views** place holding enable / edit / remove / view-source actions, plus an "assign a command" option (mason splits command-assignment onto a separate tab — Story Forge keeps it in the one Views place). Under each view's name, show the view's **description** (what it does), NOT the source path (`_forge…`); fall back to the source only when the note lacks a `description` property. (User feedback, 2026-07-18; largely realized in spec 003 settings-view-rows — keep this intent for M4 catalog work.)
