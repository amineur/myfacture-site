import { PrismaClient } from '@prisma/client'
import { Pool } from 'pg'
import { PrismaPg } from '@prisma/adapter-pg'

const connectionString = process.env.DATABASE_URL || "postgresql://dashboard_user:DH5-q8-Zp-K9t-2026@core-postgres:5432/dashboard_media"
const pool = new Pool({ connectionString })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

async function main() {
    console.log('--- Insertion des factures mensuelles WinMedia (Année 2026) ---')

    // 1. D'abord chercher l'entreprise (company)
    const company = await prisma.companies.findFirst()
    if (!company) {
        throw new Error("Aucune entreprise (company) trouvée dans la base de données.")
    }

    // 2. Chercher le fournisseur WinMedia
    let supplier = await prisma.suppliers.findFirst({
        where: { name: { contains: 'WinMedia', mode: 'insensitive' } }
    })

    if (!supplier) {
        console.log("Fournisseur WinMedia non trouvé. Création en cours...")
        supplier = await prisma.suppliers.create({
            data: {
                company_id: company.id,
                name: 'WinMedia',
            }
        })
    }
    console.log(`Fournisseur sélectionné: ${supplier.name} (${supplier.id})`)

    // 3. Boucler sur les 12 mois de 2026
    for (let month = 1; month <= 12; month++) {
        // Formater le mois sur 2 chiffres (01, 02...)
        const monthStr = month.toString().padStart(2, '0')
        const reference = `${monthStr}26`
        // Date d'émission (virtuelle) : 1er du mois
        const issuedDate = new Date(`2026-${monthStr}-01T00:00:00Z`)

        // Vérifier si la facture existe déjà
        const existingInvoice = await prisma.invoices.findFirst({
            where: {
                supplier_id: supplier.id,
                reference: reference
            }
        })

        if (existingInvoice) {
            console.log(`Facture ${reference} déjà existante, ignorée.`)
            continue
        }

        // Insérer la facture
        const invoice = await prisma.invoices.create({
            data: {
                company_id: company.id,
                supplier_id: supplier.id,
                reference: reference,
                amount_ttc: 168.00,
                amount_ht: 140.00,
                issued_date: issuedDate,
                status: 'PENDING'
            }
        })
        console.log(`✅ Facture ${reference} ajoutée avec l'ID: ${invoice.id}`)
    }

    console.log("Opération terminée !")
}

main()
    .catch(e => {
        console.error("Erreur lors de l'exécution: ", e)
        process.exit(1)
    })
    .finally(() => prisma.$disconnect())
