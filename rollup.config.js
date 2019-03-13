import babel from 'rollup-plugin-babel'
import filesize from 'rollup-plugin-filesize'
import flowEntry from 'rollup-plugin-flow-entry'

import packageJson from './package.json'

const babelOpts = {
  presets: [
    [
      '@babel/preset-env',
      {
        exclude: ['transform-regenerator'],
        loose: true
      }
    ],
    '@babel/preset-flow'
  ],
  plugins: [
    ['@babel/plugin-transform-for-of', { assumeArray: true }],
    '@babel/plugin-transform-object-assign'
  ]
}

export default {
  external: Object.keys(packageJson.dependencies),
  input: 'src/index.js',
  output: [
    { file: packageJson.main, format: 'cjs', sourcemap: true },
    { file: packageJson.module, format: 'es', sourcemap: true }
  ],
  plugins: [babel(babelOpts), flowEntry(), filesize()]
}
