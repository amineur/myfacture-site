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

// Module-level cache
const txCache: { data: Transaction[] | null; balance: number; accountId: string | null; timestamp: number } = {
    data: null, balance: 0, accountId: null, timestamp: 0,
}
const TX_CACHE_TTL = 30_000 // 30 seconds

export function useTransactions(accountId: string | 'all') {
    const cached = txCache.accountId === accountId && txCache.data
    const [transactions, setTransactions] = useState<Transaction[]>(cached ? txCache.data! : [])
    const [isLoading, setIsLoading] = useState(!cached)
    const [balance, setBalance] = useState(cached ? txCache.balance : 0)

    const fetchTransactions = useCallback(async (force = false) => {
        // Return cached data if fresh
        const isCacheFresh = txCache.accountId === accountId && (Date.now() - txCache.timestamp) < TX_CACHE_TTL
        if (!force && isCacheFresh && txCache.data) {
            setTransactions(txCache.data)
            setBalance(txCache.balance)
            setIsLoading(false)
            return
        }

        setIsLoading(true)
        try {
            const params = new URLSearchParams()
            if (accountId && accountId !== 'all') params.set('accountId', accountId)

            const [txRes, accountsRes] = await Promise.all([
                fetch(`/api/transactions?${params}`),
                fetch(`/api/bank-accounts${accountId && accountId !== 'all' ? `?accountId=${accountId}` : ''}`),
            ])

            let txs: Transaction[] = []
            let bal = 0

            if (txRes.ok) {
                txs = await txRes.json()
                setTransactions(txs)
            }

            if (accountsRes.ok) {
                const accounts = await accountsRes.json()
                if (accountId && accountId !== 'all') {
                    const account = accounts.find((a: any) => a.id === accountId)
                    bal = Number(account?.balance || 0)
                } else {
                    bal = accounts.reduce((sum: number, acc: any) => sum + Number(acc.balance || 0), 0)
                }
                setBalance(bal)
            }

            // Update cache
            txCache.data = txs
            txCache.balance = bal
            txCache.accountId = accountId
            txCache.timestamp = Date.now()
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
