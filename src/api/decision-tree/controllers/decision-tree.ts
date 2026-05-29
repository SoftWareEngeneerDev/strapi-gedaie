/**
 * decision-tree controller
 */

import { factories } from '@strapi/strapi';

export default factories.createCoreController('api::decision-tree.decision-tree', ({ strapi }) => ({

  /**
   * PUT /api/decision-trees/:id/save-tree
   *
   * Sauvegarde l'arbre complet (nœuds + liens).
   * N'essaie PAS de faire findOne() du tree — cela échoue dans Strapi v5
   * quand le document a été créé via l'API REST publique.
   * On va droit au but : nettoyer les anciens nodes/edges puis recréer.
   */
  async saveTree(ctx) {
    const { id: documentId } = ctx.params;

    if (!documentId) {
      return ctx.badRequest('Le paramètre :id est requis.');
    }

    const { nodes = [], edges = [] } = ctx.request.body as {
      nodes: Array<{
        id: string;
        type: string;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data?: Record<string, any>;
        position?: { x: number; y: number };
      }>;
      edges: Array<{
        id: string;
        source: string;
        target: string;
        label?: string;
      }>;
    };

    try {
      // ── 1. Supprimer les nœuds existants liés à cet arbre ────────────────
      const existingNodes = await strapi.documents('api::decision-node.decision-node').findMany({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        filters: { decision_tree: { documentId: { $eq: documentId } } } as any,
      });

      strapi.log.info(`🗑️  ${existingNodes.length} nœud(s) à supprimer pour l'arbre ${documentId}`);

      await Promise.all(
        existingNodes.map((n) =>
          strapi.documents('api::decision-node.decision-node').delete({ documentId: n.documentId })
        )
      );

      // ── 2. Supprimer les liens existants liés à cet arbre ────────────────
      const existingEdges = await strapi.documents('api::decision-edge.decision-edge').findMany({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        filters: { decision_tree: { documentId: { $eq: documentId } } } as any,
      });

      strapi.log.info(`🗑️  ${existingEdges.length} lien(s) à supprimer pour l'arbre ${documentId}`);

      await Promise.all(
        existingEdges.map((e) =>
          strapi.documents('api::decision-edge.decision-edge').delete({ documentId: e.documentId })
        )
      );

      // ── 3. Créer les nouveaux nœuds ───────────────────────────────────────
      await Promise.all(
        nodes.map((node) =>
          strapi.documents('api::decision-node.decision-node').create({
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            data: {
              nodeId:        node.id,
              type:          node.type,
              label:         (node.data?.['label'] as string) ?? node.id,
              content:       node.data ?? {},
              positionX:     node.position?.x ?? 0,
              positionY:     node.position?.y ?? 0,
              decision_tree: documentId,
            } as any,
          })
        )
      );

      // ── 4. Créer les nouveaux liens ───────────────────────────────────────
      await Promise.all(
        edges.map((edge) =>
          strapi.documents('api::decision-edge.decision-edge').create({
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            data: {
              edgeId:        edge.id,
              source:        edge.source,
              target:        edge.target,
              label:         edge.label ?? '',
              decision_tree: documentId,
            } as any,
          })
        )
      );

      // ── 5. Publier l'arbre (idempotent — sans erreur si déjà publié) ──────
      try {
        await strapi.documents('api::decision-tree.decision-tree').publish({ documentId });
      } catch (publishErr) {
        // Déjà publié ou autre état non bloquant
        strapi.log.warn(`publish skipped for ${documentId}: ${publishErr}`);
      }

      strapi.log.info(`✅ Arbre sauvegardé : ${documentId} — ${nodes.length} nœud(s), ${edges.length} lien(s)`);

      // ── 6. Répondre avec un succès minimal ────────────────────────────────
      return ctx.send({
        data: {
          documentId,
          nodesCount: nodes.length,
          edgesCount:  edges.length,
        },
      });

    } catch (error) {
      strapi.log.error('Erreur saveTree :', error);
      return ctx.internalServerError("Erreur lors de la sauvegarde de l'arbre.");
    }
  },
}));
