import { prisma } from '@/lib/db/prisma';

export const getAllProducts = async () => {
    const products = await prisma.$queryRaw`
    SELECT 
      p.id AS \`productId\`, 
      p.title, 
      p.description, 
      p.price, 
      p.quantity, 
      p.status, 
      p.productKey, 
      p.type, 
      p.img, 
      p.categoryId,
      c.name AS \`categoryName\`
    FROM \`Product\` p
    LEFT JOIN \`Category\` c ON p.\`categoryId\` = c.id
    ORDER BY p.\`title\` ASC
  `;

    return products.map((product) => ({
        id: product.productId,
        title: product.title,
        description: product.description,
        price: product.price,
        quantity: product.quantity,
        status: product.status,
        productKey: product.productKey,
        type: product.type,
        img: product.img,
        category: {
            id: product.categoryId,
            name: product.categoryName,
        },
    }));
};
