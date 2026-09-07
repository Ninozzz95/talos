import { randomUUID } from 'node:crypto'
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  unlink,
  writeFile,
} from 'node:fs/promises'
import { join, resolve } from 'node:path'

import {
  ARTIFACT_EXTENSION_BY_FORMAT_V1,
  ArtifactFormatV1,
  type ArtifactFormat,
} from '../contracts/artifactProtocol.js'
import { ArtifactWorkerFault } from '../errors.js'

export interface TemporaryArtifactLeaseContract {
  writeArtifact(format: ArtifactFormat, bytes: Buffer): Promise<string>
  readArtifact(): Promise<Buffer>
  cleanup(): Promise<void>
}

export interface ArtifactTemporaryStore {
  createLease(): Promise<TemporaryArtifactLeaseContract>
}

class TemporaryArtifactLease implements TemporaryArtifactLeaseContract {
  readonly #directory: string
  #cleaned = false
  #path: string | undefined

  constructor(directory: string) {
    this.#directory = directory
  }

  async writeArtifact(format: ArtifactFormat, bytes: Buffer): Promise<string> {
    if (this.#cleaned || !ArtifactFormatV1.safeParse(format).success) {
      throw new ArtifactWorkerFault(
        'ARTIFACT_TEMP_IO_FAILED',
        'Temporary artifact lease is unavailable',
      )
    }

    const extension = ARTIFACT_EXTENSION_BY_FORMAT_V1[format]
    const finalPath = join(this.#directory, `${randomUUID()}${extension}`)
    const partialPath = `${finalPath}.partial`

    try {
      await writeFile(partialPath, bytes, { flag: 'wx', mode: 0o600 })
      await rename(partialPath, finalPath)
      this.#path = finalPath
      return finalPath
    } catch (error) {
      await unlink(partialPath).catch(() => undefined)
      throw new ArtifactWorkerFault(
        'ARTIFACT_TEMP_IO_FAILED',
        'Temporary artifact could not be written atomically',
        { cause: error },
      )
    }
  }

  async readArtifact(): Promise<Buffer> {
    if (this.#cleaned || this.#path === undefined) {
      throw new ArtifactWorkerFault(
        'ARTIFACT_TEMP_IO_FAILED',
        'Temporary artifact is unavailable',
      )
    }
    try {
      return await readFile(this.#path)
    } catch (error) {
      throw new ArtifactWorkerFault(
        'ARTIFACT_TEMP_IO_FAILED',
        'Temporary artifact could not be read',
        { cause: error },
      )
    }
  }

  async cleanup(): Promise<void> {
    if (this.#cleaned) {
      return
    }
    this.#cleaned = true
    this.#path = undefined
    await rm(this.#directory, {
      recursive: true,
      force: true,
      maxRetries: 8,
      retryDelay: 50,
    })
  }
}

export class TemporaryArtifactStore implements ArtifactTemporaryStore {
  readonly #root: string

  constructor(root: string) {
    this.#root = resolve(root)
  }

  async createLease(): Promise<TemporaryArtifactLease> {
    try {
      await mkdir(this.#root, { recursive: true, mode: 0o700 })
      const rootStat = await lstat(this.#root)
      if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
        throw new Error('Temporary root must be a real directory')
      }
      await chmod(this.#root, 0o700)
      const directory = await mkdtemp(join(this.#root, 'request-'))
      await chmod(directory, 0o700)
      return new TemporaryArtifactLease(directory)
    } catch (error) {
      throw new ArtifactWorkerFault(
        'ARTIFACT_TEMP_IO_FAILED',
        'Temporary artifact scope could not be created',
        { cause: error },
      )
    }
  }
}
