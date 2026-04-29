"use client";

import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, History, TrendingDown, TrendingUp, Calendar, Percent } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCompanies } from "@/components/providers/companies-provider";
import { useInvoices } from "@/hooks/use-invoices";
import { useDebts } from "@/hooks/use-debts";
import { format, parseISO, subMonths, isSameMonth, isAfter, startOfMonth, endOfMonth, isBefore } from "date-fns";
import { fr } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ComposedChart, Bar, Line, Legend } from 'recharts';

export default function SituationsPage() {
    const router = useRouter();
    const { companies } = useCompanies();
    const activeCompany = companies[0];
    const { invoices, isLoading: isLoadingInvoices } = useInvoices(activeCompany?.id);
    const { debts, isLoading: isLoadingDebts } = useDebts(activeCompany?.id);
    const activeDebts = debts.filter(d => d.status === 'ACTIVE');
    const chartContainerRef = useRef<HTMLDivElement>(null);
    const [chartDims, setChartDims] = useState<{ w: number; h: number } | null>(null);

    useEffect(() => {
        const measure = () => {
            if (chartContainerRef.current) {
                const { width, height } = chartContainerRef.current.getBoundingClientRect();
                if (width > 0 && height > 0) setChartDims({ w: width, h: height });
            }
        };
        // Measure after layout settles
        const raf = requestAnimationFrame(measure);
        window.addEventListener('resize', measure);
        return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', measure); };
    }, []);

    // Generate last 12 months (Reversed for Graph: Oldest first)
    const today = new Date();
    const months = Array.from({ length: 12 }, (_, i) => {
        return subMonths(today, i);
    });
    // We want the graph to show chronological order
    const chronologicalMonths = [...months].reverse();

    // State for storing fetched snapshots
    const [snapshots, setSnapshots] = useState<Record<string, number>>({});
    const [snapshotErrors, setSnapshotErrors] = useState(0);

    useEffect(() => {
        if (!activeCompany?.id) return;

        const fetchSnapshots = async () => {
            const promises = chronologicalMonths.map(async (monthDate) => {
                const monthKey = format(monthDate, 'MMMM yyyy', { locale: fr });
                try {
                    const res = await fetch(`/api/snapshots/create?company_id=${activeCompany.id}&month_key=${encodeURIComponent(monthKey)}`, {
                        method: 'GET' // Ensure we only GET, though the endpoint supports POST for creation, we want to just read if exists? 
                        // Actually the route layout shows POST for create/upsert and GET for retrieval.
                    });
                    if (res.ok) {
                        const data = await res.json();
                        if (data.snapshot) {
                            return { monthKey, balance: data.snapshot.total_debt_balance };
                        }
                    }
                } catch (err) {
                    console.error('Failed to fetch snapshot for', monthKey, err);
                }
                return null;
            });

            const results = await Promise.all(promises);
            const newSnapshots: Record<string, number> = {};
            let errorCount = 0;
            results.forEach(r => {
                if (r) {
                    newSnapshots[r.monthKey] = r.balance;
                } else {
                    errorCount++;
                }
            });
            setSnapshots(newSnapshots);
            setSnapshotErrors(errorCount);
        };

        fetchSnapshots();
    }, [activeCompany?.id]); // Only re-run if company changes

    const processMonthData = (monthDate: Date) => {
        const monthKey = format(monthDate, 'MMMM yyyy', { locale: fr }); // e.g. "janvier 2026"

        // --- 1. Identify Invoices ---
        // A. Invoices DUE this month (Charges pattern)
        const invoicesDueThisMonth = invoices.filter(inv => {
            if (!inv.due_date) return false;
            const dDate = parseISO(inv.due_date);
            return format(dDate, 'MMMM yyyy', { locale: fr }) === monthKey;
        });

        // B. Invoices PAID this month (Flow pattern)
        const invoicesPaidThisMonth = invoices.filter(inv => {
            if (!inv.payment_date) return false;
            const pDate = parseISO(inv.payment_date);
            return format(pDate, 'MMMM yyyy', { locale: fr }) === monthKey;
        });

        // --- 2. Calculate Metrics (Mirroring Monthly Page) ---

        // "Charges Courantes Payées" = Due This Month AND Paid
        // Note: Monthly page checks status === 'PAID'. Aligning strictly.
        const paidCharges = invoicesDueThisMonth
            .filter(inv => inv.status === 'PAID')
            .reduce((sum, inv) => sum + (inv.amount_ttc || 0), 0);

        const unpaidCharges = invoicesDueThisMonth
            .filter(inv => ['PENDING', 'OPEN', 'LATE'].includes(inv.status))
            .reduce((sum, inv) => sum + (inv.amount_ttc || 0), 0);

        // "Remboursement Dette Courante" = Paid This Month BUT Due Another Month (or no due date)
        const currentDebtPaid = invoicesPaidThisMonth.reduce((sum, inv) => {
            if (!inv.due_date) return sum + (inv.amount_ttc || 0); // No due date = Debt Repayment
            const dDate = parseISO(inv.due_date);
            if (format(dDate, 'MMMM yyyy', { locale: fr }) === monthKey) return sum; // Due this month = Charge
            return sum + (inv.amount_ttc || 0);
        }, 0);

        // "Remboursement Dette Structurelle" (Schedule)
        const structuralMonthlySum = activeDebts
            .filter(d => (d.monthly_amount || 0) > 0)
            .reduce((sum, d) => sum + (d.monthly_amount || 0), 0);

        // Total Amortized (Displayed in Table as "Remb.")
        const totalAmortized = structuralMonthlySum + currentDebtPaid;

        // Total Paid (Displayed in Table as "Réglé") = Charges + Amortized
        const totalPaid = paidCharges + totalAmortized;

        // For Chart: Charges = Total Paid - Amortized (which equals paidCharges)
        const charges = paidCharges;

        // --- 3. Outstanding Debt (Snapshot OR Retrograde Logic) ---
        let outstandingDebt = 0;

        // Check if we have a stored snapshot for this month
        if (snapshots[monthKey] !== undefined) {
            outstandingDebt = snapshots[monthKey];
        } else {
            // Fallback to calculation if no snapshot exists
            const processedSuppliers = new Set<string>();
            const currentTotalDebt = activeDebts
                .filter(d => d.status === 'ACTIVE')
                .reduce((acc, d) => {
                    const scheduleRemaining = d.remaining_amount || 0;
                    let currentRemaining = 0;
                    // @ts-ignore
                    const supplierId = d.supplier?.id;
                    if (supplierId && !processedSuppliers.has(supplierId)) {
                        processedSuppliers.add(supplierId);
                        const isStructured = (d.monthly_amount || 0) > 0;
                        const fixedDebt = !isStructured ? (d.remaining_amount || 0) : 0;
                        // @ts-ignore
                        currentRemaining = ((d.current_debt?.total_amount || 0) - (d.current_debt?.paid_amount || 0)) + fixedDebt;
                    }
                    return acc + scheduleRemaining + currentRemaining;
                }, 0);

            // Add back payments made AFTER this month
            const monthEnd = endOfMonth(monthDate);
            const paymentsAfter = invoices.filter(inv => {
                if (!inv.payment_date) return false;
                const pDate = parseISO(inv.payment_date);
                return isAfter(pDate, monthEnd);
            }).reduce((sum, inv) => sum + (inv.amount_ttc || 0), 0);

            // Add back structural payments made AFTER this month
            const monthsDiff = Math.max(0,
                (today.getFullYear() - monthDate.getFullYear()) * 12 +
                (today.getMonth() - monthDate.getMonth())
            );
            const structuralPaymentsAfter = structuralMonthlySum * monthsDiff;

            outstandingDebt = currentTotalDebt + paymentsAfter + structuralPaymentsAfter;
        }

        // Metrics
        const amortizationShare = totalPaid > 0 ? (totalAmortized / totalPaid) * 100 : 0;
        const previousOutstanding = outstandingDebt + totalAmortized;
        const impactShare = previousOutstanding > 0 ? (totalAmortized / previousOutstanding) * 100 : 0;

        // Payment Progress (Charges)
        const totalDueCharges = paidCharges + unpaidCharges;
        const paymentProgress = totalDueCharges > 0 ? (paidCharges / totalDueCharges) * 100 : 0;

        return {
            date: monthDate,
            name: format(monthDate, 'MMM', { locale: fr }),
            fullDate: monthKey, // Use formatted key
            totalPaid,
            charges,
            outstandingDebt,
            totalAmortized,
            amortizationShare,
            impactShare,
            paymentProgress // Return the new metric
        };
    };

    const graphData = chronologicalMonths.map(processMonthData);
    const tableData = [...graphData].reverse(); // Newest first for table

    const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>(null);

    const handleSort = (key: string) => {
        setSortConfig(current => {
            if (current?.key === key) {
                if (current.direction === 'desc') return { key, direction: 'asc' };
                return null;
            }
            return { key, direction: 'desc' };
        });
    };

    const sortedData = useMemo(() => {
        const data = [...tableData];
        if (!sortConfig) return data;

        return data.sort((a, b) => {
            let aValue = (a as any)[sortConfig.key];
            let bValue = (b as any)[sortConfig.key];

            if (sortConfig.key === 'totalSpent') {
                aValue = a.charges + a.totalAmortized;
                bValue = b.charges + b.totalAmortized;
            }

            if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
            if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
    }, [tableData, sortConfig]);

    // Calculate Average Impact Share for the displayed period
    const totalImpact = tableData.reduce((sum, item) => sum + item.impactShare, 0);
    const averageImpactShare = tableData.length > 0 ? totalImpact / tableData.length : 0;

    const [visibleSeries, setVisibleSeries] = useState({
        charges: true,
        amortization: true,
        debt: true
    });

    const toggleSeries = (key: keyof typeof visibleSeries) => {
        setVisibleSeries(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const [showAverage, setShowAverage] = useState(false);

    return (
        <main className="min-h-screen bg-gray-50 flex flex-col pb-safe animate-in slide-in-from-right duration-500">
            {/* Header */}
            <header className="px-6 pt-6 pb-2 bg-white sticky top-0 z-10 border-b border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={() => router.back()} className="-ml-3 h-10 w-10 rounded-full hover:bg-gray-50 text-gray-900">
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                    <h1 className="text-xl font-bold text-gray-900">Suivi des situations</h1>
                </div>
            </header>

            <div className="flex-1 px-4 pt-6 pb-24 space-y-6">
                {snapshotErrors > 0 && (
                    <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs font-medium px-4 py-2.5 rounded-xl">
                        ⚠️ {snapshotErrors} mois n&apos;ont pas pu être chargés. Les données affichées peuvent être incomplètes.
                    </div>
                )}

                {/* 1. CHART SECTION */}
                <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
                    <div className="mb-6 flex flex-wrap items-center gap-3">
                        {/* Interactive Toggles */}
                        <button
                            onClick={() => toggleSeries('charges')}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${visibleSeries.charges
                                ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                                : 'bg-gray-50 text-gray-400 hover:bg-gray-100'
                                }`}
                        >
                            <div className={`w-2 h-2 rounded-full ${visibleSeries.charges ? 'bg-emerald-400' : 'bg-gray-300'}`} />
                            Charge payé
                        </button>

                        <button
                            onClick={() => toggleSeries('amortization')}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${visibleSeries.amortization
                                ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-200'
                                : 'bg-gray-50 text-gray-400 hover:bg-gray-100'
                                }`}
                        >
                            <div className={`w-2 h-2 rounded-full ${visibleSeries.amortization ? 'bg-blue-500' : 'bg-gray-300'}`} />
                            Remb.
                        </button>

                        <button
                            onClick={() => toggleSeries('debt')}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${visibleSeries.debt
                                ? 'bg-orange-50 text-orange-700 ring-1 ring-orange-200'
                                : 'bg-gray-50 text-gray-400 hover:bg-gray-100'
                                }`}
                        >
                            <div className={`w-2 h-2 rounded-full ${visibleSeries.debt ? 'bg-orange-500' : 'bg-gray-300'}`} />
                            Dette
                        </button>
                    </div>

                    <div ref={chartContainerRef} className="h-[250px] w-full isolate [&_.recharts-wrapper]:!outline-none [&_.recharts-surface]:!outline-none [&_path]:!outline-none [&_*:focus]:!outline-none focus:!outline-none active:!outline-none" style={{ outline: 'none' }}>
                        {chartDims && <ComposedChart width={chartDims.w} height={chartDims.h} data={graphData} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                <XAxis
                                    dataKey="name"
                                    tick={{ fontSize: 10, fill: '#94a3b8' }}
                                    axisLine={false}
                                    tickLine={false}
                                />
                                {/* Left Axis: Monthly Flows (0 - 10k+) */}
                                <YAxis
                                    yAxisId="left"
                                    tick={{ fontSize: 10, fill: '#94a3b8' }}
                                    axisLine={false}
                                    tickLine={false}
                                    tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
                                />
                                {/* Right Axis: Total Debt Balance (0 - 50k+) */}
                                <YAxis
                                    yAxisId="right"
                                    orientation="right"
                                    tick={{ fontSize: 10, fill: '#fb923c' }}
                                    axisLine={false}
                                    tickLine={false}
                                    tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
                                    domain={['auto', 'auto']}
                                    hide={!visibleSeries.debt}
                                />
                                <Tooltip
                                    shared={false}
                                    cursor={{ fill: 'transparent' }}
                                    content={({ active, payload, label }) => {
                                        if (active && payload && payload.length) {
                                            return (
                                                <div className="bg-white p-3 rounded-xl shadow-lg border border-gray-100 ring-1 ring-gray-950/5">
                                                    <p className="mb-2 text-[10px] font-bold text-gray-400 uppercase tracking-wider">{label}</p>
                                                    {payload.map((entry: any, index: number) => {
                                                        let displayName = entry.name;
                                                        if (entry.dataKey === 'charges') displayName = 'Charge payé';
                                                        if (entry.dataKey === 'totalAmortized') displayName = 'Remb.';
                                                        if (entry.dataKey === 'outstandingDebt') displayName = 'Dette';

                                                        return (
                                                            <div key={index} className="flex flex-col gap-0.5">
                                                                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">{displayName}</span>
                                                                <span className="text-lg font-black" style={{ color: entry.color }}>
                                                                    {typeof entry.value === 'number' ? entry.value.toLocaleString('fr-FR', { maximumFractionDigits: 0 }) : entry.value} €
                                                                </span>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            );
                                        }
                                        return null;
                                    }}
                                />
                                {/* Stacked Bars for Monthly Flow */}
                                <Bar yAxisId="left" dataKey="charges" stackId="a" fill="#34d399" radius={[0, 0, 4, 4]} barSize={20} hide={!visibleSeries.charges} />
                                <Bar yAxisId="left" dataKey="totalAmortized" stackId="a" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={20} hide={!visibleSeries.amortization} />

                                {/* Line for Global Debt Trend */}
                                <Line
                                    yAxisId="right"
                                    type="monotone"
                                    dataKey="outstandingDebt"
                                    stroke="#f97316"
                                    strokeWidth={4}
                                    dot={{ r: 4, fill: '#f97316', strokeWidth: 0 }}
                                    activeDot={{ r: 8, strokeWidth: 2, stroke: 'white' }}
                                    hide={!visibleSeries.debt}
                                />
                        </ComposedChart>}
                    </div>
                </div>

                {/* 2. DETAILED TABLE SECTION */}
                <div className="space-y-4">
                    <div className="flex items-center justify-between px-2">
                        <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider">Détail Mensuel</h3>
                        <button
                            onClick={() => setShowAverage(!showAverage)}
                            className={cn(
                                "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold transition-all",
                                showAverage
                                    ? "bg-blue-50 text-blue-700 ring-1 ring-blue-200"
                                    : "bg-gray-50 text-gray-400 hover:bg-gray-100"
                            )}
                        >
                            <TrendingUp className="h-3.5 w-3.5" />
                            Moyenne 3M
                        </button>
                    </div>

                    {/* Average Card */}
                    {showAverage && (() => {
                        const previous3Months = tableData.slice(1, 4);
                        if (previous3Months.length === 0) return null;

                        const avg = previous3Months.reduce((acc, curr) => ({
                            totalAmortized: acc.totalAmortized + curr.totalAmortized,
                            charges: acc.charges + curr.charges,
                            totalPaid: acc.totalPaid + curr.totalPaid,
                            impactShare: acc.impactShare + curr.impactShare,
                            paymentProgress: acc.paymentProgress + curr.paymentProgress
                        }), { totalAmortized: 0, charges: 0, totalPaid: 0, impactShare: 0, paymentProgress: 0 });

                        const count = previous3Months.length;
                        const averages = {
                            totalAmortized: avg.totalAmortized / count,
                            charges: avg.charges / count,
                            totalPaid: avg.totalPaid / count,
                            impactShare: avg.impactShare / count,
                            paymentProgress: avg.paymentProgress / count
                        };

                        return (
                            <div className="bg-gradient-to-r from-blue-50/80 to-indigo-50/80 p-4 rounded-2xl border-2 border-blue-100/50 shadow-sm animate-in slide-in-from-top-2 duration-200">
                                <div className="flex items-center justify-between mb-3">
                                    <div>
                                        <h4 className="text-sm font-black text-blue-900 uppercase tracking-tight">Moyenne</h4>
                                        <p className="text-[10px] font-bold text-blue-400 uppercase tracking-wider">(3 mois préc.)</p>
                                    </div>
                                </div>
                                <div className="grid grid-cols-3 gap-3">
                                    <div className="bg-white/60 p-3 rounded-xl">
                                        <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1">Remb.</p>
                                        <p className="text-lg font-black text-blue-900">{averages.totalAmortized.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} €</p>
                                        <div className="flex items-center gap-1 bg-blue-100 px-1.5 py-0.5 rounded-full mt-1 w-fit">
                                            <Percent className="h-3 w-3 text-blue-600" />
                                            <span className="text-[9px] font-bold text-blue-700">{averages.impactShare.toFixed(1)}%</span>
                                        </div>
                                    </div>
                                    <div className="bg-white/60 p-3 rounded-xl">
                                        <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1">Charge payé</p>
                                        <p className="text-lg font-black text-blue-900">{averages.charges.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} €</p>
                                        <div className="flex items-center gap-1 mt-1">
                                            <div className="h-1.5 w-12 bg-gray-200 rounded-full overflow-hidden">
                                                <div className="h-full bg-blue-500 rounded-full" style={{ width: `${Math.min(100, averages.paymentProgress)}%` }}></div>
                                            </div>
                                            <p className="text-[9px] text-blue-600 font-medium">{averages.paymentProgress.toFixed(0)}%</p>
                                        </div>
                                    </div>
                                    <div className="bg-white/60 p-3 rounded-xl">
                                        <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1">Dépensé</p>
                                        <p className="text-lg font-black text-blue-900">{averages.totalPaid.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} €</p>
                                    </div>
                                </div>
                            </div>
                        );
                    })()}
                    <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden overflow-x-auto">
                        <table className="w-full text-left border-collapse min-w-[350px]">
                            <thead>
                                <tr className="border-b border-gray-100 bg-gray-50/50">
                                    <th className="px-2 py-3 sm:px-3 sm:py-4 text-[10px] font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap cursor-pointer hover:text-gray-600 transition-colors" onClick={() => setSortConfig(null)}>Mois</th>
                                    <th className="px-2 py-3 sm:px-3 sm:py-4 text-[10px] font-bold text-gray-400 uppercase tracking-wider text-right whitespace-nowrap cursor-pointer hover:text-gray-600 transition-colors" onClick={() => handleSort('outstandingDebt')}>Dette {sortConfig?.key === 'outstandingDebt' && (sortConfig.direction === 'asc' ? '↑' : '↓')}</th>
                                    <th className="px-2 py-3 sm:px-3 sm:py-4 text-[10px] font-bold text-gray-400 uppercase tracking-wider text-right whitespace-nowrap cursor-pointer hover:text-gray-600 transition-colors" onClick={() => handleSort('totalAmortized')}>Remb. {sortConfig?.key === 'totalAmortized' && (sortConfig.direction === 'asc' ? '↑' : '↓')}</th>
                                    <th className="px-2 py-3 sm:px-3 sm:py-4 text-[10px] font-bold text-gray-400 uppercase tracking-wider text-right whitespace-nowrap cursor-pointer hover:text-gray-600 transition-colors" onClick={() => handleSort('charges')}>Charge payé {sortConfig?.key === 'charges' && (sortConfig.direction === 'asc' ? '↑' : '↓')}</th>
                                    <th className="px-2 py-3 sm:px-3 sm:py-4 text-[10px] font-bold text-gray-400 uppercase tracking-wider text-right whitespace-nowrap cursor-pointer hover:text-gray-600 transition-colors" onClick={() => handleSort('totalSpent')}>Dépensé {sortConfig?.key === 'totalSpent' && (sortConfig.direction === 'asc' ? '↑' : '↓')}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {sortedData.map((row) => {
                                    const isCurrent = isSameMonth(row.date, new Date());
                                    const isAboveAverage = row.impactShare >= averageImpactShare;
                                    const TrendIcon = isAboveAverage ? TrendingUp : TrendingDown;
                                    const trendColor = isAboveAverage ? "text-emerald-600" : "text-red-500";
                                    const trendBg = isAboveAverage ? "bg-emerald-50" : "bg-red-50";
                                    const trendIconColor = isAboveAverage ? "text-emerald-600" : "text-red-500";

                                    return (
                                        <React.Fragment key={row.fullDate}>
                                            <tr
                                                onClick={() => router.push(`/payments/month/${encodeURIComponent(row.fullDate)}`)}
                                                onMouseEnter={() => router.prefetch(`/payments/month/${encodeURIComponent(row.fullDate)}`)}
                                                className="group hover:bg-blue-50/30 transition-colors cursor-pointer"
                                            >
                                                <td className="px-2 py-3 sm:px-3 sm:py-4 align-top whitespace-nowrap">
                                                    <div className="flex items-center gap-1.5">
                                                        <p className="text-xs sm:text-sm font-bold text-gray-900 capitalize">{row.name}</p>
                                                        {isCurrent && (
                                                            <div className="relative flex h-2 w-2">
                                                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                                                                <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                                                            </div>
                                                        )}
                                                    </div>
                                                    <p className="text-[10px] text-gray-400">{format(row.date, 'yyyy')}</p>
                                                </td>

                                                <td className="px-2 py-3 sm:px-3 sm:py-4 text-right align-top whitespace-nowrap">
                                                    <p className="text-xs sm:text-sm font-medium text-gray-900">{row.outstandingDebt.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} €</p>
                                                </td>

                                                <td className="px-2 py-3 sm:px-3 sm:py-4 text-right align-top whitespace-nowrap">
                                                    <div className="flex flex-col items-end gap-1">
                                                        <span className="text-xs sm:text-sm font-medium text-gray-900">{row.totalAmortized.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} €</span>
                                                        <div className={`flex items-center gap-1 ${trendBg} px-1.5 py-0.5 rounded-full`}>
                                                            <TrendIcon className={`h-3 w-3 ${trendIconColor}`} />
                                                            <span className={`text-[9px] font-bold ${trendColor}`}>{row.impactShare.toFixed(1)}%</span>
                                                        </div>
                                                    </div>
                                                </td>

                                                <td className="px-2 py-3 sm:px-3 sm:py-4 text-right align-top whitespace-nowrap">
                                                    <div className="flex flex-col items-end gap-1">
                                                        <p className="text-xs sm:text-sm font-medium text-gray-900">{row.charges.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} €</p>
                                                        <div className="flex items-center justify-end gap-1">
                                                            <div className="h-1.5 w-12 bg-gray-100 rounded-full overflow-hidden">
                                                                <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${Math.min(100, row.paymentProgress)}%` }}></div>
                                                            </div>
                                                            <p className="text-[9px] text-emerald-600 font-medium">{row.paymentProgress.toFixed(0)}%</p>
                                                        </div>
                                                    </div>
                                                </td>

                                                <td className="px-2 py-3 sm:px-3 sm:py-4 text-right align-top whitespace-nowrap">
                                                    <p className="text-xs sm:text-sm font-black text-gray-900">{row.totalPaid.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} €</p>
                                                </td>
                                            </tr>


                                        </React.Fragment>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </main>
    );
}
