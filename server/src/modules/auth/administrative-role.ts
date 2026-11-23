export function isAdministrativeRole(role: string | undefined): boolean {
  return role === 'admin' || role === 'superadmin';
}
