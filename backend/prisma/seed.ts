import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// TODO: TBD — confirm value before launch (A-3.2)
// These are placeholder Ice Breaker prompts. Replace with final approved list before Sept 17 launch.
const PLACEHOLDER_PROMPTS = [
  "What's your go-to order at a coffee shop?",
  "The best trip you've ever taken?",
  "A skill you're secretly proud of?",
  "What does your ideal Sunday look like?",
  "A show you could rewatch forever?",
  "What's something you're genuinely looking forward to?",
  "Night in or night out?",
  "The last thing that made you laugh out loud?",
  "One thing on your bucket list?",
  "What does your perfect day on campus look like?",
]

async function main(): Promise<void> {
  const existing = await prisma.prompt.count()
  if (existing > 0) {
    console.log(`Prompts already seeded (${existing} found). Skipping.`)
    return
  }

  const result = await prisma.prompt.createMany({
    data: PLACEHOLDER_PROMPTS.map((text) => ({
      prompt_text: text,
      is_active: true,
    })),
  })

  console.log(`Seeded ${result.count} Ice Breaker prompts.`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
