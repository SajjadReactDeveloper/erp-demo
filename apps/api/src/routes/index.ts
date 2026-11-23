import type { FastifyInstance } from 'fastify';
import { registerPlatformRoutes } from './platform';
import { registerReportRoutes } from './reports';
import { registerDocRoutes } from './docs';
import { registerOpsRoutes } from './ops';
import { registerOpenApi } from './openapi';

export async function registerRoutes(app: FastifyInstance) {
  registerPlatformRoutes(app);
  registerReportRoutes(app);
  registerDocRoutes(app);
  registerOpsRoutes(app);
  registerOpenApi(app);
}
