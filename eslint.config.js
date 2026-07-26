import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import prettier from 'eslint-config-prettier'
import globals from 'globals'

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'node_modules', '.claude'] },
  js.configs.recommended,
  {
    files: ['**/*.ts'],
    extends: [...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      // "Use named exports, not default exports" — .claude/CLAUDE.md
      'no-restricted-syntax': [
        'error',
        {
          selector: 'ExportDefaultDeclaration',
          message: 'Use named exports, not default exports (.claude/CLAUDE.md).',
        },
      ],
    },
  },
  {
    // Build tooling is required to default-export its config object.
    files: ['*.config.ts', '*.config.js'],
    rules: { 'no-restricted-syntax': 'off' },
  },
  {
    // The plugin's Claude Code hooks are Node scripts, never bundled for the
    // browser. Without Node globals, every `process` reference trips no-undef.
    files: ['snake-game-plugin/hooks/**/*.mjs'],
    languageOptions: { globals: globals.node },
  },
  prettier,
)
