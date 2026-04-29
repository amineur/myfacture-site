import { PrismaClient } from '@prisma/client'
import { autoReconcile } from '../lib/reconciliation'

const prisma = new PrismaClient({
    datasourceUrl: process.env.DATABASE_URL
})

async function main() {
    console.log('--- Démarrage de la Réconciliation de Force ---')
    
    // 1. Trouver l\'entreprise
    const company = await prisma.companies.findFirst()
    if (!company) {
        console.error('Erreur : Aucune entreprise trouvée.')
        return
    }
    
    console.log(`Entreprise trouvée : ${company.name} (${company.id})`)
    
    // 2. Lancer le scan global avec la nouvelle logique flexible
    console.log('Scan des factures en attente...')
    const result = await autoReconcile(company.id)
    
    console.log(`--- Scan Terminé ---`)
    console.log(`Liaisons créées : ${result.linkedCount}`)
    
    // 3. Vérifier spécifiquement la facture 2510 802
    const inv = await prisma.invoices.findFirst({
        where: { reference: { contains: '2510 802' } }
    })
    
    if (inv) {
        console.log(`Statut Final Facture 2510 802 : ${inv.status}`)
        if (inv.status === 'PAID') {
            console.log('✅ Succès : La facture est maintenant marquée comme PAYÉE.')
        } else {
            console.log('❌ Échec : La facture est toujours en attente (Vérifiez le montant du virement).')
        }
    } else {
        console.log('Facture 2510 802 introuvable.')
    }
    
    process.exit(0)
}

main().catch(e => {
    console.error(e)
    process.exit(1)
})
