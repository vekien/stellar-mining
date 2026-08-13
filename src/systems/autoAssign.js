// ============================================================
// AI NODE ASSIGNMENT — SOL auto-assign for mining ships
// ============================================================
import { state } from '../state.js';
import { RESOURCE_DEFS, getResourceTier, isStorableResource } from '../data/resources.js';
import { BASE_RANGE } from '../data/base.js';
import { BASE_COL, BASE_ROW } from '../constants.js';
import { isDemandedType } from './market.js';
import { addLog } from '../helpers.js';

function isNodeInRange(node) {
  if (!node?.gr) return false;
  const halfR = BASE_RANGE[(state.base.level || 1) - 1] || 6;
  const dist = Math.max(Math.abs(node.gr[0] - BASE_COL), Math.abs(node.gr[1] - BASE_ROW));
  return dist <= halfR && (node.minLevel || 1) <= (state.base.level || 1);
}

function shipCanMineType(ship, type) {
  if (!isStorableResource(type)) return false;
  const tier = getResourceTier(type);
  if (tier == null) return false;
  return (ship.mineTier || 1) >= tier && (ship.mineSpeed || 0) > 0;
}

function scoreResourceType(type) {
  const have = state.resources[type] || 0;
  const price = RESOURCE_DEFS[type]?.sellPrice || 1;
  const tier = getResourceTier(type) || 1;
  let score = 0;
  // Low / zero stockpile first
  if (have <= 0) score += 1000;
  else if (have < 100) score += 600;
  else if (have < 400) score += 300;
  else score += Math.max(0, 150 - Math.log10(have + 1) * 40);
  // Market demand
  if (isDemandedType(type)) score += 450;
  // High-value tier materials
  score += tier * 35 + price * 4;
  return score;
}

/**
 * Reassign all mining ships with autoAssign enabled.
 * Called once at SOL start.
 */
export function runAutoAssignPass() {
  if (!state.researchUnlocks?.ai_node_assignment) return;

  const ships = (state.ships || []).filter(
    (s) => s.autoAssign && (s.mineSpeed || 0) > 0 && s.status !== 'destroyed',
  );
  if (!ships.length) return;

  const occupied = new Set(
    (state.ships || [])
      .filter((s) => s.targetNode != null && !s.autoAssign)
      .map((s) => s.targetNode),
  );

  // Free auto-assign ships from nodes so we can replan
  for (const s of ships) {
    if (s.targetNode != null) occupied.delete(s.targetNode);
  }

  const freeNodes = (state.nodes || []).filter(
    (n) => isNodeInRange(n) && isStorableResource(n.type) && !occupied.has(n.id),
  );

  // Rank resource types
  const typeScores = new Map();
  for (const n of freeNodes) {
    if (!typeScores.has(n.type)) typeScores.set(n.type, scoreResourceType(n.type));
  }

  freeNodes.sort((a, b) => (typeScores.get(b.type) || 0) - (typeScores.get(a.type) || 0));

  let assigned = 0;
  const usedNodes = new Set();

  // Higher tier ships first so they claim high-tier nodes
  const ordered = [...ships].sort((a, b) => (b.mineTier || 1) - (a.mineTier || 1));

  for (const ship of ordered) {
    const node = freeNodes.find(
      (n) => !usedNodes.has(n.id) && shipCanMineType(ship, n.type),
    );
    if (!node) continue;
    usedNodes.add(node.id);
    occupied.add(node.id);
    if (typeof window.doAssign === 'function') {
      window.doAssign(ship.id, node.id);
    } else {
      ship.targetNode = node.id;
    }
    assigned += 1;
  }

  if (assigned > 0) {
    addLog(`◎ AI Assign: routed ${assigned} ship${assigned > 1 ? 's' : ''} for SOL ${state.sol}.`);
  }
}
