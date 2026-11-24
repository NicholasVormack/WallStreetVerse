/**
 * Primitive collision geometry and static tilemap/grid helpers.
 * All collision resolution on the server uses these primitives; the client
 * mirrors them only for the visual debug harness.
 */

export interface Vec2 {
  x: number;
  y: number;
}

export interface AABB {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface Circle {
  centerX: number;
  centerY: number;
  radius: number;
}

export interface Ray {
  origin: Vec2;
  direction: Vec2;
}

export const vec2 = (x: number, y: number): Vec2 => ({ x, y });
export const vec2Add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
export const vec2Sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
export const vec2Scale = (v: Vec2, s: number): Vec2 => ({ x: v.x * s, y: v.y * s });
export const vec2Length = (v: Vec2): number => Math.hypot(v.x, v.y);
export const vec2Normalize = (v: Vec2): Vec2 => {
  const len = vec2Length(v);
  return len === 0 ? { x: 0, y: 0 } : { x: v.x / len, y: v.y / len };
};

export const aabb = (minX: number, minY: number, maxX: number, maxY: number): AABB => ({
  minX,
  minY,
  maxX,
  maxY,
});

export const aabbFromCircle = (c: Circle): AABB =>
  aabb(c.centerX - c.radius, c.centerY - c.radius, c.centerX + c.radius, c.centerY + c.radius);

/**
 * AABB vs AABB intersection test.
 */
export const aabbIntersects = (a: AABB, b: AABB): boolean =>
  a.minX < b.maxX && a.maxX > b.minX && a.minY < b.maxY && a.maxY > b.minY;

/**
 * Circle vs AABB intersection test. Returns the minimum translation vector
 * (mtv) to separate the circle from the AABB, or null when no intersection.
 */
export const circleAabbMtv = (c: Circle, box: AABB): Vec2 | null => {
  const closestX = Math.min(Math.max(c.centerX, box.minX), box.maxX);
  const closestY = Math.min(Math.max(c.centerY, box.minY), box.maxY);
  const dx = c.centerX - closestX;
  const dy = c.centerY - closestY;
  const distSq = dx * dx + dy * dy;
  if (distSq === 0 || distSq >= c.radius * c.radius) return null;
  const dist = Math.sqrt(distSq);
  return { x: (dx / dist) * (c.radius - dist), y: (dy / dist) * (c.radius - dist) };
};

/**
 * Clamp a position so a circle of given radius stays inside map bounds.
 */
export const clampToBounds = (pos: Vec2, radius: number, bounds: { minX: number; minY: number; maxX: number; maxY: number }): Vec2 => {
  return {
    x: Math.min(Math.max(pos.x, bounds.minX + radius), bounds.maxX - radius),
    y: Math.min(Math.max(pos.y, bounds.minY + radius), bounds.maxY - radius),
  };
};

export type StaticObstacle = AABB | Circle;

/**
 * Check a circle against a list of static obstacles. Returns the first MTV
 * found (resolution applied in order by the caller).
 */
export const collideCircleStatic = (c: Circle, obstacles: readonly StaticObstacle[]): Vec2 | null => {
  for (const obstacle of obstacles) {
    const box = "radius" in obstacle ? aabbFromCircle(obstacle) : obstacle;
    const mtv = circleAabbMtv(c, box);
    if (mtv) return mtv;
  }
  return null;
};

/**
 * Spatial grid for static collision geometry. Query returns obstacles near a point.
 */
export class CollisionGrid {
  private readonly cellSize: number;
  private readonly obstacles: Map<string, StaticObstacle[]> = new Map();

  constructor(cellSize: number, obstacles: readonly StaticObstacle[]) {
    this.cellSize = cellSize;
    for (const obstacle of obstacles) this.insert(obstacle);
  }

  private key(cellX: number, cellY: number): string {
    return `${cellX},${cellY}`;
  }

  private insert(obstacle: StaticObstacle): void {
    const box = "radius" in obstacle ? aabbFromCircle(obstacle) : obstacle;
    const minCellX = Math.floor(box.minX / this.cellSize);
    const maxCellX = Math.floor(box.maxX / this.cellSize);
    const minCellY = Math.floor(box.minY / this.cellSize);
    const maxCellY = Math.floor(box.maxY / this.cellSize);
    for (let cx = minCellX; cx <= maxCellX; cx++) {
      for (let cy = minCellY; cy <= maxCellY; cy++) {
        const bucket = this.obstacles.get(this.key(cx, cy));
        if (bucket) bucket.push(obstacle);
        else this.obstacles.set(this.key(cx, cy), [obstacle]);
      }
    }
  }

  query(c: Circle): StaticObstacle[] {
    const box = aabbFromCircle(c);
    const minCellX = Math.floor(box.minX / this.cellSize);
    const maxCellX = Math.floor(box.maxX / this.cellSize);
    const minCellY = Math.floor(box.minY / this.cellSize);
    const maxCellY = Math.floor(box.maxY / this.cellSize);
    const found: StaticObstacle[] = [];
    const seen = new Set<StaticObstacle>();
    for (let cx = minCellX; cx <= maxCellX; cx++) {
      for (let cy = minCellY; cy <= maxCellY; cy++) {
        const bucket = this.obstacles.get(this.key(cx, cy));
        if (!bucket) continue;
        for (const obstacle of bucket) {
          if (seen.has(obstacle)) continue;
          seen.add(obstacle);
          found.push(obstacle);
        }
      }
    }
    return found;
  }
}
