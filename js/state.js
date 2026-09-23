window.UCH.State = (function() {
  const STORAGE_KEY = 'uch_lan_state';
  const SCHEMA_VERSION = 1;

  let state = getInitialState();
  load();

  function getInitialState() {
    return {
      version: SCHEMA_VERSION,
      players: [],
      settings: { heats: 4, pointsTable: [3, 2, 1, 0], finalSize: 4, sitOutPoints: 1.5 },
      heats: [], // { id: int, pods: [[p1, p2]], sitOuts: [p3], results: { p1: 1, p2: 2 }, locked: bool }
      final: null, // { pod: [], results: {} }
      started: false
    };
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn("Could not save to localStorage", e);
    }
  }

  function load() {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (data) {
        const parsed = JSON.parse(data);
        if (parsed.version === SCHEMA_VERSION) {
          state = parsed;
        }
      }
    } catch (e) {
      console.warn("Could not load from localStorage", e);
    }
  }

  function exportJSON() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state, null, 2));
    const node = document.createElement('a');
    node.setAttribute("href", dataStr);
    node.setAttribute("download", `uch_tournament_${new Date().toISOString().split('T')[0]}.json`);
    document.body.appendChild(node);
    node.click();
    node.remove();
  }

  function importJSON(fileText) {
    try {
      const parsed = JSON.parse(fileText);
      if (parsed.version !== SCHEMA_VERSION) throw new Error("Unsupported schema version");
      if (!Array.isArray(parsed.players) || !Array.isArray(parsed.heats)) throw new Error("Invalid data shape");
      state = parsed;
      save();
      return true;
    } catch (e) {
      alert("Import failed: " + e.message);
      return false;
    }
  }

  function reset() {
    if (confirm("Are you sure? This deletes all tournament data.")) {
      state = getInitialState();
      save();
      return true;
    }
    return false;
  }

  return {
    get: () => state,
    save, load, exportJSON, importJSON, reset
  };
})();