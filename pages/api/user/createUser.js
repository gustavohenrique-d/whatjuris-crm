import { prisma } from '@/lib/db/prisma';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Método não permitido' });
    }

    const { name, email, role, password, imageUrl } = req.body;

    console.log(name, email, role, password, imageUrl);

    try {
        // Verifica se o email já existe
        const existingUser = await prisma.user.findUnique({
            where: { email },
        });

        if (existingUser) {
            return res.status(400).json({ message: 'Esse email já existe' });
        }

        // Cria o novo usuário se o email não existir
        const newUser = await prisma.user.create({
            data: {
                name,
                email,
                role,
                password,
                image_url: imageUrl || null,
            },
        });

        res.status(201).json(newUser);
    } catch (error) {
        console.error('Erro ao criar usuário:', error);
        res.status(500).json({ message: 'Erro ao criar usuário' });
    }
}
