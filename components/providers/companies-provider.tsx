"use client"

import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from "react"
import { useSession } from "next-auth/react"

export type Company = {
    id: string
    name: string
    handle: string
    address: string | null
    owner_id?: string
    created_at?: string
}

type CompaniesContextType = {
    companies: Company[]
    addCompany: (company: Omit<Company, "id">) => Promise<void>
    updateCompany: (id: string, updated: Partial<Company>) => Promise<void>
    deleteCompany: (id: string) => Promise<void>
    isLoading: boolean
}

const CompaniesContext = createContext<CompaniesContextType | undefined>(undefined)

export function CompaniesProvider({ children }: { children: React.ReactNode }) {
    const [companies, setCompanies] = useState<Company[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const { data: session, status } = useSession()

    const fetchCompanies = useCallback(async () => {
        if (status === 'loading') return
        if (status === 'unauthenticated') {
            setCompanies([])
            setIsLoading(false)
            return
        }
        try {
            setIsLoading(true)
            const res = await fetch('/api/companies')
            if (res.ok) {
                const data = await res.json()
                setCompanies(data || [])
            }
        } catch (err) {
            console.error('[fetchCompanies] error:', err)
        } finally {
            setIsLoading(false)
        }
    }, [status])

    useEffect(() => {
        fetchCompanies()
    }, [fetchCompanies])

    const addCompany = useCallback(async (newCompany: Omit<Company, "id">) => {
        const res = await fetch('/api/companies', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newCompany),
        })
        if (!res.ok) throw new Error(await res.text())
        await fetchCompanies()
    }, [fetchCompanies])

    const updateCompany = useCallback(async (id: string, updated: Partial<Company>) => {
        const res = await fetch(`/api/companies/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updated),
        })
        if (!res.ok) throw new Error(await res.text())
        await fetchCompanies()
    }, [fetchCompanies])

    const deleteCompany = useCallback(async (id: string) => {
        const res = await fetch(`/api/companies/${id}`, { method: 'DELETE' })
        if (!res.ok) throw new Error(await res.text())
        await fetchCompanies()
    }, [fetchCompanies])

    const value = React.useMemo(() => ({
        companies, addCompany, updateCompany, deleteCompany, isLoading
    }), [companies, addCompany, updateCompany, deleteCompany, isLoading])

    return (
        <CompaniesContext.Provider value={value}>
            {children}
        </CompaniesContext.Provider>
    )
}

export function useCompanies() {
    const context = useContext(CompaniesContext)
    if (context === undefined) {
        throw new Error("useCompanies must be used within a CompaniesProvider")
    }
    return context
}
