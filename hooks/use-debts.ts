"use client"

import { useEffect } from "react"
import { useDebtsContext, Debt } from "@/components/providers/debts-provider"

// Re-export type for compatibility
export type { Debt }

export function useDebts(companyId?: string) {
    const { debts, isLoading, fetchDebts, refresh } = useDebtsContext()

    useEffect(() => {
        if (companyId) {
            fetchDebts(companyId)
        }
    }, [companyId, fetchDebts])

    return { debts, isLoading, refresh }
}
