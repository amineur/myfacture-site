"use client"

import React, { useState, useEffect, useMemo } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { startOfMonth, endOfMonth, subMonths, format, startOfYear, endOfYear } from "date-fns"
import { Loader2, Calendar as CalendarIcon } from "lucide-react"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"

type BreakdownItem = {
    category: string
    amount: number
    percentage: number
}

type Period = "1M" | "3M" | "6M" | "12M" | "CUSTOM"

const formatMoney = (amount: number) => {
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(amount);
}

const CATEGORY_COLORS: Record<string, string> = {
    "Antenne": "#3B82F6", // Blue
    "Digital": "#10B981", // Emerald
    "Diffusion": "#8B5CF6", // Violet
    "Charges fiscales et sociales": "#EF4444", // Red
    "Logiciel": "#F59E0B", // Amber
    "Régie": "#EC4899", // Pink
    "Télécommunications & abonnements": "#6366F1", // Indigo
    "Banque": "#64748B", // Slate
    "Salaire": "#14B8A6", // Teal
    "Autre": "#9CA3AF" // Gray
};

// Pre-computed donut chart to avoid O(n^2) calculations on every render
const CIRCUMFERENCE = 2 * Math.PI * 40;

const DonutChart = React.memo(function DonutChart({ data }: { data: BreakdownItem[] }) {
    const segments = useMemo(() => {
        let cumulative = 0;
        return data.map((item) => {
            const dashArray = `${(item.percentage / 100) * CIRCUMFERENCE} ${CIRCUMFERENCE}`;
            const dashOffset = -1 * (cumulative / 100) * CIRCUMFERENCE;
            cumulative += item.percentage;
            return { key: item.category, dashArray, dashOffset, color: CATEGORY_COLORS[item.category] || CATEGORY_COLORS["Autre"] };
        });
    }, [data]);

    return (
        <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
            {segments.map(seg => (
                <circle
                    key={seg.key}
                    cx="50" cy="50" r="40"
                    fill="transparent"
                    stroke={seg.color}
                    strokeWidth="20"
                    strokeDasharray={seg.dashArray}
                    strokeDashoffset={seg.dashOffset}
                    className="transition-all duration-500 hover:opacity-80"
                />
            ))}
        </svg>
    );
});

export function ExpensesBreakdown({ companyId }: { companyId?: string }) {
    const [period, setPeriod] = useState<Period>("12M")
    const [customStart, setCustomStart] = useState<string>("")
    const [customEnd, setCustomEnd] = useState<string>("")
    const [data, setData] = useState<BreakdownItem[]>([])
    const [totalSpend, setTotalSpend] = useState(0)
    const [isLoading, setIsLoading] = useState(true)
    const [isEmpty, setIsEmpty] = useState(false)
    const [isCustomDateDialogOpen, setIsCustomDateDialogOpen] = useState(false)

    // Set default custom dates if needed
    useEffect(() => {
        const now = new Date()
        setCustomStart(format(startOfYear(now), 'yyyy-MM-dd'))
        setCustomEnd(format(endOfYear(now), 'yyyy-MM-dd'))
    }, [])

    useEffect(() => {
        if (!companyId) return

        async function fetchData() {
            setIsLoading(true)

            let startDate: Date
            let endDate: Date = new Date()

            const now = new Date()

            if (period === "1M") {
                startDate = startOfMonth(subMonths(now, 1))
                endDate = endOfMonth(subMonths(now, 1))
            } else if (period === "3M") {
                startDate = subMonths(now, 3)
            } else if (period === "6M") {
                startDate = subMonths(now, 6)
            } else if (period === "12M") {
                startDate = subMonths(now, 12)
            } else {
                startDate = customStart ? new Date(customStart) : startOfYear(now)
                endDate = customEnd ? new Date(customEnd) : endOfYear(now)
            }

            try {
                const params = new URLSearchParams({
                    companyId: companyId!,
                    startDate: startDate.toISOString(),
                    endDate: endDate.toISOString(),
                })
                const res = await fetch(`/api/expenses-breakdown?${params}`)
                if (res.ok) {
                    const { breakdown, totalSpend: total } = await res.json()
                    setData(breakdown)
                    setTotalSpend(total || 0)
                    setIsEmpty(breakdown.length === 0)
                }
            } catch (error) {
                console.error("Error fetching breakdown:", error)
            }
            setIsLoading(false)
        }

        fetchData()
    }, [companyId, period, customStart, customEnd])

    return (
        <section>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4">
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">Répartition des dépenses</h2>

                <div className="flex items-center gap-1 border-b border-gray-100 pb-1 mb-2 sm:mb-0">
                    {(["1M", "3M", "6M", "12M", "CUSTOM"] as Period[]).map((p) => {
                        const label = p === "12M" ? "12 Mois" : p === "CUSTOM" ? "Période" : p;
                        const isActive = period === p;
                        return (
                            <button
                                key={p}
                                onClick={() => {
                                    if (p === "CUSTOM") {
                                        setIsCustomDateDialogOpen(true)
                                    }
                                    setPeriod(p)
                                }}
                                className={`
                                     px-3 py-2 text-sm font-medium transition-colors relative
                                     ${isActive ? "text-gray-900" : "text-gray-500 hover:text-gray-900"}
                                 `}
                            >
                                {label}
                                {isActive && (
                                    <div className="absolute bottom-[-5px] left-0 w-full h-[2px] bg-gray-900 rounded-t-full" />
                                )}
                            </button>
                        )
                    })}
                </div>
            </div>

            {period === "CUSTOM" && (
                <div className="grid grid-cols-2 gap-2 mb-4 bg-gray-50 p-3 rounded-lg border border-gray-100">
                    <div className="space-y-1">
                        <span className="text-[10px] text-gray-500 uppercase font-bold">Du</span>
                        <input
                            type="date"
                            value={customStart}
                            onChange={(e) => setCustomStart(e.target.value)}
                            className="w-full text-xs p-1 rounded border border-gray-200 bg-white"
                        />
                    </div>
                    <div className="space-y-1">
                        <span className="text-[10px] text-gray-500 uppercase font-bold">Au</span>
                        <input
                            type="date"
                            value={customEnd}
                            onChange={(e) => setCustomEnd(e.target.value)}
                            className="w-full text-xs p-1 rounded border border-gray-200 bg-white"
                        />
                    </div>
                </div>
            )}

            <Card className="p-5 shadow-sm">
                {isLoading ? (
                    <div className="flex flex-col sm:flex-row items-center gap-6">
                        {/* Skeleton Donut */}
                        <div className="relative h-48 w-48 shrink-0 bg-gray-50 animate-pulse rounded-full border-[20px] border-gray-100 flex items-center justify-center">
                            <div className="text-center space-y-1">
                                <div className="h-2 w-8 bg-gray-200 rounded mx-auto" />
                                <div className="h-4 w-16 bg-gray-200 rounded mx-auto" />
                            </div>
                        </div>

                        {/* Skeleton Legend */}
                        <div className="flex-1 w-full space-y-4">
                            {[1, 2, 3, 4].map((i) => (
                                <div key={i} className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <div className="h-3 w-3 rounded-full bg-gray-100 shrink-0" />
                                        <div className="h-3 w-24 bg-gray-100 rounded" />
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <div className="h-3 w-16 bg-gray-100 rounded" />
                                        <div className="h-3 w-8 bg-gray-100 rounded" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ) : isEmpty ? (
                    <div className="flex flex-col items-center justify-center py-8 text-center bg-gray-50/50 rounded-lg border border-dashed border-gray-200">
                        <div className="h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center mb-2">
                            <CalendarIcon className="h-4 w-4 text-gray-400" />
                        </div>
                        <p className="text-sm text-gray-500 font-medium">Aucune dépense sur cette période</p>
                        <p className="text-xs text-gray-400 mt-1">Essayez d'élargir la recherche</p>
                    </div>
                ) : (
                    <div className="flex flex-col sm:flex-row items-center gap-6">
                        {/* Donut Chart */}
                        <div className="relative h-48 w-48 shrink-0">
                            <DonutChart data={data} />
                            {/* Center Text */}
                            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                                <span className="text-xs text-gray-500 font-medium">Total</span>
                                <span className="text-sm font-bold text-gray-900">
                                    {formatMoney(totalSpend)}
                                </span>
                            </div>
                        </div>

                        {/* Legend */}
                        <div className="flex-1 w-full space-y-3">
                            {data.slice(0, 5).map((cat) => (
                                <div key={cat.category} className="flex items-center justify-between text-sm">
                                    <div className="flex items-center gap-2">
                                        <div
                                            className="h-3 w-3 rounded-full shrink-0"
                                            style={{ backgroundColor: CATEGORY_COLORS[cat.category] || CATEGORY_COLORS["Autre"] }}
                                        />
                                        <span className="text-gray-600 font-medium truncate max-w-[120px]">{cat.category}</span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <span className="font-bold text-gray-900">{formatMoney(cat.amount)}</span>
                                        <span className="text-xs text-gray-400 w-8 text-right">{cat.percentage}%</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </Card>

            <Dialog open={isCustomDateDialogOpen} onOpenChange={setIsCustomDateDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Sélectionner une période</DialogTitle>
                        <DialogDescription>
                            Choisissez les dates de début et de fin pour l'analyse des dépenses.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                                    Date de début
                                </label>
                                <input
                                    type="date"
                                    value={customStart}
                                    onChange={(e) => setCustomStart(e.target.value)}
                                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                                    Date de fin
                                </label>
                                <input
                                    type="date"
                                    value={customEnd}
                                    onChange={(e) => setCustomEnd(e.target.value)}
                                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                                />
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button onClick={() => setIsCustomDateDialogOpen(false)}>
                            Valider
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </section>
    )
}
