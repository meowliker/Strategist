/**
 * READ-ONLY ClickUp client.
 *
 * This module intentionally exposes no way to mutate the workspace. There are no
 * create/update/delete functions, and `request` hard-refuses any HTTP verb other
 * than GET. That refusal is a runtime backstop for the real guarantee, which is
 * that no write method exists here to be called in the first place.
 *
 * If a future feature appears to need a write, it does not belong in this file.
 */

const API = 'https://api.clickup.com/api/v2'

export class ClickUpReadOnlyViolation extends Error {}

export interface ClickUpTask {
  id: string
  name: string
  status: { status: string; type: string }
  date_created: string
  date_updated: string
  url: string
  description?: string
  markdown_description?: string
  list: { id: string; name: string }
  folder?: { id: string; name: string }
  space?: { id: string }
  tags: { name: string }[]
  assignees: { id: number; username: string; email?: string }[]
  custom_fields: ClickUpCustomField[]
  attachments?: ClickUpAttachment[]
  priority?: { priority: string } | null
  due_date?: string | null
}

export interface ClickUpCustomField {
  id: string
  name: string
  type: string
  value?: unknown
  type_config?: { options?: { id: string; name: string; orderindex: number }[] }
}

export interface ClickUpAttachment {
  id: string
  title: string
  extension: string
  mimetype: string
  size: number
  url?: string
}

export class ClickUpClient {
  constructor(private readonly token: string) {
    if (!token) throw new Error('CLICKUP_TOKEN is required')
  }

  private async request<T>(path: string, params?: Record<string, string | string[]>): Promise<T> {
    const url = new URL(`${API}${path}`)
    for (const [key, value] of Object.entries(params ?? {})) {
      if (Array.isArray(value)) value.forEach((v) => url.searchParams.append(key, v))
      else url.searchParams.set(key, value)
    }

    const res = await fetch(url, {
      method: 'GET', // never parameterised — see the module docblock
      headers: { Authorization: this.token, 'Content-Type': 'application/json' },
    })

    if (res.status === 429) {
      const retryAfter = Number(res.headers.get('retry-after') ?? '30')
      await new Promise((r) => setTimeout(r, retryAfter * 1000))
      return this.request<T>(path, params)
    }

    if (!res.ok) {
      throw new Error(`ClickUp GET ${path} failed: ${res.status} ${await res.text()}`)
    }

    return res.json() as Promise<T>
  }

  /**
   * Every task in a list, across every status, following pagination to the end.
   *
   * ClickUp caps pages at 100 and signals completion with `last_page`. Callers
   * get the complete set — a partial read would silently skew every win-rate
   * this system computes.
   */
  async listTasks(listId: string, statuses?: readonly string[]): Promise<ClickUpTask[]> {
    const all: ClickUpTask[] = []
    for (let page = 0; ; page++) {
      const params: Record<string, string | string[]> = {
        page: String(page),
        subtasks: 'true',
        include_closed: 'true',
        include_markdown_description: 'true',
      }
      // Filtering server-side means an unfiltered list's hundreds of untested
      // tasks are never transferred at all.
      if (statuses?.length) params['statuses[]'] = [...statuses]

      const data = await this.request<{ tasks: ClickUpTask[]; last_page?: boolean }>(
        `/list/${listId}/task`,
        params,
      )
      all.push(...data.tasks)
      if (data.last_page || data.tasks.length === 0) break
    }
    return all
  }

  async getTask(taskId: string): Promise<ClickUpTask> {
    return this.request<ClickUpTask>(`/task/${taskId}`, { include_markdown_description: 'true' })
  }

  async getTaskAttachments(taskId: string): Promise<ClickUpAttachment[]> {
    const task = await this.getTask(taskId)
    return task.attachments ?? []
  }
}

/**
 * Resolves a ClickUp custom field to a display string.
 *
 * Dropdown values arrive as an orderindex into `type_config.options`, which is
 * why a raw `value` of `0` means "the first option", not "empty".
 */
export function customFieldValue(field: ClickUpCustomField): string | null {
  const { value, type, type_config } = field
  if (value === undefined || value === null || value === '') return null

  if (type === 'drop_down') {
    const options = type_config?.options ?? []
    const option = options.find((o) => o.orderindex === Number(value)) ?? options[Number(value)]
    const name = option?.name?.trim()
    return !name || name === '—' ? null : name
  }

  if (type === 'users') {
    const users = value as { username?: string }[]
    return Array.isArray(users) ? users.map((u) => u.username).filter(Boolean).join(', ') || null : null
  }

  const str = String(value).trim()
  return !str || str === '—' ? null : str
}

/** Indexes a task's custom fields by name for direct lookup. */
export function fieldMap(task: ClickUpTask): Record<string, string | null> {
  const out: Record<string, string | null> = {}
  for (const f of task.custom_fields ?? []) out[f.name] = customFieldValue(f)
  return out
}
