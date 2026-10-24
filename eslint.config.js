import js from "@eslint/js";
import ts from "typescript-eslint";
export default ts.config(js.configs.recommended, ...ts.configs.recommended, {
  files: ["src/**/*.ts", "tests/**/*.ts"],
  languageOptions: {
    globals: {
      console: "readonly",
      setInterval: "readonly",
      setTimeout: "readonly",
      crypto: "readonly",
      URL: "readonly",
      URLSearchParams: "readonly",
      TextEncoder: "readonly",
      TextDecoder: "readonly",
      btoa: "readonly",
      atob: "readonly",
      indexedDB: "readonly",
      structuredClone: "readonly",
      document: "readonly",
      navigator: "readonly",
      location: "readonly",
      window: "readonly",
      localStorage: "readonly",
      chrome: "readonly",
      fetch: "readonly",
      Blob: "readonly",
      File: "readonly",
      FormData: "readonly",
      createImageBitmap: "readonly",
      PublicKeyCredential: "readonly",
    },
  },
  rules: {
    "no-control-regex": "off",
    "@typescript-eslint/no-unused-vars": [
      "error",
      { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
    ],
  },
});
