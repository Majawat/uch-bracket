window.UCH.UI = (function() {
  let state;
  let currentHeatIndex = 0;

  // --- Helpers ---
  const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = s => String(s).replace(/[&<>"']/g, c => HTML_ESCAPES[c]);
  const ordinal = n => n + (n == 1 ? 'st' : n == 2 ? 'nd' : n == 3 ? 'rd' : 'th');
  const isBigScreen = () => document.body.classList.contains('big-screen');
  const activePlayers = () => state.players.filter(p => !state.dropped.includes(p));

  function getStandings() {
    return UCH.Scoring.calculateStandings(state.players, state.heats, state.settings.points, state.settings.sitOutPoints);
  }

  function allHeatsDone() {
    const maxHeats = state.settings.heats;
    return state.heats.length === maxHeats && state.heats.every(h => h.locked);
  }

  // Returns a message per lobby that has duplicate placements, and an error if a lobby is incomplete.
  function checkPlacements(pods, results) {
    let error = '';
    const duplicates = [];
    pods.forEach((pod, pIdx) => {
      const label = pods.length > 1 ? `Lobby ${pIdx + 1}` : 'The lobby';
      if (pod.some(p => !results[p])) { error = error || 'All players must have a placement.'; return; }
      if (!pod.some(p => results[p] === 1)) { error = error || `${label} needs a 1st place.`; return; }
      const placements = pod.map(p => results[p]);
      if (new Set(placements).size !== placements.length) duplicates.push(label);
    });
    return { error, duplicates };
  }

  function init() {
    state = UCH.State.get();
    updateNav();

    if (isBigScreen()) {
      renderBigScreen();
      return;
    }

    if (state.started) {
      // Recover if the page was closed after a heat was saved but before the next one was generated
      const last = state.heats[state.heats.length - 1];
      if (last && last.locked && state.heats.length < state.settings.heats) generateNextHeat();
      currentHeatIndex = state.heats.length - 1;
      showScreen('heats');
    } else {
      showScreen('setup');
    }
  }

  // Called when another tab changes the saved state. Re-renders in place without switching screens.
  function refresh() {
    state = UCH.State.get();
    updateNav();
    if (isBigScreen()) {
      renderBigScreen();
      return;
    }
    const active = document.querySelector('.screen.active')?.id.replace('screen-', '') || 'setup';
    if (!state.started) {
      showScreen('setup');
      return;
    }
    currentHeatIndex = Math.min(currentHeatIndex, state.heats.length - 1);
    showScreen(active);
  }

  function renderBigScreen() {
    if (!state.started) {
      document.getElementById('standings-body').innerHTML = '';
      document.getElementById('heat-title').innerText = 'UCH LAN';
      document.getElementById('heat-pods').innerHTML = '<div class="card">Waiting for the tournament to start…</div>';
      document.getElementById('heat-sitouts').innerHTML = '';
      document.body.classList.remove('show-final');
      return;
    }
    renderStandings();
    renderHeat(state.heats.length - 1);
    if (allHeatsDone()) {
      renderFinal();
      document.body.classList.add('show-final');
    } else {
      document.body.classList.remove('show-final');
    }
  }

  function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(`screen-${screenId}`).classList.add('active');

    if (screenId === 'setup') renderSetup();
    if (screenId === 'heats') renderHeat(currentHeatIndex);
    if (screenId === 'standings') renderStandings();
    if (screenId === 'final') renderFinal();
  }

  function toggleBigScreen() {
    if (!isBigScreen()) {
      window.open(window.location.pathname + '?mode=big', '_blank');
    } else {
      window.close(); // Attempt to close the pop-up window
      document.body.classList.remove('big-screen'); // Fallback if close is blocked
      showScreen('standings');
    }
  }

  function updateNav() {
    document.getElementById('nav-heats').disabled = !state.started;
    document.getElementById('nav-standings').disabled = !state.started;
    document.getElementById('nav-final').disabled = !allHeatsDone();
  }

  // --- Setup ---
  function addPlayer() {
    const input = document.getElementById('new-player');
    const val = input.value.trim();
    if (!val) return;

    // Handle paste lists
    const names = val.split(/[\n,\t]+/).map(n => n.trim()).filter(n => n);
    const added = [];

    names.forEach(name => {
      if (!state.players.find(p => p.toLowerCase() === name.toLowerCase())) {
        state.players.push(name);
        added.push(name);
      }
    });

    if (added.length) {
      input.value = '';
      let msg = '';
      if (state.started) {
        msg = regenerateOpenHeatIfUntouched()
          ? `${added.join(', ')} added to the current heat (lobbies were rerolled).`
          : `${added.join(', ')} will join from the next heat. Heats they missed score 0.`;
      }
      UCH.State.save();
      renderSetup();
      document.getElementById('setup-error').innerText = msg;
    }
  }

  function removePlayer(index) {
    if (state.started) return; // After the start, players are dropped instead so their results stay valid
    state.players.splice(index, 1);
    UCH.State.save();
    renderSetup();
  }

  function toggleDropped(index) {
    if (!state.started) return;
    const name = state.players[index];
    let msg = '';

    if (state.dropped.includes(name)) {
      state.dropped = state.dropped.filter(p => p !== name);
      msg = regenerateOpenHeatIfUntouched()
        ? `${name} rejoined and was added to the current heat (lobbies were rerolled).`
        : `${name} will rejoin from the next heat.`;
    } else {
      if (activePlayers().length <= 3) {
        document.getElementById('setup-error').innerText = 'At least 3 active players are needed to keep playing.';
        return;
      }
      state.dropped.push(name);
      const openHeat = state.heats[state.heats.length - 1];
      const inOpenHeat = openHeat && !openHeat.locked &&
        (openHeat.pods.some(pod => pod.includes(name)) || openHeat.sitOuts.includes(name));
      if (regenerateOpenHeatIfUntouched()) {
        msg = `${name} dropped. The current heat's lobbies were rerolled without them.`;
      } else if (inOpenHeat) {
        msg = `${name} dropped, but they're in the current heat which already has results. ` +
              `Enter a placement for them (e.g. last) or use Reroll Lobbies.`;
      } else {
        msg = `${name} dropped. They keep their points but won't be in future heats or the final.`;
      }
    }

    UCH.State.save();
    renderSetup();
    document.getElementById('setup-error').innerText = msg;
  }

  // If the newest heat hasn't been played yet (unlocked, no results), rebuild it with the current roster.
  function regenerateOpenHeatIfUntouched() {
    const heat = state.heats[state.heats.length - 1];
    if (!heat || heat.locked || Object.keys(heat.results).length > 0) return false;
    if (activePlayers().length < 3) return false;
    state.heats.pop();
    return generateNextHeat();
  }

  function renderSetup() {
    const locked = state.started;
    document.getElementById('player-list').innerHTML = state.players.map((p, i) => {
      const dropped = state.dropped.includes(p);
      const btn = !locked
        ? `<button onclick="UCH.UI.removePlayer(${i})">X</button>`
        : `<button onclick="UCH.UI.toggleDropped(${i})">${dropped ? 'Rejoin' : 'Drop'}</button>`;
      return `<li class="${dropped ? 'dropped' : ''}"><span>${esc(p)}${dropped ? ' (dropped)' : ''}</span> ${btn}</li>`;
    }).join('');

    document.getElementById('setting-heats').value = state.settings.heats;
    document.getElementById('setting-final').value = state.settings.finalSize;
    document.getElementById('setting-points-4').value = state.settings.points[4].join(',');
    document.getElementById('setting-points-3').value = state.settings.points[3].join(',');
    document.getElementById('setting-seeding').value = state.settings.seeding;

    ['setting-heats', 'setting-final', 'setting-points-4', 'setting-points-3', 'setting-seeding', 'start-btn']
      .forEach(id => { document.getElementById(id).disabled = locked; });
    document.getElementById('setup-locked').style.display = locked ? 'block' : 'none';
  }

  function parsePoints(inputId, lobbySize) {
    const raw = document.getElementById(inputId).value.split(',').map(s => s.trim()).filter(s => s !== '');
    const nums = raw.map(Number);
    if (nums.length !== lobbySize || nums.some(n => !Number.isFinite(n))) return null;
    return nums;
  }

  function startTournament() {
    if (state.started) return;
    const errEl = document.getElementById('settings-error');
    errEl.innerText = '';

    if (state.players.length < 3) {
      errEl.innerText = "Minimum 3 players required.";
      return;
    }
    const heats = parseInt(document.getElementById('setting-heats').value);
    const finalSize = parseInt(document.getElementById('setting-final').value);
    const p4 = parsePoints('setting-points-4', 4);
    const p3 = parsePoints('setting-points-3', 3);
    if (!(heats >= 1)) { errEl.innerText = "Total Heats must be at least 1."; return; }
    if (!(finalSize >= 2)) { errEl.innerText = "Final size must be at least 2."; return; }
    if (!p4) { errEl.innerText = "4-player lobby points need exactly 4 numbers, e.g. 3,2,1,0"; return; }
    if (!p3) { errEl.innerText = "3-player lobby points need exactly 3 numbers, e.g. 3,1.5,0"; return; }

    state.settings.heats = heats;
    state.settings.finalSize = finalSize;
    state.settings.points = { 3: p3, 4: p4 };
    // Sit-outs only happen with 5 players (one 4-player lobby), so they get that lobby's average
    state.settings.sitOutPoints = p4.reduce((a, b) => a + b, 0) / p4.length;
    state.settings.seeding = document.getElementById('setting-seeding').value;

    state.started = true;
    generateNextHeat();
    updateNav();
    showScreen('heats');
  }

  // --- Heats ---
  function generateNextHeat() {
    const heatId = state.heats.length + 1;
    if (heatId > state.settings.heats) return false;

    const players = activePlayers();
    if (players.length < 3) {
      document.getElementById('heat-error').innerText = 'At least 3 active players are needed for a heat.';
      return false;
    }

    const standings = getStandings();
    const { pods, sitOuts } = UCH.Pods.generatePods(players, standings, state.heats, heatId === 1, state.settings.seeding);

    state.heats.push({ id: heatId, pods, sitOuts, results: {}, locked: false });
    currentHeatIndex = state.heats.length - 1;
    UCH.State.save();
    renderHeat(currentHeatIndex);
    return true;
  }

  function rerollCurrentHeat() {
    const heat = state.heats[currentHeatIndex];
    if (!heat || heat.locked || currentHeatIndex !== state.heats.length - 1) return;

    if (Object.keys(heat.results).length > 0) {
      if (!confirm("You have entered results. Rerolling will clear them. Proceed?")) return;
    }

    state.heats.pop(); // Remove current
    if (!generateNextHeat()) {
      state.heats.push(heat); // Couldn't build a new heat; keep the old one
      renderHeat(currentHeatIndex);
    }
  }

  // A locked heat can be reopened if nothing after it has been locked (later heat or final).
  function canUnlock(index) {
    const heat = state.heats[index];
    if (!heat || !heat.locked) return false;
    const next = state.heats[index + 1];
    if (next && next.locked) return false;
    if (state.final && state.final.locked) return false;
    return true;
  }

  function unlockHeat() {
    if (!canUnlock(currentHeatIndex)) return;
    if (state.final) {
      if (!confirm("Editing a heat can change who makes the final. The final lineup will be recalculated " +
                   "and any final placements entered so far will be cleared. Continue?")) return;
      state.final = null;
    }
    state.heats[currentHeatIndex].locked = false;
    UCH.State.save();
    updateNav();
    renderHeat(currentHeatIndex);
  }

  function renderHeat(index) {
    const heat = state.heats[index];
    if (!heat) return;
    currentHeatIndex = index;
    document.getElementById('heat-title').innerText = `Heat ${heat.id} of ${state.settings.heats}`;
    document.getElementById('btn-prev-heat').disabled = index === 0;

    // Check if we are viewing history to show a 'return to current' option
    const isHistory = index < state.heats.length - 1;
    document.getElementById('btn-next-heat').style.display = isHistory ? 'inline-block' : 'none';
    document.getElementById('btn-reroll').style.display = (heat.locked || isHistory) ? 'none' : 'inline-block';
    document.getElementById('btn-unlock-heat').style.display = canUnlock(index) ? 'inline-block' : 'none';

    let html = '';
    heat.pods.forEach((pod, pIdx) => {
      html += `<div class="pod-card"><h3>Lobby ${pIdx + 1}</h3>`;
      pod.forEach((player, pNum) => {
        const val = heat.results[player] || '';
        const disabled = heat.locked ? 'disabled' : '';
        let options = `<option value="">--</option>`;
        for (let i = 1; i <= pod.length; i++) options += `<option value="${i}" ${val == i ? 'selected' : ''}>${ordinal(i)}</option>`;

        const displayVal = val ? ordinal(val) : '-';
        const hostBadge = pNum === 0 ? '<span class="host-badge">HOST</span>' : '';

        html += `<div class="pod-row">
          <span class="player-name"><span class="name-text">${esc(player)}</span> ${hostBadge}</span>
          <select class="admin-only" data-player="${esc(player)}" onchange="UCH.UI.liveUpdateHeat(this.dataset.player, this.value)" ${disabled}>${options}</select>
          <span class="big-screen-only">${displayVal}</span>
        </div>`;
      });
      html += `</div>`;
    });
    const podsEl = document.getElementById('heat-pods');
    podsEl.innerHTML = html;
    // Big screen sizing hints (see .pods-container in style.css)
    const cols = heat.pods.length === 1 ? 1 : 2;
    podsEl.style.setProperty('--pod-cols', cols);
    podsEl.style.setProperty('--pod-rows', Math.ceil(heat.pods.length / cols));
    podsEl.classList.toggle('single', cols === 1);

    document.getElementById('heat-sitouts').innerHTML = heat.sitOuts.length ?
      `<div class="card warning">Sitting out this heat: <strong>${heat.sitOuts.map(esc).join(', ')}</strong> (Auto-awarded ${state.settings.sitOutPoints} pts)</div>` : '';

    document.getElementById('btn-save-heat').style.display = heat.locked ? 'none' : 'block';
    document.getElementById('heat-error').innerText = '';
  }

  function prevHeat() { if (currentHeatIndex > 0) renderHeat(currentHeatIndex - 1); }
  function nextHeat() { if (currentHeatIndex < state.heats.length - 1) renderHeat(currentHeatIndex + 1); }

  function saveHeat() {
    const heat = state.heats[currentHeatIndex];
    if (!heat || heat.locked) return;

    // heat.results is kept current by liveUpdateHeat; only keep entries for players in this heat's lobbies
    const newResults = {};
    heat.pods.forEach(pod => pod.forEach(p => { if (heat.results[p]) newResults[p] = heat.results[p]; }));

    const { error, duplicates } = checkPlacements(heat.pods, newResults);
    if (error) {
      document.getElementById('heat-error').innerText = error;
      return;
    }
    if (duplicates.length &&
        !confirm(`${duplicates.join(', ')} has players sharing a placement (e.g. a points tie). Save anyway?`)) return;

    heat.results = newResults;
    heat.locked = true;
    UCH.State.save();
    updateNav();

    // Auto advance
    if (currentHeatIndex + 1 < state.heats.length) {
      renderHeat(currentHeatIndex + 1);
    } else if (state.heats.length < state.settings.heats) {
      generateNextHeat();
    } else {
      showScreen('standings');
    }
  }

  // --- Standings ---
  function renderStandings() {
    const st = getStandings();
    document.body.style.setProperty('--player-count', Math.max(st.length, 10));
    document.getElementById('standings-body').innerHTML = st.map(s => {
      const dropped = state.dropped.includes(s.name);
      return `<tr class="${dropped ? 'dropped' : ''}">
        <td>${s.rank}</td>
        <td><strong>${esc(s.name)}</strong>${dropped ? ' (left)' : ''}</td>
        <td>${s.total}</td>
        <td>${s.wins}</td>
        <td class="hide-on-big">${s.history.map(h => h === null ? '×' : h).join(', ')}</td>
      </tr>`;
    }).join('');
  }

  // --- Final ---
  function getFinalCandidates() {
    const st = getStandings().filter(s => !state.dropped.includes(s.name));
    return UCH.Scoring.getFinalSeedCandidates(st, state.settings.finalSize);
  }

  function renderFinal() {
    const tieResolver = document.getElementById('final-tie-resolver');
    const container = document.getElementById('final-pod-container');
    const banner = document.getElementById('champion-banner');
    banner.style.display = 'none';

    if (!allHeatsDone()) {
      tieResolver.style.display = 'none';
      container.style.display = 'block';
      container.innerHTML = '<div class="card">Finish all heats to set up the Grand Final.</div>';
      return;
    }

    let final = state.final;
    if (!final) {
      const candidates = getFinalCandidates();
      if (candidates.tied.length > 0) {
        // Need manual tie resolution (admin only; the big screen just shows who's tied)
        if (isBigScreen()) {
          tieResolver.style.display = 'none';
          container.style.display = 'block';
          container.innerHTML = `<div class="card warning">Tie at the cutoff! Deciding the last finalist spot between: ` +
            `<strong>${candidates.tied.map(esc).join(', ')}</strong></div>`;
          return;
        }
        tieResolver.style.display = 'block';
        container.style.display = 'none';
        document.getElementById('tie-candidates').innerHTML = candidates.tied.map(p =>
          `<label style="display:block; margin:10px 0;"><input type="checkbox" class="tie-check" value="${esc(p)}"> ${esc(p)}</label>`
        ).join('');
        return;
      }

      final = { pod: candidates.definite, results: {}, locked: false };
      if (!isBigScreen()) { // The big screen only displays; the admin tab owns all writes
        state.final = final;
        UCH.State.save();
      }
    }

    tieResolver.style.display = 'none';
    container.style.display = 'block';

    const pod = final.pod;
    let html = `<div class="pod-card"><h3>Grand Final</h3>`;
    pod.forEach((player, pNum) => {
      const val = final.results[player] || '';
      const disabled = final.locked ? 'disabled' : '';
      let options = `<option value="">--</option>`;
      for (let i = 1; i <= pod.length; i++) options += `<option value="${i}" ${val == i ? 'selected' : ''}>${ordinal(i)}</option>`;

      const displayVal = val ? ordinal(val) : '-';
      const hostBadge = pNum === 0 ? '<span class="host-badge">HOST</span>' : '';

      html += `<div class="pod-row">
        <span class="player-name"><span class="name-text">${esc(player)}</span> ${hostBadge}</span>
        <select class="admin-only" data-player="${esc(player)}" onchange="UCH.UI.liveUpdateFinal(this.dataset.player, this.value)" ${disabled}>${options}</select>
        <span class="big-screen-only">${displayVal}</span>
      </div>`;
    });
    html += `</div>`;

    if (!final.locked) {
      html += `<p id="final-error" class="error"></p>`;
      html += `<button class="primary large" onclick="UCH.UI.saveFinal()">Crown Champion</button>`;
    } else {
      html += `<button onclick="UCH.UI.unlockFinal()">Edit Final Results</button>`;
      const champions = pod.filter(p => final.results[p] === 1);
      banner.innerHTML = `🏆 ${champions.map(esc).join(' &amp; ')} 🏆<div class="champion-sub">${champions.length > 1 ? 'Co-Champions' : 'Champion'}</div>`;
      banner.style.display = 'block';
    }
    container.innerHTML = html;
  }

  function resolveFinalTie() {
    const candidates = getFinalCandidates();

    const checked = Array.from(document.querySelectorAll('.tie-check:checked')).map(cb => cb.value)
      .filter(p => candidates.tied.includes(p));
    if (checked.length !== candidates.slotsRemaining) {
      alert(`Please select exactly ${candidates.slotsRemaining} player(s).`);
      return;
    }

    state.final = { pod: [...candidates.definite, ...checked], results: {}, locked: false };
    UCH.State.save();
    renderFinal();
  }

  function saveFinal() {
    const final = state.final;
    if (!final || final.locked) return;

    const newResults = {};
    final.pod.forEach(p => { if (final.results[p]) newResults[p] = final.results[p]; });

    const { error, duplicates } = checkPlacements([final.pod], newResults);
    if (error) {
      document.getElementById('final-error').innerText = error;
      return;
    }
    if (duplicates.length && !confirm("Some finalists share a placement. Save anyway?")) return;

    final.results = newResults;
    final.locked = true;
    UCH.State.save();
    renderFinal();
  }

  function unlockFinal() {
    if (!state.final || !state.final.locked) return;
    if (!confirm("Reopen the Grand Final results for editing?")) return;
    state.final.locked = false;
    UCH.State.save();
    renderFinal();
  }

  // --- Data ---
  function exportData() { UCH.State.exportJSON(); }
  function importData(e) {
    const file = e.target.files[0];
    e.target.value = ''; // Allow re-importing the same file
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(evt) {
      if (UCH.State.importJSON(evt.target.result)) window.location.reload();
    };
    reader.readAsText(file);
  }
  function resetTournament() {
    if (UCH.State.reset()) window.location.reload();
  }

  function liveUpdateHeat(player, value) {
    const heat = state.heats[currentHeatIndex];
    if (!heat || heat.locked) return;
    if (value) {
      heat.results[player] = parseInt(value);
    } else {
      delete heat.results[player];
    }
    UCH.State.save();
  }

  function liveUpdateFinal(player, value) {
    if (!state.final || state.final.locked) return;
    if (value) {
      state.final.results[player] = parseInt(value);
    } else {
      delete state.final.results[player];
    }
    UCH.State.save();
  }

  return {
    init, refresh, showScreen, toggleBigScreen, addPlayer, removePlayer, toggleDropped, startTournament,
    prevHeat, nextHeat, rerollCurrentHeat, unlockHeat, saveHeat, liveUpdateHeat,
    resolveFinalTie, saveFinal, unlockFinal, liveUpdateFinal, exportData, importData, resetTournament
  };
})();
