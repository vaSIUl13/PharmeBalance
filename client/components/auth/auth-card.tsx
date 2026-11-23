import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import styles from "./auth.module.css";

export function AuthCard({ title, description, children, footer, embedded = false }: {
  title: string;
  description: string;
  children: ReactNode;
  footer?: ReactNode;
  embedded?: boolean;
}) {
  const Container = embedded ? "div" : "main";
  return (
    <Container className={embedded ? `${styles.page} ${styles.embedded}` : styles.page}>
      <section aria-labelledby="auth-title" className={styles.card}>
        <div className={styles.brand}>
          <Image className={styles.mark} src="/assets/icons/logo.svg" alt="" width={40} height={40} />
          <div>
            <p className={styles.brandName}>PharmaBalance</p>
            <p className={styles.tagline}>Предиктивне керування запасами аптечної мережі</p>
          </div>
        </div>
        <header>
          <h1 className={styles.title} id="auth-title">{title}</h1>
          <p className={styles.description}>{description}</p>
        </header>
        {children}
        {footer && <div className={styles.footer}>{footer}</div>}
      </section>
    </Container>
  );
}

export function AuthLink({ href, children }: { href: string; children: ReactNode }) {
  return <Link className={styles.link} href={href}>{children}</Link>;
}
