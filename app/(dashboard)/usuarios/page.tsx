import { UserTable } from '@/components/users/user-table'

export default function UsuariosPage() {
  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Usuarios</h1>
        <p className="text-muted-foreground">
          Gestioná las cuentas de usuario de LeadForge.
        </p>
      </div>
      <UserTable />
    </div>
  )
}
