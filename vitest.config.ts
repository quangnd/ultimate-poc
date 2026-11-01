import { defineConfig } from 'vitest/config'

// Only the project's own tests; experiments/ holds node:test fixtures that vitest must not collect.
export default defineConfig({
  test: { include: ['tests/**/*.test.ts'] },
})
