'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ConnectionForm } from '@/components/connection-form'

interface Connection {
  id: string
  name: string
  baseUrl: string
  projectUuid: string
  createdAt: string
}

export default function ConnectionsPage() {
  const [connections, setConnections] = useState<Connection[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [testingId, setTestingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const fetchConnections = useCallback(async () => {
    try {
      const res = await fetch('/api/connections')
      if (!res.ok) throw new Error('Failed to load connections.')
      const data: Connection[] = await res.json()
      setConnections(data)
    } catch {
      toast.error('Could not load connections.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load on mount
    fetchConnections()
  }, [fetchConnections])

  async function handleTest(id: string) {
    setTestingId(id)
    try {
      const res = await fetch(`/api/connections/${id}/test`, { method: 'POST' })
      const data = await res.json()
      if (data.ok) {
        toast.success('Connection OK')
      } else {
        toast.error(data.error ?? 'Connection test failed.')
      }
    } catch {
      toast.error('Network error during test.')
    } finally {
      setTestingId(null)
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!window.confirm(`Delete connection "${name}"? This cannot be undone.`)) return
    setDeletingId(id)
    try {
      const res = await fetch(`/api/connections/${id}`, { method: 'DELETE' })
      if (res.status === 409) {
        const data = await res.json().catch(() => ({}))
        toast.error(typeof data?.error === 'string' ? data.error : 'Connection is in use and cannot be deleted.')
        return
      }
      if (!res.ok) {
        toast.error('Failed to delete connection.')
        return
      }
      toast.success(`"${name}" deleted.`)
      await fetchConnections()
    } catch {
      toast.error('Network error during delete.')
    } finally {
      setDeletingId(null)
    }
  }

  function formatDate(iso: string) {
    try {
      return new Date(iso).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    } catch {
      return iso
    }
  }

  const editingConnection = editingId ? connections.find((c) => c.id === editingId) : null

  return (
    <div className="flex flex-col gap-8">
      {/* Page heading */}
      <div>
        <h1 className="text-[18px] font-semibold tracking-[-0.45px] text-black leading-[1.33]">
          Connections
        </h1>
        <p className="mt-1 text-[14px] text-[#737373]">
          Manage your Lightdash API connections.
        </p>
      </div>

      {/* Connection list */}
      <div className="rounded-[14px] border border-[#e5e5e5] bg-white shadow-[oklab(0.145_-0.00000143796_0.00000340492_/_0.1)_0px_0px_0px_1px] overflow-hidden">
        {loading ? (
          <div className="flex flex-col gap-3 p-4">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-8 w-full rounded-[10px]" />
            ))}
          </div>
        ) : connections.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
            <p className="text-[14px] font-medium text-[#0a0a0a]">No connections yet</p>
            <p className="mt-1 text-[13px] text-[#737373]">Add one below to get started.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-b border-[#e5e5e5]">
                <TableHead className="text-[13px] font-medium text-[#737373] px-4 py-3">Name</TableHead>
                <TableHead className="text-[13px] font-medium text-[#737373] px-4 py-3">Base URL</TableHead>
                <TableHead className="text-[13px] font-medium text-[#737373] px-4 py-3">Project UUID</TableHead>
                <TableHead className="text-[13px] font-medium text-[#737373] px-4 py-3">Added</TableHead>
                <TableHead className="text-[13px] font-medium text-[#737373] px-4 py-3 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {connections.map((conn) => (
                <TableRow
                  key={conn.id}
                  className="border-b border-[#e5e5e5] last:border-0 hover:bg-[#f2f2f2] transition-colors"
                >
                  <TableCell className="px-4 py-3 text-[14px] font-medium text-[#0a0a0a]">
                    {conn.name}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-[14px] text-[#737373] font-mono max-w-[200px] truncate">
                    {conn.baseUrl}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-[13px] text-[#737373] font-mono max-w-[180px] truncate">
                    {conn.projectUuid}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-[13px] text-[#737373] whitespace-nowrap">
                    {formatDate(conn.createdAt)}
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={testingId === conn.id}
                        onClick={() => handleTest(conn.id)}
                        className="text-[13px] text-[#737373] hover:text-[#0a0a0a] rounded-[10px] px-2.5"
                      >
                        {testingId === conn.id ? 'Testing…' : 'Test'}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditingId(editingId === conn.id ? null : conn.id)}
                        className="text-[13px] text-[#737373] hover:text-[#0a0a0a] rounded-[10px] px-2.5"
                      >
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={deletingId === conn.id}
                        onClick={() => handleDelete(conn.id, conn.name)}
                        className="text-[13px] text-[#c22b10] hover:text-[#c22b10] hover:bg-red-50 rounded-[10px] px-2.5"
                      >
                        {deletingId === conn.id ? 'Deleting…' : 'Delete'}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Inline edit form */}
      {editingConnection && (
        <ConnectionForm
          editing={{
            id: editingConnection.id,
            name: editingConnection.name,
            baseUrl: editingConnection.baseUrl,
            projectUuid: editingConnection.projectUuid,
          }}
          onSaved={async () => {
            setEditingId(null)
            await fetchConnections()
          }}
          onCancel={() => setEditingId(null)}
        />
      )}

      {/* Add connection form */}
      <ConnectionForm onSaved={fetchConnections} />
    </div>
  )
}
