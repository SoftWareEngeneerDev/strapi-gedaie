/**
 * Routes custom pour decision-tree
 * Ces routes s'ajoutent aux routes CRUD générées automatiquement.
 */

export default {
  routes: [
    {
      /**
       * PUT /api/decision-trees/:id/save-tree
       * Sauvegarde l'arbre complet (nodes + edges) en une seule requête.
       * Utilisé par le React Flow Builder.
       */
      method:  'PUT',
      path:    '/decision-trees/:id/save-tree',
      handler: 'decision-tree.saveTree',
      config: {
        policies:    [],
        middlewares: [],
      },
    },
  ],
};
