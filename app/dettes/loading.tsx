export default function Loading() {
    return (
        <main className="p-6 max-w-md mx-auto space-y-8 pb-32">
            <header className="space-y-6">
                <div className="flex items-center gap-3">
                    <h1 className="text-xl font-bold tracking-tight text-gray-900">Dettes & Échéanciers</h1>
                </div>

                <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 space-y-4">
                    <div className="flex justify-between items-start">
                        <div className="flex-1">
                            <p className="text-sm font-medium text-gray-500 flex items-center gap-1.5">
                                Reste à payer
                            </p>
                            <div className="mt-1 h-9 flex items-center">
                                <div className="h-8 w-40 bg-gray-100 animate-pulse rounded-lg" />
                            </div>
                        </div>
                        <div className="h-6 flex items-center">
                            <div className="h-6 w-16 bg-blue-50 animate-pulse rounded-lg" />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 py-2 border-y border-gray-50">
                        <div>
                            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Total dû</p>
                            <div className="h-5 flex items-center mt-0.5">
                                <div className="h-4 w-20 bg-gray-100 animate-pulse rounded" />
                            </div>
                        </div>
                        <div className="text-right">
                            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Déjà payé</p>
                            <div className="h-5 flex justify-end items-center mt-0.5">
                                <div className="h-4 w-20 bg-gray-100 animate-pulse rounded" />
                            </div>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <div className="h-3 w-full bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full w-full bg-gray-200 animate-pulse" />
                        </div>
                    </div>
                </div>
            </header>

            <section className="space-y-4">
                <div className="flex items-center justify-between">
                    <h2 className="text-lg font-bold text-gray-900">Vos créanciers</h2>
                </div>

                <div className="space-y-4">
                    {Array.from({ length: 3 }).map((_, i) => (
                        <div key={i} className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-3">
                                    <div className="h-9 w-9 bg-gray-50 animate-pulse rounded-xl" />
                                    <div className="h-4 w-32 bg-gray-100 animate-pulse rounded" />
                                </div>
                            </div>
                            <div className="h-2 w-full bg-gray-50 animate-pulse rounded-full mt-3" />
                        </div>
                    ))}
                </div>
            </section>
        </main>
    );
}
