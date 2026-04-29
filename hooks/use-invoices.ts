"use client"

import { useEffect, useState } from "react"
import { usePayments } from "@/components/providers/payments-provider"

export type Invoice = {
    id: string
    company_id: string
    supplier: { id: string; name: string; logo_url?: string | null; iban?: string; bic?: string } | null
    reference: string | null
    amount_ttc: number
    status: 'PENDING' | 'OPEN' | 'PAID' | 'LATE'
    issued_date: string
    due_date: string | null
    payment_date: string | null
    logo?: string // derived
    month?: string // derived
}

export function useInvoices(companyId?: string) {
    const { invoices, isLoading, error, fetchInvoices, payInvoices, refresh } = usePayments()

    useEffect(() => {
        if (companyId) {
            fetchInvoices(companyId)
        }
    }, [companyId, fetchInvoices])

    return {
        invoices,
        isLoading,
        error,
        payInvoices,
        refresh: refresh
    }
}

export function useInvoice(id: string) {
    const [invoice, setInvoice] = useState<Invoice | null>(null)
    const [isLoading, setIsLoading] = useState(true)

    useEffect(() => {
        if (!id) return
        fetchInvoice()
    }, [id])

    async function fetchInvoice() {
        setIsLoading(true)
        try {
            const res = await fetch(`/api/invoices/${id}`)
            if (!res.ok) throw new Error('Invoice not found')
            const data = await res.json()
            setInvoice(data)
        } catch (error) {
            console.error("Error fetching invoice:", error)
        }
        setIsLoading(false)
    }

    return { invoice, isLoading }
}
