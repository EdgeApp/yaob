import babel from 'rollup-plugin-babel'
import flowEntry from 'rollup-plugin-flow-entry'

import packageJson from './package.json'

const babelOpts = {
  presets: ['es2015-rollup', 'flow'],
  plugins: [
    'transform-object-rest-spread',
    ['transform-es2015-for-of', { loose: true }]
  ]
}

export default {
  input: 'src/index.js',
  output: [
    { file: packageJson.main, format: 'cjs' },
    { file: packageJson.module, format: 'es' }
  ],
  plugins: [babel(babelOpts), flowEntry()],
  sourcemap: true
}
