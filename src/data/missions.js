// ============================================================
// MAIN MISSION DEFINITIONS — story scenario chain
// ============================================================

/**
 * Only one main mission active at a time.
 * Completing a mission unlocks the next via `nextMissionId`.
 */
export const MISSION_DEFS = {
  distress_beacon: {
    id: 'distress_beacon',
    name: 'Investigate Distress Beacon',
    kind: 'mission',
    unlockBaseLevel: 3,
    nextMissionId: null, // hang after complete for now
    npcId: 'sera',
    desc: 'A distress signal is pulsing somewhere in your operational range. Locate the beacon, decrypt its payload, and recover any data aboard.',
    lore:
      'Sensors locked an old emergency-band pulse inside your operational envelope. The carrier is degraded — half static, half protocol — but the beacon ID is real.\n\n' +
      'Admiral Sera wants the payload intact: find the unit on the map, force a decrypt, and haul any sealed data back to base for analysis. Whoever left it did not want it found easily.',
    stages: [
      {
        id: 'locate',
        title: 'Locate the Beacon',
        objectives: [
          { id: 'find_beacon', type: 'inspect_beacon', label: 'Trace the emergency pulse on the map' },
        ],
      },
      {
        id: 'decrypt',
        title: 'Decrypt the Signal',
        objectives: [
          { id: 'decrypt_beacon', type: 'decrypt_beacon', label: 'Crack the beacon’s sealed layers' },
        ],
      },
      {
        id: 'recover',
        title: 'Recover the Data Box',
        objectives: [
          { id: 'retrieve_box', type: 'deliver_key_item', keyItem: 'data_box', label: 'Haul the sealed Data Box home' },
        ],
      },
      {
        id: 'await_analysis',
        title: 'Await Analysis',
        objectives: [
          { id: 'await_sera', type: 'flag', flag: 'sera_analyzing', label: 'Hold while Sera unpicks the vault' },
        ],
      },
    ],
  },
};

export const MISSION_ORDER = ['distress_beacon'];

export function getMissionDef(id) {
  return MISSION_DEFS[id] || null;
}

export function listMissionDefs() {
  return MISSION_ORDER.map((id) => MISSION_DEFS[id]).filter(Boolean);
}
