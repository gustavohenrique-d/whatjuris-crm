import { prisma } from '@/lib/db/prisma';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import multer from 'multer';
import { createRouter, expressWrapper } from 'next-connect';
import { storage } from '../../../shared/firebase/firebaseapi';

export const config = {
    api: {
        bodyParser: false, // Needed for multer to work
    },
};

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
});

const uploadImageToStorage = async (fileName, fileBuffer) => {
    const destinationWithHash = `images/${fileName}-${Date.now()}.webp`;
    const storageRef = ref(storage, destinationWithHash);

    await uploadBytes(storageRef, fileBuffer, {
        contentType: 'image/webp',
    });

    const publicUrlImage = await getDownloadURL(storageRef);
    return publicUrlImage;
};

const router = createRouter();

router.use(expressWrapper(upload.single('img')));

router.put(async (req, res) => {
    try {
        const { id } = req.query;

        const { title, description, price, quantity, categoryId } = req.body;

        if (
            !id ||
            !title ||
            !description ||
            !price ||
            !quantity ||
            !categoryId
        ) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        let imgUrl = null;

        if (req.file) {
            const fileName = req.file.originalname.split('.')[0];
            const imgBuffer = req.file.buffer;
            imgUrl = await uploadImageToStorage(fileName, imgBuffer);
        }

        const updatedProduct = await prisma.product.update({
            where: { id: parseInt(id, 10) },
            data: {
                title,
                description,
                price: parseFloat(price),
                quantity: parseInt(quantity, 10),
                img: imgUrl || undefined,
                categoryId: parseInt(categoryId, 10),
            },
            include: {
                category: {
                    select: {
                        name: true,
                        id: true,
                    },
                },
            },
        });

        res.status(200).json({ success: true, product: updatedProduct });
    } catch (error) {
        console.error('Error updating product:', error);
        res.status(500).json({ error: 'Error updating product' });
    }
});

export default router.handler({
    onError: (err, req, res) => {
        return res.status(500).json({ error: err.message });
    },
});
