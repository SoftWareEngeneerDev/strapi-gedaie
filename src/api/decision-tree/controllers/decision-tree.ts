/**
 * decision-tree controller
 */

import { factories } from '@strapi/strapi';

export default factories.createCoreController('api::decision-tree.decision-tree', ({ strapi }) => ({

  /**
   * PUT /api/decision-trees/:id/save-tree
   *
   * Sauvegarde l'arbre complet (nœuds + liens) en une seule opération.
   * Si :id vaut "new", l'arbre est créé automatiquement.
   *
   * Body attendu :
   * {
   *   name            : "Mon arbre",         ← requis si id === "new"
   *   incidentTypeId  : "xyz789",            ← optionnel, lie l'arbre à un incident
   *   nodes           : [{ id, type, data, position }],
   *   edges           : [{ id, source, target, label }]
   * }
   */
  async saveTree(ctx) {
    const { id } = ctx.params;

    const { name, incidentTypeId, nodes = [], edges = [] } = ctx.request.body as {
      name?:           string;
      incidentTypeId?: string;
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
      let documentId: string;

      // ── 1. Créer ou récupérer l'arbre ─────────────────────────────────────
      if (!id || id === 'new') {

        if (!name) {
          return ctx.badRequest('Le champ "name" est requis pour créer un nouvel arbre.');
        }

        // Données de base de l'arbre
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const treeData: Record<string, any> = { name, version: 1 };

        // Lier à l'IncidentType si fourni
        if (incidentTypeId) {
          treeData.incident_type = incidentTypeId;
        }

        const newTree = await strapi.documents('api::decision-tree.decision-tree').create({
          data: treeData as any,
        });

        documentId = newTree.documentId;
        strapi.log.info(`✅ Arbre créé : "${name}" → documentId: ${documentId}`);

        if (incidentTypeId) {
          strapi.log.info(`🔗 Lié à l'IncidentType : ${incidentTypeId}`);
        }

      } else {

        // Arbre existant — mettre à jour l'incidentType si fourni
        if (incidentTypeId) {
          await strapi.documents('api::decision-tree.decision-tree').update({
            documentId: id,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            data: { incident_type: incidentTypeId } as any,
          });
        }

        documentId = id;
      }

      // ── 2. Supprimer les nœuds existants ─────────────────────────────────
      const existingNodes = await strapi.documents('api::decision-node.decision-node').findMany({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        filters: { decision_tree: { documentId: { $eq: documentId } } } as any,
      });

      strapi.log.info(`🗑️  ${existingNodes.length} nœud(s) à supprimer`);

      await Promise.all(
        existingNodes.map((n) =>
          strapi.documents('api::decision-node.decision-node').delete({ documentId: n.documentId })
        )
      );

      // ── 3. Supprimer les liens existants ──────────────────────────────────
      const existingEdges = await strapi.documents('api::decision-edge.decision-edge').findMany({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        filters: { decision_tree: { documentId: { $eq: documentId } } } as any,
      });

      strapi.log.info(`🗑️  ${existingEdges.length} lien(s) à supprimer`);

      await Promise.all(
        existingEdges.map((e) =>
          strapi.documents('api::decision-edge.decision-edge').delete({ documentId: e.documentId })
        )
      );

      // ── 4. Créer les nouveaux nœuds ───────────────────────────────────────
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

      // ── 5. Créer les nouveaux liens ───────────────────────────────────────
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

      // ── 6. Publier l'arbre ────────────────────────────────────────────────
      try {
        await strapi.documents('api::decision-tree.decision-tree').publish({ documentId });
      } catch {
        strapi.log.warn(`publish skipped for ${documentId} — déjà publié ou état non bloquant`);
      }

      strapi.log.info(`✅ Arbre sauvegardé : ${documentId} — ${nodes.length} nœud(s), ${edges.length} lien(s)`);

      // ── 7. Répondre avec les informations essentielles ────────────────────
      return ctx.send({
        data: {
          documentId,
          nodesCount:     nodes.length,
          edgesCount:     edges.length,
          incidentTypeId: incidentTypeId ?? null,
        },
      });

    } catch (error) {
      strapi.log.error('Erreur saveTree :', error);
      return ctx.internalServerError("Erreur lors de la sauvegarde de l'arbre.");
    }
  },
}));
