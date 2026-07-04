import { existsSync, renameSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'

const outputDir = 'lib'
const source = join(outputDir, 'index.js')
const target = join(outputDir, 'index.mjs')
const packageFile = join(outputDir, 'package.json')

if (!existsSync(source))
  throw new Error(`Expected build output not found: ${source}`)

renameSync(source, target)

if (existsSync(packageFile))
  unlinkSync(packageFile)
