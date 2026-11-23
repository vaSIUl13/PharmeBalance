export const registrationRoles = [
  { value: "admin", label: "Admin" },
  { value: "logist", label: "Logist" },
  { value: "manager", label: "Manager" },
  { value: "head", label: "Head" },
] as const;

export function RegistrationRoles() {
  return (
    <fieldset>
      <legend className="mb-2 text-xs font-semibold">Бажана роль *</legend>
      <div className="grid grid-cols-2 gap-2 min-[400px]:grid-cols-4">
        {registrationRoles.map(role => (
          <label key={role.value} className="cursor-pointer">
            <input type="radio" name="role" value={role.value} required className="peer sr-only" />
            <span className="block rounded-md border border-[#dce5e0] px-2 py-2 text-center peer-checked:border-teal-700 peer-checked:bg-teal-50 peer-checked:text-teal-800 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-teal-700">
              {role.label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
