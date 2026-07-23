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
    limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB limit
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

router.post(async (req, res) => {
    try {
        const file = req.file;
        const { title, description, price, quantity, categoryId } = req.body;

        if (!title || !description || !price || !quantity || !categoryId) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        let imgUrl = '';
        if (file) {
            const fileName = file.originalname.split('.')[0];
            const imgBuffer = file.buffer; // Buffer from multer
            imgUrl = await uploadImageToStorage(fileName, imgBuffer);
        }

        const product = await prisma.product.create({
            data: {
                title,
                description,
                price: parseFloat(price),
                quantity: parseInt(quantity, 10),
                img: imgUrl,
                categoryId: parseInt(categoryId, 10),
                status: 'IN_STOCK',
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

        res.status(201).json({ success: true, product });
    } catch (error) {
        console.error('Error creating product:', error);
        res.status(500).json({ error: 'Error creating product' });
    }
});

export default router.handler({
    onError: (err, req, res) => {
        return res.status(500).json({ error: err.message });
    },
});
