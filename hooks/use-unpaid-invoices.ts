"use client"

import { useMemo } from "react"
import { usePayments } from "@/components/providers/payments-provider"

export type UnpaidInvoiceCount = {
    supplier_id: string
    count: number
    total: number
}

export function useUnpaidInvoices(companyId?: string) {
    const { invoices, isLoading } = usePayments()

    const unpaidCounts = useMemo(() => {
        if (!companyId || invoices.length === 0) return {}

        const today = new Date().toISOString().split('T')[0]
        const counts: Record<string, UnpaidInvoiceCount> = {}

        invoices
            .filter(inv => ['OPEN', 'LATE', 'PENDING'].includes(inv.status) && inv.due_date && inv.due_date <= today)
            .forEach((inv) => {
                if (!inv.supplier?.id) return
                const sid = inv.supplier.id
                if (!counts[sid]) counts[sid] = { supplier_id: sid, count: 0, total: 0 }
                counts[sid].count++
                counts[sid].total += inv.amount_ttc || 0
            })

        return counts
    }, [invoices, companyId])

    return { unpaidCounts, isLoading }
}
