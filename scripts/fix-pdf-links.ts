import { PrismaClient } from '@prisma/client'
import fs from 'fs'
import path from 'path'

const prisma = new PrismaClient()
const UPLOADS_DIR = '/app/public/uploads'

async function fixPdfLinks() {
    console.log('Starting PDF link fix...')
    const invoices = await prisma.invoices.findMany({
        where: { pdf_url: { not: null } }
    })

    console.log(`Checking ${invoices.length} invoices...`)

    for (const invoice of invoices) {
        const relativePath = invoice.pdf_url.startsWith('/') ? invoice.pdf_url.substring(1) : invoice.pdf_url
        const fullPath = path.join(UPLOADS_DIR, relativePath.replace('uploads/', ''))
        
        if (!fs.existsSync(fullPath)) {
            console.log(`[Missing] ${invoice.reference}: ${fullPath}`)
            
            // Try to find a match by reference
            const filename = path.basename(fullPath)
            const parts = filename.split('_')
            if (parts.length >= 2 || invoice.reference) {
                const ref = invoice.reference || parts[0]
                const dir = path.dirname(fullPath)
                
                if (fs.existsSync(dir)) {
                    const files = fs.readdirSync(dir)
                    const match = files.find(f => f.startsWith(ref + '_') || f === ref + '.pdf')
                    
                    if (match) {
                        const newRelativePath = path.join(path.dirname(invoice.pdf_url), match)
                        console.log(`   -> Found match: ${match}. Updating DB...`)
                        await prisma.invoices.update({
                            where: { id: invoice.id },
                            data: { pdf_url: newRelativePath }
                        })
                    } else {
                        console.log(`   !! No match found for ref ${ref}`)
                    }
                }
            }
        }
    }
}

fixPdfLinks()
    .catch(console.error)
    .finally(() => prisma.$disconnect())
