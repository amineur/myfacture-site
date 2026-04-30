"use client";

import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function SupplierDetailLoading() {
    return (
        <main className="min-h-screen bg-gray-50 flex flex-col pb-10">
            <header className="px-6 pt-6 pb-2 bg-gray-50 sticky top-0 z-10">
                <div className="flex items-center justify-between mb-2">
                    <Button
                        variant="ghost"
                        size="icon"
                        className="-ml-2 h-10 w-10 rounded-full bg-white shadow-sm border border-gray-100"
                    >
                        <ArrowLeft className="h-5 w-5 text-gray-900" />
                    </Button>
                    <h1 className="text-sm font-bold text-gray-500 uppercase tracking-wider">Fiche Fournisseur</h1>
                    <div className="w-10" />
                </div>
                <div className="animate-pulse space-y-6 mb-6">
                    <div className="flex flex-row items-center gap-4">
                        <div className="h-20 w-20 rounded-3xl bg-gray-200 shrink-0" />
                        <div className="space-y-2">
                            <div className="h-7 w-36 bg-gray-200 rounded" />
                            <div className="h-5 w-20 bg-gray-100 rounded-full" />
                        </div>
                    </div>
                    <div className="flex p-1 bg-gray-200/50 rounded-xl h-10 w-full" />
                </div>
            </header>
            <div className="flex-1 px-6 space-y-6 pt-2">
                <div className="animate-pulse space-y-6">
                    <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-2xl bg-gray-200 h-32" />
                        <div className="rounded-2xl bg-gray-200 h-32" />
                    </div>
                    <div className="rounded-3xl bg-gray-200 h-40" />
                    <div className="rounded-3xl bg-gray-200 h-32" />
                </div>
            </div>
        </main>
    );
}
