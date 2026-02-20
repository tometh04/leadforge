'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { MessageCircle, CheckCircle2, AlertCircle, Loader2, QrCode } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import QRCode from 'qrcode'

type ConnectionStatus = 'idle' | 'loading' | 'scanning' | 'connected' | 'error'

export default function WhatsAppPage() {
  const [status, setStatus] = useState<ConnectionStatus>('idle')
  const [paired, setPaired] = useState<boolean | null>(null)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const eventSourceRef = useRef<EventSource | null>(null)

  const checkStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/whatsapp/status')
      const data = await res.json()
      setPaired(data.paired)
      if (data.paired) setStatus('connected')
    } catch {
      setPaired(false)
    }
  }, [])

  useEffect(() => {
    checkStatus()
    return () => {
      eventSourceRef.current?.close()
    }
  }, [checkStatus])

  const startPairing = () => {
    setStatus('loading')
    setError(null)
    setQrDataUrl(null)

    const es = new EventSource('/api/whatsapp/qr')
    eventSourceRef.current = es

    es.addEventListener('qr', async (e) => {
      const { qr } = JSON.parse(e.data)
      const dataUrl = await QRCode.toDataURL(qr, { width: 280, margin: 2 })
      setQrDataUrl(dataUrl)
      setStatus('scanning')
    })

    es.addEventListener('connected', () => {
      setStatus('connected')
      setPaired(true)
      es.close()
    })

    es.addEventListener('error', (e) => {
      if (e instanceof MessageEvent) {
        const data = JSON.parse(e.data)
        setError(data.error)
      }
      setStatus('error')
      es.close()
    })

    es.onerror = () => {
      if (status === 'scanning') {
        // SSE cerrado mientras se esperaba QR — reintentar
        es.close()
        setTimeout(startPairing, 1000)
      }
    }
  }

  const disconnect = async () => {
    // Para desvincular, borrar creds de Supabase
    await fetch('/api/whatsapp/status', { method: 'DELETE' })
    setPaired(false)
    setStatus('idle')
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">WhatsApp</h1>
        <p className="text-muted-foreground">
          Vinculá tu WhatsApp para enviar mensajes desde el autopilot.
        </p>
      </div>

      <div className="mx-auto max-w-lg">
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
              <MessageCircle className="h-6 w-6 text-green-600 dark:text-green-400" />
            </div>
            <CardTitle>WhatsApp Web</CardTitle>
            <CardDescription>
              {status === 'connected'
                ? 'Tu WhatsApp está vinculado y listo para enviar mensajes.'
                : 'Escaneá el código QR con tu teléfono para vincular.'}
            </CardDescription>
          </CardHeader>

          <CardContent className="flex flex-col items-center gap-6">
            {/* Estado: Conectado */}
            {status === 'connected' && (
              <div className="flex flex-col items-center gap-4">
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
                  <CheckCircle2 className="h-10 w-10 text-green-600 dark:text-green-400" />
                </div>
                <p className="text-sm font-medium text-green-600 dark:text-green-400">
                  Conectado
                </p>
                <Button variant="outline" size="sm" onClick={disconnect}>
                  Desvincular
                </Button>
              </div>
            )}

            {/* Estado: Idle — no vinculado */}
            {status === 'idle' && paired === false && (
              <div className="flex flex-col items-center gap-4">
                <div className="flex h-32 w-32 items-center justify-center rounded-xl border-2 border-dashed">
                  <QrCode className="h-12 w-12 text-muted-foreground" />
                </div>
                <Button onClick={startPairing} className="gap-2">
                  <MessageCircle className="h-4 w-4" />
                  Vincular WhatsApp
                </Button>
              </div>
            )}

            {/* Estado: Cargando */}
            {status === 'loading' && (
              <div className="flex flex-col items-center gap-3 py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Generando código QR...</p>
              </div>
            )}

            {/* Estado: Escaneando QR */}
            {status === 'scanning' && qrDataUrl && (
              <div className="flex flex-col items-center gap-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={qrDataUrl}
                  alt="QR Code"
                  className="rounded-xl border p-2"
                  width={280}
                  height={280}
                />
                <div className="text-center">
                  <p className="text-sm font-medium">Escaneá este QR con tu teléfono</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    WhatsApp &gt; Dispositivos vinculados &gt; Vincular dispositivo
                  </p>
                </div>
              </div>
            )}

            {/* Estado: Error */}
            {status === 'error' && (
              <div className="flex flex-col items-center gap-4">
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
                  <AlertCircle className="h-10 w-10 text-red-600 dark:text-red-400" />
                </div>
                <p className="text-sm text-red-600 dark:text-red-400">
                  {error || 'Error de conexión'}
                </p>
                <Button variant="outline" onClick={startPairing}>
                  Reintentar
                </Button>
              </div>
            )}

            {/* Cargando estado inicial */}
            {status === 'idle' && paired === null && (
              <div className="py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
