import { endOfMonth, startOfMonth } from 'date-fns';
import { prisma } from '@/lib/db/prisma';

export async function getMonthlySalesData() {
    const currentYear = new Date().getFullYear();
    const monthlyData = [];

    for (let month = 0; month < 12; month++) {
        const monthStart = startOfMonth(new Date(currentYear, month));
        const monthEnd = endOfMonth(new Date(currentYear, month));

        const payments = await prisma.$queryRaw`
            SELECT COUNT(*) as \`totalOrders\`, SUM(\`amount\`) as \`totalRevenue\`
            FROM \`Payment\`
            WHERE \`createdAt\` >= ${monthStart}
            AND \`createdAt\` <= ${monthEnd}
            AND \`status\` = 'APPROVED';
        `;

        const totalOrders = payments[0]?.totalOrders || 0;
        const totalRevenue = payments[0]?.totalRevenue || 0;

        monthlyData.push({
            month: monthStart.toLocaleString('default', { month: 'long' }),
            totalOrders: Number(totalOrders),
            totalRevenue: Number(totalRevenue),
        });
    }

    return monthlyData;
}
