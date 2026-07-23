import { endOfDay, startOfDay, subDays } from 'date-fns';
import { prisma } from '@/lib/db/prisma';

export async function getSalesAmountToday() {
    const todayStart = startOfDay(new Date());
    const todayEnd = endOfDay(new Date());

    const yesterdayStart = startOfDay(subDays(new Date(), 1));
    const yesterdayEnd = endOfDay(subDays(new Date(), 1));

    const paymentsToday = await prisma.$queryRaw`
        SELECT SUM(\`amount\`) as \`totalSalesAmountToday\`
        FROM \`Payment\`
        WHERE \`createdAt\` >= ${todayStart}
        AND \`createdAt\` <= ${todayEnd}
        AND \`status\` = 'APPROVED';
    `;

    const paymentsYesterday = await prisma.$queryRaw`
        SELECT SUM(\`amount\`) as \`totalSalesAmountYesterday\`
        FROM \`Payment\`
        WHERE \`createdAt\` >= ${yesterdayStart}
        AND \`createdAt\` <= ${yesterdayEnd}
        AND \`status\` = 'APPROVED';
    `;

    const totalSalesAmountToday = paymentsToday[0]?.totalSalesAmountToday || 0;
    const totalSalesAmountYesterday =
        paymentsYesterday[0]?.totalSalesAmountYesterday || 0;

    return {
        totalSalesAmountToday,
        totalSalesAmountYesterday,
    };
}
