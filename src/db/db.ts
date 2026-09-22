import Dexie, { type Table } from 'dexie'
import type { Project } from '../core/types'

class WeaveStudioDB extends Dexie {
  projects!: Table<Project, string>

  constructor() {
    super('weave-studio')
    this.version(1).stores({
      projects: 'id, updatedAt',
    })
  }
}

export const db = new WeaveStudioDB()
