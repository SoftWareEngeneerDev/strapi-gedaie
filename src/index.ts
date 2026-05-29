import type { Core } from '@strapi/strapi';

// ---------------------------------------------------------------------------
// Permissions à configurer automatiquement au démarrage
// ---------------------------------------------------------------------------

/**
 * Permissions accordées au rôle "Public".
 *
 * ⚠️  create / update / saveTree sont publics pour le MVP (tests locaux).
 *     En production, restreindre ces actions au rôle "Authenticated".
 */
const PUBLIC_PERMISSIONS: Record<string, string[]> = {
  // Lecture seule — Angular frontend
  'target':        ['find', 'findOne'],
  'incident-type': ['find', 'findOne'],
  'decision-node': ['find', 'findOne'],
  'decision-edge': ['find', 'findOne'],

  // Lecture + écriture — React Flow Builder (MVP : public, à sécuriser en prod)
  'decision-tree': ['find', 'findOne', 'create', 'update', 'saveTree'],
};

// ---------------------------------------------------------------------------
// Logique de setup — idempotente (vérifie avant de créer, sans flag global)
// ---------------------------------------------------------------------------

async function setupPublicPermissions(strapi: Core.Strapi) {
  // Récupérer le rôle "Public" avec ses permissions actuelles
  const publicRole = await strapi
    .query('plugin::users-permissions.role')
    .findOne({
      where: { type: 'public' },
      populate: ['permissions'],
    });

  if (!publicRole) {
    strapi.log.warn('⚠️  Rôle public introuvable — permissions FAQ non configurées.');
    return;
  }

  // Construire le Set des actions déjà existantes
  const existingActions = new Set<string>(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (publicRole.permissions ?? []).map((p: any) => p.action as string)
  );

  // Filtrer les permissions manquantes
  const toCreate: Promise<unknown>[] = [];

  for (const [contentType, actions] of Object.entries(PUBLIC_PERMISSIONS)) {
    for (const action of actions) {
      const fullAction = `api::${contentType}.${contentType}.${action}`;

      if (!existingActions.has(fullAction)) {
        toCreate.push(
          strapi.query('plugin::users-permissions.permission').create({
            data: {
              action: fullAction,
              role: publicRole.id,
            },
          })
        );
      }
    }
  }

  if (toCreate.length === 0) {
    strapi.log.info('✅  Permissions FAQ déjà à jour.');
    return;
  }

  await Promise.all(toCreate);
  strapi.log.info(`✅  ${toCreate.length} permission(s) FAQ ajoutée(s) avec succès.`);
}

// ---------------------------------------------------------------------------
// Export principal Strapi
// ---------------------------------------------------------------------------

export default {
  /**
   * register — s'exécute avant l'initialisation de l'application.
   */
  register(/* { strapi }: { strapi: Core.Strapi } */) {},

  /**
   * bootstrap — s'exécute juste avant le démarrage.
   * Ajoute les permissions publiques manquantes à chaque redémarrage.
   * Idempotent : ne crée jamais de doublon.
   */
  async bootstrap({ strapi }: { strapi: Core.Strapi }) {
    await setupPublicPermissions(strapi);
  },
};
