export async function authRequest<T>(path: string, method = "GET", body?: object): Promise<T> {
  return apiRequest<T>("auth/" + path, method, body);
}

export async function apiRequest<T>(path: string, method = "GET", body?: object): Promise<T> {
  const response = await fetch("/api/v1/" + path, {
    method,
    cache: "no-store",
    credentials: "same-origin",
    headers: method === "GET" ? undefined : {
      "Content-Type": "application/json",
      "X-Pharme-CSRF": "1",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    const error = await response.json().catch(() => null) as { message?: string } | null;
    throw new ApiError(response.status, error?.message ?? "The request could not be completed.");
  }
  const payload = await response.text();
  return (payload ? JSON.parse(payload) : undefined) as T;
}

export class ApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}
