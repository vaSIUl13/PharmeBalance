import { useEffect, useState } from "react";

type Snapshot<T> = { token: number; data?: T; error?: unknown };

export function useResource<T>(load: () => Promise<T>) {
  const [token, setToken] = useState(0);
  const [snapshot, setSnapshot] = useState<Snapshot<T>>({ token: -1 });

  useEffect(() => {
    let active = true;
    load().then(
      data => { if (active) setSnapshot({ token, data }); },
      error => { if (active) setSnapshot({ token, error }); },
    );
    return () => { active = false; };
  }, [load, token]);

  const settled = snapshot.token === token;
  return {
    data: snapshot.data,
    error: settled ? snapshot.error : undefined,
    loading: !settled,
    reload: () => setToken(value => value + 1),
  };
}
