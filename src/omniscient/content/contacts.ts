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

export const CONTACTS: readonly Contact[] = [MIRELA, TOMAS, ADAEZE];

export function getContact(id: string): Contact | null {
  return CONTACTS.find((contact) => contact.id === id) ?? null;
}
