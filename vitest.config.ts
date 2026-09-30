import { defineConfig } from 'vitest/config';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

export default defineConfig({
  test: {
    environment: 'node',
    fileParallelism: false,
    globals: true,
    clearMocks: true,
    env: {
      NODE_ENV: 'test',
      GOOGLE_CLIENT_ID: 'test-google-client',
      GOOGLE_CLIENT_SECRET: 'test-google-secret',
      LOG_LEVEL: 'silent',
      MONGODB_URI: 'mongodb://localhost:27017/test_king_mongkut_social',
      ACCESS_TOKEN_SECRET: 'test-access-secret-32-characters-minimum-value',
      REFRESH_TOKEN_SECRET: 'test-refresh-secret-32-characters-minimum-value',
      UPLOAD_DIR: join(tmpdir(), `king-mongkut-social-posts-test-${process.pid}`),
    },
  },
});
