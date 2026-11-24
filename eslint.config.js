import prettier from 'eslint-config-prettier';
import path from 'node:path';
import js from '@eslint/js';
import svelte from 'eslint-plugin-svelte';
import { defineConfig, globalIgnores, includeIgnoreFile } from 'eslint/config';
import globals from 'globals';
import ts from 'typescript-eslint';

const gitignorePath = path.resolve(import.meta.dirname, '.gitignore');

const timerApis = [
  'setTimeout',
  'requestAnimationFrame',
  'requestIdleCallback',
];
const timerMessage = 'Use later() or afterFrame() from src/lib/timers.ts.';
const tokenBracket = String.raw`\b(?:text|bg|border|rounded)(?:-[a-z]{1,2})?-\[(?!inherit\]|calc\(|[\d.]+em\])`;
const bracketSelectors = [
  'Literal[value',
  'TemplateElement[value.raw',
  'SvelteLiteral[value',
].map((node) => ({
  selector: `${node}=/${tokenBracket}/]`,
  message:
    'Use a theme class (text-body, text-muted, rounded-field) instead of a bracket value for colour, font size or radius.',
}));
const hexSelectors = ['Literal', 'SvelteLiteral'].map((node) => ({
  selector: `${node}[value=/^#[0-9a-fA-F]{3,8}$/]`,
  message:
    'Use a theme colour from src/routes/layout.css instead of a raw hex value.',
}));
const keptComment = /^\s*(?:ponytail:|prettier-ignore)|https?:\/\/\S+/;
const suppression = /eslint-disable|svelte-ignore|@ts-ignore|@ts-expect-error/;
const cssComment = /\/\*[\s\S]*?\*\//g;
const noComments = {
  create(context) {
    const source = context.sourceCode;
    const check = (text, loc) => {
      if (suppression.test(text) || !keptComment.test(text))
        context.report({
          loc,
          message:
            'Disallowed comment; delete narration or encode the constraint in a type, lint, or test.',
        });
    };
    return {
      Program() {
        for (const comment of source.getAllComments())
          if (comment.type !== 'Shebang') check(comment.value, comment.loc);
      },
      SvelteHTMLComment(node) {
        check(node.value, node.loc);
      },
      SvelteStyleElement(node) {
        for (const match of source.getText(node).matchAll(cssComment)) {
          const start = node.range[0] + match.index;
          check(match[0].slice(2, -2), {
            start: source.getLocFromIndex(start),
            end: source.getLocFromIndex(start + match[0].length),
          });
        }
      },
    };
  },
};

export default defineConfig(
  includeIgnoreFile(gitignorePath),
  globalIgnores(['ios/**']),
  js.configs.recommended,
  ts.configs.recommended,
  svelte.configs.recommended,
  prettier,
  svelte.configs.prettier,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    linterOptions: { noInlineConfig: true },
    plugins: { local: { rules: { 'no-comments': noComments } } },
    rules: {
      'local/no-comments': 'error',
      'no-undef': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }],
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
    },
  },
  {
    files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        extraFileExtensions: ['.svelte'],
        parser: ts.parser,
      },
    },
  },
  {
    files: ['src/lib/components/ui/button/button.svelte'],
    rules: { 'svelte/no-navigation-without-resolve': 'off' },
  },
  {
    files: ['src/**/*.{js,ts,svelte}'],
    rules: {
      'no-restricted-syntax': ['error', ...bracketSelectors, ...hexSelectors],
    },
  },
  {
    files: ['src/lib/types.ts', 'src/routes/login/+page.svelte'],
    rules: { 'no-restricted-syntax': ['error', ...bracketSelectors] },
  },
  {
    files: ['src/**/*.{js,ts,svelte}'],
    ignores: ['src/lib/timers.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        ...timerApis.map((name) => ({ name, message: timerMessage })),
      ],
      'no-restricted-properties': [
        'error',
        ...timerApis.map((property) => ({
          object: 'window',
          property,
          message: timerMessage,
        })),
      ],
    },
  }
);
