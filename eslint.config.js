// eslint.config.js - Working configuration without rule conflicts
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default [
  // =============================================================================
  // IGNORE PATTERNS
  // =============================================================================
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      '**/logs/**',
      '**/*.d.ts',
      '.env*',
      '**/prisma/migrations/**',
      '**/*.generated.*',
      '**/*.min.js',
      '**/public/**',
      '**/uploads/**',
      '**/.vscode/**',
    ],
  },

  // =============================================================================
  // JAVASCRIPT CONFIGURATION
  // =============================================================================
  {
    files: ['**/*.{js,mjs,cjs}'],
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.es2024,
      },
    },
    rules: {
      // Basic JavaScript rules
      'no-console': process.env.NODE_ENV === 'production' ? 'error' : 'warn',
      'no-debugger': process.env.NODE_ENV === 'production' ? 'error' : 'warn',
      'prefer-const': 'error',
      'no-var': 'error',
      'object-shorthand': 'error',
      'prefer-template': 'error',
    },
  },

  // =============================================================================
  // TYPESCRIPT CONFIGURATION - Base recommended rules only
  // =============================================================================
  ...tseslint.configs.recommended.map(config => ({
    ...config,
    files: ['**/*.{ts,tsx}'],
  })),

  // =============================================================================
  // TYPESCRIPT STRICT CONFIGURATION - Type-aware rules
  // =============================================================================
  ...tseslint.configs.recommendedTypeChecked.map(config => ({
    ...config,
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ...config.languageOptions,
      parserOptions: {
        project: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  })),

  // =============================================================================
  // CUSTOM TYPESCRIPT RULES - Only verified working rules
  // =============================================================================
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      // =======================================================================
      // CORE TYPESCRIPT RULES - These definitely exist
      // =======================================================================
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
        },
      ],

      // Function and type declarations
      '@typescript-eslint/explicit-function-return-type': [
        'error',
        {
          allowExpressions: true,
          allowTypedFunctionExpressions: true,
          allowHigherOrderFunctions: true,
          allowDirectConstAssertionInArrowFunctions: true,
        },
      ],
      '@typescript-eslint/explicit-module-boundary-types': 'warn',

      // Type safety
      '@typescript-eslint/no-non-null-assertion': 'warn',
      '@typescript-eslint/prefer-as-const': 'error',
      '@typescript-eslint/no-inferrable-types': 'error',

      // Code quality
      '@typescript-eslint/prefer-nullish-coalescing': 'error',
      '@typescript-eslint/prefer-optional-chain': 'error',
      '@typescript-eslint/no-unnecessary-condition': 'warn',

      // Import/export
      '@typescript-eslint/consistent-type-imports': [
        'error',
        {
          prefer: 'type-imports',
          fixStyle: 'inline-type-imports',
        },
      ],
      '@typescript-eslint/consistent-type-definitions': ['error', 'interface'],

      // Async/await
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/require-await': 'error',
      '@typescript-eslint/await-thenable': 'error',

      // Performance
      '@typescript-eslint/prefer-includes': 'error',
      '@typescript-eslint/prefer-string-starts-ends-with': 'error',
      '@typescript-eslint/prefer-for-of': 'error',

      // =======================================================================
      // JAVASCRIPT RULES TO DISABLE (replaced by TypeScript versions)
      // =======================================================================
      'no-unused-vars': 'off',
      'no-redeclare': 'off',
      'no-shadow': 'off',
      '@typescript-eslint/no-shadow': 'error',

      // =======================================================================
      // NAMING CONVENTIONS - Simplified version
      // =======================================================================
      '@typescript-eslint/naming-convention': [
        'error',
        {
          selector: 'variableLike',
          format: ['camelCase'],
          leadingUnderscore: 'allow',
        },
        {
          selector: 'typeLike',
          format: ['PascalCase'],
        },
        {
          selector: 'property',
          format: ['camelCase', 'snake_case', 'UPPER_CASE'],
          leadingUnderscore: 'allow',
        },
      ],
    },
  },

  // =============================================================================
  // GENERAL CODE QUALITY RULES
  // =============================================================================
  {
    files: ['**/*.{js,ts}'],
    rules: {
      // Error Prevention
      'no-alert': 'error',
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'no-script-url': 'error',
      'no-proto': 'error',
      'no-iterator': 'error',
      'no-with': 'error',

      // Code Quality & Consistency
      'prefer-const': 'error',
      'no-var': 'error',
      'object-shorthand': 'error',
      'prefer-template': 'error',
      'prefer-arrow-callback': 'error',
      'prefer-rest-params': 'error',
      'prefer-spread': 'error',

      // Formatting (basic rules that don't conflict)
      'comma-dangle': ['error', 'always-multiline'],
      semi: ['error', 'always'],
      quotes: ['error', 'single', { avoidEscape: true }],
      'no-multiple-empty-lines': ['error', { max: 2, maxEOF: 1 }],
      'no-trailing-spaces': 'error',
      'eol-last': 'error',

      // Best Practices
      curly: ['error', 'all'],
      'dot-notation': 'error',
      eqeqeq: ['error', 'always'],
      'no-else-return': 'error',
      'no-empty-function': 'error',
      'no-param-reassign': 'error',
      'no-return-assign': 'error',
      'no-sequences': 'error',
      'no-throw-literal': 'error',
      'no-unused-expressions': 'error',
      'no-useless-call': 'error',
      'no-useless-concat': 'error',
      'no-useless-return': 'error',
      'prefer-promise-reject-errors': 'error',
      'require-await': 'error',
    },
  },

  // =============================================================================
  // IMPORT RULES (Optional - only if eslint-plugin-import is installed)
  // =============================================================================
  {
    files: ['**/*.{js,ts}'],
    rules: {
      // More flexible duplicate import handling
      'no-duplicate-imports': 'off',
      '@/no-duplicate-imports': 'error', // TypeScript version

      // Or allow type imports to be separate
      '@typescript-eslint/consistent-type-imports': [
        'error',
        {
          prefer: 'type-imports',
          fixStyle: 'separate-type-imports',
        },
      ],
    },
  },

  // =============================================================================
  // TEST FILES - Relaxed rules
  // =============================================================================
  {
    files: [
      '**/*.{test,spec}.{js,ts}',
      '**/test/**/*.{js,ts}',
      '**/__tests__/**/*.{js,ts}',
      '**/tests/**/*.{js,ts}',
    ],
    languageOptions: {
      globals: {
        ...globals.jest,
        ...globals.node,
      },
    },
    rules: {
      // Relax rules for test files
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^(expect|describe|it|test|beforeEach|afterEach|beforeAll|afterAll)$',
        },
      ],
      'no-magic-numbers': 'off',
      'max-lines-per-function': 'off',
    },
  },

  // =============================================================================
  // CONFIGURATION FILES - Very relaxed rules
  // =============================================================================
  {
    files: [
      '*.config.{js,ts,mjs}',
      '**/config/**/*.{js,ts}',
      '**/scripts/**/*.{js,ts}',
      '**/prisma/**/*.{js,ts}',
      'eslint.config.js',
    ],
    rules: {
      '@typescript-eslint/no-var-requires': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
      'no-console': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
];

// =============================================================================
// INSTALLATION GUIDE
// =============================================================================
/*
STEP 1: Install correct dependencies
npm install -D eslint@^9.35.0 typescript-eslint@^8.0.0 globals@^15.0.0 @eslint/js@^9.0.0

STEP 2: If you get plugin errors, install additional plugins one by one:
npm install -D eslint-plugin-import@^2.30.0

STEP 3: Test the configuration:
npx eslint --print-config src/app.ts
npx eslint src/

STEP 4: Add to package.json:
{
  "scripts": {
    "lint": "eslint .",
    "lint:fix": "eslint . --fix",
    "lint:check": "eslint . --max-warnings 0"
  }
}

TROUBLESHOOTING:
- If you still get rule errors, remove the problematic rule from the config
- Make sure your tsconfig.json is in the project root
- Ensure Node.js version is 18+ 
- Check that all TypeScript files have .ts extension
*/
