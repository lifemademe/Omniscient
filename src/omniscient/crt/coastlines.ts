/**
 * Coarse continent outlines, in degrees.
 *
 * A lat/long grid with nothing inside it is a wireframe ball, not a planet. Every request
 * in the game arrives from a place, the globe is the screen where the player chooses which
 * place to care about, and until it read as Earth that choice had no weight - the points
 * were floating on graph paper.
 *
 * Deliberately crude. At 192x144 with hard pixels, anything more detailed than this turns
 * to noise: what has to survive is the silhouette of each landmass, because that is the
 * only part the eye uses to recognise a continent at a glance. Each entry is a closed ring
 * of [longitude, latitude] pairs traced at roughly ten-degree resolution.
 *
 * Accuracy here is a stylistic choice, not a claim - these are recognisable shapes for an
 * in-fiction CRT, not a survey.
 */
export type Ring = ReadonlyArray<readonly [number, number]>;

export const COASTLINES: ReadonlyArray<Ring> = [
  // North America
  [
    [-168, 65], [-156, 71], [-130, 70], [-110, 68], [-95, 72], [-80, 73],
    [-65, 60], [-56, 51], [-66, 44], [-75, 35], [-81, 25], [-97, 26],
    [-105, 20], [-115, 30], [-124, 40], [-130, 55], [-150, 59], [-168, 65],
  ],
  // South America
  [
    [-78, 8], [-70, 11], [-60, 5], [-50, 0], [-35, -6], [-38, -16],
    [-48, -25], [-58, -35], [-62, -42], [-68, -52], [-75, -50], [-73, -38],
    [-71, -25], [-70, -15], [-78, -5], [-78, 8],
  ],
  // Africa
  [
    [-17, 15], [-10, 25], [0, 34], [12, 33], [25, 32], [34, 30],
    [43, 12], [51, 12], [42, -1], [40, -15], [35, -25], [25, -34],
    [18, -34], [12, -18], [9, -1], [3, 6], [-8, 5], [-17, 15],
  ],
  // Europe, joined to Asia the way it actually is
  [
    [-10, 36], [0, 44], [3, 51], [8, 58], [22, 60], [30, 65],
    [40, 68], [60, 70], [80, 74], [105, 77], [130, 72], [160, 70],
    [180, 66], [170, 60], [140, 46], [128, 35], [122, 30], [110, 20],
    [100, 13], [92, 21], [70, 22], [60, 25], [50, 28], [43, 12],
    [34, 30], [28, 36], [18, 40], [12, 45], [-10, 36],
  ],
  // Australia
  [
    [114, -22], [122, -18], [131, -12], [142, -11], [147, -20],
    [153, -28], [147, -38], [138, -35], [129, -32], [118, -34], [114, -22],
  ],
  // Greenland - small, but its silhouette is the north of the frame
  [
    [-45, 60], [-25, 70], [-20, 76], [-30, 83], [-55, 82], [-60, 76], [-45, 60],
  ],
  // Britain and Ireland, because Portu Vech's world is a coastal, maritime one and the
  // north-east Atlantic is where the eye lands when the globe turns to the missions.
  [
    [-6, 50], [1, 52], [-1, 58], [-5, 58], [-6, 50],
  ],
];
