window.UCH.UI = (function() {
  let state;
  let currentHeatIndex = 0;
  
  function init() {
    state = UCH.State.get();
    updateNav();
    
    if (document.body.classList.contains('big-screen')) {
      if (state.started) {
        renderStandings();
        renderHeat(state.heats.length - 1);
        if (state.heats.length === state.settings.heats && state.heats[state.heats.length-1].locked) {
          renderFinal();
          document.body.classList.add('show-final');
        } else {
          document.body.classList.remove('show-final');
        }
      }
      return;
    }

    if (state.started) {
      showScreen('heats');
      renderHeat(state.heats.length - 1);
    } else {
      showScreen('setup');
      renderSetup();
    }
  }

  function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(`screen-${screenId}`).classList.add('active');
    
    if (screenId === 'standings') renderStandings();
    if (screenId === 'final') renderFinal();
  }

  function toggleBigScreen() {
    if (!document.body.classList.contains('big-screen')) {
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
    
    const maxHeats = state.settings.heats;
    const allDone = state.heats.length === maxHeats && state.heats[maxHeats-1]?.locked;
    document.getElementById('nav-final').disabled = !allDone;
  }

  // --- Setup ---
  function addPlayer() {
    const input = document.getElementById('new-player');
    const val = input.value.trim();
    if (!val) return;
    
    // Handle paste lists
    const names = val.split(/[\n,\t]+/).map(n => n.trim()).filter(n => n);
    let added = false;
    
    names.forEach(name => {
      if (name && !state.players.find(p => p.toLowerCase() === name.toLowerCase())) {
        state.players.push(name);
        added = true;
      }
    });

    if (added) {
      input.value = '';
      document.getElementById('setup-error').innerText = '';
      UCH.State.save();
      renderSetup();
    }
  }

  function removePlayer(name) {
    state.players = state.players.filter(p => p !== name);
    UCH.State.save();
    renderSetup();
  }

  function renderSetup() {
    const list = document.getElementById('player-list');
    list.innerHTML = state.players.map(p => 
      `<li>${p} <button onclick="UCH.UI.removePlayer('${p}')">X</button></li>`
    ).join('');
    
    document.getElementById('setting-heats').value = state.settings.heats;
    document.getElementById('setting-final').value = state.settings.finalSize;
    document.getElementById('setting-points').value = state.settings.pointsTable.join(',');
  }

  function startTournament() {
    if (state.players.length < 3) {
      document.getElementById('setup-error').innerText = "Minimum 3 players required.";
      return;
    }
    state.settings.heats = parseInt(document.getElementById('setting-heats').value) || 4;
    state.settings.finalSize = parseInt(document.getElementById('setting-final').value) || 4;
    state.settings.pointsTable = document.getElementById('setting-points').value.split(',').map(Number);
    
    const pt = state.settings.pointsTable;
    state.settings.sitOutPoints = pt.length > 0 ? pt.reduce((a,b)=>a+b, 0) / (pt.length || 1) : 0;
    
    state.started = true;
    generateNextHeat();
    UCH.State.save();
    updateNav();
    showScreen('heats');
  }

  // --- Heats ---
  function generateNextHeat() {
    const heatId = state.heats.length + 1;
    if (heatId > state.settings.heats) return;
    
    const standings = UCH.Scoring.calculateStandings(state.players, state.heats, state.settings.pointsTable, state.settings.sitOutPoints);
    const { pods, sitOuts } = UCH.Pods.generatePods(state.players, standings, state.heats, heatId === 1);
    
    state.heats.push({ id: heatId, pods, sitOuts, results: {}, locked: false });
    currentHeatIndex = state.heats.length - 1;
    renderHeat(currentHeatIndex);
  }

  function rerollCurrentHeat() {
    const heat = state.heats[currentHeatIndex];
    if (heat.locked) return;
    
    // Check if empty
    if (Object.keys(heat.results).length > 0) {
      if(!confirm("You have entered results. Rerolling will clear them. Proceed?")) return;
    }
    
    state.heats.pop(); // Remove current
    generateNextHeat();
    UCH.State.save();
  }

  function renderHeat(index) {
    currentHeatIndex = index;
    const heat = state.heats[index];
    document.getElementById('heat-title').innerText = `Heat ${heat.id} of ${state.settings.heats}`;
    document.getElementById('btn-prev-heat').disabled = index === 0;
    
    // Check if we are viewing history to show a 'return to current' option
    const isHistory = index < state.heats.length - 1;
    document.getElementById('btn-next-heat').style.display = isHistory ? 'inline-block' : 'none';
    document.getElementById('btn-reroll').style.display = (heat.locked || isHistory) ? 'none' : 'inline-block';
    
    const container = document.getElementById('heat-pods');
    let html = '';
    
    heat.pods.forEach((pod, pIdx) => {
      html += `<div class="pod-card"><h3>Lobby ${pIdx + 1}</h3>`;
      pod.forEach((player, pNum) => {
        const val = heat.results[player] || '';
        const disabled = heat.locked ? 'disabled' : '';
        let options = `<option value="">--</option>`;
        for(let i=1; i<=pod.length; i++) options += `<option value="${i}" ${val==i?'selected':''}>${i}${i==1?'st':i==2?'nd':i==3?'rd':'th'}</option>`;
        
        let displayVal = '-';
        if (val) displayVal = val + (val==1?'st':val==2?'nd':val==3?'rd':'th');
        
        const hostBadge = pNum === 0 ? '<span class="host-badge">HOST</span>' : '';
        
        html += `<div class="pod-row">
          <span>${player} ${hostBadge}</span>
          <select class="admin-only" id="res-${currentHeatIndex}-${player}" onchange="UCH.UI.liveUpdateHeat('${player}', this.value)" ${disabled}>${options}</select>
          <span class="big-screen-only">${displayVal}</span>
        </div>`;
      });
      html += `</div>`;
    });
    container.innerHTML = html;
    
    document.getElementById('heat-sitouts').innerHTML = heat.sitOuts.length ? 
      `<div class="card warning">Sitting out this heat: <strong>${heat.sitOuts.join(', ')}</strong> (Auto-awarded ${state.settings.sitOutPoints} pts)</div>` : '';
      
    document.getElementById('btn-save-heat').style.display = heat.locked ? 'none' : 'block';
    document.getElementById('heat-error').innerText = '';
  }

  function prevHeat() { if(currentHeatIndex > 0) renderHeat(currentHeatIndex - 1); }
  function nextHeat() { if(currentHeatIndex < state.heats.length - 1) renderHeat(currentHeatIndex + 1); }

  function saveHeat() {
    const heat = state.heats[currentHeatIndex];
    let newResults = {};
    let error = "";

    // Validate
    heat.pods.forEach((pod, pIdx) => {
      pod.forEach(player => {
        const val = document.getElementById(`res-${currentHeatIndex}-${player}`).value;
        if (!val) error = "All players must have a placement.";
        newResults[player] = parseInt(val);
      });
    });

    if (error) {
      document.getElementById('heat-error').innerText = error;
      return;
    }

    heat.results = newResults;
    heat.locked = true;
    UCH.State.save();
    
    // Auto advance
    if (heat.id < state.settings.heats) {
      if (state.heats.length === heat.id) generateNextHeat();
      else renderHeat(currentHeatIndex + 1);
    } else {
      updateNav();
      showScreen('standings');
    }
  }

  // --- Standings ---
  function renderStandings() {
    const st = UCH.Scoring.calculateStandings(state.players, state.heats, state.settings.pointsTable, state.settings.sitOutPoints);
    document.body.style.setProperty('--player-count', Math.max(st.length, 10));
    document.getElementById('standings-body').innerHTML = st.map(s => 
      `<tr>
        <td>${s.rank}</td>
        <td><strong>${s.name}</strong></td>
        <td>${s.total}</td>
        <td>${s.wins}</td>
        <td class="hide-on-big">${s.history.join(', ')}</td>
      </tr>`
    ).join('');
  }

  // --- Final ---
  function renderFinal() {
    const st = UCH.Scoring.calculateStandings(state.players, state.heats, state.settings.pointsTable, state.settings.sitOutPoints);
    const candidates = UCH.Scoring.getFinalSeedCandidates(st, state.settings.finalSize);
    
    if (candidates.tied.length > 0 && !state.final) {
      // Need manual tie resolution
      document.getElementById('final-tie-resolver').style.display = 'block';
      document.getElementById('final-pod-container').style.display = 'none';
      
      document.getElementById('tie-candidates').innerHTML = candidates.tied.map(p => 
        `<label style="display:block; margin:10px 0;"><input type="checkbox" class="tie-check" value="${p}"> ${p}</label>`
      ).join('');
      return;
    }

    document.getElementById('final-tie-resolver').style.display = 'none';
    document.getElementById('final-pod-container').style.display = 'block';
    
    if (!state.final) {
      state.final = { pod: candidates.definite, results: {}, locked: false };
      UCH.State.save();
    }
    
    const pod = state.final.pod;
    let html = `<div class="pod-card"><h3>Grand Final</h3>`;
    pod.forEach((player, pNum) => {
      const val = state.final.results[player] || '';
      const disabled = state.final.locked ? 'disabled' : '';
      let options = `<option value="">--</option>`;
      for(let i=1; i<=pod.length; i++) options += `<option value="${i}" ${val==i?'selected':''}>${i}</option>`;
      
      let displayVal = val ? val : '-';
      
      const hostBadge = pNum === 0 ? '<span class="host-badge">HOST</span>' : '';
      
      html += `<div class="pod-row">
        <span>${player} ${hostBadge}</span>
        <select class="admin-only" id="final-res-${player}" onchange="UCH.UI.liveUpdateFinal('${player}', this.value)" ${disabled}>${options}</select>
        <span class="big-screen-only">${displayVal}</span>
      </div>`;
    });
    html += `</div>`;
    
    if (!state.final.locked) {
      html += `<button class="primary large" onclick="UCH.UI.saveFinal()">Crown Champion</button>`;
    }
    document.getElementById('final-pod-container').innerHTML = html;
  }

  function resolveFinalTie() {
    const st = UCH.Scoring.calculateStandings(state.players, state.heats, state.settings.pointsTable, state.settings.sitOutPoints);
    const candidates = UCH.Scoring.getFinalSeedCandidates(st, state.settings.finalSize);
    
    const checked = Array.from(document.querySelectorAll('.tie-check:checked')).map(cb => cb.value);
    if (checked.length !== candidates.slotsRemaining) {
      alert(`Please select exactly ${candidates.slotsRemaining} player(s).`);
      return;
    }
    
    state.final = { pod: [...candidates.definite, ...checked], results: {}, locked: false };
    UCH.State.save();
    renderFinal();
  }

  function saveFinal() {
    const pod = state.final.pod;
    let newResults = {};
    let error = false;

    pod.forEach(player => {
      const val = document.getElementById(`final-res-${player}`).value;
      if (!val) error = true;
      newResults[player] = parseInt(val);
    });

    if (error) return alert("Invalid final placements.");
    
    state.final.results = newResults;
    state.final.locked = true;
    UCH.State.save();
    renderFinal();
    
    // Announce winner
    const winner = Object.keys(newResults).find(k => newResults[k] === 1);
    setTimeout(()=> alert(`🏆 ${winner} is the Champion! 🏆`), 100);
  }

  // --- Data ---
  function exportData() { UCH.State.exportJSON(); }
  function importData(e) {
    const file = e.target.files[0];
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
    if (state.heats[currentHeatIndex].locked) return;
    if (value) {
      state.heats[currentHeatIndex].results[player] = parseInt(value);
    } else {
      delete state.heats[currentHeatIndex].results[player];
    }
    UCH.State.save();
  }

  function liveUpdateFinal(player, value) {
    if (state.final.locked) return;
    if (value) {
      state.final.results[player] = parseInt(value);
    } else {
      delete state.final.results[player];
    }
    UCH.State.save();
  }

  return { 
    init, showScreen, toggleBigScreen, addPlayer, removePlayer, startTournament, 
    prevHeat, nextHeat, rerollCurrentHeat, saveHeat, liveUpdateHeat,
    resolveFinalTie, saveFinal, liveUpdateFinal, exportData, importData, resetTournament
  };
})();