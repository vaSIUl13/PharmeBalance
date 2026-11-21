import Link from "next/link";

export default function Home() {
  return (
    <main className="p-8">
      <h1 className="text-3xl font-semibold">PharmaBalance</h1>
      <p className="mt-2">Управління запасами аптечної мережі</p>
      <Link className="mt-4 inline-block underline" href="/login">Увійти</Link>
    </main>
  );
}
