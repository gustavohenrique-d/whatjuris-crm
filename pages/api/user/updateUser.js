import { prisma } from '@/lib/db/prisma';

export default async function handler(req, res) {
    if (req.method !== 'PUT') {
        return res.status(405).json({ message: 'Método não permitido' });
    }

    const { id, name, email, role, imageUrl } = req.body;

    console.log(id, name, email, role, imageUrl);

    // return null;

    try {
        const existingUser = await prisma.user.findUnique({
            where: { id },
        });

        if (!existingUser) {
            return res.status(404).json({ message: 'Usuário não encontrado' });
        }

        const updatedUser = await prisma.user.update({
            where: { id },
            data: {
                name,
                email,
                role,
                image_url: imageUrl || existingUser.image_url,
            },
        });

        res.status(200).json(updatedUser);
    } catch (error) {
        console.error('Erro ao editar usuário:', error);
        res.status(500).json({ message: 'Erro ao editar usuário' });
    }
}
