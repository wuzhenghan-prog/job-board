export async function api<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const isFormData = init.body instanceof FormData;
  const response = await fetch(path, {
    ...init,
    credentials: "same-origin",
    headers: {
      ...(init.body && !isFormData ? { "content-type": "application/json" } : {}),
      ...(init.headers ?? {})
    }
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `请求失败：${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}
