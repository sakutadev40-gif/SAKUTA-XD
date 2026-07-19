/**
 * Registre central des commandes.
 * Chaque commande a : name, aliases, category, description, et un handler execute(sock, msg, args, context).
 *
 * Pour ajouter une commande : ajoute un objet dans la catégorie voulue.
 * Le menu (.menu) se génère automatiquement à partir de ce fichier.
 */

const general = require('./categories/general');
const group = require('./categories/group');
const download = require('./categories/download');

const CATEGORIES = {
  '📋 Général': general,
  '👥 Groupe': group,
  '⬇️ Téléchargement': download,
};

// Construit un index plat : commande -> handler (avec alias)
function buildCommandIndex() {
  const index = new Map();
  for (const catName of Object.keys(CATEGORIES)) {
    for (const cmd of CATEGORIES[catName]) {
      const names = [cmd.name, ...(cmd.aliases || [])];
      for (const n of names) {
        index.set(n.toLowerCase(), { ...cmd, category: catName });
      }
    }
  }
  return index;
}

const COMMAND_INDEX = buildCommandIndex();

module.exports = { CATEGORIES, COMMAND_INDEX };
