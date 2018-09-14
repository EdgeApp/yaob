import babel from 'rollup-plugin-babel'
import filesize from 'rollup-plugin-filesize'
import flowEntry from 'rollup-plugin-flow-entry'
import nodeResolve from 'rollup-plugin-node-resolve'

import packageJson from './package.json'

const babelOpts = {
  extensions: ['.ts'],
  presets: [
    [
      '@babel/preset-env',
      {
        exclude: ['transform-regenerator'],
        loose: true
      }
    ],
    '@babel/preset-typescript'
  ],
  plugins: [
    ['@babel/plugin-transform-for-of', { assumeArray: true }],
    '@babel/plugin-transform-object-assign'
  ]
}

export default {
  input: 'src/index.ts',
  output: [
    { file: packageJson.main, format: 'cjs', sourcemap: true },
    { file: packageJson.module, format: 'es', sourcemap: true }
  ],
  plugins: [
    nodeResolve({
      extensions: '.ts'
    }),
    babel(babelOpts),
    flowEntry(),
    filesize()
  ]
}
