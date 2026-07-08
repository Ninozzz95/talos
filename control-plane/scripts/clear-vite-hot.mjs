import { existsSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'

const hotFile = resolve(process.cwd(), 'public', 'hot')

if (existsSync(hotFile)) {
    rmSync(hotFile)
    console.log('Removed stale Vite hot file.')
}

