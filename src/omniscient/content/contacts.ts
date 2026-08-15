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

export const CONTACTS: readonly Contact[] = [MIRELA, ILEANA, TOMAS, ADAEZE, VASILE];

export function getContact(id: string): Contact | null {
  return CONTACTS.find((contact) => contact.id === id) ?? null;
}
