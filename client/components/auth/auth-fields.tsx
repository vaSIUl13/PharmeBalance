"use client";

import Image from "next/image";
import { useId, useState, type ComponentProps, type ReactNode } from "react";
import styles from "./auth.module.css";

type FieldProps = Omit<ComponentProps<"input">, "id" | "className"> & {
  label: string;
  hint?: string;
  labelAction?: ReactNode;
};

export function AuthField({ label, hint, labelAction, type, ...input }: FieldProps) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  const password = type === "password";
  return (
    <div>
      <div className={styles.labelRow}>
        <label htmlFor={id}>{label}</label>
        {labelAction}
      </div>
      <div className="relative">
        <input
          {...input}
          id={id}
          type={password && visible ? "text" : type}
          className={password ? styles.password : styles.input}
          aria-describedby={[input["aria-describedby"], hint && id + "-hint"].filter(Boolean).join(" ") || undefined}
        />
        {password && (
          <button
            className={styles.visibility}
            type="button"
            onClick={() => setVisible(value => !value)}
            aria-label="Показати пароль"
            aria-pressed={visible}
            aria-controls={id}
          >
            <Image src={visible ? "/assets/icons/eye-off.svg" : "/assets/icons/eye.svg"} alt="" width={14} height={14} />
          </button>
        )}
      </div>
      {hint && <p id={id + "-hint"} className={styles.hint}>{hint}</p>}
    </div>
  );
}

export function AuthSubmit({ busy = false, children }: { busy?: boolean; children: ReactNode }) {
  return <button type="submit" className={styles.submit} disabled={busy}>{busy ? "Зачекайте…" : children}</button>;
}

export function AuthFeedback({ message, error }: { message: string; error?: boolean }) {
  if (!message) return null;
  return <p role={error ? "alert" : "status"} className={error ? "text-red-700" : styles.description}>{message}</p>;
}
