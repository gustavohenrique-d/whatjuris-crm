import { prisma } from '@/lib/db/prisma';
import { getServerSession } from 'next-auth';

export default async function handler(req, res) {
    if (req.method !== 'PUT') {
        return res.status(405).json({ message: 'Method not allowed' });
    }

    const session = await getServerSession(req, res);

    if (!session) {
        return res.status(401).json({ message: 'Unauthorized' });
    }

    const { id } = req.query;

    const { name, description } = req.body;

    try {
        const updatedCategory = await prisma.category.update({
            where: { id: parseInt(id) },
            data: {
                name,
                description,
            },
        });
        res.status(200).json(updatedCategory);
    } catch (error) {
        console.error('Error updating coupon:', error);
        res.status(500).json({ message: 'Failed to update coupon' });
    }
}
