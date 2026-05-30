'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { PlusIcon, PlugIcon, PencilIcon, Trash2Icon, CheckCircleIcon } from 'lucide-react'
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
import { Spinner } from '@/components/ui/spinner'
import { Card, CardContent } from '@/components/ui/card'
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
} from '@/components/ui/empty'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip'
import { PageHeader } from '@/components/page-header'
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
  const [addOpen, setAddOpen] = useState(false)
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
    <TooltipProvider>
      <div className="flex flex-col gap-8">
        <PageHeader
          title="Connections"
          description="Manage the Lightdash instances you benchmark. Tokens are encrypted at rest."
          actions={
            <Dialog open={addOpen} onOpenChange={setAddOpen}>
              <DialogTrigger
                render={
                  <Button>
                    <PlusIcon data-icon="inline-start" />
                    Add connection
                  </Button>
                }
              />
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add connection</DialogTitle>
                  <DialogDescription>
                    Connect a Lightdash instance to benchmark its queries.
                  </DialogDescription>
                </DialogHeader>
                <ConnectionForm
                  inDialog
                  onSaved={async () => {
                    setAddOpen(false)
                    await fetchConnections()
                  }}
                  onCancel={() => setAddOpen(false)}
                />
              </DialogContent>
            </Dialog>
          }
        />

        {/* Edit dialog */}
        <Dialog
          open={!!editingConnection}
          onOpenChange={(open) => { if (!open) setEditingId(null); }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit connection</DialogTitle>
              <DialogDescription>
                Update the connection details. Leave the token blank to keep the current one.
              </DialogDescription>
            </DialogHeader>
            {editingConnection && (
              <ConnectionForm
                inDialog
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
          </DialogContent>
        </Dialog>

        {/* Connections table */}
        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex flex-col gap-3 p-4">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : connections.length === 0 ? (
              <Empty className="py-16">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <PlugIcon />
                  </EmptyMedia>
                  <EmptyTitle>No connections yet</EmptyTitle>
                  <EmptyDescription>
                    Add a Lightdash instance to start benchmarking its queries.
                  </EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                  <Dialog open={addOpen} onOpenChange={setAddOpen}>
                    <DialogTrigger
                      render={
                        <Button>
                          <PlusIcon data-icon="inline-start" />
                          Add your first connection
                        </Button>
                      }
                    />
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Add connection</DialogTitle>
                        <DialogDescription>
                          Connect a Lightdash instance to benchmark its queries.
                        </DialogDescription>
                      </DialogHeader>
                      <ConnectionForm
                        inDialog
                        onSaved={async () => {
                          setAddOpen(false)
                          await fetchConnections()
                        }}
                        onCancel={() => setAddOpen(false)}
                      />
                    </DialogContent>
                  </Dialog>
                </EmptyContent>
              </Empty>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Base URL</TableHead>
                    <TableHead>Project</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {connections.map((conn) => (
                    <TableRow key={conn.id}>
                      <TableCell className="font-medium text-foreground">
                        {conn.name}
                      </TableCell>
                      <TableCell className="text-muted-foreground font-mono text-xs max-w-[220px] truncate">
                        {conn.baseUrl}
                      </TableCell>
                      <TableCell className="text-muted-foreground font-mono text-xs max-w-[180px] truncate">
                        {conn.projectUuid}
                      </TableCell>
                      <TableCell className="text-muted-foreground whitespace-nowrap text-xs">
                        {formatDate(conn.createdAt)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          {/* Test */}
                          <Tooltip>
                            <TooltipTrigger
                              render={
                                <Button
                                  variant="outline"
                                  size="icon-sm"
                                  disabled={testingId === conn.id}
                                  onClick={() => handleTest(conn.id)}
                                  aria-label="Test connection"
                                />
                              }
                            >
                              {testingId === conn.id
                                ? <Spinner />
                                : <CheckCircleIcon />}
                            </TooltipTrigger>
                            <TooltipContent>Test connection</TooltipContent>
                          </Tooltip>

                          {/* Edit */}
                          <Tooltip>
                            <TooltipTrigger
                              render={
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  onClick={() => setEditingId(conn.id)}
                                  aria-label="Edit connection"
                                />
                              }
                            >
                              <PencilIcon />
                            </TooltipTrigger>
                            <TooltipContent>Edit connection</TooltipContent>
                          </Tooltip>

                          {/* Delete */}
                          <Tooltip>
                            <TooltipTrigger
                              render={
                                <Button
                                  variant="destructive"
                                  size="icon-sm"
                                  disabled={deletingId === conn.id}
                                  onClick={() => handleDelete(conn.id, conn.name)}
                                  aria-label="Delete connection"
                                />
                              }
                            >
                              {deletingId === conn.id
                                ? <Spinner />
                                : <Trash2Icon />}
                            </TooltipTrigger>
                            <TooltipContent>Delete connection</TooltipContent>
                          </Tooltip>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  )
}
