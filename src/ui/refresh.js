// ============================================================
// UI REFRESH HANDLE
// Systems import this and call refresh.ui() to trigger a full
// DOM rebuild without creating a circular import with ui.js.
// main.js populates the function references at boot time.
// ============================================================
export const refresh = {
  ui:        null, // set to renderUI()
  header:    null, // set to updateHeader()
  basePanel: null, // set to renderBasePanel()
};
