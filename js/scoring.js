window.UCH.Scoring = (function() {
  
  function calculateStandings(players, heats, pointsTable, sitOutPoints) {
    const stats = {};
    players.forEach(p => {
      stats[p] = { name: p, total: 0, wins: 0, history: [] };
    });

    heats.filter(h => h.locked).forEach(heat => {
      // Apply sit-out points
      heat.sitOuts.forEach(p => {
        stats[p].total += sitOutPoints;
        stats[p].history.push('-');
      });

      // Apply match points
      heat.pods.forEach(pod => {
        pod.forEach(p => {
          const placement = heat.results[p];
          if (placement) {
            const pts = pointsTable[placement - 1] || 0;
            stats[p].total += pts;
            if (placement === 1) stats[p].wins += 1;
            stats[p].history.push(placement);
          }
        });
      });
    });

    // Convert to array and sort
    const standings = Object.values(stats).sort((a, b) => {
      if (b.total !== a.total) return b.total - a.total; // 1. Points
      if (b.wins !== a.wins) return b.wins - a.wins;     // 2. Wins
      
      // 3. Most recent placement (lower is better, ignore sit-outs '-')
      for (let i = a.history.length - 1; i >= 0; i--) {
        const valA = a.history[i] === '-' ? 99 : a.history[i];
        const valB = b.history[i] === '-' ? 99 : b.history[i];
        if (valA !== valB) return valA - valB; 
      }
      return 0; // Tied
    });

    // Assign Ranks (handling ties)
    let currentRank = 1;
    for (let i = 0; i < standings.length; i++) {
      if (i > 0 && 
          standings[i].total === standings[i-1].total && 
          standings[i].wins === standings[i-1].wins &&
          JSON.stringify(standings[i].history) === JSON.stringify(standings[i-1].history)) {
        standings[i].rank = standings[i-1].rank; // Tie
      } else {
        standings[i].rank = currentRank;
      }
      currentRank++;
    }

    return standings;
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

  return { calculateStandings, getFinalSeedCandidates };
})();