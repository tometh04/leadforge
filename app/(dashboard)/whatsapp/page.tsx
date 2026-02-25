'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  MessageCircle,
  CheckCircle2,
  AlertCircle,
  Loader2,
  QrCode,
  Plus,
  Trash2,
  RefreshCw,
  Phone,
  Wifi,
  WifiOff,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import QRCode from 'qrcode'
import type { WhatsAppAccount } from '@/types'

type ConnectionStatus = 'idle' | 'loading' | 'scanning' | 'connected' | 'error'

interface AccountWithStatus extends WhatsAppAccount {
  checking: boolean
  connected: boolean | null
}

export default function WhatsAppPage() {
  const [accounts, setAccounts] = useState<AccountWithStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [pairingAccountId, setPairingAccountId] = useState<string | null>(null)
  const [pairingStatus, setPairingStatus] = useState<ConnectionStatus>('idle')
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [pairingError, setPairingError] = useState<string | null>(null)
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [newLabel, setNewLabel] = useState('')
  const [addingAccount, setAddingAccount] = useState(false)
  const eventSourceRef = useRef<EventSource | null>(null)

  const fetchAccounts = useCallback(async () => {
    try {
      const res = await fetch('/api/whatsapp/accounts')
      const data: WhatsAppAccount[] = await res.json()
      setAccounts(
        data.map((a) => ({
          ...a,
          checking: false,
          connected: a.status === 'paired' ? null : false,
        }))
      )
    } catch {
      setAccounts([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAccounts()
    return () => {
      eventSourceRef.current?.close()
    }
  }, [fetchAccounts])

  const checkConnection = async (accountId: string) => {
    setAccounts((prev) =>
      prev.map((a) => (a.id === accountId ? { ...a, checking: true } : a))
    )
    try {
      const res = await fetch(`/api/whatsapp/accounts/${accountId}/check`)
      const data = await res.json()
      setAccounts((prev) =>
        prev.map((a) =>
          a.id === accountId
            ? {
                ...a,
                checking: false,
                connected: data.connected ?? false,
                phone_number: data.phone ?? a.phone_number,
                status: data.connected ? 'paired' : 'disconnected',
              }
            : a
        )
      )
    } catch {
      setAccounts((prev) =>
        prev.map((a) =>
          a.id === accountId ? { ...a, checking: false, connected: false } : a
        )
      )
    }
  }

  const handleAddAccount = async () => {
    if (!newLabel.trim()) return
    setAddingAccount(true)
    try {
      const res = await fetch('/api/whatsapp/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: newLabel.trim() }),
      })
      const account: WhatsAppAccount = await res.json()
      setAccounts((prev) => [
        ...prev,
        { ...account, checking: false, connected: false },
      ])
      setShowAddDialog(false)
      setNewLabel('')
      // Auto-start pairing
      startPairing(account.id)
    } catch {
      // ignore
    } finally {
      setAddingAccount(false)
    }
  }

  const handleDelete = async (accountId: string) => {
    if (!confirm('¿Eliminar esta cuenta de WhatsApp?')) return
    try {
      await fetch(`/api/whatsapp/accounts/${accountId}`, { method: 'DELETE' })
      setAccounts((prev) => prev.filter((a) => a.id !== accountId))
    } catch {
      // ignore
    }
  }

  const startPairing = (accountId: string) => {
    setPairingAccountId(accountId)
    setPairingStatus('loading')
    setPairingError(null)
    setQrDataUrl(null)

    eventSourceRef.current?.close()
    const es = new EventSource(`/api/whatsapp/qr?accountId=${accountId}`)
    eventSourceRef.current = es

    es.addEventListener('qr', async (e) => {
      const { qr } = JSON.parse(e.data)
      const dataUrl = await QRCode.toDataURL(qr, { width: 280, margin: 2 })
      setQrDataUrl(dataUrl)
      setPairingStatus('scanning')
    })

    es.addEventListener('connected', () => {
      setPairingStatus('connected')
      setAccounts((prev) =>
        prev.map((a) =>
          a.id === accountId
            ? { ...a, connected: true, status: 'paired' }
            : a
        )
      )
      es.close()
      // Refresh account data
      setTimeout(() => {
        checkConnection(accountId)
        setPairingAccountId(null)
        setPairingStatus('idle')
      }, 2000)
    })

    es.addEventListener('error', (e) => {
      if (e instanceof MessageEvent) {
        const data = JSON.parse(e.data)
        setPairingError(data.error)
      }
      setPairingStatus('error')
      es.close()
    })

    es.onerror = () => {
      if (pairingStatus === 'scanning') {
        es.close()
        setTimeout(() => startPairing(accountId), 1000)
      }
    }
  }

  return (
    <div className="p-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">WhatsApp</h1>
          <p className="text-muted-foreground">
            Gestioná tus números de WhatsApp para enviar mensajes desde el autopilot.
          </p>
        </div>
        <Button onClick={() => setShowAddDialog(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          Agregar número
        </Button>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {!loading && accounts.length === 0 && (
        <Card className="mx-auto max-w-lg">
          <CardContent className="flex flex-col items-center gap-4 py-12">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
              <Phone className="h-8 w-8 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">
              No hay números de WhatsApp configurados.
            </p>
            <Button onClick={() => setShowAddDialog(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              Agregar primer número
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {accounts.map((account) => (
          <Card key={account.id}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">{account.label}</CardTitle>
                <div className="flex items-center gap-1">
                  {account.checking ? (
                    <Badge variant="secondary" className="gap-1">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Verificando
                    </Badge>
                  ) : account.connected ? (
                    <Badge className="gap-1 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                      <Wifi className="h-3 w-3" />
                      Conectado
                    </Badge>
                  ) : (
                    <Badge variant="destructive" className="gap-1">
                      <WifiOff className="h-3 w-3" />
                      Desconectado
                    </Badge>
                  )}
                </div>
              </div>
              <CardDescription>
                {account.phone_number ? `+${account.phone_number}` : 'Sin número — escanear QR'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => startPairing(account.id)}
                  disabled={pairingAccountId === account.id && pairingStatus !== 'idle' && pairingStatus !== 'error'}
                >
                  <QrCode className="h-3.5 w-3.5" />
                  {account.connected ? 'Re-vincular' : 'Vincular'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => checkConnection(account.id)}
                  disabled={account.checking}
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${account.checking ? 'animate-spin' : ''}`} />
                  Verificar
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 text-red-500 hover:text-red-600"
                  onClick={() => handleDelete(account.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* QR Pairing Dialog */}
      {pairingAccountId && pairingStatus !== 'idle' && (
        <Dialog
          open
          onOpenChange={() => {
            eventSourceRef.current?.close()
            setPairingAccountId(null)
            setPairingStatus('idle')
          }}
        >
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="text-center">Vincular WhatsApp</DialogTitle>
              <DialogDescription className="text-center">
                {pairingStatus === 'connected'
                  ? 'Vinculado correctamente.'
                  : 'Escaneá el código QR con tu teléfono.'}
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col items-center gap-4 py-4">
              {pairingStatus === 'loading' && (
                <div className="flex flex-col items-center gap-3">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Generando código QR...</p>
                </div>
              )}

              {pairingStatus === 'scanning' && qrDataUrl && (
                <div className="flex flex-col items-center gap-4">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={qrDataUrl}
                    alt="QR Code"
                    className="rounded-xl border p-2"
                    width={280}
                    height={280}
                  />
                  <p className="text-xs text-muted-foreground text-center">
                    WhatsApp &gt; Dispositivos vinculados &gt; Vincular dispositivo
                  </p>
                </div>
              )}

              {pairingStatus === 'connected' && (
                <div className="flex flex-col items-center gap-3">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
                    <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-400" />
                  </div>
                  <p className="text-sm font-medium text-green-600">Conectado</p>
                </div>
              )}

              {pairingStatus === 'error' && (
                <div className="flex flex-col items-center gap-3">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
                    <AlertCircle className="h-8 w-8 text-red-600 dark:text-red-400" />
                  </div>
                  <p className="text-sm text-red-600">{pairingError || 'Error de conexión'}</p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => startPairing(pairingAccountId)}
                  >
                    Reintentar
                  </Button>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Add Account Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Agregar número de WhatsApp</DialogTitle>
            <DialogDescription>
              Dale un nombre a esta cuenta (ej. &quot;Ventas&quot;, &quot;Soporte&quot;).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-4">
            <Label>Nombre</Label>
            <Input
              placeholder="ej. Ventas"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddAccount()}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleAddAccount} disabled={addingAccount || !newLabel.trim()}>
              {addingAccount ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                'Crear y vincular'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
