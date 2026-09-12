import { defineConfig, globalIgnores } from "eslint/config"
import nextVitals from "eslint-config-next/core-web-vitals"
import nextTypescript from "eslint-config-next/typescript"

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  {
    rules: {
      // core-web-vitals bundles the React Compiler's static analysis rules,
      // which flag common safe patterns (syncing local state from a prop or
      // an external store on mount) as compiler-incompatible. This app does
      // not enable the React Compiler (no next.config.mjs reactCompiler
      // flag), so these are diagnostic noise, not real bugs - off for now.
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/immutability": "off",
      "react-hooks/incompatible-library": "off",
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
])
