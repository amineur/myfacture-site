"use client"

import { useEffect, useState, useCallback } from "react"

export type TransactionSide = 'DEBIT' | 'CREDIT'
export type TransactionStatus = 'RAW' | 'MATCHED' | 'IGNORED'

export type Transaction = {
    id: string
    external_id: string
    account_id: string
    date: string
    amount: number
    label: string
    side: TransactionSide
    status: TransactionStatus
    raw_data?: any
}

export function useTransactions(accountId: string | 'all') {
    const [transactions, setTransactions] = useState<Transaction[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [balance, setBalance] = useState(0)

    const fetchTransactions = useCallback(async () => {
        setIsLoading(true)
        try {
            const params = new URLSearchParams()
            if (accountId && accountId !== 'all') params.set('accountId', accountId)

            const [txRes, accountsRes] = await Promise.all([
                fetch(`/api/transactions?${params}`),
                fetch(`/api/bank-accounts${accountId && accountId !== 'all' ? `?accountId=${accountId}` : ''}`),
            ])

            if (txRes.ok) {
                const txs = await txRes.json()
                setTransactions(txs)
            }

            if (accountsRes.ok) {
                const accounts = await accountsRes.json()
                if (accountId && accountId !== 'all') {
                    const account = accounts.find((a: any) => a.id === accountId)
                    setBalance(Number(account?.balance || 0))
                } else {
                    const total = accounts.reduce((sum: number, acc: any) => sum + Number(acc.balance || 0), 0)
                    setBalance(total)
                }
            }
        } catch (error) {
            console.error("Error fetching transactions:", error)
        } finally {
            setIsLoading(false)
        }
    }, [accountId])

    useEffect(() => {
        fetchTransactions()
    }, [fetchTransactions])

    return { transactions, balance, isLoading, refresh: fetchTransactions }
}
