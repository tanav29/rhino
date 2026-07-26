let csrfToken: string | null = null;

export async function apiFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  if (!csrfToken) {
    const response = await fetch("/api/csrf");
    if (!response.ok) throw new Error("Unable to initialize API security");
    csrfToken = (await response.json() as { token: string }).token;
  }
  const headers = new Headers(init.headers);
  headers.set("x-wterm-csrf", csrfToken);
  return fetch(input, { ...init, headers });
}
