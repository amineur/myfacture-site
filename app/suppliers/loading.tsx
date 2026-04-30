export default function Loading() {
    return (
        <main className="p-6 max-w-md mx-auto space-y-6 pb-32">
            <header className="space-y-4">
                <h1 className="text-xl font-bold tracking-tight text-gray-900">Fournisseurs</h1>
                <div className="h-10 w-full bg-gray-100 animate-pulse rounded-xl" />
            </header>

            <section className="space-y-3">
                {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="h-10 w-10 bg-gray-50 animate-pulse rounded-xl" />
                                <div className="space-y-2">
                                    <div className="h-4 w-32 bg-gray-100 animate-pulse rounded" />
                                    <div className="h-3 w-20 bg-gray-50 animate-pulse rounded" />
                                </div>
                            </div>
                            <div className="text-right space-y-2">
                                <div className="h-4 w-16 bg-gray-100 animate-pulse rounded" />
                                <div className="h-3 w-12 bg-gray-50 animate-pulse rounded" />
                            </div>
                        </div>
                    </div>
                ))}
            </section>
        </main>
    );
}
