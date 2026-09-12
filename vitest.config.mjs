import { defineConfig } from 'vitest/config'
import { dependencyFallback, ROOT } from './scripts/dependencies.mjs'

export default defineConfig({
  root: ROOT,
  plugins: [dependencyFallback()],
  test: {
    include: ['tests/**/*.spec.ts', 'src/dsh-pentest/tests/**/*.spec.ts'],
    environment: 'node',
    coverage: {
      include: ['src/dsh-pentest/src/**/*.ts'],
      thresholds: { lines: 100, functions: 100, branches: 100, statements: 100 },
    },
  },
})
