'use client'

import { useRouter } from 'next/navigation'
import { Editor } from 'grapesjs'
import {
  ArrowLeft,
  Undo2,
  Redo2,
  Monitor,
  Tablet,
  Smartphone,
  Save,
  Loader2,
  ExternalLink,
} from 'lucide-react'

interface EditorTopbarProps {
  editor: Editor | null
  businessName: string
  previewUrl?: string
  saving: boolean
  hasUnsavedChanges: boolean
  activeDevice: string
  onSave: () => void
  onDeviceChange: (device: string) => void
}

export default function EditorTopbar({
  editor,
  businessName,
  previewUrl,
  saving,
  hasUnsavedChanges,
  activeDevice,
  onSave,
  onDeviceChange,
}: EditorTopbarProps) {
  const router = useRouter()

  const handleBack = () => {
    if (hasUnsavedChanges) {
      const confirmed = window.confirm(
        'Tenés cambios sin guardar. ¿Seguro que querés salir?'
      )
      if (!confirmed) return
    }
    router.push('/kanban')
  }

  const handleUndo = () => editor?.UndoManager.undo()
  const handleRedo = () => editor?.UndoManager.redo()

  const devices = [
    { name: 'Desktop', icon: Monitor },
    { name: 'Tablet', icon: Tablet },
    { name: 'Mobile', icon: Smartphone },
  ] as const

  return (
    <div
      className="flex items-center gap-2 px-3 py-2 border-b shrink-0"
      style={{ background: '#1a1a2e', borderColor: '#2a2a4a', color: '#e0e0e0' }}
    >
      {/* Back */}
      <button
        onClick={handleBack}
        className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium hover:bg-white/10 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Volver
      </button>

      {/* Divider */}
      <div className="h-5 w-px bg-white/20" />

      {/* Business name */}
      <span className="text-sm font-semibold truncate max-w-[240px]">
        {businessName}
      </span>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Undo / Redo */}
      <div className="flex items-center gap-0.5">
        <button
          onClick={handleUndo}
          className="rounded-md p-1.5 hover:bg-white/10 transition-colors"
          title="Deshacer"
        >
          <Undo2 className="h-4 w-4" />
        </button>
        <button
          onClick={handleRedo}
          className="rounded-md p-1.5 hover:bg-white/10 transition-colors"
          title="Rehacer"
        >
          <Redo2 className="h-4 w-4" />
        </button>
      </div>

      {/* Divider */}
      <div className="h-5 w-px bg-white/20" />

      {/* Device toggles */}
      <div className="flex items-center gap-0.5">
        {devices.map(({ name, icon: Icon }) => (
          <button
            key={name}
            onClick={() => onDeviceChange(name)}
            className="rounded-md p-1.5 transition-colors"
            style={{
              background: activeDevice === name ? 'rgba(255,255,255,0.15)' : 'transparent',
            }}
            title={name}
          >
            <Icon className="h-4 w-4" />
          </button>
        ))}
      </div>

      {/* Divider */}
      <div className="h-5 w-px bg-white/20" />

      {/* Preview link */}
      {previewUrl && (
        <a
          href={previewUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm hover:bg-white/10 transition-colors"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Preview
        </a>
      )}

      {/* Save */}
      <button
        onClick={onSave}
        disabled={saving || !hasUnsavedChanges}
        className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold transition-colors disabled:opacity-40"
        style={{ background: '#4f46e5', color: '#fff' }}
      >
        {saving ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Save className="h-4 w-4" />
        )}
        {saving ? 'Guardando...' : 'Guardar'}
      </button>
    </div>
  )
}
