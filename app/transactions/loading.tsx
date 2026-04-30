export default function Loading() {
    return (
        <main className="p-6 max-w-md mx-auto space-y-6 pb-32">
            <header className="space-y-4">
                <h1 className="text-xl font-bold tracking-tight text-gray-900">Transactions</h1>
                <div className="flex gap-2">
                    <div className="h-9 w-24 bg-gray-100 animate-pulse rounded-lg" />
                    <div className="h-9 w-24 bg-gray-100 animate-pulse rounded-lg" />
                </div>
            </header>

            <section className="space-y-2">
                {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex items-center justify-between">
                        <div className="space-y-2">
                            <div className="h-4 w-40 bg-gray-100 animate-pulse rounded" />
                            <div className="h-3 w-24 bg-gray-50 animate-pulse rounded" />
                        </div>
                        <div className="h-5 w-16 bg-gray-100 animate-pulse rounded" />
                    </div>
                ))}
            </section>
        </main>
    );
}
