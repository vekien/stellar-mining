// ============================================================
// MODULE UI — craft timers, placement, and modal
// ============================================================
import { state } from '../state.js';
import { addLog, fmt, fmtCompact, resourceIconHtml, spendCoins, addCoins, isLightColor, showHintTooltip, hideTooltip } from '../helpers.js';
import { bindTippy, bindTippyIn, destroyTippiesIn, hideAllTippies, setHtmlDestroyingTippies } from './tippy.js';

function infoRowHtml(label, id, value = '', cls = '') {
  return `<div class="sm-info-row"><span class="k">${label}</span><span class="val${cls ? ` ${cls}` : ''}" id="${id}">${value}</span></div>`;
}

function netTileHtml(id, iconSrc, name, tip) {
  return `<div class="lab-net-tile" data-tippy-content="${tip}">
    <img class="lab-net-icon" src="${iconSrc}" alt="">
    <div>
      <div id="${id}" class="lab-net-count">0</div>
      <div class="lab-net-name">${name}</div>
    </div>
  </div>`;
}

function moduleTabsHtml(tabs) {
  // tabs: [{ id, label, icon, countId? }]
  return `<div class="mod-tabs sm-tabs">
    ${tabs.map((t, i) => `<button type="button" class="mod-tab sm-tab${i === 0 ? ' on' : ''}" data-tab="${t.id}" onclick="setModuleModalTab(this,'${t.id}')">
      <span class="ms-icon">${t.icon}</span> ${t.label}${t.countId ? ` <span class="bp-tab-count" id="${t.countId}">0</span>` : ''}
    </button>`).join('')}
  </div>`;
}

window.setModuleModalTab = function(el, tab) {
  const root = el?.closest?.('.lab-layout');
  if (!root) return;
  root.querySelectorAll('.mod-tab').forEach((btn) => {
    btn.classList.toggle('on', btn.dataset.tab === tab);
  });
  root.querySelectorAll('.mod-tab-pane').forEach((pane) => {
    pane.classList.toggle('on', pane.dataset.pane === tab);
  });
  if (tab === 'network') {
    const moduleId = Number(root.dataset.moduleId);
    if (Number.isFinite(moduleId)) {
      const mod = state.modules.find((m) => m.id === moduleId);
      if (mod) {
        patchNetworkTab(root, mod);
        bindTippyIn(root.querySelector('#module-net-tiles') || root);
      }
    }
  }
};

function withModuleId(layoutClass, moduleId, inner) {
  return `<div class="lab-layout ${layoutClass}" data-module-id="${moduleId}">${inner}</div>`;
}

function networkPanelHtml() {
  return `<div class="sm-info-block sm-info-block-fill net-panel" style="flex:1;min-height:0;">
    <div class="net-diagram-wrap">
      <div class="net-canvas-toolbar">
        <button type="button" class="net-canvas-btn" title="Zoom out" onclick="netCanvasZoom(this,-1)"><span class="ms-icon">remove</span></button>
        <button type="button" class="net-canvas-btn" title="Reset view" onclick="netCanvasReset(this)"><span class="ms-icon">center_focus_weak</span></button>
        <button type="button" class="net-canvas-btn" title="Zoom in" onclick="netCanvasZoom(this,1)"><span class="ms-icon">add</span></button>
      </div>
      <div class="net-diagram" id="module-net-diagram"></div>
      <div class="net-canvas-hint">drag to pan · scroll to zoom · double-click reset</div>
    </div>
    <div class="lab-network-tiles net-summary-tiles" id="module-net-tiles"></div>
    <div class="net-node-list" id="module-net-list"></div>
  </div>`;
}

const NET_ZOOM_MIN = 0.35;
const NET_ZOOM_MAX = 3.5;
const _netCamByModule = new Map();
const _netDrag = { active: false, diagram: null, lastX: 0, lastY: 0, moved: false };

function getNetCam(moduleId) {
  let cam = _netCamByModule.get(moduleId);
  if (!cam) {
    cam = { x: 0, y: 0, scale: 1, fitted: false, worldW: 520, worldH: 280 };
    _netCamByModule.set(moduleId, cam);
  }
  return cam;
}

function applyNetCam(diagram, cam) {
  const world = diagram?.querySelector?.('.net-canvas-world');
  if (!world) return;
  world.style.transform = `translate(${cam.x}px, ${cam.y}px) scale(${cam.scale})`;
}

function fitNetCam(diagram, cam) {
  const viewport = diagram?.querySelector?.('.net-canvas-viewport');
  if (!viewport) return;
  const rect = viewport.getBoundingClientRect();
  const vw = Math.max(40, rect.width);
  const vh = Math.max(40, rect.height);
  const pad = 28;
  const sx = (vw - pad * 2) / Math.max(1, cam.worldW);
  const sy = (vh - pad * 2) / Math.max(1, cam.worldH);
  cam.scale = Math.max(NET_ZOOM_MIN, Math.min(1.35, Math.min(sx, sy)));
  cam.x = (vw - cam.worldW * cam.scale) / 2;
  cam.y = (vh - cam.worldH * cam.scale) / 2;
  cam.fitted = true;
  applyNetCam(diagram, cam);
}

function zoomNetCamAt(diagram, cam, factor, clientX, clientY) {
  const viewport = diagram.querySelector('.net-canvas-viewport');
  if (!viewport) return;
  const rect = viewport.getBoundingClientRect();
  const mx = Number.isFinite(clientX) ? clientX - rect.left : rect.width / 2;
  const my = Number.isFinite(clientY) ? clientY - rect.top : rect.height / 2;
  const wx = (mx - cam.x) / cam.scale;
  const wy = (my - cam.y) / cam.scale;
  const next = Math.max(NET_ZOOM_MIN, Math.min(NET_ZOOM_MAX, cam.scale * factor));
  cam.scale = next;
  cam.x = mx - wx * next;
  cam.y = my - wy * next;
  applyNetCam(diagram, cam);
}

function diagramFromNetControl(el) {
  return el?.closest?.('.net-diagram-wrap')?.querySelector?.('#module-net-diagram')
    || el?.closest?.('.lab-layout')?.querySelector?.('#module-net-diagram')
    || null;
}

window.netCanvasZoom = function(el, dir) {
  const diagram = diagramFromNetControl(el);
  if (!diagram) return;
  const moduleId = Number(diagram.dataset.moduleId);
  if (!Number.isFinite(moduleId)) return;
  const cam = getNetCam(moduleId);
  zoomNetCamAt(diagram, cam, dir > 0 ? 1.2 : 1 / 1.2);
};

window.netCanvasReset = function(el) {
  const diagram = diagramFromNetControl(el);
  if (!diagram) return;
  const moduleId = Number(diagram.dataset.moduleId);
  if (!Number.isFinite(moduleId)) return;
  fitNetCam(diagram, getNetCam(moduleId));
};

function bindNetCanvas(diagram, moduleId) {
  if (diagram.dataset.bound === '1') {
    diagram.dataset.moduleId = String(moduleId);
    return;
  }
  diagram.dataset.bound = '1';
  diagram.dataset.moduleId = String(moduleId);

  const camId = () => {
    const id = Number(diagram.dataset.moduleId);
    return Number.isFinite(id) ? id : moduleId;
  };

  const onPointerDown = (e) => {
    if (e.button !== 0 && e.pointerType !== 'touch') return;
    if (e.target.closest?.('.net-canvas-btn, .net-canvas-toolbar')) return;
    const viewport = diagram.querySelector('.net-canvas-viewport');
    if (!viewport) return;
    e.preventDefault();
    e.stopPropagation();
    _netDrag.active = true;
    _netDrag.diagram = diagram;
    _netDrag.lastX = e.clientX;
    _netDrag.lastY = e.clientY;
    _netDrag.moved = false;
    diagram.classList.add('panning');
    try { viewport.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
  };

  const onPointerMove = (e) => {
    if (!_netDrag.active || _netDrag.diagram !== diagram) return;
    e.preventDefault();
    e.stopPropagation();
    const dx = e.clientX - _netDrag.lastX;
    const dy = e.clientY - _netDrag.lastY;
    if (Math.abs(dx) > 1 || Math.abs(dy) > 1) _netDrag.moved = true;
    _netDrag.lastX = e.clientX;
    _netDrag.lastY = e.clientY;
    const cam = getNetCam(camId());
    cam.x += dx;
    cam.y += dy;
    applyNetCam(diagram, cam);
  };

  const onPointerUp = (e) => {
    if (_netDrag.diagram !== diagram) return;
    _netDrag.active = false;
    _netDrag.diagram = null;
    diagram.classList.remove('panning');
    try {
      const viewport = diagram.querySelector('.net-canvas-viewport');
      viewport?.releasePointerCapture?.(e.pointerId);
    } catch (_) { /* ignore */ }
  };

  const onWheel = (e) => {
    if (!diagram.contains(e.target)) return;
    e.preventDefault();
    e.stopPropagation();
    const cam = getNetCam(camId());
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    zoomNetCamAt(diagram, cam, factor, e.clientX, e.clientY);
  };

  const onDblClick = (e) => {
    if (e.target.closest?.('.net-canvas-btn, .net-canvas-toolbar')) return;
    e.preventDefault();
    e.stopPropagation();
    fitNetCam(diagram, getNetCam(camId()));
  };

  diagram.addEventListener('pointerdown', onPointerDown);
  diagram.addEventListener('pointermove', onPointerMove);
  diagram.addEventListener('pointerup', onPointerUp);
  diagram.addEventListener('pointercancel', onPointerUp);
  diagram.addEventListener('lostpointercapture', onPointerUp);
  diagram.addEventListener('wheel', onWheel, { passive: false });
  diagram.addEventListener('dblclick', onDblClick);
}

function mountNetworkDiagram(diagram, moduleId, graph) {
  diagram.dataset.moduleId = String(moduleId);
  if (!graph.nodes.length) {
    diagram.innerHTML = `<div class="net-empty">No linked network nodes.</div>`;
    diagram.dataset.bound = '';
    return;
  }

  const { positions, W, H } = layoutNetworkNodes(graph.nodes);
  const lines = graph.edges.map((e) => {
    const a = positions.get(e.fromId);
    const b = positions.get(e.toId);
    if (!a || !b) return '';
    const netCls = e.net === 'lab' ? ' lab' : e.net === 'power' ? ' power' : '';
    return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" class="net-edge${netCls}"/>`;
  }).join('');

  const nodeEls = graph.nodes.map((n) => {
    const p = positions.get(n.id);
    if (!p) return '';
    const cls = n.isFocus ? 'net-node focus' : `net-node kind-${n.kind || 'consumer'}`;
    const label = n.name.length > 14 ? `${n.name.slice(0, 13)}…` : n.name;
    return `<g class="${cls}" transform="translate(${p.x},${p.y})">
      <circle r="22" class="net-node-ring"/>
      <image href="${n.icon}" x="-12" y="-12" width="24" height="24" preserveAspectRatio="xMidYMid meet"/>
      <text y="36" text-anchor="middle" class="net-node-label">${escapeHtml(label)}</text>
    </g>`;
  }).join('');

  const svg = `<svg class="net-svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">${lines}${nodeEls}</svg>`;

  let viewport = diagram.querySelector('.net-canvas-viewport');
  let world = diagram.querySelector('.net-canvas-world');
  if (!viewport || !world) {
    diagram.dataset.bound = '';
    diagram.innerHTML = `<div class="net-canvas-viewport"><div class="net-canvas-world"></div></div>`;
    viewport = diagram.querySelector('.net-canvas-viewport');
    world = diagram.querySelector('.net-canvas-world');
  }
  world.innerHTML = svg;
  bindNetCanvas(diagram, moduleId);

  const cam = getNetCam(moduleId);
  cam.worldW = W;
  cam.worldH = H;
  if (!cam.fitted) {
    // Fit after layout so viewport has real size
    requestAnimationFrame(() => fitNetCam(diagram, cam));
  } else {
    applyNetCam(diagram, cam);
  }
}

function buildingIconFor(entity, isTurret = false) {
  if (isTurret) return 'assets/images/buildings/power_pole.png';
  if (!entity) return 'assets/images/buildings/storage.png';
  if (isPowerStationModule(entity)) return 'assets/images/buildings/power.png';
  if (isPowerPoleModule(entity)) return 'assets/images/buildings/power_pole.png';
  if (isResearchLabModule(entity)) return 'assets/images/buildings/lab.png';
  if (isLabTowerModule(entity)) return 'assets/images/buildings/lab_pole.png';
  if (isDroneLabModule(entity)) return 'assets/images/buildings/drone_lab.png';
  if (isStorageModule(entity)) return 'assets/images/buildings/storage.png';
  return 'assets/images/buildings/storage.png';
}

function typeLabelFor(entity, isTurret = false) {
  if (isTurret) return 'Turret';
  if (isPowerStationModule(entity)) return 'Power Station';
  if (isPowerPoleModule(entity)) return 'Power Pole';
  if (isResearchLabModule(entity)) return 'Research Lab';
  if (isLabTowerModule(entity)) return 'Lab Tower';
  if (isDroneLabModule(entity)) return 'Drone Lab';
  if (isStorageModule(entity)) return 'Storage';
  return getModuleDef(entity.type)?.name || entity.type || 'Module';
}

function collectPowerGraph(focus) {
  const info = getPowerModuleNetworkInfo(focus.id, state.modules, state.turrets);
  const net = getPowerNetworkState(state.modules, state.turrets);
  const nodes = new Map();
  const add = (ent, kind, isTurret = false) => {
    if (!ent) return;
    // Prefer lab/station kinds when this graph is later merged
    let nodeKind = kind;
    if (!isTurret && isResearchLabModule(ent)) nodeKind = 'lab';
    else if (!isTurret && isPowerStationModule(ent)) nodeKind = 'station';
    else if (!isTurret && isPowerPoleModule(ent)) nodeKind = 'pole';
    nodes.set(ent.id, {
      id: ent.id,
      name: ent.name || typeLabelFor(ent, isTurret),
      kind: nodeKind,
      isTurret,
      isFocus: ent.id === focus.id,
      icon: buildingIconFor(ent, isTurret),
      entity: ent,
    });
  };
  add(focus, isPowerStationModule(focus) ? 'station' : isPowerPoleModule(focus) ? 'pole' : 'consumer');
  for (const s of info.stations) add(s, 'station');
  for (const p of info.poles) add(p, 'pole');
  for (const c of info.storages) add(c, 'consumer');
  for (const t of info.turrets) add(t, 'turret', true);

  const idSet = new Set(nodes.keys());
  const edgeKeys = new Set();
  const edges = [];
  const pushEdge = (a, b) => {
    const key = a < b ? `${a}:${b}` : `${b}:${a}`;
    if (edgeKeys.has(key)) return;
    edgeKeys.add(key);
    edges.push({ fromId: a, toId: b, net: 'power' });
  };
  for (const id of idSet) {
    for (const next of net.edgeAdjacency?.get(id) || []) {
      if (idSet.has(next)) pushEdge(id, next);
    }
  }
  for (const e of net.activeEdges || []) {
    if (idSet.has(e.fromId) && idSet.has(e.toId)) pushEdge(e.fromId, e.toId);
  }

  return {
    nodes: [...nodes.values()],
    edges,
    tiles: [
      { id: 'module-net-c-stations', icon: 'assets/images/buildings/power.png', name: 'Stations', count: info.stations.length + (isPowerStationModule(focus) ? 1 : 0), tip: 'Power Stations' },
      { id: 'module-net-c-poles', icon: 'assets/images/buildings/power_pole.png', name: 'Poles', count: info.poles.length + (isPowerPoleModule(focus) ? 1 : 0), tip: 'Power Poles' },
      { id: 'module-net-c-consumers', icon: 'assets/images/buildings/storage.png', name: 'Consumers', count: info.storages.length + (isPoweredBuildingModule(focus) && !isPowerStationModule(focus) && !isPowerPoleModule(focus) ? 1 : 0), tip: 'Powered buildings' },
      { id: 'module-net-c-turrets', icon: 'assets/images/buildings/power_pole.png', name: 'Turrets', count: info.turrets.length, tip: 'Turrets on network' },
    ].filter((t) => t.count > 0 || ['module-net-c-stations', 'module-net-c-poles'].includes(t.id)),
  };
}

function collectLabGraph(focus) {
  const info = getLabModuleNetworkInfo(focus.id, state.modules, state.nodes, state.base.level);
  const net = getLabNetworkState(state.modules, state.nodes, state.base.level);
  const nodes = new Map();
  const add = (ent, kind) => {
    if (!ent) return;
    nodes.set(ent.id, {
      id: ent.id,
      name: ent.name || typeLabelFor(ent),
      kind,
      isFocus: ent.id === focus.id,
      icon: buildingIconFor(ent),
      entity: ent,
    });
  };
  add(focus, isResearchLabModule(focus) ? 'lab' : 'tower');
  for (const l of info.labs || []) add(l, 'lab');
  for (const t of info.towers || []) add(t, 'tower');

  const idSet = new Set([...nodes.keys()]);
  const edgeKeys = new Set();
  const edges = [];
  const pushEdge = (a, b) => {
    const key = a < b ? `${a}:${b}` : `${b}:${a}`;
    if (edgeKeys.has(key)) return;
    edgeKeys.add(key);
    edges.push({ fromId: a, toId: b, net: 'lab' });
  };

  // Prefer full adjacency so tower-only components still draw links
  for (const id of idSet) {
    for (const next of net.adjacency?.get(id) || []) {
      if (idSet.has(next)) pushEdge(id, next);
    }
  }
  for (const e of net.activeEdges || []) {
    if (idSet.has(e.fromId) && idSet.has(e.toId)) pushEdge(e.fromId, e.toId);
  }

  // resource leaves from linked resources / nodeEdges
  let resCount = 0;
  const addResource = (towerId, node) => {
    if (!node || !idSet.has(towerId)) return;
    resCount += 1;
    const rid = `node:${node.id}`;
    if (!nodes.has(rid)) {
      const def = RESOURCE_DEFS[node.type];
      nodes.set(rid, {
        id: rid,
        name: def?.label || node.type || 'Node',
        kind: 'resource',
        isFocus: false,
        icon: def ? `assets/images/resources/${node.type}.png` : buildingIconFor(focus),
        entity: null,
      });
    }
    pushEdge(towerId, rid);
  };

  for (const entry of info.resources || []) {
    addResource(entry.tower?.id ?? entry.towerId, entry.node);
  }
  if (!(info.resources || []).length) {
    for (const ne of net.nodeEdges || []) {
      if (!idSet.has(ne.towerId)) continue;
      addResource(ne.towerId, { id: ne.nodeId, type: ne.resourceType });
    }
  }

  return {
    nodes: [...nodes.values()],
    edges,
    tiles: [
      { id: 'module-net-c-labs', icon: 'assets/images/buildings/lab.png', name: 'Labs', count: (info.labs?.length || 0) + (isResearchLabModule(focus) ? 1 : 0), tip: 'Research Labs' },
      { id: 'module-net-c-towers', icon: 'assets/images/buildings/lab_pole.png', name: 'Towers', count: (info.towers?.length || 0) + (isLabTowerModule(focus) ? 1 : 0), tip: 'Lab Towers' },
      { id: 'module-net-c-nodes', icon: 'assets/images/resources/iron.png', name: 'Nodes', count: resCount, tip: 'Linked resource nodes' },
    ],
  };
}

const NET_KIND_RANK = {
  lab: 6,
  station: 5,
  tower: 4,
  pole: 4,
  consumer: 2,
  turret: 1,
  resource: 0,
};

function mergeNetworkGraphs(primary, secondary, focus) {
  const nodes = new Map();
  const take = (n) => {
    const prev = nodes.get(n.id);
    if (!prev) {
      nodes.set(n.id, { ...n, isFocus: n.id === focus.id || !!n.isFocus });
      return;
    }
    const prefer = (NET_KIND_RANK[n.kind] || 0) > (NET_KIND_RANK[prev.kind] || 0) ? n : prev;
    nodes.set(n.id, {
      ...prefer,
      isFocus: prev.isFocus || n.isFocus || n.id === focus.id,
      name: (n.isFocus || n.id === focus.id) ? (n.name || prev.name) : (prev.name || n.name),
      entity: prefer.entity || prev.entity || n.entity,
      icon: prefer.icon || prev.icon || n.icon,
      isTurret: !!(prefer.isTurret || prev.isTurret || n.isTurret),
    });
  };
  for (const n of primary.nodes || []) take(n);
  for (const n of secondary.nodes || []) take(n);

  const edgeKeys = new Set();
  const edges = [];
  for (const e of [...(primary.edges || []), ...(secondary.edges || [])]) {
    // Allow power + lab edges between the same pair (different nets)
    const key = `${e.fromId}:${e.toId}:${e.net || 'x'}`;
    const rev = `${e.toId}:${e.fromId}:${e.net || 'x'}`;
    if (edgeKeys.has(key) || edgeKeys.has(rev)) continue;
    edgeKeys.add(key);
    edges.push(e);
  }

  const tileMap = new Map();
  for (const t of [...(primary.tiles || []), ...(secondary.tiles || [])]) {
    if (!tileMap.has(t.id)) tileMap.set(t.id, { ...t });
    else tileMap.get(t.id).count = Math.max(tileMap.get(t.id).count, t.count);
  }

  // Power tiles first, then lab tiles
  const tileOrder = [
    'module-net-c-stations',
    'module-net-c-poles',
    'module-net-c-consumers',
    'module-net-c-turrets',
    'module-net-c-labs',
    'module-net-c-towers',
    'module-net-c-nodes',
  ];
  const tiles = tileOrder.map((id) => tileMap.get(id)).filter(Boolean)
    .concat([...tileMap.values()].filter((t) => !tileOrder.includes(t.id)));

  return { nodes: [...nodes.values()], edges, tiles };
}

function collectResearchLabGraph(focus) {
  // Research labs sit on both the research network and the power grid
  return mergeNetworkGraphs(collectLabGraph(focus), collectPowerGraph(focus), focus);
}

function collectModuleNetworkGraph(module) {
  if (isResearchLabModule(module)) return collectResearchLabGraph(module);
  if (isLabTowerModule(module)) return collectLabGraph(module);
  return collectPowerGraph(module);
}

function layoutNetworkNodes(nodes) {
  const maxInRow = Math.max(1, ...[...nodes.reduce((m, n) => {
    const k = n.kind || 'consumer';
    m.set(k, (m.get(k) || 0) + 1);
    return m;
  }, new Map()).values()]);
  const W = Math.max(520, 96 + maxInRow * 88);
  const layerOrder = ['station', 'lab', 'pole', 'tower', 'consumer', 'turret', 'resource'];
  const layers = new Map();
  for (const n of nodes) {
    const k = n.kind || 'consumer';
    if (!layers.has(k)) layers.set(k, []);
    layers.get(k).push(n);
  }
  const activeLayers = layerOrder.filter((k) => layers.has(k) && layers.get(k).length);
  const layerCount = Math.max(1, activeLayers.length);
  const H = Math.max(280, 72 + layerCount * 90);
  const positions = new Map();

  activeLayers.forEach((kind, li) => {
    const row = layers.get(kind);
    // Keep focus near horizontal center within its layer
    row.sort((a, b) => (a.isFocus === b.isFocus ? String(a.name).localeCompare(String(b.name)) : a.isFocus ? -1 : 1));
    if (row.length > 2) {
      const focusIdx = row.findIndex((n) => n.isFocus);
      if (focusIdx > 0) {
        const [f] = row.splice(focusIdx, 1);
        row.splice(Math.floor(row.length / 2), 0, f);
      }
    }
    const y = layerCount === 1 ? H / 2 : 48 + (li / (layerCount - 1)) * (H - 96);
    row.forEach((n, i) => {
      const x = row.length === 1 ? W / 2 : 56 + (i / (row.length - 1)) * (W - 112);
      positions.set(n.id, { x, y });
    });
  });

  return { positions, W, H };
}

function graphSignature(graph) {
  const nodeSig = graph.nodes.map((n) => `${n.id}:${n.kind}:${n.isFocus ? 1 : 0}:${n.name}`).join('|');
  const edgeSig = graph.edges.map((e) => `${e.fromId}-${e.toId}`).join('|');
  const tileSig = graph.tiles.map((t) => `${t.id}:${t.count}`).join('|');
  return `${nodeSig}#${edgeSig}#${tileSig}`;
}

function patchNetworkTab(root, module) {
  const diagram = root.querySelector('#module-net-diagram');
  const tiles = root.querySelector('#module-net-tiles');
  const list = root.querySelector('#module-net-list');
  if (!diagram) return;

  const graph = collectModuleNetworkGraph(module);

  const sig = graphSignature(graph);
  if (diagram.dataset.sig !== sig) {
    diagram.dataset.sig = sig;
    mountNetworkDiagram(diagram, module.id, graph);
  } else if (!diagram.querySelector('.net-canvas-viewport') && graph.nodes.length) {
    mountNetworkDiagram(diagram, module.id, graph);
  } else {
    diagram.dataset.moduleId = String(module.id);
    const cam = getNetCam(module.id);
    if (cam.fitted) applyNetCam(diagram, cam);
  }

  if (tiles) {
    const tileHtml = graph.tiles.map((t) =>
      `<div class="lab-net-tile" data-tippy-content="${t.tip}">
        <img class="lab-net-icon" src="${t.icon}" alt="">
        <div>
          <div class="lab-net-count" id="${t.id}">${t.count}</div>
          <div class="lab-net-name">${t.name}</div>
        </div>
      </div>`
    ).join('');
    if (tiles.dataset.sig !== sig) {
      tiles.dataset.sig = sig;
      tiles.innerHTML = tileHtml;
    }
  }

  if (list) {
    const rows = graph.nodes
      .filter((n) => !String(n.id).startsWith('node:'))
      .sort((a, b) => (a.isFocus === b.isFocus ? a.name.localeCompare(b.name) : a.isFocus ? -1 : 1))
      .map((n) => `<div class="net-list-row${n.isFocus ? ' focus' : ''}">
        <img src="${n.icon}" alt="" class="net-list-icon">
        <span class="net-list-name">${escapeHtml(n.name)}</span>
        <span class="net-list-kind">${n.isFocus ? 'YOU' : escapeHtml(typeLabelFor(n.entity, n.isTurret))}</span>
      </div>`).join('');
    if (list.dataset.sig !== sig) {
      list.dataset.sig = sig;
      list.innerHTML = rows || '<div class="net-empty">No modules linked.</div>';
    }
  }
}

function maybePatchNetworkTab(modal, module) {
  const root = modal?.querySelector?.('.lab-layout[data-module-id]');
  if (!root) return;
  const netOn = root.querySelector('.mod-tab.on[data-tab="network"]');
  if (netOn) patchNetworkTab(root, module);
}
import {
  SYNTHESIS_RECIPES,
  SYNTHESIS_SLOT_COUNT,
  getSynthesisRecipe,
  normalizeSynthesisSlots,
  getLinkedNodeCounts,
  getRecipeStatus,
  getSynthesisCraftTime,
} from '../data/synthesis.js';
import { refresh } from './refresh.js';
import {
  applyFloatingPosition,
  bringFloatingToFront,
  centerFloatingWindow,
  initFloatingDrag,
  initFloatingResize,
  placeFloatingWindow,
} from './floatingWindow.js';
import { getCraft } from '../data/crafts.js';
import {
  STORAGE_FACILITY_ID,
  DRONE_LAB_ID,
  getModuleDef,
  getModuleStats,
  getModuleFootprintCells,
  moduleContainsCell,
  normalizeModule,
  isStorageModule,
  isResearchLabModule,
  isDroneLabModule,
  isPoweredBuildingModule,
  isPowerStationModule,
  isPowerPoleModule,
  isLabTowerModule,
  getModuleInventoryTotal,
  scrubModuleInventory,
  getPowerFuelOptions,
  formatPowerFuelRate,
  getPowerNetworkState,
  getPowerModuleNetworkInfo,
  getLabNetworkState,
  getLabModuleNetworkInfo,
  getPowerResourceConsumption,
  getPowerFuelOutput,
  getPowerStationEffectiveOutput,
  hasPowerStationFuel,
  getNoFuelNetworkIds,
  invalidateNetworkCache,
  getModuleImportPerMinute,
} from '../data/modules.js';
import { getStoragePowerUsage, isStorageOperational } from '../data/storage.js';
import { getDronesForLab, getDroneStatusText } from '../systems/drones.js';
import { RESOURCE_DEFS, MINE_TIERS } from '../data/resources.js';
import { toRoman } from '../data/ships.js';
import { cam, focusOn, gridToWorld } from '../render/camera.js';
import { BASE_COL, BASE_ROW, GRID_COLS, GRID_ROWS, TILE_W, TILE_H, isBaseFootprintCell } from '../constants.js';

function getModuleCraftTimeMs(moduleType = STORAGE_FACILITY_ID) {
  return getModuleDef(moduleType).craftTimeMs || 15000;
}

function getModuleById(moduleId) {
  return state.modules.find((module) => module.id === moduleId) || null;
}

function getModuleLabel(moduleOrType) {
  return getModuleDef(typeof moduleOrType === 'string' ? moduleOrType : moduleOrType?.type).name;
}

function getModuleFootprintLabel(moduleOrType) {
  const size = getModuleDef(typeof moduleOrType === 'string' ? moduleOrType : moduleOrType?.type).footprintSize || 1;
  return `${size}x${size}`;
}

function getModuleUpgradeCost(module) {
  const moduleDef = getCraft('buildings', module.type || STORAGE_FACILITY_ID);
  const tier = Math.max(1, module.level || 1);
  return {
    coins: (moduleDef?.cost || 0) * tier,
    reqs: Object.fromEntries(Object.entries(moduleDef?.reqs || {}).map(([r, n]) => [r, n * tier])),
  };
}

function getModuleInvestedCoins(module) {
  const moduleDef = getCraft('buildings', module.type || STORAGE_FACILITY_ID);
  let total = moduleDef?.cost || 0;
  for (let lvl = 1; lvl < (module.level || 1); lvl++) total += (moduleDef?.cost || 0) * lvl;
  return total;
}

export function getModuleWorldPos(module) {
  const w = gridToWorld(module.col, module.row);
  return { x: w.x, y: w.y };
}

export function getStorageTotalInventory(storage) {
  return getModuleInventoryTotal(storage);
}

export function getModuleAtCell(col, row) {
  return state.modules.find((module) => moduleContainsCell(module, col, row)) || null;
}

export function getModuleAtWorld(wx, wy) {
  for (const module of state.modules) {
    if (isStorageModule(module)) continue;
    const pos = gridToWorld(module.col, module.row);
    const dx = wx - pos.x;
    const dy = wy - (pos.y + TILE_H / 2);
    if ((dx * dx) + (dy * dy) < (34 * 34)) return module;
  }
  const col = Math.round((wx / (TILE_W / 2) + wy / (TILE_H / 2)) / 2);
  const row = Math.round((wy / (TILE_H / 2) - wx / (TILE_W / 2)) / 2);
  return getModuleAtCell(col, row);
}

export function getStorageAtCell(col, row) {
  return getModuleAtCell(col, row);
}

export function canPlaceModuleAt(moduleType, col, row, ignoreId = null) {
  const moduleName = getModuleLabel(moduleType).toLowerCase();
  const cells = getModuleFootprintCells(moduleType, col, row);
  for (const cell of cells) {
    if (cell.col < 0 || cell.col >= GRID_COLS || cell.row < 0 || cell.row >= GRID_ROWS) {
      return { ok: false, reason: `⚠ ${getModuleLabel(moduleType)} footprint must fit fully inside the map.` };
    }
    if (isBaseFootprintCell(cell.col, cell.row)) {
      return { ok: false, reason: `⚠ Cannot place ${moduleName} on the base.` };
    }
    const onNode = state.nodes.some(n => n.gr[0] === cell.col && n.gr[1] === cell.row && n.minLevel <= state.base.level);
    if (onNode) return { ok: false, reason: `⚠ Cannot place ${moduleName} on a resource node.` };
    const onTurret = state.turrets.some(t => t.col === cell.col && t.row === cell.row);
    if (onTurret) return { ok: false, reason: `⚠ Cannot place ${moduleName} on a turret tile.` };
    const onModule = state.modules.some(module => module.id !== ignoreId && moduleContainsCell(module, cell.col, cell.row));
    if (onModule) return { ok: false, reason: '⚠ Modules cannot overlap.' };
  }
  return { ok: true, reason: '' };
}

export function canPlaceStorageAt(col, row, ignoreId = null) {
  return canPlaceModuleAt(STORAGE_FACILITY_ID, col, row, ignoreId);
}

function completeCraftBuilding(moduleType) {
  const timer = state.buildingCraftTimers?.[moduleType];
  if (!timer) return;
  delete state.buildingCraftTimers[moduleType];
  if (!Array.isArray(state.unplacedModuleQueue)) state.unplacedModuleQueue = [];
  state.unplacedModuleQueue.push(moduleType);
  state.unplacedModules = state.unplacedModuleQueue.length;
  const moduleDef = getCraft('buildings', moduleType);
  addLog(`✅ ${moduleDef?.name || 'Building'} ready to place.`);
  if (refresh.header) refresh.header();
  if (refresh.ui) refresh.ui();
  if (window.isHdrPanelOpen?.('craft') || window._hdrPanelOpen === 'craft') { window.openHdrPanel?.('craft', { refresh: true, preserveScroll: true }); }
}

function scheduleBuildingCraftCompletion(moduleType, endsAt) {
  const wait = Math.max(0, endsAt - Date.now());
  setTimeout(() => {
    const timer = state.buildingCraftTimers?.[moduleType];
    if (!timer) return;
    if (Date.now() >= timer.endsAt) completeCraftBuilding(moduleType);
    else scheduleBuildingCraftCompletion(moduleType, timer.endsAt);
  }, wait + 5);
}

function getStorageModalHost() {
  return document.getElementById('storage-modal-host');
}

function getOpenStorageModalWindows() {
  const host = getStorageModalHost();
  return host ? [...host.querySelectorAll('.storage-modal-window')] : [];
}

function getStorageModalWindow(moduleId) {
  const host = getStorageModalHost();
  return host ? host.querySelector(`.storage-modal-window[data-module-id="${moduleId}"]`) : null;
}

function bringStorageModalToFront(modal) {
  bringFloatingToFront(modal);
}

function buildPowerStationInfoTooltip({ fuelCost, fuelName, powerOutputText, totalLoadText, netDeltaText, statusLabel, noFuel }) {
  const keyStyle = 'color:#8bd6ff;font-weight:700;';
  const valueStyle = 'color:#ffe066;font-weight:700;';
  const statusColor = statusLabel === 'Deficit' ? '#ff8a8a' : statusLabel === 'Balanced' ? '#ffe066' : '#6fff9a';
  return [
    `This power station uses <span style="${keyStyle}">Input</span> of <span style="${valueStyle}">${fuelCost} ${fuelName}</span> per second.`,
    noFuel
      ? `This generates <span style="${keyStyle}">Output</span> of <span style="${valueStyle}">${powerOutputText}/s</span> electricity because there is no ${fuelName} in reserve right now.`
      : `This generates <span style="${keyStyle}">Output</span> of <span style="${valueStyle}">${powerOutputText}/s</span> electricity.`,
    `The current <span style="${keyStyle}">Load</span> on the network is <span style="${valueStyle}">${totalLoadText}/s</span> - this is how much electricity is being demanded.`,
    `The <span style="${keyStyle}">Status</span> shows that you're producing <span style="color:${statusColor};font-weight:700;">${netDeltaText}/s ${statusLabel}</span> from this power station.`,
  ].join('<br>');
}

function applyStorageModalPosition(modal, left = null, top = null) {
  const overlay = document.getElementById('storage-modal-overlay');
  applyFloatingPosition(overlay, modal, left, top);
}

function initStorageModalDrag(modal) {
  const overlay = document.getElementById('storage-modal-overlay');
  if (!overlay || !modal) return;
  const layoutKey = `module:${modal.dataset.moduleId}`;
  initFloatingDrag(modal, overlay, {
    handleSelector: '.storage-modal-drag-handle',
    layoutKey,
    onFocus: () => {
      const moduleId = Number(modal.dataset.moduleId);
      if (Number.isFinite(moduleId)) state.selectedModule = moduleId;
    },
    isActive: () => overlay.style.display === 'flex',
  });
  const moduleId = Number(modal.dataset.moduleId);
  const module = Number.isFinite(moduleId) ? getModuleById(moduleId) : null;
  initFloatingResize(modal, overlay, {
    minW: module && isWideBuildingModal(module) ? 720 : 420,
    minH: 300,
    layoutKey,
    isActive: () => overlay.style.display === 'flex',
  });
}

function getModuleAccentClass(module) {
  if (!module) return '';
  if (isPowerStationModule(module) || isPowerPoleModule(module)) return 'modal-accent-power';
  if (isResearchLabModule(module) || isLabTowerModule(module)) return 'modal-accent-lab';
  if (isDroneLabModule(module)) return 'modal-accent-drone';
  if (isStorageModule(module)) return 'modal-accent-storage';
  return '';
}

function isWideBuildingModal(module) {
  return !!(module && (
    isResearchLabModule(module)
    || isPowerStationModule(module)
    || isStorageModule(module)
    || isDroneLabModule(module)
    || isPowerPoleModule(module)
    || isLabTowerModule(module)
  ));
}

function isCompactWideBuilding(module) {
  return isPowerPoleModule(module) || isLabTowerModule(module);
}

const MODULE_MODAL_DEFAULT_W = 1000;
const MODULE_MODAL_DEFAULT_H = 1000;

function applyModuleModalChrome(modal, module) {
  if (!modal || !module) return;
  const isWide = isWideBuildingModal(module);
  const accent = getModuleAccentClass(module);
  modal.classList.remove(
    'storage-modal-window-lab',
    'modal-accent-power',
    'modal-accent-lab',
    'modal-accent-storage',
    'modal-accent-drone',
  );
  if (isWide) modal.classList.add('storage-modal-window-lab');
  if (accent) modal.classList.add(accent);
  const body = modal.querySelector('.storage-modal-body');
  if (body) {
    body.classList.toggle('storage-modal-body-lab', isWide);
    body.style.padding = isWide ? '12px' : '14px';
  }
  // Default open size. Skip if user already resized/moved this window.
  if (modal.dataset.moved !== '1') {
    if (!modal.dataset.width) {
      modal.style.width = `${MODULE_MODAL_DEFAULT_W}px`;
      modal.dataset.width = String(MODULE_MODAL_DEFAULT_W);
    }
    if (!modal.dataset.height) {
      modal.style.height = `${MODULE_MODAL_DEFAULT_H}px`;
      modal.dataset.height = String(MODULE_MODAL_DEFAULT_H);
    }
  }
}

function ensureStorageModalWindow(moduleId) {
  let modal = getStorageModalWindow(moduleId);
  if (modal) return modal;
  const host = getStorageModalHost();
  if (!host) return null;
  const module = getModuleById(moduleId);
  const isWide = isWideBuildingModal(module);
  const defaultW = MODULE_MODAL_DEFAULT_W;
  const defaultH = MODULE_MODAL_DEFAULT_H;
  modal = document.createElement('div');
  modal.className = 'storage-modal-window';
  modal.dataset.moduleId = String(moduleId);
  modal.style.cssText = `position:absolute;width:${defaultW}px;height:${defaultH}px;background:linear-gradient(160deg,#0a1428 0%,#060c1a 100%);border:1px solid #2a5090;border-radius:7px;overflow:hidden;box-shadow:0 8px 40px rgba(0,0,0,0.8);pointer-events:all;`;
  modal.dataset.width = String(defaultW);
  modal.dataset.height = String(defaultH);
  modal.innerHTML = `<div class="panel-shell-head storage-modal-drag-handle"><div class="panel-shell-title storage-modal-title">BUILDING</div><button class="panel-shell-close" onclick="closeStorageModal(${moduleId})">✕</button></div><div class="storage-modal-body" style="padding:${isWide ? '12px' : '14px'};"></div>`;
  applyModuleModalChrome(modal, module);
  host.appendChild(modal);
  const overlay = document.getElementById('storage-modal-overlay');
  placeFloatingWindow(overlay, modal, `module:${moduleId}`);
  initStorageModalDrag(modal);
  return modal;
}

export function openModuleModal(moduleId) {
  state.selectedModule = moduleId;
  const overlay = document.getElementById('storage-modal-overlay');
  if (overlay) {
    overlay.style.display = 'flex';
    if (!overlay.dataset.tippyLeaveBound) {
      overlay.dataset.tippyLeaveBound = '1';
      overlay.addEventListener('mouseleave', () => hideAllTippies());
      overlay.addEventListener('scroll', () => hideAllTippies(), true);
    }
  }
  const modal = ensureStorageModalWindow(moduleId);
  if (modal) {
    renderModuleModal(moduleId, modal);
    const layoutKey = `module:${moduleId}`;
    const place = () => centerFloatingWindow(overlay, modal, layoutKey);
    place();
    requestAnimationFrame(() => {
      place();
      requestAnimationFrame(place);
    });
    bringStorageModalToFront(modal);
  }
}

export function openStorageModal(moduleId) {
  openModuleModal(moduleId);
}

export function closeStorageModal(arg = null) {
  hideAllTippies();
  const overlay = document.getElementById('storage-modal-overlay');
  if (typeof arg === 'number') {
    if (_synthesisOverlayModuleId === arg) window.closeSynthesisOverlay?.();
    if (_upgradeOverlayModuleId === arg) window.closeModuleUpgradeOverlay?.();
    const modal = getStorageModalWindow(arg);
    if (modal) {
      destroyTippiesIn(modal);
      modal.remove();
    }
  }
  const openWindows = getOpenStorageModalWindows();
  if (!openWindows.length) {
    if (overlay) overlay.style.display = 'none';
    state.selectedModule = null;
  } else {
    const topWindow = openWindows.sort((a, b) => Number(b.style.zIndex || 0) - Number(a.style.zIndex || 0))[0];
    state.selectedModule = Number(topWindow?.dataset.moduleId) || state.selectedModule;
  }
}

/** Close the front-most building modal window. Returns true if one was closed. */
export function closeTopStorageModal() {
  const openWindows = getOpenStorageModalWindows();
  if (!openWindows.length) return false;
  const topWindow = openWindows.sort((a, b) => Number(b.style.zIndex || 0) - Number(a.style.zIndex || 0))[0];
  const moduleId = Number(topWindow?.dataset.moduleId);
  if (!Number.isFinite(moduleId)) return false;
  closeStorageModal(moduleId);
  return true;
}

function renderStatRows(rows) {
  return rows.map(([label, value]) => `<tr><td class="module-stat-label">${label}</td><td class="module-stat-value">${value}</td></tr>`).join('');
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function setTextIfChangedIn(root, selector, text) {
  const el = root?.querySelector(selector);
  if (!el) return null;
  if (el.textContent !== text) el.textContent = text;
  return el;
}

function setHtmlIfChangedIn(root, selector, html) {
  const el = root?.querySelector(selector);
  if (!el) return null;
  if (el.innerHTML !== html) setHtmlDestroyingTippies(el, html);
  return el;
}

function buildLabLinkedResourcesHtml(module, info, usedIngredientIds = null) {
  if (!info.resources.length) return '<div class="module-empty-note">No linked resources in range.</div>';
  const counts = new Map();
  for (const entry of info.resources) {
    const resourceType = entry.node.type;
    counts.set(resourceType, (counts.get(resourceType) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => {
      const tierA = RESOURCE_DEFS[a[0]] ? (RESOURCE_DEFS[a[0]].label || a[0]) : a[0];
      const tierB = RESOURCE_DEFS[b[0]] ? (RESOURCE_DEFS[b[0]].label || b[0]) : b[0];
      return tierA.localeCompare(tierB);
    })
    .map(([resourceType, count]) => {
      const def = RESOURCE_DEFS[resourceType];
      const tier = def ? ((Object.entries(MINE_TIERS).find(([, tierDef]) => tierDef.resources.includes(resourceType))?.[0]) || '?') : '?';
      const inUse = usedIngredientIds?.has(resourceType);
      return `<div class="lab-res-row${inUse ? ' used-in' : ''}" style="color:${def?.color || '#cde'};">
        ${resourceIconHtml(resourceType, 16)}
        <span class="lab-res-name">${def?.label || resourceType}</span>
        <span class="lab-res-count">${count}×</span>
        <span class="lab-res-badge${inUse ? ' in-use' : ''}">${inUse ? 'IN USE' : `T${tier}`}</span>
      </div>`;
    }).join('');
}

function getLabUsedIngredientIds(module) {
  const used = new Set();
  for (const id of normalizeSynthesisSlots(module.synthesisSlots)) {
    const recipe = getSynthesisRecipe(id);
    if (!recipe) continue;
    for (const input of recipe.inputs) used.add(input.id);
  }
  return used;
}

function buildSynthesisSlotsHtml(module) {
  const slots = normalizeSynthesisSlots(module.synthesisSlots);
  const labLevel = module.level || 1;
  return slots.map((id, i) => {
    const recipe = id ? getSynthesisRecipe(id) : null;
    if (!recipe) {
      return `<button type="button" class="lab-synth-slot" onclick="openSynthesisOverlay(${module.id},${i})">
        <div class="lab-synth-slot-empty">+</div>
        <div class="lab-synth-slot-body">
          <div class="lab-synth-slot-empty-label">ASSIGN RECIPE</div>
        </div>
      </button>`;
    }
    const craftSec = getSynthesisCraftTime(recipe, labLevel);
    const ings = recipe.inputs.map((input) =>
      `<span class="lab-synth-ing" title="${RESOURCE_DEFS[input.id]?.label || input.id}">${resourceIconHtml(input.id, 14)}<span class="lab-synth-ing-amt">${fmtCompact(input.amount)}</span></span>`
    ).join('');
    // CSS animation duration = craft cycle (preview only until production craft is wired)
    return `<button type="button" class="lab-synth-slot filled" onclick="openSynthesisOverlay(${module.id},${i})" style="--synth-cycle:${craftSec}s;">
      <span class="lab-synth-slot-clear" onclick="event.stopPropagation();clearSynthesisSlot(${module.id},${i})" title="Clear">✕</span>
      <div class="lab-synth-timer" aria-hidden="true">
        <svg class="lab-synth-ring" viewBox="0 0 36 36">
          <circle class="lab-synth-ring-bg" cx="18" cy="18" r="15.5" pathLength="100" />
          <circle class="lab-synth-ring-fg" cx="18" cy="18" r="15.5" pathLength="100" />
        </svg>
        <div class="lab-synth-timer-icon">${resourceIconHtml(recipe.icon, 18)}</div>
      </div>
      <div class="lab-synth-slot-body">
        <div class="lab-synth-slot-name" style="color:${recipe.color};">${escapeHtml(recipe.name)}</div>
        <div class="lab-synth-slot-ings">${ings}</div>
        <div class="lab-synth-slot-meta"><span class="lab-synth-rarity">${recipe.rarity.toUpperCase()}</span><span class="lab-synth-eta">${craftSec}s / unit</span></div>
      </div>
    </button>`;
  }).join('');
}

function buildUpgradeReqsHtml(upgradeCost) {
  const coinMet = state.coins >= upgradeCost.coins;
  let html = `<span class="lab-req${coinMet ? '' : ' unmet'}" title="Credits"><span class="lab-req-cash">$</span><span class="lab-req-amt">${fmtCompact(upgradeCost.coins)}</span></span>`;
  for (const [r, n] of Object.entries(upgradeCost.reqs)) {
    const met = (state.resources[r] || 0) >= n;
    html += `<span class="lab-req${met ? '' : ' unmet'}" title="${RESOURCE_DEFS[r]?.label || r}">${resourceIconHtml(r, 16)}<span class="lab-req-amt">${fmtCompact(n)}</span></span>`;
  }
  return html;
}

function buildPowerConsumerListHtml(linkedStorages, linkedTurrets) {
  const consumers = [
    ...linkedStorages.map((storage) => ({
      kind: 'module',
      id: storage.id,
      name: storage.name,
      label: getModuleLabel(storage).toUpperCase(),
      usage: getStoragePowerUsage(storage),
      color: '#8ff0c4',
    })),
    ...linkedTurrets.map((turret) => ({
      kind: 'turret',
      id: turret.id,
      name: turret.name || getCraft('turrets', turret.type)?.name || 'Turret',
      label: getCraft('turrets', turret.type)?.name?.toUpperCase() || 'TURRET',
      usage: turret.powerUsage || 0,
      color: '#ffe066',
    })),
  ].sort((a, b) => b.usage - a.usage || a.name.localeCompare(b.name));

  if (!consumers.length) return '<div class="module-empty-note">No linked consumers drawing power.</div>';
  return consumers.map((consumer) => `
    <div class="ps-consumer-row">
      <button type="button" class="ps-consumer-btn" style="color:${consumer.color};border-color:${consumer.color}55;" onclick="focusPowerNetworkTarget('${consumer.kind}', ${consumer.id})">${escapeHtml(consumer.name)}</button>
      <span class="ps-consumer-label">${escapeHtml(consumer.label)}</span>
      <span class="ps-consumer-usage">${consumer.usage.toFixed(1).replace(/\.0$/, '')}/s</span>
    </div>
  `).join('');
}

function buildStorageInventoryGridHtml(module, query = '', sort = 'amount') {
  const q = String(query || '').trim().toLowerCase();
  let rows = Object.entries(module.inventory || {})
    .filter(([type, amt]) => (amt || 0) > 0 && RESOURCE_DEFS[type] && !RESOURCE_DEFS[type].special);
  if (q) {
    rows = rows.filter(([type]) => {
      const label = (RESOURCE_DEFS[type]?.label || type).toLowerCase();
      const tier = Object.entries(MINE_TIERS).find(([, t]) => t.resources?.includes(type))?.[0] || '';
      return label.includes(q) || type.toLowerCase().includes(q) || `t${tier}` === q || tier === q;
    });
  }
  if (sort === 'name') {
    rows.sort((a, b) => (RESOURCE_DEFS[a[0]]?.label || a[0]).localeCompare(RESOURCE_DEFS[b[0]]?.label || b[0]));
  } else {
    rows.sort((a, b) => b[1] - a[1]);
  }
  if (!rows.length) {
    return q
      ? `<div class="module-empty-note">No resources match “${escapeHtml(query)}”.</div>`
      : '<div class="module-empty-note">Inventory empty.<br>Assign ships to deposit here.</div>';
  }
  return rows.map(([type, amt]) => {
    const def = RESOURCE_DEFS[type];
    const label = def?.label || type;
    const color = def?.color || '#cde';
    const tier = Object.entries(MINE_TIERS).find(([, t]) => t.resources?.includes(type))?.[0] || '';
    const tip = `${escapeHtml(label)}${tier ? ` · Tier ${tier}` : ''}<br><span style="color:#ffe066;">${fmt(amt)}</span> stored`;
    return `<div class="st-inv-cell" data-tippy-content="${tip.replace(/"/g, '&quot;')}" style="--st-cell-accent:${color};">
      <div class="st-inv-icon">${resourceIconHtml(type, 34)}</div>
      <div class="st-inv-amt">${fmt(amt)}</div>
      <div class="st-inv-name" style="color:${color};">${escapeHtml(label)}</div>
      ${tier ? `<div class="st-inv-tier">T${tier}</div>` : ''}
    </div>`;
  }).join('');
}

function buildPowerStationFuelStoresHtml(module, activeFuelType) {
  const rows = Object.entries(module.inventory || {})
    .filter(([type, amt]) => amt > 0 && RESOURCE_DEFS[type] && !RESOURCE_DEFS[type].special)
    .sort((a, b) => b[1] - a[1]);
  if (!rows.length) return '<div class="module-empty-note">No fuel stored yet.<br>Deliver resources via ships.</div>';
  return rows.map(([type, amt]) => {
    const def = RESOURCE_DEFS[type];
    const active = type === activeFuelType;
    return `<div class="lab-res-row${active ? ' used-in' : ''}" style="color:${def?.color || '#cde'};">
      ${resourceIconHtml(type, 16)}
      <span class="lab-res-name">${def?.label || type}</span>
      <span class="lab-res-count">${fmt(amt)}</span>
      <span class="lab-res-badge${active ? ' in-use' : ''}">${active ? 'FUEL' : ''}</span>
    </div>`;
  }).join('');
}

function getDroneStatusMeta(drone) {
  const isScanning = drone.status === 'scanning';
  const isFlying = drone.status === 'flying';
  const isReturning = drone.status === 'returning';
  const isLaunching = drone.status === 'idle' && drone.taskNodeId !== null;
  if (isScanning) return { key: 'scanning', label: 'SCANNING', color: '#40ffcc' };
  if (isFlying) return { key: 'flying', label: 'EN ROUTE', color: '#4ab8ff' };
  if (isReturning) return { key: 'returning', label: 'RETURNING', color: '#c98cff' };
  if (isLaunching) return { key: 'launching', label: 'LAUNCHING', color: '#ffe066' };
  return { key: 'idle', label: 'IDLE', color: '#6a8aaa' };
}

/** Task theme accents for drone bay rows (extend as new task types land). */
const DRONE_TASK_THEMES = {
  crashed_ship: { key: 'ship', label: 'Crashed Ship', accent: '#8a9aaa' },
  ship: { key: 'ship', label: 'Crashed Ship', accent: '#8a9aaa' },
  relic: { key: 'relic', label: 'Relic', accent: '#c98cff' },
  anomaly: { key: 'anomaly', label: 'Anomaly', accent: '#ffe066' },
};

function getDroneTaskTheme(drone) {
  const node = Number.isFinite(drone?.taskNodeId)
    ? (state.nodes || []).find((n) => n.id === drone.taskNodeId)
    : null;
  const type = drone?.taskType || node?.type || '';
  if (DRONE_TASK_THEMES[type]) return DRONE_TASK_THEMES[type];
  if (type === 'crashed_ship' || node?.type === 'crashed_ship') return DRONE_TASK_THEMES.crashed_ship;
  if (!type) return { key: 'idle', label: 'Standby', accent: '#5af0ff' };
  return { key: 'unknown', label: String(type).replace(/_/g, ' '), accent: '#5af0ff' };
}

function getDroneTargetMeta(drone) {
  const theme = getDroneTaskTheme(drone);
  const node = Number.isFinite(drone?.taskNodeId)
    ? (state.nodes || []).find((n) => n.id === drone.taskNodeId)
    : null;
  if (theme.key === 'ship' || drone?.taskType === 'crashed_ship' || node?.type === 'crashed_ship') {
    return {
      label: theme.label,
      theme,
      iconHtml: '<img class="dl-target-img" src="assets/images/crashed_ships/crashed_ship_1.png" alt="">',
    };
  }
  if (theme.key === 'relic') {
    return {
      label: theme.label,
      theme,
      iconHtml: '<span class="ms-icon ms-icon-md ms-icon-fill" aria-hidden="true">diamond</span>',
    };
  }
  if (theme.key === 'anomaly') {
    return {
      label: theme.label,
      theme,
      iconHtml: '<span class="ms-icon ms-icon-md ms-icon-fill" aria-hidden="true">blur_on</span>',
    };
  }
  if (node) {
    return {
      label: node.name || theme.label || node.type || 'Target',
      theme,
      iconHtml: '<span class="ms-icon ms-icon-md" aria-hidden="true">travel_explore</span>',
    };
  }
  if (drone?.taskType) {
    return {
      label: theme.label,
      theme,
      iconHtml: '<span class="ms-icon ms-icon-md" aria-hidden="true">travel_explore</span>',
    };
  }
  return {
    label: 'Standby',
    theme,
    iconHtml: '<span class="ms-icon ms-icon-md" aria-hidden="true">drone</span>',
  };
}

function getDroneProgressPct(drone) {
  if (!drone) return 0;
  if (Number.isFinite(drone.scanProgress)) return Math.max(0, Math.min(100, drone.scanProgress * 100));
  if (drone.status === 'scanning' && Number.isFinite(drone.scanTimer) && Number.isFinite(drone.scanDuration) && drone.scanDuration > 0) {
    return Math.max(0, Math.min(100, (1 - drone.scanTimer / drone.scanDuration) * 100));
  }
  if (drone.status === 'flying' && Number.isFinite(drone.flightTotalDist) && drone.flightTotalDist > 0) {
    const remaining = Math.hypot((drone.destX || 0) - (drone.x || 0), (drone.destY || 0) - (drone.y || 0));
    return Math.max(0, Math.min(100, (1 - remaining / drone.flightTotalDist) * 100));
  }
  if (drone.status === 'returning') return 100;
  if (drone.status === 'scanning') return 35;
  if (drone.status === 'flying') return 15;
  if (drone.status === 'idle' && drone.taskNodeId != null) return 5;
  return 0;
}

function getDroneFindHtml(drone) {
  const find = drone?.find || drone?.loot || null;
  if (!find) {
    return `<div class="dl-find empty" data-tippy-content="Salvage find appears here when recovered">
      <span class="ms-icon ms-icon-sm" aria-hidden="true">inventory_2</span>
    </div>`;
  }
  if (typeof find === 'string' && RESOURCE_DEFS[find]) {
    const def = RESOURCE_DEFS[find];
    return `<div class="dl-find" data-tippy-content="Recovered ${escapeHtml(def.label)}" style="--dl-find-accent:${def.color || '#5af0ff'};">
      ${resourceIconHtml(find, 22)}
    </div>`;
  }
  if (find?.type && RESOURCE_DEFS[find.type]) {
    const def = RESOURCE_DEFS[find.type];
    const amt = find.amount > 0 ? ` ×${fmt(find.amount)}` : '';
    return `<div class="dl-find" data-tippy-content="Recovered ${escapeHtml(def.label)}${amt}" style="--dl-find-accent:${def.color || '#5af0ff'};">
      ${resourceIconHtml(find.type, 22)}
    </div>`;
  }
  return `<div class="dl-find" data-tippy-content="${escapeHtml(find?.name || 'Salvage recovered')}">
    <span class="ms-icon ms-icon-sm ms-icon-fill" aria-hidden="true">star</span>
  </div>`;
}

function buildDroneBayListHtml(module) {
  const drones = getDronesForLab(module.id).slice().sort((a, b) => a.id - b.id);
  const capacity = Math.max(0, module.droneCapacity || 2);
  const rows = [];
  for (let i = 0; i < capacity; i++) {
    const drone = drones[i];
    if (!drone) {
      rows.push(`<div class="dl-drone-row empty">
        <div class="dl-drone-icon"><span class="ms-icon ms-icon-md" aria-hidden="true">drone</span></div>
        <div class="dl-drone-body">
          <div class="dl-drone-top">
            <div class="dl-drone-name"><span class="ms-icon ms-icon-sm dl-name-icon" aria-hidden="true">drone_2</span>Bay ${i + 1}</div>
            <div class="dl-drone-status idle">EMPTY</div>
          </div>
          <div class="dl-drone-task">Empty pad — craft a drone to deploy</div>
          <div class="dl-progress-track"><div class="dl-progress-bar" style="width:0%"></div></div>
        </div>
        <div class="dl-find empty"><span class="ms-icon ms-icon-sm" aria-hidden="true">inventory_2</span></div>
      </div>`);
      continue;
    }
    const meta = getDroneStatusMeta(drone);
    const target = getDroneTargetMeta(drone);
    const theme = target.theme || getDroneTaskTheme(drone);
    const taskText = getDroneStatusText(drone);
    const progress = getDroneProgressPct(drone);
    const accent = theme.accent || '#5af0ff';
    rows.push(`<div class="dl-drone-row clickable task-${theme.key} ${meta.key}" style="--dl-task-accent:${accent};" role="button" tabindex="0" onclick="focusDrone(${drone.id})" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();focusDrone(${drone.id});}" data-tippy-content="Focus camera on ${escapeHtml(drone.name || `Drone #${drone.id}`)}">
      <div class="dl-drone-icon" data-tippy-content="${escapeHtml(target.label)}">${target.iconHtml}</div>
      <div class="dl-drone-body">
        <div class="dl-drone-top">
          <div class="dl-drone-name"><span class="ms-icon ms-icon-sm dl-name-icon" aria-hidden="true">drone_2</span>${escapeHtml(drone.name || `Drone #${drone.id}`)}</div>
          <div class="dl-drone-status ${meta.key}" style="color:${meta.color};border-color:${meta.color}55;">${meta.label}</div>
        </div>
        <div class="dl-drone-task" style="color:${meta.color};">${escapeHtml(taskText)}</div>
        <div class="dl-progress-track" data-tippy-content="Mission progress ${Math.round(progress)}%">
          <div class="dl-progress-bar ${meta.key}" style="width:${progress.toFixed(1)}%;background:linear-gradient(90deg,${meta.color}88,${meta.color});"></div>
        </div>
      </div>
      ${getDroneFindHtml(drone)}
    </div>`);
  }
  if (!rows.length) {
    return '<div class="module-empty-note">No drone bays available.</div>';
  }
  return rows.join('');
}

window.filterStorageInventory = function(moduleId) {
  const modal = getStorageModalWindow(moduleId);
  const module = getModuleById(moduleId);
  if (!modal || !module) return;
  const searchEl = modal.querySelector('#st-inv-search');
  const sortEl = modal.querySelector('#st-inv-sort');
  const list = modal.querySelector('#storage-inventory-list');
  if (!list) return;
  hideAllTippies();
  const query = searchEl?.value || '';
  const sort = sortEl?.value || 'amount';
  const invSig = `${sort}|${query}|${Object.entries(module.inventory || {}).filter(([, n]) => (n || 0) > 0).map(([t, n]) => `${t}:${Math.floor(n)}`).sort().join(',')}`;
  list.dataset.invSig = invSig;
  setHtmlDestroyingTippies(list, buildStorageInventoryGridHtml(module, query, sort));
  bindTippyIn(list);
};

window.focusPowerNetworkTarget = function(kind, id) {
  if (kind === 'turret') {
    const turret = state.turrets.find((entry) => entry.id === id);
    if (!turret) return;
    const pos = gridToWorld(turret.col, turret.row);
    focusOn(pos.x, pos.y + 16, cam.zoom);
    if (window.openTurretModal) window.openTurretModal(id);
    return;
  }
  const module = state.modules.find((entry) => entry.id === id);
  if (!module) return;
  const pos = gridToWorld(module.col, module.row);
  focusOn(pos.x, pos.y, cam.zoom);
  openStorageModal(id);
};

window.focusDrone = function(droneId) {
  const drone = (state.drones || []).find((d) => d.id === droneId);
  if (!drone || !Number.isFinite(drone.x) || !Number.isFinite(drone.y)) return;
  hideAllTippies();
  focusOn(drone.x, drone.y, Math.max(cam.zoom, 1.15));
};

export function renderModuleModal(moduleId = state.selectedModule, modalRoot = null) {
  const module = getModuleById(moduleId);
  const modal = modalRoot || getStorageModalWindow(moduleId);
  const body = modal?.querySelector('.storage-modal-body');
  const title = modal?.querySelector('.storage-modal-title');
  if (!module || !body || !modal) return;
  const moduleDef = getModuleDef(module.type);
  const summaryRows = moduleDef.summary(module);
  const buyPowerCost = isPoweredBuildingModule(module) ? getModuleUpgradeCost(module).coins * 5 : 0;
  const moduleTier = Math.max(1, Math.min(10, module.level || 1));
  const tierColor = MINE_TIERS[moduleTier]?.color || '#8ab';
  if (title) title.textContent = moduleDef.panelTitle;
  applyModuleModalChrome(modal, module);

  if (isStorageModule(module)) {
    body.innerHTML = `
      <div class="lab-layout st-layout" data-module-id="${module.id}">
        <div class="lab-hero">
          <div class="lab-hero-left">
            <div class="lab-hero-name-row">
              <span id="storage-modal-name" class="storage-modal-name lab-hero-name"></span>
              <button onclick="openStorageRenameOverlay(${module.id})" title="Rename Module" class="storage-modal-rename-btn">✎</button>
              <div id="module-operational-banner" class="lab-status-pill">ONLINE</div>
            </div>
            <div class="lab-meter">
              <div class="lab-meter-head">
                <span class="lab-meter-label">Health</span>
                <span id="storage-health-value" class="lab-meter-value"></span>
              </div>
              <div class="lab-meter-track"><div id="storage-health-bar" class="lab-meter-bar"></div></div>
            </div>
          </div>
          <div id="storage-tier-pill" class="lab-tier-badge"></div>
        </div>

        ${moduleTabsHtml([
          { id: 'details', label: 'DETAILS', icon: 'circles' },
          { id: 'network', label: 'NETWORK', icon: 'hub' },
        ])}
        <div class="mod-tab-body">
          <div class="mod-tab-pane on" data-pane="details">
            <div class="mod-details-grid st-details-grid">
              <div class="st-left-col">
                <div class="sm-info-block sm-info-block-fill">
                  <div class="blk-title">◈ POWER</div>
                  <div class="lab-power-block">
                    <div class="lab-meter-head">
                      <span class="lab-meter-label"><span class="lab-power-icon">ϟ</span>Power</span>
                      <span id="storage-power-value" class="lab-meter-value"></span>
                    </div>
                    <div class="lab-power-meta">
                      <span data-tippy-content="Power usage">Usage <strong id="storage-power-usage"></strong></span>
                      <span>Capacity</span>
                    </div>
                    <div class="lab-meter-track"><div id="storage-power-bar" class="lab-meter-bar lab-meter-bar-power"></div></div>
                    <div id="storage-no-power-warning" class="storage-no-power-warning" style="display:none;margin-top:8px;">WARNING: NO POWER</div>
                    <button id="storage-buy-power-btn" class="btn primary module-btn-medium" style="display:none;margin-top:8px;" onclick="buyStoragePower(${module.id})">BUY POWER</button>
                  </div>
                  <div class="lab-power-block">
                    <div class="lab-meter-head">
                      <span class="lab-meter-label">Storage Used</span>
                      <span id="storage-used-value" class="lab-meter-value"></span>
                    </div>
                    <div class="lab-meter-track"><div id="storage-used-bar" class="lab-meter-bar" style="background:linear-gradient(90deg,#1a6aff,#48f);"></div></div>
                  </div>
                </div>
                <div class="sm-info-block sm-info-block-fill">
                  <div class="blk-title">◈ SYSTEMS</div>
                  ${infoRowHtml('STATUS', 'st-status-value', 'ONLINE', 'green')}
                  ${infoRowHtml('FILL', 'st-fill-value', '0%')}
                </div>
              </div>
              <div class="sm-info-block sm-info-block-fill st-inv-col">
                <div class="blk-title">◈ INVENTORY <span class="blk-sub" id="st-inv-count">0 types</span></div>
                <div class="st-inv-toolbar">
                  <input id="st-inv-search" class="st-inv-search" type="search" placeholder="Search resources…" value="" oninput="filterStorageInventory(${module.id})" onmousedown="event.stopPropagation()" onclick="event.stopPropagation()">
                  <select id="st-inv-sort" class="st-inv-sort" onchange="filterStorageInventory(${module.id})" onmousedown="event.stopPropagation()">
                    <option value="amount">Qty ↓</option>
                    <option value="name">Name</option>
                  </select>
                </div>
                <div id="storage-inventory-list" class="st-inv-grid"></div>
              </div>
            </div>
          </div>
          <div class="mod-tab-pane" data-pane="network">${networkPanelHtml()}</div>
        </div>

        <div class="lab-footer">
          <div class="lab-actions">
            <button id="storage-upgrade-btn" class="btn primary" type="button" onclick="openModuleUpgradeOverlay(${module.id})">UPGRADE</button>
            <button class="btn module-btn-move" type="button" onclick="startMoveStorage(${module.id})">MOVE</button>
            <button class="btn module-btn-rename" type="button" onclick="openStorageRenameOverlay(${module.id})">RENAME</button>
            <button class="btn danger" type="button" onclick="confirmSellStorage(${module.id})">SELL</button>
          </div>
        </div>
        <div id="storage-upgrade-reqs" style="display:none;"></div>
      </div>`;
    patchModuleModal(moduleId, modal);
    return;
  }

  if (isDroneLabModule(module)) {
    body.innerHTML = `
      <div class="lab-layout dl-layout" data-module-id="${module.id}">
        <div class="lab-hero">
          <div class="lab-hero-left">
            <div class="lab-hero-name-row">
              <span id="storage-modal-name" class="storage-modal-name lab-hero-name"></span>
              <button onclick="openStorageRenameOverlay(${module.id})" title="Rename Module" class="storage-modal-rename-btn">✎</button>
              <div id="module-operational-banner" class="lab-status-pill">ONLINE</div>
            </div>
            <div class="lab-meter">
              <div class="lab-meter-head">
                <span class="lab-meter-label">Health</span>
                <span id="storage-health-value" class="lab-meter-value"></span>
              </div>
              <div class="lab-meter-track"><div id="storage-health-bar" class="lab-meter-bar"></div></div>
            </div>
          </div>
          <div id="storage-tier-pill" class="lab-tier-badge"></div>
        </div>

        ${moduleTabsHtml([
          { id: 'details', label: 'DETAILS', icon: 'circles' },
          { id: 'network', label: 'NETWORK', icon: 'hub' },
        ])}
        <div class="mod-tab-body">
          <div class="mod-tab-pane on" data-pane="details">
            <div class="mod-details-grid dl-details-grid">
              <div class="dl-left-col">
                <div class="sm-info-block sm-info-block-fill">
                  <div class="blk-title">◈ POWER</div>
                  <div class="lab-power-block">
                    <div class="lab-meter-head">
                      <span class="lab-meter-label"><span class="lab-power-icon">ϟ</span>Power Grid</span>
                      <span id="storage-power-value" class="lab-meter-value"></span>
                    </div>
                    <div class="lab-power-meta">
                      <span data-tippy-content="Power usage scales with drone count: 1/s per drone deployed.">Usage <strong id="storage-power-usage"></strong></span>
                      <span>Capacity</span>
                    </div>
                    <div class="lab-meter-track"><div id="storage-power-bar" class="lab-meter-bar lab-meter-bar-power"></div></div>
                    <div id="storage-no-power-warning" class="storage-no-power-warning" style="display:none;margin-top:8px;">WARNING: NO POWER</div>
                    <button id="storage-buy-power-btn" class="btn primary module-btn-medium" style="display:none;margin-top:8px;" onclick="buyStoragePower(${module.id})">BUY POWER</button>
                  </div>
                  <div class="lab-power-block">
                    <div class="lab-meter-head">
                      <span class="lab-meter-label">Drone Bay</span>
                      <span id="storage-used-value" class="lab-meter-value"></span>
                    </div>
                    <div class="lab-meter-track"><div id="storage-used-bar" class="lab-meter-bar" style="background:linear-gradient(90deg,#0a6a80,#5af0ff);"></div></div>
                  </div>
                </div>
                <div class="sm-info-block sm-info-block-fill">
                  <div class="blk-title">◈ SYSTEMS</div>
                  ${infoRowHtml('STATUS', 'dl-status-value', 'ONLINE', 'green')}
                  ${infoRowHtml('ACTIVE', 'dl-active-value', '0 / 0', 'blue')}
                </div>
              </div>
              <div class="sm-info-block sm-info-block-fill dl-bay-col">
                <div class="blk-title">◈ DRONE BAY <span class="blk-sub" id="dl-bay-count">0 active</span></div>
                <div id="drone-bay-status-list" class="dl-drone-list"></div>
              </div>
            </div>
          </div>
          <div class="mod-tab-pane" data-pane="network">${networkPanelHtml()}</div>
        </div>

        <div class="lab-footer">
          <div class="lab-actions">
            <button id="storage-upgrade-btn" class="btn primary" type="button" onclick="openModuleUpgradeOverlay(${module.id})">UPGRADE</button>
            <button class="btn module-btn-move" type="button" onclick="startMoveStorage(${module.id})">MOVE</button>
            <button class="btn module-btn-rename" type="button" onclick="openStorageRenameOverlay(${module.id})">RENAME</button>
            <button class="btn danger" type="button" onclick="confirmSellStorage(${module.id})">SELL</button>
          </div>
        </div>
        <div id="storage-upgrade-reqs" style="display:none;"></div>
      </div>`;
    patchModuleModal(moduleId, modal);
    return;
  }

  if (isPowerStationModule(module)) {
    body.innerHTML = `
      <div class="lab-layout ps-layout" data-module-id="${module.id}">
        <div class="lab-hero">
          <div class="lab-hero-left">
            <div class="lab-hero-name-row">
              <span id="storage-modal-name" class="storage-modal-name lab-hero-name"></span>
              <button onclick="openStorageRenameOverlay(${module.id})" title="Rename Module" class="storage-modal-rename-btn">✎</button>
              <div id="module-operational-banner" class="lab-status-pill">ONLINE</div>
            </div>
            <div class="lab-meter">
              <div class="lab-meter-head">
                <span class="lab-meter-label">Health</span>
                <span id="storage-health-value" class="lab-meter-value"></span>
              </div>
              <div class="lab-meter-track"><div id="storage-health-bar" class="lab-meter-bar"></div></div>
            </div>
          </div>
          <div id="storage-tier-pill" class="lab-tier-badge"></div>
        </div>

        <div id="power-station-no-fuel-warning" class="storage-no-power-warning" style="display:none;">WARNING: NO FUEL</div>
        <div id="power-station-deficit-warning" class="storage-no-power-warning" style="display:none;">WARNING: POWER DEFICIT</div>

        ${moduleTabsHtml([
          { id: 'details', label: 'DETAILS', icon: 'circles' },
          { id: 'network', label: 'NETWORK', icon: 'hub' },
        ])}
        <div class="mod-tab-body">
          <div class="mod-tab-pane on" data-pane="details">
            <div class="mod-details-grid ps-details-grid">
              <div class="sm-info-block sm-info-block-fill ps-output-col">
                <div class="blk-title">◈ FUEL &amp; OUTPUT</div>
                <div class="ps-fuel-select-row">
                  <span class="lab-meter-label"><span class="lab-power-icon">ϟ</span>Power Source</span>
                  <button type="button" id="power-station-fuel-btn" class="ps-fuel-btn" onclick="openFuelPickerOverlay(${module.id})">
                    <span id="power-station-fuel-btn-icon" class="ps-fuel-btn-icon"></span>
                    <span id="power-station-fuel-btn-label" class="ps-fuel-btn-label">Iron</span>
                    <span class="ps-fuel-btn-chevron">▾</span>
                  </button>
                </div>
                <div class="ps-dash" id="power-station-dash">
                  <div class="ps-dash-section">
                    <div class="ps-dash-head">
                      <span class="ps-dash-title">Fuel flow</span>
                      <span id="ps-fuel-balance-pill" class="ps-balance-pill">—</span>
                    </div>
                    <div class="ps-dash-row" id="ps-row-import" data-tippy-content="">
                      <span class="ps-dash-label">Import</span>
                      <div class="ps-dash-track"><div id="ps-bar-import" class="ps-dash-bar ps-bar-import"></div></div>
                      <span id="ps-val-import" class="ps-dash-val">0/m</span>
                    </div>
                    <div class="ps-dash-row" id="ps-row-burn" data-tippy-content="">
                      <span class="ps-dash-label">Burn</span>
                      <div class="ps-dash-track"><div id="ps-bar-burn" class="ps-dash-bar ps-bar-burn"></div></div>
                      <span id="ps-val-burn" class="ps-dash-val">0/m</span>
                    </div>
                    <div class="ps-dash-note" id="ps-fuel-note"></div>
                  </div>
                  <div class="ps-dash-section">
                    <div class="ps-dash-head">
                      <span class="ps-dash-title">Power grid</span>
                      <span id="ps-power-balance-pill" class="ps-balance-pill">—</span>
                    </div>
                    <div class="ps-dash-row" id="ps-row-output" data-tippy-content="">
                      <span class="ps-dash-label">Output</span>
                      <div class="ps-dash-track"><div id="ps-bar-output" class="ps-dash-bar ps-bar-output"></div></div>
                      <span id="ps-val-output" class="ps-dash-val">0/s</span>
                    </div>
                    <div class="ps-dash-row" id="ps-row-load" data-tippy-content="">
                      <span class="ps-dash-label">Load</span>
                      <div class="ps-dash-track"><div id="ps-bar-load" class="ps-dash-bar ps-bar-load"></div></div>
                      <span id="ps-val-load" class="ps-dash-val">0/s</span>
                    </div>
                    <div class="ps-dash-note" id="ps-power-note"></div>
                  </div>
                </div>
              </div>
              <div class="ps-fuel-col">
                <div class="sm-info-block sm-info-block-fill">
                  <div class="blk-title">◈ FUEL STORES</div>
                  <div class="ps-active-fuel">
                    <div class="ps-active-fuel-head">
                      <span class="ps-active-fuel-title">
                        <span id="power-station-used-icon" class="ps-active-fuel-icon"></span>
                        <span id="power-station-used-label">Active Fuel</span>
                      </span>
                      <span id="power-station-used-value" class="lab-meter-value"></span>
                    </div>
                    <div class="lab-meter-track"><div id="power-station-used-bar" class="lab-meter-bar ps-fuel-bar"></div></div>
                  </div>
                  <div id="storage-inventory-list" class="lab-res-list ps-fuel-stores"></div>
                </div>
                <div class="sm-info-block sm-info-block-fill">
                  <div class="blk-title">◈ CONSUMERS</div>
                  <div id="power-station-network-consumers" class="ps-consumer-list"></div>
                </div>
              </div>
            </div>
          </div>
          <div class="mod-tab-pane" data-pane="network">${networkPanelHtml()}</div>
        </div>

        <div class="lab-footer">
          <div class="lab-actions">
            <button id="storage-upgrade-btn" class="btn primary" type="button" onclick="openModuleUpgradeOverlay(${module.id})">UPGRADE</button>
            <button class="btn module-btn-move" type="button" onclick="startMoveStorage(${module.id})">MOVE</button>
            <button class="btn module-btn-rename" type="button" onclick="openStorageRenameOverlay(${module.id})">RENAME</button>
            <button class="btn danger" type="button" onclick="confirmSellStorage(${module.id})">SELL</button>
          </div>
        </div>
        <div id="storage-upgrade-reqs" style="display:none;"></div>
      </div>`;
    patchModuleModal(moduleId, modal);
    return;
  }

  if (isLabTowerModule(module)) {
    body.innerHTML = `
      <div class="lab-layout lt-layout" data-module-id="${module.id}">
        <div class="lab-hero">
          <div class="lab-hero-left">
            <div class="lab-hero-name-row">
              <span id="storage-modal-name" class="storage-modal-name lab-hero-name"></span>
              <button onclick="openStorageRenameOverlay(${module.id})" title="Rename Module" class="storage-modal-rename-btn">✎</button>
              <div id="module-operational-banner" class="lab-status-pill">ONLINE</div>
            </div>
            <div class="lab-meter">
              <div class="lab-meter-head">
                <span class="lab-meter-label">Health</span>
                <span id="storage-health-value" class="lab-meter-value"></span>
              </div>
              <div class="lab-meter-track"><div id="storage-health-bar" class="lab-meter-bar"></div></div>
            </div>
          </div>
          <div id="storage-tier-pill" class="lab-tier-badge"></div>
        </div>

        ${moduleTabsHtml([
          { id: 'details', label: 'DETAILS', icon: 'circles' },
          { id: 'network', label: 'NETWORK', icon: 'hub' },
        ])}
        <div class="mod-tab-body">
          <div class="mod-tab-pane on" data-pane="details">
            <div class="mod-details-grid lt-details-grid">
              <div class="lt-left-col">
                <div class="sm-info-block sm-info-block-fill">
                  <div class="blk-title">◈ LAB RELAY</div>
                  ${infoRowHtml('STATUS', 'lt-status-value', 'ONLINE', 'green')}
                  ${infoRowHtml('RELAY RANGE', 'relay-range-value', '0 TILES')}
                  ${infoRowHtml('NODE TIER', 'lt-node-tier', `T${module.level || 1}`)}
                  ${infoRowHtml('LINKED NODES', 'lt-node-count', '0')}
                </div>
                <div class="sm-info-block sm-info-block-fill">
                  <div class="blk-title">◈ COVERAGE</div>
                  <div class="pp-coverage-row">
                    <span class="pp-coverage-label">RANGE</span>
                    <span id="relay-range-blocks" class="pp-range-blocks lt-range-blocks"></span>
                  </div>
                  <div class="lt-range-note" id="lt-range-note">Links matching-tier resource nodes in range.</div>
                </div>
              </div>
              <div class="sm-info-block sm-info-block-fill lt-res-col">
                <div class="blk-title">◈ LINKED RESOURCES <span class="blk-sub" id="lt-res-count">in range</span></div>
                <div id="lab-linked-resources" class="lab-res-list lt-res-list"></div>
              </div>
            </div>
          </div>
          <div class="mod-tab-pane" data-pane="network">${networkPanelHtml()}</div>
        </div>

        <div class="lab-footer">
          <div class="lab-actions">
            <button id="storage-upgrade-btn" class="btn primary" type="button" onclick="openModuleUpgradeOverlay(${module.id})">UPGRADE</button>
            <button class="btn module-btn-move" type="button" onclick="startMoveStorage(${module.id})">MOVE</button>
            <button class="btn module-btn-rename" type="button" onclick="openStorageRenameOverlay(${module.id})">RENAME</button>
            <button class="btn danger" type="button" onclick="confirmSellStorage(${module.id})">SELL</button>
          </div>
        </div>
        <div id="storage-upgrade-reqs" style="display:none;"></div>
      </div>`;
    patchModuleModal(moduleId, modal);
    return;
  }

  if (isPowerPoleModule(module)) {
    body.innerHTML = `
      <div class="lab-layout pp-layout" data-module-id="${module.id}">
        <div class="lab-hero">
          <div class="lab-hero-left">
            <div class="lab-hero-name-row">
              <span id="storage-modal-name" class="storage-modal-name lab-hero-name"></span>
              <button onclick="openStorageRenameOverlay(${module.id})" title="Rename Module" class="storage-modal-rename-btn">✎</button>
              <div id="module-operational-banner" class="lab-status-pill">ONLINE</div>
            </div>
            <div class="lab-meter">
              <div class="lab-meter-head">
                <span class="lab-meter-label">Health</span>
                <span id="storage-health-value" class="lab-meter-value"></span>
              </div>
              <div class="lab-meter-track"><div id="storage-health-bar" class="lab-meter-bar"></div></div>
            </div>
          </div>
          <div id="storage-tier-pill" class="lab-tier-badge"></div>
        </div>

        <div id="power-station-no-fuel-warning" class="storage-no-power-warning" style="display:none;">WARNING: NO FUEL ON NETWORK</div>

        ${moduleTabsHtml([
          { id: 'details', label: 'DETAILS', icon: 'circles' },
          { id: 'network', label: 'NETWORK', icon: 'hub' },
        ])}
        <div class="mod-tab-body">
          <div class="mod-tab-pane on" data-pane="details">
            <div class="mod-details-grid pp-details-grid">
              <div class="pp-left-col">
                <div class="sm-info-block sm-info-block-fill">
                  <div class="blk-title">◈ RELAY</div>
                  ${infoRowHtml('STATUS', 'pp-status-value', 'ONLINE', 'green')}
                  ${infoRowHtml('RELAY RANGE', 'relay-range-value', '0 TILES')}
                </div>
                <div class="sm-info-block sm-info-block-fill">
                  <div class="blk-title">◈ COVERAGE</div>
                  <div class="pp-coverage-row">
                    <span class="pp-coverage-label">RANGE</span>
                    <span id="relay-range-blocks" class="pp-range-blocks"></span>
                  </div>
                </div>
                <div class="sm-info-block sm-info-block-fill">
                  <div class="blk-title">◈ POWER LOAD <span class="blk-sub" id="pp-balance-pill">—</span></div>
                  <div class="ps-dash" id="power-pole-dash">
                    <div class="ps-dash-section">
                      <div class="ps-dash-row" id="pp-row-output" data-tippy-content="">
                        <span class="ps-dash-label">Output</span>
                        <div class="ps-dash-track"><div id="pp-bar-output" class="ps-dash-bar ps-bar-output"></div></div>
                        <span id="pp-val-output" class="ps-dash-val">0/s</span>
                      </div>
                      <div class="ps-dash-row" id="pp-row-load" data-tippy-content="">
                        <span class="ps-dash-label">Load</span>
                        <div class="ps-dash-track"><div id="pp-bar-load" class="ps-dash-bar ps-bar-load"></div></div>
                        <span id="pp-val-load" class="ps-dash-val">0/s</span>
                      </div>
                      <div class="ps-dash-note" id="pp-power-note"></div>
                    </div>
                  </div>
                </div>
              </div>
              <div class="sm-info-block sm-info-block-fill pp-consumers-col">
                <div class="blk-title">◈ CONSUMERS <span class="blk-sub" id="pp-consumer-count">drawing power</span></div>
                <div id="power-station-network-consumers" class="ps-consumer-list"></div>
              </div>
            </div>
          </div>
          <div class="mod-tab-pane" data-pane="network">${networkPanelHtml()}</div>
        </div>

        <div class="lab-footer">
          <div class="lab-actions">
            <button id="storage-upgrade-btn" class="btn primary" type="button" onclick="openModuleUpgradeOverlay(${module.id})">UPGRADE</button>
            <button class="btn module-btn-move" type="button" onclick="startMoveStorage(${module.id})">MOVE</button>
            <button class="btn module-btn-rename" type="button" onclick="openStorageRenameOverlay(${module.id})">RENAME</button>
            <button class="btn danger" type="button" onclick="confirmSellStorage(${module.id})">SELL</button>
          </div>
        </div>
        <div id="storage-upgrade-reqs" style="display:none;"></div>
      </div>`;
    patchModuleModal(moduleId, modal);
    return;
  }

  if (isResearchLabModule(module)) {
    module.synthesisSlots = normalizeSynthesisSlots(module.synthesisSlots);
    body.innerHTML = `
      <div class="lab-layout rl-layout" data-module-id="${module.id}">
        <div class="lab-hero">
          <div class="lab-hero-left">
            <div class="lab-hero-name-row">
              <span id="storage-modal-name" class="storage-modal-name lab-hero-name"></span>
              <button onclick="openStorageRenameOverlay(${module.id})" title="Rename Module" class="storage-modal-rename-btn">✎</button>
              <div id="module-operational-banner" class="lab-status-pill">ONLINE</div>
            </div>
            <div class="lab-meter">
              <div class="lab-meter-head">
                <span class="lab-meter-label">Health</span>
                <span id="storage-health-value" class="lab-meter-value"></span>
              </div>
              <div class="lab-meter-track"><div id="storage-health-bar" class="lab-meter-bar"></div></div>
            </div>
          </div>
          <div id="storage-tier-pill" class="lab-tier-badge"></div>
        </div>

        ${moduleTabsHtml([
          { id: 'details', label: 'DETAILS', icon: 'circles' },
          { id: 'network', label: 'NETWORK', icon: 'hub' },
        ])}
        <div class="mod-tab-body">
          <div class="mod-tab-pane on" data-pane="details">
            <div class="mod-details-grid rl-details-grid">
              <div class="rl-left-col">
                <div class="sm-info-block sm-info-block-fill">
                  <div class="blk-title">◈ POWER</div>
                  <div class="lab-power-block">
                    <div class="lab-meter-head">
                      <span class="lab-meter-label"><span class="lab-power-icon">ϟ</span>Power</span>
                      <span id="storage-power-value" class="lab-meter-value"></span>
                    </div>
                    <div class="lab-power-meta">
                      <span>Usage <strong id="storage-power-usage"></strong></span>
                      <span>Capacity</span>
                    </div>
                    <div class="lab-meter-track"><div id="storage-power-bar" class="lab-meter-bar lab-meter-bar-power"></div></div>
                    <div id="storage-no-power-warning" class="storage-no-power-warning" style="display:none;margin-top:8px;">WARNING: NO POWER</div>
                    <button id="storage-buy-power-btn" class="btn primary module-btn-medium" style="display:none;margin-top:8px;" onclick="buyStoragePower(${module.id})">BUY POWER</button>
                  </div>
                </div>
                <div class="sm-info-block sm-info-block-fill">
                  <div class="blk-title">◈ SYSTEMS</div>
                  ${infoRowHtml('THROUGHPUT', 'lab-throughput-value', 'ACTIVE', 'blue')}
                  ${infoRowHtml('SYNTHESIS', 'lab-synth-count', `0 / ${SYNTHESIS_SLOT_COUNT}`, 'green')}
                </div>
              </div>
              <div class="rl-research-col">
                <div class="sm-info-block sm-info-block-fill">
                  <div class="blk-title">◈ SYNTHESIS <span class="blk-sub">up to ${SYNTHESIS_SLOT_COUNT}</span></div>
                  <div class="lab-synth-hint">Combine linked materials into advanced composites. Click a slot to choose a recipe.</div>
                  <div id="lab-synth-slots" class="lab-synth-slots" data-synth-sig="${module.level || 1}|${normalizeSynthesisSlots(module.synthesisSlots).join(',')}">${buildSynthesisSlotsHtml(module)}</div>
                </div>
                <div class="sm-info-block sm-info-block-fill">
                  <div class="blk-title">◈ LINKED RESOURCES <span class="blk-sub">via towers</span></div>
                  <div id="lab-linked-resources" class="lab-res-list"></div>
                </div>
              </div>
            </div>
          </div>
          <div class="mod-tab-pane" data-pane="network">${networkPanelHtml()}</div>
        </div>

        <div class="lab-footer">
          <div class="lab-actions">
            <button id="storage-upgrade-btn" class="btn primary" type="button" onclick="openModuleUpgradeOverlay(${module.id})">UPGRADE</button>
            <button class="btn module-btn-move" type="button" onclick="startMoveStorage(${module.id})">MOVE</button>
            <button class="btn module-btn-rename" type="button" onclick="openStorageRenameOverlay(${module.id})">RENAME</button>
            <button class="btn danger" type="button" onclick="confirmSellStorage(${module.id})">SELL</button>
          </div>
        </div>
        <div id="storage-upgrade-reqs" style="display:none;"></div>
      </div>`;
    patchModuleModal(moduleId, modal);
    return;
  }

  body.innerHTML = `
    <div class="storage-modal-hero">
      <div class="storage-modal-hero-row">
      <div class="storage-modal-hero-pad">
        <span id="storage-modal-name" class="storage-modal-name"></span>
        <button onclick="openStorageRenameOverlay(${module.id})" title="Rename Module" class="storage-modal-rename-btn">✎</button>
      </div>
      <div class="storage-modal-hero-pad">
        <div id="storage-tier-pill" class="storage-modal-tier-pill"></div>
      </div>
      </div>
    </div>
    <div class="module-health-card">
      <div class="module-health-head"><span class="module-health-label">HEALTH</span><span id="storage-health-value" class="module-health-value"></span></div>
      <div class="module-health-track">
        <div id="storage-health-bar" class="module-health-bar"></div>
      </div>
    </div>
    ${(isPowerStationModule(module) || isPoweredBuildingModule(module) || isPowerPoleModule(module) || isLabTowerModule(module)) ? `<div id="module-operational-banner" class="module-status-banner module-status-banner-online">ONLINE</div>` : ''}
    ${isPoweredBuildingModule(module) ? `
    <div class="module-divider-top">
      <div class="module-section-label-tight">◈ POWER</div>
      <div class="storage-power-panel">
        <div class="storage-power-head">
          <span class="storage-power-icon">ϟ</span>
          <span class="storage-power-title">POWER GRID</span>
        </div>
        <table class="storage-power-table">
          <thead>
            <tr>
              <th><span style="cursor:help;" onmouseover="showHintTooltip(event, '${isDroneLabModule(module) ? 'Power usage scales with drone count: 1/s per drone deployed.' : 'Power usage scales with stored cargo: 1/s at empty, up to 10/s at full capacity.'}');" onmouseout="hideTooltip()">Usage</span></th>
              <th>Capacity</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td id="storage-power-usage"></td>
              <td id="storage-power-value"></td>
            </tr>
          </tbody>
        </table>
        <div class="module-bar-row">
          <span class="storage-power-icon">ϟ</span>
          <div class="module-meter-track" style="flex:1;"><div id="storage-power-bar" class="module-meter-bar" style="background:linear-gradient(90deg,#caa020,#ffe066);transition:width 0.3s;"></div></div>
        </div>
      </div>
      <div id="storage-no-power-warning" class="storage-no-power-warning" style="display:none;">WARNING: NO POWER</div>
      <button id="storage-buy-power-btn" class="btn primary module-btn-medium" style="display:none;margin-top:8px;" onclick="buyStoragePower(${module.id})">BUY POWER <span style="color:#ffe066;">- $${fmt(buyPowerCost)}</span></button>
    </div>
    <div class="module-section-label">◈ ${isDroneLabModule(module) ? 'DRONE BAY' : isResearchLabModule(module) ? 'RESEARCH INTAKE' : 'STORAGE'}</div>
    <div class="module-meter-card">
      <div class="module-meter-head"><span class="module-meter-label">${isDroneLabModule(module) ? 'DRONES' : isResearchLabModule(module) ? 'THROUGHPUT' : 'STORAGE USED'}</span><span id="storage-used-value" class="module-meter-value"></span></div>
      <div class="module-meter-track"><div id="storage-used-bar" class="module-meter-bar" style="background:${isDroneLabModule(module) ? 'linear-gradient(90deg,#1a6aff,#5af)' : 'linear-gradient(90deg,#1a6aff,#48f)'};"></div></div>
    </div>
    ` : ''}
    ${summaryRows.length ? `<table class="module-summary-table">${renderStatRows(summaryRows)}</table>` : ''}
    ${(isPowerPoleModule(module) || isLabTowerModule(module)) ? `
    <div class="module-divider-top">
      <div class="module-section-label-tight">◈ ${isLabTowerModule(module) ? 'LAB RELAY' : 'RELAY'}</div>
      <div class="storage-power-panel">
        <div class="storage-power-head">
          <span class="storage-power-title">RELAY RANGE</span>
        </div>
        <div class="relay-range-row">
          <span id="relay-range-value" class="relay-range-value"></span>
          <span id="relay-range-blocks" class="relay-range-blocks"></span>
        </div>
      </div>
    </div>
    ` : ''}
    ${isPowerPoleModule(module) ? `
    <div class="module-section-label">◈ POWER LOAD</div>
    <div class="power-station-fuel-table-wrap">
      <table class="power-station-fuel-table">
        <thead>
          <tr>
            <th>Output</th>
            <th>Load</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td id="power-pole-network-output"></td>
            <td id="power-pole-network-load"></td>
            <td id="power-pole-network-status"></td>
          </tr>
        </tbody>
      </table>
    </div>
    ` : ''}
    ${isDroneLabModule(module) ? `
    <div class="module-section-label">◈ DRONE STATUS</div>
    <div id="drone-bay-status-list" class="module-scroll-panel compact"></div>
    <div class="module-section-label">◈ LINKED NETWORK</div>
    <div class="power-station-network-panel">
      <div id="power-station-link-summary" class="power-station-link-summary"></div>
    </div>
    ` : isStorageModule(module) ? `
    <div class="module-section-label-tight">◈ INVENTORY</div>
    <div id="storage-inventory-list" class="module-scroll-panel"></div>
    <div class="module-section-label">◈ LINKED NETWORK</div>
    <div class="power-station-network-panel">
      <div id="power-station-link-summary" class="power-station-link-summary"></div>
    </div>
    ` : isLabTowerModule(module) ? `
    <div class="module-section-label">◈ LINKED RESOURCES</div>
    <div id="lab-linked-resources" class="module-scroll-panel compact"></div>
    <div class="module-section-label">◈ LINKED NETWORK</div>
    <div class="power-station-network-panel">
      <div id="power-station-link-summary" class="power-station-link-summary"></div>
    </div>
    ` : (isPowerStationModule(module) || isPowerPoleModule(module)) ? `
    ${(isPowerStationModule(module) || isPowerPoleModule(module)) ? `
    <div id="power-station-no-fuel-warning" class="storage-no-power-warning" style="display:none;margin-bottom:8px;">WARNING: NO FUEL</div>
    ` : ''}
    ${isPowerStationModule(module) ? `
    <div class="module-section-label-tight">◈ FUEL</div>
    <div class="power-station-panel">
      <div class="power-station-row">
        <span class="power-station-power-label"><span class="storage-power-icon">ϟ</span><span class="storage-power-title">POWER SOURCE</span><span id="power-station-info-badge" class="power-station-info-badge">INFO</span></span>
        <select id="power-station-fuel-select" class="power-station-select" onchange="setPowerStationFuel(${module.id}, this.value)"></select>
      </div>
      <div class="power-station-fuel-table-wrap">
        <table class="power-station-fuel-table">
          <thead>
            <tr>
              <th>Input</th>
              <th>Output</th>
              <th>Load</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td id="power-station-fuel-rate"></td>
              <td id="power-station-fuel-output"></td>
              <td id="power-station-fuel-cost"></td>
              <td id="power-station-fuel-status"></td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="power-station-row power-station-fuel-row"><span id="power-station-used-label" class="power-station-value-label">△ FUEL</span><span id="power-station-used-value" class="power-station-value"></span></div>
      <div class="power-station-bar"><div id="power-station-used-bar" class="power-station-bar-fill"></div></div>
    </div>
    ` : ''}
    <div class="module-section-label-tight">◈ LINKED NETWORK</div>
    <div class="power-station-network-panel">
      <div id="power-station-link-summary" class="power-station-link-summary"></div>
      ${(isPowerStationModule(module) || isPowerPoleModule(module)) ? '<div id="power-station-network-consumers" class="module-scroll-panel compact" style="margin-top:8px;"></div>' : ''}
    </div>
    <div id="storage-inventory-list" class="module-scroll-panel"></div>
    ` : ''}
    <div class="module-section-label">◈ UPGRADE</div>
    <div id="storage-upgrade-reqs" class="bp-craft-reqs" style="margin-bottom:8px;"></div>
    ${(isPowerPoleModule(module) || isLabTowerModule(module) || isPowerStationModule(module) || isPoweredBuildingModule(module))
      ? `<div class="module-upgrade-grid">
          <button id="storage-upgrade-btn" class="btn primary module-btn-small" onclick="upgradeStorageFacility(${module.id})">UPGRADE</button>
          <button class="btn module-btn-small module-btn-move" onclick="startMoveStorage(${module.id})">MOVE</button>
          <button class="btn module-btn-small module-btn-rename" onclick="openStorageRenameOverlay(${module.id})">RENAME</button>
          <button class="btn danger module-btn-small" onclick="confirmSellStorage(${module.id})">SELL</button>
        </div>`
      : `<button id="storage-upgrade-btn" class="btn primary module-btn-medium" onclick="upgradeStorageFacility(${module.id})"></button>
        <button class="btn module-btn-medium module-btn-move" onclick="startMoveStorage(${module.id})">↔ MOVE ${moduleDef.name.toUpperCase()}</button>
        <button class="btn module-btn-medium module-btn-rename" onclick="openStorageRenameOverlay(${module.id})">✎ RENAME ${moduleDef.name.toUpperCase()}</button>
        <button class="btn danger module-btn-medium" onclick="confirmSellStorage(${module.id})">⊘ SELL ${moduleDef.name.toUpperCase()}</button>`}
  `;
  patchModuleModal(moduleId, modal);
}

export function renderStorageModal(moduleId = state.selectedModule) {
  renderModuleModal(moduleId);
}

function patchDroneLabModal(module, modal, qs) {
  const moduleDef = getModuleDef(module.type);
  const hpPct = Math.round((module.health / Math.max(1, module.maxHealth)) * 100);
  const hpColor = hpPct > 60 ? '#4d8' : hpPct > 30 ? '#fa4' : '#f44';
  const moduleTier = Math.max(1, Math.min(10, module.level || 1));
  const tierColor = MINE_TIERS[moduleTier]?.color || '#8ab';
  const title = modal.querySelector('.storage-modal-title');
  if (title) title.textContent = moduleDef.panelTitle;
  qs('#storage-modal-name').textContent = `⬡ ${module.name}`;
  const tierEl = qs('#storage-tier-pill');
  tierEl.textContent = `TIER ${toRoman(moduleTier)}`;
  tierEl.style.color = isLightColor(tierColor) ? '#111' : '#fff';
  tierEl.style.background = tierColor;
  qs('#storage-health-value').textContent = `${fmt(module.health)} / ${fmt(module.maxHealth)}`;
  qs('#storage-health-value').style.color = hpColor;
  qs('#storage-health-bar').style.width = `${hpPct}%`;
  qs('#storage-health-bar').style.background = hpPct < 25 ? 'linear-gradient(90deg,#cc1010,#f44)' : 'linear-gradient(90deg,#2a8040,#4d8)';

  const online = isStorageOperational(module);
  const noPower = (module.power || 0) <= 0;
  const banner = qs('#module-operational-banner');
  if (banner) {
    banner.textContent = online ? 'ONLINE' : 'OFFLINE';
    banner.className = `lab-status-pill${online ? '' : ' offline'}`;
  }
  setTextIfChangedIn(modal, '#dl-status-value', online ? 'ONLINE' : 'OFFLINE');
  const statusVal = qs('#dl-status-value');
  if (statusVal) {
    statusVal.classList.toggle('green', online);
    statusVal.classList.toggle('ok', online);
    statusVal.classList.toggle('bad', !online);
    statusVal.style.color = '';
  }

  const activeDroneCount = getDronesForLab(module.id).length;
  const capacity = Math.max(1, module.droneCapacity || 2);
  const bayPct = Math.max(0, Math.min(100, (activeDroneCount / capacity) * 100));
  setTextIfChangedIn(modal, '#dl-active-value', `${activeDroneCount} / ${capacity}`);
  setTextIfChangedIn(modal, '#storage-used-value', `${activeDroneCount} / ${capacity}`);
  setTextIfChangedIn(modal, '#dl-bay-count', `${activeDroneCount} active`);
  const usedBar = qs('#storage-used-bar');
  if (usedBar) usedBar.style.width = `${bayPct}%`;

  const powerPct = Math.round(((module.power || 0) / Math.max(1, module.powerCapacity || 1)) * 100);
  const currentPowerUsage = getStoragePowerUsage(module);
  setTextIfChangedIn(modal, '#storage-power-usage', `${currentPowerUsage.toFixed(1).replace(/\.0$/, '')}/s`);
  setTextIfChangedIn(modal, '#storage-power-value', `${fmt(module.power || 0)} / ${fmt(module.powerCapacity)}`);
  const powerBar = qs('#storage-power-bar');
  if (powerBar) powerBar.style.width = `${powerPct}%`;
  const noPowerEl = qs('#storage-no-power-warning');
  if (noPowerEl) noPowerEl.style.display = noPower ? '' : 'none';
  const buyPowerBtn = qs('#storage-buy-power-btn');
  if (buyPowerBtn) {
    const buyPowerCost = getModuleUpgradeCost(module).coins * 5;
    buyPowerBtn.style.display = noPower ? '' : 'none';
    buyPowerBtn.disabled = state.coins < buyPowerCost;
    buyPowerBtn.innerHTML = `BUY POWER <span style="color:#ffe066;">- $${fmt(buyPowerCost)}</span>`;
  }

  const list = qs('#drone-bay-status-list');
  if (list) {
    const drones = getDronesForLab(module.id).slice().sort((a, b) => a.id - b.id);
    const droneSig = `${capacity}|${drones.map((d) => {
      const findKey = d.find?.type || d.find || d.loot?.type || d.loot || '';
      return `${d.id}:${d.status}:${d.taskNodeId ?? ''}:${d.taskType || ''}:${findKey}`;
    }).join(',')}`;
    if (list.dataset.droneSig !== droneSig) {
      list.dataset.droneSig = droneSig;
      setHtmlDestroyingTippies(list, buildDroneBayListHtml(module));
      bindTippyIn(list);
    } else {
      const rows = [...list.querySelectorAll('.dl-drone-row:not(.empty)')];
      drones.forEach((d, idx) => {
        const row = rows[idx];
        if (!row) return;
        const bar = row.querySelector('.dl-progress-bar');
        const pct = getDroneProgressPct(d);
        if (bar) bar.style.width = `${pct.toFixed(1)}%`;
      });
    }
  }
  bindTippyIn(modal);
  maybePatchNetworkTab(modal, module);

  const upgradeCost = getModuleUpgradeCost(module);
  const atMaxTier = module.level >= 10;
  const upBtn = qs('#storage-upgrade-btn');
  if (upBtn) {
    upBtn.textContent = atMaxTier ? '★ MAX TIER' : 'UPGRADE';
    upBtn.disabled = atMaxTier || noPower;
    upBtn.onclick = () => {
      if (atMaxTier) return;
      window.openModuleUpgradeOverlay?.(module.id);
    };
  }
  setHtmlIfChangedIn(modal, '#storage-upgrade-reqs', buildUpgradeReqsHtml(upgradeCost));
  if (_upgradeOverlayModuleId === module.id) patchModuleUpgradeOverlay();
}

function patchStorageFacilityModal(module, modal, qs) {
  scrubModuleInventory(module);
  const moduleDef = getModuleDef(module.type);
  const hpPct = Math.round((module.health / Math.max(1, module.maxHealth)) * 100);
  const hpColor = hpPct > 60 ? '#4d8' : hpPct > 30 ? '#fa4' : '#f44';
  const moduleTier = Math.max(1, Math.min(10, module.level || 1));
  const tierColor = MINE_TIERS[moduleTier]?.color || '#8ab';
  const title = modal.querySelector('.storage-modal-title');
  if (title) title.textContent = moduleDef.panelTitle;
  qs('#storage-modal-name').textContent = `⬡ ${module.name}`;
  const tierEl = qs('#storage-tier-pill');
  tierEl.textContent = `TIER ${toRoman(moduleTier)}`;
  tierEl.style.color = isLightColor(tierColor) ? '#111' : '#fff';
  tierEl.style.background = tierColor;
  qs('#storage-health-value').textContent = `${fmt(module.health)} / ${fmt(module.maxHealth)}`;
  qs('#storage-health-value').style.color = hpColor;
  qs('#storage-health-bar').style.width = `${hpPct}%`;
  qs('#storage-health-bar').style.background = hpPct < 25 ? 'linear-gradient(90deg,#cc1010,#f44)' : 'linear-gradient(90deg,#2a8040,#4d8)';

  const online = isStorageOperational(module);
  const noPower = (module.power || 0) <= 0;
  const banner = qs('#module-operational-banner');
  if (banner) {
    banner.textContent = online ? 'ONLINE' : 'OFFLINE';
    banner.className = `lab-status-pill${online ? '' : ' offline'}`;
  }
  setTextIfChangedIn(modal, '#st-status-value', online ? 'ONLINE' : 'OFFLINE');
  const statusVal = qs('#st-status-value');
  if (statusVal) {
    statusVal.classList.toggle('green', online);
    statusVal.classList.toggle('ok', online);
    statusVal.classList.toggle('bad', !online);
    statusVal.style.color = '';
  }

  const totalInv = getStorageTotalInventory(module);
  const cap = Math.max(1, module.storageCapacity || 1);
  const fillPct = Math.max(0, Math.min(100, Math.round((totalInv / cap) * 100)));
  setTextIfChangedIn(modal, '#st-fill-value', `${fillPct}%`);
  setTextIfChangedIn(modal, '#storage-used-value', `${fmt(totalInv)} / ${fmt(module.storageCapacity)}`);
  const usedBar = qs('#storage-used-bar');
  if (usedBar) usedBar.style.width = `${fillPct}%`;

  const powerPct = Math.round(((module.power || 0) / Math.max(1, module.powerCapacity || 1)) * 100);
  const currentPowerUsage = getStoragePowerUsage(module);
  setTextIfChangedIn(modal, '#storage-power-usage', `${currentPowerUsage.toFixed(1).replace(/\.0$/, '')}/s`);
  setTextIfChangedIn(modal, '#storage-power-value', `${fmt(module.power || 0)} / ${fmt(module.powerCapacity)}`);
  const powerBar = qs('#storage-power-bar');
  if (powerBar) powerBar.style.width = `${powerPct}%`;
  const noPowerEl = qs('#storage-no-power-warning');
  if (noPowerEl) noPowerEl.style.display = noPower ? '' : 'none';
  const buyPowerBtn = qs('#storage-buy-power-btn');
  if (buyPowerBtn) {
    const buyPowerCost = getModuleUpgradeCost(module).coins * 5;
    buyPowerBtn.style.display = noPower ? '' : 'none';
    buyPowerBtn.disabled = state.coins < buyPowerCost;
    buyPowerBtn.innerHTML = `BUY POWER <span style="color:#ffe066;">- $${fmt(buyPowerCost)}</span>`;
  }

  const searchEl = qs('#st-inv-search');
  const sortEl = qs('#st-inv-sort');
  const query = searchEl?.value || '';
  const sort = sortEl?.value || 'amount';
  const typeCount = Object.values(module.inventory || {}).filter((n) => (n || 0) > 0).length;
  setTextIfChangedIn(modal, '#st-inv-count', `${typeCount} type${typeCount === 1 ? '' : 's'}`);
  const invList = qs('#storage-inventory-list');
  if (invList) {
    const invSig = `${sort}|${query}|${Object.entries(module.inventory || {}).filter(([, n]) => (n || 0) > 0).map(([t, n]) => `${t}:${Math.floor(n)}`).sort().join(',')}`;
    if (invList.dataset.invSig !== invSig) {
      invList.dataset.invSig = invSig;
      setHtmlDestroyingTippies(invList, buildStorageInventoryGridHtml(module, query, sort));
      bindTippyIn(invList);
    }
  }
  bindTippyIn(modal);
  maybePatchNetworkTab(modal, module);

  const upgradeCost = getModuleUpgradeCost(module);
  const atMaxTier = module.level >= 10;
  const upBtn = qs('#storage-upgrade-btn');
  if (upBtn) {
    upBtn.textContent = atMaxTier ? '★ MAX TIER' : 'UPGRADE';
    upBtn.disabled = atMaxTier || noPower;
    upBtn.onclick = () => {
      if (atMaxTier) return;
      window.openModuleUpgradeOverlay?.(module.id);
    };
  }
  setHtmlIfChangedIn(modal, '#storage-upgrade-reqs', buildUpgradeReqsHtml(upgradeCost));
  if (_upgradeOverlayModuleId === module.id) patchModuleUpgradeOverlay();
}

function patchPowerStationModal(module, modal, qs) {
  scrubModuleInventory(module);
  const moduleDef = getModuleDef(module.type);
  const hpPct = Math.round((module.health / Math.max(1, module.maxHealth)) * 100);
  const hpColor = hpPct > 60 ? '#4d8' : hpPct > 30 ? '#fa4' : '#f44';
  const moduleTier = Math.max(1, Math.min(10, module.level || 1));
  const tierColor = MINE_TIERS[moduleTier]?.color || '#8ab';
  const title = modal.querySelector('.storage-modal-title');
  if (title) title.textContent = moduleDef.panelTitle;
  qs('#storage-modal-name').textContent = `⬡ ${module.name}`;
  const tierEl = qs('#storage-tier-pill');
  tierEl.textContent = `TIER ${toRoman(moduleTier)}`;
  tierEl.style.color = isLightColor(tierColor) ? '#111' : '#fff';
  tierEl.style.background = tierColor;
  qs('#storage-health-value').textContent = `${fmt(module.health)} / ${fmt(module.maxHealth)}`;
  qs('#storage-health-value').style.color = hpColor;
  qs('#storage-health-bar').style.width = `${hpPct}%`;
  qs('#storage-health-bar').style.background = hpPct < 25 ? 'linear-gradient(90deg,#cc1010,#f44)' : 'linear-gradient(90deg,#2a8040,#4d8)';

  const networkInfo = getPowerModuleNetworkInfo(module.id, state.modules, state.turrets);
  const linkedStorages = networkInfo.storages;
  const linkedTurrets = networkInfo.turrets;
  const linkedConsumers = linkedStorages.length + linkedTurrets.length;
  const inputQty = getPowerResourceConsumption(module);
  const fuelCost = inputQty * linkedConsumers;
  const fuelType = module.fuelResource || 'iron';
  const fuelName = RESOURCE_DEFS[fuelType]?.label || fuelType;
  const powerOutput = getPowerStationEffectiveOutput(module, linkedConsumers);
  const powerOutputText = powerOutput.toFixed(1).replace(/\.0$/, '');
  const noFuel = !hasPowerStationFuel(module);
  const offline = (module.health || 0) <= 0 || noFuel;
  const totalLoad = linkedStorages.reduce((sum, storage) => sum + getStoragePowerUsage(storage), 0)
    + linkedTurrets.reduce((sum, turret) => sum + (turret.powerUsage || 0), 0);
  const totalLoadText = totalLoad.toFixed(1).replace(/\.0$/, '');
  const netDelta = powerOutput - totalLoad;
  const netDeltaText = `${netDelta >= 0 ? '+' : ''}${netDelta.toFixed(1).replace(/\.0$/, '')}`;
  const statusColor = netDelta > 0 ? '#6fff9a' : netDelta < 0 ? '#ff8a8a' : '#ffe066';
  const statusLabel = netDelta > 0 ? 'Surplus' : netDelta < 0 ? 'Deficit' : 'Balanced';
  const facilityLabel = linkedConsumers === 1 ? 'consumer' : 'consumers';

  const banner = qs('#module-operational-banner');
  if (banner) {
    banner.textContent = offline ? 'OFFLINE' : 'ONLINE';
    banner.className = `lab-status-pill${offline ? ' offline' : ''}`;
  }

  const fuelBtnLabel = qs('#power-station-fuel-btn-label');
  const fuelBtnIcon = qs('#power-station-fuel-btn-icon');
  if (fuelBtnLabel) fuelBtnLabel.textContent = fuelName;
  if (fuelBtnIcon) {
    const iconHtml = resourceIconHtml(fuelType, 16);
    if (fuelBtnIcon.innerHTML !== iconHtml) fuelBtnIcon.innerHTML = iconHtml;
  }

  // ── Dashboard: fuel flow vs power grid ──
  const importPerMin = getModuleImportPerMinute(module, fuelType);
  const burnPerSec = fuelCost;
  const burnPerMin = burnPerSec * 60;
  const importMeets = burnPerMin <= 0 ? true : importPerMin + 0.001 >= burnPerMin;
  const fuelMax = Math.max(importPerMin, burnPerMin, 1);
  const powerMax = Math.max(powerOutput, totalLoad, 1);
  const setBar = (id, pct) => {
    const el = qs(id);
    if (el) el.style.width = `${Math.max(0, Math.min(100, pct))}%`;
  };
  const setPill = (id, cls, text) => {
    const el = qs(id);
    if (!el) return;
    el.className = `ps-balance-pill ${cls}`;
    el.textContent = text;
  };

  setTextIfChangedIn(modal, '#ps-val-import', `${fmt(Math.round(importPerMin))}/m`);
  setTextIfChangedIn(modal, '#ps-val-burn', `${fmt(Math.round(burnPerMin))}/m`);
  setTextIfChangedIn(modal, '#ps-val-output', `${powerOutputText}/s`);
  setTextIfChangedIn(modal, '#ps-val-load', `${totalLoadText}/s`);
  setBar('#ps-bar-import', (importPerMin / fuelMax) * 100);
  setBar('#ps-bar-burn', (burnPerMin / fuelMax) * 100);
  setBar('#ps-bar-output', (powerOutput / powerMax) * 100);
  setBar('#ps-bar-load', (totalLoad / powerMax) * 100);

  if (noFuel) {
    setPill('#ps-fuel-balance-pill', 'bad', 'NO FUEL');
    setTextIfChangedIn(modal, '#ps-fuel-note', `No ${fuelName} in tank — generators offline.`);
  } else if (burnPerMin <= 0) {
    setPill('#ps-fuel-balance-pill', 'idle', 'NO LOAD');
    setTextIfChangedIn(modal, '#ps-fuel-note', 'No consumers — not burning fuel.');
  } else if (importMeets) {
    setPill('#ps-fuel-balance-pill', 'ok', 'FUEL OK');
    setTextIfChangedIn(modal, '#ps-fuel-note', `Imports cover burn · ${fmt(Math.round(importPerMin - burnPerMin))}/m surplus fuel`);
  } else {
    const short = Math.round(burnPerMin - importPerMin);
    setPill('#ps-fuel-balance-pill', 'warn', 'FUEL SHORT');
    setTextIfChangedIn(modal, '#ps-fuel-note', `Import short ${fmt(short)}/m — burning stockpile.`);
  }

  if (noFuel || offline) {
    setPill('#ps-power-balance-pill', 'bad', 'OFFLINE');
    setTextIfChangedIn(modal, '#ps-power-note', 'Station offline — no power output.');
  } else if (netDelta >= 0) {
    setPill('#ps-power-balance-pill', 'ok', 'SURPLUS');
    setTextIfChangedIn(modal, '#ps-power-note', `Generating ${netDeltaText}/s more than load.`);
  } else {
    setPill('#ps-power-balance-pill', 'bad', 'POWER SHORT');
    // Clarify: fuel can be fine while power gen cap is too low for this ore
    const maxOut = getPowerFuelOutput(fuelType);
    setTextIfChangedIn(modal, '#ps-power-note',
      importMeets && !noFuel
        ? `${fuelName} only outputs ${maxOut}/s max — switch to a richer fuel to cover ${totalLoadText}/s load.`
        : `Load exceeds output by ${Math.abs(netDelta).toFixed(1).replace(/\.0$/, '')}/s.`);
  }

  bindTippy(qs('#ps-row-import'),
    `<strong>Import</strong><br>Fuel delivered to this station (last ~60s).<br><span style="color:#ffe066">${Math.floor(importPerMin).toLocaleString()}/min</span> ${escapeHtml(fuelName)}`);
  bindTippy(qs('#ps-row-burn'),
    `<strong>Burn</strong><br>${fmt(inputQty)} ${escapeHtml(fuelName)} per consumer × ${linkedConsumers} ${facilityLabel}.<br><span style="color:#ffe066">${burnPerSec.toFixed(1).replace(/\.0$/, '')}/s</span> = <span style="color:#ffe066">${Math.round(burnPerMin).toLocaleString()}/min</span>`);
  bindTippy(qs('#ps-row-output'),
    `<strong>Power output</strong><br>Max electricity this fuel can generate.<br>${escapeHtml(fuelName)} → <span style="color:#ffe066">${powerOutputText}/s</span>${noFuel ? '<br><span style="color:#f88">No fuel in tank</span>' : ''}<br><span style="color:#8ab">Richer ores produce more power/s.</span>`);
  bindTippy(qs('#ps-row-load'),
    `<strong>Power load</strong><br>Demand from ${linkedConsumers} linked ${facilityLabel}.<br><span style="color:#ffe066">${totalLoadText}/s</span> total draw`);

  const selectedFuelStored = module.inventory?.[fuelType] || 0;
  const fuelCap = module.resourceCapacity || 0;
  setTextIfChangedIn(modal, '#power-station-used-label', fuelName);
  setTextIfChangedIn(modal, '#power-station-used-value', `${fmt(selectedFuelStored)} / ${fmt(fuelCap)}`);
  const fuelIconEl = qs('#power-station-used-icon');
  if (fuelIconEl) {
    const iconHtml = resourceIconHtml(fuelType, 16);
    if (fuelIconEl.innerHTML !== iconHtml) fuelIconEl.innerHTML = iconHtml;
  }
  const fuelValEl = qs('#power-station-used-value');
  if (fuelValEl) {
    fuelValEl.style.cursor = 'help';
    const exactStored = Math.floor(selectedFuelStored).toLocaleString();
    const exactCap = Math.floor(fuelCap).toLocaleString();
    bindTippy(fuelValEl, `<strong style="color:${RESOURCE_DEFS[fuelType]?.color || '#cde'}">${escapeHtml(fuelName)}</strong><br>${exactStored} / ${exactCap}`);
  }
  const fuelBar = qs('#power-station-used-bar');
  if (fuelBar) fuelBar.style.width = `${Math.max(0, Math.min(100, (selectedFuelStored / Math.max(1, fuelCap || 1)) * 100))}%`;

  const noFuelWarning = qs('#power-station-no-fuel-warning');
  if (noFuelWarning) {
    noFuelWarning.textContent = `WARNING: NO ${fuelName.toUpperCase()}`;
    noFuelWarning.style.display = noFuel ? '' : 'none';
  }
  const deficitWarning = qs('#power-station-deficit-warning');
  if (deficitWarning) {
    // Only warn power short when fuel tank has fuel — avoid "deficit" panic when issue is empty tank
    if (noFuel) {
      deficitWarning.style.display = 'none';
    } else if (netDelta < 0 && importMeets) {
      deficitWarning.textContent = `POWER SHORT — ${fuelName.toUpperCase()} CAPS AT ${getPowerFuelOutput(fuelType)}/S OUTPUT`;
      deficitWarning.style.display = '';
    } else if (netDelta < 0) {
      deficitWarning.textContent = 'WARNING: POWER DEFICIT';
      deficitWarning.style.display = '';
    } else {
      deficitWarning.style.display = 'none';
    }
  }

  setHtmlIfChangedIn(modal, '#power-station-network-consumers', buildPowerConsumerListHtml(linkedStorages, linkedTurrets));
  setHtmlIfChangedIn(modal, '#storage-inventory-list', buildPowerStationFuelStoresHtml(module, fuelType));
  bindTippyIn(modal);
  maybePatchNetworkTab(modal, module);

  const upgradeCost = getModuleUpgradeCost(module);
  const atMaxTier = module.level >= 10;
  const upBtn = qs('#storage-upgrade-btn');
  if (upBtn) {
    upBtn.textContent = atMaxTier ? '★ MAX TIER' : 'UPGRADE';
    upBtn.disabled = atMaxTier;
    upBtn.onclick = () => {
      if (atMaxTier) return;
      window.openModuleUpgradeOverlay?.(module.id);
    };
  }
  setHtmlIfChangedIn(modal, '#storage-upgrade-reqs', buildUpgradeReqsHtml(upgradeCost));
  if (_upgradeOverlayModuleId === module.id) patchModuleUpgradeOverlay();
}

function patchPowerPoleModal(module, modal, qs) {
  const moduleDef = getModuleDef(module.type);
  const hpPct = Math.round((module.health / Math.max(1, module.maxHealth)) * 100);
  const hpColor = hpPct > 60 ? '#4d8' : hpPct > 30 ? '#fa4' : '#f44';
  const moduleTier = Math.max(1, Math.min(10, module.level || 1));
  const tierColor = MINE_TIERS[moduleTier]?.color || '#8ab';
  const title = modal.querySelector('.storage-modal-title');
  if (title) title.textContent = moduleDef.panelTitle;
  qs('#storage-modal-name').textContent = `⬡ ${module.name}`;
  const tierEl = qs('#storage-tier-pill');
  tierEl.textContent = `TIER ${toRoman(moduleTier)}`;
  tierEl.style.color = isLightColor(tierColor) ? '#111' : '#fff';
  tierEl.style.background = tierColor;
  qs('#storage-health-value').textContent = `${fmt(module.health)} / ${fmt(module.maxHealth)}`;
  qs('#storage-health-value').style.color = hpColor;
  qs('#storage-health-bar').style.width = `${hpPct}%`;
  qs('#storage-health-bar').style.background = hpPct < 25 ? 'linear-gradient(90deg,#cc1010,#f44)' : 'linear-gradient(90deg,#2a8040,#4d8)';

  const online = (module.health || 0) > 0;
  const banner = qs('#module-operational-banner');
  if (banner) {
    banner.textContent = online ? 'ONLINE' : 'OFFLINE';
    banner.className = `lab-status-pill${online ? '' : ' offline'}`;
  }
  setTextIfChangedIn(modal, '#pp-status-value', online ? 'ONLINE' : 'OFFLINE');
  const statusVal = qs('#pp-status-value');
  if (statusVal) {
    statusVal.classList.toggle('green', online);
    statusVal.classList.toggle('ok', online);
    statusVal.classList.toggle('bad', !online);
    statusVal.style.color = '';
  }

  const range = Math.max(0, module.relayRange || 0);
  setTextIfChangedIn(modal, '#relay-range-value', `${range} TILES`);
  setTextIfChangedIn(modal, '#relay-range-blocks', Array.from({ length: range }, () => '■').join(' '));

  const networkInfo = getPowerModuleNetworkInfo(module.id, state.modules, state.turrets);
  const networkState = getPowerNetworkState(state.modules, state.turrets);
  const linkedStorages = networkInfo.storages;
  const linkedStations = networkInfo.stations;
  const linkedTurrets = networkInfo.turrets;
  const linkedConsumers = linkedStorages.length + linkedTurrets.length;
  const noFuelIds = getNoFuelNetworkIds(state.modules, state.turrets);

  const totalLoad = linkedStorages.reduce((sum, storage) => sum + getStoragePowerUsage(storage), 0)
    + linkedTurrets.reduce((sum, turret) => sum + (turret.powerUsage || 0), 0);
  const activeStations = linkedStations.filter((station) => (station.health || 0) > 0 && hasPowerStationFuel(station));
  const offlineStations = linkedStations.filter((station) => (station.health || 0) > 0 && !hasPowerStationFuel(station));
  const totalOutput = activeStations.reduce((sum, station) => {
    const stationConsumers = (networkState.stationLinkedStorages.get(station.id) || []).length
      + (networkState.stationLinkedTurrets.get(station.id) || []).length;
    return sum + getPowerStationEffectiveOutput(station, stationConsumers);
  }, 0);
  const offlineOutput = offlineStations.reduce((sum, station) => sum + getPowerFuelOutput(station.fuelResource || 'iron'), 0);
  const netDelta = totalOutput - totalLoad;
  const totalOutputText = totalOutput.toFixed(1).replace(/\.0$/, '');
  const totalLoadText = totalLoad.toFixed(1).replace(/\.0$/, '');
  const netDeltaText = `${netDelta >= 0 ? '+' : ''}${netDelta.toFixed(1).replace(/\.0$/, '')}`;
  const statusLabel = netDelta > 0 ? 'Surplus' : netDelta < 0 ? 'Deficit' : 'Balanced';
  const facilityLabel = linkedConsumers === 1 ? 'consumer' : 'consumers';

  const barMax = Math.max(totalOutput, totalLoad, 0.001);
  const setBar = (id, pct) => {
    const el = qs(id);
    if (el) el.style.width = `${Math.max(0, Math.min(100, pct))}%`;
  };
  setBar('#pp-bar-output', (totalOutput / barMax) * 100);
  setBar('#pp-bar-load', (totalLoad / barMax) * 100);
  setTextIfChangedIn(modal, '#pp-val-output', `${totalOutputText}/s`);
  setTextIfChangedIn(modal, '#pp-val-load', `${totalLoadText}/s`);

  const setPill = (id, cls, text) => {
    const el = qs(id);
    if (!el) return;
    el.className = `ps-balance-pill ${cls}`;
    setTextIfChangedIn(modal, id, text);
  };
  if (!online) {
    setPill('#pp-balance-pill', 'bad', 'OFFLINE');
    setTextIfChangedIn(modal, '#pp-power-note', 'Relay destroyed — network path interrupted.');
  } else if (linkedStations.length <= 0) {
    setPill('#pp-balance-pill', 'idle', 'NO STATION');
    setTextIfChangedIn(modal, '#pp-power-note', 'Not linked to a powered station.');
  } else if (noFuelIds.has(module.id) || activeStations.length <= 0) {
    setPill('#pp-balance-pill', 'bad', 'NO FUEL');
    setTextIfChangedIn(modal, '#pp-power-note', offlineOutput > 0
      ? `Linked stations offline for fuel (−${offlineOutput.toFixed(1).replace(/\.0$/, '')}/s potential).`
      : 'Linked stations have no fuel.');
  } else if (netDelta > 0.05) {
    setPill('#pp-balance-pill', 'ok', 'SURPLUS');
    setTextIfChangedIn(modal, '#pp-power-note', `Network generating ${netDeltaText}/s more than load.`);
  } else if (netDelta < -0.05) {
    setPill('#pp-balance-pill', 'bad', 'DEFICIT');
    setTextIfChangedIn(modal, '#pp-power-note', `Load exceeds network output by ${Math.abs(netDelta).toFixed(1).replace(/\.0$/, '')}/s.`);
  } else {
    setPill('#pp-balance-pill', 'ok', 'BALANCED');
    setTextIfChangedIn(modal, '#pp-power-note', 'Network output matches consumer load.');
  }

  bindTippy(qs('#pp-row-output'),
    `<strong>Network output</strong><br>Power from linked stations with fuel.<br><span style="color:#ffe066">${totalOutputText}/s</span>${offlineOutput > 0 ? `<br><span style="color:#f88">−${offlineOutput.toFixed(1).replace(/\.0$/, '')}/s offline (no fuel)</span>` : ''}`);
  bindTippy(qs('#pp-row-load'),
    `<strong>Network load</strong><br>Demand from ${linkedConsumers} linked ${facilityLabel}.<br><span style="color:#ffe066">${totalLoadText}/s</span> total draw`);

  setTextIfChangedIn(modal, '#pp-consumer-count', `${linkedConsumers} drawing`);

  const noFuelWarning = qs('#power-station-no-fuel-warning');
  if (noFuelWarning) noFuelWarning.style.display = noFuelIds.has(module.id) ? '' : 'none';

  setHtmlIfChangedIn(modal, '#power-station-network-consumers', buildPowerConsumerListHtml(linkedStorages, linkedTurrets));
  bindTippyIn(modal);
  maybePatchNetworkTab(modal, module);

  const upgradeCost = getModuleUpgradeCost(module);
  const atMaxTier = module.level >= 10;
  const upBtn = qs('#storage-upgrade-btn');
  if (upBtn) {
    upBtn.textContent = atMaxTier ? '★ MAX TIER' : 'UPGRADE';
    upBtn.disabled = atMaxTier;
    upBtn.onclick = () => {
      if (atMaxTier) return;
      window.openModuleUpgradeOverlay?.(module.id);
    };
  }
  setHtmlIfChangedIn(modal, '#storage-upgrade-reqs', buildUpgradeReqsHtml(upgradeCost));
  if (_upgradeOverlayModuleId === module.id) patchModuleUpgradeOverlay();
}

function patchLabTowerModal(module, modal, qs) {
  const moduleDef = getModuleDef(module.type);
  const hpPct = Math.round((module.health / Math.max(1, module.maxHealth)) * 100);
  const hpColor = hpPct > 60 ? '#4d8' : hpPct > 30 ? '#fa4' : '#f44';
  const moduleTier = Math.max(1, Math.min(10, module.level || 1));
  const tierColor = MINE_TIERS[moduleTier]?.color || '#8ab';
  const title = modal.querySelector('.storage-modal-title');
  if (title) title.textContent = moduleDef.panelTitle;
  qs('#storage-modal-name').textContent = `⬡ ${module.name}`;
  const tierEl = qs('#storage-tier-pill');
  tierEl.textContent = `TIER ${toRoman(moduleTier)}`;
  tierEl.style.color = isLightColor(tierColor) ? '#111' : '#fff';
  tierEl.style.background = tierColor;
  qs('#storage-health-value').textContent = `${fmt(module.health)} / ${fmt(module.maxHealth)}`;
  qs('#storage-health-value').style.color = hpColor;
  qs('#storage-health-bar').style.width = `${hpPct}%`;
  qs('#storage-health-bar').style.background = hpPct < 25 ? 'linear-gradient(90deg,#cc1010,#f44)' : 'linear-gradient(90deg,#2a8040,#4d8)';

  const online = (module.health || 0) > 0;
  const banner = qs('#module-operational-banner');
  if (banner) {
    banner.textContent = online ? 'ONLINE' : 'OFFLINE';
    banner.className = `lab-status-pill${online ? '' : ' offline'}`;
  }
  setTextIfChangedIn(modal, '#lt-status-value', online ? 'ONLINE' : 'OFFLINE');
  const statusVal = qs('#lt-status-value');
  if (statusVal) {
    statusVal.classList.toggle('green', online);
    statusVal.classList.toggle('ok', online);
    statusVal.classList.toggle('bad', !online);
    statusVal.style.color = '';
  }

  const range = Math.max(0, module.relayRange || 0);
  setTextIfChangedIn(modal, '#relay-range-value', `${range} TILES`);
  const blocksEl = qs('#relay-range-blocks');
  if (blocksEl) {
    const blocks = Array.from({ length: range }, () => '■').join(' ');
    if (blocksEl.textContent !== blocks) blocksEl.textContent = blocks;
  }

  const labInfo = getLabModuleNetworkInfo(module.id, state.modules, state.nodes, state.base.level);
  const resourceTypes = new Set(labInfo.resources.map((entry) => entry.node?.type).filter(Boolean));
  setTextIfChangedIn(modal, '#lt-node-tier', `T${moduleTier}`);
  setTextIfChangedIn(modal, '#lt-node-count', String(labInfo.resources.length));
  setTextIfChangedIn(modal, '#lt-res-count', `${resourceTypes.size} type${resourceTypes.size === 1 ? '' : 's'}`);
  setTextIfChangedIn(modal, '#lt-range-note', online
    ? `Links Tier ${moduleTier} resource nodes within ${range} tiles.`
    : 'Tower offline — resource links inactive.');

  setHtmlIfChangedIn(modal, '#lab-linked-resources', buildLabLinkedResourcesHtml(module, labInfo));
  bindTippyIn(modal);
  maybePatchNetworkTab(modal, module);

  const upgradeCost = getModuleUpgradeCost(module);
  const atMaxTier = module.level >= 10;
  const upBtn = qs('#storage-upgrade-btn');
  if (upBtn) {
    upBtn.textContent = atMaxTier ? '★ MAX TIER' : 'UPGRADE';
    upBtn.disabled = atMaxTier;
    upBtn.onclick = () => {
      if (atMaxTier) return;
      window.openModuleUpgradeOverlay?.(module.id);
    };
  }
  setHtmlIfChangedIn(modal, '#storage-upgrade-reqs', buildUpgradeReqsHtml(upgradeCost));
  if (_upgradeOverlayModuleId === module.id) patchModuleUpgradeOverlay();
}

function patchResearchLabModal(module, modal, qs) {
  module.synthesisSlots = normalizeSynthesisSlots(module.synthesisSlots);
  const moduleDef = getModuleDef(module.type);
  const hpPct = Math.round((module.health / Math.max(1, module.maxHealth)) * 100);
  const hpColor = hpPct > 60 ? '#4d8' : hpPct > 30 ? '#fa4' : '#f44';
  const moduleTier = Math.max(1, Math.min(10, module.level || 1));
  const tierColor = MINE_TIERS[moduleTier]?.color || '#8ab';
  const title = modal.querySelector('.storage-modal-title');
  if (title) title.textContent = moduleDef.panelTitle;
  qs('#storage-modal-name').textContent = `⬡ ${module.name}`;
  const tierEl = qs('#storage-tier-pill');
  tierEl.textContent = `TIER ${toRoman(moduleTier)}`;
  tierEl.style.color = isLightColor(tierColor) ? '#111' : '#fff';
  tierEl.style.background = tierColor;
  qs('#storage-health-value').textContent = `${fmtCompact(module.health)} / ${fmtCompact(module.maxHealth)}`;
  qs('#storage-health-value').style.color = hpColor;
  qs('#storage-health-bar').style.width = `${hpPct}%`;
  qs('#storage-health-bar').style.background = hpPct < 25 ? 'linear-gradient(90deg,#cc1010,#f44)' : 'linear-gradient(90deg,#2a8040,#4d8)';

  const online = isStorageOperational(module);
  const banner = qs('#module-operational-banner');
  if (banner) {
    banner.textContent = online ? 'ONLINE' : 'OFFLINE';
    banner.className = `lab-status-pill${online ? '' : ' offline'}`;
  }

  const powerPct = Math.round(((module.power || 0) / Math.max(1, module.powerCapacity || 1)) * 100);
  const currentPowerUsage = getStoragePowerUsage(module);
  setTextIfChangedIn(modal, '#storage-power-usage', `${currentPowerUsage.toFixed(1).replace(/\.0$/, '')}/s`);
  setTextIfChangedIn(modal, '#storage-power-value', `${fmtCompact(module.power || 0)} / ${fmtCompact(module.powerCapacity)}`);
  const powerBar = qs('#storage-power-bar');
  if (powerBar) {
    powerBar.style.width = `${powerPct}%`;
    qs('#storage-power-value').classList.toggle('warn', powerPct < 25);
  }
  const noPower = (module.power || 0) <= 0;
  const noPowerEl = qs('#storage-no-power-warning');
  if (noPowerEl) noPowerEl.style.display = noPower ? '' : 'none';
  const buyPowerBtn = qs('#storage-buy-power-btn');
  if (buyPowerBtn) {
    const buyPowerCost = getModuleUpgradeCost(module).coins * 5;
    buyPowerBtn.style.display = noPower ? '' : 'none';
    buyPowerBtn.disabled = state.coins < buyPowerCost;
    buyPowerBtn.innerHTML = `BUY POWER <span style="color:#ffe066;">- $${fmtCompact(buyPowerCost)}</span>`;
  }

  setTextIfChangedIn(modal, '#lab-throughput-value', online ? 'ACTIVE' : 'OFFLINE');
  const activeSlots = normalizeSynthesisSlots(module.synthesisSlots).filter(Boolean).length;
  setTextIfChangedIn(modal, '#lab-synth-count', `${activeSlots} / ${SYNTHESIS_SLOT_COUNT}`);

  const labInfo = getLabModuleNetworkInfo(module.id, state.modules, state.nodes, state.base.level);
  setHtmlIfChangedIn(modal, '#lab-linked-resources', buildLabLinkedResourcesHtml(module, labInfo, getLabUsedIngredientIds(module)));

  // Only rebuild slot DOM when assignment/tier changes — avoids restarting CSS timers every patch.
  const slotsEl = qs('#lab-synth-slots');
  if (slotsEl) {
    const slots = normalizeSynthesisSlots(module.synthesisSlots);
    const slotsSig = `${module.level || 1}|${slots.join(',')}`;
    if (slotsEl.dataset.synthSig !== slotsSig) {
      slotsEl.dataset.synthSig = slotsSig;
      slotsEl.innerHTML = buildSynthesisSlotsHtml(module);
    }
  }
  bindTippyIn(modal);
  maybePatchNetworkTab(modal, module);

  const upgradeCost = getModuleUpgradeCost(module);
  const atMaxTier = module.level >= 10;
  const upBtn = qs('#storage-upgrade-btn');
  if (upBtn) {
    upBtn.textContent = atMaxTier ? '★ MAX TIER' : 'UPGRADE';
    upBtn.disabled = atMaxTier || noPower;
    upBtn.onclick = () => {
      if (atMaxTier) return;
      window.openModuleUpgradeOverlay?.(module.id);
    };
  }
  // Keep hidden legacy node in sync for any callers
  setHtmlIfChangedIn(modal, '#storage-upgrade-reqs', buildUpgradeReqsHtml(upgradeCost));
  if (_upgradeOverlayModuleId === module.id) patchModuleUpgradeOverlay();
}

export function patchModuleModal(moduleId = state.selectedModule, modalRoot = null) {
  const module = getModuleById(moduleId);
  const modal = modalRoot || getStorageModalWindow(moduleId);
  const title = modal?.querySelector('.storage-modal-title');
  if (!module || !title || !modal) return;
  const qs = (selector) => modal.querySelector(selector);
  if (!qs('#storage-modal-name')) { renderModuleModal(moduleId, modal); return; }

  if (isStorageModule(module)) {
    if (!qs('.st-layout')) { renderModuleModal(moduleId, modal); return; }
    patchStorageFacilityModal(module, modal, qs);
    return;
  }

  if (isDroneLabModule(module)) {
    if (!qs('.dl-layout')) { renderModuleModal(moduleId, modal); return; }
    patchDroneLabModal(module, modal, qs);
    return;
  }

  if (isPowerStationModule(module)) {
    if (!qs('.ps-layout')) { renderModuleModal(moduleId, modal); return; }
    patchPowerStationModal(module, modal, qs);
    return;
  }

  if (isPowerPoleModule(module)) {
    if (!qs('.pp-layout')) { renderModuleModal(moduleId, modal); return; }
    patchPowerPoleModal(module, modal, qs);
    return;
  }

  if (isLabTowerModule(module)) {
    if (!qs('.lt-layout')) { renderModuleModal(moduleId, modal); return; }
    patchLabTowerModal(module, modal, qs);
    return;
  }

  if (isResearchLabModule(module)) {
    if (!qs('.rl-layout')) { renderModuleModal(moduleId, modal); return; }
    patchResearchLabModal(module, modal, qs);
    return;
  }

  const moduleDef = getModuleDef(module.type);
  const hpPct = Math.round((module.health / Math.max(1, module.maxHealth)) * 100);
  const hpColor = hpPct > 60 ? '#4d8' : hpPct > 30 ? '#fa4' : '#f44';
  const moduleTier = Math.max(1, Math.min(10, module.level || 1));
  const tierColor = MINE_TIERS[moduleTier]?.color || '#8ab';
  title.textContent = moduleDef.panelTitle;
  qs('#storage-modal-name').textContent = `⬡ ${module.name}`;
  qs('#storage-tier-pill').textContent = `TIER ${toRoman(moduleTier)}`;
  qs('#storage-tier-pill').style.color = isLightColor(tierColor) ? '#111' : '#fff';
  qs('#storage-tier-pill').style.background = tierColor;
  qs('#storage-health-value').textContent = `${fmt(module.health)} / ${fmt(module.maxHealth)}`;
  qs('#storage-health-value').style.color = hpColor;
  qs('#storage-health-bar').style.width = `${hpPct}%`;
  qs('#storage-health-bar').style.background = hpPct < 25 ? 'linear-gradient(90deg,#cc1010,#f44)' : 'linear-gradient(90deg,#2a8040,#4d8)';

  const upgradeCost = getModuleUpgradeCost(module);
  const atMaxTier = module.level >= 10;
  const canUpgrade = !atMaxTier && state.coins >= upgradeCost.coins && Object.entries(upgradeCost.reqs).every(([r, n]) => (state.resources[r] || 0) >= n);
  setHtmlIfChangedIn(modal, '#storage-upgrade-reqs', `<span class="bp-craft-req ${state.coins >= upgradeCost.coins ? 'met' : 'unmet'}">$${fmt(upgradeCost.coins)}</span>${Object.entries(upgradeCost.reqs).map(([r, n]) => `<span class="bp-craft-req ${(state.resources[r] || 0) >= n ? 'met' : 'unmet'}">${RESOURCE_DEFS[r].label}: ${fmt(n)}</span>`).join('')}`);
  const upBtn = qs('#storage-upgrade-btn');
  upBtn.textContent = atMaxTier ? '★ MAX TIER' : (isPowerPoleModule(module) || isLabTowerModule(module) || isPowerStationModule(module) || isPoweredBuildingModule(module)) ? 'UPGRADE' : `⬆ UPGRADE ${moduleDef.name.toUpperCase()}`;
  upBtn.disabled = !canUpgrade || (isPoweredBuildingModule(module) && (module.power || 0) <= 0);

  const invRows = Object.entries(module.inventory || {})
    .filter(([, amt]) => amt > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([type, amt]) => `<div class="module-inventory-row"><span style="display:flex;align-items:center;gap:8px;color:${RESOURCE_DEFS[type].color}">${resourceIconHtml(type, 14)}${RESOURCE_DEFS[type].label}</span><span style="color:#ffe066">${fmt(amt)}</span></div>`)
    .join('');

  if (isPoweredBuildingModule(module)) {
    const buyPowerCost = upgradeCost.coins * 5;
    const powerPct = Math.round(((module.power || 0) / Math.max(1, module.powerCapacity || 1)) * 100);
    const currentPowerUsage = getStoragePowerUsage(module);
    const networkInfo = getPowerModuleNetworkInfo(module.id, state.modules, state.turrets);
    const linkedPoles = networkInfo.poles;
    const linkedStorages = networkInfo.storages;
    const linkedStations = networkInfo.stations;
    const linkedTurrets = networkInfo.turrets;
    const networkSig = `${linkedStations.map((entry) => entry.id).sort((a, b) => a - b).join(',')}|${linkedPoles.map((entry) => entry.id).sort((a, b) => a - b).join(',')}|${linkedStorages.map((entry) => entry.id).sort((a, b) => a - b).join(',')}|${linkedTurrets.map((entry) => entry.id).sort((a, b) => a - b).join(',')}`;
    const activeDroneCount = isDroneLabModule(module) ? (state.drones || []).filter(d => d.labId === module.id).length : 0;
    setTextIfChangedIn(modal, '#storage-used-value', isDroneLabModule(module) ? `${activeDroneCount} / ${module.droneCapacity || 2}` : `${fmt(getStorageTotalInventory(module))} / ${fmt(module.storageCapacity)}`);
    const usedBar = qs('#storage-used-bar');
    if (usedBar) {
      usedBar.style.width = `${isDroneLabModule(module) ? Math.max(0, Math.min(100, (activeDroneCount / Math.max(1, module.droneCapacity || 2)) * 100)) : Math.max(0, Math.min(100, (getStorageTotalInventory(module) / Math.max(1, module.storageCapacity)) * 100))}%`;
    }
    setTextIfChangedIn(modal, '#storage-power-usage', `${currentPowerUsage.toFixed(1).replace(/\.0$/, '')}/s`);
    setTextIfChangedIn(modal, '#storage-power-value', `${fmt(module.power || 0)} / ${fmt(module.powerCapacity)}`);
    const powerBarEl = qs('#storage-power-bar');
    if (powerBarEl) powerBarEl.style.width = `${powerPct}%`;
    const noPower = (module.power || 0) <= 0;
    const noPowerEl = qs('#storage-no-power-warning');
    if (noPowerEl) noPowerEl.style.display = noPower ? '' : 'none';
    const buyPowerBtn = qs('#storage-buy-power-btn');
    if (buyPowerBtn) {
      buyPowerBtn.style.display = noPower ? '' : 'none';
      buyPowerBtn.disabled = state.coins < buyPowerCost;
    }
    if (isStorageModule(module)) {
      const invList = qs('#storage-inventory-list');
      if (invList) invList.innerHTML = invRows || '<div class="module-empty-note">No stored resources yet.</div>';
    }
    const summaryEl = qs('#power-station-link-summary');
    if (summaryEl && summaryEl.dataset.networkSig !== networkSig) {
      const tooltipLines = [
        ...linkedStations.map((station) => `POWER STATION: ${escapeHtml(station.name)}`),
        ...linkedPoles.map((pole) => `POLE: ${escapeHtml(pole.name)}`),
        ...linkedStorages.map((storage) => `${escapeHtml(getModuleLabel(storage).toUpperCase())}: ${escapeHtml(storage.name)}`),
        ...linkedTurrets.map((turret) => `TURRET: ${escapeHtml(turret.name || getCraft('turrets', turret.type)?.name || 'Turret')}`),
      ];
      const summaryParts = [
        linkedStations.length > 0 ? `${linkedStations.length}x Power Stations` : '',
        linkedPoles.length > 0 ? `${linkedPoles.length}x Poles` : '',
        linkedStorages.length > 0 ? `${linkedStorages.length}x Powered Buildings` : '',
        linkedTurrets.length > 0 ? `${linkedTurrets.length}x Turrets` : '',
      ].filter(Boolean);
      const tooltipText = tooltipLines.length ? tooltipLines.join('<br>') : 'No linked modules.';
      summaryEl.dataset.networkSig = networkSig;
      summaryEl.textContent = summaryParts.join(' • ') || 'No linked modules';
      bindTippy(summaryEl, tooltipText);
    }
    if (isDroneLabModule(module)) {
      const labDrones = (state.drones || []).filter(d => d.labId === module.id);
      const droneStatusHtml = labDrones.length
        ? labDrones.map(d => {
            const isScanning = d.status === 'scanning';
            const isFlying   = d.status === 'flying';
            const isLaunching = d.status === 'idle' && d.taskNodeId !== null;
            const statusText = isScanning
              ? `<span style="color:#40ffcc">Scanning and Salvaging a: Crashed Ship</span>`
              : isFlying
              ? `<span style="color:#4ab8ff">Flying to Crashed Ship</span>`
              : isLaunching
              ? `<span style="color:#ffe066">Launching…</span>`
              : `<span style="color:#556">Idle</span>`;
            return `<div class="module-inventory-row"><span style="color:#8af">${d.name}</span>${statusText}</div>`;
          }).join('')
        : '<div class="module-empty-note">No drones deployed.</div>';
      setHtmlIfChangedIn(modal, '#drone-bay-status-list', droneStatusHtml);
    }
  } else if (isPowerStationModule(module) || isPowerPoleModule(module) || isLabTowerModule(module)) {
    const networkInfo = getPowerModuleNetworkInfo(module.id, state.modules, state.turrets);
    const networkState = getPowerNetworkState(state.modules, state.turrets);
    const linkedPoles = networkInfo.poles;
    const linkedStorages = networkInfo.storages;
    const linkedStations = networkInfo.stations;
    const linkedTurrets = networkInfo.turrets;
    const noFuelIds = getNoFuelNetworkIds(state.modules, state.turrets);
    const noFuelWarning = document.getElementById('power-station-no-fuel-warning');
    const inputQty = getPowerResourceConsumption(module);
    const linkedConsumers = linkedStorages.length + linkedTurrets.length;
    const fuelCost = inputQty * linkedConsumers;
    const networkSig = `${linkedStations.map((entry) => entry.id).sort((a, b) => a - b).join(',')}|${linkedPoles.map((entry) => entry.id).sort((a, b) => a - b).join(',')}|${linkedStorages.map((entry) => entry.id).sort((a, b) => a - b).join(',')}|${linkedTurrets.map((entry) => entry.id).sort((a, b) => a - b).join(',')}`;
    if (isPowerStationModule(module)) {
      const fuelSelect = qs('#power-station-fuel-select');
      if (fuelSelect) {
        const optionsHtml = getPowerFuelOptions().map((option) => `<option value="${option.type}" ${module.fuelResource === option.type ? 'selected' : ''}>${option.label}</option>`).join('');
        if (fuelSelect.innerHTML !== optionsHtml) fuelSelect.innerHTML = optionsHtml;
      }
      const fuelType = module.fuelResource || 'iron';
      const fuelName = RESOURCE_DEFS[fuelType].label;
      const powerOutput = getPowerStationEffectiveOutput(module, linkedConsumers);
      const powerOutputText = powerOutput.toFixed(1).replace(/\.0$/, '');
      const noFuel = !hasPowerStationFuel(module);
      const offline = (module.health || 0) <= 0 || noFuel;
      const inputText = `${fuelCost} ${fuelName}`;
      const outputText = `${powerOutputText}/s`;
      const totalLoad = linkedStorages.reduce((sum, storage) => sum + getStoragePowerUsage(storage), 0) + linkedTurrets.reduce((sum, turret) => sum + (turret.powerUsage || 0), 0);
      const totalLoadText = totalLoad.toFixed(1).replace(/\.0$/, '');
      const netDelta = powerOutput - totalLoad;
      const netDeltaText = `${netDelta >= 0 ? '+' : ''}${netDelta.toFixed(1).replace(/\.0$/, '')}`;
      const statusColor = netDelta > 0 ? '#6fff9a' : netDelta < 0 ? '#ff8a8a' : '#ffe066';
      const statusLabel = netDelta > 0 ? 'Surplus' : netDelta < 0 ? 'Deficit' : 'Balanced';
      const facilityLabel = linkedConsumers === 1 ? 'Consumer' : 'Consumers';
      const operationalBanner = qs('#module-operational-banner');
      const deficitWarning = qs('#power-station-deficit-warning');
      const infoBadge = qs('#power-station-info-badge');
      setTextIfChangedIn(modal, '#power-station-fuel-rate', inputText);
      setTextIfChangedIn(modal, '#power-station-fuel-output', outputText);
      setHtmlIfChangedIn(modal, '#power-station-fuel-cost', `${totalLoadText}/s<div class="power-station-fuel-sub">(${linkedConsumers} ${facilityLabel})</div>`);
      setHtmlIfChangedIn(modal, '#power-station-fuel-status', `<span style="color:${statusColor};">${netDeltaText}/s</span><div class="power-station-fuel-sub" style="color:${statusColor};">${statusLabel}</div>`);
      const selectedFuelStored = module.inventory?.[fuelType] || 0;
      setTextIfChangedIn(modal, '#power-station-used-label', `△ FUEL: ${fuelName.toUpperCase()}`);
      setTextIfChangedIn(modal, '#power-station-used-value', `${fmt(selectedFuelStored)} / ${fmt(module.resourceCapacity || 0)}`);
      qs('#power-station-used-bar').style.width = `${Math.max(0, Math.min(100, (selectedFuelStored / Math.max(1, module.resourceCapacity || 1)) * 100))}%`;
      if (infoBadge) {
        bindTippy(infoBadge, buildPowerStationInfoTooltip({ fuelCost, fuelName, powerOutputText, totalLoadText, netDeltaText, statusLabel, noFuel }));
      }
      if (noFuelWarning) {
        noFuelWarning.textContent = `WARNING: NO ${fuelName.toUpperCase()}`;
        noFuelWarning.style.display = noFuel ? '' : 'none';
      }
      if (deficitWarning) deficitWarning.style.display = (!noFuel && netDelta < 0) ? '' : 'none';
      if (operationalBanner) {
        operationalBanner.textContent = offline ? 'OFFLINE' : 'ONLINE';
        operationalBanner.className = `module-status-banner ${offline ? 'module-status-banner-offline' : 'module-status-banner-online'}`;
      }
      setHtmlIfChangedIn(modal, '#power-station-network-consumers', buildPowerConsumerListHtml(linkedStorages, linkedTurrets));
    } else if (isPowerPoleModule(module)) {
      const operationalBanner = qs('#module-operational-banner');
      if (operationalBanner) {
        const online = (module.health || 0) > 0;
        operationalBanner.textContent = online ? 'ONLINE' : 'OFFLINE';
        operationalBanner.className = `module-status-banner ${online ? 'module-status-banner-online' : 'module-status-banner-offline'}`;
      }
      setTextIfChangedIn(modal, '#relay-range-value', `${module.relayRange || 0} TILES`);
      setTextIfChangedIn(modal, '#relay-range-blocks', Array.from({ length: Math.max(0, module.relayRange || 0) }, () => '■').join(' '));
      const totalLoad = linkedStorages.reduce((sum, storage) => sum + getStoragePowerUsage(storage), 0) + linkedTurrets.reduce((sum, turret) => sum + (turret.powerUsage || 0), 0);
      const activeStations = linkedStations.filter((station) => (station.health || 0) > 0 && hasPowerStationFuel(station));
      const offlineStations = linkedStations.filter((station) => (station.health || 0) > 0 && !hasPowerStationFuel(station));
      const totalOutput = activeStations.reduce((sum, station) => sum + getPowerStationEffectiveOutput(station, ((networkState.stationLinkedStorages.get(station.id) || []).length + (networkState.stationLinkedTurrets.get(station.id) || []).length)), 0);
      const totalOutputText = totalOutput.toFixed(1).replace(/\.0$/, '');
      const offlineOutput = offlineStations.reduce((sum, station) => sum + getPowerFuelOutput(station.fuelResource || 'iron'), 0);
      const netDelta = totalOutput - totalLoad;
      const statusColor = netDelta > 0 ? '#6fff9a' : netDelta < 0 ? '#ff8a8a' : '#ffe066';
      const statusLabel = netDelta > 0 ? 'Surplus' : netDelta < 0 ? 'Deficit' : 'Balanced';
      setHtmlIfChangedIn(modal, '#power-pole-network-output', `${totalOutputText}/s${offlineOutput > 0 ? `<div class="power-station-fuel-sub" style="color:#ff8a8a;">(-${offlineOutput}/s offline)</div>` : ''}`);
      setHtmlIfChangedIn(modal, '#power-pole-network-load', `${totalLoad.toFixed(1).replace(/\.0$/, '')}/s<div class="power-station-fuel-sub">(${linkedConsumers} Consumers)</div>`);
      setHtmlIfChangedIn(modal, '#power-pole-network-status', `<span style="color:${statusColor};">${netDelta >= 0 ? '+' : ''}${netDelta.toFixed(1).replace(/\.0$/, '')}/s</span><div class="power-station-fuel-sub" style="color:${statusColor};">${statusLabel}</div>`);
      setHtmlIfChangedIn(modal, '#power-station-network-consumers', buildPowerConsumerListHtml(linkedStorages, linkedTurrets));
      if (noFuelWarning) noFuelWarning.style.display = noFuelIds.has(module.id) ? '' : 'none';
    } else if (isLabTowerModule(module)) {
      const labInfo = getLabModuleNetworkInfo(module.id, state.modules, state.nodes, state.base.level);
      const operationalBanner = qs('#module-operational-banner');
      if (operationalBanner) {
        const online = (module.health || 0) > 0;
        operationalBanner.textContent = online ? 'ONLINE' : 'OFFLINE';
        operationalBanner.className = `module-status-banner ${online ? 'module-status-banner-online' : 'module-status-banner-offline'}`;
      }
      setTextIfChangedIn(modal, '#relay-range-value', `${module.relayRange || 0} TILES`);
      setHtmlIfChangedIn(modal, '#relay-range-blocks', `<span style="color:#8ff0c4;">${Array.from({ length: Math.max(0, module.relayRange || 0) }, () => '■').join(' ')}</span>`);
      setHtmlIfChangedIn(modal, '#lab-linked-resources', buildLabLinkedResourcesHtml(module, labInfo));
      const summaryEl = qs('#power-station-link-summary');
      if (summaryEl) {
        const towerSig = `${labInfo.labs.map((entry) => entry.id).sort((a, b) => a - b).join(',')}|${labInfo.towers.map((entry) => entry.id).sort((a, b) => a - b).join(',')}|${labInfo.resources.map((entry) => `${entry.tower.id}:${entry.node.id}`).sort().join(',')}`;
        if (summaryEl.dataset.networkSig !== towerSig) {
          const tooltipLines = [
            ...labInfo.labs.map((lab) => `RESEARCH LAB: ${escapeHtml(lab.name)}`),
            ...labInfo.towers.map((tower) => `LAB TOWER: ${escapeHtml(tower.name)}`),
          ];
          const summaryParts = [
            labInfo.labs.length > 0 ? `${labInfo.labs.length}x Research Labs` : '',
            (labInfo.towers.length + 1) > 0 ? `${labInfo.towers.length + 1}x Lab Towers` : '',
            labInfo.resources.length > 0 ? `${labInfo.resources.length}x Linked Nodes` : '',
          ].filter(Boolean);
          summaryEl.dataset.networkSig = towerSig;
          summaryEl.textContent = summaryParts.join(' • ') || 'No linked lab network';
          bindTippy(summaryEl, tooltipLines.join('<br>') || 'No linked lab network.');
        }
      }
    }
    const summaryEl = qs('#power-station-link-summary');
    if (summaryEl && summaryEl.dataset.networkSig !== networkSig) {
      const tooltipLines = [
        ...linkedStations.map((station) => `POWER STATION: ${escapeHtml(station.name)}`),
        ...linkedPoles.map((pole) => `POLE: ${escapeHtml(pole.name)}`),
        ...linkedStorages.map((storage) => `${escapeHtml(getModuleLabel(storage).toUpperCase())}: ${escapeHtml(storage.name)}`),
        ...linkedTurrets.map((turret) => `TURRET: ${escapeHtml(turret.name || getCraft('turrets', turret.type)?.name || 'Turret')}`),
      ];
      const summaryParts = [
        linkedStations.length > 0 ? `${linkedStations.length}x Power Stations` : '',
        linkedPoles.length > 0 ? `${linkedPoles.length}x Poles` : '',
        linkedStorages.length > 0 ? `${linkedStorages.length}x Powered Buildings` : '',
        linkedTurrets.length > 0 ? `${linkedTurrets.length}x Turrets` : '',
      ].filter(Boolean);
      const tooltipText = tooltipLines.length ? tooltipLines.join('<br>') : 'No linked modules.';
      summaryEl.dataset.networkSig = networkSig;
      summaryEl.textContent = summaryParts.join(' • ') || 'No linked modules';
      bindTippy(summaryEl, tooltipText);
    }
    setHtmlIfChangedIn(modal, '#storage-inventory-list', invRows || '<div class="module-empty-note">No stored fuel yet.</div>');
  }

  if (isPoweredBuildingModule(module)) {
    const operationalBanner = qs('#module-operational-banner');
    if (operationalBanner) {
      const online = isStorageOperational(module);
      operationalBanner.textContent = online ? 'ONLINE' : 'OFFLINE';
      operationalBanner.className = `module-status-banner ${online ? 'module-status-banner-online' : 'module-status-banner-offline'}`;
    }
  }
}

export function patchStorageModal() {
  const windows = getOpenStorageModalWindows();
  for (const modal of windows) {
    const moduleId = Number(modal.dataset.moduleId);
    if (Number.isFinite(moduleId)) patchModuleModal(moduleId, modal);
  }
}

export function cancelModulePlacement() {
  if (!state.placingModule) return;
  state.placingModule = false;
  state.placingModuleType = null;
  state.movingModule = null;
  const canvas = document.getElementById('main-canvas');
  if (canvas) canvas.style.cursor = '';
  if (refresh.ui) refresh.ui();
}

export function cancelStoragePlacement() {
  cancelModulePlacement();
}

window.upgradeStorageFacility = function(moduleId) {
  const module = getModuleById(moduleId);
  if (!module || module.level >= 10) return;
  const cost = getModuleUpgradeCost(module);
  if (state.coins < cost.coins) return;
  for (const [r, n] of Object.entries(cost.reqs)) if ((state.resources[r] || 0) < n) return;
  if (isPoweredBuildingModule(module) && (module.power || 0) <= 0) return;
  spendCoins(cost.coins);
  for (const [r, n] of Object.entries(cost.reqs)) state.resources[r] -= n;
  module.level++;
  const nextStats = getModuleStats(module.type, module.level);
  const prevMaxHealth = module.maxHealth;
  module.maxHealth = nextStats.maxHealth;
  module.health = Math.min(module.health + (module.maxHealth - prevMaxHealth), module.maxHealth);
  Object.assign(module, nextStats);
  if (isPoweredBuildingModule(module)) module.power = Math.min(module.power, module.powerCapacity);
  invalidateNetworkCache();
  addLog(`${module.name} upgraded to Tier ${module.level}.`);
  if (refresh.ui) refresh.ui();
  patchModuleModal(moduleId);
};

window.buyStoragePower = function(moduleId) {
  const module = getModuleById(moduleId);
  if (!module || !isPoweredBuildingModule(module)) return;
  const cost = getModuleUpgradeCost(module).coins * 5;
  if (state.coins < cost) return;
  spendCoins(cost);
  module.power = module.powerCapacity;
  addLog(`${module.name} restored to full power for ${fmt(cost)}¢.`);
  if (refresh.ui) refresh.ui();
  patchModuleModal(moduleId);
};

window.startMoveStorage = function(moduleId) {
  const module = getModuleById(moduleId);
  if (!module) return;
  state.movingModule = moduleId;
  if (state.selectedModule === moduleId) state.selectedModule = null;
  state.placingModule = true;
  state.placingModuleType = module.type || STORAGE_FACILITY_ID;
  closeStorageModal(moduleId);
  addLog(`↔ Click a valid ${getModuleFootprintLabel(module)} area to move ${module.name}. Press Esc to cancel.`);
  const canvas = document.getElementById('main-canvas');
  if (canvas) canvas.style.cursor = 'crosshair';
};

window.confirmSellStorage = function(moduleId) {
  const module = getModuleById(moduleId);
  if (!module) return;
  const refundCoins = getModuleInvestedCoins(module);
  const label = getModuleLabel(module);
  if (window.openModuleSellOverlay) {
    window.openModuleSellOverlay(moduleId, module.name, label, refundCoins);
    return;
  }
};

window.sellStorageFacility = function(moduleId, refundCoins) {
  const module = getModuleById(moduleId);
  if (!module) return;
  if (!addCoins(refundCoins)) return;
  if (isPoweredBuildingModule(module) || isPowerStationModule(module)) {
    for (const ship of state.ships) {
      if ((ship.depotType === 'storage' || ship.depotType === 'power_station') && ship.depotId === moduleId) {
        ship.depotType = 'base';
        ship.depotId = null;
        if (ship.status === 'returning' && ship.cargo > 0) {
          const base = gridToWorld(BASE_COL, BASE_ROW);
          ship.destX = base.x;
          ship.destY = base.y + TILE_H / 2 - 20;
        }
      }
      if ((ship.pickupType === 'storage' || ship.pickupType === 'power_station') && ship.pickupId === moduleId) {
        ship.pickupType = null;
        ship.pickupId = null;
      }
    }
  }
  state.modules = state.modules.filter(entry => entry.id !== moduleId);
  invalidateNetworkCache();
  closeStorageModal(moduleId);
  addLog(`${module.name} sold — recovered ${fmt(refundCoins)}¢.`);
  if (refresh.ui) refresh.ui();
};

function getFuelResourceTier(type) {
  return Number(Object.entries(MINE_TIERS).find(([, t]) => t.resources?.includes(type))?.[0] || 99);
}

/** Active mining yield rates by resource type (units per minute). Matches Resources panel formula. */
function getMiningYieldPerMinute() {
  const yields = Object.create(null);
  for (const ship of state.ships || []) {
    if (ship.targetNode == null || ship.status === 'idle') continue;
    const node = state.nodes.find((n) => n.id === ship.targetNode);
    if (!node?.type) continue;
    const rate = 60 / (1.5 / Math.max(0.01, ship.mineSpeed || 1));
    yields[node.type] = (yields[node.type] || 0) + rate;
  }
  return yields;
}

let _fuelPickerModuleId = null;

window.openFuelPickerOverlay = function(moduleId) {
  const module = getModuleById(moduleId);
  if (!module || !isPowerStationModule(module)) return;
  window.closeSynthesisOverlay?.();
  window.closeModuleUpgradeOverlay?.();
  _fuelPickerModuleId = moduleId;
  renderFuelPickerList();
  const overlay = document.getElementById('fuel-picker-overlay');
  if (overlay) {
    overlay.classList.add('show');
    overlay.onclick = (e) => { if (e.target === overlay) window.closeFuelPickerOverlay(); };
  }
};

window.closeFuelPickerOverlay = function() {
  _fuelPickerModuleId = null;
  hideAllTippies();
  const overlay = document.getElementById('fuel-picker-overlay');
  if (overlay) {
    destroyTippiesIn(overlay);
    overlay.classList.remove('show');
    overlay.onclick = null;
  }
};

window.refreshFuelPickerIfOpen = function(moduleId = null) {
  if (_fuelPickerModuleId == null) return;
  if (moduleId != null && moduleId !== _fuelPickerModuleId) return;
  renderFuelPickerList();
};

function renderFuelPickerList() {
  const list = document.getElementById('fuel-picker-list');
  if (!list || _fuelPickerModuleId == null) return;
  const module = getModuleById(_fuelPickerModuleId);
  if (!module) return;
  const stationLevel = Math.max(1, module.level || 1);
  const inputPerConsumer = getPowerResourceConsumption(module);
  const networkInfo = getPowerModuleNetworkInfo(module.id, state.modules, state.turrets);
  const consumers = (networkInfo.storages?.length || 0) + (networkInfo.turrets?.length || 0);
  const current = module.fuelResource || 'iron';

  const yields = getMiningYieldPerMinute();
  // Burn uses actual consumer count (0 consumers = 0 burn)
  const burnPerSec = inputPerConsumer * Math.max(0, consumers);
  const burnPerMin = burnPerSec * 60;

  list.innerHTML = getPowerFuelOptions().map((opt) => {
    const tier = getFuelResourceTier(opt.type);
    const unlocked = tier <= stationLevel;
    const selected = opt.type === current;
    const stored = module.inventory?.[opt.type] || 0;
    const color = RESOURCE_DEFS[opt.type]?.color || '#cde';
    const eff = inputPerConsumer > 0 ? (opt.output / inputPerConsumer) : 0;
    const yieldPerMin = yields[opt.type] || 0;
    const importPerMin = getModuleImportPerMinute(module, opt.type);
    const yieldRounded = Math.round(yieldPerMin);
    const importRounded = Math.round(importPerMin);
    const burnRounded = Math.round(burnPerMin);
    // Sustainable only if deliveries into THIS station cover burn
    const importMeets = burnPerMin <= 0 ? importPerMin > 0 : importPerMin + 0.001 >= burnPerMin;
    const netDrainPerSec = Math.max(0, burnPerSec - (importPerMin / 60));
    const stockSeconds = netDrainPerSec > 0 ? stored / netDrainPerSec : Infinity;
    const stockEta = (() => {
      if (!Number.isFinite(stockSeconds) || stockSeconds <= 0) return '';
      if (stockSeconds < 60) return `~${Math.max(1, Math.round(stockSeconds))}s left`;
      if (stockSeconds < 3600) return `~${Math.round(stockSeconds / 60)}m left`;
      return `~${(stockSeconds / 3600).toFixed(1)}h left`;
    })();
    const shortBy = Math.max(0, Math.round(burnPerMin - importPerMin));

    let supplyCls = 'none';
    let supplyLabel = 'No import';
    let supplyDetail = `${fmt(importRounded)}/m in · ${fmt(burnRounded)}/m burn · ${fmt(yieldRounded)}/m mined`;

    if (!unlocked) {
      supplyCls = 'locked';
      supplyLabel = `Need station T${tier}`;
      supplyDetail = `Unlocks at tier ${tier}`;
    } else if (burnPerMin <= 0) {
      supplyCls = importPerMin > 0 || yieldPerMin > 0 ? 'ok' : 'idle';
      supplyLabel = importPerMin > 0 ? 'Importing' : (yieldPerMin > 0 ? 'Mined (not delivered here)' : 'No power load');
      supplyDetail = burnPerMin <= 0
        ? `${fmt(importRounded)}/m in · ${fmt(yieldRounded)}/m mined · no burn`
        : supplyDetail;
    } else if (importMeets) {
      supplyCls = 'ok';
      supplyLabel = 'Meets demand';
      supplyDetail = `${fmt(importRounded)}/m in · ${fmt(burnRounded)}/m burn · ${fmt(yieldRounded)}/m mined`;
    } else if (stored > 0 && netDrainPerSec > 0) {
      // Imports alone cannot sustain — running down station stockpile
      supplyCls = 'emergency';
      supplyLabel = 'Emergency Stockpile';
      supplyDetail = `In short ${fmt(shortBy)}/m · ${stockEta || 'draining'} · ${fmt(yieldRounded)}/m mined`;
    } else if (importPerMin > 0) {
      supplyCls = 'short';
      supplyLabel = `Import short ${fmt(shortBy)}/m`;
      supplyDetail = `${fmt(importRounded)}/m in · ${fmt(burnRounded)}/m burn · ${fmt(yieldRounded)}/m mined`;
    } else if (yieldPerMin > 0) {
      supplyCls = 'short';
      supplyLabel = 'Mined, not delivered here';
      supplyDetail = `0/m in · ${fmt(burnRounded)}/m burn · ${fmt(yieldRounded)}/m mined`;
    } else {
      supplyCls = 'none';
      supplyLabel = 'Will starve';
      supplyDetail = `0/m in · ${fmt(burnRounded)}/m burn · 0/m mined`;
    }

    const lockedCls = unlocked ? '' : ' locked';
    const selCls = selected ? ' selected' : '';
    return `<button type="button" class="fuel-picker-card${lockedCls}${selCls} fuel-supply-${supplyCls}"
      ${unlocked ? '' : 'disabled'}
      onclick="selectPowerStationFuel('${opt.type}')">
      <div class="fuel-picker-icon">${resourceIconHtml(opt.type, 28)}</div>
      <div class="fuel-picker-main">
        <div class="fuel-picker-name" style="color:${color};">${escapeHtml(opt.label)}</div>
        <div class="fuel-picker-meta">
          <span>T${tier}</span>
          <span>Stock ${fmt(stored)}</span>
          ${selected ? '<span class="fuel-picker-current">ACTIVE</span>' : ''}
        </div>
        <div class="fuel-picker-supply fuel-supply-${supplyCls}">
          <span class="fuel-supply-dot"></span>
          <span class="fuel-supply-label">${supplyLabel}</span>
          <span class="fuel-supply-rates">${supplyDetail}</span>
        </div>
      </div>
      <div class="fuel-picker-stats">
        <div class="fuel-picker-stat"><span class="fuel-picker-stat-l">Input</span><span class="fuel-picker-stat-v">${fmt(inputPerConsumer)}/cons</span></div>
        <div class="fuel-picker-stat"><span class="fuel-picker-stat-l">Output</span><span class="fuel-picker-stat-v fuel-out">${opt.output}/s</span></div>
        <div class="fuel-picker-stat"><span class="fuel-picker-stat-l">Burn @${consumers || 0}</span><span class="fuel-picker-stat-v">${fmt(burnPerSec)}/s</span></div>
        <div class="fuel-picker-stat"><span class="fuel-picker-stat-l">Eff.</span><span class="fuel-picker-stat-v">${eff.toFixed(1)}×</span></div>
      </div>
      ${unlocked ? '' : `<div class="fuel-picker-lock">Requires Station Tier ${tier}</div>`}
    </button>`;
  }).join('');
}

window.selectPowerStationFuel = function(fuelResource) {
  if (_fuelPickerModuleId == null) return;
  const moduleId = _fuelPickerModuleId;
  const module = getModuleById(moduleId);
  if (!module || !isPowerStationModule(module)) return;
  const tier = getFuelResourceTier(fuelResource);
  if (tier > (module.level || 1)) return;
  if (!getPowerFuelOptions().some((o) => o.type === fuelResource)) return;
  module.fuelResource = fuelResource;
  window.closeFuelPickerOverlay();
  patchModuleModal(moduleId);
  if (refresh.ui) refresh.ui();
};

window.setPowerStationFuel = function(moduleId, fuelResource) {
  const module = getModuleById(moduleId);
  if (!module || !isPowerStationModule(module)) return;
  const tier = getFuelResourceTier(fuelResource);
  if (tier > (module.level || 1)) return;
  module.fuelResource = fuelResource;
  if (window.patchModuleModal) window.patchModuleModal(moduleId);
  else renderModuleModal(moduleId);
};

window.startCraftBuilding = function(moduleType = STORAGE_FACILITY_ID) {
  const moduleDef = getCraft('buildings', moduleType);
  const moduleConfig = getModuleDef(moduleType);
  if (!moduleDef) return;
  if (!state.researchUnlocks[moduleConfig.unlockId]) return;
  if (state.buildingCraftTimers?.[moduleType] && Date.now() < state.buildingCraftTimers[moduleType].endsAt) return;
  if (state.coins < moduleDef.cost) return;
  for (const [r, n] of Object.entries(moduleDef.reqs)) if ((state.resources[r] || 0) < n) return;
  spendCoins(moduleDef.cost);
  for (const [r, n] of Object.entries(moduleDef.reqs)) state.resources[r] -= n;
  const durationMs = getModuleCraftTimeMs(moduleType);
  const now = Date.now();
  if (!state.buildingCraftTimers) state.buildingCraftTimers = {};
  state.buildingCraftTimers[moduleType] = { startedAt: now, endsAt: now + durationMs, durationMs };
  addLog(`🛠 Crafting started: ${moduleDef.name} (${Math.ceil(durationMs / 1000)}s)`);
  scheduleBuildingCraftCompletion(moduleType, now + durationMs);
  if (refresh.ui) refresh.ui();
  if (window.isHdrPanelOpen?.('craft') || window._hdrPanelOpen === 'craft') { window.openHdrPanel?.('craft', { refresh: true, preserveScroll: true }); }
};

window.beginPlacingBuilding = function(moduleType = STORAGE_FACILITY_ID) {
  const queue = Array.isArray(state.unplacedModuleQueue) ? state.unplacedModuleQueue : [];
  if (!queue.includes(moduleType) && !state.movingModule) return;
  state.placingModule = true;
  state.placingModuleType = moduleType;
  if (window.dismissHdrModal) window.dismissHdrModal();
  if (window.dismissBasePanel) window.dismissBasePanel();
  const canvas = document.getElementById('main-canvas');
  if (canvas) canvas.style.cursor = 'crosshair';
};

window.syncBuildingCraftTimers = function() {
  if (!state.buildingCraftTimers) return;
  for (const [moduleType, timer] of Object.entries(state.buildingCraftTimers)) {
    if (!timer?.endsAt) continue;
    if (Date.now() >= timer.endsAt) completeCraftBuilding(moduleType);
    else scheduleBuildingCraftCompletion(moduleType, timer.endsAt);
  }
};

function completeCraftDrone() {
  const timer = state.droneCraftTimers?.['drone'];
  if (!timer) return;
  delete state.droneCraftTimers['drone'];
  const availableLab = state.modules.find(m => isDroneLabModule(m) && (m.droneCount || 0) < (m.droneCapacity || 2));
  if (availableLab) {
    availableLab.droneCount = (availableLab.droneCount || 0) + 1;
    addLog(`✅ Drone ready — assigned to ${availableLab.name}.`);
  } else {
    addLog(`✅ Drone built — no Drone Lab with available capacity.`);
  }
  if (refresh.header) refresh.header();
  if (refresh.ui) refresh.ui();
  if (window.isHdrPanelOpen?.('craft') || window._hdrPanelOpen === 'craft') { window.openHdrPanel?.('craft', { refresh: true, preserveScroll: true }); }
}

function scheduleDroneCraftCompletion(endsAt) {
  const wait = Math.max(0, endsAt - Date.now());
  setTimeout(() => {
    const timer = state.droneCraftTimers?.['drone'];
    if (!timer) return;
    if (Date.now() >= timer.endsAt) completeCraftDrone();
    else scheduleDroneCraftCompletion(timer.endsAt);
  }, wait + 5);
}

window.startCraftDrone = function() {
  const droneDef = getCraft('drones', 'drone');
  if (!droneDef) return;
  if (!state.researchUnlocks['drone_crafting']) return;
  if (state.droneCraftTimers?.['drone'] && Date.now() < state.droneCraftTimers['drone'].endsAt) return;
  if (state.coins < droneDef.cost) return;
  for (const [r, n] of Object.entries(droneDef.reqs || {})) if ((state.resources[r] || 0) < n) return;
  spendCoins(droneDef.cost);
  for (const [r, n] of Object.entries(droneDef.reqs || {})) state.resources[r] -= n;
  const durationMs = droneDef.craftTimeMs || 1000;
  const now = Date.now();
  if (!state.droneCraftTimers) state.droneCraftTimers = {};
  state.droneCraftTimers['drone'] = { startedAt: now, endsAt: now + durationMs, durationMs };
  addLog(`🛠 Crafting started: Drone (${Math.ceil(durationMs / 1000)}s)`);
  scheduleDroneCraftCompletion(now + durationMs);
  if (refresh.ui) refresh.ui();
  if (window.isHdrPanelOpen?.('craft') || window._hdrPanelOpen === 'craft') { window.openHdrPanel?.('craft', { refresh: true, preserveScroll: true }); }
};

window.syncDroneCraftTimers = function() {
  if (!state.droneCraftTimers) return;
  for (const [, timer] of Object.entries(state.droneCraftTimers)) {
    if (!timer?.endsAt) continue;
    if (Date.now() >= timer.endsAt) completeCraftDrone();
    else scheduleDroneCraftCompletion(timer.endsAt);
  }
};

// ── Synthesis recipe overlay ─────────────────────────────────
let _synthesisOverlayModuleId = null;
let _synthesisOverlaySlot = null;
let _upgradeOverlayModuleId = null;

window.openSynthesisOverlay = function(moduleId, slotIndex) {
  const module = getModuleById(moduleId);
  if (!module || !isResearchLabModule(module)) return;
  module.synthesisSlots = normalizeSynthesisSlots(module.synthesisSlots);
  _synthesisOverlayModuleId = moduleId;
  _synthesisOverlaySlot = slotIndex;
  const overlay = document.getElementById('synthesis-overlay');
  const label = document.getElementById('synthesis-slot-label');
  if (label) label.textContent = `Slot ${slotIndex + 1}`;
  renderSynthesisRecipeList();
  if (overlay) {
    overlay.classList.add('show');
    overlay.onclick = (e) => { if (e.target === overlay) window.closeSynthesisOverlay(); };
  }
};

window.closeSynthesisOverlay = function() {
  _synthesisOverlayModuleId = null;
  _synthesisOverlaySlot = null;
  hideTooltip();
  hideAllTippies();
  const overlay = document.getElementById('synthesis-overlay');
  if (overlay) {
    destroyTippiesIn(overlay);
    overlay.classList.remove('show');
    overlay.onclick = null;
  }
};

function renderSynthesisRecipeList() {
  const list = document.getElementById('synthesis-recipe-list');
  if (!list || _synthesisOverlayModuleId == null) return;
  const module = getModuleById(_synthesisOverlayModuleId);
  if (!module) return;
  const slots = normalizeSynthesisSlots(module.synthesisSlots);
  const currentId = slots[_synthesisOverlaySlot] || null;
  const used = new Set(slots.filter(Boolean));
  const labInfo = getLabModuleNetworkInfo(module.id, state.modules, state.nodes, state.base.level);
  const linkedCounts = getLinkedNodeCounts(labInfo);

  const labLevel = module.level || 1;
  list.innerHTML = SYNTHESIS_RECIPES.map((recipe) => {
    const isCurrent = recipe.id === currentId;
    const isUsedElsewhere = used.has(recipe.id) && !isCurrent;
    const { ok } = getRecipeStatus(recipe, linkedCounts);
    const locked = !ok && !isCurrent;
    const craftSec = getSynthesisCraftTime(recipe, labLevel);
    const needs = recipe.inputs.map((input) => {
      const linked = (linkedCounts.get(input.id) || 0) > 0;
      return `<span class="synthesis-need ${linked ? 'ok' : 'bad'}">${resourceIconHtml(input.id, 14)}<span class="synthesis-need-amt">${fmtCompact(input.amount)}</span></span>`;
    }).join('');
    let status = '';
    if (isCurrent) status = '<div class="synthesis-status active">CURRENT</div>';
    else if (isUsedElsewhere) status = '<div class="synthesis-status active">IN USE</div>';
    else if (ok) status = '<div class="synthesis-status ok">READY</div>';
    else status = '<div class="synthesis-status bad">NEED LINK</div>';
    return `<button type="button" class="synthesis-recipe-card${isUsedElsewhere || isCurrent ? ' used' : ''}${locked ? ' locked' : ''}"
      data-recipe-id="${recipe.id}"
      ${isUsedElsewhere || locked ? 'disabled' : ''}
      onclick="assignSynthesisRecipe('${recipe.id}')">
      ${resourceIconHtml(recipe.icon, 28)}
      <div>
        <div class="synthesis-recipe-name" style="color:${recipe.color};">${escapeHtml(recipe.name)}</div>
        <div class="synthesis-recipe-needs">${needs}</div>
      </div>
      <div class="synthesis-recipe-side">
        <div class="synthesis-rarity ${recipe.rarity}">${recipe.rarity.toUpperCase()}</div>
        <div class="synthesis-craft-time">${craftSec}s / unit</div>
        ${status}
      </div>
    </button>`;
  }).join('');

  list.querySelectorAll('.synthesis-recipe-card').forEach((card) => {
    const recipe = getSynthesisRecipe(card.dataset.recipeId);
    if (!recipe) return;
    const craftSec = getSynthesisCraftTime(recipe, labLevel);
    const tipHtml = [
      `<strong style="color:${recipe.color};">${escapeHtml(recipe.name)}</strong>`,
      `<span style="color:#8ab;">1 unit · ${craftSec}s at Tier ${labLevel}</span>`,
      ...recipe.inputs.map((input) => {
        const linked = (linkedCounts.get(input.id) || 0) > 0;
        const label = RESOURCE_DEFS[input.id]?.label || input.id;
        const color = RESOURCE_DEFS[input.id]?.color || '#cde';
        return `${resourceIconHtml(input.id, 13, 'margin-right:5px;position:relative;top:1px;')}<span style="color:${color};">${escapeHtml(label)}</span>: <span style="color:#ffe066;">${fmt(input.amount)}</span>${linked ? '' : ' <span style="color:#f88;">(not linked)</span>'}`;
      }),
    ].join('<br>');
    bindTippy(card, tipHtml);
  });
}

window.assignSynthesisRecipe = function(recipeId) {
  if (_synthesisOverlayModuleId == null || _synthesisOverlaySlot == null) return;
  const module = getModuleById(_synthesisOverlayModuleId);
  if (!module || !isResearchLabModule(module)) return;
  const recipe = getSynthesisRecipe(recipeId);
  if (!recipe) return;
  const labInfo = getLabModuleNetworkInfo(module.id, state.modules, state.nodes, state.base.level);
  if (!getRecipeStatus(recipe, getLinkedNodeCounts(labInfo)).ok) return;
  module.synthesisSlots = normalizeSynthesisSlots(module.synthesisSlots);
  const usedElsewhere = module.synthesisSlots.some((id, i) => id === recipeId && i !== _synthesisOverlaySlot);
  if (usedElsewhere) return;
  module.synthesisSlots[_synthesisOverlaySlot] = recipeId;
  window.closeSynthesisOverlay();
  patchModuleModal(module.id);
};

window.clearSynthesisSlot = function(moduleId, slotIndex) {
  const module = getModuleById(moduleId);
  if (!module || !isResearchLabModule(module)) return;
  module.synthesisSlots = normalizeSynthesisSlots(module.synthesisSlots);
  module.synthesisSlots[slotIndex] = null;
  patchModuleModal(moduleId);
};

// ── Module upgrade cost overlay ──────────────────────────────
window.openModuleUpgradeOverlay = function(moduleId) {
  const module = getModuleById(moduleId);
  if (!module || module.level >= 10) return;
  if (isPoweredBuildingModule(module) && (module.power || 0) <= 0) return;
  window.closeSynthesisOverlay?.();
  _upgradeOverlayModuleId = moduleId;
  const overlay = document.getElementById('module-upgrade-overlay');
  const title = document.getElementById('module-upgrade-title');
  const sub = document.getElementById('module-upgrade-sub');
  if (title) title.textContent = `◈ Upgrade ${getModuleLabel(module)}`;
  if (sub) sub.innerHTML = `Advance <strong>${escapeHtml(module.name)}</strong> to Tier ${toRoman(Math.min(10, (module.level || 1) + 1))}`;
  patchModuleUpgradeOverlay();
  if (overlay) {
    overlay.classList.add('show');
    overlay.onclick = (e) => { if (e.target === overlay) window.closeModuleUpgradeOverlay(); };
  }
};

function patchModuleUpgradeOverlay() {
  if (_upgradeOverlayModuleId == null) return;
  const module = getModuleById(_upgradeOverlayModuleId);
  const reqsEl = document.getElementById('module-upgrade-reqs');
  const confirmBtn = document.getElementById('module-upgrade-confirm');
  if (!module || !reqsEl) return;
  const cost = getModuleUpgradeCost(module);
  const canUpgrade = state.coins >= cost.coins
    && Object.entries(cost.reqs).every(([r, n]) => (state.resources[r] || 0) >= n)
    && !(isPoweredBuildingModule(module) && (module.power || 0) <= 0);
  reqsEl.innerHTML = buildUpgradeReqsHtml(cost);
  if (confirmBtn) {
    confirmBtn.disabled = !canUpgrade;
    confirmBtn.title = canUpgrade ? '' : 'Missing requirements';
  }
}

window.closeModuleUpgradeOverlay = function() {
  _upgradeOverlayModuleId = null;
  const overlay = document.getElementById('module-upgrade-overlay');
  if (overlay) {
    overlay.classList.remove('show');
    overlay.onclick = null;
  }
};

window.confirmModuleUpgradeOverlay = function() {
  const moduleId = _upgradeOverlayModuleId;
  if (moduleId == null) return;
  window.closeModuleUpgradeOverlay();
  window.upgradeStorageFacility?.(moduleId);
};

window.closeLabOverlays = function() {
  window.closeSynthesisOverlay?.();
  window.closeModuleUpgradeOverlay?.();
  window.closeFuelPickerOverlay?.();
};

state.modules = (state.modules || []).map((module, index) => normalizeModule(module, index + 1));
window.syncBuildingCraftTimers();
window.syncDroneCraftTimers();
window.openStorageModal = openStorageModal;
window.openModuleModal = openModuleModal;
window.closeStorageModal = closeStorageModal;
window.closeTopStorageModal = closeTopStorageModal;
window.renderStorageModal = renderStorageModal;
window.renderModuleModal = renderModuleModal;
window.patchStorageModal = patchStorageModal;
window.patchModuleModal = patchModuleModal;
window.cancelStoragePlacement = cancelStoragePlacement;
window.showHintTooltip = showHintTooltip;
window.hideTooltip = hideTooltip;
