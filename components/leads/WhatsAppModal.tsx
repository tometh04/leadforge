'use client'

import { useState, useEffect } from 'react'
import { Lead } from '@/types'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { MessageSquare, RefreshCw, ExternalLink, Loader2, Sparkles, Phone } from 'lucide-react'
import { toast } from 'sonner'

interface WhatsAppModalProps {
  lead: Lead | null
  open: boolean
  onClose: () => void
  onSent: (updatedLead: Partial<Lead>) => void
}

export function WhatsAppModal({ lead, open, onClose, onSent }: WhatsAppModalProps) {
  const [message, setMessage] = useState('')
  const [loadingMessage, setLoadingMessage] = useState(false)
  const [sending, setSending] = useState(false)
  const [usedAI, setUsedAI] = useState(false)

  useEffect(() => {
    if (open && lead) {
      generateMessage()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, lead?.id])

  const generateMessage = async () => {
    if (!lead) return
    setLoadingMessage(true)
    try {
      const res = await fetch(`/api/outreach/generate-message/${lead.id}`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setMessage(data.message)
      setUsedAI(data.usedAI)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al generar mensaje')
    } finally {
      setLoadingMessage(false)
    }
  }

  const handleSend = async () => {
    if (!lead || !message.trim()) return

    const rawPhone = lead.phone.replace(/\D/g, '')
    const phone = rawPhone.startsWith('0') ? rawPhone.slice(1) : rawPhone
    const waUrl = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`

    // Abrir WhatsApp
    window.open(waUrl, '_blank')

    // Registrar en el backend
    setSending(true)
    try {
      await fetch(`/api/outreach/send/${lead.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message_body: message,
          template_used: usedAI ? 'ai_generated' : 'default_template',
        }),
      })
      toast.success('✅ WhatsApp abierto y lead marcado como contactado')
      onSent({ status: 'contactado', last_contacted_at: new Date().toISOString() })
      onClose()
    } catch {
      toast.error('WhatsApp abierto pero no se pudo registrar el envío')
    } finally {
      setSending(false)
    }
  }

  const charCount = message.length

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-green-500" />
            Enviar WhatsApp
          </DialogTitle>
        </DialogHeader>

        {lead && (
          <div className="space-y-4">
            {/* Info del lead */}
            <div className="flex items-center gap-3 rounded-lg border bg-muted/30 p-3">
              {lead.google_photo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={lead.google_photo_url} alt="" className="h-9 w-9 rounded object-cover" />
              ) : (
                <div className="flex h-9 w-9 items-center justify-center rounded bg-muted text-sm font-bold">
                  {lead.business_name.charAt(0)}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="truncate font-semibold">{lead.business_name}</p>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Phone className="h-3 w-3" />
                  {lead.phone}
                </div>
              </div>
              {lead.generated_site_url && (
                <a
                  href={lead.generated_site_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-primary hover:underline shrink-0"
                >
                  <ExternalLink className="h-3 w-3" />
                  Ver sitio
                </a>
              )}
            </div>

            <Separator />

            {/* Mensaje */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Mensaje</label>
                <div className="flex items-center gap-2">
                  {usedAI && (
                    <Badge variant="secondary" className="gap-1 text-xs">
                      <Sparkles className="h-3 w-3" />
                      Generado con IA
                    </Badge>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 gap-1.5 text-xs"
                    onClick={generateMessage}
                    disabled={loadingMessage}
                  >
                    {loadingMessage ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3 w-3" />
                    )}
                    Regenerar
                  </Button>
                </div>
              </div>

              {loadingMessage ? (
                <div className="flex h-36 items-center justify-center rounded-lg border border-dashed">
                  <div className="text-center">
                    <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin text-muted-foreground" />
                    <p className="text-xs text-muted-foreground">Generando mensaje...</p>
                  </div>
                </div>
              ) : (
                <Textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="min-h-36 resize-none text-sm leading-relaxed"
                  placeholder="El mensaje aparecerá acá..."
                />
              )}

              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  Podés editarlo antes de enviar
                </p>
                <span className={`text-xs ${charCount > 1000 ? 'text-red-500' : 'text-muted-foreground'}`}>
                  {charCount} caracteres
                </span>
              </div>
            </div>

            {!lead.generated_site_url && (
              <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-xs text-yellow-800 dark:border-yellow-800 dark:bg-yellow-950 dark:text-yellow-200">
                💡 Este lead no tiene sitio generado. Generá uno primero para incluir el link en el mensaje.
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose} disabled={sending}>
            Cancelar
          </Button>
          <Button
            onClick={handleSend}
            disabled={!message.trim() || loadingMessage || sending}
            className="gap-2 bg-green-600 hover:bg-green-700"
          >
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <MessageSquare className="h-4 w-4" />
            )}
            Abrir en WhatsApp
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
