import { getAllCategories } from '@/pages/api/server/db/products/getAllCategories';
import { getAllProducts } from '@/pages/api/server/db/products/getAllProducts';
import { getServerSession } from 'next-auth';
import { useEffect, useState } from 'react';
import {
    Button,
    Card,
    Col,
    Form,
    InputGroup,
    Modal,
    OverlayTrigger,
    Pagination,
    Row,
    Spinner,
    Tooltip,
} from 'react-bootstrap';
import { useDispatch, useSelector } from 'react-redux';
import { toast } from 'react-toastify';
import Pageheader from '../../../shared/layout-components/pageheader/pageheader';
import Seo from '../../../shared/layout-components/seo/seo';
import {
    addToCart,
    addToWishlist,
    setSelectedItem,
} from '../../../shared/redux/action';
import styles from './styles.module.scss';

const DESCRIPTION_LIMIT = 150;
const ITEMS_PER_PAGE = 8;

const formatCurrency = (value) => {
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    }).format(value);
};

const formatCurrencyInput = (value) => {
    value = value.replace(/\D/g, '');
    const options = { minimumFractionDigits: 2, maximumFractionDigits: 2 };
    const result = new Intl.NumberFormat('pt-BR', options).format(
        parseFloat(value) / 100
    );
    return `R$ ${result}`;
};

const ProductCard = ({
    item,
    handleItemClick,
    handleAddToWishlist,
    handleAddToCart,
    handleEditProduct,
    handleDeleteProduct,
}) => {
    const [isExpanded, setIsExpanded] = useState(false);

    const truncateDescription = (text) => {
        if (isExpanded || text.length <= DESCRIPTION_LIMIT) {
            return text;
        }
        return text.slice(0, DESCRIPTION_LIMIT) + '...';
    };

    return (
        <Col sm={6} xl={4} xxl={3} lg={6} md={6}>
            <Card>
                <Card.Body className="h-100 product-grid6">
                    <div className="pro-img-box product-image">
                        <div>
                            <div onClick={() => handleItemClick(item)}>
                                <img
                                    className={styles.img}
                                    src={item.img}
                                    alt={item.title}
                                />
                            </div>
                        </div>
                        <ul className="icons">
                            <li style={{ cursor: 'pointer' }}>
                                <OverlayTrigger
                                    placement="top"
                                    overlay={<Tooltip>Editar Produto</Tooltip>}
                                >
                                    <div
                                        className="info-gradient"
                                        onClick={() => handleEditProduct(item)}
                                    >
                                        <i className="fas fa-edit"></i>
                                    </div>
                                </OverlayTrigger>
                            </li>
                            <li
                                style={{ cursor: 'pointer', marginLeft: '8px' }}
                            >
                                <OverlayTrigger
                                    placement="top"
                                    overlay={<Tooltip>Deletar produto</Tooltip>}
                                >
                                    <div
                                        className="secondary-gradient me-2"
                                        onClick={() =>
                                            handleDeleteProduct(item)
                                        }
                                    >
                                        <i className="fa fa-trash"></i>
                                    </div>
                                </OverlayTrigger>
                            </li>
                        </ul>
                    </div>
                    <div className="text-center pt-2">
                        <h3 className="h6 mb-2 mt-4 fw-bold text-uppercase">
                            {item.title}
                        </h3>
                        <span className="fs-15 ms-auto">
                            <i className="ion ion-md-star text-warning"></i>
                            <i className="ion ion-md-star text-warning"></i>
                            <i className="ion ion-md-star text-warning"></i>
                            <i className="ion ion-md-star text-warning"></i>
                            <i className="ion ion-md-star text-warning"></i>
                        </span>
                        <h4 className="h5 mb-0 mt-1 text-center fw-bold fs-22">
                            {formatCurrency(item.price)}
                            <del className="text-secondary font-weight-normal fs-13 d-inline-block ms-1 prev-price"></del>
                        </h4>
                        <p style={{ marginTop: '10px', minHeight: '70px' }}>
                            {truncateDescription(item.description)}
                            {item.description.length > DESCRIPTION_LIMIT && (
                                <span
                                    className="text-primary cursor-pointer"
                                    onClick={() => setIsExpanded(!isExpanded)}
                                    style={{ cursor: 'pointer' }}
                                >
                                    {isExpanded ? ' Ver menos' : ' Ver mais...'}
                                </span>
                            )}
                        </p>
                        <p>Categoria: {item.category?.name}</p>
                    </div>
                </Card.Body>
            </Card>
        </Col>
    );
};

const Shop = ({ initialProducts, categories }) => {
    const dispatch = useDispatch();
    const cart = useSelector((state) => state.cart);
    const productsInStore = useSelector((state) => state.products);

    const [products, setProducts] = useState(initialProducts);
    const [searchTerm, setSearchTerm] = useState('');
    const [searchResults, setSearchResults] = useState(products);
    const [currentPage, setCurrentPage] = useState(1);
    const [showModal, setShowModal] = useState(false);
    const [loading, setLoading] = useState(false);
    const [newProduct, setNewProduct] = useState({
        title: '',
        description: '',
        price: '',
        img: '',
        category: { name: '', id: '' },
        quantity: 0,
    });

    const [imagePreview, setImagePreview] = useState(null);
    const [isEditing, setIsEditing] = useState(false);
    const [productToEdit, setProductToEdit] = useState(null);

    const resetForm = () => {
        setNewProduct({
            title: '',
            description: '',
            price: '',
            img: '',
            category: '',
            quantity: 0,
        });
        setImagePreview(null);
        setIsEditing(false);
        setProductToEdit(null);
    };

    const validateFields = () => {
        const { title, description, price, img, category } = newProduct;
        if (!title) return 'Nome do Produto';
        if (!description) return 'Descrição';
        if (!price) return 'Preço';
        if (!img) return 'Imagem';
        if (!category) return 'Categoria';
        return null;
    };

    const handleDeleteProduct = async (product) => {
        try {
            const response = await fetch(
                `/api/product/deleteProduct?id=${product.id}`,
                { method: 'DELETE' }
            );

            const responseData = await response.json();

            if (response.ok) {
                setProducts((prevProducts) =>
                    prevProducts.filter((p) => p.id !== product.id)
                );
                toast.success(
                    responseData.message || 'Produto deletado com sucesso!'
                );
            } else {
                toast.error(responseData.error || 'Falha ao deletar o produto');
            }
        } catch (error) {
            toast.error('Erro ao deletar o produto');
        }
    };

    const handleEditProduct = (product) => {
        setProductToEdit(product);
        setNewProduct({
            title: product.title,
            description: product.description,
            price: formatCurrency(product.price),
            img: product.img,
            category: product.category,
            quantity: product.quantity,
        });
        setIsEditing(true);
        setShowModal(true);
    };

    const handleFileChange = (e) => {
        const file = e.target.files[0];
        setNewProduct({ ...newProduct, img: file });

        const reader = new FileReader();
        reader.onloadend = () => {
            setImagePreview(reader.result);
        };
        if (file) {
            reader.readAsDataURL(file);
        }
    };

    const handleSaveProduct = async () => {
        const missingField = validateFields();
        if (missingField) {
            toast.error(`Campo obrigatório: ${missingField}`);
            return;
        }

        setLoading(true);

        if (isEditing && productToEdit) {
            // Atualizar produto existente
            try {
                const formData = new FormData();
                formData.append('title', newProduct.title);
                formData.append('description', newProduct.description);
                formData.append(
                    'price',
                    parseFloat(
                        newProduct.price.replace('R$', '').replace(',', '.')
                    )
                );
                formData.append('quantity', newProduct.quantity);
                formData.append('categoryId', newProduct.category.id);

                if (typeof newProduct.img !== 'string') {
                    formData.append('img', newProduct.img);
                }

                const response = await fetch(
                    `/api/product/updateProduct?id=${productToEdit.id}`,
                    {
                        method: 'PUT',
                        body: formData,
                    }
                );

                if (response.ok) {
                    const data = await response.json();

                    setProducts((prevProducts) =>
                        prevProducts.map((p) =>
                            p.id === productToEdit.id ? data.product : p
                        )
                    );
                    toast.success('Produto atualizado com sucesso!');
                } else {
                    toast.error('Falha ao atualizar o produto');
                }
            } catch (error) {
                toast.error('Erro na requisição');
            } finally {
                setLoading(false);
                handleCloseModal();
            }
        } else {
            const formData = new FormData();
            formData.append('title', newProduct.title);
            formData.append('description', newProduct.description);
            formData.append(
                'price',
                parseFloat(newProduct.price.replace('R$', '').replace(',', '.'))
            );
            formData.append('img', newProduct.img);
            formData.append('quantity', newProduct.quantity);
            formData.append('categoryId', newProduct.category.id);

            try {
                const response = await fetch('/api/product/createProduct', {
                    method: 'POST',
                    body: formData,
                });

                if (response.ok) {
                    const data = await response.json();
                    setProducts((prevProducts) => [
                        ...prevProducts,
                        data.product,
                    ]);
                    toast.success('Produto criado com sucesso!');
                } else {
                    toast.error('Falha na criação do produto');
                }
            } catch (error) {
                toast.error('Erro na requisição');
            } finally {
                setLoading(false);
                handleCloseModal();
            }
        }
    };

    const handleItemClick = (item) => {
        dispatch(setSelectedItem(item));
    };
    const handleAddToWishlist = (item) => {
        dispatch(addToWishlist(item));
    };

    const allIds = [
        ...cart.map((item) => item.id),
        ...productsInStore.map((item) => item.id),
    ];
    const nextId = allIds.length ? Math.max(...allIds) + 1 : 1;

    const handleAddToCart = (item) => {
        dispatch(addToCart({ ...item, id: nextId }));
    };

    useEffect(() => {
        const filteredProducts = products.filter((product) =>
            product.title.toLowerCase().includes(searchTerm.toLowerCase())
        );
        setSearchResults(filteredProducts);
        setCurrentPage(1);
    }, [searchTerm, products]);

    const indexOfLastItem = currentPage * ITEMS_PER_PAGE;
    const indexOfFirstItem = indexOfLastItem - ITEMS_PER_PAGE;
    const currentItems = searchResults.slice(indexOfFirstItem, indexOfLastItem);

    const handlePageChange = (pageNumber) => {
        setCurrentPage(pageNumber);
    };

    const totalPages = Math.ceil(searchResults.length / ITEMS_PER_PAGE);

    const handleShowModal = () => setShowModal(true);
    const handleCloseModal = () => {
        resetForm();
        setShowModal(false);
    };

    const handleCreateProduct = async () => {
        const missingField = validateFields();
        if (missingField) {
            toast.error(`Campo obrigatório: ${missingField}`);
            return;
        }

        setLoading(true);

        const formData = new FormData();
        formData.append('title', newProduct.title);
        formData.append('description', newProduct.description);
        formData.append(
            'price',
            parseFloat(newProduct.price.replace('R$', '').replace(',', '.'))
        );
        formData.append('img', newProduct.img);
        formData.append('quantity', newProduct.quantity);
        formData.append('categoryId', newProduct.category);

        try {
            const response = await fetch('/api/product/createProduct', {
                method: 'POST',
                body: formData,
            });

            if (response.ok) {
                const data = await response.json();
                setProducts((prevProducts) => [...prevProducts, data.product]);
                handleCloseModal();
                toast.success('Produto criado com Sucesso! 🚀');
            } else {
                toast.error('Falha na criação do Produto! Tente novamente ❌');
            }
        } catch (error) {
            toast.error('Erro na requisição');
        } finally {
            setLoading(false);
        }
    };

    const handlePriceChange = (e) => {
        const formattedPrice = formatCurrencyInput(e.target.value);
        setNewProduct({
            ...newProduct,
            price: formattedPrice,
        });
    };

    return (
        <div>
            <Seo title={'Produtos'} />
            <Pageheader title="Produtos" heading="Produtos" active="Products" />

            <Row className="row-sm">
                <Col xl={12} lg={12} md={12} style={{ width: '100%' }}>
                    <Card.Body className="p-2">
                        <InputGroup className={styles.inputGroup}>
                            <div className={styles.formGroup}>
                                <Form.Control
                                    type="text"
                                    placeholder="Pesquisar ..."
                                    value={searchTerm}
                                    onChange={(e) =>
                                        setSearchTerm(e.target.value)
                                    }
                                />
                                <InputGroup.Text className="btn btn-primary">
                                    Pesquisar
                                </InputGroup.Text>
                            </div>
                            <div>
                                <Button
                                    variant=""
                                    type="button"
                                    className="btn btn-primary ms-2"
                                    onClick={handleShowModal}
                                >
                                    <i className="fe fe-plus me-1"></i>{' '}
                                    {isEditing
                                        ? 'Editar Produto'
                                        : 'Criar Produto'}
                                </Button>
                            </div>
                        </InputGroup>
                    </Card.Body>

                    <Row className="row-sm">
                        {currentItems.length === 0 ? (
                            <tr>
                                <td colSpan="6" className="text-center">
                                    Sem produtos
                                </td>
                            </tr>
                        ) : (
                            currentItems.map((item, index) => (
                                <ProductCard
                                    key={index}
                                    item={item}
                                    handleItemClick={handleItemClick}
                                    handleDeleteProduct={handleDeleteProduct}
                                    handleAddToCart={handleAddToCart}
                                    handleEditProduct={handleEditProduct}
                                />
                            ))
                        )}

                        <Pagination className="pagination product-pagination justify-content-end list-unstyled">
                            <Pagination.Item
                                onClick={() =>
                                    handlePageChange(currentPage - 1)
                                }
                                disabled={currentPage === 1}
                            >
                                Anterior
                            </Pagination.Item>
                            {[...Array(totalPages)].map((_, pageIndex) => (
                                <Pagination.Item
                                    key={pageIndex + 1}
                                    active={currentPage === pageIndex + 1}
                                    onClick={() =>
                                        handlePageChange(pageIndex + 1)
                                    }
                                >
                                    {pageIndex + 1}
                                </Pagination.Item>
                            ))}
                            <Pagination.Item
                                onClick={() =>
                                    handlePageChange(currentPage + 1)
                                }
                                disabled={currentPage === totalPages}
                            >
                                Próximo
                            </Pagination.Item>
                        </Pagination>
                    </Row>
                </Col>
            </Row>

            <Modal show={showModal} onHide={handleCloseModal} centered>
                <Modal.Header closeButton>
                    <Modal.Title>
                        {isEditing ? 'Editar Produto' : 'Criar Novo Produto'}
                    </Modal.Title>
                </Modal.Header>
                <Modal.Body style={{ maxHeight: '70vh', overflowY: 'auto' }}>
                    <Form>
                        <Form.Group controlId="productTitle">
                            <Form.Label>Nome do produto</Form.Label>
                            <Form.Control
                                type="text"
                                placeholder="Insira o título do produto"
                                value={newProduct.title}
                                onChange={(e) =>
                                    setNewProduct({
                                        ...newProduct,
                                        title: e.target.value,
                                    })
                                }
                            />
                        </Form.Group>

                        <Form.Group
                            controlId="productDescription"
                            style={{ marginTop: '10px' }}
                        >
                            <Form.Label>Descrição</Form.Label>
                            <Form.Control
                                as="textarea"
                                rows={3}
                                placeholder="Insira a descrição do produto"
                                value={newProduct.description}
                                onChange={(e) =>
                                    setNewProduct({
                                        ...newProduct,
                                        description: e.target.value,
                                    })
                                }
                            />
                        </Form.Group>

                        <Form.Group
                            controlId="productPrice"
                            style={{ marginTop: '10px' }}
                        >
                            <Form.Label>Preço</Form.Label>
                            <Form.Control
                                type="text"
                                placeholder="R$0,00"
                                value={newProduct.price}
                                onChange={handlePriceChange}
                            />
                        </Form.Group>
                        <Form.Group
                            controlId="productQuantity"
                            style={{ marginTop: '10px' }}
                        >
                            <Form.Label>Estoque</Form.Label>
                            <Form.Control
                                type="number"
                                placeholder="Quantidade em estoque"
                                value={newProduct.quantity}
                                onChange={(e) =>
                                    setNewProduct({
                                        ...newProduct,
                                        quantity: e.target.value,
                                    })
                                }
                            />
                        </Form.Group>

                        <Form.Group
                            controlId="productImage"
                            style={{ marginTop: '10px' }}
                            onChange={handleFileChange}
                        >
                            <Form.Label>Imagem</Form.Label>
                            <Form.Control
                                type="file"
                                accept="image/*"
                                onChange={handleFileChange}
                            />
                            {isEditing &&
                                (typeof newProduct.img === 'string' &&
                                !imagePreview ? (
                                    <img
                                        src={newProduct.img}
                                        alt="Imagem atual do produto"
                                        style={{
                                            width: '100%',
                                            marginTop: '10px',
                                            height: '300px',
                                            objectFit: 'cover',
                                        }}
                                    />
                                ) : (
                                    imagePreview && (
                                        <img
                                            src={imagePreview}
                                            alt="Prévia da nova imagem"
                                            style={{
                                                width: '100%',
                                                marginTop: '10px',
                                                height: '300px',
                                                objectFit: 'cover',
                                            }}
                                        />
                                    )
                                ))}
                        </Form.Group>
                        <Form.Group
                            controlId="productCategory"
                            style={{ marginTop: '10px' }}
                        >
                            <Form.Label>Categoria</Form.Label>
                            <Form.Select
                                value={newProduct.category.id}
                                onChange={(e) => {
                                    const selectedCategory = categories.find(
                                        (cat) =>
                                            cat.id === parseInt(e.target.value)
                                    );
                                    setNewProduct({
                                        ...newProduct,
                                        category: selectedCategory,
                                    });
                                }}
                            >
                                <option value="">
                                    {!isEditing
                                        ? 'Selecione uma categoria'
                                        : newProduct.category.name}
                                </option>
                                {categories.map((cat) => (
                                    <option key={cat.id} value={cat.id}>
                                        {cat.name}
                                    </option>
                                ))}
                            </Form.Select>
                        </Form.Group>
                    </Form>
                </Modal.Body>
                <Modal.Footer>
                    <Button
                        variant="primary"
                        onClick={handleSaveProduct}
                        disabled={loading}
                    >
                        {loading ? (
                            <Spinner as="span" animation="border" size="sm" />
                        ) : isEditing ? (
                            'Salvar Alterações'
                        ) : (
                            'Criar Produto'
                        )}
                    </Button>
                </Modal.Footer>
            </Modal>
        </div>
    );
};

export const getServerSideProps = async (context) => {
    const session = await getServerSession(context.req, context.res);

    if (!session) {
        return {
            redirect: {
                destination: '/',
                permanent: false,
            },
        };
    }

    const products = await getAllProducts();
    const categories = await getAllCategories();

    return {
        props: {
            initialProducts: products,
            categories,
        },
    };
};

Shop.layout = 'Contentlayout';
export default Shop;
