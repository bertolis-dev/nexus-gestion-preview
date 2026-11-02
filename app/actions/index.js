/**
 * Écran « index ».
 */

/** Table de toutes les actions (clics sur un élément data-action), réparties par domaine. */
import { actionsTable as site } from './site.js?v=3bfbbd4';
import { actionsTable as shell } from './shell.js?v=3bfbbd4';
import { actionsTable as sales } from './sales.js?v=3bfbbd4';
import { actionsTable as expenses } from './expenses.js?v=3bfbbd4';
import { actionsTable as bank } from './bank.js?v=3bfbbd4';
import { actionsTable as compta } from './compta.js?v=3bfbbd4';
import { actionsTable as vat } from './vat.js?v=3bfbbd4';
import { actionsTable as closing } from './closing.js?v=3bfbbd4';
import { actionsTable as micro } from './micro.js?v=3bfbbd4';
import { actionsTable as settings } from './settings.js?v=3bfbbd4';
import { actionsTable as clients } from './clients.js?v=3bfbbd4';
import { actionsTable as pilotage } from './pilotage.js?v=3bfbbd4';
import { actionsTable as commerce } from './commerce.js?v=3bfbbd4';
import { actionsTable as platform } from './platform.js?v=3bfbbd4';

const ACTIONS = {
  ...site,
  ...shell,
  ...sales,
  ...expenses,
  ...bank,
  ...compta,
  ...vat,
  ...closing,
  ...micro,
  ...settings,
  ...clients,
  ...pilotage,
  ...commerce,
  ...platform,
};

/** Exécute l'action demandée par un clic ; sans effet si elle est inconnue. */
export function runAction(action, ctx) {
  return ACTIONS[action]?.(ctx);
}
