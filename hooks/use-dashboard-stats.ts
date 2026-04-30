"use client"

import { useEffect, useState, useRef } from "react"

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

// In-memory cache: show cached data instantly, refetch in background
const statsCache: { data: DashboardStats | null; companyId: string | null; timestamp: number } = {
    data: null, companyId: null, timestamp: 0,
}
const CACHE_TTL = 30_000 // 30 seconds

export function useDashboardStats(companyId?: string) {
    // Initialize from cache if available for this company
    const cached = statsCache.companyId === companyId && statsCache.data
    const [stats, setStats] = useState<DashboardStats>(
        cached
            ? { ...statsCache.data!, isLoading: false }
            : {
                  cashBalance: 0, unpaidInvoicesCount: 0, unpaidInvoicesAmount: 0,
                  nextDebt: null, monthlySpend: 0, totalDue: 0, averagePaymentDelay: 0,
                  isLoading: true,
              }
    )
    const isFetchingRef = useRef(false)

    useEffect(() => {
        if (!companyId) {
            setStats(s => ({ ...s, isLoading: false }))
            return
        }

        // Skip if cache is fresh
        const isCacheFresh = statsCache.companyId === companyId && (Date.now() - statsCache.timestamp) < CACHE_TTL
        if (isCacheFresh && statsCache.data) {
            setStats({ ...statsCache.data, isLoading: false })
            return
        }

        if (isFetchingRef.current) return
        isFetchingRef.current = true

        async function fetchStats() {
            try {
                const res = await fetch(`/api/dashboard-stats?companyId=${companyId}`)
                if (!res.ok) throw new Error('Failed to fetch stats')
                const data = await res.json()
                statsCache.data = data
                statsCache.companyId = companyId!
                statsCache.timestamp = Date.now()
                setStats({ ...data, isLoading: false })
            } catch (error) {
                console.error('[useDashboardStats] Error:', error)
                setStats(s => ({ ...s, isLoading: false }))
            } finally {
                isFetchingRef.current = false
            }
        }

        fetchStats()
    }, [companyId])

    return stats
}
