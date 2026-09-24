window.UCH.State = (function() {
  const STORAGE_KEY = 'uch_lan_state';
  const SCHEMA_VERSION = 2;

  // Points are keyed by lobby size. Each table pays 3 * (fraction of opponents beaten),
  // so every lobby size averages 1.5 pts per player and 3- and 4-player lobbies are equally fair.
  const DEFAULT_POINTS = { 3: [3, 1.5, 0], 4: [3, 2, 1, 0] };

  let state = getInitialState();
  load();

  function getInitialState() {
    return {
      version: SCHEMA_VERSION,
      players: [],
      dropped: [], // players who left mid-tournament: keep their points, skip future heats
      settings: {
        heats: 4,
        points: { 3: [...DEFAULT_POINTS[3]], 4: [...DEFAULT_POINTS[4]] },
        finalSize: 4,
        sitOutPoints: 1.5,
        seeding: 'skewed' // 'random' | 'skewed' | 'strict'
      },
      heats: [], // { id: int, pods: [[host, p2, ...]], sitOuts: [p3], results: { p1: 1, p2: 2 }, locked: bool }
      final: null, // { pod: [], results: {}, locked: bool }
      started: false
    };
  }

  // Upgrades older saves/exports in place. Returns null if the data can't be used.
  function migrate(parsed) {
    if (!parsed || typeof parsed !== 'object') return null;
    if (parsed.version === 1) {
      const s = parsed.settings || {};
      s.points = { 3: [...DEFAULT_POINTS[3]], 4: Array.isArray(s.pointsTable) ? s.pointsTable : [...DEFAULT_POINTS[4]] };
      delete s.pointsTable;
      s.seeding = s.seeding || 'random'; // v1 always shuffled randomly
      parsed.settings = s;
      parsed.dropped = parsed.dropped || [];
      parsed.version = 2;
    }
    if (parsed.version !== SCHEMA_VERSION) return null;
    if (!Array.isArray(parsed.players) || !Array.isArray(parsed.heats)) return null;
    if (!Array.isArray(parsed.dropped)) parsed.dropped = [];
    return parsed;
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
        const parsed = migrate(JSON.parse(data));
        if (parsed) state = parsed;
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
      const parsed = migrate(JSON.parse(fileText));
      if (!parsed) throw new Error("Unsupported schema version or invalid data shape");
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
    DEFAULT_POINTS,
    save, load, migrate, exportJSON, importJSON, reset
  };
})();
