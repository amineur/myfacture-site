/**
 * Script to fix VT Consult invoice issued_dates based on actual PDF content.
 * Run with: npx tsx scripts/fix-vt-consult-dates.ts
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// Mapping: reference -> correct issued_date (from PDF)
const corrections: Record<string, string> = {
  '2301 028': '2023-01-31',
  '2302 122': '2023-02-28',
  '2303 218': '2023-03-31',
  '2304 316': '2023-04-29',
  '2305 414': '2023-05-31',
  '2306 508': '2023-06-30',
  '2309 784': '2023-09-30',
  '2310 877': '2023-10-31',
  '2311 974': '2023-11-30',
  '2312 1068': '2023-12-30',
  '2401 034': '2024-01-31',
  '2402 129': '2024-02-29',
  '2403 222': '2024-03-30',
  '2404 318': '2024-04-30',
  '2405 409': '2024-05-31',
  '2406 508': '2024-06-29',
  '2409 779': '2024-09-30',
  '2410 868': '2024-10-31',
  '2411 956': '2024-11-30',
  '2412 1041': '2024-12-31',
  '2501 032': '2025-01-31',
  '2502 119': '2025-02-28',
  '2503 210': '2025-03-31',
  '2504 294': '2025-04-30',
  '2505 380': '2025-05-31',
  '2506 468': '2025-06-30',
  '2509 723': '2025-09-30',
  '2510 802': '2025-10-31',
  '2511 880': '2025-11-29',
  '2512 955': '2025-12-31',
  '2601 023': '2026-01-30',
  '2602 101': '2026-02-27',
  '2603 181': '2026-03-31',
}

async function main() {
  // Find the VT Consult supplier
  const supplier = await prisma.suppliers.findFirst({
    where: { name: { contains: 'VT Consult', mode: 'insensitive' } },
  })

  if (!supplier) {
    console.error('❌ Supplier VT Consult not found')
    process.exit(1)
  }

  console.log(`✅ Found supplier: ${supplier.name} (${supplier.id})`)

  // Get all invoices for this supplier
  const invoices = await prisma.invoices.findMany({
    where: { supplier_id: supplier.id },
    orderBy: { issued_date: 'asc' },
  })

  console.log(`📄 Found ${invoices.length} invoices\n`)

  let updated = 0
  let skipped = 0
  let notFound = 0

  for (const inv of invoices) {
    const ref = inv.reference?.trim()
    if (!ref || !corrections[ref]) {
      console.log(`⚠️  No correction for ref="${ref}" (id=${inv.id})`)
      notFound++
      continue
    }

    const correctDate = new Date(corrections[ref] + 'T00:00:00.000Z')
    const currentDate = inv.issued_date

    if (currentDate && currentDate.getTime() === correctDate.getTime()) {
      console.log(`⏭️  ${ref}: already correct (${corrections[ref]})`)
      skipped++
      continue
    }

    // Also update due_date = issued_date + 30 days
    const correctDueDate = new Date(correctDate)
    correctDueDate.setDate(correctDueDate.getDate() + 30)

    await prisma.invoices.update({
      where: { id: inv.id },
      data: {
        issued_date: correctDate,
        due_date: correctDueDate,
      },
    })

    console.log(`✅ ${ref}: ${currentDate?.toISOString().split('T')[0]} → ${corrections[ref]}`)
    updated++
  }

  console.log(`\n--- Summary ---`)
  console.log(`Updated: ${updated}`)
  console.log(`Already correct: ${skipped}`)
  console.log(`No correction found: ${notFound}`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
