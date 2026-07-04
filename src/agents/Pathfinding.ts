export interface GridPoint {
  x: number;
  y: number;
}

export interface PathfindingGrid {
  width: number;
  height: number;
  isWalkable(point: GridPoint): boolean;
}

interface PathNode extends GridPoint {
  g: number;
  h: number;
  f: number;
  parent?: PathNode;
}

function pointKey(point: GridPoint): string {
  return `${point.x},${point.y}`;
}

function heuristic(a: GridPoint, b: GridPoint): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function neighbors(point: GridPoint): GridPoint[] {
  return [
    { x: point.x + 1, y: point.y },
    { x: point.x - 1, y: point.y },
    { x: point.x, y: point.y + 1 },
    { x: point.x, y: point.y - 1 },
  ];
}

function reconstructPath(node: PathNode): GridPoint[] {
  const path: GridPoint[] = [];
  let current: PathNode | undefined = node;

  while (current) {
    path.unshift({ x: current.x, y: current.y });
    current = current.parent;
  }

  return path;
}

export function findPath(grid: PathfindingGrid, start: GridPoint, goal: GridPoint): GridPoint[] {
  const open = new Map<string, PathNode>();
  const closed = new Set<string>();
  const startNode: PathNode = {
    ...start,
    g: 0,
    h: heuristic(start, goal),
    f: heuristic(start, goal),
  };

  open.set(pointKey(start), startNode);

  while (open.size > 0) {
    const current = [...open.values()].sort((a, b) => a.f - b.f)[0];
    const currentKey = pointKey(current);

    if (current.x === goal.x && current.y === goal.y) {
      return reconstructPath(current);
    }

    open.delete(currentKey);
    closed.add(currentKey);

    for (const next of neighbors(current)) {
      const nextKey = pointKey(next);
      if (
        next.x < 0 ||
        next.y < 0 ||
        next.x >= grid.width ||
        next.y >= grid.height ||
        closed.has(nextKey) ||
        !grid.isWalkable(next)
      ) {
        continue;
      }

      const tentativeG = current.g + 1;
      const existing = open.get(nextKey);

      if (!existing || tentativeG < existing.g) {
        const h = heuristic(next, goal);
        open.set(nextKey, {
          ...next,
          g: tentativeG,
          h,
          f: tentativeG + h,
          parent: current,
        });
      }
    }
  }

  return [];
}
