import { prisma } from '@/lib/db/prisma';
import { getServerSession } from 'next-auth';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method not allowed' });
    }

    const session = await getServerSession(req, res);

    if (!session) {
        return res.status(401).json({ message: 'Unauthorized' });
    }

    const { name, description } = req.body;

    console.log(name, description);

    try {
        const newCategory = await prisma.category.create({
            data: {
                name,
                description,
            },
        });
        res.status(201).json(newCategory);
    } catch (error) {
        console.error('Error creating coupon:', error);
        res.status(500).json({ message: 'Failed to create coupon' });
    }
}
