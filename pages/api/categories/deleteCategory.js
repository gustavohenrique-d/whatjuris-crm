import { prisma } from '@/lib/db/prisma';

export default async function handler(req, res) {
    if (req.method === 'DELETE') {
        try {
            const { id } = req.query;

            if (!id) {
                return res
                    .status(400)
                    .json({ error: 'ID da categoria é obrigatória' });
            }

            const deletedCategory = await prisma.category.delete({
                where: { id: parseInt(id) },
            });

            return res.status(200).json({
                message: 'Categoria deletada com sucesso',
                deletedCategory,
            });
        } catch (error) {
            console.error('Erro ao deletar Categoria:', error);
            res.status(500).json({ error: 'Erro ao deletar a categoria' });
        }
    } else {
        res.setHeader('Allow', ['DELETE']);
        res.status(405).end(`Método ${req.method} não permitido`);
    }
}
