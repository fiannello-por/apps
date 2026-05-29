'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'

interface ConnectionFormProps {
  editing?: {
    id: string
    name: string
    baseUrl: string
    projectUuid: string
  }
  onSaved: () => void
  onCancel?: () => void
}

export function ConnectionForm({ editing, onSaved, onCancel }: ConnectionFormProps) {
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

  return (
    <Card className="border border-[#e5e5e5] rounded-[14px] shadow-[oklab(0.145_-0.00000143796_0.00000340492_/_0.1)_0px_0px_0px_1px] bg-white">
      <CardHeader className="px-4 pt-4 pb-2">
        <CardTitle className="text-[18px] font-semibold tracking-[-0.45px] text-black leading-[1.33]">
          {isEdit ? 'Edit connection' : 'Add connection'}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="conn-name" className="text-[14px] font-medium text-[#0a0a0a]">
              Name
            </Label>
            <Input
              id="conn-name"
              type="text"
              placeholder="Production"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="border-[#e5e5e5] rounded-[10px] text-[14px] text-[#0a0a0a] placeholder:text-[#737373] px-[10px] py-[4px]"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="conn-base-url" className="text-[14px] font-medium text-[#0a0a0a]">
              Base URL
            </Label>
            <Input
              id="conn-base-url"
              type="url"
              placeholder="https://lightdash.example.com"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              required
              className="border-[#e5e5e5] rounded-[10px] text-[14px] text-[#0a0a0a] placeholder:text-[#737373] px-[10px] py-[4px]"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="conn-project-uuid" className="text-[14px] font-medium text-[#0a0a0a]">
              Project UUID
            </Label>
            <Input
              id="conn-project-uuid"
              type="text"
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              value={projectUuid}
              onChange={(e) => setProjectUuid(e.target.value)}
              required
              className="border-[#e5e5e5] rounded-[10px] font-mono text-[14px] text-[#0a0a0a] placeholder:text-[#737373] px-[10px] py-[4px]"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="conn-token" className="text-[14px] font-medium text-[#0a0a0a]">
              API Token
            </Label>
            <Input
              id="conn-token"
              type="password"
              placeholder={isEdit ? 'Leave blank to keep current' : 'pat_…'}
              value={token}
              onChange={(e) => setToken(e.target.value)}
              required={!isEdit}
              autoComplete="off"
              className="border-[#e5e5e5] rounded-[10px] text-[14px] text-[#0a0a0a] placeholder:text-[#737373] px-[10px] py-[4px]"
            />
          </div>

          <div className="flex items-center gap-2 pt-1">
            <Button
              type="submit"
              disabled={pending}
              className="bg-black text-white rounded-[10px] text-[14px] font-medium px-4 py-2 hover:bg-[#383838] transition-colors disabled:opacity-50"
            >
              {pending ? (isEdit ? 'Saving…' : 'Adding…') : (isEdit ? 'Save changes' : 'Add connection')}
            </Button>
            {onCancel && (
              <Button
                type="button"
                variant="ghost"
                onClick={onCancel}
                className="text-[14px] text-[#737373] hover:text-[#0a0a0a] rounded-[10px] px-4 py-2"
              >
                Cancel
              </Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
