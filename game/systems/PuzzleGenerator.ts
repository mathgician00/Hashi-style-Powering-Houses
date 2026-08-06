import { Difficulty, DIFFICULTY_SETTINGS, NodeData, EdgeData, GridPoint } from '../../types';

export class PuzzleGenerator {
  /**
   * Generates a solvable puzzle.
   * 1. Places nodes randomly.
   * 2. Generates a spanning tree (Kruskal's) to ensure connectivity,
   *    respecting each node's max-connection cap AS edges are added
   *    (not after), so a valid tree edge can never be dropped later.
   * 3. Adds extra edges for complexity (still capped).
   * 4. Calculates required valence for each node from the edges actually kept.
   * 5. Verifies the final solution graph is fully connected via BFS
   *    before returning it — if not, generation is treated as failed
   *    and the caller's retry loop runs again.
   */
  public static generate(difficulty: Difficulty): { nodes: NodeData[], solutionEdges: EdgeData[] } {
    const settings = DIFFICULTY_SETTINGS[difficulty];
    let attempts = 0;

    while (attempts < 100) {
      try {
        return this.tryGenerate(settings.gridSize, settings.nodeCount, settings.maxConnections);
      } catch (e) {
        // console.warn('Generation failed, retrying...', e);
        attempts++;
      }
    }

    // Fallback simple square
    return this.createFallbackPuzzle();
  }

  private static tryGenerate(gridSize: number, nodeRange: [number, number], maxConnections: number) {
    const numNodes = Math.floor(Math.random() * (nodeRange[1] - nodeRange[0] + 1)) + nodeRange[0];
    const nodes: NodeData[] = [];
    const occupied = new Set<string>();

    // 1. Place Nodes
    for (let i = 0; i < numNodes; i++) {
      let placed = false;
      let placeAttempts = 0;
      while (!placed && placeAttempts < 50) {
        const x = Math.floor(Math.random() * gridSize);
        const y = Math.floor(Math.random() * gridSize);
        const key = `${x},${y}`;

        // Ensure not too close to others (optional, but looks better) or overlapping
        if (!occupied.has(key)) {
          nodes.push({
            id: `n_${i}`,
            x,
            y,
            requiredConnections: 0,
            currentConnections: 0
          });
          occupied.add(key);
          placed = true;
        }
        placeAttempts++;
      }
    }
    if (nodes.length < nodeRange[0]) throw new Error("Not enough nodes placed");

    // 2. Identify all possible valid orthogonal edges (neighbors)
    let potentialEdges: { u: NodeData, v: NodeData, dist: number }[] = [];

    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const u = nodes[i];
        const v = nodes[j];

        // Check alignment
        if (u.x !== v.x && u.y !== v.y) continue;

        // Check if any node is blocking the path
        if (this.isNodeBetween(u, v, nodes)) continue;

        const dist = Math.abs(u.x - v.x) + Math.abs(u.y - v.y);
        potentialEdges.push({ u, v, dist });
      }
    }

    // Shuffle edges for randomness
    potentialEdges = potentialEdges.sort(() => Math.random() - 0.5);

    // 3. Kruskal's Algorithm for Spanning Tree
    const edges: EdgeData[] = [];
    const ds = new DisjointSet(nodes.length);
    const nodeIndexMap = new Map(nodes.map((n, i) => [n.id, i]));

    // FIX (root cause): track live degree per node WHILE building the tree,
    // so a tree edge is only added if it fits under the cap. Previously the
    // cap was only enforced after the fact (step 5 below), which could
    // silently drop a spanning-tree edge that other nodes' connectivity
    // depended on, producing a puzzle with numbers derived from a graph
    // that no longer matched — sometimes making it unsolvable.
    const degree = new Map<string, number>(nodes.map(n => [n.id, 0]));

    // Helper to check crossing
    const isCrossing = (u: NodeData, v: NodeData) => {
      return edges.some(e => {
        const eU = nodes.find(n => n.id === e.nodeA)!;
        const eV = nodes.find(n => n.id === e.nodeB)!;
        return this.linesCross(u, v, eU, eV);
      });
    };

    // Add Spanning Tree edges, now degree-cap aware
    for (const p of potentialEdges) {
      const uIdx = nodeIndexMap.get(p.u.id)!;
      const vIdx = nodeIndexMap.get(p.v.id)!;

      if (ds.find(uIdx) !== ds.find(vIdx)) {
        if (!isCrossing(p.u, p.v)) {
          const degU = degree.get(p.u.id)!;
          const degV = degree.get(p.v.id)!;

          // Prefer a double cable only if both nodes can still afford it;
          // otherwise fall back to a single cable; otherwise skip this
          // potential tree edge entirely (leaves components unmerged —
          // caught by the ds.count check below, which now correctly
          // reflects a real, final failure rather than a fixable one).
          let count = 0;
          if (Math.random() > 0.7 && degU + 2 <= maxConnections && degV + 2 <= maxConnections) {
            count = 2;
          } else if (degU + 1 <= maxConnections && degV + 1 <= maxConnections) {
            count = 1;
          }

          if (count > 0) {
            ds.union(uIdx, vIdx);
            edges.push({ nodeA: p.u.id, nodeB: p.v.id, count });
            degree.set(p.u.id, degU + count);
            degree.set(p.v.id, degV + count);
          }
        }
      }
    }

    // Verify connectivity. This is now a genuine failure (not one caused
    // by a later, avoidable pruning step), so retrying with a fresh
    // random layout is the correct response.
    if (ds.count > 1) throw new Error("Graph not connected");

    // 4. Add Extra Edges (Complexity) — still degree-cap aware
    const extraEdgesTarget = Math.floor(edges.length * 0.3);
    let addedExtra = 0;

    for (const p of potentialEdges) {
      if (addedExtra >= extraEdgesTarget) break;

      // Check if edge already exists
      const exists = edges.some(e =>
        (e.nodeA === p.u.id && e.nodeB === p.v.id) ||
        (e.nodeA === p.v.id && e.nodeB === p.u.id)
      );

      if (!exists && !isCrossing(p.u, p.v)) {
        const degU = degree.get(p.u.id)!;
        const degV = degree.get(p.v.id)!;

        let count = 0;
        if (Math.random() > 0.6 && degU + 2 <= maxConnections && degV + 2 <= maxConnections) {
          count = 2;
        } else if (degU + 1 <= maxConnections && degV + 1 <= maxConnections) {
          count = 1;
        }

        if (count > 0) {
          edges.push({ nodeA: p.u.id, nodeB: p.v.id, count });
          degree.set(p.u.id, degU + count);
          degree.set(p.v.id, degV + count);
          addedExtra++;
        }
      }
    }

    // 5. Calculate Requirements (The "Puzzle")
    // No pruning happens here anymore — every edge in `edges` was already
    // admitted under the cap, so all of them become the final solution.
    nodes.forEach(n => n.requiredConnections = 0);

    edges.forEach(e => {
      const nA = nodes.find(n => n.id === e.nodeA)!;
      const nB = nodes.find(n => n.id === e.nodeB)!;
      nA.requiredConnections += e.count;
      nB.requiredConnections += e.count;
    });

    const validEdges: EdgeData[] = edges;

    // Sanity check: isolated node (shouldn't happen — every node is part
    // of the spanning tree by construction — kept as a defensive check).
    if (nodes.some(n => n.requiredConnections === 0)) throw new Error("Isolated node");

    // FIX (safety net): verify the final solution graph is a single
    // connected component using the same BFS approach GameScene.ts uses
    // at solve-time. This guarantees a puzzle is never returned to the
    // player unless it is provably solvable by at least one arrangement
    // (the one we just built).
    if (!this.isFullyConnected(nodes, validEdges)) {
      throw new Error("Final solution graph is not fully connected");
    }

    return { nodes, solutionEdges: validEdges };
  }

  // --- Helpers ---

  private static isFullyConnected(nodes: NodeData[], edges: EdgeData[]): boolean {
    if (nodes.length === 0) return true;

    const adj = new Map<string, string[]>();
    edges.forEach(e => {
      if (!adj.has(e.nodeA)) adj.set(e.nodeA, []);
      if (!adj.has(e.nodeB)) adj.set(e.nodeB, []);
      adj.get(e.nodeA)!.push(e.nodeB);
      adj.get(e.nodeB)!.push(e.nodeA);
    });

    const startId = nodes[0].id;
    const visited = new Set<string>([startId]);
    const queue = [startId];

    while (queue.length > 0) {
      const curr = queue.shift()!;
      const neighbors = adj.get(curr) || [];
      for (const n of neighbors) {
        if (!visited.has(n)) {
          visited.add(n);
          queue.push(n);
        }
      }
    }

    return visited.size === nodes.length;
  }

  private static isNodeBetween(u: NodeData, v: NodeData, allNodes: NodeData[]): boolean {
    const isVertical = u.x === v.x;

    for (const node of allNodes) {
      if (node.id === u.id || node.id === v.id) continue;

      if (isVertical) {
        if (node.x === u.x &&
           ((node.y > u.y && node.y < v.y) || (node.y > v.y && node.y < u.y))) {
          return true;
        }
      } else {
        if (node.y === u.y &&
           ((node.x > u.x && node.x < v.x) || (node.x > v.x && node.x < u.x))) {
          return true;
        }
      }
    }
    return false;
  }

  private static linesCross(a1: NodeData, a2: NodeData, b1: NodeData, b2: NodeData): boolean {
    const isAVert = a1.x === a2.x;
    const isBVert = b1.x === b2.x;

    // Parallel lines don't "cross" in this grid logic (overlap checked elsewhere)
    if (isAVert === isBVert) return false;

    // A is vertical, B is horizontal
    if (isAVert) {
      const xA = a1.x;
      const minYA = Math.min(a1.y, a2.y);
      const maxYA = Math.max(a1.y, a2.y);

      const yB = b1.y;
      const minXB = Math.min(b1.x, b2.x);
      const maxXB = Math.max(b1.x, b2.x);

      return (xA > minXB && xA < maxXB) && (yB > minYA && yB < maxYA);
    } else {
      // A is horizontal, B is vertical
      const yA = a1.y;
      const minXA = Math.min(a1.x, a2.x);
      const maxXA = Math.max(a1.x, a2.x);

      const xB = b1.x;
      const minYB = Math.min(b1.y, b2.y);
      const maxYB = Math.max(b1.y, b2.y);

      return (yA > minYB && yA < maxYB) && (xB > minXA && xB < maxXA);
    }
  }

  private static createFallbackPuzzle() {
    const nodes = [
      { id: 'n_0', x: 1, y: 1, requiredConnections: 2, currentConnections: 0 },
      { id: 'n_1', x: 3, y: 1, requiredConnections: 2, currentConnections: 0 },
      { id: 'n_2', x: 1, y: 3, requiredConnections: 2, currentConnections: 0 },
      { id: 'n_3', x: 3, y: 3, requiredConnections: 2, currentConnections: 0 },
    ];
    // A square loop
    const edges = [
      { nodeA: 'n_0', nodeB: 'n_1', count: 1 },
      { nodeA: 'n_1', nodeB: 'n_3', count: 1 },
      { nodeA: 'n_3', nodeB: 'n_2', count: 1 },
      { nodeA: 'n_2', nodeB: 'n_0', count: 1 },
    ];
    return { nodes, solutionEdges: edges };
  }
}

class DisjointSet {
  parent: number[];
  count: number;
  constructor(n: number) {
    this.parent = Array.from({ length: n }, (_, i) => i);
    this.count = n;
  }
  find(i: number): number {
    if (this.parent[i] === i) return i;
    this.parent[i] = this.find(this.parent[i]);
    return this.parent[i];
  }
  union(i: number, j: number) {
    const rootI = this.find(i);
    const rootJ = this.find(j);
    if (rootI !== rootJ) {
      this.parent[rootI] = rootJ;
      this.count--;
    }
  }
}
