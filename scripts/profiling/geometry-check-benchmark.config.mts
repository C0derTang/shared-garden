import {defineConfig} from 'vitest/config';
import base from '../../vitest.config.mts';
export default defineConfig({
 resolve:base.resolve,
 test:{
  environment:'jsdom',
  setupFiles:['./src/test/setup.ts'],
  include:['scripts/profiling/geometry-check-benchmark.test.ts'],
  maxWorkers:1,
 },
});
