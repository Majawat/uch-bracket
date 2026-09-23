window.UCH.Pods = (function() {
  
  function calculatePodSizes(numPlayers) {
    if (numPlayers < 3) return { sizes: [], sitOuts: 0 };
    if (numPlayers === 5) return { sizes: [4], sitOuts: 1 };
    
    const podCount = Math.ceil(numPlayers / 4);
    const baseSize = Math.floor(numPlayers / podCount);
    let remainder = numPlayers % podCount;
    
    const sizes = Array(podCount).fill(baseSize);
    for (let i = 0; i < remainder; i++) {
      sizes[i]++;
    }
    return { sizes, sitOuts: 0 };
  }

  function generatePods(players, standings, heatsHistory, isFirstHeat) {
    let availablePlayers = [...players];
    let sitOuts = [];
    const sizesReq = calculatePodSizes(players.length);

    // Handle Sit-outs (primarily for 5 players)
    for (let i = 0; i < sizesReq.sitOuts; i++) {
      // Find player with least sit-outs
      const sitOutCounts = {};
      players.forEach(p => sitOutCounts[p] = 0);
      heatsHistory.forEach(h => h.sitOuts.forEach(p => sitOutCounts[p]++));
      sitOuts.forEach(p => sitOutCounts[p]++); // Account for sitouts already chosen this round
      
      let candidate = availablePlayers[0];
      if (isFirstHeat) {
        // Random sit out for heat 1
        candidate = availablePlayers[Math.floor(Math.random() * availablePlayers.length)];
      } else {
        // Sort by sit-outs ascending, then by standings points descending (to sit top players if tied)
        availablePlayers.sort((a, b) => {
          if (sitOutCounts[a] !== sitOutCounts[b]) return sitOutCounts[a] - sitOutCounts[b];
          const rankA = standings.find(s => s.name === a)?.total || 0;
          const rankB = standings.find(s => s.name === b)?.total || 0;
          return rankB - rankA; // Highest points sits out if tied
        });
        candidate = availablePlayers[0];
      }
      sitOuts.push(candidate);
      availablePlayers = availablePlayers.filter(p => p !== candidate);
    }

    // Shuffle available players completely for fun, random matchups
    for (let i = availablePlayers.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [availablePlayers[i], availablePlayers[j]] = [availablePlayers[j], availablePlayers[i]];
    }

    // Fill Pods
    const pods = [];
    let pIdx = 0;
    sizesReq.sizes.forEach(size => {
      const pod = [];
      for (let i = 0; i < size; i++) {
        pod.push(availablePlayers[pIdx++]);
      }
      // Shuffle the pod to randomly designate the host (index 0)
      for (let k = pod.length - 1; k > 0; k--) {
        const j = Math.floor(Math.random() * (k + 1));
        [pod[k], pod[j]] = [pod[j], pod[k]];
      }
      pods.push(pod);
    });

    return { pods, sitOuts };
  }

  return { calculatePodSizes, generatePods };
})();