import { prisma } from '@/lib/db/prisma';

export async function getTotalApprovedPayments() {
    const totalApprovedPayments = await prisma.$queryRaw`
        SELECT SUM(\`amount\`) as \`totalApprovedPayments\`
        FROM \`Payment\`
        WHERE \`status\` = 'APPROVED';
    `;

    const totalPayments = Number(
        totalApprovedPayments[0]?.totalApprovedPayments || 0
    );

    return totalPayments;
}
