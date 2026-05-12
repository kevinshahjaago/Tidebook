import type { Config } from "jest";

const config: Config = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/src/__tests__"],
  moduleNameMapper: {
    "@tidebook/shared": "<rootDir>/../../packages/shared/src/index.ts",
  },
  setupFilesAfterFramework: [],
  testTimeout: 30000,
  collectCoverageFrom: [
    "src/**/*.ts",
    "!src/index.ts",
    "!src/**/__tests__/**",
    "!src/types/**",
  ],
  coverageThreshold: {
    "src/services/**": { lines: 100, functions: 100 },
  },
};

export default config;
