import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { filterApps, SelectedFilters } from "../lib/filterUtils";

interface FilterQuery {
  network?: string;
  category?: string;
  subcategory?: string;
}

export default async function filterRoutes(fastify: FastifyInstance) {
  fastify.get(
    "/filter",
    async (request: FastifyRequest<{ Querystring: FilterQuery }>, reply: FastifyReply) => {
      const { network, category, subcategory } = request.query;

      const selected: SelectedFilters = {
        network: network ? (Array.isArray(network) ? network : [network]) : [],
        category: category ? (Array.isArray(category) ? category : [category]) : [],
        subcategory: subcategory ? (Array.isArray(subcategory) ? subcategory : [subcategory]) : [],
      };

      try {
        const filteredApps = await filterApps(selected);
        reply.send(filteredApps);
      } catch (error) {
        fastify.log.error(error);
        reply.status(500).send({ error: "Failed to filter applications" });
      }
    },
  );
}
