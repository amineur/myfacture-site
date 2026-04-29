import path from 'path'
import fs from 'fs'

// Manually parse .env.local to avoid injection/hoisting issues
const ENV_PATH = '/Users/aminebenabla/Documents/Dev app/dashboard-media/.env.local'
if (fs.existsSync(ENV_PATH)) {
    const envContent = fs.readFileSync(ENV_PATH, 'utf8')
    envContent.split('\n').forEach(line => {
        const [key, ...valueParts] = line.split('=')
        if (key && valueParts.length > 0) {
            let value = valueParts.join('=').trim()
            if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1)
            process.env[key.trim()] = value
        }
    })
}

console.log('🔗 DATABASE_URL length:', process.env.DATABASE_URL?.length || 0)

import { prisma } from '../utils/db'
import Papa from 'papaparse'
const CSV_FILE = '/Users/aminebenabla/Downloads/Banque 2024-2025-Grid view (3).csv'
const ACCOUNT_ID = 'be32a7d4-7826-4bb9-a51b-b6c72de5678e'
const COMPANY_ID = '32a0b3d6-c53a-4713-8a66-ab2af534a428'

async function main() {
  console.log('🚀 Starting import for Banque Populaire...')

  if (!fs.existsSync(CSV_FILE)) {
    console.error(`❌ File not found: ${CSV_FILE}`)
    process.exit(1)
  }

  const csvData = fs.readFileSync(CSV_FILE, 'utf8')
  
  const results = Papa.parse(csvData, {
    header: true,
    skipEmptyLines: true,
  })

  const rows = results.data as any[]
  console.log(`📊 Found ${rows.length} rows to process.`)

  let importedCount = 0
  let totalBalance = 0

  for (const row of rows) {
    try {
      // 1. Parsing Date (DD/MM/YYYY)
      const rawDate = (row.Date || row['﻿Date'] || '').trim()
      if (!rawDate) {
        console.warn(`⚠️ Row skipped: missing date in ${JSON.stringify(row)}`)
        continue
      }
      
      const parts = rawDate.split('/')
      if (parts.length !== 3) {
        console.warn(`⚠️ Invalid date format: ${rawDate}`)
        continue
      }
      const [day, month, year] = parts
      const date = new Date(`${year}-${month}-${day}T12:00:00Z`)

      if (isNaN(date.getTime())) {
        console.warn(`⚠️ Invalid date object for: ${rawDate}`)
        continue
      }

      // 2. Parsing Amount ("14 531,87€" or "-2 000,00")
      const rawAmount = (row.Amount || '').trim()
      let cleanAmount = rawAmount.replace(/[^-0-9,.]/g, '').replace(',', '.')
      const amount = parseFloat(cleanAmount)

      if (isNaN(amount)) {
        console.warn(`⚠️ Skipped row with invalid amount: ${rawAmount}`)
        continue
      }

      // 3. Create Unique Label and External ID
      const rawLabel = (row.Label || '').trim()
      const rawRef = (row.Reference || '').trim()
      const rawCat = (row.Category || '').trim()

      // If label is "Virement", use the more specific Reference instead
      const displayLabel = (rawLabel.toLowerCase().includes('virement') || !rawLabel) && rawRef 
        ? rawRef 
        : rawLabel

      const external_id = `bp-manual-${date.getTime()}-${displayLabel}-${amount}`.replace(/\s+/g, '_')

      // 4. Upsert Transaction
      await prisma.bank_transactions.upsert({
        where: { external_id },
        update: {
          amount,
          label: displayLabel,
          date,
          raw_data: {
            reference: rawRef,
            cashflow_subcategory: { name: rawCat }
          }
        },
        create: {
          external_id,
          account_id: ACCOUNT_ID,
          company_id: COMPANY_ID,
          date,
          amount,
          label: displayLabel,
          side: amount >= 0 ? 'CREDIT' : 'DEBIT',
          status: 'RAW',
          raw_data: { 
            reference: rawRef, 
            cashflow_subcategory: { name: rawCat } 
          }
        },
      })

      totalBalance += amount
      importedCount++
    } catch (err: any) {
      console.error(`❌ Error processing row ${row.Label} at ${row.Date}: ${err.message}`)
    }
  }

  // 5. Update Account Balance and Status
  const dbAccount = await prisma.bank_accounts.findUnique({ where: { id: ACCOUNT_ID } })
  const metadata = (dbAccount?.metadata as any) || {}

  await prisma.bank_accounts.update({
    where: { id: ACCOUNT_ID },
    data: {
      balance: Math.round(totalBalance * 100) / 100,
      last_sync_at: new Date(),
      metadata: {
        ...metadata,
        is_closed: true, // Mark as closed
      },
    },
  })

  console.log(`✅ Successfully imported ${importedCount} transactions.`)
  console.log(`💰 New balance for Banque Populaire: ${Math.round(totalBalance * 100) / 100} € (Status: CLOSED)`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
