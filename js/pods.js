window.UCH.Pods = (function() {

  // How far (in rank places) a player's position can be randomly nudged before lobbies are cut.
  // random: pure shuffle. skewed: players mostly meet others within ~1 lobby of their rank. strict: near-Swiss.
  const SEEDING_SPREAD = { random: Infinity, skewed: 4, strict: 1 };
  const ATTEMPTS = 300;

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

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function pairKey(a, b) {
    return a < b ? a + '\u0000' + b : b + '\u0000' + a;
  }

  // players: players in this heat. standings: [{ name, total, rank }]. heatsHistory: earlier heats.
  function generatePods(players, standings, heatsHistory, isFirstHeat, seeding = 'random') {
    let availablePlayers = [...players];
    let sitOuts = [];
    const sizesReq = calculatePodSizes(players.length);

    // Handle Sit-outs (primarily for 5 players)
    for (let i = 0; i < sizesReq.sitOuts; i++) {
      // Find player with least sit-outs
      const sitOutCounts = {};
      players.forEach(p => sitOutCounts[p] = 0);
      heatsHistory.forEach(h => h.sitOuts.forEach(p => { if (p in sitOutCounts) sitOutCounts[p]++; }));
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

    const rankOf = {};
    standings.forEach(s => { rankOf[s.name] = s.rank; });
    const spread = isFirstHeat ? Infinity : (SEEDING_SPREAD[seeding] ?? Infinity);

    const pairCounts = {};
    const hostCounts = {};
    heatsHistory.forEach(h => h.pods.forEach(pod => {
      if (pod.length) hostCounts[pod[0]] = (hostCounts[pod[0]] || 0) + 1;
      for (let a = 0; a < pod.length; a++) {
        for (let b = a + 1; b < pod.length; b++) {
          const k = pairKey(pod[a], pod[b]);
          pairCounts[k] = (pairCounts[k] || 0) + 1;
        }
      }
    }));

    // Try many noisy orderings; keep the one with the fewest repeat opponents.
    // The noise level (spread) controls how strongly lobbies are grouped by rank.
    let best = null;
    let bestCost = Infinity;
    for (let attempt = 0; attempt < ATTEMPTS && bestCost > 0; attempt++) {
      let order = shuffle([...availablePlayers]);
      if (spread !== Infinity) {
        const keyOf = {};
        order.forEach(p => { keyOf[p] = (rankOf[p] || 1) + (Math.random() * 2 - 1) * spread; });
        order.sort((a, b) => keyOf[a] - keyOf[b]);
      }

      const pods = [];
      let pIdx = 0;
      sizesReq.sizes.forEach(size => {
        pods.push(order.slice(pIdx, pIdx + size));
        pIdx += size;
      });

      let cost = 0;
      pods.forEach(pod => {
        for (let a = 0; a < pod.length; a++) {
          for (let b = a + 1; b < pod.length; b++) cost += pairCounts[pairKey(pod[a], pod[b])] || 0;
        }
      });

      if (cost < bestCost) {
        bestCost = cost;
        best = pods;
      }
    }

    // Host (index 0) goes to whoever in the lobby has hosted least; ties broken randomly
    const pods = best.map(pod => {
      const shuffled = shuffle([...pod]);
      let hostIdx = 0;
      shuffled.forEach((p, i) => {
        if ((hostCounts[p] || 0) < (hostCounts[shuffled[hostIdx]] || 0)) hostIdx = i;
      });
      const host = shuffled.splice(hostIdx, 1)[0];
      return [host, ...shuffled];
    });

    return { pods, sitOuts };
  }

  return { calculatePodSizes, generatePods, SEEDING_SPREAD };
})();
