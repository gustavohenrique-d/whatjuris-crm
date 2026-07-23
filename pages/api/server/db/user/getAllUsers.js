import { prisma } from '@/lib/db/prisma';

export const getAllUsers = async () => {
    const users = await prisma.$queryRaw`
        SELECT * FROM User;
    `;

    return users.map((user) => ({
        id: user.id,
        name: user.name,
        email: user.email,
        imageUrl: user.image_url,
        role: user.role,
        createdAt: user.createdAt ? user.createdAt.toISOString() : null,
        updatedAt: user.updatedAt ? user.updatedAt.toISOString() : null,
    }));
};
