import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../lib/prisma';

// Ishlatish:
//   npm run create-admin -- admin@example.com StrongPassword123
// yoki ADMIN_EMAIL / ADMIN_PASSWORD environment variablelari orqali.
async function main() {
  const email = process.argv[2] || process.env.ADMIN_EMAIL;
  const password = process.argv[3] || process.env.ADMIN_PASSWORD;

  const schema = z.object({
    email: z.string().email('Email notogri'),
    password: z.string().min(8, 'Parol kamida 8 belgi bolishi kerak'),
  });

  const parsed = schema.safeParse({ email, password });
  if (!parsed.success) {
    console.error('Xato:');
    for (const issue of parsed.error.issues) {
      console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
    }
    console.error('\nIshlatish: npm run create-admin -- <email> <parol>');
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  const admin = await prisma.admin.upsert({
    where: { email: parsed.data.email.toLowerCase() },
    create: { email: parsed.data.email.toLowerCase(), passwordHash },
    update: { passwordHash },
  });

  console.log(`Admin tayyor: ${admin.email} (id: ${admin.id})`);
}

main()
  .catch((err) => {
    console.error('Admin yaratishda xato:', err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
