import packageJson from './package.json'
import config from './rollup.config.js'

export default {
  external: Object.keys(packageJson.devDependencies),
  input: 'test/tests.js',
  output: [{ file: 'build/tests.js', format: 'cjs' }],
  plugins: config.plugins,
  sourcemap: true
}
