// eslint.config.js - Fixed configuration for clean imports
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
      '**/.history/**',
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
      'no-console': process.env.NODE_ENV === 'production' ? 'error' : 'warn',
      'no-debugger': process.env.NODE_ENV === 'production' ? 'error' : 'warn',
      'prefer-const': 'error',
      'no-var': 'error',
      'object-shorthand': 'error',
      'prefer-template': 'error',
    },
  },

  // =============================================================================
  // TYPESCRIPT CONFIGURATION - Base recommended rules
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
        project: './tsconfig.json',
        tsconfigRootDir: process.cwd(),
      },
    },
  })),

  // =============================================================================
  // CUSTOM TYPESCRIPT RULES
  // =============================================================================
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      // Core TypeScript rules
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
        },
      ],

      // Function declarations
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

      // Modern JS features
      '@typescript-eslint/prefer-nullish-coalescing': 'error',
      '@typescript-eslint/prefer-optional-chain': 'error',
      '@typescript-eslint/no-unnecessary-condition': 'warn',

      // Import/export - FIXED for clean imports
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

      // Disable JS rules replaced by TS
      'no-unused-vars': 'off',
      'no-redeclare': 'off',
      'no-shadow': 'off',
      '@typescript-eslint/no-shadow': 'error',

      // Naming conventions
      // '@typescript-eslint/naming-convention': [
      //   'error',
      //   {
      //     selector: 'variableLike',
      //     format: ['camelCase', 'UPPER_CASE', 'snake_case'],
      //     leadingUnderscore: 'allow',
      //   },
      //   {
      //     selector: 'typeLike',
      //     format: ['PascalCase'],
      //   },
      //   {
      //     selector: 'property',
      //     format: ['camelCase', 'snake_case', 'UPPER_CASE'],
      //     leadingUnderscore: 'allow',
      //   },
      // ],
    },
  },

  // =============================================================================
  // IMPORT RULES - FIXED for extensionless imports
  // =============================================================================
  {
    files: ['**/*.{js,ts}'],
    rules: {
      // REMOVED: Fixed the duplicate import rule error
      'no-duplicate-imports': 'error',
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

      // Code Quality
      'prefer-const': 'error',
      'no-var': 'error',
      'object-shorthand': 'error',
      'prefer-template': 'error',
      'prefer-arrow-callback': 'error',
      'prefer-rest-params': 'error',
      'prefer-spread': 'error',

      // Formatting
      // 'comma-dangle': ['error', 'always-multiline'],
      semi: ['error', 'always'],
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
    '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
    },
  },
];
