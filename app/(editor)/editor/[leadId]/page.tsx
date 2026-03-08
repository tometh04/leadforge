import { redirect } from 'next/navigation'
import { requireAuth } from '@/lib/auth/verify-session'
import { createClient } from '@/lib/supabase/server'
import SiteEditor from '@/components/editor/SiteEditor'

export default async function EditorPage({
  params,
}: {
  params: Promise<{ leadId: string }>
}) {
  const user = await requireAuth()
  const { leadId } = await params
  const supabase = await createClient()

  const { data: lead } = await supabase
    .from('leads')
    .select('id, business_name, score_details, generated_site_url')
    .eq('id', leadId)
    .eq('user_id', user.id)
    .single()

  const siteHtml = (lead?.score_details as Record<string, unknown> | null)?.site_html as
    | string
    | undefined

  if (!lead || !siteHtml) {
    redirect('/kanban')
  }

  return (
    <SiteEditor
      leadId={lead.id}
      businessName={lead.business_name}
      initialHtml={siteHtml}
      previewUrl={lead.generated_site_url ?? undefined}
    />
  )
}
