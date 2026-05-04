// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*'],
  },
  {
    files: ['src/database/db.js'],
    rules: {
      'import/no-unresolved': 'off',
    },
  },
  {
    files: ['src/context/AppThemeContext.js', 'src/context/CartContext.js'],
    rules: {
      'import/no-unresolved': 'off',
    },
  },
]);
