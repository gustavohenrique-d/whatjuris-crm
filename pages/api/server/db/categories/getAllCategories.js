import { prisma } from '@/lib/db/prisma';

export const getAllCategories = async () => {
    const categories = await prisma.$queryRaw`
        SELECT * FROM Category;
    `;

    return categories.map((category) => ({
        id: category.id,
        name: category.name,
        description: category.description,
    }));
};
