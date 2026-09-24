window.UCH.Scoring = (function() {

  // points: { lobbySize: [pts for 1st, 2nd, ...] }. Falls back to the 4-player table for unknown sizes.
  function pointsFor(points, lobbySize, placement) {
    const table = points[lobbySize] || points[4] || [];
    return table[placement - 1] || 0;
  }

  // History has exactly one entry per locked heat for every player, so tiebreaks compare the same heat:
  // a placement number, '-' for a sit-out, or null if the player wasn't in that heat (joined late / dropped).
  function calculateStandings(players, heats, points, sitOutPoints) {
    const stats = {};
    players.forEach(p => {
      stats[p] = { name: p, total: 0, wins: 0, history: [] };
    });

    heats.filter(h => h.locked).forEach(heat => {
      const entry = {};
      heat.sitOuts.forEach(p => { entry[p] = '-'; });
      heat.pods.forEach(pod => pod.forEach(p => {
        const placement = heat.results[p];
        if (placement) entry[p] = { placement, size: pod.length };
      }));

      players.forEach(p => {
        const e = entry[p];
        if (e === '-') {
          stats[p].total += sitOutPoints;
          stats[p].history.push('-');
        } else if (e) {
          stats[p].total += pointsFor(points, e.size, e.placement);
          if (e.placement === 1) stats[p].wins += 1;
          stats[p].history.push(e.placement);
        } else {
          stats[p].history.push(null);
        }
      });
    });

    // Convert to array and sort
    const standings = Object.values(stats).sort((a, b) => {
      if (b.total !== a.total) return b.total - a.total; // 1. Points
      if (b.wins !== a.wins) return b.wins - a.wins;     // 2. Wins

      // 3. Most recent placement (lower is better; sit-outs and absences count as worst)
      for (let i = a.history.length - 1; i >= 0; i--) {
        const valA = typeof a.history[i] === 'number' ? a.history[i] : 99;
        const valB = typeof b.history[i] === 'number' ? b.history[i] : 99;
        if (valA !== valB) return valA - valB;
      }
      return 0; // Tied
    });

    // Assign Ranks (handling ties)
    for (let i = 0; i < standings.length; i++) {
      if (i > 0 && compareKey(standings[i]) === compareKey(standings[i-1])) {
        standings[i].rank = standings[i-1].rank; // Tie
      } else {
        standings[i].rank = i + 1;
      }
    }

    return standings;
  }

  // Two players tie only if the sort comparator couldn't separate them.
  function compareKey(s) {
    return JSON.stringify([s.total, s.wins, s.history.map(h => typeof h === 'number' ? h : 99)]);
  }

  function getFinalSeedCandidates(standings, finalSize) {
    if (standings.length <= finalSize) return { definite: standings.map(s=>s.name), tied: [] };

    const cutoffRank = standings[finalSize - 1].rank;
    const tiedAtCutoff = standings.filter(s => s.rank === cutoffRank);

    // If the number of people sharing the cutoff rank pushes us over finalSize, we need resolution
    const peopleAboveCutoff = standings.filter(s => s.rank < cutoffRank);

    if (peopleAboveCutoff.length + tiedAtCutoff.length > finalSize) {
      return {
        definite: peopleAboveCutoff.map(s => s.name),
        tied: tiedAtCutoff.map(s => s.name),
        slotsRemaining: finalSize - peopleAboveCutoff.length
      };
    }

    return {
      definite: standings.slice(0, finalSize).map(s => s.name),
      tied: []
    };
  }

  return { pointsFor, calculateStandings, getFinalSeedCandidates };
})();
