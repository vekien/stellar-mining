// ============================================================
// NODE & BASE DATA
// ============================================================
export const BASE_UPGRADE_COSTS = [0, 10000, 14000, 19600, 27440, 38416, 53782, 75295, 105413, 147578];
export const BASE_MAX_SHIPS     = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50];
export const BASE_RANGE         = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50]; // tiles each direction from base

// All nodes in the world — base at (12,12), range expands outward per base level
export const ALL_NODES = [
  // === LEVEL 1 — dist 3-5 (inside halfR=6) ============
  {id:0,  type:'iron',     gr:[9,10],  minLevel:1},
  {id:1,  type:'iron',     gr:[15,10], minLevel:1},
  {id:2,  type:'copper',   gr:[10,15], minLevel:1},
  {id:3,  type:'copper',   gr:[15,14], minLevel:1},
  {id:4,  type:'oxygen',   gr:[8,12],  minLevel:1},
  {id:5,  type:'silicon',  gr:[13,16], minLevel:1},
  {id:6,  type:'titanium', gr:[16,12], minLevel:1},
  {id:7,  type:'gold',     gr:[12,17], minLevel:1},
  {id:46, type:'copper',   gr:[10,7],  minLevel:1},

  // === LEVEL 2 — dist exactly 7 =======================
  {id:8,  type:'iron',     gr:[5,12],  minLevel:2},
  {id:9,  type:'iron',     gr:[19,12], minLevel:2},
  {id:10, type:'copper',   gr:[12,5],  minLevel:2},
  {id:11, type:'copper',   gr:[12,19], minLevel:2},
  {id:12, type:'oxygen',   gr:[5,17],  minLevel:2},
  {id:13, type:'silicon',  gr:[19,7],  minLevel:2},
  {id:14, type:'gold',     gr:[19,17], minLevel:2},
  {id:15, type:'titanium', gr:[5,7],   minLevel:2},

  // === LEVEL 3 — dist 8-9 ==============================
  {id:16, type:'iron',     gr:[3,12],  minLevel:3},
  {id:17, type:'iron',     gr:[21,12], minLevel:3},
  {id:18, type:'copper',   gr:[12,3],  minLevel:3},
  {id:19, type:'copper',   gr:[12,21], minLevel:3},
  {id:20, type:'oxygen',   gr:[4,20],  minLevel:3},
  {id:21, type:'oxygen',   gr:[21,5],  minLevel:3},
  {id:22, type:'silicon',  gr:[4,8],   minLevel:3},
  {id:23, type:'titanium', gr:[21,20], minLevel:3},
  {id:24, type:'gold',     gr:[20,4],  minLevel:3},
  {id:25, type:'gold',     gr:[4,21],  minLevel:3},

  // === LEVEL 4 — dist 10-12 ============================
  {id:26, type:'iron',     gr:[2,10],  minLevel:4},
  {id:27, type:'iron',     gr:[22,10], minLevel:4},
  {id:28, type:'copper',   gr:[10,2],  minLevel:4},
  {id:29, type:'copper',   gr:[10,22], minLevel:4},
  {id:30, type:'oxygen',   gr:[2,17],  minLevel:4},
  {id:31, type:'silicon',  gr:[23,15], minLevel:4},
  {id:32, type:'titanium', gr:[1,12],  minLevel:4},
  {id:33, type:'titanium', gr:[23,12], minLevel:4},
  {id:34, type:'gold',     gr:[22,22], minLevel:4},
  {id:35, type:'gold',     gr:[2,22],  minLevel:4},

  // === LEVEL 5 =========================================
  {id:36, type:'iron',     gr:[0,10],  minLevel:5},
  {id:37, type:'iron',     gr:[24,12], minLevel:5},
  {id:38, type:'copper',   gr:[12,0],  minLevel:5},
  {id:39, type:'copper',   gr:[12,24], minLevel:5},
  {id:40, type:'oxygen',   gr:[0,20],  minLevel:5},
  {id:41, type:'silicon',  gr:[24,20], minLevel:5},
  {id:42, type:'titanium', gr:[0,5],   minLevel:5},
  {id:43, type:'titanium', gr:[24,5],  minLevel:5},
  {id:44, type:'gold',     gr:[24,24], minLevel:5},
  {id:45, type:'gold',     gr:[0,24],  minLevel:5},
];
