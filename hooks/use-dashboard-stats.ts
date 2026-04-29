"use client"

import { useEffect, useState } from "react"

export type DashboardStats = {
    cashBalance: number
    unpaidInvoicesCount: number
    unpaidInvoicesAmount: number
    nextDebt: { name: string, date: string, amount: number } | null
    monthlySpend: number
    totalDue: number
    averagePaymentDelay: number
    isLoading: boolean
}

export function useDashboardStats(companyId?: string) {
    const [stats, setStats] = useState<DashboardStats>({
        cashBalance: 0,
        unpaidInvoicesCount: 0,
        unpaidInvoicesAmount: 0,
        nextDebt: null,
        monthlySpend: 0,
        totalDue: 0,
        averagePaymentDelay: 0,
        isLoading: true
    })

    useEffect(() => {
        if (!companyId) {
            setStats(s => ({ ...s, isLoading: false }))
            return
        }

        async function fetchStats() {
            try {
                const res = await fetch(`/api/dashboard-stats?companyId=${companyId}`)
                if (!res.ok) throw new Error('Failed to fetch stats')
                const data = await res.json()
                setStats({ ...data, isLoading: false })
            } catch (error) {
                console.error('[useDashboardStats] Error:', error)
                setStats(s => ({ ...s, isLoading: false }))
            }
        }

        fetchStats()
    }, [companyId])

    return stats
}
