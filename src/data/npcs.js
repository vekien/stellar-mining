// ============================================================
// NPC REGISTRY
// ============================================================
import { PLAYER_TITLE as C } from '../constants.js';

export const NPCS = {
  juno: {
    id: 'juno',
    name: 'Admiral Juno',
    role: 'Commanding Officer',
    ship: 'Commanding Officer · ISV Hyperion',
    portrait: 'assets/images/npcs/juno.jpg',
    bio: "Admiral Juno commands the ISV Hyperion, Star Command's flagship vessel stationed in the outer belt. A decorated veteran of the Resource Wars, she oversees all civilian mining operations in the sector.",
    transmissionLines: {
      first_deposit:
        `Hey ${C} — Admiral Juno aboard the <strong>ISV Hyperion</strong>!<br><br>` +
        `You've just collected your first batch of resources. Sell them back to Star Command for coins, or use them to <strong>craft more ships</strong>.<br><br>` +
        `Tip: select a ship and click a <strong>different node</strong> to redirect it — you'll need a variety of materials to build new hulls!`,
      base_lv2_upgrade:
        `${C}, Admiral Juno here. Excellent work — your <strong>Base Station upgrade</strong> has expanded operational radius and increased local fleet availability.<br><br>` +
        `New deposits have appeared in range, including <strong>Oxygen</strong> and <strong>Silicon</strong>. Prioritize survey assignments and secure extraction lanes.<br><br>` +
        `Stay alert: this expansion edges us closer to <strong>pirate territory</strong>. Expect resistance as we push outward.`,
      base_down_no_deposit:
        `${C}, Juno here. Your base is currently <strong>offline</strong>.<br><br>` +
        `While integrity is at <strong>0 HP</strong>, incoming ships <strong>cannot deposit cargo</strong>.<br><br>` +
        `Repair the Base Station to restore docking and transfer operations.`,
    },
  },
  sera: {
    id: 'sera',
    name: 'Admiral Sera',
    role: 'Chief Science Officer',
    ship: 'Chief Science Officer · ISV Hyperion',
    portrait: 'assets/images/npcs/sera.jpg',
    bio: 'Admiral Sera serves as Chief Science Officer aboard the ISV Hyperion. She leads the research division and is responsible for analysing new resource deposits across the sector.',
    transmissionLines: {
      sera_base_upgrade:
        `${C}, Admiral Sera here. Your operation is growing fast — I'd strongly recommend <strong>upgrading your Base Station</strong>.<br><br>` +
        `A higher base level increases your <strong>ship capacity</strong>, expands your <strong>map range</strong> to reach richer nodes, and unlocks heavier ship classes in the Craft tab.<br><br>` +
        `Click the <strong>Base Station</strong> on the map and hit Upgrade when you're ready.`,
    },
  },
  vex: {
    id: 'vex',
    name: 'Captain Vex',
    role: 'Space Pirate',
    ship: 'Space Pirate Captain · The Marauder',
    portrait: 'assets/images/npcs/vex.jpg',
    bio: "Captain Vex is the most feared pirate in the outer belt. A former Star Command pilot gone rogue, he now leads a ruthless crew aboard The Marauder — raiding civilian mining operations and selling salvage to the highest bidder.",
  },
  rigs: {
    id: 'rigs',
    name: 'Rigs',
    role: 'Scrappy',
    ship: 'Scrappy · Sector 7 Scrap Yard',
    portrait: 'assets/images/npcs/rigs.jpg',
    bio: "Rigs runs the Scrap Yard on the edge of Sector 7 with two hands, a blowtorch, and zero patience for paperwork. She can strip a wrecked ship down to raw materials faster than anyone in the belt — and she always knows where the good salvage is.",
    shipLines: {
      scout:     "She's light, she's quick, and she'll get to that node before anyone else. Don't expect her to haul much back — but for scouting new deposits, she's exactly what you need.",
      swift:     "Pure speed. If you need resources fast and don't care about volume, the Sprinter is your girl. She burns hard and turns fast — just don't ask her to carry much.",
      hauler:    "Now we're talking. The Hauler is built for volume — slow and steady, but she'll bring back more per run than anything in the light class. Great for your main iron and copper routes.",
      freighter: `This is the big one, ${C}. The Freighter moves like a barge but carries like a warehouse. Assign her to your richest node and let her work. You won't be disappointed.`,
      default:   `She's all yours, ${C}. Get her out there.`,
    },
    transmissionLines: {
      rigs_upgrades:
        `${C}, Rigs here. Now you've got another ship out there — start thinking about <strong>upgrades</strong>.<br><br>` +
        `Select any ship and check the <strong>Upgrades</strong> section. Cargo capacity means bigger hauls, mine speed means faster turnaround. Every level compounds over time.`,
      first_craftable:
        `${C}, Rigs here. You've got the raw materials to build yourself a new ship.<br><br>` +
        `Head to the <strong>Base Station → Ships tab</strong> and let's get another hull in the fleet. More ships means more hauls — simple as that!`,
      base_unlock: (names) =>
        `${C}, it's Rigs down at the yard. Just got word your base hit a new tier — that means I can now build you a ${names}.<br><br>` +
        `Head to the <strong>Base Station → Craft</strong> tab and let's get to work!`,
      base_lv2_hauler:
        `Rigs here — with that base upgrade I can now build you a <strong>Hauler</strong>.<br><br>` +
        `It's slower than your light runners, but it's built to move serious volume. Perfect for steady iron and copper routes.<br><br>` +
        `Also, your current ships can now be upgraded to <strong>Tier II</strong> mining rigs. Check each ship's upgrades and push your fleet harder.<br><br>` +
        `Head to the <strong>Base Station → Ships</strong> tab when you're ready and I'll prep the frame.`,
      sol_idle: ({ names, count }) =>
        `Hey! ${count > 1 ? `${count} ships are` : `${names} is`} sitting idle and doing absolutely nothing!<br><br>` +
        `${count > 1 ? `That includes: ${names}.<br><br>` : ''}` +
        `Either assign ${count > 1 ? 'them' : 'it'} to a node or sell ${count > 1 ? 'them' : 'it'} for parts — dead weight costs you every SOL!`,
    },
  },
  kade: {
    id: 'kade',
    name: 'Kade',
    role: 'Revenue Marshal',
    ship: 'Revenue Marshal · Tax Division',
    portrait: 'assets/images/npcs/kade.png',
    bio: "Revenue Marshal Octavian Kade represents Earth's Star Space Agency Tax Division. Cold, meticulous, and utterly humourless — Kade has pursued unpaid sector levies across three star systems. He always collects.",
    transmissionLines: {
      kade_intro:
        `Greetings, ${C}. Revenue Marshal Octavian Kade — Earth's Star Space Agency, Tax Division.<br><br>` +
        `I've been monitoring your operation with great interest. I strongly advise you make full use of the <strong>Trade</strong> panel to sell your resources and maintain healthy liquidity.<br><br>` +
        `...One never knows when tax legislation might be extended to the outer belt. Stay compliant, ${C}.`,
    },
  },
  architect: {
    id: 'architect',
    name: 'The Architect',
    role: 'Cosmic Entity',
    ship: 'Cosmic Entity · Origin Unknown',
    portrait: 'assets/images/npcs/architect.png',
    bio: "Nothing is known about the entity that calls itself The Architect. It appears without warning, speaks in half-truths and riddles, and seems to know things that haven't happened yet. Whether it is a guide, a threat, or something else entirely — remains to be seen.",
  },
  vane: {
    id: 'vane',
    name: 'Dr. Elliot Vane',
    role: 'Lead Researcher',
    ship: 'Lead Researcher · Sector Science Division',
    portrait: 'assets/images/npcs/vane.jpg',
    bio: "Dr. Elliot Vane heads the Sector Science Division's field research unit. Chronically under-slept and over-caffeinated, he's responsible for translating raw resource data into usable research breakthroughs. If something strange is happening in the belt, Vane already knows — he just hasn't filed the report yet.",
    transmissionLines: {
      vane_solar_explain:
        `${C}, Dr. Vane here. That solar flare you just experienced is a Class-M electromagnetic surge — fairly common this far out in the belt.<br><br>` +
        `They selectively damage exposed resource depots. Oxygen is shielded by its containment units, but metals and silicates take the hit.<br><br>` +
        `I'm working on a shielding upgrade. Until then — expect more of these.`,
      vane_rp_upgrade:
        `Dr. Vane here. Quick systems note: each <strong>Base Upgrade</strong> now grants <strong>+1 Research Point</strong>.<br><br>` +
        `If you're planning expansion, time your upgrades around research unlocks to keep your progression efficient.`,
      vane_comet_explain: (hpPct) =>
        `${C}, Vane. That comet was a stray fragment from the outer debris field — they hit harder the longer you've been out here.<br><br>` +
        `Base integrity is now at <strong>${hpPct}%</strong>. ${hpPct < 30
          ? '<span style="color:#f88">Structural failure is a real risk at this level — repair immediately.</span>'
          : 'I recommend repairing via the Base Station when you get a chance.'}<br><br>` +
        `Upgrading the base increases its maximum health pool significantly.`,
    },
  },
  doran: {
    id: 'doran',
    name: 'Chief Doran',
    role: 'Power & Fuel Systems',
    ship: 'Power & Fuel Systems · Sector Operations',
    portrait: 'assets/images/npcs/doran.jpg',
    bio: "Chief Doran keeps the lights on across the entire sector. A veteran of three deep-space construction projects, he oversees all power grid and fuel distribution infrastructure. Quiet, methodical, and deeply unimpressed by anyone who doesn't respect load capacity.",
  },
  scarlett: {
    id: 'scarlett',
    name: 'Scarlett Dread',
    role: 'First Mate',
    ship: "First Mate · The Marauder",
    portrait: 'assets/images/npcs/scarlett.jpg',
    bio: "Scarlett Dread is Captain Vex's first mate and the most dangerous crew member aboard The Marauder. Where Vex plans, Scarlett executes — ruthlessly. She's never left a target standing and has no intention of starting now.",
  },
  android: {
    id: 'android',
    name: 'The Android',
    role: 'Synthetic Entity',
    ship: 'Cosmic Entity · Origin Unknown',
    portrait: 'assets/images/npcs/android.jpg',
    bio: "The Android is a synthetic entity of unknown origin. It does not speak — it observes. Its single glowing eye has been recorded in the vicinity of several unexplained sector incidents. Whether it is a remnant of ancient technology or something else entirely remains unknown.",
  },
  dax: {
    id: 'dax',
    name: 'Marshal Dax',
    role: 'Security Officer',
    ship: 'Security Officer · Sector Enforcement Division',
    portrait: 'assets/images/npcs/dax.jpg',
    bio: "Marshal Dax is the sector's chief enforcement officer. A veteran of countless belt skirmishes, he takes a dim view of pirates, smugglers, and anyone operating outside Star Command's jurisdiction. When Dax shows up, the situation has already gone past the point of warnings.",
    transmissionLines: {
      dax_lv3_intro:
        `Marshal Dax here, ${C}. <strong>Sector Enforcement</strong>. You're pushing into <strong>contested lanes</strong> now.<br><br>` +
        `<strong>Pirate scouts</strong> have been sighted near the outer rocks, and they won't ignore a growing operation for long.<br><br>` +
        `Keep your fleet moving, keep your base hardened, and <strong>expect contact</strong>.`
    },
  },
  kai: {
    id: 'kai',
    name: 'Kai',
    role: 'Weapons Smith',
    ship: 'Weapons Smith · Sector Defense Division',
    portrait: 'assets/images/npcs/kai.jpg',
    bio: "Kai is the sector's go-to weapons smith, responsible for building, maintaining and upgrading all defensive installations including turrets and base armaments. Quiet and precise, she lets her work do the talking — and her work is very, very good.",
    transmissionLines: {
      kai_lv3_intro:
        `Kai here. With your base at this tier, <strong>turret platforms</strong> are now on the table.<br><br>` +
        `Place turrets around your approach lanes and they'll automatically <strong>engage incoming invaders</strong>.<br><br>` +
        `Set <strong>overlapping fields of fire</strong> and you'll survive the first wave.`
    },
  },
  zoe: {
    id: 'zoe',
    name: 'Dr. Zoe Halden',
    role: 'Cosmologist',
    ship: 'Scientist / Cosmologist · Deep Field Observatory',
    portrait: 'assets/images/npcs/zoe.png',
    bio: 'Dr. Zoe Halden is a cosmologist assigned to the Deep Field Observatory network. She studies stellar drift, anomaly signatures, and long-range sector expansion models to predict where the richest deposits and highest-risk zones will emerge next.',
  },
};
