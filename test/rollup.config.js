import packageJson from '../package.json'
import config from '../rollup.config.js'

export default {
  external: Object.keys(packageJson.devDependencies),
  input: 'test/index.js',
  output: [{ file: 'build/tests.js', format: 'cjs', sourcemap: true }],
  plugins: config.plugins
}
