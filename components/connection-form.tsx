'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldDescription,
} from '@/components/ui/field'
import {
  DialogClose,
  DialogFooter,
} from '@/components/ui/dialog'

interface ConnectionFormProps {
  editing?: {
    id: string
    name: string
    baseUrl: string
    projectUuid: string
  }
  onSaved: () => void
  onCancel?: () => void
  /** When true the form renders inside a Dialog and uses DialogFooter */
  inDialog?: boolean
}

export function ConnectionForm({ editing, onSaved, onCancel, inDialog }: ConnectionFormProps) {
  const isEdit = !!editing

  const [name, setName] = useState(editing?.name ?? '')
  const [baseUrl, setBaseUrl] = useState(editing?.baseUrl ?? '')
  const [projectUuid, setProjectUuid] = useState(editing?.projectUuid ?? '')
  const [token, setToken] = useState('')
  const [pending, setPending] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setPending(true)

    try {
      const body: Record<string, string> = { name, baseUrl, projectUuid }
      // On create, token is required (validated by server). On edit, only include
      // if the user typed something — blank means "keep current".
      if (!isEdit || token.trim() !== '') {
        body.token = token
      }

      const url = isEdit ? `/api/connections/${editing.id}` : '/api/connections'
      const method = isEdit ? 'PATCH' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        const msg = typeof data?.error === 'string' ? data.error : 'Check the fields and try again.'
        toast.error(msg)
        return
      }

      toast.success(isEdit ? 'Connection updated.' : 'Connection added.')
      if (!isEdit) {
        setName('')
        setBaseUrl('')
        setProjectUuid('')
        setToken('')
      }
      onSaved()
    } catch {
      toast.error('Network error — please try again.')
    } finally {
      setPending(false)
    }
  }

  const fields = (
    <FieldGroup>
      <Field>
        <FieldLabel htmlFor="conn-name">Name</FieldLabel>
        <Input
          id="conn-name"
          type="text"
          placeholder="Production"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </Field>

      <Field>
        <FieldLabel htmlFor="conn-base-url">Base URL</FieldLabel>
        <Input
          id="conn-base-url"
          type="url"
          placeholder="https://lightdash.example.com"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          required
        />
      </Field>

      <Field>
        <FieldLabel htmlFor="conn-project-uuid">Project UUID</FieldLabel>
        <Input
          id="conn-project-uuid"
          type="text"
          placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
          value={projectUuid}
          onChange={(e) => setProjectUuid(e.target.value)}
          required
          className="font-mono"
        />
      </Field>

      <Field>
        <FieldLabel htmlFor="conn-token">API Token</FieldLabel>
        <Input
          id="conn-token"
          type="password"
          placeholder={isEdit ? '••••••••' : 'pat_…'}
          value={token}
          onChange={(e) => setToken(e.target.value)}
          required={!isEdit}
          autoComplete="off"
        />
        {isEdit && (
          <FieldDescription>
            Leave blank to keep the current token.
          </FieldDescription>
        )}
      </Field>
    </FieldGroup>
  )

  if (inDialog) {
    return (
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {fields}
        <DialogFooter>
          <DialogClose
            render={
              <Button
                type="button"
                variant="outline"
                onClick={onCancel}
              />
            }
          >
            Cancel
          </DialogClose>
          <Button type="submit" disabled={pending}>
            {pending ? <Spinner data-icon="inline-start" /> : null}
            {pending ? (isEdit ? 'Saving…' : 'Adding…') : (isEdit ? 'Save changes' : 'Add connection')}
          </Button>
        </DialogFooter>
      </form>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {fields}
      <div className="flex items-center gap-2 pt-1">
        <Button type="submit" disabled={pending}>
          {pending ? <Spinner data-icon="inline-start" /> : null}
          {pending ? (isEdit ? 'Saving…' : 'Adding…') : (isEdit ? 'Save changes' : 'Add connection')}
        </Button>
        {onCancel && (
          <Button
            type="button"
            variant="ghost"
            onClick={onCancel}
          >
            Cancel
          </Button>
        )}
      </div>
    </form>
  )
}
