import { PrismaClient } from '@prisma/client'
import { Pool } from 'pg'
import { PrismaPg } from '@prisma/adapter-pg'

const connectionString = process.env.DATABASE_URL || "postgresql://dashboard_user:DH5-q8-Zp-K9t-2026@core-postgres:5432/dashboard_media"
const pool = new Pool({ connectionString })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

async function main() {
    console.log('--- Mise à jour des dates déchéance WinMedia 2026 ---')

    const supplier = await prisma.suppliers.findFirst({
        where: { name: { contains: 'WinMedia', mode: 'insensitive' } }
    })

    if (!supplier) {
        throw new Error("Fournisseur WinMedia non trouvé.")
    }

    for (let month = 1; month <= 12; month++) {
        const monthStr = month.toString().padStart(2, '0')
        const reference = `${monthStr}26`
        const dueDate = new Date(`2026-${monthStr}-01T00:00:00Z`)

        await prisma.invoices.updateMany({
            where: {
                supplier_id: supplier.id,
                reference: reference
            },
            data: {
                due_date: dueDate
            }
        })
        console.log(`✅ Facture ${reference} mise à jour avec due_date: ${dueDate.toISOString()}`)
    }

    console.log("Mise à jour terminée !")
}

main()
    .catch(e => {
        console.error("Erreur:", e)
        process.exit(1)
    })
    .finally(() => prisma.$disconnect())
