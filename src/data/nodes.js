// ============================================================
// NODE & BASE DATA
// ============================================================
export const BASE_UPGRADE_COSTS = [0, 10000, 14000, 19600, 27440, 38416, 53782, 75295, 105413, 147578];
export const BASE_MAX_SHIPS     = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50];
export const BASE_RANGE         = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50]; // tiles each direction from base

// All nodes in the world — base at (50,50) after offset applied in main.js
// Coordinates below are relative to old base (12,12) — offset applied at runtime.
// Ring bands per base level:
//   Lv1: dist 2–5    (inner)
//   Lv2: dist 6–10   (new outer ring)
//   Lv3: dist 11–15  (new outer ring)
//   Lv4: dist 16–20  (new outer ring)
//   Lv5: dist 21–25  (new outer ring)

const NODES_BY_LEVEL = [
  {
    minLevel: 1,
    // === LEVEL 1 — dist 2–5 ==============================
    nodes: [
      {id:0,  type:'iron',     gr:[9,10]},
      {id:1,  type:'iron',     gr:[15,10]},
      {id:2,  type:'copper',   gr:[10,15]},
      {id:3,  type:'copper',   gr:[15,14]},
      {id:46, type:'copper',   gr:[10,7]},
      {id:4,  type:'oxygen',   gr:[8,12]},
      {id:5,  type:'silicon',  gr:[13,16]},
      {id:6,  type:'titanium', gr:[16,12]},
      {id:7,  type:'gold',     gr:[12,17]},
    ],
  },
  {
    minLevel: 2,
    // === LEVEL 2 — dist 6–10 =============================
    nodes: [
      {id:8,  type:'iron',     gr:[5,9]},
      {id:9,  type:'iron',     gr:[19,9]},
      {id:10, type:'copper',   gr:[9,5]},
      {id:11, type:'copper',   gr:[9,19]},
      {id:12, type:'oxygen',   gr:[4,15]},
      {id:13, type:'oxygen',   gr:[20,15]},
      {id:14, type:'silicon',  gr:[18,6]},
      {id:15, type:'silicon',  gr:[5,18]},
      {id:47, type:'titanium', gr:[20,8]},
      {id:48, type:'gold',     gr:[6,20]},
    ],
  },
  {
    minLevel: 3,
    // === LEVEL 3 — dist 11–15 ============================
    nodes: [
      {id:16, type:'iron',     gr:[1,10]},
      {id:17, type:'iron',     gr:[23,10]},
      {id:18, type:'copper',   gr:[10,1]},
      {id:19, type:'copper',   gr:[10,23]},
      {id:20, type:'oxygen',   gr:[1,18]},
      {id:21, type:'oxygen',   gr:[23,6]},
      {id:22, type:'silicon',  gr:[1,5]},
      {id:23, type:'silicon',  gr:[23,5]},
      {id:24, type:'titanium', gr:[23,19]},
      {id:25, type:'titanium', gr:[1,19]},
      {id:49, type:'gold',     gr:[23,22]},
      {id:50, type:'gold',     gr:[1,22]},
    ],
  },
  {
    minLevel: 4,
    // === LEVEL 4 — dist 16–20 ============================
    nodes: [
      {id:26, type:'iron',     gr:[-4,10]},
      {id:27, type:'iron',     gr:[28,10]},
      {id:28, type:'copper',   gr:[10,-4]},
      {id:29, type:'copper',   gr:[10,28]},
      {id:30, type:'oxygen',   gr:[-4,20]},
      {id:31, type:'oxygen',   gr:[28,4]},
      {id:32, type:'silicon',  gr:[-4,5]},
      {id:33, type:'silicon',  gr:[28,19]},
      {id:34, type:'titanium', gr:[-4,14]},
      {id:35, type:'titanium', gr:[28,14]},
      {id:51, type:'gold',     gr:[28,28]},
      {id:52, type:'gold',     gr:[-4,28]},
    ],
  },
  {
    minLevel: 5,
    // === LEVEL 5 — dist 21–25 ============================
    nodes: [
      {id:36, type:'iron',     gr:[-9,10]},
      {id:37, type:'iron',     gr:[33,10]},
      {id:38, type:'copper',   gr:[10,-9]},
      {id:39, type:'copper',   gr:[10,33]},
      {id:40, type:'oxygen',   gr:[-9,22]},
      {id:41, type:'oxygen',   gr:[33,2]},
      {id:42, type:'silicon',  gr:[33,22]},
      {id:43, type:'silicon',  gr:[-9,2]},
      {id:44, type:'titanium', gr:[-9,18]},
      {id:45, type:'titanium', gr:[33,18]},
      {id:53, type:'gold',     gr:[33,33]},
      {id:54, type:'gold',     gr:[-9,33]},
    ],
  },
];

export const ALL_NODES = NODES_BY_LEVEL.flatMap(({ minLevel, nodes }) => (
  nodes.map(node => ({ ...node, minLevel }))
));
