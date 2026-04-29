import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient({
    datasourceUrl: "postgresql://dashboard_user:DH5-q8-Zp-K9t-2026@localhost:5432/dashboard_media"
})

async function main() {
    console.log('--- Force Link Invoice 2510 802 ---')
    
    const invoiceId = '1395770a-54ae-4965-bff0-9e9897c8f2b3'
    
    // 1. Find transaction
    const tx = await prisma.bank_transactions.findFirst({
        where: {
            label: { contains: '2510 802' },
            amount: -898.80
        }
    })

    if (!tx) {
        console.error('Transaction -898.80 (2510 802) introuvable.')
        return
    }

    console.log(`Transaction trouvée : ${tx.id} (${tx.label})`)

    // 2. Perform link
    await prisma.bank_transactions.update({
        where: { id: tx.id },
        data: {
            invoice_id: invoiceId,
            supplier_id: tx.supplier_id || '997096e2-e1c5-430c-87d2-7c7069176378' // Map to VT Consult if empty
        }
    })

    // 3. Mark invoice as PAID
    await prisma.invoices.update({
        where: { id: invoiceId },
        data: {
            status: 'PAID',
            payment_date: tx.date
        }
    })

    console.log('✅ FACTURE RÉCONCILIÉE AVEC SUCCÈS !')
}

main()
    .catch(e => console.error(e))
    .finally(() => prisma.$disconnect())
