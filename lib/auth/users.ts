import bcrypt from 'bcryptjs'
import { createServiceClient } from '@/lib/supabase/service'

const BCRYPT_ROUNDS = 12

export interface AppUser {
  id: string
  email: string
  name: string | null
  is_seed: boolean
  created_at: string
  updated_at: string
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS)
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash)
}

export async function findUserByEmail(email: string): Promise<(AppUser & { password_hash: string }) | null> {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('users')
    .select('*')
    .eq('email', email.toLowerCase())
    .single()
  return data ?? null
}

export async function findUserById(id: string): Promise<AppUser | null> {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('users')
    .select('id, email, name, is_seed, created_at, updated_at')
    .eq('id', id)
    .single()
  return data ?? null
}

export async function createUser(params: {
  email: string
  name?: string
  password: string
  is_seed?: boolean
}): Promise<AppUser> {
  const supabase = createServiceClient()
  const password_hash = await hashPassword(params.password)

  const { data, error } = await supabase
    .from('users')
    .insert({
      email: params.email.toLowerCase(),
      name: params.name ?? null,
      password_hash,
      is_seed: params.is_seed ?? false,
    })
    .select('id, email, name, is_seed, created_at, updated_at')
    .single()

  if (error) throw new Error(error.message)
  return data!
}

export async function updateUser(
  id: string,
  params: { email?: string; name?: string; password?: string }
): Promise<AppUser> {
  const supabase = createServiceClient()
  const updates: Record<string, unknown> = {}

  if (params.email) updates.email = params.email.toLowerCase()
  if (params.name !== undefined) updates.name = params.name
  if (params.password) updates.password_hash = await hashPassword(params.password)

  const { data, error } = await supabase
    .from('users')
    .update(updates)
    .eq('id', id)
    .select('id, email, name, is_seed, created_at, updated_at')
    .single()

  if (error) throw new Error(error.message)
  return data!
}

export async function deleteUser(id: string): Promise<void> {
  const supabase = createServiceClient()
  const { error } = await supabase.from('users').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

export async function listUsers(): Promise<AppUser[]> {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('users')
    .select('id, email, name, is_seed, created_at, updated_at')
    .order('created_at', { ascending: true })

  if (error) throw new Error(error.message)
  return data ?? []
}

/**
 * Auto-provision seed user from env vars if no user exists in DB with that email.
 * Returns the user if provisioned or already exists, null if env vars are missing.
 */
export async function ensureSeedUser(): Promise<AppUser | null> {
  const email = process.env.ADMIN_EMAIL
  const password = process.env.ADMIN_PASSWORD
  if (!email || !password) return null

  const existing = await findUserByEmail(email)
  if (existing) return existing

  return createUser({ email, password, name: 'Admin', is_seed: true })
}
