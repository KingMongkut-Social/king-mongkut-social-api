import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { logger } from '../config/logger.js';
import { indexModels } from './index-models.js';

async function main(): Promise<void> {
  await connectDatabase();
  await Promise.all(indexModels.map((model) => model.syncIndexes()));
  logger.info({ models: indexModels.map((model) => model.modelName) }, 'MongoDB indexes synchronized');
  await disconnectDatabase();
}

void main().catch((error) => {
  logger.fatal({ err: error }, 'Index synchronization failed');
  process.exit(1);
});
