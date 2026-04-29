import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/utils/auth'
import { reconcileTransaction, autoReconcile } from '@/lib/reconciliation'

export async function POST(req: NextRequest) {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    try {
        const { transactionId, invoiceId, companyId, autoScan } = await req.json()

        if (autoScan && companyId) {
            const result = await autoReconcile(companyId)
            return NextResponse.json({ success: true, ...result })
        }

        if (!transactionId || !invoiceId) {
            return NextResponse.json({ error: 'Missing transactionId or invoiceId' }, { status: 400 })
        }

        const result = await reconcileTransaction(transactionId, invoiceId)
        return NextResponse.json(result)

    } catch (error: any) {
        console.error('Error in reconciliation:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
