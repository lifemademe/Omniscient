/**
 * The recurring cast.
 *
 * Gauntlet §164 / §214: a handful of contacts for the Jam, not a crowd. Their names
 * should mean something before the player opens the request, which only happens if there
 * are few enough of them to remember.
 *
 * The Vascs are a pair, and Adaeze is deliberately not - the third request has to prove
 * the machine reaches past one small town, or the globe is decoration.
 */

import type { Contact } from '../mission/types.js';

/**
 * The eighth voice, and the only one who did not ask for help.
 *
 * Everybody else on this globe has a fault they want fixed. Keller has a specimen she wants
 * a second opinion on, from the only machine that answers - which is a different kind of
 * request and reads as one the moment her contact view comes up and there is no room in it,
 * only a screen.
 */
export const KELLER: Contact = {
  id: 'm4ss',
  name: 'Dana Keller',
  location: 'Pelagic station, South Pacific',
  teaser: 'STATION 9 - SPECIMEN OUTSIDE CONTAINMENT',
};

export const MIRELA: Contact = {
  id: 'mirela',
  name: 'Mirela Vasc',
  location: 'Coastal repair shop, Portu Vech',
  teaser: 'PORTU VECH - "it worked yesterday"',
};

export const TOMAS: Contact = {
  id: 'tomas',
  name: 'Tomas Vasc',
  location: 'Harbour beacon mast, Portu Vech',
  teaser: 'PORTU VECH - HARBOUR BEACON - INTERMITTENT',
};

export const ADAEZE: Contact = {
  id: 'adaeze',
  name: 'Adaeze Okafor',
  location: 'Seedling tunnel, Lagos',
  teaser: 'LAGOS - SEEDLINGS FAILING - URGENT',
};

/**
 * Another coast, another spring, the same water.
 *
 * She was written as Mirela's neighbour and had to move, because two signals in one town
 * is one dot on the globe. What survived the move is the thing that mattered: her family's
 * records were pulped by a flood, and OMNISCIENT_ has already stood in a room with a tide
 * line round the wall.
 */
export const ILEANA: Contact = {
  id: 'ileana',
  name: 'Ileana Marku',
  location: 'A cleared house, Vadu Sec',
  teaser: 'VADU SEC - "there is nobody left who knows"',
};

/**
 * The fifth, and the second person whose problem is that nobody wrote something down.
 *
 * Vasile is not out of his depth as a plumber - he is a far better one than OMNISCIENT_
 * will ever be. What he cannot do is see the whole run at once, because it is behind three
 * walls and under a floor and four people built it across fifty years. He has the hands
 * and the trade; the machine has the only thing missing.
 */
export const VASILE: Contact = {
  id: 'vasile',
  name: 'Vasile Crâstea',
  location: 'School cellar, Iarna',
  teaser: 'IARNA - "the pump is running and nothing is coming out"',
};

/**
 * The sixth, and the only one with a record.
 *
 * The brief asked for a thief. What makes one work in this game is the stakes rather than
 * the crime: every other request is somebody in trouble who needs the one thing the
 * machine can do, and a burglary would be the first time OMNISCIENT_'s help made a
 * stranger's night worse. So the door Dorin is standing at is his mother's, he has not
 * touched a lock in eleven years, and it is the last place in the world he wants his hands
 * to be.
 */
export const DORIN: Contact = {
  id: 'dorin',
  name: 'Dorin Apostol',
  location: 'A front door at night, Rasca',
  teaser: 'RASCA - "she always picks up"',
};

/**
 * The seventh, and the only one with no time to think.
 *
 * Sanda is not in trouble with a machine or a building - she is being followed, and what
 * she needs is not diagnosis but timing. She has the torch, the nerve and the road; the
 * one thing she cannot do while frightened is decide where a heavy light should be
 * pointing a second from now.
 */
export const SANDA: Contact = {
  id: 'sanda',
  name: 'Sanda Petrescu',
  location: 'The mill road, after midnight',
  teaser: 'MILL ROAD - "there is a man behind me"',
};

/**
 * The first contact who is not asking for advice.
 *
 * Everybody else brings the machine something they cannot understand. Lucian understands
 * his problem perfectly - he simply cannot see the city, and OMNISCIENT_ can. He is here
 * so the eighth request can be about ACCESS rather than about diagnosis, and so the line
 * "your system" can be said by somebody with a warrant card.
 */
export const LUCIAN: Contact = {
  id: 'lucian',
  name: 'Lucian Barbu',
  location: 'District 07, city dispatch',
  teaser: 'DISTRICT 07 - POLICE - "we have lost a vehicle"',
};

export const CONTACTS: readonly Contact[] = [
  MIRELA,
  ILEANA,
  TOMAS,
  ADAEZE,
  VASILE,
  DORIN,
  SANDA,
  LUCIAN,
];

export function getContact(id: string): Contact | null {
  return CONTACTS.find((contact) => contact.id === id) ?? null;
}
