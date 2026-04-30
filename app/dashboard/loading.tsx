export default function Loading() {
    return (
        <main className="p-6 max-w-md mx-auto space-y-6 pb-32">
            <header>
                <div className="h-6 w-48 bg-gray-100 animate-pulse rounded mb-1" />
                <div className="h-4 w-32 bg-gray-50 animate-pulse rounded" />
            </header>

            <div className="grid grid-cols-2 gap-3">
                {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm space-y-2">
                        <div className="h-3 w-16 bg-gray-50 animate-pulse rounded" />
                        <div className="h-7 w-24 bg-gray-100 animate-pulse rounded-lg" />
                    </div>
                ))}
            </div>

            <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm space-y-4">
                <div className="h-4 w-40 bg-gray-100 animate-pulse rounded" />
                <div className="h-48 w-full bg-gray-50 animate-pulse rounded-xl" />
            </div>

            <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm space-y-4">
                <div className="h-4 w-36 bg-gray-100 animate-pulse rounded" />
                {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="flex items-center justify-between py-2">
                        <div className="flex items-center gap-3">
                            <div className="h-8 w-8 bg-gray-50 animate-pulse rounded-lg" />
                            <div className="h-4 w-28 bg-gray-100 animate-pulse rounded" />
                        </div>
                        <div className="h-4 w-16 bg-gray-50 animate-pulse rounded" />
                    </div>
                ))}
            </div>
        </main>
    );
}
