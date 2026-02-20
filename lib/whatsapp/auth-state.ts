import { createClient } from '@/lib/supabase/server'
import type { AuthenticationCreds, SignalDataTypeMap, SignalKeyStore } from '@whiskeysockets/baileys'
import { proto, initAuthCreds, BufferJSON } from '@whiskeysockets/baileys'

const TABLE = 'whatsapp_auth'

async function readData(id: string): Promise<unknown | null> {
  const supabase = await createClient()
  const { data } = await supabase.from(TABLE).select('data').eq('id', id).single()
  return data ? JSON.parse(JSON.stringify(data.data), BufferJSON.reviver) : null
}

async function writeData(id: string, value: unknown): Promise<void> {
  const supabase = await createClient()
  const serialized = JSON.parse(JSON.stringify(value, BufferJSON.replacer))
  await supabase.from(TABLE).upsert(
    { id, data: serialized, updated_at: new Date().toISOString() },
    { onConflict: 'id' }
  )
}

async function removeData(id: string): Promise<void> {
  const supabase = await createClient()
  await supabase.from(TABLE).delete().eq('id', id)
}

export async function useSupabaseAuthState(): Promise<{
  state: { creds: AuthenticationCreds; keys: SignalKeyStore }
  saveCreds: () => Promise<void>
}> {
  const creds: AuthenticationCreds =
    (await readData('creds') as AuthenticationCreds) || initAuthCreds()

  const keys: SignalKeyStore = {
    get: async <T extends keyof SignalDataTypeMap>(
      type: T,
      ids: string[]
    ): Promise<{ [id: string]: SignalDataTypeMap[T] }> => {
      const result: { [id: string]: SignalDataTypeMap[T] } = {}
      await Promise.all(
        ids.map(async (id) => {
          let value = await readData(`${type}-${id}`)
          if (type === 'app-state-sync-key' && value) {
            value = proto.Message.AppStateSyncKeyData.fromObject(value as Record<string, unknown>)
          }
          if (value) {
            result[id] = value as SignalDataTypeMap[T]
          }
        })
      )
      return result
    },
    set: async (data: Record<string, Record<string, unknown>>) => {
      const tasks: Promise<void>[] = []
      for (const category in data) {
        for (const id in data[category]) {
          const value = data[category][id]
          const key = `${category}-${id}`
          tasks.push(value ? writeData(key, value) : removeData(key))
        }
      }
      await Promise.all(tasks)
    },
  }

  return {
    state: { creds, keys },
    saveCreds: () => writeData('creds', creds),
  }
}
