import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/utils/auth'
import { prisma } from '@/utils/db'

export const dynamic = 'force-dynamic'

// GET: Show current state of bank accounts
// POST: Clean up duplicates, merge, and fix issues
export async function GET(req: NextRequest) {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const accounts = await prisma.bank_accounts.findMany({
        orderBy: { created_at: 'asc' },
    })

    const txSummary = await prisma.$queryRawUnsafe(`
        SELECT account_id, COUNT(*)::int as tx_count, MIN(date) as earliest, MAX(date) as latest
        FROM bank_transactions GROUP BY account_id
    `) as any[]

    return NextResponse.json({
        accounts: accounts.map(a => ({
            id: a.id,
            name: a.name,
            bank_type: a.bank_type,
            balance: Number(a.balance),
            metadata: a.metadata,
            last_sync_at: a.last_sync_at,
            created_at: a.created_at,
        })),
        transactions_summary: txSummary,
    })
}

async function mergeAccountsByGroup(nameFilter: (name: string) => boolean, targetName: string) {
    const actions: string[] = []

    const allAccounts = await prisma.bank_accounts.findMany({ orderBy: { created_at: 'asc' } })
    const matchingAccounts = allAccounts.filter(a => nameFilter(a.name || ''))

    if (matchingAccounts.length <= 1) return actions

    // Count transactions per account to find the best keeper
    const txCounts = await Promise.all(
        matchingAccounts.map(async (acc) => {
            const count = await prisma.bank_transactions.count({ where: { account_id: acc.id } })
            return { account: acc, count }
        })
    )
    txCounts.sort((a, b) => b.count - a.count || a.account.created_at.getTime() - b.account.created_at.getTime())

    const keeper = txCounts[0]
    const duplicates = txCounts.slice(1)

    for (const dup of duplicates) {
        const moved = await prisma.bank_transactions.updateMany({
            where: { account_id: dup.account.id },
            data: { account_id: keeper.account.id },
        })
        actions.push(`Moved ${moved.count} tx from "${dup.account.name}" → "${keeper.account.name}"`)

        await prisma.bank_accounts.delete({ where: { id: dup.account.id } })
        actions.push(`Deleted duplicate: "${dup.account.name}" (${dup.account.id})`)
    }

    // Rename keeper
    if (keeper.account.name !== targetName) {
        await prisma.bank_accounts.update({ where: { id: keeper.account.id }, data: { name: targetName } })
        actions.push(`Renamed "${keeper.account.name}" → "${targetName}"`)
    }

    return actions
}

export async function POST(req: NextRequest) {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const actions: string[] = []

    // 1. Merge Qonto duplicates
    const qontoActions = await mergeAccountsByGroup(
        (name) => name.toLowerCase().includes('qonto'),
        'Qonto'
    )
    actions.push(...qontoActions)

    // 2. Merge Crédit Mutuel duplicates
    const cmActions = await mergeAccountsByGroup(
        (name) => name.toLowerCase().includes('crédit mutuel') || name.toLowerCase().includes('credit mutuel'),
        'Crédit Mutuel'
    )
    actions.push(...cmActions)

    // 3. Merge Banque Populaire duplicates
    const bpActions = await mergeAccountsByGroup(
        (name) => name.toLowerCase().includes('banque populaire'),
        'Banque Populaire'
    )
    actions.push(...bpActions)

    // 4. Delete "Qonto secondaire" or any empty orphan accounts
    const allAccounts = await prisma.bank_accounts.findMany()
    for (const acc of allAccounts) {
        const name = (acc.name || '').toLowerCase()
        if (name.includes('secondaire')) {
            const txCount = await prisma.bank_transactions.count({ where: { account_id: acc.id } })
            if (txCount === 0) {
                await prisma.bank_accounts.delete({ where: { id: acc.id } })
                actions.push(`Deleted empty account: "${acc.name}"`)
            } else {
                // Move tx to main Qonto then delete
                const mainQonto = await prisma.bank_accounts.findFirst({ where: { name: 'Qonto' } })
                if (mainQonto) {
                    await prisma.bank_transactions.updateMany({
                        where: { account_id: acc.id },
                        data: { account_id: mainQonto.id },
                    })
                    await prisma.bank_accounts.delete({ where: { id: acc.id } })
                    actions.push(`Moved ${txCount} tx from "${acc.name}" → "Qonto" and deleted it`)
                }
            }
        }
    }

    if (actions.length === 0) actions.push('Nothing to clean up - all good!')

    // Final state
    const finalAccounts = await prisma.bank_accounts.findMany({ orderBy: { created_at: 'asc' } })
    const finalTx = await prisma.$queryRawUnsafe(`
        SELECT account_id, COUNT(*)::int as tx_count, MIN(date) as earliest, MAX(date) as latest
        FROM bank_transactions GROUP BY account_id
    `) as any[]

    return NextResponse.json({
        actions,
        final_state: {
            accounts: finalAccounts.map(a => ({ id: a.id, name: a.name, bank_type: a.bank_type, balance: Number(a.balance) })),
            transactions_summary: finalTx,
        }
    })
}
