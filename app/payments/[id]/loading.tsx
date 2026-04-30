"use client";

import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function PaymentDetailLoading() {
    return (
        <main className="min-h-screen bg-gray-50 flex flex-col pb-32">
            <header className="px-6 pt-6 pb-2 bg-gray-50 sticky top-0 z-10 w-full max-w-md mx-auto">
                <div className="flex items-center justify-between mb-2">
                    <Button
                        variant="ghost"
                        size="icon"
                        className="-ml-2 h-10 w-10 rounded-full bg-white shadow-sm border border-gray-100"
                    >
                        <ArrowLeft className="h-5 w-5 text-gray-900" />
                    </Button>
                    <div className="flex flex-col items-center">
                        <h1 className="text-sm font-bold text-gray-500 uppercase tracking-wider">Détail Facture</h1>
                    </div>
                    <div className="w-10" />
                </div>
            </header>
            <div className="flex-1 px-6 space-y-6 pt-4 max-w-md mx-auto w-full">
                <div className="animate-pulse space-y-8 pt-4">
                    <div className="flex flex-row items-center gap-4 px-2">
                        <div className="h-16 w-16 rounded-2xl bg-gray-200 shrink-0" />
                        <div className="space-y-2">
                            <div className="h-5 w-28 bg-gray-200 rounded" />
                            <div className="h-4 w-16 bg-gray-100 rounded-full" />
                        </div>
                    </div>
                    <div className="h-20 w-full bg-gray-100 rounded-2xl" />
                    <div className="h-56 w-full bg-white rounded-3xl border border-gray-100 p-6 space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            {[1, 2, 3, 4].map(i => (
                                <div key={i} className="space-y-2">
                                    <div className="h-3 w-16 bg-gray-100 rounded" />
                                    <div className="h-4 w-24 bg-gray-200 rounded" />
                                </div>
                            ))}
                        </div>
                        <div className="border-t border-gray-50 pt-4 space-y-3">
                            <div className="h-4 w-full bg-gray-50 rounded" />
                            <div className="h-4 w-full bg-gray-50 rounded" />
                        </div>
                    </div>
                    <div className="h-16 w-full bg-gray-100 rounded-2xl" />
                </div>
            </div>
        </main>
    );
}
