export default function Home() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <main className="text-center">
        <h1 className="text-2xl font-bold">Tomo API</h1>
        <p className="mt-2 text-zinc-500">Backend service running.</p>
        <p className="mt-1 text-sm text-zinc-400">
          GET /api/health for status
        </p>
      </main>
    </div>
  );
}
